/**
 * CommandPolicy — 命令风险分级与执行策略
 *
 * 每个 Tauri 命令声明其风险等级和 AI 调用权限:
 *   - Safe:     只读操作，AI 可直接调用（如 get_info, nfc_detect）
 *   - Caution:  写操作但低风险，需用户确认（如 nfc_write, ir_transmit）
 *   - Dangerous: 高风险操作，禁止 AI 自动调用，必须人工审批（如 badusb_execute, subghz_tx）
 *   - Blocked:  禁止 AI 调用（如 firmware flash, storage_delete 系统目录）
 *
 * 架构原则:
 *   AI 永远不能直接执行 Dangerous/Blocked 命令
 *   AI 的 <cmds> 建议必须经用户逐条批准
 *   所有执行记录写入审计日志
 */
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

/// 风险等级
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    /// 只读，无副作用，AI 可自动执行
    Safe = 0,
    /// 写操作但低风险，需单次确认
    Caution = 1,
    /// 高风险，必须人工确认，禁止 AI 自动执行
    Dangerous = 2,
    /// 完全禁止 AI 调用（固件刷写等不可逆操作）
    Blocked = 3,
}

impl RiskLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            RiskLevel::Safe => "safe",
            RiskLevel::Caution => "caution",
            RiskLevel::Dangerous => "dangerous",
            RiskLevel::Blocked => "blocked",
        }
    }

    #[allow(dead_code)]
    pub fn color(&self) -> &'static str {
        match self {
            RiskLevel::Safe => "#3fb950",
            RiskLevel::Caution => "#d29922",
            RiskLevel::Dangerous => "#f85149",
            RiskLevel::Blocked => "#da3633",
        }
    }

    pub fn label_zh(&self) -> &'static str {
        match self {
            RiskLevel::Safe => "安全",
            RiskLevel::Caution => "注意",
            RiskLevel::Dangerous => "危险",
            RiskLevel::Blocked => "禁止",
        }
    }
}

/// 单条命令策略
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandPolicy {
    pub command: String,
    pub module: String,
    pub risk: RiskLevel,
    pub ai_allowed: bool,
    pub requires_confirm: bool,
    pub description: String,
}

