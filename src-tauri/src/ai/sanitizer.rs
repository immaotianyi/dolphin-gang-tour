/**
 * AI 输入脱敏 — 在发送给 LLM 之前移除敏感数据
 *
 * 7 种脱敏模式:
 *   1. UID        — NFC 卡片 UID (4/7/10 字节 hex, 冒号分隔)
 *   2. NFC Key    — Mifare Classic 密钥 (6 字节 hex)
 *   3. WiFi       — SSID 和密码
 *   4. API Key    — 各种 API 密钥格式
 *   5. 手机号      — 中国手机号
 *   6. 邮箱        — 电子邮件地址
 *   7. 坐标        — GPS 经纬度
 *
 * 设计原则:
 *   - 只脱敏发送给云端 LLM 的内容，本地模型不脱敏
 *   - 替换为占位符而非删除，保持上下文可读性
 *   - 记录脱敏映射，AI 回复中可还原
 */
use regex::Regex;
use std::collections::HashMap;
use std::sync::OnceLock;

/// 脱敏后的文本和映射表
#[derive(Debug, Clone)]
pub struct SanitizedText {
    pub text: String,
    pub replacements: HashMap<String, String>, // placeholder → original
}

/// 7 种脱敏模式的正则表达式 (OnceLock 避免重复编译)
fn patterns() -> &'static [(Regex, &'static str, &'static str)] {
    static PATTERNS: OnceLock<Vec<(Regex, &'static str, &'static str)>> = OnceLock::new();
    PATTERNS.get_or_init(|| vec![
        // 1. NFC UID — 4/7/10 字节 hex，冒号分隔 (如 04:A3:B2:C1)
        (
            Regex::new(r"(?i)\b([0-9a-f]{2}:){3,9}[0-9a-f]{2}\b").unwrap(),
            "uid",
            "[UID_REDACTED]",
        ),
        // 2. NFC Key — 6 字节 hex 连续 (如 A1B2C3D4E5F6)
        (
            Regex::new(r"(?i)\b[0-9a-f]{12}\b").unwrap(),
            "key",
            "[KEY_REDACTED]",
        ),
        // 3. WiFi 密码 — WPA/WPA2 密码 (8-63 字符)
        (
            Regex::new(r"(?i)(?:wifi|password|passwd|psk|wpa)\s*[:=]\s*(\S{8,63})").unwrap(),
            "wifi",
            "[WIFI_REDACTED]",
        ),
        // 4. API Key — 常见格式 (sk-xxx, Bearer xxx, api_key=xxx)
        (
            Regex::new(r"(?i)(?:sk-|bearer |api[_-]?key\s*[:=]\s*)([a-z0-9_\-]{20,})").unwrap(),
            "apikey",
            "[API_KEY_REDACTED]",
        ),
        // 5. 中国手机号 — 1开头 11 位
        (
            Regex::new(r"\b1[3-9]\d{9}\b").unwrap(),
            "phone",
            "[PHONE_REDACTED]",
        ),
        // 6. 邮箱
        (
            Regex::new(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b").unwrap(),
            "email",
            "[EMAIL_REDACTED]",
        ),
        // 7. GPS 坐标 — 经纬度 (如 31.2304,121.4737)
        (
            Regex::new(r"\b-?\d{1,3}\.\d{4,8}\s*,\s*-?\d{1,3}\.\d{4,8}\b").unwrap(),
            "coords",
            "[COORDS_REDACTED]",
        ),
    ])
}

/// 对文本进行脱敏处理
pub fn sanitize(input: &str) -> SanitizedText {
    let mut text = input.to_string();
    let mut replacements = HashMap::new();
    let mut counter = 0;

    for (regex, _kind, placeholder) in patterns() {
        text = regex.replace_all(&text, |caps: &regex::Captures| {
            // 对于带捕获组的模式 (WiFi/API Key)，替换整个匹配
            let full_match = caps.get(0).map(|m| m.as_str()).unwrap_or("");
            let _placeholder_unique = if counter == 0 {
                placeholder.to_string()
            } else {
                format!("{}_{}", placeholder.trim_matches(|c| c == '[' || c == ']').to_lowercase(), counter)
            };
            // 简单替换: 使用固定占位符
            let p = placeholder.to_string();
            replacements.insert(p.clone(), full_match.to_string());
            counter += 1;
            p
        }).to_string();
    }

    SanitizedText { text, replacements }
}

/// 还原脱敏数据 — 在 AI 回复中如果包含占位符，用原始数据替换
pub fn restore(text: &str, replacements: &HashMap<String, String>) -> String {
    let mut result = text.to_string();
    for (placeholder, original) in replacements {
        result = result.replace(placeholder, original);
    }
    result
}

/// 检查文本是否包含敏感数据
pub fn contains_sensitive(input: &str) -> bool {
    patterns().iter().any(|(regex, _, _)| regex.is_match(input))
}

/// 统计脱敏项数量
pub fn count_sensitive(input: &str) -> Vec<(String, usize)> {
    patterns().iter().filter_map(|(regex, kind, _)| {
        let count = regex.find_iter(input).count();
        if count > 0 {
            Some((kind.to_string(), count))
        } else {
            None
        }
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_uid() {
        let input = "My card UID is 04:A3:B2:C1";
        let result = sanitize(input);
        assert!(result.text.contains("[UID_REDACTED]"));
        assert!(!result.text.contains("04:A3:B2:C1"));
    }

    #[test]
    fn test_sanitize_phone() {
        let input = "Call me at 13812345678";
        let result = sanitize(input);
        assert!(result.text.contains("[PHONE_REDACTED]"));
    }

    #[test]
    fn test_sanitize_email() {
        let input = "Email: test@example.com";
        let result = sanitize(input);
        assert!(result.text.contains("[EMAIL_REDACTED]"));
    }

    #[test]
    fn test_sanitize_coords() {
        let input = "Location: 31.2304,121.4737";
        let result = sanitize(input);
        assert!(result.text.contains("[COORDS_REDACTED]"));
    }

    #[test]
    fn test_sanitize_api_key() {
        let input = "api_key=sk-1234567890abcdefghij";
        let result = sanitize(input);
        assert!(result.text.contains("[API_KEY_REDACTED]"));
    }

    #[test]
    fn test_contains_sensitive() {
        assert!(contains_sensitive("UID: 04:A3:B2:C1"));
        assert!(!contains_sensitive("Hello World"));
    }

    #[test]
    fn test_count_sensitive() {
        let counts = count_sensitive("UID 04:A3:B2:C1, phone 13812345678");
        assert!(counts.len() >= 2);
    }

    #[test]
    fn test_restore() {
        let original = "UID is 04:A3:B2:C1";
        let sanitized = sanitize(original);
        let restored = restore(&sanitized.text, &sanitized.replacements);
        assert!(restored.contains("04:A3:B2:C1"));
    }
}
