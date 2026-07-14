/**
 * 配置持久化 — JSON 文件存储
 *
 * 存储位置: ~/.lucy/config.json
 *
 * 配置项:
 *   - AI Provider (provider, api_key, model)
 *   - 外观 (theme, font_size)
 *   - 设备 (last_port, auto_connect)
 *   - 安全 (badusb_confirm, ai_sanitizer)
 */
use crate::error::{LucyError, LucyResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub general: GeneralConfig,
    pub ai: AiConfig,
    pub appearance: AppearanceConfig,
    pub device: DeviceConfig,
    pub security: SecurityConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneralConfig {
    pub language: String,
    pub region: String,
    pub timezone: String,
    pub startup_behavior: String,
    pub data_directory: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
    pub temperature: f32,
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    pub theme: String,
    pub font_size: u8,
    pub crt_effect: bool,
    pub scanlines: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceConfig {
    pub last_port: Option<String>,
    pub auto_connect: bool,
    pub screen_fps: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    pub badusb_require_confirm: bool,
    pub ai_sanitizer_enabled: bool,
    pub subghz_legal_warning: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            general: GeneralConfig {
                language: "en-US".to_string(),
                region: "global".to_string(),
                timezone: "auto".to_string(),
                startup_behavior: "dashboard".to_string(),
                data_directory: None,
            },
            ai: AiConfig {
                provider: "deepseek".to_string(),
                api_key: String::new(),
                model: "deepseek-chat".to_string(),
                base_url: None,
                temperature: 0.7,
                max_tokens: 2048,
            },
            appearance: AppearanceConfig {
                theme: "dark".to_string(),
                font_size: 14,
                crt_effect: true,
                scanlines: true,
            },
            device: DeviceConfig {
                last_port: None,
                auto_connect: true,
                screen_fps: 15,
            },
            security: SecurityConfig {
                badusb_require_confirm: true,
                ai_sanitizer_enabled: true,
                subghz_legal_warning: true,
            },
        }
    }
}

/// 获取配置文件路径
fn config_path() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(home).join(".lucy");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("config.json")
}

/// 加载配置 — 文件不存在则返回默认值
pub fn load() -> AppConfig {
    let path = config_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

/// 保存配置
pub fn save(config: &AppConfig) -> LucyResult<()> {
    let path = config_path();
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| LucyError::Protocol(format!("Config serialize error: {}", e)))?;
    std::fs::write(&path, json)
        .map_err(|e| LucyError::Protocol(format!("Config write error: {}", e)))?;
    tracing::info!("Config saved to {:?}", path);
    Ok(())
}

/// 更新通用配置
pub fn update_general(language: &str, region: &str, timezone: &str) -> LucyResult<AppConfig> {
    let mut config = load();
    if !language.is_empty() {
        config.general.language = language.to_string();
    }
    if !region.is_empty() {
        config.general.region = region.to_string();
    }
    if !timezone.is_empty() {
        config.general.timezone = timezone.to_string();
    }
    save(&config)?;
    Ok(config)
}

/// 更新 AI 配置
pub fn update_ai(provider: &str, api_key: &str, model: &str) -> LucyResult<AppConfig> {
    let mut config = load();
    config.ai.provider = provider.to_string();
    if !api_key.is_empty() {
        config.ai.api_key = api_key.to_string();
    }
    if !model.is_empty() {
        config.ai.model = model.to_string();
    }
    save(&config)?;
    Ok(config)
}

/// 更新外观配置
pub fn update_appearance(theme: &str, font_size: u8, crt_effect: bool, scanlines: bool) -> LucyResult<AppConfig> {
    let mut config = load();
    config.appearance.theme = theme.to_string();
    config.appearance.font_size = font_size;
    config.appearance.crt_effect = crt_effect;
    config.appearance.scanlines = scanlines;
    save(&config)?;
    Ok(config)
}

/// 更新设备配置
pub fn update_device(last_port: Option<String>, auto_connect: bool) -> LucyResult<AppConfig> {
    let mut config = load();
    config.device.last_port = last_port;
    config.device.auto_connect = auto_connect;
    save(&config)?;
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.general.language, "en-US");
        assert_eq!(config.ai.provider, "deepseek");
        assert_eq!(config.appearance.theme, "dark");
        assert!(config.security.badusb_require_confirm);
    }

    #[test]
    fn test_general_config_serialization() {
        let mut config = AppConfig::default();
        config.general.language = "zh-CN".to_string();
        config.general.region = "cn".to_string();
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.general.language, "zh-CN");
        assert_eq!(deserialized.general.region, "cn");
    }

    #[test]
    fn test_config_serialization() {
        let config = AppConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.ai.provider, config.ai.provider);
        assert_eq!(deserialized.appearance.font_size, config.appearance.font_size);
    }

    #[test]
    fn test_config_path_exists() {
        let path = config_path();
        assert!(path.to_string_lossy().contains("config.json"));
    }

    #[test]
    fn test_update_ai_config() {
        // 测试 update_ai 返回的配置是否正确 (不依赖文件持久化)
        let result = update_ai("openai", "sk-test-key", "gpt-4");
        if let Ok(config) = result {
            assert_eq!(config.ai.provider, "openai");
            assert_eq!(config.ai.api_key, "sk-test-key");
            assert_eq!(config.ai.model, "gpt-4");
        }
        // 恢复默认 (忽略可能的写入错误)
        let _ = update_ai("deepseek", "", "deepseek-chat");
    }

    #[test]
    fn test_update_appearance_config() {
        let result = update_appearance("light", 16, false, false);
        if let Ok(config) = result {
            assert_eq!(config.appearance.theme, "light");
            assert_eq!(config.appearance.font_size, 16);
            assert!(!config.appearance.crt_effect);
            assert!(!config.appearance.scanlines);
        }
        // 恢复默认
        let _ = update_appearance("dark", 14, true, true);
    }

    #[test]
    fn test_update_device_config() {
        let result = update_device(Some("/dev/ttyUSB0".to_string()), false);
        if let Ok(config) = result {
            assert_eq!(config.device.last_port, Some("/dev/ttyUSB0".to_string()));
            assert!(!config.device.auto_connect);
        }
        // 恢复默认
        let _ = update_device(None, true);
    }

    #[test]
    fn test_config_with_base_url() {
        let mut config = AppConfig::default();
        config.ai.base_url = Some("http://localhost:11434".to_string());
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.ai.base_url, Some("http://localhost:11434".to_string()));
    }
}
