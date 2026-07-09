// =============================================================================
// device/detector.rs - USB 设备检测模块
// =============================================================================
// 职责：
//   1. 通过 serialport 库轮询系统串口，识别 FlipperZero 设备
//      - VID=0x0483 PID=0x5740 -> 正常模式（可建立 RPC 会话）
//      - VID=0x0483 PID=0xDF11 -> DFU 模式（固件刷写 / 救砖）
//   2. 扫描系统进程，检测占用串口的程序（qflipper / cura / arduino 等）
//   3. 提供强制结束占用进程的能力（kill_port_occupier）
// =============================================================================

use crate::device::{
    DeviceConnectionState, DeviceMode, DeviceScanResult, DetectedDevice,
    FLIPPER_PID_DFU, FLIPPER_PID_NORMAL, FLIPPER_VID,
};
use anyhow::{anyhow, Result};
use serialport::SerialPortInfo;
use sysinfo::System as Sys;

// -------------------- 公共接口 --------------------

/// 扫描所有串口，识别 FlipperZero 设备
///
/// 实现说明：
/// - 调用 `serialport::available_ports()` 获取系统所有串口
/// - 通过 SerialPortInfo 中的 USB 信息匹配 VID/PID
/// - 同时扫描占用进程，判断端口是否被独占
pub fn scan_devices() -> Result<DeviceScanResult> {
    log::debug!("开始扫描串口设备...");

    let ports = serialport::available_ports()
        .map_err(|e| anyhow!("获取串口列表失败: {e}"))?;

    log::debug!("系统共发现 {} 个串口", ports.len());

    let mut devices: Vec<DetectedDevice> = Vec::new();

    for port in &ports {
        if let Some(dev) = parse_port(port) {
            log::info!(
                "识别到 FlipperZero 设备: {} (VID={:04x} PID={:04x} mode={:?})",
                port.port_name,
                dev.vid,
                dev.pid,
                dev.mode
            );
            devices.push(dev);
        }
    }

    // 扫描占用串口的进程
    let occupiers = scan_port_occupiers();

    // 根据扫描结果推断整体连接状态
    let state = infer_state(&devices, &occupiers);

    Ok(DeviceScanResult {
        devices,
        state,
        port_occupiers: occupiers,
        scan_timestamp: chrono::Local::now().to_rfc3339(),
    })
}

/// 解析单个串口信息，判断是否为 FlipperZero 设备
///
/// 返回 None 表示不是 FlipperZero 设备
fn parse_port(port: &SerialPortInfo) -> Option<DetectedDevice> {
    use serialport::SerialPortType;
    let usb_info = match &port.port_type {
        SerialPortType::UsbPort(usb) => usb,
        _ => return None,
    };

    // 匹配 VID
    let vid = usb_info.vid;
    let pid = usb_info.pid;
    if vid != FLIPPER_VID {
        return None;
    }

    // 根据 PID 判断模式
    let mode = if pid == FLIPPER_PID_NORMAL {
        DeviceMode::Normal
    } else if pid == FLIPPER_PID_DFU {
        DeviceMode::Dfu
    } else {
        // VID 匹配但 PID 未知，仍记录为未知模式
        log::warn!("VID 匹配但 PID 未知: {:04x}", pid);
        DeviceMode::Unknown
    };

    let friendly_name = usb_info
        .product
        .clone()
        .unwrap_or_else(|| "FlipperZero".to_string());

    // DFU 模式不可建立 RPC 会话
    let connectable = mode == DeviceMode::Normal;

    Some(DetectedDevice {
        port_name: port.port_name.clone(),
        vid,
        pid,
        mode,
        friendly_name,
        connectable,
    })
}

/// 根据设备列表与占用进程推断整体连接状态
fn infer_state(
    devices: &[DetectedDevice],
    occupiers: &[String],
) -> DeviceConnectionState {
    if devices.is_empty() {
        return DeviceConnectionState::NoDevice;
    }

    // 优先检测 DFU 模式
    if devices.iter().any(|d| d.mode == DeviceMode::Dfu) {
        return DeviceConnectionState::DfuMode;
    }

    // 有正常模式设备但端口被占用
    if !occupiers.is_empty() {
        return DeviceConnectionState::PortBusy;
    }

    // 有可连接的设备
    if devices.iter().any(|d| d.connectable) {
        return DeviceConnectionState::Connected;
    }

    DeviceConnectionState::NoDevice
}

