// =============================================================================
// diagnostics/mod.rs - 故障诊断模块
// =============================================================================
// 职责：全面检测设备健康状态，返回 DiagnosticResult 列表
//
// 诊断项目：
//   1. 驱动异常：检测 Windows 下 DFU 模式驱动是否正确（libusb/WinUSB）
//   2. 固件损坏：通过 RPC system_get_info 检测固件版本与启动状态
//   3. SD 卡错误：检测格式（FAT32）、簇大小、可用空间、坏道
//   4. 存储不足：检测 SD 卡可用空间是否低于阈值
//   5. 端口占用：检测串口是否被其他程序占用
//   6. 设备连接：检测设备是否在线、模式是否正确
//   7. 电池健康：检测电池电量与电压
//
// 每个 DiagnosticResult 包含：
//   - level: ok / warning / error
//   - category: 分类标签
//   - title: 问题标题
//   - detail: 详细描述
//   - autoFixable: 是否可自动修复
//   - fixAction: 修复动作标识（前端据此调用对应命令）
// =============================================================================

use crate::device::{
    detector, sd_card, DeviceConnectionState, DeviceState,
};
use crate::rpc::protocol::{self, RpcSession};
use anyhow::Result;
use serde::{Deserialize, Serialize};

// -------------------- 诊断结果结构 --------------------

/// 诊断级别，与前端对应
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticLevel {
    Ok,
    Warning,
    Error,
}

/// 诊断结果，与前端 DiagnosticResult 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticResult {
    pub level: DiagnosticLevel,
    pub category: String,
    pub title: String,
    pub detail: String,
    pub auto_fixable: bool,
    /// 修复动作标识（前端据此调用对应 IPC 命令）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix_action: Option<String>,
}

impl DiagnosticResult {
    /// 构造正常结果
    pub fn ok(category: &str, title: &str, detail: impl Into<String>) -> Self {
        Self {
            level: DiagnosticLevel::Ok,
            category: category.to_string(),
            title: title.to_string(),
            detail: detail.into(),
            auto_fixable: false,
            fix_action: None,
        }
    }

    /// 构造警告结果
    pub fn warning(
        category: &str,
        title: &str,
        detail: impl Into<String>,
        auto_fixable: bool,
        fix_action: Option<&str>,
    ) -> Self {
        Self {
            level: DiagnosticLevel::Warning,
            category: category.to_string(),
            title: title.to_string(),
            detail: detail.into(),
            auto_fixable,
            fix_action: fix_action.map(|s| s.to_string()),
        }
    }

    /// 构造错误结果
    pub fn error(
        category: &str,
        title: &str,
        detail: impl Into<String>,
        auto_fixable: bool,
        fix_action: Option<&str>,
    ) -> Self {
        Self {
            level: DiagnosticLevel::Error,
            category: category.to_string(),
            title: title.to_string(),
            detail: detail.into(),
            auto_fixable,
            fix_action: fix_action.map(|s| s.to_string()),
        }
    }
}

// -------------------- 诊断主入口 --------------------

/// 执行全量故障诊断
///
/// 参数：
///   - device_state: 当前设备状态
///   - session: RPC 会话（可选，无会话时跳过需要通信的诊断项）
pub fn run_diagnostics(
    device_state: &DeviceState,
    session: Option<&RpcSession>,
) -> Result<Vec<DiagnosticResult>> {
    log::info!("开始全量故障诊断...");
    let mut results = Vec::new();

    // 1. 设备连接诊断
    diagnose_device_connection(device_state, &mut results);

    // 2. 端口占用诊断
    diagnose_port_occupancy(&mut results);

    // 3. 驱动诊断（Windows）
    diagnose_driver(&mut results);

    // 如果有 RPC 会话，执行深度诊断
    if let Some(s) = session {
        if s.is_active() {
            // 4. 固件诊断
            diagnose_firmware(s, &mut results);

            // 5. SD 卡诊断
            diagnose_sd_card(s, &mut results);

            // 6. 存储空间诊断
            diagnose_storage_space(s, &mut results);

            // 7. 电池健康诊断
            diagnose_battery(s, &mut results);
        }
    } else {
        // 无会话时添加跳过提示
        results.push(DiagnosticResult::warning(
            "device",
            "设备未连接",
            "设备未连接，已跳过固件/SD卡/存储等深度诊断项。请先连接设备后再诊断。",
            false,
            None,
        ));
    }

    // 汇总日志
    let ok_count = results
        .iter()
        .filter(|r| r.level == DiagnosticLevel::Ok)
        .count();
    let warn_count = results
        .iter()
        .filter(|r| r.level == DiagnosticLevel::Warning)
        .count();
    let err_count = results
        .iter()
        .filter(|r| r.level == DiagnosticLevel::Error)
        .count();
    log::info!(
        "诊断完成: {} 正常 / {} 警告 / {} 错误",
        ok_count,
        warn_count,
        err_count
    );

    Ok(results)
}

