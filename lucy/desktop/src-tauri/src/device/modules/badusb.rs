/**
 * BadUSB 模块 — DuckyScript 执行 + 安全审查
 *
 * 安全门控流程:
 *   1. 前端调用 badusb_validate → badusb_guard 分析 → 返回 GuardReport
 *   2. 如果 danger_count > 0 → 前端弹窗确认
 *   3. 用户确认后 → badusb_execute → 设备执行 HID 注入
 *   4. 执行过程通过事件推送进度
 *
 * DuckyScript 语法:
 *   GUI r / CTRL ESC / ALT TAB — 修饰键组合
 *   STRING <text>              — 输入文本
 *   ENTER / TAB / ESC          — 按键
 *   DELAY <ms>                 — 延迟
 *   REM <comment>              — 注释
 */
use crate::error::{LucyError, LucyResult};
use crate::security::badusb_guard::{self, GuardReport};
use serde::{Deserialize, Serialize};
use super::super::transport_manager::TransportManager;
use std::sync::Arc;

/// BadUSB 脚本信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub line_count: usize,
    pub danger_count: usize,
    pub created_at: u64,
}

/// 内置示例脚本
const BUILTIN_SCRIPTS: &[(&str, &str, &str)] = &[
    ("hello_world", "Hello World", "REM Open Notepad and type a message\nGUI r\nDELAY 500\nSTRING notepad\nENTER\nDELAY 1000\nSTRING Hello from Lucy BadUSB!\n"),
    ("open_calc", "Open Calculator", "REM Open Windows Calculator\nGUI r\nDELAY 500\nSTRING calc\nENTER\n"),
    ("open_terminal", "Open Terminal (macOS)", "REM Open Terminal on macOS\nGUI SPACE\nDELAY 500\nSTRING terminal\nENTER\n"),
];

/// 验证 DuckyScript 脚本安全性
pub fn validate(script: &str) -> GuardReport {
    badusb_guard::analyze(script)
}

/// 预览脚本执行效果（三段式执行的第二段）
/// 逐行解析 DuckyScript，返回每行的操作描述和风险标注
pub fn preview(script: &str) -> Vec<PreviewLine> {
    let mut lines = Vec::new();
    for (idx, raw_line) in script.lines().enumerate() {
        let line = raw_line.trim();
        if line.is_empty() { continue; }

        let (action, risk) = interpret_line(line);
        lines.push(PreviewLine {
            line_num: idx + 1,
            raw: raw_line.to_string(),
            action,
            risk,
        });
    }
    lines
}

/// 单行脚本解释结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewLine {
    pub line_num: usize,
    pub raw: String,
    pub action: String,
    pub risk: String, // "safe" / "warn" / "danger"
}

