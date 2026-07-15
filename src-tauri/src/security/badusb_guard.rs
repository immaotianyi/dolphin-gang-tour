/**
 * BadUSB 脚本安全审查 — DuckyScript AST 分析器
 *
 * 三级审查体系:
 *   DANGER (25 项) — 拦截执行，必须人工确认
 *   WARN   (6 项)  — 警告提示，建议检查
 *   SAFE   (9 项)  — 教育白名单，允许执行
 *
 * 审查流程:
 *   1. 逐行解析 DuckyScript 语法
 *   2. 追踪 STRING 拼接上下文（多行 STRING 累积）
 *   3. 匹配危险模式（正则 + 子串）
 *   4. 检查教育白名单覆盖
 *   5. 返回审查报告
 */
use serde::{Deserialize, Serialize};

/// 审查严重级别
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// 拦截 — 危险操作
    Danger,
    /// 警告 — 可疑操作
    Warn,
    /// 信息 — 提示
    Info,
    /// 安全 — 白名单
    Safe,
}

/// 审查结果项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardIssue {
    pub line: usize,
    pub severity: Severity,
    pub rule_id: String,
    pub message: String,
    pub suggestion: Option<String>,
}

/// 审查报告
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardReport {
    pub issues: Vec<GuardIssue>,
    pub danger_count: usize,
    pub warn_count: usize,
    pub info_count: usize,
    pub safe_count: usize,
    pub total_lines: usize,
    pub passed: bool,
}

/// 25 项危险命令拦截模式
const DANGER_PATTERNS: &[(&str, &str, &str)] = &[
    // ── 系统破坏 (8 项) ──
    ("rm -rf", "D001", "Recursive force delete — filesystem destruction"),
    ("format ", "D002", "Disk format command — data loss"),
    ("del /f", "D003", "Force delete (Windows) — data loss"),
    ("del /s /q", "D004", "Silent recursive delete (Windows)"),
    ("shutdown", "D005", "System shutdown/reboot command"),
    ("taskkill /f", "D006", "Force kill process — may crash system"),
    ("sysctl -w", "D007", "Kernel parameter modification"),
    ("dd if=", "D008", "Raw disk write — partition/image overwrite"),

    // ── 权限提升 (4 项) ──
    ("powershell -enc", "D009", "Base64-encoded PowerShell — obfuscation attempt"),
    ("powershell -e ", "D010", "Encoded PowerShell command — common attack vector"),
    ("cmd /c", "D011", "Hidden command execution via cmd.exe"),
    ("runas /user", "D012", "User impersonation — privilege escalation"),

    // ── 远程下载 (4 项) ──
    ("invoke-webrequest", "D013", "PowerShell web request — potential payload download"),
    ("start-bitstransfer", "D014", "BITS transfer — stealth download"),
    ("curl | bash", "D015", "Pipe-to-shell remote execution"),
    ("curl | sh", "D016", "Pipe-to-shell remote execution"),

    // ── 持久化 (4 项) ──
    ("reg add", "D017", "Registry modification — persistence mechanism"),
    ("reg delete", "D018", "Registry deletion — may break system"),
    ("netsh advfirewall", "D019", "Firewall rule modification — network exposure"),
    ("schtasks /create", "D020", "Scheduled task creation — persistence"),

    // ── 凭证窃取 (3 项) ──
    ("net user", "D021", "User account enumeration — credential discovery"),
    ("net localgroup", "D022", "Local group enumeration — privilege mapping"),
    ("reg query hklm\\sam", "D023", "SAM hive access — password hash extraction"),

    // ── 网络后门 (2 项) ──
    ("netcat", "D024", "Netcat — potential reverse shell / backdoor"),
    ("nc -l -p", "D025", "Netcat listener — backdoor setup"),
];

/// 6 项可疑警告模式
const WARN_PATTERNS: &[(&str, &str, &str)] = &[
    ("gui r", "W001", "Opens Run dialog — check subsequent STRING command"),
    ("ctrl esc", "W002", "Opens Start menu — may lead to system commands"),
    ("alt space", "W003", "Opens window menu — potential for manipulation"),
    ("cmd.exe", "W004", "Command prompt invocation — review STRING content"),
    ("powershell", "W005", "PowerShell invocation — review STRING content"),
    ("terminal", "W006", "Terminal invocation — review STRING content"),
];

/// 9 项教育白名单（即使包含危险关键词也被认为是安全的）
const SAFE_PATTERNS: &[(&str, &str, &str)] = &[
    ("notepad", "S001", "Text editor — educational typing demo"),
    ("calc", "S002", "Calculator — educational demo"),
    ("mspaint", "S003", "Paint — educational demo"),
    ("hello world", "S004", "Hello World — educational typing demo"),
    ("hello from lucy", "S005", "Lucy demo text — safe"),
    ("this is a test", "S006", "Test text — safe"),
    ("demo", "S007", "Demo text — safe"),
    ("example", "S008", "Example text — safe"),
    ("tutorial", "S009", "Tutorial text — safe"),
];

