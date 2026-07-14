/**
 * UsbTransport — 真实 USB CDC 串口通信实现
 *
 * 架构：
 *   ┌─ send_command() ──→ encode_request() ──→ serial.write() ─┐
 *   │                                                            │
 *   │  Reader Thread: serial.read() → decode → match id         │
 *   │    ├─ response match → oneshot::Sender → wake send_command │
 *   │    └─ async event → app.emit() → 前端                     │
 *   └────────────────────────────────────────────────────────────┘
 *
 * 帧格式: [magic(0xAA55)] [ver(u8)] [len(u16)] [payload(msgpack)] [crc16(u16)]
 */
use crate::error::{LucyError, LucyResult};
use crate::app_state::DeviceInfo;
use crate::device::protocol;
use async_trait::async_trait;
use super::transport::DeviceTransport;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Arc;
use std::time::Duration;
use parking_lot::Mutex;
use tokio::sync::oneshot;
use tauri::{AppHandle, Emitter};

/// 请求超时时间
const REQUEST_TIMEOUT_MS: u64 = 5000;
/// 串口波特率（ESP32-S3 USB CDC 实际不限速，但需要设置）
const BAUD_RATE: u32 = 115200;
/// 读缓冲区大小
const READ_BUF_SIZE: usize = 4096;

/// 真实 USB 设备传输层
pub struct UsbTransport {
    /// 串口（共享给 reader thread）
    port: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 待响应的请求表：id → oneshot sender
    pending: Arc<Mutex<HashMap<u16, oneshot::Sender<serde_json::Value>>>>,
    /// 事务 ID 自增计数器
    next_id: AtomicU16,
    /// 连接状态
    connected: AtomicBool,
    /// reader thread 句柄
    reader_handle: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl UsbTransport {
    /// 打开串口并启动 reader thread
    pub fn open(port_name: &str, app: AppHandle) -> LucyResult<Self> {
        log::info!("Opening serial port: {}", port_name);

        let port = serialport::new(port_name, BAUD_RATE)
            .timeout(Duration::from_millis(100))
            .open()
            .map_err(|e| {
                LucyError::Usb(format!("Failed to open port '{}': {}", port_name, e))
            })?;

        let port = Arc::new(Mutex::new(port));
        let pending: Arc<Mutex<HashMap<u16, oneshot::Sender<serde_json::Value>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        // 启动后台 reader 线程
        let reader_port = Arc::clone(&port);
        let reader_pending = Arc::clone(&pending);
        let reader_app = app.clone();

        let handle = std::thread::Builder::new()
            .name("lucy-usb-reader".into())
            .spawn(move || {
                reader_loop(reader_port, reader_pending, reader_app);
            })
            .map_err(|e| LucyError::Internal(format!("Failed to spawn reader thread: {}", e)))?;

        log::info!("USB reader thread started");

        Ok(Self {
            port,
            pending,
            next_id: AtomicU16::new(1),
            connected: AtomicBool::new(true),
            reader_handle: Mutex::new(Some(handle)),
        })
    }

    /// 安全关闭
    fn close_internal(&self) {
        self.connected.store(false, Ordering::SeqCst);
        // 清除所有 pending 请求
        let mut pending = self.pending.lock();
        for (_, tx) in pending.drain() {
            let _ = tx.send(serde_json::json!({"error": "disconnected"}));
        }
    }

    /// 读取下一个事务 ID
    fn alloc_id(&self) -> u16 {
        loop {
            let id = self.next_id.fetch_add(1, Ordering::SeqCst);
            if id != 0 {
                return id;
            }
        }
    }
}

#[async_trait]
impl DeviceTransport for UsbTransport {
    async fn connect(&self, _port: &str) -> LucyResult<()> {
        // open() 已经在构造时完成，这里只标记状态
        self.connected.store(true, Ordering::SeqCst);
        Ok(())
    }

    async fn disconnect(&self) -> LucyResult<()> {
        log::info!("Disconnecting USB transport");
        self.close_internal();
        // 终止 reader thread（通过关闭串口，read 会返回错误）
        if let Some(handle) = self.reader_handle.lock().take() {
            // 关闭串口使 reader thread 的 read 返回错误并退出
            let _ = handle.join();
        }
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    async fn get_info(&self) -> LucyResult<DeviceInfo> {
        let result = self
            .send_command("sys", "get_info", serde_json::json!({}))
            .await?;

        Ok(DeviceInfo {
            name: result.get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Lucy Device")
                .to_string(),
            firmware_version: result.get("fw_version")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            battery_level: result.get("battery")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u8,
            sd_card_free: result.get("sd_free")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            sd_card_total: result.get("sd_total")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            uptime: result.get("uptime")
                .and_then(|v| v.as_u64())
                .unwrap_or(0),
            temperature: result.get("temp")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u8,
        })
    }

    async fn send_command(
        &self,
        module: &str,
        op: &str,
        data: serde_json::Value,
    ) -> LucyResult<serde_json::Value> {
        if !self.is_connected() {
            return Err(LucyError::NotConnected);
        }

        let id = self.alloc_id();
        let frame = protocol::encode_request(id, module, op, &data)?;

        // 注册 pending 请求
        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock();
            pending.insert(id, tx);
        }

        // 发送帧
        {
            let mut port = self.port.lock();
            port.write_all(&frame)
                .map_err(|e| LucyError::Usb(format!("Write error: {}", e)))?;
            port.flush()
                .map_err(|e| LucyError::Usb(format!("Flush error: {}", e)))?;
        }

        log::debug!("→ [{}] {}.{} ({} bytes)", id, module, op, frame.len());

        // 等待响应（带超时）
        match tokio::time::timeout(
            Duration::from_millis(REQUEST_TIMEOUT_MS),
            rx,
        )
        .await
        {
            Ok(Ok(response)) => {
                log::debug!("← [{}] response received", id);
                Ok(response)
            }
            Ok(Err(_)) => {
                // oneshot 被 drop（可能是 reader thread 退出）
                self.pending.lock().remove(&id);
                Err(LucyError::Usb("Reader thread dropped response channel".into()))
            }
            Err(_) => {
                // 超时
                self.pending.lock().remove(&id);
                Err(LucyError::Usb(format!(
                    "Request timeout: {}.{} ({}ms)",
                    module, op, REQUEST_TIMEOUT_MS
                )))
            }
        }
    }

