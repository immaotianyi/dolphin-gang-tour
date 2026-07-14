/**
 * MessagePack 协议帧编解码
 *
 * 帧格式: [magic(0xAA55)] [version(u8)] [length(u16)] [payload(msgpack)] [crc16(u16)]
 */

use crate::error::{LucyError, LucyResult};

pub const MAGIC: [u8; 2] = [0xAA, 0x55];
pub const PROTOCOL_VERSION: u8 = 1;
pub const MAX_FRAME_SIZE: usize = 128 * 1024; // 128KB

/// 编码请求帧
pub fn encode_request(
    id: u16,
    module: &str,
    op: &str,
    data: &serde_json::Value,
) -> LucyResult<Vec<u8>> {
    let payload = serde_json::json!({
        "id": id,
        "mod": module,
        "op": op,
        "data": data,
    });

    let payload_bytes = rmp_serde::to_vec_named(&payload)
        .map_err(|e| LucyError::Protocol(format!("MessagePack encode error: {}", e)))?;

    if payload_bytes.len() > MAX_FRAME_SIZE {
        return Err(LucyError::Protocol(format!(
            "Frame too large: {} bytes (max {})",
            payload_bytes.len(),
            MAX_FRAME_SIZE
        )));
    }

    // u16 长度字段最大 65535
    if payload_bytes.len() > u16::MAX as usize {
        return Err(LucyError::Protocol(format!(
            "Payload exceeds u16 length limit: {} bytes (max {})",
            payload_bytes.len(),
            u16::MAX
        )));
    }

    let crc = crc16::State::<crc16::ARC>::calculate(&payload_bytes);

    let mut frame = Vec::with_capacity(2 + 1 + 2 + payload_bytes.len() + 2);
    frame.extend_from_slice(&MAGIC);
    frame.push(PROTOCOL_VERSION);
    frame.extend_from_slice(&(payload_bytes.len() as u16).to_le_bytes());
    frame.extend_from_slice(&payload_bytes);
    frame.extend_from_slice(&crc.to_le_bytes());

    Ok(frame)
}

/// 解码响应帧
pub fn decode_response(data: &[u8]) -> LucyResult<serde_json::Value> {
    if data.len() < 7 {
        return Err(LucyError::Protocol(format!(
            "Frame too short: {} bytes",
            data.len()
        )));
    }

    // 验证 magic
    if data[0..2] != MAGIC {
        return Err(LucyError::Protocol("Invalid magic bytes".to_string()));
    }

    let version = data[2];
    if version != PROTOCOL_VERSION {
        return Err(LucyError::Protocol(format!(
            "Protocol version mismatch: got {}, expected {}",
            version, PROTOCOL_VERSION
        )));
    }

    let length = u16::from_le_bytes([data[3], data[4]]) as usize;
    if data.len() < 5 + length + 2 {
        return Err(LucyError::Protocol("Frame length mismatch".to_string()));
    }

    let payload = &data[5..5 + length];
    let crc_bytes = &data[5 + length..5 + length + 2];
    let expected_crc = u16::from_le_bytes([crc_bytes[0], crc_bytes[1]]);
    let actual_crc = crc16::State::<crc16::ARC>::calculate(payload);

    if actual_crc != expected_crc {
        return Err(LucyError::Protocol(format!(
            "CRC mismatch: got 0x{:04X}, expected 0x{:04X}",
            actual_crc, expected_crc
        )));
    }

    let value: serde_json::Value = rmp_serde::from_slice(payload)
        .map_err(|e| LucyError::Protocol(format!("MessagePack decode error: {}", e)))?;

    Ok(value)
}

