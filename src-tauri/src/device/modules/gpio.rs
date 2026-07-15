/**
 * GPIO 模块 — 通用 IO 引脚控制
 *
 * 硬件: TXB0108 电平转换器 (3.3V ↔ 5V) + TPD4E05U06 TVS 保护 + 200mA PTC 保险丝
 *
 * 引脚映射 (ESP32-S3):
 *   GPIO1 (ADC1_CH0)  — 模数转换输入
 *   GPIO2 (ADC1_CH1)  — 模数转换输入
 *   GPIO3 (UART_TX)   — 串口发送
 *   GPIO4 (UART_RX)   — 串口接收
 *   GPIO5 (I2C_SCL)   — I2C 时钟
 *   GPIO6 (I2C_SDA)   — I2C 数据
 *   GPIO7 (SPI_MOSI)  — SPI 主出从入
 *   GPIO8 (SPI_MISO)  — SPI 主入从出
 *
 * 安全限制:
 *   - TXB0108 每通道 ~4kΩ 内阻，仅适合逻辑信号
 *   - 最大驱动电流 < 5mA (LED 指示灯级别)
 *   - 不适合继电器/电机/大功率 LED
 */
use crate::error::LucyResult;
use serde::{Deserialize, Serialize};
use super::super::transport_manager::TransportManager;
use std::sync::Arc;

/// 引脚方向
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PinDirection {
    Input,
    Output,
    Disabled,
}

/// 引脚信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinInfo {
    pub id: u8,
    pub name: String,
    pub signal: String,
    pub direction: PinDirection,
    pub value: bool,
    pub voltage: f32,
}

/// 逻辑分析仪采样数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogicCapture {
    pub pin: u8,
    pub sample_rate: u32, // Hz
    pub duration_ms: u32,
    pub samples: Vec<bool>,
    pub transitions: u32,
}

/// 已知引脚配置
pub fn pin_layout() -> Vec<PinInfo> {
    vec![
        PinInfo { id: 1, name: "GPIO1".to_string(), signal: "ADC1_CH0".to_string(), direction: PinDirection::Input, value: false, voltage: 0.0 },
        PinInfo { id: 2, name: "GPIO2".to_string(), signal: "ADC1_CH1".to_string(), direction: PinDirection::Input, value: false, voltage: 0.0 },
        PinInfo { id: 3, name: "GPIO3".to_string(), signal: "UART_TX".to_string(), direction: PinDirection::Output, value: false, voltage: 0.0 },
        PinInfo { id: 4, name: "GPIO4".to_string(), signal: "UART_RX".to_string(), direction: PinDirection::Input, value: false, voltage: 0.0 },
        PinInfo { id: 5, name: "GPIO5".to_string(), signal: "I2C_SCL".to_string(), direction: PinDirection::Output, value: false, voltage: 0.0 },
        PinInfo { id: 6, name: "GPIO6".to_string(), signal: "I2C_SDA".to_string(), direction: PinDirection::Disabled, value: false, voltage: 0.0 },
        PinInfo { id: 7, name: "GPIO7".to_string(), signal: "SPI_MOSI".to_string(), direction: PinDirection::Disabled, value: false, voltage: 0.0 },
        PinInfo { id: 8, name: "GPIO8".to_string(), signal: "SPI_MISO".to_string(), direction: PinDirection::Disabled, value: false, voltage: 0.0 },
    ]
}

/// 安全模块模板
#[allow(dead_code)]
pub const MODULE_TEMPLATES: &[(&str, u8, &str, &str, bool)] = &[
    // (name, pins, voltage, current, safe)
    ("LED", 1, "3.3V", "20mA", false),
    ("Button", 1, "3.3V", "0.1mA", true),
    ("DHT11", 1, "3.3V", "1mA", true),
    ("Servo", 1, "5V", "200mA", false),
    ("Relay", 1, "5V", "70mA", false),
    ("Buzzer", 1, "5V", "30mA", false),
];

/// 扫描引脚布局
pub fn scan_pins() -> Vec<PinInfo> {
    pin_layout()
}

/// 设置引脚方向
#[allow(dead_code)]
pub async fn set_direction(
    tm: &Arc<TransportManager>,
    pin: u8,
    direction: PinDirection,
) -> LucyResult<serde_json::Value> {
    let transport = tm.get_transport()?;
    let dir_str = match direction {
        PinDirection::Input => "in",
        PinDirection::Output => "out",
        PinDirection::Disabled => "off",
    };
    transport
        .send_command("gpio", "set_dir", serde_json::json!({"pin": pin, "dir": dir_str}))
        .await
}

/// 设置引脚输出值
#[allow(dead_code)]
pub async fn set_value(
    tm: &Arc<TransportManager>,
    pin: u8,
    value: bool,
) -> LucyResult<serde_json::Value> {
    let transport = tm.get_transport()?;
    transport
        .send_command("gpio", "set_val", serde_json::json!({"pin": pin, "val": value as u8}))
        .await
}

/// 读取引脚值
#[allow(dead_code)]
pub async fn read(
    tm: &Arc<TransportManager>,
    pin: u8,
) -> LucyResult<bool> {
    let transport = tm.get_transport()?;
    let response = transport
        .send_command("gpio", "read", serde_json::json!({"pin": pin}))
        .await?;
    Ok(response.get("val")
        .and_then(|v| v.as_u64())
        .map(|v| v != 0)
        .unwrap_or(false))
}

/// 读取 ADC 值
pub async fn read_adc(
    tm: &Arc<TransportManager>,
    pin: u8,
) -> LucyResult<f32> {
    let transport = tm.get_transport()?;
    let response = transport
        .send_command("gpio", "read_adc", serde_json::json!({"pin": pin}))
        .await?;
    Ok(response.get("voltage")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0) as f32)
}

/// 逻辑分析仪采样
pub async fn capture(
    tm: &Arc<TransportManager>,
    pin: u8,
    sample_rate: u32,
    duration_ms: u32,
) -> LucyResult<LogicCapture> {
    let transport = tm.get_transport()?;
    let response = transport
        .send_command("gpio", "capture", serde_json::json!({
            "pin": pin,
            "rate": sample_rate,
            "duration": duration_ms,
        }))
        .await?;

    // 解析采样数据
    let samples: Vec<bool> = response.get("samples")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|s| s.as_u64().map(|v| v != 0)).collect())
        .unwrap_or_default();

    let transitions = samples.windows(2)
        .filter(|w| w[0] != w[1])
        .count() as u32;

    Ok(LogicCapture {
        pin,
        sample_rate,
        duration_ms,
        samples,
        transitions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_pins() {
        let pins = scan_pins();
        assert_eq!(pins.len(), 8);
        assert_eq!(pins[0].name, "GPIO1");
    }
}
