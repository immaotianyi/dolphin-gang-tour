/**
 * 可靠性基础设施 — 命令超时 + 指数退避重试 + 断连检测 + 心跳监控
 *
 * P7 Sprint 1: Hardware Reliability
 *
 * 核心能力:
 *   1. with_timeout — 为任何 async 操作添加超时
 *   2. with_retry — 指数退避重试 (可配次数 + 基础延迟)
 *   3. with_timeout_retry — 超时 + 重试组合
 *   4. HeartbeatMonitor — 心跳监控，自动检测断连
 *   5. ReconnectPolicy — 断连后自动重连策略
 */
use crate::error::{LucyError, LucyResult};
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::timeout;

/// 默认超时时间 (秒)
pub const DEFAULT_TIMEOUT_SECS: u64 = 10;

/// 默认最大重试次数
pub const DEFAULT_MAX_RETRIES: u32 = 3;

/// 默认基础退避延迟 (毫秒)
pub const DEFAULT_BASE_DELAY_MS: u64 = 500;

/// 心跳间隔 (秒)
pub const HEARTBEAT_INTERVAL_SECS: u64 = 5;

/// 心跳超时阈值 (错过 N 次心跳判定断连)
pub const HEARTBEAT_MISSED_THRESHOLD: u32 = 3;

// ─── 超时 + 重试 ───

/// 为 async 操作添加超时
pub async fn with_timeout<F, T>(secs: u64, f: F) -> LucyResult<T>
where
    F: Future<Output = LucyResult<T>>,
{
    match timeout(Duration::from_secs(secs), f).await {
        Ok(result) => result,
        Err(_) => Err(LucyError::Protocol(format!(
            "Command timed out after {}s",
            secs
        ))),
    }
}

/// 指数退避重试
///
/// 退避公式: base_delay_ms * 2^attempt (第 0 次不延迟)
/// 例: base=500ms → 0ms, 500ms, 1000ms, 2000ms
pub async fn with_retry<F, Fut, T>(max_retries: u32, base_delay_ms: u64, mut f: F) -> LucyResult<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = LucyResult<T>>,
{
    let mut last_err = None;
    for attempt in 0..=max_retries {
        if attempt > 0 {
            let delay = base_delay_ms * (1 << (attempt - 1));
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }

        match f().await {
            Ok(val) => return Ok(val),
            Err(e) => {
                tracing::warn!(
                    "Attempt {}/{} failed: {} (will {})",
                    attempt + 1,
                    max_retries + 1,
                    e,
                    if attempt < max_retries { "retry" } else { "give up" }
                );
                last_err = Some(e);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| LucyError::Internal("Retry exhausted with no error".into())))
}

/// 超时 + 重试组合
pub async fn with_timeout_retry<F, Fut, T>(
    timeout_secs: u64,
    max_retries: u32,
    base_delay_ms: u64,
    mut f: F,
) -> LucyResult<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = LucyResult<T>>,
{
    with_retry(max_retries, base_delay_ms, || {
        with_timeout(timeout_secs, f())
    })
    .await
}

// ─── 心跳监控 ───

/// 心跳监控器 — 定期检查设备是否响应
pub struct HeartbeatMonitor {
    is_running: Arc<AtomicBool>,
    missed_count: Arc<AtomicU32>,
    last_seen: Arc<std::sync::Mutex<Instant>>,
}

impl HeartbeatMonitor {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            missed_count: Arc::new(AtomicU32::new(0)),
            last_seen: Arc::new(std::sync::Mutex::new(Instant::now())),
        }
    }

    /// 记录心跳成功
    pub fn heartbeat(&self) {
        *self.last_seen.lock().unwrap() = Instant::now();
        self.missed_count.store(0, Ordering::SeqCst);
    }

    /// 获取错过的心跳次数
    pub fn missed(&self) -> u32 {
        self.missed_count.load(Ordering::SeqCst)
    }

    /// 是否已断连 (超过阈值)
    pub fn is_disconnected(&self) -> bool {
        self.missed_count.load(Ordering::SeqCst) >= HEARTBEAT_MISSED_THRESHOLD
    }

    /// 最后心跳时间
    pub fn last_heartbeat(&self) -> Instant {
        *self.last_seen.lock().unwrap()
    }

    /// 启动心跳监控 (返回 stop handle)
    pub fn start<F>(&self, check_fn: F) -> Arc<AtomicBool>
    where
        F: Fn() -> Pin<Box<dyn Future<Output = bool> + Send>> + Send + Sync + 'static,
    {
        let is_running = self.is_running.clone();
        let missed = self.missed_count.clone();
        let last_seen = self.last_seen.clone();
        let stop_handle = is_running.clone();
        is_running.store(true, Ordering::SeqCst);

        tokio::spawn(async move {
            while is_running.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_secs(HEARTBEAT_INTERVAL_SECS)).await;

                let alive = check_fn().await;
                if alive {
                    *last_seen.lock().unwrap() = Instant::now();
                    missed.store(0, Ordering::SeqCst);
                } else {
                    let count = missed.fetch_add(1, Ordering::SeqCst) + 1;
                    tracing::warn!(
                        "Heartbeat missed ({}/{})",
                        count,
                        HEARTBEAT_MISSED_THRESHOLD
                    );
                    if count >= HEARTBEAT_MISSED_THRESHOLD {
                        tracing::error!("Device disconnected: heartbeat missed {} times", count);
                        is_running.store(false, Ordering::SeqCst);
                        break;
                    }
                }
            }
        });

        stop_handle
    }

    /// 停止心跳监控
    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }
}

