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
//   - 当前为手动安装指引模式，提供平台特定的安装命令引导
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
    let dfu_dev = dfu_device.as_ref()
        .ok_or_else(|| anyhow!("DFU 设备不可用"))?;
    let previous = query_current_driver_windows(&dfu_dev.port_name)?;

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
    let installed = run_zadig_windows(&dfu_dev.port_name)?;

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
///
/// 通过 Windows SetupAPI 查询设备驱动信息：
///   1. 使用 SetupDiGetClassDevs 枚举所有 USB 设备
///   2. 匹配 FlipperZero DFU 设备的 VID:PID (0483:DF11)
///   3. 调用 SetupDiGetDeviceRegistryProperty 获取驱动名称
#[cfg(target_os = "windows")]
fn query_current_driver_windows(port_name: &str) -> Result<String> {
    use windows::Win32::Devices::DeviceAndDriverInstallation::*;
    use windows::Win32::Foundation::*;
    use windows::core::PCWSTR;

    log::info!("查询设备驱动: {}", port_name);

    // FlipperZero DFU 模式的 VID:PID
    const FLIPPER_DFU_VID: u16 = 0x0483;
    const FLIPPER_DFU_PID: u16 = 0xDF11;

    // 枚举所有设备
    let dev_info = unsafe {
        SetupDiGetClassDevsW(
            None,
            PCWSTR::null(),
            None,
            DIGCF_PRESENT | DIGCF_ALLCLASSES,
        )
    };

    if dev_info.is_invalid() {
        log::warn!("SetupDiGetClassDevs 失败，返回 unknown");
        return Ok("unknown".to_string());
    }

    let mut dev_info_data = SP_DEVINFO_DATA {
        cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
        ..Default::default()
    };

    let mut index: u32 = 0;
    while unsafe {
        SetupDiEnumDeviceInfo(dev_info, index, &mut dev_info_data).as_bool()
    } {
        index += 1;

        // 获取硬件 ID
        let mut hw_id_buf = [0u16; 256];
        let mut required_size = 0u32;
        let success = unsafe {
            SetupDiGetDeviceRegistryPropertyW(
                dev_info,
                &dev_info_data,
                SPDRP_HARDWAREID,
                None,
                Some(&mut hw_id_buf as *mut _ as *mut u8),
                hw_id_buf.len() as u32 * 2,
                Some(&mut required_size),
            )
        };

        if success.is_err() {
            continue;
        }

        let hw_id = String::from_utf16_lossy(
            &hw_id_buf[..required_size as usize / 2]
                .iter()
                .take_while(|&&c| c != 0)
                .copied()
                .collect::<Vec<_>>(),
        );

        // 检查是否匹配 FlipperZero DFU VID:PID
        let hw_id_upper = hw_id.to_uppercase();
        if !hw_id_upper.contains(&format!("VID_{:04X}", FLIPPER_DFU_VID))
            || !hw_id_upper.contains(&format!("PID_{:04X}", FLIPPER_DFU_PID))
        {
            continue;
        }

        log::info!("找到 FlipperZero DFU 设备: {}", hw_id);

        // 获取驱动描述
        let mut desc_buf = [0u16; 256];
        let mut desc_size = 0u32;
        let desc_success = unsafe {
            SetupDiGetDeviceRegistryPropertyW(
                dev_info,
                &dev_info_data,
                SPDRP_DEVICEDESC,
                None,
                Some(&mut desc_buf as *mut _ as *mut u8),
                desc_buf.len() as u32 * 2,
                Some(&mut desc_size),
            )
        };

        if desc_success.is_ok() {
            let desc = String::from_utf16_lossy(
                &desc_buf[..desc_size as usize / 2]
                    .iter()
                    .take_while(|&&c| c != 0)
                    .copied()
                    .collect::<Vec<_>>(),
            );
            log::info!("设备驱动描述: {}", desc);

            // 获取驱动服务名（更准确的驱动标识）
            let mut svc_buf = [0u16; 256];
            let mut svc_size = 0u32;
            let svc_success = unsafe {
                SetupDiGetDeviceRegistryPropertyW(
                    dev_info,
                    &dev_info_data,
                    SPDRP_SERVICE,
                    None,
                    Some(&mut svc_buf as *mut _ as *mut u8),
                    svc_buf.len() as u32 * 2,
                    Some(&mut svc_size),
                )
            };

            if svc_success.is_ok() {
                let svc = String::from_utf16_lossy(
                    &svc_buf[..svc_size as usize / 2]
                        .iter()
                        .take_while(|&&c| c != 0)
                        .copied()
                        .collect::<Vec<_>>(),
                );
                unsafe { SetupDiDestroyDeviceInfoList(dev_info) };
                return Ok(format!("{} ({})", desc, svc));
            }

            unsafe { SetupDiDestroyDeviceInfoList(dev_info) };
            return Ok(desc);
        }
    }

    unsafe { SetupDiDestroyDeviceInfoList(dev_info) };
    log::warn!("未找到匹配的 FlipperZero DFU 设备驱动");
    Ok("unknown".to_string())
}