// -------------------- 端口占用进程检测 --------------------

/// 已知的可能占用串口的进程名列表
const KNOWN_OCCUPIERS: &[&str] = &[
    "qflipper",
    "flipper",
    "cura",
    "Ultimaker-Cura",
    "arduino",
    "arduino-ide",
    "avrdude",
    "picocom",
    "screen",
    "minicom",
    "cutecom",
];

/// 扫描系统进程，检测是否有占用串口的程序
///
/// 实现说明：
/// 1. 使用 sysinfo 库遍历所有进程，匹配已知占用进程名
/// 2. 在 macOS/Linux 上用 lsof 精确判断进程是否打开了串口设备文件
///    （如 /dev/cu.usbmodem* /dev/ttyACM* 等）
pub fn scan_port_occupiers() -> Vec<String> {
    // sysinfo 0.31: 使用 new_all() 一次性刷新所有进程信息
    let sys = Sys::new_all();

    let mut found: Vec<String> = Vec::new();
    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        for occ in KNOWN_OCCUPIERS {
            if name.contains(occ) {
                let display = format!("{} (PID: {})", name, process.pid().as_u32());
                if !found.contains(&display) {
                    found.push(display);
                }
            }
        }
    }

    // macOS/Linux: 用 lsof 检测哪些进程打开了串口设备文件
    #[cfg(unix)]
    {
        if let Ok(output) = std::process::Command::new("lsof")
            .arg("-c")
            .arg("")
            .arg("/dev/cu.usbmodem")
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    // lsof 输出格式: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let cmd = parts[0].to_lowercase();
                        let pid = parts[1];
                        let display = format!("{} (PID: {})", cmd, pid);
                        if !found.contains(&display) && cmd != "lsof" {
                            found.push(display);
                        }
                    }
                }
            }
        }
    }

    if !found.is_empty() {
        log::warn!("检测到占用串口的进程: {:?}", found);
    }

    found
}

// -------------------- 强制结束占用进程 --------------------

/// 强制结束占用进程的结果
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillResult {
    pub killed: Vec<String>,
    pub failed: Vec<String>,
    pub success: bool,
}

/// 强制结束所有占用串口的进程
///
/// 实现说明：
/// - 通过 sysinfo 获取进程，调用 process.kill() 结束
/// - 返回成功结束与失败的进程列表
pub fn kill_port_occupier(_port_name: &str) -> Result<KillResult> {
    log::info!("尝试结束占用串口 {} 的进程", _port_name);

    let sys = Sys::new_all();

    let mut killed = Vec::new();
    let mut failed = Vec::new();

    for (_pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        let is_occupier = KNOWN_OCCUPIERS.iter().any(|occ| name.contains(occ));
        if !is_occupier {
            continue;
        }

        let display = format!("{} (PID: {})", name, process.pid().as_u32());
        log::info!("正在结束进程: {}", display);

        // sysinfo 的 kill 方法跨平台
        if process.kill() {
            killed.push(display);
            log::info!("进程已结束: {}", name);
        } else {
            failed.push(display);
            log::warn!("结束进程失败: {}", name);
        }
    }

    let success = failed.is_empty() && !killed.is_empty();
    Ok(KillResult {
        killed,
        failed,
        success,
    })
}

// -------------------- 等待设备出现（轮询辅助） --------------------

/// 轮询等待 FlipperZero 设备出现，最多等待 timeout 秒
///
/// 用于固件刷写后等待设备重启完成
pub fn wait_for_device(timeout_secs: u64, expect_dfu: bool) -> Result<DetectedDevice> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);

    loop {
        if std::time::Instant::now() > deadline {
            return Err(anyhow!(
                "等待设备超时（{}秒内未检测到{}模式设备）",
                timeout_secs,
                if expect_dfu { "DFU" } else { "正常" }
            ));
        }

        match scan_devices() {
            Ok(result) => {
                for dev in &result.devices {
                    if expect_dfu && dev.mode == DeviceMode::Dfu {
                        return Ok(dev.clone());
                    }
                    if !expect_dfu && dev.mode == DeviceMode::Normal {
                        return Ok(dev.clone());
                    }
                }
            }
            Err(e) => {
                log::debug!("扫描中: {e}");
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}