// -------------------- 各诊断项实现 --------------------

/// 1. 设备连接诊断
fn diagnose_device_connection(
    device_state: &DeviceState,
    results: &mut Vec<DiagnosticResult>,
) {
    match device_state.connection_state {
        DeviceConnectionState::Connected => {
            results.push(DiagnosticResult::ok(
                "device",
                "设备已连接",
                "FlipperZero 设备连接正常，通信畅通。",
            ));
        }
        DeviceConnectionState::NoDevice => {
            results.push(DiagnosticResult::error(
                "device",
                "未检测到设备",
                "未检测到 FlipperZero 设备。请检查：\n1. USB 数据线是否连接（需数据线，非纯充电线）\n2. 设备是否已开机\n3. 尝试更换 USB 接口",
                false,
                None,
            ));
        }
        DeviceConnectionState::DfuMode => {
            results.push(DiagnosticResult::warning(
                "device",
                "设备处于 DFU 模式",
                "设备当前处于 DFU 恢复模式。如需正常使用，请刷写固件后重启。如需救砖，请使用 DFU 刷写功能。",
                true,
                Some("flash_firmware"),
            ));
        }
        DeviceConnectionState::PortBusy => {
            results.push(DiagnosticResult::error(
                "device",
                "串口被占用",
                "FlipperZero 串口被其他程序占用。可能是 qFlipper / Cura / Arduino 等程序。可点击「释放串口」自动结束占用进程。",
                true,
                Some("kill_port_occupier"),
            ));
        }
        DeviceConnectionState::SdError => {
            results.push(DiagnosticResult::warning(
                "device",
                "SD 卡异常",
                "检测到 SD 卡问题，请检查 SD 卡是否正确插入或需要格式化。",
                true,
                Some("format_sd_card"),
            ));
        }
        DeviceConnectionState::Connecting => {
            results.push(DiagnosticResult::ok(
                "device",
                "正在连接",
                "设备正在连接中，请稍候。",
            ));
        }
        DeviceConnectionState::Transferring => {
            results.push(DiagnosticResult::ok(
                "device",
                "传输中",
                "设备正在数据传输中。",
            ));
        }
    }
}

/// 2. 端口占用诊断
fn diagnose_port_occupancy(results: &mut Vec<DiagnosticResult>) {
    let occupiers = detector::scan_port_occupiers();
    if occupiers.is_empty() {
        results.push(DiagnosticResult::ok(
            "port",
            "无端口占用",
            "未检测到占用串口的程序。",
        ));
    } else {
        results.push(DiagnosticResult::error(
            "port",
            "检测到端口占用进程",
            format!(
                "以下程序可能占用串口：{}。建议关闭这些程序后重试，或点击「释放串口」自动结束。",
                occupiers.join(", ")
            ),
            true,
            Some("kill_port_occupier"),
        ));
    }
}

/// 3. 驱动诊断
fn diagnose_driver(results: &mut Vec<DiagnosticResult>) {
    match crate::device::driver::get_driver_status() {
        Ok(status) => {
            if status.driver_installed {
                if status.needs_update {
                    results.push(DiagnosticResult::warning(
                        "driver",
                        "驱动需要更新",
                        format!("当前驱动: {}，建议更新到最新版本。", status.driver_name.unwrap_or_default()),
                        true,
                        Some("install_driver"),
                    ));
                } else {
                    results.push(DiagnosticResult::ok(
                        "driver",
                        "驱动正常",
                        format!("驱动已正确安装: {}", status.driver_name.unwrap_or_default()),
                    ));
                }
            } else {
                results.push(DiagnosticResult::error(
                    "driver",
                    "驱动未安装",
                    format!("{} 平台需要安装驱动才能正常通信。请点击「安装驱动」自动完成。", status.platform),
                    true,
                    Some("install_driver"),
                ));
            }
        }
        Err(e) => {
            results.push(DiagnosticResult::warning(
                "driver",
                "驱动状态未知",
                format!("无法查询驱动状态: {e}"),
                false,
                None,
            ));
        }
    }
}

