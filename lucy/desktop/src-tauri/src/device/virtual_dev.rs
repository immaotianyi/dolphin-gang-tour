/**
 * 虚拟设备 — 无需硬件即可开发 UI
 * 完整模拟所有设备功能：屏幕动画、信号扫描、NFC 检测、AI 响应
 */
use crate::error::LucyResult;
use crate::app_state::DeviceInfo;
use async_trait::async_trait;
use super::transport::DeviceTransport;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct VirtualDevice {
    connected: std::sync::atomic::AtomicBool,
    frame_count: std::sync::atomic::AtomicU64,
}

impl VirtualDevice {
    pub fn new() -> Self {
        Self {
            connected: std::sync::atomic::AtomicBool::new(false),
            frame_count: std::sync::atomic::AtomicU64::new(0),
        }
    }
}

#[async_trait]
impl DeviceTransport for VirtualDevice {
    async fn connect(&self, _port: &str) -> LucyResult<()> {
        self.connected.store(true, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }

    async fn disconnect(&self) -> LucyResult<()> {
        self.connected.store(false, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.connected.load(std::sync::atomic::Ordering::SeqCst)
    }

    async fn get_info(&self) -> LucyResult<DeviceInfo> {
        Ok(DeviceInfo {
            name: "Lucy (Virtual Demo)".to_string(),
            firmware_version: "0.1.0-virtual".to_string(),
            battery_level: 78,
            sd_card_free: 6_800_000_000,
            sd_card_total: 8_000_000_000,
            uptime: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
            temperature: 42,
        })
    }

    async fn send_command(
        &self,
        module: &str,
        op: &str,
        _data: serde_json::Value,
    ) -> LucyResult<serde_json::Value> {
        // 模拟延迟
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        match (module, op) {
            ("nfc", "detect") => {
                let cards = vec![
                    serde_json::json!({
                        "uid": "04:A3:B2:C1",
                        "type": "NTAG213",
                        "manufacturer": "NXP",
                        "rssi": -42
                    }),
                    serde_json::json!({
                        "uid": "1A:2B:3C:4D",
                        "type": "Mifare Classic 1K",
                        "manufacturer": "NXP",
                        "rssi": -55
                    }),
                ];
                let idx = (self.frame_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst)) % cards.len() as u64;
                Ok(cards[idx as usize].clone())
            }
            ("subghz", "scan") => {
                let freqs = [433920000u32, 315000000, 868350000, 915000000];
                let idx = (self.frame_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst)) % freqs.len() as u64;
                Ok(serde_json::json!({
                    "frequency": freqs[idx as usize],
                    "rssi": -60 - (idx as i16 * 5),
                    "modulation": "OOK"
                }))
            }
            ("sys", "screen_frame") => {
                // 生成模拟屏幕帧
                let count = self.frame_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                let frame = generate_virtual_screen_frame(count);
                Ok(serde_json::json!({
                    "width": 240,
                    "height": 240,
                    "frame_count": count,
                    "data_len": frame.len()
                }))
            }
            _ => Ok(serde_json::json!({"status": "ok", "virtual": true})),
        }
    }
}

/// 生成虚拟设备屏幕帧（RGB565 格式）
fn generate_virtual_screen_frame(count: u64) -> Vec<u8> {
    let w = 240usize;
    let h = 240usize;
    let mut data = vec![0u8; w * h * 2];
    let t = count as f64 * 0.1;

    for y in 0..h {
        for x in 0..w {
            let cx = w as f64 / 2.0;
            let cy = h as f64 / 2.0;
            let dist = ((x as f64 - cx).powi(2) + (y as f64 - cy).powi(2)).sqrt();
            let wave = (dist * 0.05 - t * 2.0).sin() * 0.5 + 0.5;
            let r = (wave * 249.0) as u8;
            let g = (wave * 115.0) as u8;
            let b = (wave * 22.0) as u8;
            let rgb565 = (((r as u16) & 0xf8) << 8)
                | (((g as u16) & 0xfc) << 3)
                | ((b as u16) >> 3);
            let idx = (y * w + x) * 2;
            data[idx] = (rgb565 >> 8) as u8;
            data[idx + 1] = (rgb565 & 0xff) as u8;
        }
    }
    data
}
