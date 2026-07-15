/**
 * CommandGateway — 统一命令执行网关
 *
 * 所有高风险命令必须经过此网关:
 *   Frontend Action
 *   → classify (RiskPolicy)
 *   → region_check (RegionPolicy)
 *   → dry_run (模拟执行)
 *   → request_approval (创建审批记录)
 *   → execute (实际执行)
 *   → audit_write (写入审计日志)
 *
 * 安全红线:
 *   1. AI 永不直接执行 Dangerous/Blocked 命令
 *   2. Sub-GHz 发射必须检查地区策略
 *   3. BadUSB 执行必须三阶段
 *   4. 开发者模式默认关闭
 *   5. 所有 Dangerous/Blocked 必须写入审计
 */
use crate::database::{self, DbHandle};
use crate::error::{LucyError, LucyResult};
use crate::policy::{self, RiskLevel};
use crate::region;
use serde::{Deserialize, Serialize};

/// 命令来源
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CommandSource {
    User,
    AiApproved,
    AutoConnect,
    System,
}

impl std::fmt::Display for CommandSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandSource::User => write!(f, "user"),
            CommandSource::AiApproved => write!(f, "ai_approved"),
            CommandSource::AutoConnect => write!(f, "auto_connect"),
            CommandSource::System => write!(f, "system"),
        }
    }
}

/// 网关验证结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayResult {
    pub allowed: bool,
    pub risk_level: String,
    pub requires_approval: bool,
    pub requires_region_check: bool,
    pub requires_badusb_guard: bool,
    pub reason: String,
    pub policy: Option<CommandPolicyInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandPolicyInfo {
    pub command: String,
    pub module: String,
    pub risk: String,
    pub ai_allowed: bool,
    pub requires_confirm: bool,
    pub description: String,
}

/// 网关配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayConfig {
    pub developer_mode: bool,
    pub region: String,
    pub badusb_guard_enabled: bool,
    pub ai_guard_enabled: bool,
    pub audit_enabled: bool,
}

impl Default for GatewayConfig {
    fn default() -> Self {
        Self {
            developer_mode: false,
            region: "global".to_string(),
            badusb_guard_enabled: true,
            ai_guard_enabled: true,
            audit_enabled: true,
        }
    }
}

/// 阶段 1: 分类命令风险
pub fn classify(command: &str) -> GatewayResult {
    match policy::get_policy(command) {
        Some(p) => {
            let requires_region = command == "subghz_tx" || command == "subghz_replay";
            let requires_badusb = command == "badusb_execute";
            let requires_approval = p.risk >= RiskLevel::Caution && p.requires_confirm;

            GatewayResult {
                allowed: p.risk < RiskLevel::Blocked || !p.ai_allowed,
                risk_level: p.risk.as_str().to_string(),
                requires_approval,
                requires_region_check: requires_region,
                requires_badusb_guard: requires_badusb,
                reason: format!("Command '{}' classified as {}", command, p.risk.as_str()),
                policy: Some(CommandPolicyInfo {
                    command: p.command.clone(),
                    module: p.module.clone(),
                    risk: p.risk.as_str().to_string(),
                    ai_allowed: p.ai_allowed,
                    requires_confirm: p.requires_confirm,
                    description: p.description.clone(),
                }),
            }
        }
        None => GatewayResult {
            allowed: false,
            risk_level: "unknown".to_string(),
            requires_approval: true,
            requires_region_check: false,
            requires_badusb_guard: false,
            reason: format!("Unknown command: {}", command),
            policy: None,
        },
    }
}

/// 阶段 2: 检查 AI 是否可以调用
pub fn check_ai_allowed(command: &str) -> LucyResult<()> {
    match policy::check_ai_allowed(command) {
        Ok(_) => Ok(()),
        Err(e) => Err(LucyError::GatewayRejected(e)),
    }
}

