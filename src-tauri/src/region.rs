/**
 * RegionService — SubGHz 地区频段合规校验
 *
 * 各地区对 SubGHz 发射有不同的法规限制:
 *   - US (FCC Part 15): 300-928MHz ISM bands, 允许 315/433/915MHz
 *   - EU (ETSI EN 300-220): 433MHz, 868MHz ISM, 发射功率限制
 *   - JP (ARIB): 315MHz, 426MHz, 特定低功率频段
 *   - CN: 433MHz ISM, 部分频段限制
 *   - Global: 无地区限制模式（教育/研发用）
 *
 * 原则:
 *   - 默认使用 global 模式但显示警告
 *   - tx 前必须校验频率在允许列表中
 *   - rx（接收）不受频段限制
 *   - 禁止频率列表: 紧急服务、航空、公共安全频段
 */
use serde::{Deserialize, Serialize};
use std::sync::RwLock;

/// 地区枚举
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Region {
    Us,
    Eu,
    Jp,
    Cn,
    Global,
}

impl Region {
    pub fn as_str(&self) -> &'static str {
        match self {
            Region::Us => "US",
            Region::Eu => "EU",
            Region::Jp => "JP",
            Region::Cn => "CN",
            Region::Global => "GLOBAL",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "US" | "USA" | "FCC" => Region::Us,
            "EU" | "CE" | "ETSI" => Region::Eu,
            "JP" | "JAPAN" | "ARIB" => Region::Jp,
            "CN" | "CHINA" => Region::Cn,
            _ => Region::Global,
        }
    }

    pub fn label_zh(&self) -> &'static str {
        match self {
            Region::Us => "美国 (FCC)",
            Region::Eu => "欧盟 (CE)",
            Region::Jp => "日本 (ARIB)",
            Region::Cn => "中国",
            Region::Global => "全球（无限制）",
        }
    }
}

/// 频段范围
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrequencyBand {
    pub start: u32,
    pub end: u32,
    pub name: String,
    pub max_power_dbm: i8,
    pub allowed: bool,
}

/// 校验结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrequencyCheck {
    pub allowed: bool,
    pub frequency: u32,
    pub band: Option<String>,
    pub reason: String,
    pub region: String,
}

/// 全局当前地区设置
static CURRENT_REGION: RwLock<Region> = RwLock::new(Region::Global);

/// 设置当前地区
pub fn set_region(region: Region) {
    let mut r = CURRENT_REGION.write().unwrap();
    *r = region;
}

/// 获取当前地区
pub fn get_region() -> Region {
    *CURRENT_REGION.read().unwrap()
}

/// 获取各地区允许的频段
pub fn allowed_bands(region: Region) -> Vec<FrequencyBand> {
    match region {
        Region::Us => vec![
            FrequencyBand { start: 300_000_000, end: 322_000_000, name: "315MHz ISM".into(), max_power_dbm: -1, allowed: true },
            FrequencyBand { start: 432_000_000, end: 438_000_000, name: "433MHz ISM (HAM)".into(), max_power_dbm: -1, allowed: true },
            FrequencyBand { start: 902_000_000, end: 928_000_000, name: "915MHz ISM".into(), max_power_dbm: 30, allowed: true },
        ],
        Region::Eu => vec![
            FrequencyBand { start: 433_050_000, end: 434_790_000, name: "433MHz ISM".into(), max_power_dbm: 10, allowed: true },
            FrequencyBand { start: 868_000_000, end: 870_000_000, name: "868MHz ISM".into(), max_power_dbm: 25, allowed: true },
        ],
        Region::Jp => vec![
            FrequencyBand { start: 312_000_000, end: 315_250_000, name: "315MHz 低功率".into(), max_power_dbm: -6, allowed: true },
            FrequencyBand { start: 426_000_000, end: 426_250_000, name: "426MHz 特定低功率".into(), max_power_dbm: -6, allowed: true },
        ],
        Region::Cn => vec![
            FrequencyBand { start: 433_000_000, end: 434_790_000, name: "433MHz ISM".into(), max_power_dbm: 10, allowed: true },
            FrequencyBand { start: 470_000_000, end: 510_000_000, name: "470-510MHz 微功率".into(), max_power_dbm: -6, allowed: true },
        ],
        Region::Global => vec![
            FrequencyBand { start: 281_000_000, end: 361_000_000, name: "300-360MHz 通用".into(), max_power_dbm: 0, allowed: true },
            FrequencyBand { start: 378_000_000, end: 481_000_000, name: "380-480MHz 通用".into(), max_power_dbm: 0, allowed: true },
            FrequencyBand { start: 749_000_000, end: 962_000_000, name: "750-960MHz 通用".into(), max_power_dbm: 0, allowed: true },
        ],
    }
}