    async fn get_screen_frame(&self) -> LucyResult<Vec<u8>> {
        let result = self
            .send_command("sys", "screen_frame", serde_json::json!({}))
            .await?;

        // 设备返回 base64 编码的 RGB565 数据
        let data_b64 = result
            .get("data")
            .and_then(|v| v.as_str())
            .ok_or_else(|| LucyError::Protocol("Missing screen frame data".into()))?;

        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(data_b64)
            .map_err(|e| LucyError::Protocol(format!("Base64 decode error: {}", e)))
    }
}

/// reader 线程主循环 — 持续读取串口数据并分发
fn reader_loop(
    port: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    pending: Arc<Mutex<HashMap<u16, oneshot::Sender<serde_json::Value>>>>,
    app: AppHandle,
) {
    let mut read_buf = vec![0u8; READ_BUF_SIZE];
    let mut frame_buf: Vec<u8> = Vec::with_capacity(READ_BUF_SIZE * 2);
    let mut scan_pos = 0usize;

    log::info!("USB reader loop started");

    loop {
        // 从串口读取数据
        let n = {
            let mut port = port.lock();
            match port.read(&mut read_buf) {
                Ok(0) => {
                    log::warn!("Serial port returned 0 bytes (EOF)");
                    break;
                }
                Ok(n) => n,
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    continue;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    continue;
                }
                Err(e) => {
                    log::error!("Serial read error: {}", e);
                    break;
                }
            }
        };

        frame_buf.extend_from_slice(&read_buf[..n]);

        // 尝试从缓冲区解析完整帧
        loop {
            match try_parse_frame(&frame_buf[scan_pos..]) {
                ParseResult::Complete(frame_data, consumed) => {
                    scan_pos += consumed;

                    // 解码帧
                    match protocol::decode_response(&frame_data) {
                        Ok(value) => {
                            // 检查是否有 id 字段（响应帧）或 evt 字段（事件帧）
                            if let Some(id) = value.get("id").and_then(|v| v.as_u64()) {
                                let id = id as u16;
                                // 查找 pending 请求
                                let mut pending = pending.lock();
                                if let Some(tx) = pending.remove(&id) {
                                    let _ = tx.send(value);
                                } else {
                                    log::warn!("Received response for unknown id: {}", id);
                                }
                            } else if let Some(evt) = value.get("evt").and_then(|v| v.as_str()) {
                                // 异步事件 — 推送到前端
                                let payload = value.get("data").cloned().unwrap_or(serde_json::Value::Null);
                                log::debug!("← event: {} {:?}", evt, payload);

                                match evt {
                                    "screen_frame" => {
                                        let _ = app.emit("screen_frame", &payload);
                                    }
                                    "subghz_signal" => {
                                        let _ = app.emit("subghz_signal", &payload);
                                    }
                                    "nfc_detected" => {
                                        let _ = app.emit("nfc_detected", &payload);
                                    }
                                    "state_change" => {
                                        let _ = app.emit("state_update", &payload);
                                    }
                                    _ => {
                                        let _ = app.emit("device_event", &value);
                                    }
                                }
                            } else {
                                log::warn!("Received frame with no id or evt field");
                            }
                        }
                        Err(e) => {
                            log::warn!("Frame decode error: {}", e);
                        }
                    }
                }
                ParseResult::Partial => {
                    break;
                }
                ParseResult::Invalid(magic_pos) => {
                    // 跳过无效字节，直到找到 magic
                    scan_pos += magic_pos;
                }
            }
        }

        // 压缩缓冲区
        if scan_pos > READ_BUF_SIZE {
            frame_buf.drain(..scan_pos);
            scan_pos = 0;
        }
    }

    log::warn!("USB reader loop exited");
}

/// 帧解析状态
enum ParseResult {
    /// 完整帧，返回 (帧数据, 消费字节数)
    Complete(Vec<u8>, usize),
    /// 数据不完整，需要更多数据
    Partial,
    /// 无效数据，返回 magic 可能出现的位置
    Invalid(usize),
}

/// 尝试从缓冲区解析一个完整帧
fn try_parse_frame(buf: &[u8]) -> ParseResult {
    if buf.len() < 2 {
        return ParseResult::Partial;
    }

    // 查找 magic bytes
    let magic_pos = buf
        .windows(2)
        .position(|w| w == protocol::MAGIC);

    let magic_pos = match magic_pos {
        Some(pos) => pos,
        None => return ParseResult::Invalid(buf.len() - 1), // 保留最后一个字节（可能是一半 magic）
    };

    // 跳过 magic 前的垃圾数据
    let buf = &buf[magic_pos..];

    // 最小帧大小: magic(2) + ver(1) + len(2) + crc(2) = 7
    if buf.len() < 7 {
        return ParseResult::Partial;
    }

    let length = u16::from_le_bytes([buf[3], buf[4]]) as usize;
    let total_frame_size = 5 + length + 2; // header + payload + crc

    if buf.len() < total_frame_size {
        return ParseResult::Partial;
    }

    // 提取完整帧
    let frame_data = buf[..total_frame_size].to_vec();
    ParseResult::Complete(frame_data, magic_pos + total_frame_size)
}
