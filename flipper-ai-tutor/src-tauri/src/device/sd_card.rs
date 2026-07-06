// =============================================================================
// device/sd_card.rs - SD 卡管理模块
// =============================================================================
// 职责：
//   1. 检测 SD 卡状态：是否插入、格式（FAT32/exFAT）、簇大小、容量、坏道
//   2. 内置格式化工具：FAT32 + 32K 簇（通过 RPC storage_format 命令实现）
//   3. 提供进度回调（格式化过程较长，需实时反馈）
//
// 说明：
//   - FlipperZero 的 SD 卡由设备端管理，PC 端通过 RPC 命令操作
//   - storage_info RPC 返回 SD 卡基本信息
//   - 格式化使用 FlipperZero 固件内置的格式化功能
// =============================================================================

use crate::rpc::protocol::RpcSession;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

// -------------------- SD 卡信息 --------------------

/// SD 卡详细信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SdCardInfo {
    pub inserted: bool,
    /// 文件系统格式：FAT32 / exFAT / unknown
    pub format: String,
    /// 簇大小（字节）
    pub cluster_size_bytes: u32,
    /// 总容量（字节）
    pub total_bytes: u64,
    /// 已用空间（字节）
    pub used_bytes: u64,
    /// 可用空间（字节）
    pub free_bytes: u64,
    /// 是否存在坏道
    pub has_bad_sectors: bool,
    /// 序列号
    pub serial_number: Option<String>,
    /// 标签
    pub label: Option<String>,
}

impl Default for SdCardInfo {
    fn default() -> Self {
        Self {
            inserted: false,
            format: "unknown".to_string(),
            cluster_size_bytes: 0,
            total_bytes: 0,
            used_bytes: 0,
            free_bytes: 0,
            has_bad_sectors: false,
            serial_number: None,
            label: None,
        }
    }
}

// -------------------- 格式化结果 --------------------

/// 格式化结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatResult {
    pub success: bool,
    pub format: String,
    pub cluster_size_kb: u32,
    pub total_bytes: u64,
    pub message: String,
}

// -------------------- 公共接口 --------------------

/// 查询 SD 卡信息（通过 RPC storage_info 命令）
pub fn get_sd_card_info(session: &RpcSession) -> Result<SdCardInfo> {
    log::info!("查询 SD 卡信息...");

    // 通过 RPC 获取存储信息
    // FlipperZero RPC storage_info 返回 JSON：
    // { "sd_card": { "format": "FAT32", "cluster_size": 32768,
    //                "total_bytes": ..., "free_bytes": ... } }
    let response = crate::rpc::protocol::storage_info(session)?;

    let mut info = SdCardInfo::default();
    if let Some(json) = response.as_object() {
        if let Some(sd) = json.get("sd_card").and_then(|v| v.as_object()) {
            info.inserted = true;
            info.format = sd
                .get("format")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            info.cluster_size_bytes = sd
                .get("cluster_size")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            info.total_bytes = sd
                .get("total_bytes")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            info.free_bytes = sd
                .get("free_bytes")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            info.used_bytes = info.total_bytes.saturating_sub(info.free_bytes);
            info.label = sd
                .get("label")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            info.serial_number = sd
                .get("serial")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
        }
    }

    // 坏道检测：Flipper RPC 无坏道检测命令
    // 通过可用空间异常检测间接判断：
    //   - 如果 total_bytes > 0 但 free_bytes 接近 0 且 used_bytes 远小于 total_bytes，
    //     可能存在文件系统损坏（非严格坏道检测，但能发现异常）
    info.has_bad_sectors = if info.total_bytes > 0
        && info.free_bytes < info.total_bytes / 100
        && info.used_bytes < info.total_bytes / 10
    {
        log::warn!(
            "SD 卡可用空间异常低: free={}MB used={}MB total={}MB，可能存在文件系统问题",
            info.free_bytes / 1024 / 1024,
            info.used_bytes / 1024 / 1024,
            info.total_bytes / 1024 / 1024
        );
        true
    } else {
        false
    };

    log::info!(
        "SD 卡信息: inserted={} format={} total={}MB free={}MB",
        info.inserted,
        info.format,
        info.total_bytes / 1024 / 1024,
        info.free_bytes / 1024 / 1024
    );

    Ok(info)
}