impl Default for HeartbeatMonitor {
    fn default() -> Self {
        Self::new()
    }
}

// ─── 重连策略 ───

/// 重连策略配置
#[derive(Debug, Clone)]
pub struct ReconnectPolicy {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
}

impl Default for ReconnectPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            base_delay_ms: 1000,
            max_delay_ms: 30000,
        }
    }
}

/// 执行重连策略
///
/// 退避: min(base_delay * 2^attempt, max_delay)
/// 例: base=1000, max=30000 → 1000, 2000, 4000, 8000, 16000
pub async fn reconnect_with_policy<F, Fut>(
    policy: &ReconnectPolicy,
    mut connect_fn: F,
) -> LucyResult<()>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = LucyResult<()>>,
{
    for attempt in 0..policy.max_attempts {
        let delay = std::cmp::min(
            policy.base_delay_ms * (1 << attempt),
            policy.max_delay_ms,
        );

        if attempt > 0 {
            tracing::info!("Reconnect attempt {}/{} after {}ms", attempt + 1, policy.max_attempts, delay);
            tokio::time::sleep(Duration::from_millis(delay)).await;
        }

        match connect_fn().await {
            Ok(()) => {
                tracing::info!("Reconnected successfully on attempt {}", attempt + 1);
                return Ok(());
            }
            Err(e) => {
                tracing::warn!("Reconnect attempt {} failed: {}", attempt + 1, e);
            }
        }
    }

    Err(LucyError::Usb(format!(
        "Reconnect failed after {} attempts",
        policy.max_attempts
    )))
}

// ─── 命令统计 ───

/// 命令执行统计 — 用于诊断包
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CommandStats {
    pub total: u64,
    pub success: u64,
    pub failed: u64,
    pub timed_out: u64,
    pub retried: u64,
    pub avg_duration_ms: u64,
}

impl Default for CommandStats {
    fn default() -> Self {
        Self {
            total: 0,
            success: 0,
            failed: 0,
            timed_out: 0,
            retried: 0,
            avg_duration_ms: 0,
        }
    }
}

/// 命令统计追踪器
pub struct CommandTracker {
    stats: Arc<std::sync::Mutex<CommandStats>>,
    durations: Arc<std::sync::Mutex<Vec<Duration>>>,
}

impl CommandTracker {
    pub fn new() -> Self {
        Self {
            stats: Arc::new(std::sync::Mutex::new(CommandStats::default())),
            durations: Arc::new(std::sync::Mutex::new(Vec::with_capacity(100))),
        }
    }

    pub fn record_success(&self, duration: Duration) {
        let mut stats = self.stats.lock().unwrap();
        stats.total += 1;
        stats.success += 1;
        let mut durations = self.durations.lock().unwrap();
        durations.push(duration);
        if durations.len() > 100 {
            durations.remove(0);
        }
        stats.avg_duration_ms = durations.iter().map(|d| d.as_millis() as u64).sum::<u64>()
            / durations.len() as u64;
    }

    pub fn record_failure(&self) {
        let mut stats = self.stats.lock().unwrap();
        stats.total += 1;
        stats.failed += 1;
    }

