/**
 * AI 管道 — SSE 流式响应 + 命令建议卡片 + 审批制
 *
 * 重要变更 (P2 — AI 命令审批制):
 *   AI 不再直接执行硬件命令，而是生成"建议命令卡片"返回前端。
 *   所有 cmds 经过 CommandPolicy 审查:
 *     - Safe 命令: 标记为 "auto_suggest" (可一键批准)
 *     - Caution 命令: 标记为 "requires_confirm" (需用户确认)
 *     - Dangerous/Blocked: 从建议列表中移除，并在 content 中说明原因
 *   前端收到建议卡片后，用户逐条点击批准才会执行。
 *
 * 数据流:
 *   1. 用户输入 → sanitizer 脱敏
 *   2. 构建系统提示 (设备上下文 + 能力描述 + 安全约束)
 *   3. provider.build_request → reqwest SSE stream
 *   4. 逐行解析 SSE → parse_sse_line → emit_ai_token 到前端
 *   5. 累积完整回复 → 解析 <cmds> 标签 → CommandPolicy 过滤
 *   6. 返回 { content, suggestions, sanitized, model }
 *
 * 系统提示新增:
 *   - 明确告诉 AI 不要建议 BadUSB 执行/SubGHz 发射/NFC 写入等危险操作
 *   - 建议格式必须用 <cmds> 标签
 */
use crate::error::{LucyError, LucyResult};
use crate::ai::provider::{self, ChatMessage};
use crate::ai::sanitizer;
use crate::policy::{self, RiskLevel};
use futures_util::StreamExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

/// AI 建议的设备命令（需用户审批）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandSuggestion {
    pub id: String,
    pub module: String,
    pub action: String,
    pub args: Vec<String>,
    pub raw: String,
    pub risk: String,        // safe/caution/dangerous/blocked
    pub risk_label: String,  // 中文标签
    pub description: String, // 命令描述
    pub ai_reason: String,   // AI 建议理由
    pub auto_executable: bool, // Safe 级别可一键执行
}

/// AI 回复结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiResponse {
    pub content: String,
    #[serde(rename = "suggestions")]
    pub cmds: Vec<CommandSuggestion>, // 改为建议卡片
    pub sanitized: bool,
    pub model: String,
    pub blocked_warnings: Vec<String>, // 被策略拦截的命令说明
}

/// 从 <cmds> 解析出的单个设备命令（内部使用）
#[derive(Debug, Clone)]
pub(crate) struct DeviceCommand {
    module: String,
    action: String,
    args: Vec<String>,
    raw: String,
}

/// <cmds> 标签正则
fn cmds_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"(?s)<cmds>(.*?)</cmds>").unwrap())
}

/// 系统提示 — Lucy 设备能力描述 + 严格安全约束
fn build_system_prompt(device_context: &str) -> String {
    format!(
        r#"You are Lucy, an AI assistant embedded in the Lucy Desktop app for the Lucy hardware device (ESP32-S3 + CC1101 + ST25R3916).

## Device Capabilities
- **NFC**: Read/write/emulate ISO 14443-A/B cards (Mifare Classic, NTAG, DESFire)
- **SubGHz**: 300-928MHz RF scan/capture/replay (OOK/2-FSK/ASK/GFSK)
- **GPIO**: 8 pins (ADC, UART, I2C, SPI) with logic analyzer
- **IR**: Learn/transmit IR signals (NEC/RC5/RC6/Samsung/Sony)
- **BadUSB**: DuckyScript HID injection (with mandatory safety review)
- **Screen**: Real-time screen mirroring (240x240 RGB565)

## Current Device Status
{device_context}

## How to Help
- Answer questions about hardware, RF protocols, NFC, GPIO, etc.
- When the user asks you to perform a device action, include a <cmds> block
- Use simple command syntax inside <cmds> tags, one command per line
- All commands you suggest will be reviewed by the user before execution

## CRITICAL SAFETY RULES — MUST FOLLOW
- **NEVER suggest BadUSB execution** (badusb_execute). Only suggest badusb_validate for review.
- **NEVER suggest SubGHz transmission** (subghz_tx, subghz_replay). Only suggest subghz_rx (receive) and subghz_scan.
- **NEVER suggest NFC emulation** (nfc_emulate) or NFC block writing (nfc_write_block). Only suggest reading/detection.
- **NEVER suggest file deletion** (storage_delete).
- **NEVER suggest firmware modification**.
- **SAFE commands you CAN suggest**: nfc_detect, nfc_read_uid, nfc_read_card, nfc_list_saved,
  subghz_scan, subghz_rx, subghz_identify, subghz_list_saved,
  gpio_scan, gpio_read, gpio_read_adc, gpio_capture,
  ir_learn, ir_list_protocols, ir_list_saved, ir_get_presets,
  badusb_validate, badusb_list_scripts, badusb_get_script,
  screen_get_frame, device_get_info, device_refresh_info, storage_list, storage_read, storage_info.
- Always warn about legal considerations for RF operations.
- For NFC, remind users about data privacy when reading cards.
- If user asks for a dangerous operation, explain the risk and suggest a safe alternative.

## Command Examples (SAFE ONLY)
<cmds>
nfc detect
subghz rx 433920000
gpio read 1
ir learn
badusb_validate
screen_get_frame
</cmds>"#,
        device_context = device_context
    )
}