/// 4. 固件诊断
fn diagnose_firmware(session: &RpcSession, results: &mut Vec<DiagnosticResult>) {
    match protocol::system_get_info(session) {
        Ok(info) => {
            // 检查固件版本
            if info.firmware_version.is_empty() {
                results.push(DiagnosticResult::error(
                    "firmware",
                    "固件版本异常",
                    "无法获取固件版本信息，可能固件损坏。建议重新刷写固件。",
                    true,
                    Some("flash_firmware"),
                ));
            } else {
                results.push(DiagnosticResult::ok(
                    "firmware",
                    "固件正常",
                    format!(
                        "固件版本: {} (API Level {})",
                        info.firmware_version, info.api_level
                    ),
                ));
            }

            // 检查 API Level
            if info.api_level == 0 {
                results.push(DiagnosticResult::warning(
                    "firmware",
                    "API Level 异常",
                    "API Level 为 0，固件可能过旧或损坏。建议刷写最新固件。",
                    true,
                    Some("flash_firmware"),
                ));
            }
        }
        Err(e) => {
            results.push(DiagnosticResult::error(
                "firmware",
                "无法获取固件信息",
                format!("RPC 通信失败，无法获取固件信息: {e}。设备可能未正常启动，建议进入 DFU 模式重新刷写。"),
                true,
                Some("enter_dfu_mode"),
            ));
        }
    }
}

/// 5. SD 卡诊断
fn diagnose_sd_card(session: &RpcSession, results: &mut Vec<DiagnosticResult>) {
    match sd_card::get_sd_card_info(session) {
        Ok(info) => {
            if !info.inserted {
                results.push(DiagnosticResult::error(
                    "sd_card",
                    "未检测到 SD 卡",
                    "SD 卡未插入或未正确识别。请关机后重新插入 SD 卡。FlipperZero 大部分功能依赖 SD 卡。",
                    false,
                    None,
                ));
                return;
            }

            // 检查格式
            if info.format != "FAT32" {
                results.push(DiagnosticResult::warning(
                    "sd_card",
                    "SD 卡格式不正确",
                    format!(
                        "当前格式: {}，FlipperZero 推荐 FAT32 格式。建议重新格式化。",
                        info.format
                    ),
                    true,
                    Some("format_sd_card"),
                ));
            } else {
                results.push(DiagnosticResult::ok(
                    "sd_card",
                    "SD 卡格式正确",
                    format!(
                        "FAT32 格式，总容量 {} MB",
                        info.total_bytes / 1024 / 1024
                    ),
                ));
            }

            // 检查簇大小
            if info.cluster_size_bytes != 32768 && info.inserted {
                results.push(DiagnosticResult::warning(
                    "sd_card",
                    "簇大小非推荐值",
                    format!(
                        "当前簇大小: {} 字节，推荐 32KB（32768 字节）以获得最佳性能。",
                        info.cluster_size_bytes
                    ),
                    true,
                    Some("format_sd_card"),
                ));
            }

            // 检查坏道
            if info.has_bad_sectors {
                results.push(DiagnosticResult::error(
                    "sd_card",
                    "检测到 SD 卡坏道",
                    "SD 卡存在坏道，可能导致数据丢失。强烈建议更换 SD 卡。",
                    false,
                    None,
                ));
            }
        }
        Err(e) => {
            results.push(DiagnosticResult::warning(
                "sd_card",
                "SD 卡状态未知",
                format!("无法获取 SD 卡信息: {e}"),
                false,
                None,
            ));
        }
    }
}

