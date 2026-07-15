/**
 * Screen 模块 — 设备屏幕镜像
 *
 * 硬件: 1.54" SPI TFT, 240x240, ST7789 驱动, RGB565 16-bit 色彩
 *
 * 帧格式: RGB565 LE (每像素 2 字节)
 *   R5 G6 B5 → [byte0: RRRRRGGG] [byte1: GGGBBBBB]
 *   帧大小: 240 * 240 * 2 = 115,200 bytes
 *
 * 传输模式:
 *   按需: screen_get_frame → 单帧请求
 *   流式: start_stream → 持续推送 screen_frame 事件 (~15fps)
 *
 * 压缩策略:
 *   真实设备: ZSTD 压缩帧 (可选)
 *   虚拟设备: 直接生成 RGB565 正弦波图案
 */
use crate::error::LucyResult;
use serde::{Deserialize, Serialize};
use super::super::transport_manager::TransportManager;
use std::sync::Arc;

/// 屏幕配置
#[allow(dead_code)]
pub const SCREEN_WIDTH: u32 = 240;
#[allow(dead_code)]
pub const SCREEN_HEIGHT: u32 = 240;
#[allow(dead_code)]
pub const SCREEN_FORMAT: &str = "rgb565";
#[allow(dead_code)]
pub const FRAME_SIZE: usize = (SCREEN_WIDTH as usize) * (SCREEN_HEIGHT as usize) * 2;

/// 屏幕帧
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct ScreenFrame {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub data: String, // base64 encoded RGB565
    pub timestamp: u64,
}

/// 获取单帧屏幕
#[allow(dead_code)]
pub async fn get_frame(tm: &Arc<TransportManager>) -> LucyResult<ScreenFrame> {
    let transport = tm.get_transport()?;
    let frame_data = transport.get_screen_frame().await?;

    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&frame_data);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(ScreenFrame {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        format: SCREEN_FORMAT.to_string(),
        data: b64,
        timestamp: ts,
    })
}

/// 获取屏幕帧并返回 JSON (用于 Tauri 命令)
#[allow(dead_code)]
pub async fn get_frame_json(tm: &Arc<TransportManager>) -> LucyResult<serde_json::Value> {
    let frame = get_frame(tm).await?;
    Ok(serde_json::json!({
        "width": frame.width,
        "height": frame.height,
        "format": frame.format,
        "data": frame.data,
    }))
}

/// RGB565 编码辅助
#[allow(dead_code)]
pub fn rgb_to_rgb565(r: u8, g: u8, b: u8) -> u16 {
    ((r as u16 & 0xF8) << 8) | ((g as u16 & 0xFC) << 3) | (b as u16 >> 3)
}

/// RGB565 解码辅助
#[allow(dead_code)]
pub fn rgb565_to_rgb(rgb565: u16) -> (u8, u8, u8) {
    let r = ((rgb565 >> 8) & 0xF8) as u8;
    let g = ((rgb565 >> 3) & 0xFC) as u8;
    let b = ((rgb565 << 3) & 0xF8) as u8;
    (r, g, b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rgb565_roundtrip() {
        let (r, g, b) = (249u8, 115, 22);
        let encoded = rgb_to_rgb565(r, g, b);
        let (r2, g2, b2) = rgb565_to_rgb(encoded);
        // 允许 5-bit/6-bit 精度损失
        assert!((r as i16 - r2 as i16).abs() <= 7);
        assert!((g as i16 - g2 as i16).abs() <= 3);
        assert!((b as i16 - b2 as i16).abs() <= 7);
    }

    #[test]
    fn test_frame_size() {
        assert_eq!(FRAME_SIZE, 115_200);
    }
}