/// 解析 <cmds> 标签 — 提取设备命令（内部使用）
pub(crate) fn parse_commands(content: &str) -> Vec<DeviceCommand> {
    let regex = cmds_regex();
    let mut commands = Vec::new();

    for caps in regex.captures_iter(content) {
        let cmds_block = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        for line in cmds_block.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                continue;
            }
            commands.push(DeviceCommand {
                module: parts[0].to_string(),
                action: parts[1].to_string(),
                args: parts[2..].iter().map(|s| s.to_string()).collect(),
                raw: line.to_string(),
            });
        }
    }

    commands
}

/// 从完整回复中移除 <cmds> 块（前端会单独渲染）
#[allow(dead_code)]
pub fn strip_cmds(content: &str) -> String {
    let regex = cmds_regex();
    regex.replace_all(content, "").trim().to_string()
}

/// 将解析出的 DeviceCommand 通过 CommandPolicy 过滤为 CommandSuggestion
/// 返回 (suggestions, blocked_warnings)
fn filter_commands_by_policy(raw_cmds: Vec<DeviceCommand>) -> (Vec<CommandSuggestion>, Vec<String>) {
    let mut suggestions = Vec::new();
    let mut warnings = Vec::new();
    let mut id_counter = 0u64;

    for cmd in raw_cmds {
        id_counter += 1;
        let cmd_name = format!("{}_{}", cmd.module, cmd.action);

        // 查找策略
        let (risk, description, auto_exec) = if let Some(p) = policy::get_policy(&cmd_name) {
            if p.risk == RiskLevel::Blocked || p.risk == RiskLevel::Dangerous {
                warnings.push(format!(
                    "⚠️ AI 建议了危险操作 `{}` 已被安全策略拦截（风险等级: {}）。该操作需要您手动执行。",
                    cmd.raw, p.risk.label_zh()
                ));
                continue;
            }
            (p.risk, p.description.clone(), p.risk == RiskLevel::Safe)
        } else {
            (RiskLevel::Caution, format!("未知命令: {}", cmd.raw), false)
        };

        // SubGHz tx/replay 额外做频段校验
        if cmd.module == "subghz" && (cmd.action == "tx" || cmd.action == "replay") {
            warnings.push(format!(
                "⚠️ AI 建议了 SubGHz 发射 `{}` 已被拦截。射频发射需要地区合规确认，请手动操作。",
                cmd.raw
            ));
            continue;
        }

        suggestions.push(CommandSuggestion {
            id: format!("ai-cmd-{}", id_counter),
            module: cmd.module,
            action: cmd.action,
            args: cmd.args,
            raw: cmd.raw,
            risk: risk.as_str().to_string(),
            risk_label: risk.label_zh().to_string(),
            description,
            ai_reason: String::new(),
            auto_executable: auto_exec,
        });
    }

    (suggestions, warnings)
}