/// 审查 DuckyScript 脚本
pub fn analyze(script: &str) -> GuardReport {
    let lines: Vec<&str> = script.lines().collect();
    let mut issues: Vec<GuardIssue> = Vec::new();
    let mut string_buffer = String::new(); // 追踪多行 STRING 拼接

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        let lower = trimmed.to_lowercase();

        // 跳过注释和空行
        if lower.starts_with("rem ") || lower.is_empty() {
            continue;
        }

        // 追踪 STRING 命令拼接
        if lower.starts_with("string ") {
            let text = trimmed[7..].to_lowercase();
            string_buffer.push_str(&text);
            string_buffer.push(' ');

            // 检查教育白名单 — 如果匹配则跳过危险检查
            let is_safe = SAFE_PATTERNS.iter().any(|(pat, _, _)| string_buffer.contains(pat));

            if !is_safe {
                // 检查危险模式
                for (pattern, rule_id, desc) in DANGER_PATTERNS {
                    if string_buffer.contains(pattern) {
                        issues.push(GuardIssue {
                            line: i + 1,
                            severity: Severity::Danger,
                            rule_id: rule_id.to_string(),
                            message: desc.to_string(),
                            suggestion: Some("Remove this command or replace with a safe alternative".to_string()),
                        });
                    }
                }

                // 检查 URL + 下载关键词组合
                if (string_buffer.contains("http://") || string_buffer.contains("https://"))
                    && (string_buffer.contains("download")
                        || string_buffer.contains("invoke")
                        || string_buffer.contains("curl")
                        || string_buffer.contains("wget"))
                {
                    issues.push(GuardIssue {
                        line: i + 1,
                        severity: Severity::Danger,
                        rule_id: "D026".to_string(),
                        message: "Remote code download — potential malware delivery".to_string(),
                        suggestion: Some("Verify the URL and destination before execution".to_string()),
                    });
                }
            } else {
                // 白名单匹配
                for (pattern, rule_id, desc) in SAFE_PATTERNS {
                    if string_buffer.contains(pattern) {
                        issues.push(GuardIssue {
                            line: i + 1,
                            severity: Severity::Safe,
                            rule_id: rule_id.to_string(),
                            message: desc.to_string(),
                            suggestion: None,
                        });
                        break;
                    }
                }
            }
        } else {
            // 非 STRING 行 — 重置 buffer
            string_buffer.clear();
        }

        // 检查可疑模式（GUI r, CTRL ESC 等）
        for (pattern, rule_id, desc) in WARN_PATTERNS {
            if lower.contains(pattern) {
                issues.push(GuardIssue {
                    line: i + 1,
                    severity: Severity::Warn,
                    rule_id: rule_id.to_string(),
                    message: desc.to_string(),
                    suggestion: Some("Check the following STRING command carefully".to_string()),
                });
            }
        }

        // 检查长延迟（等待系统响应）
        if lower.starts_with("delay ") {
            if let Ok(ms) = lower[6..].trim().parse::<u32>() {
                if ms > 3000 {
                    issues.push(GuardIssue {
                        line: i + 1,
                        severity: Severity::Info,
                        rule_id: "I001".to_string(),
                        message: format!("Long delay ({}ms) — waiting for system response", ms),
                        suggestion: None,
                    });
                }
            }
        }

        // 检查 ENTER 后的命令执行
        if lower == "enter" && i > 0 {
            let prev = lines[i - 1].trim().to_lowercase();
            if prev.starts_with("string ")
                && (prev.contains("cmd")
                    || prev.contains("powershell")
                    || prev.contains("terminal"))
            {
                issues.push(GuardIssue {
                    line: i + 1,
                    severity: Severity::Danger,
                    rule_id: "D027".to_string(),
                    message: "ENTER after opening terminal — command execution imminent".to_string(),
                    suggestion: Some("Review the terminal command before pressing ENTER".to_string()),
                });
            }
        }
    }

    // 统计
    let danger_count = issues.iter().filter(|i| i.severity == Severity::Danger).count();
    let warn_count = issues.iter().filter(|i| i.severity == Severity::Warn).count();
    let info_count = issues.iter().filter(|i| i.severity == Severity::Info).count();
    let safe_count = issues.iter().filter(|i| i.severity == Severity::Safe).count();

    GuardReport {
        passed: danger_count == 0,
        issues,
        danger_count,
        warn_count,
        info_count,
        safe_count,
        total_lines: lines.len(),
    }
}

/// 快速检查脚本是否安全（用于 execute 前的门控）
#[allow(dead_code)]
pub fn is_safe(script: &str) -> bool {
    analyze(script).passed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_script() {
        let script = "REM Hello World demo\nGUI r\nDELAY 500\nSTRING notepad\nENTER\nDELAY 1000\nSTRING Hello from Lucy BadUSB!\n";
        let report = analyze(script);
        assert!(report.passed, "Safe script should pass");
        assert_eq!(report.danger_count, 0);
    }

    #[test]
    fn test_dangerous_script() {
        let script = "GUI r\nDELAY 500\nSTRING powershell -enc XYZ\nENTER\n";
        let report = analyze(script);
        assert!(!report.passed, "Dangerous script should fail");
        assert!(report.danger_count > 0);
    }

    #[test]
    fn test_format_command() {
        let script = "STRING format C:\n";
        let report = analyze(script);
        assert!(!report.passed);
    }
}
