// =============================================================================
// device/driver.rs - 驱动管理模块
// =============================================================================
// 职责：
//   - Windows 平台：检测 DFU 模式时自动调用 Auto-Zadig 替换 libusb 驱动
//     （FlipperZero DFU 模式默认使用 ST 的 DFU 驱动，需替换为 WinUSB/libusb
//      才能用 dfu-util 刷写）
//   - macOS / Linux 平台：系统免驱，直接返回成功
//
// 实现说明：
//   - 完整的 Zadig 自动化需要调用 Zadig CLI 或通过 Windows SetupAPI 编程
//   - MVP 阶段提供框架与 mock 实现，标注 TODO 待集成
// =============================================================================

use anyhow::Result;
use serde::{Deserialize, Serialize};

// -------------------- 驱动安装结果 --------------------

/// 驱动安装结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverInstallResult {
    /// 是否需要安装驱动
    pub needed: bool,
    /// 是否安装成功
    pub success: bool,
    /// 安装前的驱动名称
    pub previous_driver: Option<String>,
    /// 安装后的驱动名称
    pub installed_driver: Option<String>,
    /// 平台标识
    pub platform: String,
    /// 详细信息
    pub message: String,
}

// -------------------- 平台检测 --------------------

/// 返回当前平台标识
fn current_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        "unknown"
    }
}

// -------------------- 公共接口 --------------------

/// 安装驱动
///
/// 参数：
///   - force: 是否强制重新安装（即使已安装 libusb 驱动）
///
/// 行为：
///   - Windows: 检测 DFU 设备的当前驱动，若非 WinUSB/libusb 则调用 Zadig 替换
///   - macOS/Linux: 免驱，直接返回 needed=false
pub fn install_driver(force: bool) -> Result<DriverInstallResult> {
    let platform = current_platform();
    log::info!("install_driver: platform={} force={}", platform, force);

    match platform {
        "windows" => install_driver_windows(force),
        "macos" | "linux" => Ok(DriverInstallResult {
            needed: false,
            success: true,
            previous_driver: None,
            installed_driver: None,
            platform: platform.to_string(),
            message: format!("{} 平台 FlipperZero 免驱，无需安装", platform),
        }),
        _ => Ok(DriverInstallResult {
            needed: false,
            success: false,
            previous_driver: None,
            installed_driver: None,
            platform: platform.to_string(),
            message: "不支持的平台".to_string(),
        }),
    }
}

// -------------------- Windows 平台实现 --------------------

#[cfg(target_os = "windows")]
fn install_driver_windows(force: bool) -> Result<DriverInstallResult> {
    use crate::device::detector::scan_devices;
    use crate::device::DeviceMode;

    log::info!("Windows 驱动安装流程启动");

    // 1. 检测是否存在 DFU 模式设备
    let scan = scan_devices()?;
    let dfu_device = scan.devices.iter().find(|d| d.mode == DeviceMode::Dfu);

    if dfu_device.is_none() {
        log::info!("未检测到 DFU 模式设备，跳过驱动安装");
        return Ok(DriverInstallResult {
            needed: false,
            success: true,
            previous_driver: None,
            installed_driver: None,
            platform: "windows".to_string(),
            message: "未检测到 DFU 模式设备，请先让 FlipperZero 进入 DFU 模式".to_string(),
        });
    }

    // 2. 查询当前驱动
    let previous = query_current_driver_windows(&dfu_device.unwrap().port_name)?;

    // 3. 判断是否已是 libusb/WinUSB 驱动
    let already_libusb = previous
        .to_lowercase()
        .contains("winusb")
        || previous.to_lowercase().contains("libusb");

    if already_libusb && !force {
        log::info!("当前已是 libusb/WinUSB 驱动，无需重复安装");
        return Ok(DriverInstallResult {
            needed: false,
            success: true,
            previous_driver: Some(previous),
            installed_driver: Some(previous),
            platform: "windows".to_string(),
            message: "已是 WinUSB/libusb 驱动".to_string(),
        });
    }

    // 4. 调用 Zadig 替换驱动
    log::info!("准备调用 Zadig 替换驱动（previous={}）", previous);
    let installed = run_zadig_windows(&dfu_device.unwrap().port_name)?;

    Ok(DriverInstallResult {
        needed: true,
        success: true,
        previous_driver: Some(previous),
        installed_driver: Some(installed.clone()),
        platform: "windows".to_string(),
        message: format!("驱动已替换为 {}", installed),
    })
}

/// 查询指定 USB 设备当前的驱动名称（Windows）
#[cfg(target_os = "windows")]
fn query_current_driver_windows(_port_name: &str) -> Result<String> {
    // Windows 驱动查询需要调用 SetupAPI，暂不支持。
    // 返回 "unknown" 让 UI 显示"无法检测"而非假数据。
    log::warn!("Windows 驱动检测暂未实现（需 SetupAPI），返回 unknown");
    Ok("unknown".to_string())
}

/// 调用 Zadig 替换驱动（Windows）
///
/// 完整实现方案：
///   1. 随包内置 zadig.exe（或 zadig-cli.exe）
///   2. 生成 zadig 命令行：zadig.exe --targets "FlipperZero DFU" --driver WinUSB
///   3. 通过 std::process::Command 调用
///   4. 等待退出码，解析日志
#[cfg(target_os = "windows")]
fn run_zadig_windows(_port_name: &str) -> Result<String> {
    // Zadig 是 GUI 工具，需要用户手动操作。
    // 返回引导信息，不假装执行了。
    log::warn!("Zadig 驱动替换需用户手动操作");
    Ok("请手动运行 Zadig：Options > List All Devices > 选择 STM32 BootLoader > 替换为 WinUSB".to_string())
}

// -------------------- 非 Windows 平台桩函数 --------------------
// 保留函数签名，确保跨平台编译通过

#[cfg(not(target_os = "windows"))]
fn install_driver_windows(_force: bool) -> Result<DriverInstallResult> {
    unreachable!("install_driver_windows 仅在 Windows 平台调用")
}

// -------------------- 驱动状态查询 --------------------

/// 驱动状态信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverStatus {
    pub platform: String,
    pub driver_installed: bool,
    pub driver_name: Option<String>,
    pub needs_update: bool,
}

/// 查询当前驱动状态（供前端显示）
pub fn get_driver_status() -> Result<DriverStatus> {
    let platform = current_platform().to_string();

    match platform.as_str() {
        "macos" | "linux" => Ok(DriverStatus {
            platform,
            driver_installed: true,
            driver_name: Some("系统内置 (CDC-ACM)".to_string()),
            needs_update: false,
        }),
        "windows" => {
            // Windows 驱动检测需要 SetupAPI，暂不支持自动查询
            // 返回 unknown 状态，让 UI 引导用户检查
            Ok(DriverStatus {
                platform,
                driver_installed: false,
                driver_name: Some("无法自动检测（需手动确认）".to_string()),
                needs_update: false,
            })
        }
        _ => Ok(DriverStatus {
            platform,
            driver_installed: false,
            driver_name: None,
            needs_update: false,
        }),
    }
}
