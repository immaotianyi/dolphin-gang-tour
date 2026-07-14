/**
 * IR 模块 — 红外遥控学习与发射
 *
 * 硬件: 940nm IR LED + TSOP38238 接收器
 *
 * 支持协议:
 *   NEC     — 32-bit, 38kHz, 9ms+4.5ms 引导码 (最常见的电视/空调遥控)
 *   RC5     — 14-bit, 36kHz, Manchester 编码 (飞利浦系)
 *   RC6     — 20-bit, 36kHz, Manchester + 双相 (Philips 扩展)
 *   Samsung — 32-bit, 38kHz, 类似 NEC 但引导码不同
 *   Sony    — 12/15/20-bit, 40kHz, PWM 编码
 *   Raw     — 原始时序数据，用于未知协议
 *
 * 命令集:
 *   learn     — 学习红外信号（监听并记录时序）
 *   transmit  — 发射红外信号
 *   protocols — 列出已知协议
 *   list      — 列出已保存的信号
 *   save      — 保存学习到的信号
 */
use crate::error::LucyResult;
use serde::{Deserialize, Serialize};
use super::super::transport_manager::TransportManager;
use std::sync::Arc;

/// IR 协议类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum IrProtocol {
    Nec,
    Rc5,
    Rc6,
    Samsung,
    Sony,
    Raw,
}

/// IR 信号
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrSignal {
    pub protocol: String,
    pub address: u16,
    pub command: u16,
    pub raw_data: Vec<u32>, // 微秒时序数组
    pub frequency: u32,     // 载波频率 (通常 38kHz)
}

/// 已保存的 IR 信号
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedIrSignal {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub address: u16,
    pub command: u16,
    pub device_type: String, // "TV" | "AC" | "STB" | "DVD" | "Other"
    pub saved_at: u64,
}

/// IR 协议描述
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolInfo {
    pub name: String,
    pub frequency: u32,
    pub bits: u8,
    pub encoding: String,
    pub description: String,
}

/// 已知 IR 协议数据库
pub fn ir_protocols() -> Vec<ProtocolInfo> {
    vec![
        ProtocolInfo {
            name: "NEC".to_string(), frequency: 38_000, bits: 32,
            encoding: "PPM".to_string(),
            description: "Most common IR protocol (TVs, audio, AC)".to_string(),
        },
        ProtocolInfo {
            name: "RC5".to_string(), frequency: 36_000, bits: 14,
            encoding: "Manchester".to_string(),
            description: "Philips protocol (older devices)".to_string(),
        },
        ProtocolInfo {
            name: "RC6".to_string(), frequency: 36_000, bits: 20,
            encoding: "Manchester+Biphase".to_string(),
            description: "Philips extended protocol".to_string(),
        },
        ProtocolInfo {
            name: "Samsung".to_string(), frequency: 38_000, bits: 32,
            encoding: "PPM".to_string(),
            description: "Samsung TVs and appliances".to_string(),
        },
        ProtocolInfo {
            name: "Sony".to_string(), frequency: 40_000, bits: 12,
            encoding: "PWM".to_string(),
            description: "Sony devices (SIRC)".to_string(),
        },
        ProtocolInfo {
            name: "Raw".to_string(), frequency: 38_000, bits: 0,
            encoding: "Raw timing".to_string(),
            description: "Raw timing capture for unknown protocols".to_string(),
        },
    ]
}

/// 常见遥控器按键映射 (NEC 协议)
pub const COMMON_REMOTES: &[(&str, u16, &[(u16, &str)])] = &[
    ("TV (Samsung)", 0x07, &[
        (0x02, "Power"),
        (0x01, "Source"),
        (0x0B, "Volume Up"),
        (0x0C, "Volume Down"),
        (0x0E, "Mute"),
        (0x09, "Channel Up"),
        (0x08, "Channel Down"),
        (0x58, "Menu"),
        (0x1A, "OK"),
        (0x45, "Up"),
        (0x46, "Down"),
        (0x47, "Left"),
        (0x44, "Right"),
        (0x4B, "Back"),
    ]),
    ("TV (LG)", 0x04, &[
        (0x08, "Power"),
        (0x0B, "Volume Up"),
        (0x0C, "Volume Down"),
        (0x0E, "Mute"),
        (0x09, "Channel Up"),
        (0x08, "Channel Down"),
    ]),
    ("AC (Generic)", 0x00, &[
        (0x01, "Power"),
        (0x02, "Mode"),
        (0x03, "Temperature Up"),
        (0x04, "Temperature Down"),
        (0x05, "Fan Speed"),
    ]),
];

/// 学习红外信号
#[allow(dead_code)]
pub async fn learn(tm: &Arc<TransportManager>) -> LucyResult<IrSignal> {
    let transport = tm.get_transport()?;
    let response = transport
        .send_command("ir", "learn", serde_json::json!({}))
        .await?;

    let protocol = response.get("protocol")
        .and_then(|v| v.as_str())
        .unwrap_or("Raw")
        .to_string();

    let raw_data: Vec<u32> = response.get("raw")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|s| s.as_u64().map(|v| v as u32)).collect())
        .unwrap_or_default();

    Ok(IrSignal {
        protocol: protocol.clone(),
        address: response.get("address").and_then(|v| v.as_u64()).unwrap_or(0) as u16,
        command: response.get("command").and_then(|v| v.as_u64()).unwrap_or(0) as u16,
        raw_data,
        frequency: response.get("freq").and_then(|v| v.as_u64()).unwrap_or(38_000) as u32,
    })
}

/// 发射红外信号
#[allow(dead_code)]
pub async fn transmit(
    tm: &Arc<TransportManager>,
    signal: &IrSignal,
) -> LucyResult<serde_json::Value> {
    let transport = tm.get_transport()?;
    transport
        .send_command("ir", "transmit", serde_json::json!({
            "protocol": signal.protocol,
            "address": signal.address,
            "command": signal.command,
            "raw": signal.raw_data,
            "freq": signal.frequency,
        }))
        .await
}

/// 列出已知协议
pub fn list_protocols() -> Vec<ProtocolInfo> {
    ir_protocols()
}

/// 列出已保存的 IR 信号
pub async fn list_saved() -> LucyResult<Vec<SavedIrSignal>> {
    Ok(vec![])
}

/// 保存 IR 信号
pub async fn save(
    _tm: &Arc<TransportManager>,
    name: String,
    signal: IrSignal,
    device_type: String,
) -> LucyResult<serde_json::Value> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(serde_json::json!({
        "success": true,
        "id": format!("ir_{}", ts),
        "name": name,
        "protocol": signal.protocol,
        "address": signal.address,
        "command": signal.command,
        "device_type": device_type,
    }))
}

/// 获取常见遥控器预设
pub fn get_remote_presets() -> Vec<(String, String, Vec<(u16, String)>)> {
    COMMON_REMOTES
        .iter()
        .map(|(name, addr, keys)| {
            (
                name.to_string(),
                format!("0x{:04X}", addr),
                keys.iter().map(|(code, label)| (*code, label.to_string())).collect(),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_protocols() {
        let protocols = list_protocols();
        assert!(protocols.len() >= 5);
        assert!(protocols.iter().any(|p| p.name == "NEC"));
    }

    #[test]
    fn test_remote_presets() {
        let presets = get_remote_presets();
        assert!(!presets.is_empty());
    }
}
