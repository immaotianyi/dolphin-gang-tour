/**
 * DeviceTransport trait — 真实设备和虚拟设备的统一接口
 * 上层逻辑完全不关心底层是真设备还是虚拟设备
 */
use crate::error::LucyResult;
use crate::app_state::{DeviceInfo, NfcCardInfo};
use async_trait::async_trait;

/// 设备传输接口
#[async_trait]
pub trait DeviceTransport: Send + Sync {
    /// 连接设备
    async fn connect(&self, port: &str) -> LucyResult<()>;

    /// 断开连接
    async fn disconnect(&self) -> LucyResult<()>;

    /// 是否已连接
    fn is_connected(&self) -> bool;

    /// 获取设备信息
    async fn get_info(&self) -> LucyResult<DeviceInfo>;

    /// 发送命令并等待响应
    async fn send_command(
        &self,
        module: &str,
        op: &str,
        data: serde_json::Value,
    ) -> LucyResult<serde_json::Value>;

    /// NFC 检测
    async fn nfc_detect(&self) -> LucyResult<NfcCardInfo> {
        let result = self.send_command("nfc", "detect", serde_json::json!({})).await?;
        Ok(NfcCardInfo {
            uid: result.get("uid").and_then(|v| v.as_str()).unwrap_or("UNKNOWN").to_string(),
            card_type: result.get("type").and_then(|v| v.as_str()).unwrap_or("UNKNOWN").to_string(),
            manufacturer: result.get("manufacturer").and_then(|v| v.as_str()).unwrap_or("UNKNOWN").to_string(),
            rssi: result.get("rssi").and_then(|v| v.as_i64()).unwrap_or(-100) as i16,
        })
    }

    /// SubGHz 扫描
    async fn subghz_scan(&self, start_freq: u32, end_freq: u32) -> LucyResult<serde_json::Value> {
        self.send_command("subghz", "scan", serde_json::json!({
            "start": start_freq,
            "end": end_freq
        })).await
    }

    /// 获取屏幕帧
    async fn get_screen_frame(&self) -> LucyResult<Vec<u8>> {
        let _result = self.send_command("sys", "screen_frame", serde_json::json!({})).await?;
        // 在真实设备中这里会返回二进制数据
        Ok(Vec::new())
    }
}
