// =============================================================================
// ai/sanitizer.rs - 数据脱敏模块
// =============================================================================
// 职责：在将用户数据发送给云端 AI 模型前，进行脱敏处理
//
// 脱敏目标：
//   1. 门禁 UID（NFC/RFID 卡片唯一标识）
//   2. NFC 密钥（MIFARE Classic 扇区密钥 A/B）
//   3. WiFi 密码（包含 SSID/密码的配置）
//   4. 地理坐标（经纬度，防止位置泄露）
//   5. API Key / Token
//   6. 手机号 / 邮箱（可选）
//
// 脱敏策略：
//   - 检测到敏感数据后，用 [REDACTED] 占位符替换
//   - 保留数据结构（如长度、格式），便于 AI 理解上下文
//   - 记录脱敏日志，便于调试
// =============================================================================

use crate::ai::ChatMessage;
use regex::Regex;
use std::sync::OnceLock;

// -------------------- 正则表达式（懒加载） --------------------

/// 门禁 UID（十六进制，常见 4/7/10 字节）
/// 匹配：UID: 04A3B2C1 / Card UID: 1A2B3C4D
static RE_UID: OnceLock<Regex> = OnceLock::new();

/// MIFARE 密钥（6 字节十六进制）
/// 匹配：Key A: FFFFFFFFFFFF / KeyB: 000102030405
static RE_NFC_KEY: OnceLock<Regex> = OnceLock::new();

/// WiFi 密码（WPA/WEP 配置）
/// 匹配：password=xxx / PSK="xxx" / WPA2-Personal: xxx
static RE_WIFI_PASSWORD: OnceLock<Regex> = OnceLock::new();

/// 地理坐标（经纬度）
/// 匹配：N 39.9042, E 116.4074 / lat=39.9042 lng=116.4074
static RE_COORDINATES: OnceLock<Regex> = OnceLock::new();

/// API Key / Token（常见格式）
/// 匹配：sk-xxxx / api_key=xxxx / Bearer xxxx
static RE_API_KEY: OnceLock<Regex> = OnceLock::new();

/// 手机号（中国大陆 11 位）
static RE_PHONE: OnceLock<Regex> = OnceLock::new();

/// 邮箱
static RE_EMAIL: OnceLock<Regex> = OnceLock::new();

/// 获取正则（懒加载，避免重复编译）
fn uid_regex() -> &'static Regex {
    RE_UID.get_or_init(|| {
        // UID 前缀 + 4~10 字节十六进制
        Regex::new(r"(?i)(uid|card\s*id|nfc\s*id)\s*[:=]?\s*([0-9A-Fa-f]{8,20})").unwrap()
    })
}

fn nfc_key_regex() -> &'static Regex {
    RE_NFC_KEY.get_or_init(|| {
        Regex::new(r"(?i)(key\s*[ab]\s*[:=]?\s*)([0-9A-Fa-f]{12})").unwrap()
    })
}

fn wifi_password_regex() -> &'static Regex {
    RE_WIFI_PASSWORD.get_or_init(|| {
        Regex::new(r#"(?i)(password|passwd|psk|wpa\s*key)\s*[=:]\s*["']?([^\s"',;]{8,63})["']?"#).unwrap()
    })
}

fn coordinates_regex() -> &'static Regex {
    RE_COORDINATES.get_or_init(|| {
        Regex::new(r"(?i)(lat(?:itude)?|lng|lon(?:gitude)?)\s*[=:]\s*(-?\d{1,3}\.\d{4,})").unwrap()
    })
}

fn api_key_regex() -> &'static Regex {
    RE_API_KEY.get_or_init(|| {
        Regex::new(r"(?i)(sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[=:]\s*[A-Za-z0-9]{16,}|bearer\s+[A-Za-z0-9._-]{20,})").unwrap()
    })
}

fn phone_regex() -> &'static Regex {
    RE_PHONE.get_or_init(|| {
        Regex::new(r"1[3-9]\d{9}").unwrap()
    })
}

