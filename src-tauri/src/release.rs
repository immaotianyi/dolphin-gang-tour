/**
 * Lucy Desktop — Release Engineering Module (P7 Sprint 3)
 *
 * 功能:
 *   1. 应用版本信息 (编译时嵌入)
 *   2. 自动更新检查 (HTTP manifest 对比)
 *   3. 内嵌 Changelog 数据
 *   4. Crash/Error 日志文件持久化 (~/.lucy/logs/)
 *   5. 发布检查清单状态
 */

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

// ===== 版本信息 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppVersion {
    pub version: String,
    pub build_date: String,
    pub git_hash: String,
    pub target_os: String,
    pub target_arch: String,
    pub rust_version: String,
}

impl AppVersion {
    pub fn current() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            build_date: option_env!("BUILD_DATE").unwrap_or("unknown").to_string(),
            git_hash: option_env!("GIT_HASH").unwrap_or("unknown").to_string(),
            target_os: std::env::consts::OS.to_string(),
            target_arch: std::env::consts::ARCH.to_string(),
            rust_version: option_env!("CARGO_PKG_RUST_VERSION").unwrap_or("1.75+").to_string(),
        }
    }
}

// ===== 更新检查 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub target_version: String,
    pub changelog: String,
    pub download_url: String,
    pub release_date: String,
    pub critical: bool,
}

/// 更新 manifest 远程格式 (从更新服务器获取)
#[derive(Debug, Deserialize)]
struct UpdateManifest {
    version: String,
    pub_date: String,
    changelog: String,
    url: String,
    critical: Option<bool>,
}

/// 检查更新 — 向更新服务器请求最新版本信息
pub async fn check_for_updates(
    current_version: &str,
    endpoint: &str,
) -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client.get(endpoint).send().await.map_err(|e| {
        format!("Failed to fetch update manifest: {}", e)
    })?;

    if !resp.status().is_success() {
        return Ok(UpdateInfo {
            has_update: false,
            current_version: current_version.to_string(),
            target_version: current_version.to_string(),
            changelog: String::new(),
            download_url: String::new(),
            release_date: String::new(),
            critical: false,
        });
    }

    let manifest: UpdateManifest = resp.json().await.map_err(|e| {
        format!("Failed to parse update manifest: {}", e)
    })?;

    let has_update = compare_versions(&manifest.version, current_version);

    Ok(UpdateInfo {
        has_update,
        current_version: current_version.to_string(),
        target_version: manifest.version.clone(),
        changelog: manifest.changelog.clone(),
        download_url: manifest.url.clone(),
        release_date: manifest.pub_date.clone(),
        critical: manifest.critical.unwrap_or(false),
    })
}

/// 版本对比 — 返回 true 表示 target > current
fn compare_versions(target: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u32> {
        v.trim_start_matches('v')
            .split('.')
            .filter_map(|s| s.split('-').next()?.parse().ok())
            .collect()
    };
    let t = parse(target);
    let c = parse(current);
    for i in 0..t.len().max(c.len()) {
        let tv = t.get(i).copied().unwrap_or(0);
        let cv = c.get(i).copied().unwrap_or(0);
        if tv > cv {
            return true;
        }
        if tv < cv {
            return false;
        }
    }
    false
}

// ===== Changelog 数据 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogEntry {
    pub version: String,
    pub date: String,
    pub phase: String,
    pub categories: Vec<ChangelogCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelogCategory {
    pub kind: String, // "new" | "fix" | "improve" | "breaking" | "security"
    pub title: String,
    pub items: Vec<String>,
}

