/**
 * NFC 模块 — ST25R3916 NFC 读卡器控制
 *
 * 支持卡片类型:
 *   ISO 14443-A: Mifare Classic 1K/4K, NTAG213/215/216, Mifare Ultralight
 *   ISO 14443-B: ST25TB, Calypso
 *   FeliCa: RC-S961 (日本交通卡)
 *
 * 命令集:
 *   detect   — 轮询检测卡片
 *   read_uid — 读取 UID
 *   read     — 读取数据块
 *   write    — 写入数据块
 *   emulate  — 卡片模拟模式
 *   list     — 列出已保存的卡片
 */
use crate::app_state::NfcCardInfo;
use crate::error::LucyResult;
use serde::{Deserialize, Serialize};
use super::super::transport_manager::TransportManager;
use std::sync::Arc;

/// NFC 卡片完整数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NfcCardData {
    pub uid: String,
    pub card_type: String,
    pub manufacturer: String,
    pub rssi: i16,
    pub atqa: u16,
    pub sak: u8,
    pub blocks: Vec<NfcBlock>,
}

/// NFC 数据块
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NfcBlock {
    pub index: u8,
    pub data: String, // hex encoded
    pub sector: u8,
    pub block_type: String, // "data" | "trailer" | "manufacturer"
}

/// 已保存的卡片
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedCard {
    pub id: String,
    pub uid: String,
    pub card_type: String,
    pub name: String,
    pub saved_at: u64,
}

/// 已知卡片类型数据库
const CARD_DATABASE: &[(&str, &str, &str, u16, u8)] = &[
    // (ATQA pattern, card_type, manufacturer, atqa, sak)
    ("04", "NTAG213", "NXP", 0x0044, 0x00),
    ("04", "NTAG215", "NXP", 0x0044, 0x00),
    ("04", "NTAG216", "NXP", 0x0044, 0x00),
    ("08", "Mifare Classic 1K", "NXP", 0x0004, 0x08),
    ("18", "Mifare Classic 4K", "NXP", 0x0002, 0x18),
    ("00", "Mifare Ultralight", "NXP", 0x0044, 0x00),
    ("28", "Mifare Plus SL2", "NXP", 0x0004, 0x20),
    ("20", "Mifare DESFire", "NXP", 0x0344, 0x20),
];

/// NFC 检测
#[allow(dead_code)]
pub async fn detect(tm: &Arc<TransportManager>) -> LucyResult<NfcCardInfo> {
    let transport = tm.get_transport()?;
    transport.nfc_detect().await
}

/// NFC 读取 UID
#[allow(dead_code)]
pub async fn read_uid(tm: &Arc<TransportManager>) -> LucyResult<NfcCardInfo> {
    let transport = tm.get_transport()?;
    transport.nfc_detect().await
}

/// NFC 读取完整卡片数据（所有块）
pub async fn read_card(tm: &Arc<TransportManager>) -> LucyResult<NfcCardData> {
    let transport = tm.get_transport()?;
    let response = transport
        .send_command("nfc", "read_card", serde_json::json!({}))
        .await?;

    // 解析设备返回的卡片数据
    let uid = response.get("uid")
        .and_then(|v| v.as_str())
        .unwrap_or("UNKNOWN")
        .to_string();
    let atqa = response.get("atqa")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u16;
    let sak = response.get("sak")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u8;
    let rssi = response.get("rssi")
        .and_then(|v| v.as_i64())
        .unwrap_or(-60) as i16;

    // 识别卡片类型
    let (card_type, manufacturer) = identify_card(&uid, atqa, sak);

    // 解析数据块
    let blocks: Vec<NfcBlock> = response.get("blocks")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|b| {
            Some(NfcBlock {
                index: b.get("index")?.as_u64()? as u8,
                data: b.get("data")?.as_str()?.to_string(),
                sector: b.get("sector")?.as_u64()? as u8,
                block_type: b.get("type")?.as_str()?.to_string(),
            })
        }).collect())
        .unwrap_or_default();

    Ok(NfcCardData {
        uid,
        card_type,
        manufacturer,
        rssi,
        atqa,
        sak,
        blocks,
    })
}

/// NFC 写入数据块
pub async fn write_block(
    tm: &Arc<TransportManager>,
    sector: u8,
    block: u8,
    data: String,
    key_a: Option<String>,
    key_b: Option<String>,
) -> LucyResult<serde_json::Value> {
    let transport = tm.get_transport()?;
    let mut payload = serde_json::json!({
        "sector": sector,
        "block": block,
        "data": data,
    });
    if let Some(key) = key_a {
        payload["key_a"] = serde_json::Value::String(key);
    }
    if let Some(key) = key_b {
        payload["key_b"] = serde_json::Value::String(key);
    }
    transport.send_command("nfc", "write_block", payload).await
}

/// NFC 卡片模拟
pub async fn emulate(
    tm: &Arc<TransportManager>,
    uid: String,
    card_type: String,
) -> LucyResult<serde_json::Value> {
    let transport = tm.get_transport()?;
    transport
        .send_command("nfc", "emulate", serde_json::json!({
            "uid": uid,
            "type": card_type,
        }))
        .await
}

/// 列出已保存的卡片
pub async fn list_saved() -> LucyResult<Vec<SavedCard>> {
    // Phase 4: 从 SD 卡读取已保存的卡片
    // 目前返回空列表
    Ok(vec![])
}

/// 保存当前卡片
#[allow(dead_code)]
pub async fn save_card(
    _tm: &Arc<TransportManager>,
    name: String,
    card_data: NfcCardData,
) -> LucyResult<serde_json::Value> {
    // Phase 4: 保存到 SD 卡
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(serde_json::json!({
        "success": true,
        "id": format!("card_{}", ts),
        "name": name,
        "uid": card_data.uid,
        "type": card_data.card_type,
    }))
}

/// 根据 UID 前缀和 ATQA/SAK 识别卡片类型
fn identify_card(uid: &str, atqa: u16, sak: u8) -> (String, String) {
    let uid_prefix = uid.split(':').next().unwrap_or("").to_lowercase();

    for (prefix, card_type, manufacturer, exp_atqa, exp_sak) in CARD_DATABASE {
        if uid_prefix.starts_with(prefix) && (atqa == *exp_atqa || sak == *exp_sak) {
            return (card_type.to_string(), manufacturer.to_string());
        }
    }

    // 默认值
    ("Unknown".to_string(), "Unknown".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identify_ntag() {
        let (ct, mfr) = identify_card("04:A3:B2:C1", 0x0044, 0x00);
        assert_eq!(ct, "NTAG213");
        assert_eq!(mfr, "NXP");
    }

    #[test]
    fn test_identify_mifare_classic() {
        let (ct, _mfr) = identify_card("08:AB:CD:EF", 0x0004, 0x08);
        assert_eq!(ct, "Mifare Classic 1K");
    }
}