fn email_regex() -> &'static Regex {
    RE_EMAIL.get_or_init(|| {
        Regex::new(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}").unwrap()
    })
}

// -------------------- 脱敏结果 --------------------

/// 单次脱敏的结果统计
#[derive(Debug, Clone, Default)]
pub struct SanitizeReport {
    pub uid_redacted: u32,
    pub nfc_key_redacted: u32,
    pub wifi_password_redacted: u32,
    pub coordinates_redacted: u32,
    pub api_key_redacted: u32,
    pub phone_redacted: u32,
    pub email_redacted: u32,
    pub total_redacted: u32,
}

impl SanitizeReport {
    /// 是否发生了脱敏
    pub fn has_redactions(&self) -> bool {
        self.total_redacted > 0
    }

    /// 生成人类可读的脱敏摘要
    pub fn summary(&self) -> String {
        if !self.has_redactions() {
            return "无敏感数据".to_string();
        }
        let mut parts = Vec::new();
        if self.uid_redacted > 0 {
            parts.push(format!("UID×{}", self.uid_redacted));
        }
        if self.nfc_key_redacted > 0 {
            parts.push(format!("NFC密钥×{}", self.nfc_key_redacted));
        }
        if self.wifi_password_redacted > 0 {
            parts.push(format!("WiFi密码×{}", self.wifi_password_redacted));
        }
        if self.coordinates_redacted > 0 {
            parts.push(format!("坐标×{}", self.coordinates_redacted));
        }
        if self.api_key_redacted > 0 {
            parts.push(format!("API密钥×{}", self.api_key_redacted));
        }
        if self.phone_redacted > 0 {
            parts.push(format!("手机号×{}", self.phone_redacted));
        }
        if self.email_redacted > 0 {
            parts.push(format!("邮箱×{}", self.email_redacted));
        }
        format!("已脱敏: {}", parts.join(", "))
    }
}

// -------------------- 核心：文本脱敏 --------------------

/// 对单段文本进行脱敏
///
/// 返回脱敏后的文本与统计报告
pub fn sanitize_text(text: &str) -> (String, SanitizeReport) {
    let mut result = text.to_string();
    let mut report = SanitizeReport::default();

    // 1. 门禁 UID
    let uid_count = count_matches(uid_regex(), &result);
    if uid_count > 0 {
        result = uid_regex()
            .replace_all(&result, |caps: &regex::Captures| {
                format!("{}[REDACTED:UID]", &caps[1])
            })
            .to_string();
        report.uid_redacted = uid_count;
    }

    // 2. NFC 密钥
    let key_count = count_matches(nfc_key_regex(), &result);
    if key_count > 0 {
        result = nfc_key_regex()
            .replace_all(&result, |caps: &regex::Captures| {
                format!("{}[REDACTED:KEY]", &caps[1])
            })
            .to_string();
        report.nfc_key_redacted = key_count;
    }

    // 3. WiFi 密码
    let wifi_count = count_matches(wifi_password_regex(), &result);
    if wifi_count > 0 {
        result = wifi_password_regex()
            .replace_all(&result, |caps: &regex::Captures| {
                format!("{}[REDACTED:WIFI]", &caps[1])
            })
            .to_string();
        report.wifi_password_redacted = wifi_count;
    }

    // 4. 地理坐标
    let coord_count = count_matches(coordinates_regex(), &result);
    if coord_count > 0 {
        result = coordinates_regex()
            .replace_all(&result, |caps: &regex::Captures| {
                format!("{}[REDACTED:COORD]", &caps[1])
            })
            .to_string();
        report.coordinates_redacted = coord_count;
    }

    // 5. API Key
    let api_count = count_matches(api_key_regex(), &result);
    if api_count > 0 {
        result = api_key_regex()
            .replace_all(&result, "[REDACTED:APIKEY]")
            .to_string();
        report.api_key_redacted = api_count;
    }

    // 6. 手机号
    let phone_count = count_matches(phone_regex(), &result);
    if phone_count > 0 {
        result = phone_regex()
            .replace_all(&result, "[REDACTED:PHONE]")
            .to_string();
        report.phone_redacted = phone_count;
    }

    // 7. 邮箱
    let email_count = count_matches(email_regex(), &result);
    if email_count > 0 {
        result = email_regex()
            .replace_all(&result, "[REDACTED:EMAIL]")
            .to_string();
        report.email_redacted = email_count;
    }

    report.total_redacted = report.uid_redacted
        + report.nfc_key_redacted
        + report.wifi_password_redacted
        + report.coordinates_redacted
        + report.api_key_redacted
        + report.phone_redacted
        + report.email_redacted;

    if report.has_redactions() {
        log::info!("脱敏完成: {}", report.summary());
    }

    (result, report)
}