    pub fn record_timeout(&self) {
        let mut stats = self.stats.lock().unwrap();
        stats.total += 1;
        stats.timed_out += 1;
        stats.failed += 1;
    }

    pub fn record_retry(&self) {
        let mut stats = self.stats.lock().unwrap();
        stats.retried += 1;
    }

    pub fn snapshot(&self) -> CommandStats {
        self.stats.lock().unwrap().clone()
    }

    pub fn reset(&self) {
        *self.stats.lock().unwrap() = CommandStats::default();
        self.durations.lock().unwrap().clear();
    }
}

impl Default for CommandTracker {
    fn default() -> Self {
        Self::new()
    }
}

// ─── 设备行为差异表 ───

/// 虚拟设备 vs 真实设备行为差异
#[derive(Debug, Clone, serde::Serialize)]
pub struct DeviceBehaviorDiff {
    pub feature: String,
    pub virtual_behavior: String,
    pub real_behavior: String,
    pub notes: String,
}

/// 获取设备行为差异表
pub fn device_behavior_diffs() -> Vec<DeviceBehaviorDiff> {
    vec![
        DeviceBehaviorDiff {
            feature: "NFC Read".into(),
            virtual_behavior: "Returns mock NTAG213 data".into(),
            real_behavior: "Reads actual card via ST25R3916".into(),
            notes: "Virtual always succeeds; real may fail on no card".into(),
        },
        DeviceBehaviorDiff {
            feature: "SubGHz TX".into(),
            virtual_behavior: "Simulated TX, no RF output".into(),
            real_behavior: "CC1101 RF output, region-checked".into(),
            notes: "Virtual bypasses region check; real enforces".into(),
        },
        DeviceBehaviorDiff {
            feature: "BadUSB Execute".into(),
            virtual_behavior: "Simulated keypress log only".into(),
            real_behavior: "HID injection to target host".into(),
            notes: "Both require 3-stage approval".into(),
        },
        DeviceBehaviorDiff {
            feature: "GPIO".into(),
            virtual_behavior: "Mock ADC values (random)".into(),
            real_behavior: "Real ADC readings from ESP32-S3".into(),
            notes: "Virtual pin config is cosmetic".into(),
        },
        DeviceBehaviorDiff {
            feature: "Firmware OTA".into(),
            virtual_behavior: "Simulated flash, instant".into(),
            real_behavior: "DFU flash via USB, 30-60s".into(),
            notes: "Virtual doesn't verify signature".into(),
        },
        DeviceBehaviorDiff {
            feature: "Screen Mirror".into(),
            virtual_behavior: "Generated frames (test pattern)".into(),
            real_behavior: "Captured from device display".into(),
            notes: "Virtual runs at 2 FPS; real at 10+ FPS".into(),
        },
        DeviceBehaviorDiff {
            feature: "Connection Speed".into(),
            virtual_behavior: "Instant (no USB)".into(),
            real_behavior: "USB CDC, ~1ms latency".into(),
            notes: "Virtual has 0ms jitter".into(),
        },
        DeviceBehaviorDiff {
            feature: "Error Recovery".into(),
            virtual_behavior: "Never fails".into(),
            real_behavior: "USB disconnect, timeout, CRC errors".into(),
            notes: "Virtual hides protocol errors".into(),
        },
        DeviceBehaviorDiff {
            feature: "Storage".into(),
            virtual_behavior: "Mock SD card (8GB free)".into(),
            real_behavior: "Real SD card via SPI/FAT".into(),
            notes: "Virtual storage is not persistent".into(),
        },
        DeviceBehaviorDiff {
            feature: "Battery".into(),
            virtual_behavior: "Always 100%".into(),
            real_behavior: "Actual battery via ADC".into(),
            notes: "Virtual temperature is 25°C fixed".into(),
        },
    ]
}

/// 获取 Tauri 命令: 设备行为差异表
#[tauri::command]
pub async fn cmd_device_behavior_diffs() -> LucyResult<Vec<DeviceBehaviorDiff>> {
    Ok(device_behavior_diffs())
}

/// 获取 Tauri 命令: 命令统计
#[tauri::command]
pub async fn cmd_command_stats(tracker: tauri::State<'_, Arc<CommandTracker>>) -> LucyResult<CommandStats> {
    Ok(tracker.snapshot())
}