/// 待审批的 AI 建议命令
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct PendingCommand {
    pub id: String,
    pub module: String,
    pub action: String,
    pub args: serde_json::Value,
    pub raw: String,
    pub risk: RiskLevel,
    pub ai_reason: String,
    pub status: PendingStatus,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum PendingStatus {
    Pending,
    Approved,
    Rejected,
    Executed,
    Failed(String),
}

/// 审计日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AuditEntry {
    pub timestamp: u64,
    pub command: String,
    pub module: String,
    pub risk: RiskLevel,
    pub source: CommandSource,
    pub result: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum CommandSource {
    User,
    AiApproved,
    AutoConnect,
}

/// 全局策略表
static POLICY_TABLE: OnceLock<HashMap<&'static str, CommandPolicy>> = OnceLock::new();

fn build_policy_table() -> HashMap<&'static str, CommandPolicy> {
    let mut table = HashMap::new();

    // ─── 设备命令 ───
    let policies = vec![
        // 设备管理
        cmd("device_scan", "device", RiskLevel::Safe, true, false, "扫描可用设备"),
        cmd("device_connect", "device", RiskLevel::Caution, false, true, "连接设备"),
        cmd("device_disconnect", "device", RiskLevel::Caution, false, false, "断开设备"),
        cmd("device_get_info", "device", RiskLevel::Safe, true, false, "获取设备信息"),
        cmd("device_refresh_info", "device", RiskLevel::Safe, true, false, "刷新设备信息"),
        cmd("get_app_state", "device", RiskLevel::Safe, true, false, "获取应用状态"),
        cmd("close_window", "device", RiskLevel::Safe, false, false, "关闭窗口"),
        cmd("minimize_window", "device", RiskLevel::Safe, false, false, "最小化窗口"),

        // NFC — 只读安全，写/模拟需注意
        cmd("nfc_detect", "nfc", RiskLevel::Safe, true, false, "NFC 检测卡片"),
        cmd("nfc_read_uid", "nfc", RiskLevel::Safe, true, false, "读取 NFC UID"),
        cmd("nfc_read_card", "nfc", RiskLevel::Safe, true, false, "读取完整卡片数据"),
        cmd("nfc_write_block", "nfc", RiskLevel::Dangerous, false, true, "写入 NFC 数据块"),
        cmd("nfc_emulate", "nfc", RiskLevel::Dangerous, false, true, "NFC 卡片模拟"),
        cmd("nfc_list_saved", "nfc", RiskLevel::Safe, true, false, "列出已保存卡片"),

        // SubGHz — 接收安全，发射危险（需频段合规）
        cmd("subghz_scan", "subghz", RiskLevel::Safe, true, false, "SubGHz 频谱扫描"),
        cmd("subghz_rx", "subghz", RiskLevel::Safe, true, false, "SubGHz 接收信号"),
        cmd("subghz_tx", "subghz", RiskLevel::Dangerous, false, true, "SubGHz 发射信号"),
        cmd("subghz_save", "subghz", RiskLevel::Caution, true, false, "保存 SubGHz 信号"),
        cmd("subghz_list_saved", "subghz", RiskLevel::Safe, true, false, "列出已保存信号"),
        cmd("subghz_replay", "subghz", RiskLevel::Dangerous, false, true, "重放射频信号"),
        cmd("subghz_identify", "subghz", RiskLevel::Safe, true, false, "识别协议类型"),

        // GPIO — 读安全，写需注意
        cmd("gpio_scan", "gpio", RiskLevel::Safe, true, false, "GPIO 扫描"),
        cmd("gpio_set_direction", "gpio", RiskLevel::Caution, false, true, "设置 GPIO 方向"),
        cmd("gpio_set_value", "gpio", RiskLevel::Caution, false, true, "设置 GPIO 输出值"),
        cmd("gpio_read", "gpio", RiskLevel::Safe, true, false, "读取 GPIO 值"),
        cmd("gpio_read_adc", "gpio", RiskLevel::Safe, true, false, "读取 ADC 值"),
        cmd("gpio_capture", "gpio", RiskLevel::Safe, true, false, "逻辑分析仪捕获"),

        // IR — 接收安全，发射注意（无法律风险但可能误操作设备）
        cmd("ir_learn", "ir", RiskLevel::Safe, true, false, "IR 学习"),
        cmd("ir_transmit", "ir", RiskLevel::Caution, true, true, "IR 发射"),
        cmd("ir_list_protocols", "ir", RiskLevel::Safe, true, false, "列出 IR 协议"),
        cmd("ir_list_saved", "ir", RiskLevel::Safe, true, false, "列出已保存 IR"),
        cmd("ir_save", "ir", RiskLevel::Caution, true, false, "保存 IR 信号"),
        cmd("ir_get_presets", "ir", RiskLevel::Safe, true, false, "获取 IR 预设"),

        // BadUSB — 最高风险
        cmd("badusb_validate", "badusb", RiskLevel::Safe, true, false, "BadUSB 脚本审查"),
        cmd("badusb_execute", "badusb", RiskLevel::Blocked, false, true, "执行 BadUSB 脚本（禁止 AI 调用）"),
        cmd("badusb_list_scripts", "badusb", RiskLevel::Safe, true, false, "列出脚本"),
        cmd("badusb_get_script", "badusb", RiskLevel::Safe, true, false, "获取脚本内容"),
        cmd("badusb_save_script", "badusb", RiskLevel::Caution, false, false, "保存脚本"),

        // 屏幕
        cmd("screen_get_frame", "screen", RiskLevel::Safe, true, false, "获取屏幕帧"),

        // AI — 对话安全，配置需注意
        cmd("ai_send_message", "ai", RiskLevel::Safe, false, false, "AI 对话"),
        cmd("ai_clear_history", "ai", RiskLevel::Safe, false, false, "清除对话历史"),
        cmd("ai_check_sensitive", "ai", RiskLevel::Safe, true, false, "检查敏感数据"),
        cmd("ai_set_provider", "ai", RiskLevel::Caution, false, true, "设置 AI Provider"),

        // 配置 — 谨慎修改
        cmd("config_get", "config", RiskLevel::Safe, true, false, "获取配置"),
        cmd("config_save_ai", "config", RiskLevel::Caution, false, false, "保存 AI 配置"),
        cmd("config_save_appearance", "config", RiskLevel::Safe, false, false, "保存外观配置"),
        cmd("config_save_device", "config", RiskLevel::Caution, false, false, "保存设备配置"),
        cmd("config_save_general", "config", RiskLevel::Safe, false, false, "保存通用配置"),

        // 固件 — 刷写禁止 AI 操作
        cmd("firmware_get_current", "firmware", RiskLevel::Safe, true, false, "获取当前固件"),
        cmd("firmware_check_update", "firmware", RiskLevel::Safe, true, false, "检查固件更新"),
        cmd("firmware_verify_manifest", "firmware", RiskLevel::Safe, true, false, "验证固件清单"),

        // 存储 — 只读安全，写/删需注意
        cmd("storage_list", "storage", RiskLevel::Safe, true, false, "列出文件"),
        cmd("storage_read", "storage", RiskLevel::Safe, true, false, "读取文件"),
        cmd("storage_write", "storage", RiskLevel::Caution, false, true, "写入文件"),
        cmd("storage_delete", "storage", RiskLevel::Dangerous, false, true, "删除文件/目录"),
        cmd("storage_info", "storage", RiskLevel::Safe, true, false, "存储信息"),

        // 日志
        cmd("log_get_recent", "logs", RiskLevel::Safe, true, false, "获取最近日志"),
        cmd("log_clear", "logs", RiskLevel::Caution, false, false, "清空日志"),
        cmd("log_export", "logs", RiskLevel::Safe, false, false, "导出日志"),
    ];

    for (name, p) in policies {
        table.insert(name, p);
    }
    table
}

