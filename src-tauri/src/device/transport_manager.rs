/**
 * TransportManager — 传输层管理器
 *
 * 统一管理真实设备和虚拟设备的创建、切换、销毁。
 * 存储在 Tauri managed state 中，所有命令通过它获取 transport。
 *
 * 自动降级策略：
 *   1. 扫描到真实设备 → 创建 UsbTransport
 *   2. 未扫描到设备 → 降级为 VirtualDevice
 *   3. 真实设备断连 → 自动切换到 VirtualDevice + 推送事件
 */
use crate::error::{LucyError, LucyResult};
use super::transport::DeviceTransport;
use super::virtual_dev::VirtualDevice;
use super::usb_transport::UsbTransport;
use super::detector;
use parking_lot::RwLock;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// 传输层管理器
pub struct TransportManager {
    /// 当前传输层（真实或虚拟）
    transport: RwLock<Option<Arc<dyn DeviceTransport>>>,
    /// 当前连接的端口名
    current_port: RwLock<String>,
    /// 是否为虚拟设备
    is_virtual: RwLock<bool>,
}

impl TransportManager {
    pub fn new() -> Self {
        Self {
            transport: RwLock::new(None),
            current_port: RwLock::new(String::new()),
            is_virtual: RwLock::new(true),
        }
    }

    /// 连接设备
    /// port = "VIRTUAL" 或 "AUTO" → 使用虚拟设备
    /// port = "/dev/cu.xxx" 或 "COM3" → 使用真实 USB 设备
    pub async fn connect(&self, port: &str, app: &AppHandle) -> LucyResult<()> {
        // 先断开现有连接
        self.disconnect().await?;

        if port == "VIRTUAL" || port == "AUTO" || port.is_empty() {
            // 虚拟设备模式
            log::info!("Connecting to virtual device");
            let dev = Arc::new(VirtualDevice::new());
            dev.connect(port).await?;
            *self.transport.write() = Some(dev);
            *self.current_port.write() = "VIRTUAL".to_string();
            *self.is_virtual.write() = true;
        } else {
            // 真实 USB 设备
            log::info!("Connecting to USB device: {}", port);
            let usb = UsbTransport::open(port, app.clone())?;
            usb.connect(port).await?;
            *self.transport.write() = Some(Arc::new(usb));
            *self.current_port.write() = port.to_string();
            *self.is_virtual.write() = false;
        }

        Ok(())
    }

    /// 断开当前连接
    pub async fn disconnect(&self) -> LucyResult<()> {
        let transport = self.transport.write().take();
        if let Some(t) = transport {
            log::info!("Disconnecting transport");
            let _ = t.disconnect().await;
        }
        *self.current_port.write() = String::new();
        *self.is_virtual.write() = true;
        Ok(())
    }

    /// 获取当前传输层
    pub fn get_transport(&self) -> LucyResult<Arc<dyn DeviceTransport>> {
        self.transport
            .read()
            .clone()
            .ok_or(LucyError::NotConnected)
    }

    /// 是否已连接
    pub fn is_connected(&self) -> bool {
        self.transport
            .read()
            .as_ref()
            .map(|t| t.is_connected())
            .unwrap_or(false)
    }

    /// 是否为虚拟设备
    pub fn is_virtual(&self) -> bool {
        *self.is_virtual.read()
    }

    /// 当前端口名
    #[allow(dead_code)]
    pub fn current_port(&self) -> String {
        self.current_port.read().clone()
    }

    /// 自动扫描并连接
    /// 优先连接真实设备，找不到则降级为虚拟设备
    pub async fn auto_connect(&self, app: &AppHandle) -> LucyResult<bool> {
        // 扫描真实设备
        match detector::scan_devices().await {
            Ok(devices) => {
                // 查找 Lucy 设备（VID=0x303A, PID=0x4001）
                if let Some(dev) = devices.iter().find(|d| d.vid == detector::LUCY_VID && d.pid == detector::LUCY_PID) {
                    log::info!("Auto-connecting to Lucy device: {}", dev.port);
                    self.connect(&dev.port, app).await?;
                    return Ok(true); // 连接了真实设备
                }

                // 没找到 Lucy 设备，降级为虚拟设备
                log::info!("No Lucy device found, falling back to virtual device");
                self.connect("VIRTUAL", app).await?;
                let _ = app.emit("device_fallback", serde_json::json!({
                    "reason": "No Lucy device found",
                    "virtual": true,
                }));
                Ok(false)
            }
            Err(e) => {
                log::warn!("Device scan failed: {}, using virtual device", e);
                self.connect("VIRTUAL", app).await?;
                let _ = app.emit("device_fallback", serde_json::json!({
                    "reason": format!("Scan error: {}", e),
                    "virtual": true,
                }));
                Ok(false)
            }
        }
    }
}

impl Default for TransportManager {
    fn default() -> Self {
        Self::new()
    }
}
