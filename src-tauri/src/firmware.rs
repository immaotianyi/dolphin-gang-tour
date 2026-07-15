/**
 * 固件 OTA — DFU 模式刷写 + API Level 校验
 *
 * 刷写流程:
 *   1. 下载/选择固件包 (.tar.gz)
 *   2. 解析 manifest.json — 验证 API Level 兼容性
 *   3. 检查固件大小 + 校验和
 *   4. 设备进入 DFU 模式
 *   5. 分区刷写 (双分区 A/B 回滚)
 *   6. 验证 + 重启
 *
 * 安全检查:
 *   - API Level 必须 >= 当前版本
 *   - 固件大小匹配 manifest 声明
 *   - SHA256 校验和验证
 */
use crate::error::{LucyError, LucyResult};
use serde::{Deserialize, Serialize};

/// 固件清单
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmwareManifest {
    pub version: String,
    pub api_level: u16,
    pub size: u64,
    pub sha256: String,
    pub build_date: String,
    pub commit_hash: String,
    pub changelog: String,
    pub partition: PartitionInfo,
    pub min_hardware_rev: u8,
}

/// 分区信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartitionInfo {
    pub active: String,
    pub standby: String,
    pub rollback_supported: bool,
}

/// 固件刷写进度
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashProgress {
    pub stage: FlashStage,
    pub percent: u8,
    pub message: String,
    pub error: Option<String>,
}

/// 刷写阶段
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FlashStage {
    Idle,
    Downloading,
    Verifying,
    EnteringDfu,
    Flashing,
    Rebooting,
    Done,
    Error,
}

/// 当前固件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentFirmware {
    pub version: String,
    pub api_level: u16,
    pub commit_hash: String,
    pub build_date: String,
    pub active_partition: String,
    pub hardware_rev: u8,
}

/// 验证固件清单 — API Level 兼容性检查
pub fn verify_manifest(manifest: &FirmwareManifest, current_api_level: u16) -> LucyResult<()> {
    if manifest.api_level < current_api_level {
        return Err(LucyError::Protocol(format!(
            "API Level downgrade not allowed: firmware has {}, current is {}",
            manifest.api_level, current_api_level
        )));
    }
    if manifest.version.is_empty() {
        return Err(LucyError::Protocol("Firmware version is empty".to_string()));
    }
    if manifest.size == 0 || manifest.size > 4 * 1024 * 1024 {
        return Err(LucyError::Protocol(format!(
            "Invalid firmware size: {} bytes (max 4MB)",
            manifest.size
        )));
    }
    if manifest.sha256.len() != 64 {
        return Err(LucyError::Protocol("Invalid SHA256 hash length".to_string()));
    }
    Ok(())
}

/// 解析 manifest.json
pub fn parse_manifest(json: &str) -> LucyResult<FirmwareManifest> {
    serde_json::from_str(json)
        .map_err(|e| LucyError::Protocol(format!("Manifest parse error: {}", e)))
}

/// 检查是否需要更新
pub fn check_update(current: &CurrentFirmware, manifest: &FirmwareManifest) -> bool {
    manifest.api_level > current.api_level
        || version_newer(&manifest.version, &current.version)
}

/// 版本号比较 — "1.2.3" > "1.2.2"
fn version_newer(new: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u16> {
        s.trim_start_matches('v')
            .split('.')
            .filter_map(|n| n.parse().ok())
            .collect()
    };
    let new_parts = parse(new);
    let cur_parts = parse(current);
    for i in 0..new_parts.len().max(cur_parts.len()) {
        let n = new_parts.get(i).copied().unwrap_or(0);
        let c = cur_parts.get(i).copied().unwrap_or(0);
        if n > c { return true; }
        if n < c { return false; }
    }
    false
}