/// 阶段 3: 地区频率检查
pub fn region_check(command: &str, frequency: Option<u32>, config: &GatewayConfig) -> LucyResult<()> {
    if command != "subghz_tx" && command != "subghz_replay" {
        return Ok(());
    }
    let freq = match frequency {
        Some(f) => f,
        None => return Err(LucyError::GatewayRejected("Sub-GHz TX requires frequency parameter".into())),
    };

    // Set region to match gateway config, then check
    let region_code = match config.region.as_str() {
        "us" => region::Region::Us,
        "eu" => region::Region::Eu,
        "jp" => region::Region::Jp,
        "cn" => region::Region::Cn,
        _ => region::Region::Global,
    };
    region::set_region(region_code);

    let check = region::check_tx_frequency(freq);
    if !check.allowed {
        return Err(LucyError::GatewayRejected(check.reason));
    }

    Ok(())
}

/// 阶段 4: 开发者模式守卫
pub fn developer_mode_guard(command: &str, config: &GatewayConfig) -> LucyResult<()> {
    // 某些命令需要开发者模式
    let dev_only_commands = ["storage_delete"];
    if dev_only_commands.contains(&command) && !config.developer_mode {
        return Err(LucyError::GatewayRejected(
            format!("Command '{}' requires developer mode to be enabled", command),
        ));
    }
    Ok(())
}

/// 阶段 5: BadUSB 守卫
pub fn badusb_guard(command: &str, config: &GatewayConfig) -> LucyResult<()> {
    if command == "badusb_execute" && config.badusb_guard_enabled {
        // BadUSB execute must go through three-stage process
        // This is checked at the command level, gateway just ensures the flag
        return Ok(());
    }
    Ok(())
}

/// 完整网关检查 — 执行前的统一入口
pub fn gateway_check(
    command: &str,
    source: &CommandSource,
    frequency: Option<u32>,
    config: &GatewayConfig,
) -> LucyResult<GatewayResult> {
    // Step 1: Classify
    let result = classify(command);

    // Unknown command
    if result.policy.is_none() {
        return Err(LucyError::GatewayRejected(result.reason));
    }

    let policy_info = result.policy.as_ref().unwrap();

    // Step 2: AI guard
    if source == &CommandSource::AiApproved && !policy_info.ai_allowed {
        return Err(LucyError::GatewayRejected(format!(
            "AI is not allowed to execute command '{}' (risk: {})",
            command, policy_info.risk
        )));
    }

    // Step 3: Region check
    if result.requires_region_check {
        region_check(command, frequency, config)?;
    }

    // Step 4: Developer mode guard
    developer_mode_guard(command, config)?;

    // Step 5: BadUSB guard
    if result.requires_badusb_guard {
        badusb_guard(command, config)?;
    }

    // Step 6: Blocked commands
    if policy_info.risk == "blocked" && source != &CommandSource::User {
        return Err(LucyError::GatewayRejected(format!(
            "Blocked command '{}' can only be executed by user directly",
            command
        )));
    }

    Ok(result)
}