/// 统计正则匹配次数
fn count_matches(re: &Regex, text: &str) -> u32 {
    re.find_iter(text).count() as u32
}

// -------------------- 消息列表脱敏 --------------------

/// 对整个对话消息列表进行脱敏
///
/// 仅对 role=user 的消息内容脱敏（AI 回复一般不含用户敏感数据）
pub fn sanitize_messages(messages: &[ChatMessage]) -> Vec<ChatMessage> {
    let mut sanitized = Vec::with_capacity(messages.len());
    for msg in messages {
        let mut new_msg = msg.clone();
        // 仅脱敏用户消息
        if msg.role == crate::ai::ChatRole::User {
            let (clean, report) = sanitize_text(&msg.content);
            if report.has_redactions() {
                log::info!(
                    "用户消息 {} 已脱敏: {}",
                    msg.id,
                    report.summary()
                );
                // 在脱敏后的内容末尾追加提示（可选）
                new_msg.content = format!(
                    "{}\n\n[系统提示：本消息中的敏感数据已自动脱敏，{}]",
                    clean,
                    report.summary()
                );
            } else {
                new_msg.content = clean;
            }
        }
        sanitized.push(new_msg);
    }
    sanitized
}

// -------------------- 图片脱敏 --------------------

/// 对图片描述文本进行脱敏
///
/// 当前实现：对图片的文字描述（如 AI 生成的图片描述）做文本脱敏。
/// 注意：无法检测图片图像本身中的敏感信息（如截图中的密钥），
/// 因为这需要 OCR 引擎。用户应注意不要截取包含敏感信息的屏幕区域。
pub fn sanitize_image_context(text_description: &str) -> (String, SanitizeReport) {
    // 对图片的文字描述做文本脱敏
    // 注意：图片像素内容中的敏感信息（如截图中的密钥）无法自动检测
    // 用户应确保不截取包含敏感信息的屏幕区域
    sanitize_text(text_description)
}

// -------------------- 测试用例（文档示例） --------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_uid() {
        let input = "我读取到的卡片 UID: 04A3B2C1D2E3";
        let (output, report) = sanitize_text(input);
        assert!(output.contains("[REDACTED:UID]"));
        assert!(!output.contains("04A3B2C1D2E3"));
        assert_eq!(report.uid_redacted, 1);
    }

    #[test]
    fn test_sanitize_nfc_key() {
        let input = "Key A: FFFFFFFFFFFF 是默认密钥";
        let (output, report) = sanitize_text(input);
        assert!(output.contains("[REDACTED:KEY]"));
        assert_eq!(report.nfc_key_redacted, 1);
    }

    #[test]
    fn test_sanitize_wifi() {
        let input = "我的 WiFi password=MySecretPass123";
        let (output, report) = sanitize_text(input);
        assert!(output.contains("[REDACTED:WIFI]"));
        assert_eq!(report.wifi_password_redacted, 1);
    }

    #[test]
    fn test_sanitize_api_key() {
        let input = "用的是 sk-1234567890abcdefghijklmnopqrstuvwxyz 这个 key";
        let (output, report) = sanitize_text(input);
        assert!(output.contains("[REDACTED:APIKEY]"));
        assert_eq!(report.api_key_redacted, 1);
    }
}