/// 解析事件帧（设备 → PC 异步推送）
#[allow(dead_code)]
pub fn parse_event(data: &[u8]) -> LucyResult<(String, serde_json::Value)> {
    let value = decode_response(data)?;
    let evt = value
        .get("evt")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let payload = value.get("data").cloned().unwrap_or(serde_json::Value::Null);
    Ok((evt, payload))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_roundtrip() {
        let data = serde_json::json!({"pin": 3, "val": 1});
        let frame = encode_request(42, "gpio", "set_val", &data).unwrap();
        assert!(!frame.is_empty());
        // 帧头: magic(2) + ver(1) + len(2) = 5 bytes
        assert_eq!(&frame[0..2], &MAGIC);
        assert_eq!(frame[2], PROTOCOL_VERSION);

        let decoded = decode_response(&frame).unwrap();
        assert_eq!(decoded["id"], 42);
        assert_eq!(decoded["mod"], "gpio");
        assert_eq!(decoded["op"], "set_val");
        assert_eq!(decoded["data"]["pin"], 3);
        assert_eq!(decoded["data"]["val"], 1);
    }

    #[test]
    fn test_decode_invalid_magic() {
        let bad_frame = vec![0xBB, 0x77, 1, 0, 0, 0, 0];
        assert!(decode_response(&bad_frame).is_err());
    }

    #[test]
    fn test_decode_version_mismatch() {
        let frame = encode_request(1, "nfc", "detect", &serde_json::json!({})).unwrap();
        let mut bad = frame.clone();
        bad[2] = 99; // 错误版本号
        assert!(decode_response(&bad).is_err());
    }

    #[test]
    fn test_decode_crc_mismatch() {
        let frame = encode_request(1, "nfc", "detect", &serde_json::json!({})).unwrap();
        let mut bad = frame.clone();
        // 翻转最后一个字节 (CRC 低位) 破坏校验和
        let last = bad.len() - 1;
        bad[last] ^= 0xFF;
        assert!(decode_response(&bad).is_err());
    }

    #[test]
    fn test_decode_too_short() {
        assert!(decode_response(&[0xAA, 0x55]).is_err());
        assert!(decode_response(&[]).is_err());
    }

    #[test]
    fn test_decode_length_mismatch() {
        let frame = encode_request(1, "nfc", "detect", &serde_json::json!({})).unwrap();
        // 截断帧 (缺少 CRC 字节)
        let truncated = &frame[..frame.len() - 1];
        assert!(decode_response(truncated).is_err());
    }

    #[test]
    fn test_parse_event() {
        // 手动构造事件帧 (设备 → PC 格式，evt 在顶层)
        let event_payload = serde_json::json!({
            "evt": "screen_frame",
            "data": {"width": 240}
        });
        let payload_bytes = rmp_serde::to_vec_named(&event_payload).unwrap();
        let crc = crc16::State::<crc16::ARC>::calculate(&payload_bytes);

        let mut frame = Vec::new();
        frame.extend_from_slice(&MAGIC);
        frame.push(PROTOCOL_VERSION);
        frame.extend_from_slice(&(payload_bytes.len() as u16).to_le_bytes());
        frame.extend_from_slice(&payload_bytes);
        frame.extend_from_slice(&crc.to_le_bytes());

        let (evt, data) = parse_event(&frame).unwrap();
        assert_eq!(evt, "screen_frame");
        assert_eq!(data["width"], 240);
    }

    #[test]
    fn test_encode_large_payload() {
        // 构造较大的 payload (在 u16 范围内)
        let big_string = "x".repeat(50_000);
        let data = serde_json::json!({"data": big_string});
        let frame = encode_request(1, "storage", "read", &data).unwrap();
        assert!(frame.len() > 50_000);
        let decoded = decode_response(&frame).unwrap();
        assert_eq!(decoded["data"]["data"].as_str().unwrap().len(), 50_000);
    }

    #[test]
    fn test_encode_oversized_payload() {
        // 超过 u16 限制的 payload 应该返回错误
        let big_string = "x".repeat(70_000);
        let data = serde_json::json!({"data": big_string});
        assert!(encode_request(1, "storage", "read", &data).is_err());
    }
}
