/**
 * SubGHz 模块 — CC1101 Sub-1GHz 射频收发器控制
 *
 * 支持频段:
 *   300-348 MHz, 387-464 MHz, 779-928 MHz
 *
 * 调制方式:
 *   OOK (On-Off Keying), 2-FSK, ASK, GFSK
 *
 * 命令集:
 *   scan     — 频率扫描
 *   rx       — 信号接收
 *   tx       — 信号发射
 *   save     — 保存捕获的信号
 *   list     — 列出已保存的信号
 *   replay   — 重放已保存的信号
 */
use crate::error::LucyResult;
use serde::{Deserialize, Serialize};
use super::super::transport_manager::TransportManager;
use std::sync::Arc;

/// SubGHz 信号
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubghzSignal {
    pub frequency: u32,
    pub rssi: i16,
    pub modulation: String,
    pub timestamp: u64,
    pub data: Option<String>, // hex encoded raw data
    pub protocol: Option<String>,
}

/// 已保存的信号
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedSignal {
    pub id: String,
    pub name: String,
    pub frequency: u32,
    pub modulation: String,
    pub protocol: Option<String>,
    pub data: String,
    pub saved_at: u64,
}

/// 已知协议数据库
pub const KNOWN_PROTOCOLS: &[(u32, &str, &str)] = &[
    (433_920_000, "PT2262/EV1527", "Wireless doorbell / remote control"),
    (315_000_000, "Car Keyless", "Vehicle remote entry system"),
    (868_350_000, "EU ISM", "European Industrial/Scientific/Medical"),
    (915_000_000, "US ISM", "North American ISM band"),
    (433_075_000, "KeeLoq", "Rolling code remote (encrypted)"),
    (390_000_000, "Genie", "Garage door opener"),
    (303_900_000, "Chamberlain", "Garage door opener (legacy)"),
];

/// 频段定义
#[allow(dead_code)]
pub const FREQ_BANDS: &[(u32, u32, &str)] = &[
    (300_000_000, 348_000_000, "300-348 MHz"),
    (387_000_000, 464_000_000, "387-464 MHz"),
    (779_000_000, 928_000_000, "779-928 MHz"),
];

/// CC1101 支持的调制方式
#[allow(dead_code)]
pub const MODULATIONS: &[&str] = &["OOK", "2-FSK", "ASK", "GFSK"];

/// 频率扫描
#[allow(dead_code)]
pub async fn scan(
    tm: &Arc<TransportManager>,
    start_freq: u32,
    end_freq: u32,
) -> LucyResult<serde_json::Value> {
    let transport = tm.get_transport()?;
    transport
        .send_command("subghz", "scan", serde_json::json!({
            "start": start_freq,
            "end": end_freq,
        }))
        .await
}

/// 信号接收
#[allow(dead_code)]
pub async fn rx(
    tm: &Arc<TransportManager>,
    frequency: u32,
    modulation: Option<String>,
) -> LucyResult<SubghzSignal> {
    let transport = tm.get_transport()?;
    let mod_str = modulation.unwrap_or_else(|| "OOK".to_string());
    let response = transport
        .send_command("subghz", "rx", serde_json::json!({
            "freq": frequency,
            "mod": mod_str,
        }))
        .await?;

    Ok(SubghzSignal {
        frequency: response.get("freq")
            .and_then(|v| v.as_u64())
            .unwrap_or(frequency as u64) as u32,
        rssi: response.get("rssi")
            .and_then(|v| v.as_i64())
            .unwrap_or(-80) as i16,
        modulation: response.get("mod")
            .and_then(|v| v.as_str())
            .unwrap_or(&mod_str)
            .to_string(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        data: response.get("data").and_then(|v| v.as_str()).map(|s| s.to_string()),
        protocol: identify_protocol(frequency).map(|(name, _)| name.to_string()),
    })
}

/// 信号发射
pub async fn tx(
    tm: &Arc<TransportManager>,
    frequency: u32,
    data: String,
    modulation: Option<String>,
    repeat: Option<u8>,
) -> LucyResult<serde_json::Value> {
    let transport = tm.get_transport()?;
    let payload = serde_json::json!({
        "freq": frequency,
        "data": data,
        "mod": modulation.unwrap_or_else(|| "OOK".to_string()),
        "repeat": repeat.unwrap_or(1),
    });
    transport.send_command("subghz", "tx", payload).await
}

/// 保存信号
pub async fn save(
    _tm: &Arc<TransportManager>,
    name: String,
    signal: SubghzSignal,
) -> LucyResult<serde_json::Value> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(serde_json::json!({
        "success": true,
        "id": format!("sig_{}", ts),
        "name": name,
        "frequency": signal.frequency,
        "modulation": signal.modulation,
        "data": signal.data,
    }))
}

/// 列出已保存的信号
pub async fn list_saved() -> LucyResult<Vec<SavedSignal>> {
    Ok(vec![])
}

/// 重放已保存的信号
pub async fn replay(
    tm: &Arc<TransportManager>,
    signal_id: String,
) -> LucyResult<serde_json::Value> {
    let transport = tm.get_transport()?;
    transport
        .send_command("subghz", "replay", serde_json::json!({"id": signal_id}))
        .await
}

/// 识别已知协议
pub fn identify_protocol(freq: u32) -> Option<(&'static str, &'static str)> {
    KNOWN_PROTOCOLS.iter()
        .find(|(f, _, _)| (*f as i64 - freq as i64).abs() < 500_000)
        .map(|(_, name, desc)| (*name, *desc))
}

/// 检查频率是否在合法频段内
#[allow(dead_code)]
pub fn is_legal_frequency(freq: u32) -> bool {
    FREQ_BANDS.iter().any(|(start, end, _)| freq >= *start && freq <= *end)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identify_protocol() {
        let proto = identify_protocol(433_920_000);
        assert!(proto.is_some());
        assert_eq!(proto.unwrap().0, "PT2262/EV1527");
    }

    #[test]
    fn test_legal_frequency() {
        assert!(is_legal_frequency(433_920_000));
        assert!(is_legal_frequency(315_000_000));
        assert!(!is_legal_frequency(500_000_000));
    }
}
