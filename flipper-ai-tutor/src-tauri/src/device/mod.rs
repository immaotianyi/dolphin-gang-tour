// =============================================================================
// device/mod.rs - 设备管理模块入口
// =============================================================================
// 职责：聚合设备相关子模块，定义设备数据结构（DeviceInfo / DeviceState 等）
// 子模块：
//   - detector: USB 设备检测、串口扫描、端口占用进程检测
//   - driver:   驱动管理（Windows Auto-Zadig，macOS/Linux 免驱）
//   - sd_card:  SD 卡检测与格式化
// =============================================================================

pub mod detector;
pub mod driver;
pub mod sd_card;
pub mod virtual_flipper;

use serde::{Deserialize, Serialize};

// -------------------- 设备连接状态 --------------------

/// 设备连接状态枚举，与前端 DeviceConnectionState 对应
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceConnectionState {
    /// 未检测到设备
    NoDevice,
    /// DFU 恢复模式
    DfuMode,
    /// 串口被占用
    PortBusy,
    /// SD 卡问题
    SdError,
    /// 连接中
    Connecting,
    /// 已连接
    Connected,
    /// 传输中
    Transferring,
}

impl Default for DeviceConnectionState {
    fn default() -> Self {
        Self::NoDevice
    }
}

// -------------------- 设备信息 --------------------

/// FlipperZero 固件类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FirmwareType {
    /// 官方固件
    Ofw,
    /// Momentum 固件
    Momentum,
    /// Unleashed 固件
    Unleashed,
    /// RogueMaster 固件
    Roguemaster,
    /// 未知
    Unknown,
}

/// 设备详细信息，与前端 DeviceInfo 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    pub firmware_version: String,
    pub firmware_type: FirmwareType,
    /// API Level（Manifest 版本，用于固件兼容性校验）
    pub api_level: u32,
    pub hardware_version: String,
    pub battery_level: u32,
    pub battery_voltage: f32,
    pub is_charging: bool,
    pub sd_card_inserted: bool,
    pub sd_card_total_bytes: u64,
    pub sd_card_free_bytes: u64,
    pub sd_card_format: String,
    pub dolphin_level: u32,
}

/// 检测到的单个设备描述
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedDevice {
    /// 串口名称（如 COM3 / /dev/ttyACM0）
    pub port_name: String,
    /// USB VID（供应商 ID）
    pub vid: u16,
    /// USB PID（产品 ID）
    pub pid: u16,
    /// 设备模式：正常 / DFU
    pub mode: DeviceMode,
    /// 设备友好名称
    pub friendly_name: String,
    /// 是否可连接（非 DFU 模式且端口未被占用）
    pub connectable: bool,
}

/// 设备工作模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceMode {
    /// 正常模式（PID=0x5740）
    Normal,
    /// DFU 模式（PID=0xDF11）
    Dfu,
    /// 未知
    Unknown,
}

// -------------------- 设备扫描结果 --------------------

/// 设备扫描结果，包含设备列表与整体状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceScanResult {
    pub devices: Vec<DetectedDevice>,
    pub state: DeviceConnectionState,
    /// 端口占用进程列表（如有）
    pub port_occupiers: Vec<String>,
    pub scan_timestamp: String,
}

// -------------------- 设备状态（内部管理） --------------------

/// 设备管理内部状态，保存在 AppState 中
#[derive(Debug, Clone, Default)]
pub struct DeviceState {
    /// 当前连接状态
    pub connection_state: DeviceConnectionState,
    /// 当前连接的串口名称
    pub port_name: Option<String>,
    /// 缓存的设备信息
    pub device_info: Option<DeviceInfo>,
    /// 最近一次扫描结果
    pub last_scan: Option<DeviceScanResult>,
}

// -------------------- FlipperZero USB 标识常量 --------------------

/// FlipperZero USB VID（STMicroelectronics）
pub const FLIPPER_VID: u16 = 0x0483;

/// 正常模式 PID
pub const FLIPPER_PID_NORMAL: u16 = 0x5740;

/// DFU 模式 PID
pub const FLIPPER_PID_DFU: u16 = 0xDF11;