/// 构建 AI 回复 — 本地模式（无 API Key 时降级）
pub fn local_response(message: &str) -> AiResponse {
    let lower = message.to_lowercase();
    let content = if lower.contains("nfc") {
        "I can help you with NFC! Lucy supports reading Mifare Classic, NTAG, and DESFire cards.\n\n<cmds>\nnfc detect\n</cmds>\n\nClick 'Execute' to scan for a card, or ask me anything about NFC protocols."
    } else if lower.contains("subghz") || lower.contains("rf") || lower.contains("433") {
        "SubGHz module supports 300-928MHz frequency range.\n\n<cmds>\nsubghz rx 433920000\n</cmds>\n\nThis will listen on 433.92MHz (common doorbell/remote frequency). Always check local regulations before transmitting."
    } else if lower.contains("gpio") {
        "Lucy has 8 GPIO pins:\n- GPIO1-2: ADC inputs\n- GPIO3-4: UART\n- GPIO5-6: I2C\n- GPIO7-8: SPI\n\n<cmds>\ngpio scan\n</cmds>\n\nNote: TXB0108 level shifter limits current to <5mA. Not suitable for motors or relays."
    } else if lower.contains("ir") || lower.contains("remote") {
        "IR module supports NEC, RC5, RC6, Samsung, and Sony protocols.\n\n<cmds>\nir learn\n</cmds>\n\nPoint your remote at Lucy and press a button. I'll identify the protocol and capture the signal."
    } else if lower.contains("badusb") || lower.contains("ducky") {
        "BadUSB executes DuckyScript for HID injection. All scripts are reviewed by the safety guard before execution.\n\n<cmds>\nbadusb validate\n</cmds>\n\nThe guard checks for 25 dangerous command patterns (rm -rf, format, shutdown, etc.)."
    } else if lower.contains("hello") || lower.contains("hi") {
        "Hello! I'm Lucy, your AI hardware assistant. I can help with NFC, SubGHz, GPIO, IR, and BadUSB. What would you like to do?"
    } else {
        "I'm Lucy, your AI hardware assistant. I can help you with:\n- NFC card reading/writing\n- SubGHz RF scanning/replay\n- GPIO pin control\n- IR signal learning/transmission\n- BadUSB script creation\n\nWhat would you like to do?"
    };

    let raw_cmds = parse_commands(content);
    let (cmds, blocked_warnings) = filter_commands_by_policy(raw_cmds);
    let mut final_content = content.to_string();
    for w in &blocked_warnings {
        final_content.push_str(&format!("\n\n{}", w));
    }
    AiResponse {
        content: final_content,
        cmds,
        sanitized: false,
        model: "local".to_string(),
        blocked_warnings,
    }
}

