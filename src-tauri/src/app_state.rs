/**
 * 全局应用状态 — Single Source of Truth (SSOT)
 * 所有设备状态都在这里管理，通过 ui_bridge emit 给前端
 */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub connection_state: ConnectionState,
    pub device_info: Option<DeviceInfo>,
    pub is_virtual: bool,
    pub nfc: NfcState,
    pub subghz: SubghzState,
    pub ai: AiState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionState {
    Disconnected,
    Scanning,
    Connected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub name: String,
    pub firmware_version: String,
    pub battery_level: u8,
    pub sd_card_free: u64,
    pub sd_card_total: u64,
    pub uptime: u64,
    pub temperature: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NfcState {
    pub last_card: Option<NfcCardInfo>,
    pub is_scanning: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NfcCardInfo {
    pub uid: String,
    pub card_type: String,
    pub manufacturer: String,
    pub rssi: i16,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SubghzState {
    pub frequency: u32,
    pub rssi: i16,
    pub modulation: String,
    pub is_scanning: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiState {
    pub model: String,
    pub is_streaming: bool,
    pub messages: Vec<AiMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
    pub timestamp: u64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            connection_state: ConnectionState::Disconnected,
            device_info: None,
            is_virtual: false,
            nfc: NfcState::default(),
            subghz: SubghzState::default(),
            ai: AiState {
                model: "deepseek".to_string(),
                is_streaming: false,
                messages: vec![],
            },
        }
    }
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    /// 创建虚拟设备状态的快照（用于 emit 给前端）
    pub fn snapshot(&self) -> serde_json::Value {
        serde_json::to_value(self).unwrap_or_default()
    }
}
