// =============================================================================
// firmware/mod.rs - 固件刷写模块入口
// =============================================================================
// 职责：聚合固件刷写子模块，定义固件相关数据结构
// 子模块：
//   - flasher: 双轨刷写（RPC 协议刷写 + dfu-util 底层刷写）
//
// 双轨刷写策略：
//   1. 正常模式（设备可正常启动并建立 RPC 会话）：
//      - 通过 RPC storage_write 将固件包传输到 /update 目录
//      - 设备端自动解压并刷写
//      - 适用于常规升级场景
//   2. DFU 模式（设备无法启动 / 救砖）：
//      - 使用 dfu-util 通过 USB DFU 协议直接刷写
//      - 适用于固件损坏、变砖恢复场景
//      - Windows 需先安装 WinUSB 驱动（见 device::driver）
// =============================================================================

pub mod flasher;

use serde::{Deserialize, Serialize};

// -------------------- 固件标识与信息 --------------------

/// 固件 ID 类型，与前端 FirmwareId 对应
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FirmwareId {
    /// Momentum 固件（推荐，功能丰富）
    Momentum,
    /// Unleashed 固件
    Unleashed,
    /// 官方固件
    Ofw,
    /// RogueMaster 固件
    Roguemaster,
}

impl FirmwareId {
    /// 从字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "momentum" => Some(Self::Momentum),
            "unleashed" => Some(Self::Unleashed),
            "ofw" => Some(Self::Ofw),
            "roguemaster" => Some(Self::Roguemaster),
            _ => None,
        }
    }

    /// 转为字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Momentum => "momentum",
            Self::Unleashed => "unleashed",
            Self::Ofw => "ofw",
            Self::Roguemaster => "roguemaster",
        }
    }
}

/// 固件信息，与前端 FirmwareInfo 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub recommended: bool,
    /// API Level（Manifest 版本，用于兼容性校验）
    pub api_level: u32,
    pub download_url: String,
    pub size_bytes: u64,
    /// 是否需要 DFU 模式
    pub requires_dfu: bool,
}

// -------------------- 刷写进度与结果 --------------------

/// 刷写阶段，与前端 FlashPhase 对应
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FlashPhase {
    Idle,
    Downloading,
    Checking,
    EnteringDfu,
    Flashing,
    Verifying,
    Rebooting,
    Done,
    Error,
}

/// 刷写进度，与前端 FlashProgress 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashProgress {
    pub phase: FlashPhase,
    /// 进度百分比 0-100
    pub progress: u8,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

impl Default for FlashProgress {
    fn default() -> Self {
        Self {
            phase: FlashPhase::Idle,
            progress: 0,
            message: String::new(),
            error_message: None,
        }
    }
}

/// 刷写结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashResult {
    pub success: bool,
    pub firmware_id: String,
    /// 实际使用的刷写方式：rpc / dfu
    pub method: String,
    pub duration_ms: u64,
    pub message: String,
}

// -------------------- 固件 Manifest --------------------

/// 固件 Manifest（清单文件），包含版本与兼容性信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareManifest {
    pub version: String,
    pub api_level: u32,
    pub target: String,
    pub build_date: String,
    pub commit: String,
    pub changelog: Option<String>,
}