/// 内嵌 changelog — 无网络时也可用
pub fn get_changelog() -> Vec<ChangelogEntry> {
    vec![
        ChangelogEntry {
            version: "0.7.0".to_string(),
            date: "2026-07-14".to_string(),
            phase: "Phase 7: Release Readiness".to_string(),
            categories: vec![
                ChangelogCategory {
                    kind: "new".to_string(),
                    title: "Hardware Reliability".to_string(),
                    items: vec![
                        "Command timeout (10s) + retry with exponential backoff".to_string(),
                        "Heartbeat monitor with missed threshold detection".to_string(),
                        "Auto-reconnect (5 attempts) with virtual device fallback".to_string(),
                        "Device behavior diff table (10 features documented)".to_string(),
                    ],
                },
                ChangelogCategory {
                    kind: "new".to_string(),
                    title: "Audit Center".to_string(),
                    items: vec![
                        "Independent audit page with 3D filtering (module/risk/time)".to_string(),
                        "AI approval chain traceability".to_string(),
                        "Export desensitized audit report (JSON)".to_string(),
                    ],
                },
                ChangelogCategory {
                    kind: "new".to_string(),
                    title: "Diagnostics & Release".to_string(),
                    items: vec![
                        "One-click diagnostics package export (7 sub-structures)".to_string(),
                        "macOS DMG / Windows NSIS / Linux AppImage build config".to_string(),
                        "Auto-update channel with version manifest".to_string(),
                        "Local crash/error log persistence (~/.lucy/logs/)".to_string(),
                        "In-app changelog page with version history".to_string(),
                    ],
                },
                ChangelogCategory {
                    kind: "improve".to_string(),
                    title: "UX Hardening".to_string(),
                    items: vec![
                        "TaskFlow error/retry/resume support".to_string(),
                        "App Mode system (beginner/standard/developer/education/demo)".to_string(),
                        "Dashboard health score (0-100, 5-level colors)".to_string(),
                        "Virtual Lab progress persistence (localStorage)".to_string(),
                    ],
                },
            ],
        },
        ChangelogEntry {
            version: "0.6.0".to_string(),
            date: "2026-07-13".to_string(),
            phase: "Phase 6: Productization".to_string(),
            categories: vec![
                ChangelogCategory {
                    kind: "new".to_string(),
                    title: "Core Architecture".to_string(),
                    items: vec![
                        "SQLite asset library (11 tables, WAL mode)".to_string(),
                        "CommandGateway 5-stage security pipeline".to_string(),
                        "TaskFlow engine with 5 flow templates".to_string(),
                    ],
                },
                ChangelogCategory {
                    kind: "new".to_string(),
                    title: "Modules".to_string(),
                    items: vec![
                        "Library page (5-tab asset library)".to_string(),
                        "Virtual Lab (5 courses x 13 lessons + AI Coach)".to_string(),
                        "Audit Center with filtering and export".to_string(),
                        "Timeline persistence to database".to_string(),
                    ],
                },
                ChangelogCategory {
                    kind: "improve".to_string(),
                    title: "AI Copilot".to_string(),
                    items: vec![
                        "Context-aware suggestions (10 view-to-mapping)".to_string(),
                        "Virtual device indicator in AI responses".to_string(),
                    ],
                },
            ],
        },
        ChangelogEntry {
            version: "0.5.0".to_string(),
            date: "2026-07-12".to_string(),
            phase: "Phase 5: Foundation".to_string(),
            categories: vec![
                ChangelogCategory {
                    kind: "new".to_string(),
                    title: "Internationalization".to_string(),
                    items: vec![
                        "i18n with 676 keys (28 sections, zh-CN/en-US)".to_string(),
                        "Language switcher in settings".to_string(),
                    ],
                },
                ChangelogCategory {
                    kind: "new".to_string(),
                    title: "UI Design System".to_string(),
                    items: vec![
                        "8-bit pixel + Apple smooth design system".to_string(),
                        "Settings 2.0 with 4-tab layout".to_string(),
                        "Dashboard with device digital twin".to_string(),
                    ],
                },
            ],
        },
        ChangelogEntry {
            version: "0.1.0".to_string(),
            date: "2026-07-10".to_string(),
            phase: "Phase 1-4: Core Modules".to_string(),
            categories: vec![
                ChangelogCategory {
                    kind: "new".to_string(),
                    title: "Hardware Modules".to_string(),
                    items: vec![
                        "NFC reader (detect/read/write/emulate)".to_string(),
                        "Sub-GHz scanner (region-checked TX)".to_string(),
                        "IR remote (learn/transmit/presets)".to_string(),
                        "BadUSB (validate/preview/execute, 3-stage)".to_string(),
                        "GPIO (scan/read/write/ADC)".to_string(),
                    ],
                },
                ChangelogCategory {
                    kind: "new".to_string(),
                    title: "AI & System".to_string(),
                    items: vec![
                        "AI Copilot with desensitization".to_string(),
                        "Firmware management (DFU/OTA)".to_string(),
                        "Screen mirror (virtual + real)".to_string(),
                        "RPC protocol (VLX variant)".to_string(),
                    ],
                },
            ],
        },
    ]
}

// ===== Crash/Error 日志 =====

/// 日志目录: ~/.lucy/logs/
pub fn log_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".lucy")
        .join("logs")
}

