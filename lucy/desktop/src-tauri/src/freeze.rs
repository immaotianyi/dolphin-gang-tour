/**
 * Lucy Desktop — RC1 Release Freeze Module
 *
 * 冻结 v0.7.0-rc1 功能范围:
 *   1. Tauri 命令清单 (100 个，冻结)
 *   2. i18n 键数 (1000 个，冻结)
 *   3. 数据库 schema (11 张表，冻结)
 *   4. 高风险命令标记
 *   5. Mock handler 安全审计
 *   6. 已知问题列表
 *   7. 模式行为差异表
 */

use serde::{Deserialize, Serialize};

// ===== 冻结快照 =====

#[derive(Debug, Clone, Serialize)]
pub struct FreezeSnapshot {
    pub version: &'static str,
    pub freeze_date: &'static str,
    pub tauri_command_count: usize,
    pub i18n_key_count: usize,
    pub i18n_section_count: usize,
    pub database_table_count: usize,
    pub rust_test_count: usize,
    pub frontend_file_count: usize,
    pub rust_file_count: usize,
    pub bundle_size_kb: f64,
    pub gzip_size_kb: f64,
    pub status: &'static str,
}

impl Default for FreezeSnapshot {
    fn default() -> Self {
        Self {
            version: "0.7.0-rc1",
            freeze_date: "2026-07-14",
            tauri_command_count: 100,
            i18n_key_count: 1000,
            i18n_section_count: 41,
            database_table_count: 11,
            rust_test_count: 159,
            frontend_file_count: 44,
            rust_file_count: 36,
            bundle_size_kb: 447.36,
            gzip_size_kb: 130.74,
            status: "frozen",
        }
    }
}

// ===== 冻结的 Tauri 命令清单 =====

#[derive(Debug, Clone, Serialize)]
pub struct FrozenCommand {
    pub name: &'static str,
    pub module: &'static str,
    pub risk: &'static str,
    pub ai_allowed: bool,
    pub requires_confirm: bool,
    pub requires_region_check: bool,
    pub requires_badusb_guard: bool,
    pub audit_logged: bool,
}