fn cmd(
    command: &'static str,
    module: &'static str,
    risk: RiskLevel,
    ai_allowed: bool,
    requires_confirm: bool,
    description: &'static str,
) -> (&'static str, CommandPolicy) {
    (
        command,
        CommandPolicy {
            command: command.to_string(),
            module: module.to_string(),
            risk,
            ai_allowed,
            requires_confirm,
            description: description.to_string(),
        },
    )
}

/// 获取命令策略
pub fn get_policy(command: &str) -> Option<&'static CommandPolicy> {
    let table = POLICY_TABLE.get_or_init(build_policy_table);
    table.get(command)
}

/// 检查 AI 是否可以调用该命令
#[allow(dead_code)]
pub fn check_ai_allowed(command: &str) -> Result<&'static CommandPolicy, String> {
    let table = POLICY_TABLE.get_or_init(build_policy_table);
    match table.get(command) {
        Some(policy) if policy.ai_allowed => Ok(policy),
        Some(policy) => Err(format!(
            "AI 禁止调用命令 '{}'（风险等级: {}，需要用户手动操作）",
            command,
            policy.risk.label_zh()
        )),
        None => Err(format!("未知命令: {}", command)),
    }
}

/// 获取所有策略（用于前端展示）
pub fn all_policies() -> Vec<&'static CommandPolicy> {
    let table = POLICY_TABLE.get_or_init(build_policy_table);
    let mut policies: Vec<_> = table.values().collect();
    policies.sort_by(|a, b| a.command.cmp(&b.command));
    policies
}

/// 从 AI 命令文本解析并映射风险等级
#[allow(dead_code)]
pub fn classify_ai_command(module: &str, action: &str) -> RiskLevel {
    let cmd_name = format!("{}_{}", module, action);
    // 尝试直接匹配
    if let Some(policy) = get_policy(&cmd_name) {
        return policy.risk;
    }
    // 默认：未知命令视为 Caution
    RiskLevel::Caution
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_policy_table_completeness() {
        let table = POLICY_TABLE.get_or_init(build_policy_table);
        // 关键命令必须存在
        assert!(table.contains_key("device_scan"));
        assert!(table.contains_key("badusb_execute"));
        assert!(table.contains_key("subghz_tx"));
        assert!(table.contains_key("firmware_get_current"));
        assert!(table.contains_key("nfc_write_block"));
    }

    #[test]
    fn test_badusb_blocked_from_ai() {
        let result = check_ai_allowed("badusb_execute");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("禁止"));
    }

    #[test]
    fn test_safe_commands_ai_allowed() {
        assert!(check_ai_allowed("nfc_detect").is_ok());
        assert!(check_ai_allowed("device_get_info").is_ok());
        assert!(check_ai_allowed("subghz_scan").is_ok());
    }

    #[test]
    fn test_dangerous_commands_ai_blocked() {
        assert!(check_ai_allowed("nfc_write_block").is_err());
        assert!(check_ai_allowed("subghz_tx").is_err());
        assert!(check_ai_allowed("storage_delete").is_err());
    }

    #[test]
    fn test_risk_level_ordering() {
        assert!(RiskLevel::Safe < RiskLevel::Caution);
        assert!(RiskLevel::Caution < RiskLevel::Dangerous);
        assert!(RiskLevel::Dangerous < RiskLevel::Blocked);
    }

    #[test]
    fn test_classify_ai_command() {
        assert_eq!(classify_ai_command("nfc", "detect"), RiskLevel::Safe);
        assert_eq!(classify_ai_command("badusb", "execute"), RiskLevel::Blocked);
        assert_eq!(classify_ai_command("unknown", "action"), RiskLevel::Caution);
    }

    #[test]
    fn test_all_policies_count() {
        let policies = all_policies();
        assert!(policies.len() >= 50, "应该至少有 50 个命令策略");
    }
}