/// 6. 存储空间诊断
fn diagnose_storage_space(session: &RpcSession, results: &mut Vec<DiagnosticResult>) {
    match sd_card::get_sd_card_info(session) {
        Ok(info) => {
            if !info.inserted {
                return; // 已在 SD 卡诊断中报告
            }

            let free_mb = info.free_bytes / 1024 / 1024;
            let total_mb = info.total_bytes / 1024 / 1024;
            let used_percent = if info.total_bytes > 0 {
                ((info.used_bytes as f64 / info.total_bytes as f64) * 100.0) as u32
            } else {
                0
            };

            if free_mb < 50 {
                results.push(DiagnosticResult::error(
                    "storage",
                    "存储空间严重不足",
                    format!(
                        "可用空间仅 {} MB（已用 {}%）。建议清理不需要的资源文件或更换更大容量的 SD 卡。",
                        free_mb, used_percent
                    ),
                    false,
                    None,
                ));
            } else if free_mb < 200 {
                results.push(DiagnosticResult::warning(
                    "storage",
                    "存储空间不足",
                    format!(
                        "可用空间 {} MB（已用 {}%）。建议清理部分资源文件以释放空间。",
                        free_mb, used_percent
                    ),
                    false,
                    None,
                ));
            } else {
                results.push(DiagnosticResult::ok(
                    "storage",
                    "存储空间充足",
                    format!(
                        "可用 {} MB / 共 {} MB（已用 {}%）",
                        free_mb, total_mb, used_percent
                    ),
                ));
            }
        }
        Err(_) => {
            // SD 卡信息获取失败已在其他项报告，此处跳过
        }
    }
}

/// 7. 电池健康诊断
fn diagnose_battery(session: &RpcSession, results: &mut Vec<DiagnosticResult>) {
    match protocol::system_get_info(session) {
        Ok(info) => {
            if info.battery_level < 15 {
                results.push(DiagnosticResult::error(
                    "battery",
                    "电量严重不足",
                    format!(
                        "当前电量 {}%（{:.2}V）。请立即充电，否则设备可能随时关机。",
                        info.battery_level, info.battery_voltage
                    ),
                    false,
                    None,
                ));
            } else if info.battery_level < 30 {
                results.push(DiagnosticResult::warning(
                    "battery",
                    "电量较低",
                    format!(
                        "当前电量 {}%（{:.2}V）。建议尽快充电。",
                        info.battery_level, info.battery_voltage
                    ),
                    false,
                    None,
                ));
            } else {
                results.push(DiagnosticResult::ok(
                    "battery",
                    "电量正常",
                    format!(
                        "电量 {}%（{:.2}V）{}",
                        info.battery_level,
                        info.battery_voltage,
                        if info.is_charging { "正在充电" } else { "" }
                    ),
                ));
            }

            // 检查电压异常
            if info.battery_voltage > 0.0 && info.battery_voltage < 3.3 {
                results.push(DiagnosticResult::warning(
                    "battery",
                    "电池电压偏低",
                    format!(
                        "电池电压 {:.2}V 低于正常值（3.3V+），可能电池老化或需充电。",
                        info.battery_voltage
                    ),
                    false,
                    None,
                ));
            }
        }
        Err(_) => {
            // 已在固件诊断中报告
        }
    }
}

// -------------------- 诊断汇总辅助 --------------------

/// 获取诊断结果中的错误数量
pub fn count_errors(results: &[DiagnosticResult]) -> usize {
    results
        .iter()
        .filter(|r| r.level == DiagnosticLevel::Error)
        .count()
}

/// 获取诊断结果中的警告数量
pub fn count_warnings(results: &[DiagnosticResult]) -> usize {
    results
        .iter()
        .filter(|r| r.level == DiagnosticLevel::Warning)
        .count()
}

/// 获取可自动修复的问题数量
pub fn count_auto_fixable(results: &[DiagnosticResult]) -> usize {
    results.iter().filter(|r| r.auto_fixable).count()
}

/// 生成诊断摘要文本
pub fn generate_summary(results: &[DiagnosticResult]) -> String {
    let errors = count_errors(results);
    let warnings = count_warnings(results);
    let auto_fixable = count_auto_fixable(results);

    if errors == 0 && warnings == 0 {
        return "所有检查项均正常，设备状态良好！".to_string();
    }

    let mut summary = format!("发现 {} 个错误，{} 个警告", errors, warnings);
    if auto_fixable > 0 {
        summary.push_str(&format!("（{} 项可自动修复）", auto_fixable));
    }
    summary
}