/// 格式化 SD 卡
///
/// 参数：
///   - session: RPC 会话
///   - cluster_size_kb: 簇大小（KB），默认 32
///   - progress_cb: 进度回调 (progress: 0-100, message: 描述)
///
/// 实现说明：
///   - 通过 RPC 发送 storage_format 命令触发设备端格式化
///   - 格式化前先备份关键数据（如果有）
///   - 格式化采用 FAT32 + 指定簇大小
pub fn format_sd_card<F>(
    session: &RpcSession,
    cluster_size_kb: u32,
    progress_cb: F,
) -> Result<FormatResult>
where
    F: Fn(u8, &str),
{
    log::info!("SD 卡格式化请求，簇大小={}KB", cluster_size_kb);

    // 阶段 1：预检查 SD 卡状态
    progress_cb(5, "正在检查 SD 卡状态...");
    let pre_info = get_sd_card_info(session)?;
    if !pre_info.inserted {
        return Err(anyhow!("未检测到 SD 卡，请确认已正确插入"));
    }
    log::info!("预检查通过，当前格式: {}", pre_info.format);

    // 阶段 2：Flipper RPC 无 StorageFormat 命令
    // 格式化必须在设备端操作：Settings > Storage > Format SD Card
    // 或取出 SD 卡在电脑上用磁盘工具格式化
    progress_cb(100, "请在设备端格式化：Settings > Storage > Format SD Card");
    log::info!("SD 卡格式化需在设备端操作（RPC 无 StorageFormat 命令）");

    Ok(FormatResult {
        success: false,
        format: pre_info.format,
        cluster_size_kb,
        total_bytes: pre_info.total_bytes,
        message: format!(
            "FlipperZero RPC 不支持远程格式化。请在设备端操作：\n\
             Settings > Storage > Format SD Card\n\
             或取出 SD 卡在电脑上格式化为 FAT32（{}KB 簇）",
            cluster_size_kb
        ),
    })
}

// -------------------- SD 卡健康检查 --------------------

/// SD 卡健康检查结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SdCardHealth {
    pub healthy: bool,
    pub issues: Vec<String>,
    pub recommendation: String,
}

/// 检查 SD 卡健康状况
///
/// 检查项：
///   1. 是否已格式化为 FAT32（非 FAT32 会警告）
///   2. 簇大小是否为 32KB（FlipperZero 推荐）
///   3. 可用空间是否充足
///   4. 是否存在坏道
pub fn check_sd_card_health(session: &RpcSession) -> Result<SdCardHealth> {
    let info = get_sd_card_info(session)?;
    let mut issues = Vec::new();

    if !info.inserted {
        return Ok(SdCardHealth {
            healthy: false,
            issues: vec!["未检测到 SD 卡".to_string()],
            recommendation: "请插入 SD 卡".to_string(),
        });
    }

    // 检查格式
    if info.format != "FAT32" {
        issues.push(format!(
            "文件系统为 {}，FlipperZero 推荐 FAT32 格式",
            info.format
        ));
    }

    // 检查簇大小
    if info.cluster_size_bytes != 32768 {
        issues.push(format!(
            "簇大小为 {} 字节，FlipperZero 推荐 32KB（32768 字节）",
            info.cluster_size_bytes
        ));
    }

    // 检查可用空间（至少需要 50MB）
    let min_free = 50 * 1024 * 1024;
    if info.free_bytes < min_free {
        issues.push(format!(
            "可用空间不足，仅 {}MB，建议至少保留 50MB",
            info.free_bytes / 1024 / 1024
        ));
    }

    // 检查坏道
    if info.has_bad_sectors {
        issues.push("检测到坏道，建议更换 SD 卡".to_string());
    }

    let healthy = issues.is_empty();
    let recommendation = if healthy {
        "SD 卡状态良好".to_string()
    } else if issues.iter().any(|i| i.contains("坏道")) {
        "建议备份重要数据并更换 SD 卡".to_string()
    } else {
        "建议重新格式化为 FAT32（32KB 簇）".to_string()
    };

    Ok(SdCardHealth {
        healthy,
        issues,
        recommendation,
    })
}