/// 禁止发射的频率范围（全球通用，紧急服务/航空/海事）
pub fn forbidden_bands() -> Vec<(u32, u32, &'static str)> {
    vec![
        (108_000_000, 137_000_000, "航空频段"),
        (156_000_000, 163_000_000, "海事 VHF"),
        (240_000_000, 285_000_000, "军事/航空"),
        (380_000_000, 399_900_000, "TETRA/公共安全"),
        (960_000_000, 1_215_000_000, "航空导航/GPS"),
    ]
}

/// 校验频率是否允许在当前地区发射
pub fn check_tx_frequency(freq: u32) -> FrequencyCheck {
    let region = get_region();

    // 先检查禁止频段
    for (start, end, reason) in forbidden_bands() {
        if freq >= start && freq <= end {
            return FrequencyCheck {
                allowed: false,
                frequency: freq,
                band: None,
                reason: format!("禁止发射: {} ({} MHz - {} MHz)", reason, start / 1_000_000, end / 1_000_000),
                region: region.as_str().to_string(),
            };
        }
    }

    // 检查当前地区允许频段
    let bands = allowed_bands(region);
    for band in &bands {
        if freq >= band.start && freq <= band.end {
            return FrequencyCheck {
                allowed: true,
                frequency: freq,
                band: Some(band.name.clone()),
                reason: format!("频率在允许范围内: {} ({} dBm max)", band.name, band.max_power_dbm),
                region: region.as_str().to_string(),
            };
        }
    }

    // global 模式下额外说明
    let reason = if region == Region::Global {
        format!("Global 模式下允许发射，但请注意当地法规。建议切换到您所在地区以获取合规引导。")
    } else {
        format!("频率 {} MHz 不在 {} 允许的 ISM 频段内", freq as f32 / 1_000_000.0, region.label_zh())
    };

    FrequencyCheck {
        allowed: region == Region::Global, // Global 模式允许但警告
        frequency: freq,
        band: None,
        reason,
        region: region.as_str().to_string(),
    }
}

/// 列出所有地区及其描述
pub fn list_regions() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({"code": "us", "name": Region::Us.label_zh(), "bands": allowed_bands(Region::Us)}),
        serde_json::json!({"code": "eu", "name": Region::Eu.label_zh(), "bands": allowed_bands(Region::Eu)}),
        serde_json::json!({"code": "jp", "name": Region::Jp.label_zh(), "bands": allowed_bands(Region::Jp)}),
        serde_json::json!({"code": "cn", "name": Region::Cn.label_zh(), "bands": allowed_bands(Region::Cn)}),
        serde_json::json!({"code": "global", "name": Region::Global.label_zh(), "bands": allowed_bands(Region::Global), "warning": "无限制模式，仅用于教育/研发"}),
    ]
}

/// 获取频率扫描的推荐范围（按地区）
#[allow(dead_code)]
pub fn scan_range(region: Option<Region>) -> (u32, u32) {
    let r = region.unwrap_or_else(get_region);
    match r {
        Region::Us => (300_000_000, 928_000_000),
        Region::Eu => (433_000_000, 870_000_000),
        Region::Jp => (300_000_000, 450_000_000),
        Region::Cn => (300_000_000, 520_000_000),
        Region::Global => (300_000_000, 928_000_000),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_forbidden_aviation_band() {
        set_region(Region::Global);
        let result = check_tx_frequency(120_000_000); // 航空频段
        assert!(!result.allowed);
        assert!(result.reason.contains("航空"));
    }

    #[test]
    fn test_forbidden_public_safety() {
        set_region(Region::Us);
        let result = check_tx_frequency(390_000_000); // TETRA/公共安全
        assert!(!result.allowed);
    }

    #[test]
    fn test_us_allowed_433() {
        set_region(Region::Us);
        let result = check_tx_frequency(433_920_000);
        assert!(result.allowed);
    }

    #[test]
    fn test_eu_868() {
        set_region(Region::Eu);
        let result = check_tx_frequency(868_350_000);
        assert!(result.allowed);
    }

    #[test]
    fn test_eu_315_forbidden() {
        set_region(Region::Eu);
        let result = check_tx_frequency(315_000_000); // EU 不允许 315MHz
        assert!(!result.allowed);
    }

    #[test]
    fn test_global_allows_315() {
        set_region(Region::Global);
        let result = check_tx_frequency(315_000_000);
        assert!(result.allowed);
    }

    #[test]
    fn test_cn_433() {
        set_region(Region::Cn);
        let result = check_tx_frequency(433_920_000);
        assert!(result.allowed);
    }

    #[test]
    fn test_region_from_str() {
        assert_eq!(Region::from_str("US"), Region::Us);
        assert_eq!(Region::from_str("eu"), Region::Eu);
        assert_eq!(Region::from_str("cn"), Region::Cn);
        assert_eq!(Region::from_str("UNKNOWN"), Region::Global);
    }

    #[test]
    fn test_scan_range() {
        let (start, end) = scan_range(Some(Region::Eu));
        assert_eq!(start, 433_000_000);
        assert_eq!(end, 870_000_000);
    }
}