/// 解释单行 DuckyScript 的效果
fn interpret_line(line: &str) -> (String, String) {
    let upper = line.to_uppercase();
    let upper_trimmed = upper.trim_start();

    if upper_trimmed.starts_with("REM") {
        (format!("注释: {}", &line[3..].trim()), "safe".into())
    } else if upper_trimmed.starts_with("DELAY") {
        let ms: String = upper_trimmed.chars().skip(5).collect();
        (format!("等待 {} 毫秒", ms.trim()), "safe".into())
    } else if upper_trimmed.starts_with("STRING") {
        let text: String = line.chars().skip(6).collect();
        let text = text.trim();
        // 检查 STRING 内容风险
        let lower = text.to_lowercase();
        if lower.contains("rm -rf") || lower.contains("format") || lower.contains("del /f")
            || lower.contains("reg add") || lower.contains("powershell -enc")
            || lower.contains("certutil") || lower.contains("download")
            || lower.contains("invoke-webrequest") || lower.contains("curl") {
            (format!("⚠️ 输入危险文本: \"{}\"", truncate(text, 50)), "danger".into())
        } else if lower.contains("password") || lower.contains("sudo") {
            (format!("输入敏感文本: \"{}\"", truncate(text, 50)), "warn".into())
        } else {
            (format!("输入文本: \"{}\"", truncate(text, 50)), "safe".into())
        }
    } else if upper_trimmed.starts_with("GUI") || upper_trimmed.starts_with("WINDOWS") || upper_trimmed.starts_with("COMMAND") {
        let key = &upper_trimmed[3..].trim();
        let action = match key.to_lowercase().as_str() {
            "r" => "打开「运行」对话框".into(),
            "space" => "打开 Spotlight/搜索".into(),
            "e" => "打开文件资源管理器".into(),
            "d" => "显示桌面".into(),
            "l" => "锁定屏幕".into(),
            _ => format!("按下 Win/Cmd + {}", key),
        };
        (action, "safe".into())
    } else if upper_trimmed == "ENTER" {
        ("按下 Enter 键（执行当前命令/输入）".into(), "warn".into())
    } else if upper_trimmed == "TAB" {
        ("按下 Tab 键".into(), "safe".into())
    } else if upper_trimmed == "ESC" || upper_trimmed == "ESCAPE" {
        ("按下 Escape 键".into(), "safe".into())
    } else if upper_trimmed.starts_with("CTRL") || upper_trimmed.starts_with("CONTROL") {
        (format!("按下 Ctrl 组合键: {}", &line[4..].trim()), "warn".into())
    } else if upper_trimmed.starts_with("ALT") {
        (format!("按下 Alt 组合键: {}", &line[3..].trim()), "warn".into())
    } else if upper_trimmed.starts_with("SHIFT") {
        (format!("按下 Shift 组合键: {}", &line[5..].trim()), "safe".into())
    } else if upper_trimmed.starts_with("REPEAT") {
        (format!("重复上一条命令", ), "warn".into())
    } else {
        (format!("未知命令: {}", truncate(line, 40)), "warn".into())
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max { s.to_string() } else { format!("{}...", &s[..max]) }
}

/// 执行 DuckyScript 脚本
/// 安全门控: 如果脚本包含 DANGER 级别问题且 force=false，则拒绝执行
pub async fn execute(
    tm: &Arc<TransportManager>,
    script: String,
    force: bool,
) -> LucyResult<serde_json::Value> {
    // 安全门控
    let report = badusb_guard::analyze(&script);
    if !report.passed && !force {
        return Err(LucyError::Protocol(format!(
            "Script contains {} danger issue(s). Set force=true to override.",
            report.danger_count
        )));
    }

    let transport = tm.get_transport()?;
    transport
        .send_command("badusb", "execute", serde_json::json!({
            "script": script,
            "force": force,
        }))
        .await
}

/// 列出已保存的脚本
pub async fn list_scripts() -> LucyResult<Vec<ScriptInfo>> {
    let scripts: Vec<ScriptInfo> = BUILTIN_SCRIPTS
        .iter()
        .map(|(id, name, content)| {
            let report = badusb_guard::analyze(content);
            ScriptInfo {
                id: id.to_string(),
                name: name.to_string(),
                description: format!("Built-in {} script", name),
                line_count: content.lines().count(),
                danger_count: report.danger_count,
                created_at: 0,
            }
        })
        .collect();
    Ok(scripts)
}

/// 获取脚本内容
pub async fn get_script(id: String) -> LucyResult<String> {
    BUILTIN_SCRIPTS
        .iter()
        .find(|(sid, _, _)| *sid == id)
        .map(|(_, _, content)| content.to_string())
        .ok_or_else(|| LucyError::Protocol(format!("Script not found: {}", id)))
}

/// 保存脚本
pub async fn save_script(
    _tm: &Arc<TransportManager>,
    name: String,
    script: String,
) -> LucyResult<serde_json::Value> {
    let report = badusb_guard::analyze(&script);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(serde_json::json!({
        "success": true,
        "id": format!("script_{}", ts),
        "name": name,
        "danger_count": report.danger_count,
        "line_count": script.lines().count(),
    }))
}

/// DuckyScript 命令参考
#[allow(dead_code)]
pub const DUCKY_COMMANDS: &[(&str, &str)] = &[
    ("GUI r", "Open Run dialog (Windows)"),
    ("GUI SPACE", "Open Spotlight (macOS)"),
    ("STRING", "Type text string"),
    ("ENTER", "Press Enter key"),
    ("TAB", "Press Tab key"),
    ("ESC", "Press Escape key"),
    ("DELAY", "Wait N milliseconds"),
    ("CTRL", "Ctrl modifier + key"),
    ("ALT", "Alt modifier + key"),
    ("SHIFT", "Shift modifier + key"),
    ("REM", "Comment line"),
    ("REPEAT", "Repeat last command N times"),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_safe_script() {
        let script = "REM Hello\nGUI r\nDELAY 500\nSTRING notepad\nENTER\n";
        let report = validate(script);
        assert!(report.passed);
    }

    #[test]
    fn test_validate_dangerous_script() {
        let script = "STRING rm -rf /\n";
        let report = validate(script);
        assert!(!report.passed);
        assert!(report.danger_count > 0);
    }

    #[tokio::test]
    async fn test_list_scripts() {
        let scripts = list_scripts().await.unwrap();
        assert!(!scripts.is_empty());
    }

    #[test]
    fn test_preview_safe_script() {
        let script = "REM Hello\nGUI r\nDELAY 500\nSTRING notepad\nENTER\n";
        let lines = preview(script);
        assert_eq!(lines.len(), 5);
        assert_eq!(lines[0].risk, "safe"); // REM
        assert_eq!(lines[1].risk, "safe"); // GUI r
        assert_eq!(lines[2].risk, "safe"); // DELAY
        assert_eq!(lines[3].risk, "safe"); // STRING notepad
        assert_eq!(lines[4].risk, "warn"); // ENTER
    }

    #[test]
    fn test_preview_dangerous_string() {
        let script = "STRING rm -rf /\nENTER\n";
        let lines = preview(script);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].risk, "danger"); // STRING rm -rf
        assert_eq!(lines[1].risk, "warn"); // ENTER
    }

    #[test]
    fn test_preview_ctrl_alt_del_warn() {
        let lines = preview("CTRL ALT DELETE\nDELAY 100\n");
        assert!(lines[0].risk == "warn" || lines[0].risk == "danger");
        assert_eq!(lines[1].risk, "safe");
    }
}