/// 调用 Zadig 替换驱动（Windows）
///
/// 实现方案：
///   1. 检查随包内置的 zadig.exe 是否存在
///   2. 若存在，尝试通过命令行参数自动化调用
///   3. 若不存在，返回引导信息让用户手动操作
#[cfg(target_os = "windows")]
fn run_zadig_windows(port_name: &str) -> Result<String> {
    log::info!("尝试 Zadig 驱动替换: {}", port_name);

    // 检查随包内置的 zadig.exe
    let exe_dir = std::env::current_exe()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()).ok_or_else(|| anyhow!("无法获取 exe 目录")))
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    let zadig_paths = [
        exe_dir.join("zadig.exe"),
        exe_dir.join("bin").join("zadig.exe"),
        std::path::PathBuf::from("zadig.exe"),
        std::path::PathBuf::from("Zadig"),
    ];

    let zadig_exe = zadig_paths.iter().find(|p| p.exists());

    if let Some(zadig_path) = zadig_exe {
        log::info!("找到 Zadig: {:?}", zadig_path);

        // Zadig 2.x 支持 --targets 和 --driver 参数
        // 注意：Zadig 的 CLI 支持有限，可能需要用户在 GUI 中确认
        let output = std::process::Command::new(zadig_path)
            .args(["--targets", "STM32 BootLoader", "--driver", "WinUSB"])
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let stderr = String::from_utf8_lossy(&out.stderr);
                log::info!("Zadig 输出: stdout={}, stderr={}", stdout, stderr);

                if out.status.success() {
                    return Ok("WinUSB".to_string());
                }
                // Zadig 可能需要 GUI 交互，返回引导信息
                return Ok(format!(
                    "Zadig 已启动（退出码={}），请在 GUI 中确认替换操作。\n路径: {}",
                    out.status.code().unwrap_or(-1),
                    zadig_path.display()
                )).into_ok();
            }
            Err(e) => {
                log::warn!("Zadig 调用失败: {e}");
            }
        }
    }

    // Zadig 不存在或调用失败，返回引导信息
    log::warn!("Zadig 未找到或调用失败，返回手动引导");
    Ok(
        "请手动运行 Zadig 替换驱动：\n\
         1. 下载 Zadig from https://zadig.akeo.ie\n\
         2. Options > List All Devices\n\
         3. 选择 STM32 BootLoader\n\
         4. 目标驱动选择 WinUSB\n\
         5. 点击 Replace Driver"
            .to_string(),
    )
}

/// 辅助 trait：将 String 转为 Result<String, anyhow::Error>
#[cfg(target_os = "windows")]
trait IntoOk {
    fn into_ok(self) -> Result<String>;
}

#[cfg(target_os = "windows")]
impl IntoOk for String {
    fn into_ok(self) -> Result<String> {
        Ok(self)
    }
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