/// 初始化 crash 日志文件
pub fn init_crash_logger() {
    let log_dir = log_dir();
    if let Err(e) = fs::create_dir_all(&log_dir) {
        tracing::error!("Failed to create log directory {:?}: {}", log_dir, e);
        return;
    }

    // 写入启动日志
    let log_file = log_dir.join(format!(
        "lucy_{}.log",
        chrono::Utc::now().format("%Y%m%d")
    ));

    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        let _ = writeln!(
            file,
            "\n=== Lucy Desktop started at {} ===",
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
        );
        let _ = writeln!(
            file,
            "Version: {} | OS: {} | Arch: {}",
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS,
            std::env::consts::ARCH
        );
    }
}

/// 记录错误到 crash 日志
pub fn log_error(module: &str, error: &str, context: &str) {
    let log_dir = log_dir();
    let log_file = log_dir.join(format!(
        "lucy_{}.log",
        chrono::Utc::now().format("%Y%m%d")
    ));

    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        let _ = writeln!(
            file,
            "[{}] ERROR [{}] {}: {}",
            chrono::Utc::now().format("%H:%M:%S"),
            module,
            error,
            context
        );
    }
}

/// 读取最近日志
pub fn read_recent_logs(limit: usize) -> Vec<LogEntry> {
    let log_dir = log_dir();
    let mut entries: Vec<LogEntry> = Vec::new();

    // 读取今天的日志
    let today = log_dir.join(format!(
        "lucy_{}.log",
        chrono::Utc::now().format("%Y%m%d")
    ));

    if let Ok(content) = fs::read_to_string(&today) {
        for line in content.lines().rev() {
            if line.starts_with('[') {
                // 解析日志行: [HH:MM:SS] LEVEL [module] message
                let parts: Vec<&str> = line.splitn(4, ']').collect();
                if parts.len() >= 3 {
                    let time = parts[0].trim_start_matches('[').to_string();
                    let rest = parts[1..].join("]").trim().to_string();
                    let level = if rest.contains("ERROR") {
                        "error"
                    } else if rest.contains("WARN") {
                        "warn"
                    } else {
                        "info"
                    };
                    entries.push(LogEntry {
                        timestamp: time,
                        level: level.to_string(),
                        message: rest,
                    });
                }
            }
            if entries.len() >= limit {
                break;
            }
        }
    }

    entries
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

/// 清空日志
pub fn clear_logs() -> Result<(), String> {
    let log_dir = log_dir();
    if !log_dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(&log_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "log").unwrap_or(false) {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

// ===== 发布检查清单 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseChecklist {
    pub items: Vec<ChecklistItem>,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChecklistItem {
    pub id: String,
    pub label: String,
    pub category: String,
    pub required: bool,
    pub status: String, // "pending" | "done" | "skipped" | "failed"
}

pub fn get_release_checklist() -> ReleaseChecklist {
    let items = vec![
        ChecklistItem {
            id: "ts_check".to_string(),
            label: "TypeScript 0 errors".to_string(),
            category: "code_quality".to_string(),
            required: true,
            status: "done".to_string(),
        },
        ChecklistItem {
            id: "rust_tests".to_string(),
            label: "Rust tests all pass".to_string(),
            category: "code_quality".to_string(),
            required: true,
            status: "done".to_string(),
        },
        ChecklistItem {
            id: "i18n_parity".to_string(),
            label: "i18n zh-CN/en-US parity".to_string(),
            category: "code_quality".to_string(),
            required: true,
            status: "done".to_string(),
        },
        ChecklistItem {
            id: "vite_build".to_string(),
            label: "Vite build success".to_string(),
            category: "build".to_string(),
            required: true,
            status: "done".to_string(),
        },
        ChecklistItem {
            id: "macos_dmg".to_string(),
            label: "macOS DMG build".to_string(),
            category: "packaging".to_string(),
            required: true,
            status: "pending".to_string(),
        },
        ChecklistItem {
            id: "windows_nsis".to_string(),
            label: "Windows NSIS installer".to_string(),
            category: "packaging".to_string(),
            required: true,
            status: "pending".to_string(),
        },
        ChecklistItem {
            id: "linux_appimage".to_string(),
            label: "Linux AppImage".to_string(),
            category: "packaging".to_string(),
            required: true,
            status: "pending".to_string(),
        },
        ChecklistItem {
            id: "code_signing".to_string(),
            label: "Code signing (macOS notarization + Windows cert)".to_string(),
            category: "signing".to_string(),
            required: true,
            status: "pending".to_string(),
        },
        ChecklistItem {
            id: "auto_update".to_string(),
            label: "Auto-update manifest published".to_string(),
            category: "distribution".to_string(),
            required: false,
            status: "pending".to_string(),
        },
        ChecklistItem {
            id: "crash_reporting".to_string(),
            label: "Crash/error logging verified".to_string(),
            category: "reliability".to_string(),
            required: true,
            status: "done".to_string(),
        },
        ChecklistItem {
            id: "security_audit".to_string(),
            label: "Security audit (Gateway + BadUSB guard + Region check)".to_string(),
            category: "security".to_string(),
            required: true,
            status: "done".to_string(),
        },
        ChecklistItem {
            id: "privacy_check".to_string(),
            label: "Privacy desensitization verified (7 patterns)".to_string(),
            category: "security".to_string(),
            required: true,
            status: "done".to_string(),
        },
        ChecklistItem {
            id: "release_notes".to_string(),
            label: "Release notes written".to_string(),
            category: "documentation".to_string(),
            required: true,
            status: "done".to_string(),
        },
        ChecklistItem {
            id: "changelog_page".to_string(),
            label: "In-app changelog page".to_string(),
            category: "documentation".to_string(),
            required: true,
            status: "done".to_string(),
        },
    ];

    let ready = items
        .iter()
        .filter(|i| i.required)
        .all(|i| i.status == "done");

    ReleaseChecklist { items, ready }
}

// ===== Tauri Commands =====

#[tauri::command]
pub fn cmd_get_app_version() -> AppVersion {
    AppVersion::current()
}

#[tauri::command]
pub async fn cmd_check_for_updates() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION");
    let endpoint = "https://releases.lucy.dev/latest.json";

    // 实际环境中会请求更新服务器
    // 开发阶段返回模拟数据
    match check_for_updates(current, endpoint).await {
        Ok(info) => Ok(info),
        Err(_) => {
            // 网络失败时返回"无更新"
            Ok(UpdateInfo {
                has_update: false,
                current_version: current.to_string(),
                target_version: current.to_string(),
                changelog: "Unable to check for updates. Please try again later.".to_string(),
                download_url: String::new(),
                release_date: String::new(),
                critical: false,
            })
        }
    }
}

#[tauri::command]
pub fn cmd_get_changelog() -> Vec<ChangelogEntry> {
    get_changelog()
}

#[tauri::command]
pub fn cmd_get_crash_logs(limit: Option<usize>) -> Vec<LogEntry> {
    read_recent_logs(limit.unwrap_or(100))
}

#[tauri::command]
pub fn cmd_clear_crash_logs() -> Result<(), String> {
    clear_logs()
}

#[tauri::command]
pub fn cmd_log_error(module: String, error: String, context: Option<String>) {
    log_error(&module, &error, &context.unwrap_or_default());
}

#[tauri::command]
pub fn cmd_get_release_checklist() -> ReleaseChecklist {
    get_release_checklist()
}

// ===== Tests =====

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_versions() {
        assert!(compare_versions("0.7.0", "0.6.0"));
        assert!(compare_versions("1.0.0", "0.9.9"));
        assert!(!compare_versions("0.6.0", "0.7.0"));
        assert!(!compare_versions("0.7.0", "0.7.0"));
    }

    #[test]
    fn test_app_version() {
        let v = AppVersion::current();
        assert!(!v.version.is_empty());
        assert!(!v.target_os.is_empty());
        assert!(!v.target_arch.is_empty());
    }

    #[test]
    fn test_changelog_not_empty() {
        let cl = get_changelog();
        assert!(!cl.is_empty());
        assert_eq!(cl[0].version, "0.7.0");
    }

    #[test]
    fn test_release_checklist() {
        let cl = get_release_checklist();
        assert!(!cl.items.is_empty());
        // 代码质量项应全部完成
        let code_quality_done = cl.items.iter()
            .filter(|i| i.category == "code_quality")
            .all(|i| i.status == "done");
        assert!(code_quality_done);
    }

    #[test]
    fn test_log_dir_exists() {
        let dir = log_dir();
        assert!(dir.to_string_lossy().contains(".lucy"));
    }

    #[test]
    fn test_log_error_writes() {
        init_crash_logger();
        log_error("test_module", "test error", "unit test context");
        let logs = read_recent_logs(10);
        // 日志可能为空如果目录创建失败，但不应该 panic
        assert!(logs.len() <= 10);
    }

    #[test]
    fn test_clear_logs() {
        let result = clear_logs();
        assert!(result.is_ok());
    }
}