/// 返回全部 100 个冻结的 Tauri 命令及其风险等级
pub fn get_frozen_commands() -> Vec<FrozenCommand> {
    vec![
        // --- Device (5) ---
        FrozenCommand { name: "device_scan", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "device_connect", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "device_disconnect", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "device_get_info", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "device_refresh_info", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- NFC (6) ---
        FrozenCommand { name: "nfc_detect", module: "nfc", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "nfc_read_uid", module: "nfc", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "nfc_read_card", module: "nfc", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "nfc_write_block", module: "nfc", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "nfc_emulate", module: "nfc", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "nfc_list_saved", module: "nfc", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- SubGHz (8) ---
        FrozenCommand { name: "subghz_scan", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "subghz_rx", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "subghz_tx", module: "subghz", risk: "dangerous", ai_allowed: false, requires_confirm: true, requires_region_check: true, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "subghz_save", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "subghz_list_saved", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "subghz_replay", module: "subghz", risk: "dangerous", ai_allowed: false, requires_confirm: true, requires_region_check: true, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "subghz_identify", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "subghz_get_region", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- SubGHz region (3 more) ---
        FrozenCommand { name: "subghz_set_region", module: "subghz", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "subghz_check_frequency", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: true, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "subghz_list_regions", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- GPIO (6) ---
        FrozenCommand { name: "gpio_scan", module: "gpio", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "gpio_set_direction", module: "gpio", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "gpio_set_value", module: "gpio", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "gpio_read", module: "gpio", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "gpio_read_adc", module: "gpio", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "gpio_capture", module: "gpio", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- IR (6) ---
        FrozenCommand { name: "ir_learn", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "ir_transmit", module: "ir", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "ir_list_protocols", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "ir_list_saved", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "ir_save", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "ir_get_presets", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- BadUSB (6) ---
        FrozenCommand { name: "badusb_validate", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: true, audit_logged: false },
        FrozenCommand { name: "badusb_preview", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: true, audit_logged: false },
        FrozenCommand { name: "badusb_execute", module: "badusb", risk: "dangerous", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: true, audit_logged: true },
        FrozenCommand { name: "badusb_list_scripts", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "badusb_get_script", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "badusb_save_script", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        // --- Screen (1) ---
        FrozenCommand { name: "screen_get_frame", module: "screen", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- AI (4) ---
        FrozenCommand { name: "ai_send_message", module: "ai", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "ai_clear_history", module: "ai", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "ai_check_sensitive", module: "ai", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "ai_set_provider", module: "ai", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        // --- System (3) ---
        FrozenCommand { name: "get_app_state", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "close_window", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "minimize_window", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- Config (5) ---
        FrozenCommand { name: "config_get", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "config_save_ai", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "config_save_appearance", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "config_save_device", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "config_save_general", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- Firmware (3) ---
        FrozenCommand { name: "firmware_get_current", module: "firmware", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "firmware_check_update", module: "firmware", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "firmware_verify_manifest", module: "firmware", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- Storage (5) ---
        FrozenCommand { name: "storage_list", module: "storage", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "storage_read", module: "storage", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "storage_write", module: "storage", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "storage_delete", module: "storage", risk: "dangerous", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "storage_info", module: "storage", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- Logs (3) ---
        FrozenCommand { name: "log_get_recent", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "log_clear", module: "system", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "log_export", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        // --- Policy (1) ---
        FrozenCommand { name: "policy_list", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- Device Health (1) ---
        FrozenCommand { name: "device_health", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- Database (19) ---
        FrozenCommand { name: "cmd_nfc_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "cmd_nfc_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_nfc_delete", module: "database", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "cmd_subghz_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "cmd_subghz_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_ir_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "cmd_ir_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_badusb_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "cmd_badusb_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_badusb_increment_exec", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "cmd_audit_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_audit_count", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_audit_clear", module: "database", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "cmd_ai_conv_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_ai_conv_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_firmware_history_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_asset_stats", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_timeline_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_timeline_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        // --- Timeline clear (1) ---
        FrozenCommand { name: "cmd_timeline_clear", module: "database", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        // --- Gateway (3) ---
        FrozenCommand { name: "cmd_gateway_classify", module: "gateway", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_gateway_check", module: "gateway", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_gateway_audit_write", module: "gateway", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        // --- Reliability (4) ---
        FrozenCommand { name: "cmd_device_behavior_diffs", module: "reliability", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_command_stats", module: "reliability", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_command_stats_reset", module: "reliability", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "cmd_export_diagnostics", module: "reliability", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        // --- Release (7) ---
        FrozenCommand { name: "cmd_get_app_version", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_check_for_updates", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_get_changelog", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_get_crash_logs", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_clear_crash_logs", module: "release", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
        FrozenCommand { name: "cmd_log_error", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
        FrozenCommand { name: "cmd_get_release_checklist", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
    ]
}

// ===== 高风险命令摘要 =====

#[derive(Debug, Clone, Serialize)]
pub struct HighRiskSummary {
    pub dangerous_count: usize,
    pub caution_count: usize,
    pub safe_count: usize,
    pub blocked_count: usize,
    pub ai_blocked_count: usize,
    pub audit_logged_count: usize,
    pub region_checked_count: usize,
    pub badusb_guarded_count: usize,
    pub dangerous_commands: Vec<&'static str>,
    pub caution_commands: Vec<&'static str>,
}

pub fn get_high_risk_summary() -> HighRiskSummary {
    let cmds = get_frozen_commands();
    let dangerous: Vec<&str> = cmds.iter()
        .filter(|c| c.risk == "dangerous")
        .map(|c| c.name)
        .collect();
    let caution: Vec<&str> = cmds.iter()
        .filter(|c| c.risk == "caution")
        .map(|c| c.name)
        .collect();

    HighRiskSummary {
        dangerous_count: dangerous.len(),
        caution_count: caution.len(),
        safe_count: cmds.iter().filter(|c| c.risk == "safe").count(),
        blocked_count: cmds.iter().filter(|c| c.risk == "blocked").count(),
        ai_blocked_count: cmds.iter().filter(|c| !c.ai_allowed).count(),
        audit_logged_count: cmds.iter().filter(|c| c.audit_logged).count(),
        region_checked_count: cmds.iter().filter(|c| c.requires_region_check).count(),
        badusb_guarded_count: cmds.iter().filter(|c| c.requires_badusb_guard).count(),
        dangerous_commands: dangerous,
        caution_commands: caution,
    }
}

// ===== 已知问题列表 =====

#[derive(Debug, Clone, Serialize)]
pub struct KnownIssue {
    pub id: &'static str,
    pub title: &'static str,
    pub severity: &'static str,
    pub category: &'static str,
    pub description: &'static str,
    pub workaround: &'static str,
    pub status: &'static str,
}

pub fn get_known_issues() -> Vec<KnownIssue> {
    vec![
        KnownIssue {
            id: "RC1-001",
            title: "macOS DMG build not yet produced",
            severity: "high",
            category: "packaging",
            description: "tauri.conf.json has DMG target configured but no actual build has been run. Requires macOS environment + Apple Developer certificate for notarization.",
            workaround: "Use `npm run dev` for development. Production DMG requires CI/CD pipeline.",
            status: "open",
        },
        KnownIssue {
            id: "RC1-002",
            title: "Windows NSIS installer not yet produced",
            severity: "high",
            category: "packaging",
            description: "NSIS config exists (perMachine, en-US/zh-CN) but no build has been run. Requires Windows environment + EV code signing certificate.",
            workaround: "Use `npm run dev` for development. Production NSIS requires Windows CI.",
            status: "open",
        },
        KnownIssue {
            id: "RC1-003",
            title: "Linux AppImage not yet produced",
            severity: "high",
            category: "packaging",
            description: "AppImage + deb config exists but no build has been run. Requires Linux environment.",
            workaround: "Use `npm run dev` for development. Production AppImage requires Linux CI.",
            status: "open",
        },
        KnownIssue {
            id: "RC1-004",
            title: "Code signing not configured",
            severity: "high",
            category: "signing",
            description: "signingIdentity is null in tauri.conf.json. No signing certificates have been obtained.",
            workaround: "Unsigned builds work locally but will trigger OS security warnings on user machines.",
            status: "open",
        },
        KnownIssue {
            id: "RC1-005",
            title: "Update server manifest not deployed",
            severity: "medium",
            category: "distribution",
            description: "Endpoint configured as https://releases.lucy.dev/latest.json but no server exists yet. Update check returns 'no update' in dev mode.",
            workaround: "Manual download from GitHub releases until update server is deployed.",
            status: "open",
        },
        KnownIssue {
            id: "RC1-006",
            title: "No real hardware regression tests",
            severity: "high",
            category: "testing",
            description: "All 159 Rust tests and frontend mocks pass, but no real hardware (ESP32-S3 + CC1101 + ST25R3916) smoke tests have been recorded.",
            workaround: "Virtual Lab and mock handlers provide functional coverage. Real hardware tests are RC2 scope.",
            status: "open",
        },
        KnownIssue {
            id: "RC1-007",
            title: "App Mode system has no UI yet",
            severity: "medium",
            category: "ux",
            description: "AppMode type exists in uiStore (beginner/standard/developer/education/demo) but no UI switcher or mode-based feature visibility control is implemented.",
            workaround: "Mode defaults to 'standard'. Developer mode toggle exists in Settings.",
            status: "acknowledged",
        },
        KnownIssue {
            id: "RC1-008",
            title: "Database migration version not tracked",
            severity: "low",
            category: "data",
            description: "Database uses CREATE TABLE IF NOT EXISTS pattern but has no migration version table. Future schema changes need proper versioning.",
            workaround: "Current schema is frozen for RC1. Migration system is a P8 candidate.",
            status: "acknowledged",
        },
        KnownIssue {
            id: "RC1-009",
            title: "Crash logs only tested in dev environment",
            severity: "medium",
            category: "reliability",
            description: "init_crash_logger() and log_error() work in dev but have not been verified in packaged app environment (~/.lucy/logs/ may have different permissions).",
            workaround: "Diagnostics export includes recent_errors field as fallback.",
            status: "open",
        },
        KnownIssue {
            id: "RC1-010",
            title: "Mock handlers return hardcoded data in browser mode",
            severity: "low",
            category: "testing",
            description: "When running outside Tauri (browser dev mode), all 100 commands return mock data. This is by design but could confuse testers if they forget they're in browser mode.",
            workaround: "Virtual device indicator badge shown on Dashboard. Tauri environment detection via isTauri().",
            status: "acknowledged",
        },
    ]
}

// ===== Mock Handler 安全审计 =====

#[derive(Debug, Clone, Serialize)]
pub struct MockAuditEntry {
    pub command: &'static str,
    pub module: &'static str,
    pub returns_sensitive_data: bool,
    pub simulates_dangerous_action: bool,
    pub safe_for_real_mode: bool,
    pub notes: &'static str,
}

pub fn get_mock_audit() -> Vec<MockAuditEntry> {
    vec![
        MockAuditEntry { command: "subghz_tx", module: "subghz", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without RF output. Real mode enforces region check + audit." },
        MockAuditEntry { command: "badusb_execute", module: "badusb", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without HID injection. Real mode requires 3-stage (validate/preview/confirm)." },
        MockAuditEntry { command: "nfc_write_block", module: "nfc", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without writing. Real mode requires confirm + audit." },
        MockAuditEntry { command: "storage_delete", module: "storage", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without deleting. Real mode requires confirm + audit + recursive delete." },
        MockAuditEntry { command: "storage_write", module: "storage", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without writing. Real mode requires confirm + audit." },
        MockAuditEntry { command: "ai_send_message", module: "ai", returns_sensitive_data: false, simulates_dangerous_action: false, safe_for_real_mode: true, notes: "Mock generates canned responses. Real mode uses configured AI provider with desensitization." },
        MockAuditEntry { command: "config_get", module: "config", returns_sensitive_data: true, simulates_dangerous_action: false, safe_for_real_mode: true, notes: "Mock returns empty API key. Real mode reads from config file. API key never logged." },
        MockAuditEntry { command: "cmd_export_diagnostics", module: "reliability", returns_sensitive_data: false, simulates_dangerous_action: false, safe_for_real_mode: true, notes: "Mock returns sanitized data. Real mode applies 7-pattern desensitization." },
        MockAuditEntry { command: "gpio_set_value", module: "gpio", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without pin write. Real mode requires confirm + audit." },
        MockAuditEntry { command: "ir_transmit", module: "ir", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without IR output. Real mode requires confirm + audit." },
    ]
}

// ===== 模式行为差异表 =====

#[derive(Debug, Clone, Serialize)]
pub struct ModeBehavior {
    pub mode: &'static str,
    pub visible_modules: Vec<&'static str>,
    pub dangerous_commands_visible: bool,
    pub developer_tools_visible: bool,
    pub audit_export_enabled: bool,
    pub virtual_device_default: bool,
    pub ai_copilot_enabled: bool,
    pub auto_reconnect: bool,
    pub region_override: bool,
    pub notes: &'static str,
}

pub fn get_mode_behaviors() -> Vec<ModeBehavior> {
    vec![
        ModeBehavior {
            mode: "beginner",
            visible_modules: vec!["dashboard", "nfc", "ir", "virtualLab", "library", "changelog"],
            dangerous_commands_visible: false,
            developer_tools_visible: false,
            audit_export_enabled: false,
            virtual_device_default: true,
            ai_copilot_enabled: true,
            auto_reconnect: true,
            region_override: false,
            notes: "Simplified interface. No SubGHz TX, BadUSB, GPIO, or Firmware. Virtual device by default.",
        },
        ModeBehavior {
            mode: "standard",
            visible_modules: vec!["dashboard", "nfc", "subghz", "ir", "badusb", "gpio", "screen", "ai", "firmware", "library", "virtualLab", "audit", "changelog", "settings"],
            dangerous_commands_visible: true,
            developer_tools_visible: false,
            audit_export_enabled: true,
            virtual_device_default: false,
            ai_copilot_enabled: true,
            auto_reconnect: true,
            region_override: false,
            notes: "Full module access. Dangerous commands require confirmation. Developer mode off.",
        },
        ModeBehavior {
            mode: "developer",
            visible_modules: vec!["dashboard", "nfc", "subghz", "ir", "badusb", "gpio", "screen", "ai", "firmware", "library", "virtualLab", "audit", "changelog", "settings"],
            dangerous_commands_visible: true,
            developer_tools_visible: true,
            audit_export_enabled: true,
            virtual_device_default: false,
            ai_copilot_enabled: true,
            auto_reconnect: true,
            region_override: true,
            notes: "All modules + dev tools. Region override available. Must be explicitly enabled in Settings.",
        },
        ModeBehavior {
            mode: "education",
            visible_modules: vec!["dashboard", "nfc", "subghz", "ir", "badusb", "gpio", "screen", "ai", "library", "virtualLab", "changelog"],
            dangerous_commands_visible: true,
            developer_tools_visible: false,
            audit_export_enabled: true,
            virtual_device_default: true,
            ai_copilot_enabled: true,
            auto_reconnect: true,
            region_override: false,
            notes: "Classroom mode. Virtual device by default. BadUSB requires 3-stage. No firmware flashing. AI Coach active.",
        },
        ModeBehavior {
            mode: "demo",
            visible_modules: vec!["dashboard", "nfc", "subghz", "ir", "badusb", "gpio", "screen", "ai", "library", "virtualLab", "audit", "changelog"],
            dangerous_commands_visible: false,
            developer_tools_visible: false,
            audit_export_enabled: true,
            virtual_device_default: true,
            ai_copilot_enabled: true,
            auto_reconnect: false,
            region_override: false,
            notes: "Read-only demo. All dangerous commands hidden. Virtual device only. No firmware/settings. For exhibitions and presentations.",
        },
    ]
}

// ===== 数据库 Schema 快照 =====

#[derive(Debug, Clone, Serialize)]
pub struct DatabaseSchemaSnapshot {
    pub version: &'static str,
    pub table_count: usize,
    pub tables: Vec<TableInfo>,
    pub migration_strategy: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct TableInfo {
    pub name: &'static str,
    pub column_count: usize,
    pub has_timestamps: bool,
    pub has_foreign_keys: bool,
}

pub fn get_database_schema_snapshot() -> DatabaseSchemaSnapshot {
    DatabaseSchemaSnapshot {
        version: "rc1-frozen",
        table_count: 11,
        migration_strategy: "CREATE TABLE IF NOT EXISTS (idempotent, no version table)",
        tables: vec![
            TableInfo { name: "nfc_cards", column_count: 11, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "subghz_signals", column_count: 9, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "ir_remotes", column_count: 9, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "badusb_scripts", column_count: 10, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "gpio_sessions", column_count: 7, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "firmware_history", column_count: 8, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "ai_conversations", column_count: 6, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "audit_logs", column_count: 8, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "device_profiles", column_count: 8, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "user_collections", column_count: 7, has_timestamps: true, has_foreign_keys: false },
            TableInfo { name: "timeline_events", column_count: 6, has_timestamps: true, has_foreign_keys: false },
        ],
    }
}

// ===== Tauri Commands =====

#[tauri::command]
pub fn cmd_get_freeze_snapshot() -> FreezeSnapshot {
    FreezeSnapshot::default()
}

#[tauri::command]
pub fn cmd_get_frozen_commands() -> Vec<FrozenCommand> {
    get_frozen_commands()
}

#[tauri::command]
pub fn cmd_get_high_risk_summary() -> HighRiskSummary {
    get_high_risk_summary()
}

#[tauri::command]
pub fn cmd_get_known_issues() -> Vec<KnownIssue> {
    get_known_issues()
}

#[tauri::command]
pub fn cmd_get_mock_audit() -> Vec<MockAuditEntry> {
    get_mock_audit()
}

#[tauri::command]
pub fn cmd_get_mode_behaviors() -> Vec<ModeBehavior> {
    get_mode_behaviors()
}

#[tauri::command]
pub fn cmd_get_database_schema_snapshot() -> DatabaseSchemaSnapshot {
    get_database_schema_snapshot()
}

// ===== Tests =====

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frozen_command_count() {
        let cmds = get_frozen_commands();
        assert_eq!(cmds.len(), 100, "Must have exactly 100 frozen commands");
    }

    #[test]
    fn test_no_blocked_commands() {
        // No command should be "blocked" by default — blocked is runtime rejection
        let cmds = get_frozen_commands();
        let blocked = cmds.iter().filter(|c| c.risk == "blocked").count();
        assert_eq!(blocked, 0, "No command should be blocked by default");
    }

    #[test]
    fn test_dangerous_commands_require_confirm() {
        let cmds = get_frozen_commands();
        for c in cmds.iter().filter(|c| c.risk == "dangerous") {
            assert!(c.requires_confirm, "Dangerous command {} must require confirm", c.name);
            assert!(!c.ai_allowed, "Dangerous command {} must not be AI-allowed", c.name);
            assert!(c.audit_logged, "Dangerous command {} must be audit-logged", c.name);
        }
    }

    #[test]
    fn test_ai_never_executes_dangerous() {
        let cmds = get_frozen_commands();
        for c in cmds.iter().filter(|c| c.risk == "dangerous" || c.risk == "caution") {
            assert!(!c.ai_allowed, "AI must not be allowed to execute {}: {}", c.name, c.risk);
        }
    }

    #[test]
    fn test_subghz_tx_has_region_check() {
        let cmds = get_frozen_commands();
        let tx = cmds.iter().find(|c| c.name == "subghz_tx");
        assert!(tx.is_some());
        assert!(tx.unwrap().requires_region_check, "subghz_tx must require region check");
    }

    #[test]
    fn test_badusb_execute_has_guard() {
        let cmds = get_frozen_commands();
        let exec = cmds.iter().find(|c| c.name == "badusb_execute");
        assert!(exec.is_some());
        assert!(exec.unwrap().requires_badusb_guard, "badusb_execute must require badusb guard");
    }

    #[test]
    fn test_known_issues_not_empty() {
        let issues = get_known_issues();
        assert!(!issues.is_empty());
        assert!(issues.iter().any(|i| i.id == "RC1-001"));
    }

    #[test]
    fn test_mock_audit_covers_dangerous() {
        let audit = get_mock_audit();
        assert!(audit.iter().any(|a| a.command == "subghz_tx"));
        assert!(audit.iter().any(|a| a.command == "badusb_execute"));
        // All mock handlers must be safe for real mode
        for a in &audit {
            assert!(a.safe_for_real_mode, "Mock {} must be safe for real mode", a.command);
        }
    }

    #[test]
    fn test_mode_behaviors_count() {
        let modes = get_mode_behaviors();
        assert_eq!(modes.len(), 5, "Must have 5 modes");
        assert!(modes.iter().any(|m| m.mode == "beginner"));
        assert!(modes.iter().any(|m| m.mode == "demo"));
    }

    #[test]
    fn test_demo_mode_no_dangerous() {
        let modes = get_mode_behaviors();
        let demo = modes.iter().find(|m| m.mode == "demo");
        assert!(demo.is_some());
        assert!(!demo.unwrap().dangerous_commands_visible, "Demo mode must hide dangerous commands");
        assert!(demo.unwrap().virtual_device_default, "Demo mode must default to virtual device");
    }

    #[test]
    fn test_database_schema_11_tables() {
        let schema = get_database_schema_snapshot();
        assert_eq!(schema.table_count, 11);
        assert_eq!(schema.tables.len(), 11);
    }

    #[test]
    fn test_freeze_snapshot_values() {
        let snap = FreezeSnapshot::default();
        assert_eq!(snap.version, "0.7.0-rc1");
        assert_eq!(snap.tauri_command_count, 100);
        assert_eq!(snap.i18n_key_count, 1000);
        assert_eq!(snap.status, "frozen");
    }
}