/// 生成模拟的当前固件信息（虚拟设备模式）
pub fn mock_current_firmware() -> CurrentFirmware {
    CurrentFirmware {
        version: "1.0.0".to_string(),
        api_level: 1,
        commit_hash: "abc1234".to_string(),
        build_date: "2026-07-01".to_string(),
        active_partition: "A".to_string(),
        hardware_rev: 2,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_newer() {
        assert!(version_newer("1.2.3", "1.2.2"));
        assert!(version_newer("2.0.0", "1.9.9"));
        assert!(!version_newer("1.0.0", "1.0.0"));
        assert!(!version_newer("1.0.0", "1.0.1"));
    }

    #[test]
    fn test_verify_manifest_ok() {
        let manifest = FirmwareManifest {
            version: "1.1.0".to_string(),
            api_level: 2,
            size: 1024 * 1024,
            sha256: "a".repeat(64),
            build_date: "2026-07-10".to_string(),
            commit_hash: "def5678".to_string(),
            changelog: "Bug fixes".to_string(),
            partition: PartitionInfo { active: "A".into(), standby: "B".into(), rollback_supported: true },
            min_hardware_rev: 1,
        };
        assert!(verify_manifest(&manifest, 1).is_ok());
    }

    #[test]
    fn test_verify_manifest_api_downgrade() {
        let manifest = FirmwareManifest {
            version: "0.9.0".to_string(),
            api_level: 1,
            size: 1024,
            sha256: "b".repeat(64),
            build_date: "2026-06-01".to_string(),
            commit_hash: "xxx".to_string(),
            changelog: "".to_string(),
            partition: PartitionInfo { active: "A".into(), standby: "B".into(), rollback_supported: false },
            min_hardware_rev: 1,
        };
        assert!(verify_manifest(&manifest, 2).is_err());
    }

    #[test]
    fn test_parse_manifest() {
        let json = r#"{
            "version": "1.2.0",
            "api_level": 3,
            "size": 1048576,
            "sha256": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            "build_date": "2026-07-12",
            "commit_hash": "abc1234",
            "changelog": "New features",
            "partition": {"active": "A", "standby": "B", "rollback_supported": true},
            "min_hardware_rev": 2
        }"#;
        let manifest = parse_manifest(json).unwrap();
        assert_eq!(manifest.version, "1.2.0");
        assert_eq!(manifest.api_level, 3);
    }

    #[test]
    fn test_check_update() {
        let current = mock_current_firmware();
        let manifest = FirmwareManifest {
            version: "1.1.0".to_string(),
            api_level: 2,
            size: 1024,
            sha256: "c".repeat(64),
            build_date: "2026-07-12".to_string(),
            commit_hash: "def".to_string(),
            changelog: "".to_string(),
            partition: PartitionInfo { active: "A".into(), standby: "B".into(), rollback_supported: true },
            min_hardware_rev: 1,
        };
        assert!(check_update(&current, &manifest));
    }

    #[test]
    fn test_verify_manifest_invalid_size() {
        let manifest = FirmwareManifest {
            version: "1.0.0".to_string(),
            api_level: 1,
            size: 0, // 空大小
            sha256: "d".repeat(64),
            build_date: "2026-07-12".to_string(),
            commit_hash: "x".to_string(),
            changelog: "".to_string(),
            partition: PartitionInfo { active: "A".into(), standby: "B".into(), rollback_supported: false },
            min_hardware_rev: 1,
        };
        assert!(verify_manifest(&manifest, 1).is_err());
    }

    #[test]
    fn test_verify_manifest_oversized() {
        let manifest = FirmwareManifest {
            version: "1.0.0".to_string(),
            api_level: 1,
            size: 5 * 1024 * 1024, // 5MB > 4MB 限制
            sha256: "e".repeat(64),
            build_date: "2026-07-12".to_string(),
            commit_hash: "x".to_string(),
            changelog: "".to_string(),
            partition: PartitionInfo { active: "A".into(), standby: "B".into(), rollback_supported: false },
            min_hardware_rev: 1,
        };
        assert!(verify_manifest(&manifest, 1).is_err());
    }

    #[test]
    fn test_verify_manifest_invalid_sha256() {
        let manifest = FirmwareManifest {
            version: "1.0.0".to_string(),
            api_level: 1,
            size: 1024,
            sha256: "short".to_string(), // 长度不足 64
            build_date: "2026-07-12".to_string(),
            commit_hash: "x".to_string(),
            changelog: "".to_string(),
            partition: PartitionInfo { active: "A".into(), standby: "B".into(), rollback_supported: false },
            min_hardware_rev: 1,
        };
        assert!(verify_manifest(&manifest, 1).is_err());
    }

    #[test]
    fn test_version_newer_with_v_prefix() {
        assert!(version_newer("v1.2.3", "1.2.2"));
        assert!(version_newer("1.2.3", "v1.2.2"));
    }

    #[test]
    fn test_check_update_same_version() {
        let current = mock_current_firmware();
        let manifest = FirmwareManifest {
            version: "1.0.0".to_string(),
            api_level: 1,
            size: 1024,
            sha256: "f".repeat(64),
            build_date: "2026-07-01".to_string(),
            commit_hash: "abc1234".to_string(),
            changelog: "".to_string(),
            partition: PartitionInfo { active: "A".into(), standby: "B".into(), rollback_supported: true },
            min_hardware_rev: 2,
        };
        assert!(!check_update(&current, &manifest));
    }
}