/// 执行 AI 对话 — SSE 流式响应
pub async fn run_pipeline(
    app: &AppHandle,
    message: &str,
    model: &str,
    device_context: &str,
    history: &[ChatMessage],
) -> LucyResult<AiResponse> {
    let config = provider::load_config(model);

    // 1. 脱敏用户输入 (云端 LLM)
    let sanitized = if config.provider.needs_api_key() && sanitizer::contains_sensitive(message) {
        let s = sanitizer::sanitize(message);
        tracing::info!("Sanitized {} sensitive item(s)", s.replacements.len());
        s
    } else {
        sanitizer::SanitizedText {
            text: message.to_string(),
            replacements: Default::default(),
        }
    };

    // 2. 本地模式降级 — 无 API Key
    if config.provider.needs_api_key() && config.api_key.is_empty() {
        tracing::info!("No API key for {:?}, using local mode", config.provider);
        let mut response = local_response(&sanitized.text);
        response.sanitized = sanitized.replacements.len() > 0;
        return Ok(response);
    }

    // 3. 构建消息列表
    let mut messages = vec![ChatMessage::system(&build_system_prompt(device_context))];
    messages.extend_from_slice(history);
    messages.push(ChatMessage::user(&sanitized.text));

    // 4. 发起 SSE 请求
    let request = provider::build_request(&config, messages, 60)?;
    let response = request.send().await.map_err(|e| {
        LucyError::Ai(format!("Request failed: {}. If using Local mode, ensure Ollama is running on port 11434.", e))
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(LucyError::Ai(format!("API error {}: {}", status, body)));
    }

    // 5. 流式读取 SSE
    let mut stream = response.bytes_stream();
    let mut full_content = String::new();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| LucyError::Ai(format!("Stream error: {}", e)))?;
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        // 按行处理 SSE
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].to_string();
            buffer = buffer[pos + 1..].to_string();

            if let Some(token) = provider::parse_sse_line(&line) {
                full_content.push_str(&token);
                // 逐 token emit 到前端
                let _ = app.emit("ai_token", &token);
            }
        }
    }

    // 6. 解析 <cmds> 标签 → 通过 CommandPolicy 过滤
    let raw_cmds = parse_commands(&full_content);
    let (cmds, blocked_warnings) = filter_commands_by_policy(raw_cmds);

    // 7. 还原脱敏数据
    let mut content = if !sanitized.replacements.is_empty() {
        sanitizer::restore(&full_content, &sanitized.replacements)
    } else {
        full_content
    };

    // 将被拦截的警告追加到回复内容
    for w in &blocked_warnings {
        content.push_str(&format!("\n\n{}", w));
    }

    // 8. 记录审计日志
    if !cmds.is_empty() {
        crate::logger::info("ai", &format!(
            "AI suggested {} command(s) awaiting approval", cmds.len()
        ));
    }
    if !blocked_warnings.is_empty() {
        crate::logger::warn("ai", &format!(
            "Blocked {} dangerous command suggestion(s) from AI", blocked_warnings.len()
        ));
    }

    Ok(AiResponse {
        content,
        cmds,
        sanitized: !sanitized.replacements.is_empty(),
        model: config.model,
        blocked_warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_commands() {
        let content = "I'll scan for NFC cards.\n<cmds>\nnfc detect\nsubghz rx 433920000\n</cmds>\nDone!";
        let cmds = parse_commands(content);
        assert_eq!(cmds.len(), 2);
        assert_eq!(cmds[0].module, "nfc");
        assert_eq!(cmds[0].action, "detect");
        assert_eq!(cmds[1].module, "subghz");
        assert_eq!(cmds[1].action, "rx");
        assert_eq!(cmds[1].args, vec!["433920000"]);
    }

    #[test]
    fn test_strip_cmds() {
        let content = "Before\n<cmds>\nnfc detect\n</cmds>\nAfter";
        let stripped = strip_cmds(content);
        assert!(stripped.contains("Before"));
        assert!(stripped.contains("After"));
        assert!(!stripped.contains("<cmds>"));
    }

    #[test]
    fn test_filter_blocks_dangerous_commands() {
        let raw = vec![
            DeviceCommand { module: "badusb".into(), action: "execute".into(), args: vec![], raw: "badusb execute".into() },
            DeviceCommand { module: "nfc".into(), action: "detect".into(), args: vec![], raw: "nfc detect".into() },
            DeviceCommand { module: "subghz".into(), action: "tx".into(), args: vec!["433920000".into()], raw: "subghz tx 433920000".into() },
        ];
        let (suggestions, warnings) = filter_commands_by_policy(raw);
        // badusb_execute 和 subghz_tx 应被拦截
        assert_eq!(suggestions.len(), 1);
        assert_eq!(suggestions[0].module, "nfc");
        assert_eq!(warnings.len(), 2);
    }

    #[test]
    fn test_filter_safe_commands_pass() {
        let raw = vec![
            DeviceCommand { module: "nfc".into(), action: "detect".into(), args: vec![], raw: "nfc detect".into() },
            DeviceCommand { module: "device".into(), action: "get_info".into(), args: vec![], raw: "device get_info".into() },
        ];
        let (suggestions, warnings) = filter_commands_by_policy(raw);
        assert_eq!(suggestions.len(), 2);
        assert!(warnings.is_empty());
        assert!(suggestions[0].auto_executable); // safe 级别
    }

    #[test]
    fn test_local_response_nfc() {
        let resp = local_response("help me with NFC");
        assert!(resp.content.contains("NFC"));
        assert!(!resp.cmds.is_empty());
        assert!(resp.cmds[0].auto_executable);
    }

    #[test]
    fn test_local_response_no_dangerous_cmds() {
        let resp = local_response("badusb execute something");
        // badusb_execute 即使被建议也应被过滤
        for s in &resp.cmds {
            assert_ne!(s.action, "execute");
        }
    }
}