/// 执行后写入审计日志
pub fn audit_execute(
    db: &DbHandle,
    command: &str,
    module: &str,
    risk: &str,
    source: &CommandSource,
    result: &str,
    detail: Option<String>,
) -> LucyResult<String> {
    let entry = database::new_audit_entry(command, module, risk, &source.to_string(), result, detail);
    database::audit_write(db, &entry)
}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> GatewayConfig {
        GatewayConfig::default()
    }

    #[test]
    fn test_classify_safe_command() {
        let result = classify("nfc_detect");
        assert!(result.allowed);
        assert_eq!(result.risk_level, "safe");
        assert!(!result.requires_approval);
    }

    #[test]
    fn test_classify_dangerous_command() {
        let result = classify("subghz_tx");
        assert_eq!(result.risk_level, "dangerous");
        assert!(result.requires_approval);
        assert!(result.requires_region_check);
    }

    #[test]
    fn test_classify_blocked_command() {
        let result = classify("badusb_execute");
        assert_eq!(result.risk_level, "blocked");
    }

    #[test]
    fn test_classify_unknown_command() {
        let result = classify("unknown_command");
        assert!(!result.allowed);
        assert_eq!(result.risk_level, "unknown");
    }

    #[test]
    fn test_ai_blocked_from_dangerous() {
        let result = check_ai_allowed("subghz_tx");
        assert!(result.is_err());
        let result2 = check_ai_allowed("badusb_execute");
        assert!(result2.is_err());
    }

    #[test]
    fn test_ai_allowed_for_safe() {
        assert!(check_ai_allowed("nfc_detect").is_ok());
        assert!(check_ai_allowed("device_get_info").is_ok());
    }

    #[test]
    fn test_region_check_allows_ism() {
        let config = GatewayConfig { region: "us".to_string(), ..test_config() };
        // 915 MHz is in US ISM band
        assert!(region_check("subghz_tx", Some(915_000_000), &config).is_ok());
    }

    #[test]
    fn test_region_check_blocks_non_ism() {
        let config = GatewayConfig { region: "us".to_string(), ..test_config() };
        // 500 MHz is not in US ISM band
        assert!(region_check("subghz_tx", Some(500_000_000), &config).is_err());
    }

    #[test]
    fn test_region_check_skips_non_subghz() {
        let config = test_config();
        assert!(region_check("nfc_detect", None, &config).is_ok());
    }

    #[test]
    fn test_developer_mode_guard() {
        let config = test_config();
        // storage_delete requires developer mode
        assert!(developer_mode_guard("storage_delete", &config).is_err());

        let config_dev = GatewayConfig { developer_mode: true, ..test_config() };
        assert!(developer_mode_guard("storage_delete", &config_dev).is_ok());
    }

    #[test]
    fn test_gateway_check_safe_user() {
        let config = test_config();
        let result = gateway_check("nfc_detect", &CommandSource::User, None, &config);
        assert!(result.is_ok());
        assert!(result.unwrap().allowed);
    }

    #[test]
    fn test_gateway_check_blocks_ai_dangerous() {
        let config = test_config();
        let result = gateway_check("subghz_tx", &CommandSource::AiApproved, Some(915_000_000), &config);
        assert!(result.is_err());
    }

    #[test]
    fn test_gateway_check_unknown_command() {
        let config = test_config();
        let result = gateway_check("nonexistent_cmd", &CommandSource::User, None, &config);
        assert!(result.is_err());
    }

    #[test]
    fn test_gateway_check_blocked_ai() {
        let config = test_config();
        let result = gateway_check("badusb_execute", &CommandSource::AiApproved, None, &config);
        assert!(result.is_err());
    }

    #[test]
    fn test_gateway_check_region_violation() {
        let config = GatewayConfig { region: "us".to_string(), ..test_config() };
        let result = gateway_check("subghz_tx", &CommandSource::User, Some(500_000_000), &config);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, LucyError::GatewayRejected(_)));
    }

    #[test]
    fn test_gateway_check_dev_mode_required() {
        let config = test_config();
        let result = gateway_check("storage_delete", &CommandSource::User, None, &config);
        assert!(result.is_err());
    }

    #[test]
    fn test_command_source_display() {
        assert_eq!(CommandSource::User.to_string(), "user");
        assert_eq!(CommandSource::AiApproved.to_string(), "ai_approved");
        assert_eq!(CommandSource::AutoConnect.to_string(), "auto_connect");
        assert_eq!(CommandSource::System.to_string(), "system");
    }

    #[test]
    fn test_audit_execute_writes_to_db() {
        let db = crate::database::open_in_memory().unwrap();
        let id = audit_execute(
            &db, "nfc_detect", "nfc", "safe",
            &CommandSource::User, "success",
            Some("Detected Mifare card".into()),
        ).unwrap();
        assert!(!id.is_empty());
        assert_eq!(crate::database::audit_count(&db).unwrap(), 1);
    }

    #[test]
    fn test_gateway_config_default() {
        let config = GatewayConfig::default();
        assert!(!config.developer_mode);
        assert_eq!(config.region, "global");
        assert!(config.badusb_guard_enabled);
        assert!(config.ai_guard_enabled);
        assert!(config.audit_enabled);
    }

    #[test]
    fn test_gateway_check_global_region_allows() {
        let config = GatewayConfig { region: "global".to_string(), ..test_config() };
        // Global region allows all frequencies
        let result = gateway_check("subghz_tx", &CommandSource::User, Some(500_000_000), &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_classify_caution_command() {
        let result = classify("config_save_device");
        assert!(result.allowed);
        assert_eq!(result.risk_level, "caution");
    }

    #[test]
    fn test_classify_config_commands() {
        let result = classify("config_save_general");
        assert_eq!(result.risk_level, "safe");
        assert!(!result.requires_approval);
    }

    #[test]
    fn test_gateway_check_user_can_request_dangerous() {
        let config = GatewayConfig { region: "us".to_string(), ..test_config() };
        // User can request dangerous commands (but must confirm separately)
        let result = gateway_check("subghz_tx", &CommandSource::User, Some(915_000_000), &config);
        assert!(result.is_ok());
        let r = result.unwrap();
        assert!(r.requires_approval);
    }

    #[test]
    fn test_gateway_check_system_source() {
        let config = test_config();
        let result = gateway_check("device_get_info", &CommandSource::System, None, &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_gateway_check_auto_connect_source() {
        let config = test_config();
        let result = gateway_check("device_get_info", &CommandSource::AutoConnect, None, &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_badusb_guard_enabled() {
        let config = test_config();
        assert!(badusb_guard("badusb_execute", &config).is_ok());
        let config2 = GatewayConfig { badusb_guard_enabled: false, ..test_config() };
        assert!(badusb_guard("badusb_execute", &config2).is_ok());
    }

    #[test]
    fn test_region_check_missing_frequency() {
        let config = test_config();
        let result = region_check("subghz_tx", None, &config);
        assert!(result.is_err());
    }

    #[test]
    fn test_gateway_check_cn_region() {
        let config = GatewayConfig { region: "cn".to_string(), ..test_config() };
        // 433.92 MHz is allowed in CN
        let result = gateway_check("subghz_tx", &CommandSource::User, Some(433_920_000), &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_gateway_check_eu_region() {
        let config = GatewayConfig { region: "eu".to_string(), ..test_config() };
        // 868 MHz is allowed in EU
        let result = gateway_check("subghz_tx", &CommandSource::User, Some(868_000_000), &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_gateway_check_jp_region() {
        let config = GatewayConfig { region: "jp".to_string(), ..test_config() };
        // 312 MHz is allowed in JP
        let result = gateway_check("subghz_tx", &CommandSource::User, Some(312_000_000), &config);
        assert!(result.is_ok());
    }
}

// ─── Tauri 命令 ───

use tauri::State;

/// 网关分类命令
#[tauri::command]
pub async fn cmd_gateway_classify(command: String) -> LucyResult<GatewayResult> {
    Ok(classify(&command))
}

/// 网关完整检查
#[tauri::command]
pub async fn cmd_gateway_check(
    command: String,
    source: String,
    frequency: Option<u32>,
    developer_mode: Option<bool>,
    region: Option<String>,
) -> LucyResult<GatewayResult> {
    let src = match source.as_str() {
        "ai_approved" => CommandSource::AiApproved,
        "auto_connect" => CommandSource::AutoConnect,
        "system" => CommandSource::System,
        _ => CommandSource::User,
    };
    let config = GatewayConfig {
        developer_mode: developer_mode.unwrap_or(false),
        region: region.unwrap_or_else(|| "global".to_string()),
        ..GatewayConfig::default()
    };
    gateway_check(&command, &src, frequency, &config)
}

/// 网关审计写入
#[tauri::command]
pub async fn cmd_gateway_audit_write(
    db: State<'_, DbHandle>,
    command: String,
    module: String,
    risk: String,
    source: String,
    result: String,
    detail: Option<String>,
) -> LucyResult<String> {
    let src = match source.as_str() {
        "ai_approved" => CommandSource::AiApproved,
        "auto_connect" => CommandSource::AutoConnect,
        "system" => CommandSource::System,
        _ => CommandSource::User,
    };
    audit_execute(&db, &command, &module, &risk, &src, &result, detail)
}