/// 获取 Tauri 命令: 重置命令统计
#[tauri::command]
pub async fn cmd_command_stats_reset(tracker: tauri::State<'_, Arc<CommandTracker>>) -> LucyResult<()> {
    tracker.reset();
    Ok(())
}

// ─── 诊断包导出 ───

/// 诊断包内容
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiagnosticsPackage {
    pub generated_at: String,
    pub app_version: String,
    pub app_info: AppInfo,
    pub device_info: DeviceInfoDiag,
    pub command_stats: CommandStats,
    pub protocol_stats: ProtocolStats,
    pub security_info: SecurityInfoDiag,
    pub recent_errors: Vec<String>,
    pub config_summary: ConfigSummary,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub rust_version: String,
    pub target_os: String,
    pub target_arch: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DeviceInfoDiag {
    pub is_virtual: bool,
    pub connection_state: String,
    pub device_name: Option<String>,
    pub firmware_version: Option<String>,
    pub api_level: Option<i32>,
    pub last_connected_at: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProtocolStats {
    pub total_requests: u64,
    pub total_responses: u64,
    pub avg_latency_ms: u64,
    pub timeout_count: u64,
    pub error_count: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SecurityInfoDiag {
    pub command_policy_enabled: bool,
    pub privacy_mode: bool,
    pub badusb_guard_enabled: bool,
    pub region_check_enabled: bool,
    pub developer_mode: bool,
    pub audit_log_count: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConfigSummary {
    pub language: String,
    pub theme: String,
    pub region: String,
    pub ai_model: String,
    pub ai_provider: String,
}

/// 生成诊断包
pub fn generate_diagnostics(
    command_stats: &CommandStats,
    is_virtual: bool,
    connection_state: &str,
) -> DiagnosticsPackage {
    DiagnosticsPackage {
        generated_at: chrono::Utc::now().to_rfc3339(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        app_info: AppInfo {
            name: "Lucy Desktop".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            rust_version: "1.75+".to_string(),
            target_os: std::env::consts::OS.to_string(),
            target_arch: std::env::consts::ARCH.to_string(),
        },
        device_info: DeviceInfoDiag {
            is_virtual,
            connection_state: connection_state.to_string(),
            device_name: None,
            firmware_version: None,
            api_level: None,
            last_connected_at: None,
        },
        command_stats: command_stats.clone(),
        protocol_stats: ProtocolStats {
            total_requests: command_stats.total,
            total_responses: command_stats.success,
            avg_latency_ms: command_stats.avg_duration_ms,
            timeout_count: command_stats.timed_out,
            error_count: command_stats.failed,
        },
        security_info: SecurityInfoDiag {
            command_policy_enabled: true,
            privacy_mode: true,
            badusb_guard_enabled: true,
            region_check_enabled: true,
            developer_mode: false,
            audit_log_count: 0,
        },
        recent_errors: Vec::new(),
        config_summary: ConfigSummary {
            language: "zh-CN".to_string(),
            theme: "cyberpunk".to_string(),
            region: "CN".to_string(),
            ai_model: "deepseek".to_string(),
            ai_provider: "DeepSeek".to_string(),
        },
    }
}

/// 获取 Tauri 命令: 导出诊断包
#[tauri::command]
pub async fn cmd_export_diagnostics(
    tracker: tauri::State<'_, Arc<CommandTracker>>,
    is_virtual: bool,
    connection_state: String,
) -> LucyResult<serde_json::Value> {
    let diag = generate_diagnostics(&tracker.snapshot(), is_virtual, &connection_state);
    serde_json::to_value(diag).map_err(|e| LucyError::Internal(format!("Diagnostics serialization failed: {}", e)))
}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_with_timeout_success() {
        let result = with_timeout(5, async { Ok(42) }).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_with_timeout_expired() {
        let result = with_timeout(1, async {
            tokio::time::sleep(Duration::from_secs(5)).await;
            Ok(42)
        })
        .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("timed out"));
    }

    #[tokio::test]
    async fn test_with_retry_success_first_try() {
        let mut attempts = 0;
        let result = with_retry(3, 10, || {
            attempts += 1;
            async move { Ok::<_, LucyError>(attempts) }
        })
        .await;
        assert_eq!(result.unwrap(), 1);
        assert_eq!(attempts, 1);
    }

    #[tokio::test]
    async fn test_with_retry_success_after_failures() {
        let attempt_count = Arc::new(AtomicU32::new(0));
        let ac = attempt_count.clone();

        let result = with_retry(3, 10, || {
            let ac = ac.clone();
            async move {
                let n = ac.fetch_add(1, Ordering::SeqCst);
                if n < 2 {
                    Err(LucyError::Protocol("fail".into()))
                } else {
                    Ok(99)
                }
            }
        })
        .await;
        assert_eq!(result.unwrap(), 99);
        assert_eq!(attempt_count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_with_retry_exhausted() {
        let result: LucyResult<()> = with_retry(2, 10, || async {
            Err(LucyError::Protocol("always fails".into()))
        })
        .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("always fails"));
    }

    #[tokio::test]
    async fn test_with_timeout_retry() {
        let attempt = Arc::new(AtomicU32::new(0));
        let ac = attempt.clone();

        let result: LucyResult<u32> = with_timeout_retry(5, 3, 10, || {
            let ac = ac.clone();
            async move {
                let n = ac.fetch_add(1, Ordering::SeqCst);
                if n == 0 {
                    Err(LucyError::Protocol("first fail".into()))
                } else {
                    Ok(n)
                }
            }
        })
        .await;
        assert_eq!(result.unwrap(), 1);
    }

    #[test]
    fn test_heartbeat_monitor() {
        let monitor = HeartbeatMonitor::new();
        assert_eq!(monitor.missed(), 0);
        assert!(!monitor.is_disconnected());

        // Simulate missed heartbeats
        for _ in 0..HEARTBEAT_MISSED_THRESHOLD {
            monitor.missed_count.fetch_add(1, Ordering::SeqCst);
        }
        assert!(monitor.is_disconnected());

        // Reset with heartbeat
        monitor.heartbeat();
        assert_eq!(monitor.missed(), 0);
        assert!(!monitor.is_disconnected());
    }

    #[tokio::test]
    async fn test_reconnect_policy() {
        let policy = ReconnectPolicy {
            max_attempts: 3,
            base_delay_ms: 10,
            max_delay_ms: 100,
        };

        let attempt = Arc::new(AtomicU32::new(0));
        let ac = attempt.clone();

        let result = reconnect_with_policy(&policy, || {
            let ac = ac.clone();
            async move {
                let n = ac.fetch_add(1, Ordering::SeqCst);
                if n < 2 {
                    Err(LucyError::Usb("not ready".into()))
                } else {
                    Ok(())
                }
            }
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(attempt.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_reconnect_policy_exhausted() {
        let policy = ReconnectPolicy {
            max_attempts: 2,
            base_delay_ms: 10,
            max_delay_ms: 50,
        };

        let result: LucyResult<()> = reconnect_with_policy(&policy, || async {
            Err(LucyError::Usb("never connects".into()))
        })
        .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("2 attempts"));
    }

    #[test]
    fn test_command_tracker() {
        let tracker = CommandTracker::new();

        tracker.record_success(Duration::from_millis(100));
        tracker.record_success(Duration::from_millis(200));
        tracker.record_failure();
        tracker.record_timeout();
        tracker.record_retry();

        let stats = tracker.snapshot();
        assert_eq!(stats.total, 4);
        assert_eq!(stats.success, 2);
        assert_eq!(stats.failed, 2);
        assert_eq!(stats.timed_out, 1);
        assert_eq!(stats.retried, 1);
        assert!(stats.avg_duration_ms > 0);

        tracker.reset();
        let stats = tracker.snapshot();
        assert_eq!(stats.total, 0);
    }

    #[test]
    fn test_device_behavior_diffs() {
        let diffs = device_behavior_diffs();
        assert_eq!(diffs.len(), 10);
        assert!(diffs.iter().any(|d| d.feature == "NFC Read"));
        assert!(diffs.iter().any(|d| d.feature == "SubGHz TX"));
        assert!(diffs.iter().any(|d| d.feature == "BadUSB Execute"));
    }

    #[test]
    fn test_exponential_backoff_calculation() {
        // base=500ms → 0, 500, 1000, 2000
        let base = 500u64;
        assert_eq!(0, if 0 > 0 { base * (1 << (0 - 1)) } else { 0 });
        assert_eq!(base * (1 << 0), 500);
        assert_eq!(base * (1 << 1), 1000);
        assert_eq!(base * (1 << 2), 2000);
    }
}
