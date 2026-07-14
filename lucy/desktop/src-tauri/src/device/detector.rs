/**
 * USB 设备检测器 — 真实串口枚举 + 热插拔监听
 *
 * 使用 serialport::available_ports() 枚举所有串口设备
 * 通过 VID:PID 过滤 Lucy ESP32-S3 设备
 */
use tauri::{AppHandle, Emitter};
use tracing::{info, warn};

/// VID:PID for Lucy ESP32-S3 device
pub const LUCY_VID: u16 = 0x303A; // Espressif VID
pub const LUCY_PID: u16 = 0x4001; // Lucy custom PID

/// 启动自动扫描后台任务
pub async fn start_auto_scan(app: AppHandle) {
    info!("Starting device auto-scan...");

    // 初始延迟，等待前端加载
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    loop {
        match scan_devices().await {
            Ok(devices) => {
                let lucy_devices: Vec<_> = devices
                    .iter()
                    .filter(|d| d.vid == LUCY_VID && d.pid == LUCY_PID)
                    .collect();

                if !lucy_devices.is_empty() {
                    info!("Found {} Lucy device(s)", lucy_devices.len());
                    let _ = app.emit("devices_found", &devices);
                }
            }
            Err(e) => {
                warn!("Device scan error: {}", e);
            }
        }

        // 每 3 秒扫描一次
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }
}

/// 扫描所有可用串口设备
pub async fn scan_devices() -> Result<Vec<ScannedDevice>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;

    let devices: Vec<ScannedDevice> = ports
        .iter()
        .filter_map(|port_info| {
            match &port_info.port_type {
                serialport::SerialPortType::UsbPort(usb_info) => {
                    // 获取设备名称
                    let name = usb_info
                        .product
                        .clone()
                        .unwrap_or_else(|| "USB Serial Device".to_string());

                    Some(ScannedDevice {
                        name,
                        port: port_info.port_name.clone(),
                        vid: usb_info.vid,
                        pid: usb_info.pid,
                        serial: usb_info.serial_number.clone(),
                        manufacturer: usb_info.manufacturer.clone(),
                    })
                }
                serialport::SerialPortType::PciPort => {
                    Some(ScannedDevice {
                        name: "PCI Serial Device".to_string(),
                        port: port_info.port_name.clone(),
                        vid: 0,
                        pid: 0,
                        serial: None,
                        manufacturer: None,
                    })
                }
                _ => None,
            }
        })
        .collect();

    // 始终附加一个虚拟设备选项
    let mut all_devices = devices;
    all_devices.push(ScannedDevice {
        name: "Lucy (Virtual Demo)".to_string(),
        port: "VIRTUAL".to_string(),
        vid: 0,
        pid: 0,
        serial: None,
        manufacturer: Some("Lucy Virtual".to_string()),
    });

    Ok(all_devices)
}

/// 扫描结果项
#[derive(Debug, Clone, serde::Serialize)]
pub struct ScannedDevice {
    /// 设备显示名称
    pub name: String,
    /// 串口路径（如 /dev/cu.usbmodem*、COM3、VIRTUAL）
    pub port: String,
    /// USB Vendor ID
    pub vid: u16,
    /// USB Product ID
    pub pid: u16,
    /// 序列号
    pub serial: Option<String>,
    /// 制造商
    pub manufacturer: Option<String>,
}
