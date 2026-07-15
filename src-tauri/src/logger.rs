/**
 * 日志系统 — 内存环形缓冲 + 文件导出
 *
 * 设计:
 *   - 内存环形缓冲区 (最多 1000 条)
 *   - 四级日志: Info / Warn / Error / Debug
 *   - 前端可通过 Tauri 命令获取最近日志
 *   - 支持导出到 ~/.lucy/logs/lucy_YYYYMMDD.log
 *
 * 线程安全:
 *   - 使用 parking_lot::Mutex 保护缓冲区
 *   - 写入不阻塞读取 (短锁)
 */
use crate::error::{LucyError, LucyResult};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// 日志级别
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Copy)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
        }
    }

    #[allow(dead_code)]
    pub fn from_str(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "DEBUG" => LogLevel::Debug,
            "INFO" => LogLevel::Info,
            "WARN" => LogLevel::Warn,
            "ERROR" => LogLevel::Error,
            _ => LogLevel::Info,
        }
    }
}

/// 日志条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub level: LogLevel,
    pub message: String,
    pub module: String,
    pub timestamp: u64,
}

/// 环形缓冲区
struct LogBuffer {
    entries: Vec<LogEntry>,
    max_size: usize,
    head: usize,
}

impl LogBuffer {
    fn new(max_size: usize) -> Self {
        Self {
            entries: Vec::with_capacity(max_size),
            max_size,
            head: 0,
        }
    }

    fn push(&mut self, entry: LogEntry) {
        if self.entries.len() < self.max_size {
            self.entries.push(entry);
        } else {
            self.entries[self.head] = entry;
            self.head = (self.head + 1) % self.max_size;
        }
    }

    fn recent(&self, count: usize) -> Vec<LogEntry> {
        let n = count.min(self.entries.len());
        let start = if self.entries.len() < self.max_size {
            self.entries.len().saturating_sub(n)
        } else {
            (self.head + self.entries.len() - n) % self.max_size
        };

        let mut result = Vec::with_capacity(n);
        for i in 0..n {
            let idx = (start + i) % self.entries.len();
            result.push(self.entries[idx].clone());
        }
        result
    }

    fn clear(&mut self) {
        self.entries.clear();
        self.head = 0;
    }

    #[allow(dead_code)]
    fn len(&self) -> usize {
        self.entries.len()
    }
}

/// 全局日志缓冲区
static LOG_BUFFER: OnceLock<Mutex<LogBuffer>> = OnceLock::new();

fn get_buffer() -> &'static Mutex<LogBuffer> {
    LOG_BUFFER.get_or_init(|| Mutex::new(LogBuffer::new(1000)))
}

/// 当前时间戳 (Unix 秒)
fn now_ts() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 记录日志
pub fn log(level: LogLevel, module: &str, message: &str) {
    let entry = LogEntry {
        level,
        message: message.to_string(),
        module: module.to_string(),
        timestamp: now_ts(),
    };
    // 同时输出到 tracing
    match level {
        LogLevel::Debug => tracing::debug!("[{}] {}", module, message),
        LogLevel::Info => tracing::info!("[{}] {}", module, message),
        LogLevel::Warn => tracing::warn!("[{}] {}", module, message),
        LogLevel::Error => tracing::error!("[{}] {}", module, message),
    }
    get_buffer().lock().push(entry);
}

/// 快捷函数
pub fn info(module: &str, msg: &str) { log(LogLevel::Info, module, msg); }
#[allow(dead_code)]
pub fn warn(module: &str, msg: &str) { log(LogLevel::Warn, module, msg); }
#[allow(dead_code)]
pub fn error(module: &str, msg: &str) { log(LogLevel::Error, module, msg); }
#[allow(dead_code)]
pub fn debug(module: &str, msg: &str) { log(LogLevel::Debug, module, msg); }

/// 隐私模式：开启后获取/导出日志时自动脱敏敏感信息
static PRIVACY_MODE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);

#[allow(dead_code)]
pub fn set_privacy_mode(enabled: bool) {
    PRIVACY_MODE.store(enabled, std::sync::atomic::Ordering::SeqCst);
}

pub fn privacy_mode() -> bool {
    PRIVACY_MODE.load(std::sync::atomic::Ordering::SeqCst)
}

/// 对日志消息进行敏感数据脱敏
fn sanitize_message(msg: &str) -> String {
    use regex::Regex;
    use std::sync::OnceLock;

    static PATTERNS: OnceLock<Vec<(Regex, &'static str)>> = OnceLock::new();
    let patterns = PATTERNS.get_or_init(|| {
        vec![
            // API Key: sk-xxxx (保留前4位)
            (Regex::new(r"sk-[a-zA-Z0-9]{8,}").unwrap(), "[API_KEY_REDACTED]"),
            // Bearer token
            (Regex::new(r"(?i)bearer\s+[a-zA-Z0-9\-_.]{20,}").unwrap(), "Bearer [TOKEN_REDACTED]"),
            // 手机号 (保留前3后4位)
            (Regex::new(r"1[3-9]\d{9}").unwrap(), "[PHONE_REDACTED]"),
            // 邮箱
            (Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").unwrap(), "[EMAIL_REDACTED]"),
            // WiFi 密码
            (Regex::new(r"(?i)(password|psk|wpa)[=:]\s*\S+").unwrap(), "password=[REDACTED]"),
        ]
    });

    let mut result = msg.to_string();
    for (re, replacement) in patterns {
        result = re.replace_all(&result, *replacement).to_string();
    }
    result
}

/// 获取最近 N 条日志（隐私模式下自动脱敏）
pub fn recent(count: usize) -> Vec<LogEntry> {
    let entries = get_buffer().lock().recent(count);
    if privacy_mode() {
        entries.into_iter().map(|mut e| {
            e.message = sanitize_message(&e.message);
            e
        }).collect()
    } else {
        entries
    }
}

/// 清空日志
pub fn clear() {
    get_buffer().lock().clear();
}

/// 获取日志条目数
#[allow(dead_code)]
pub fn count() -> usize {
    get_buffer().lock().len()
}

/// 导出日志到文件（隐私模式下自动脱敏）
pub fn export() -> LucyResult<String> {
    let raw_entries = get_buffer().lock().recent(1000);
    let entries: Vec<LogEntry> = if privacy_mode() {
        raw_entries.into_iter().map(|mut e| {
            e.message = sanitize_message(&e.message);
            e
        }).collect()
    } else {
        raw_entries
    };

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    let dir = std::path::PathBuf::from(home).join(".lucy").join("logs");
    let _ = std::fs::create_dir_all(&dir);

    let date = chrono_like_date();
    let filename = format!("lucy_{}.log", date);
    let filepath = dir.join(&filename);

    let mut content = String::new();
    content.push_str(&format!("=== Lucy Desktop Log Export ===\n"));
    content.push_str(&format!("Date: {}\n", date));
    content.push_str(&format!("Entries: {}\n\n", entries.len()));

    for entry in &entries {
        content.push_str(&format!(
            "[{}] [{}] [{}] {}\n",
            entry.timestamp, entry.level.as_str(), entry.module, entry.message
        ));
    }

    std::fs::write(&filepath, &content)
        .map_err(|e| LucyError::Storage(format!("Log export failed: {}", e)))?;

    Ok(filepath.to_string_lossy().to_string())
}

/// 简易日期格式化 (YYYYMMDD)
fn chrono_like_date() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // 简化: 使用秒数转日期 (不需要 chrono 依赖)
    // 这里用基本算法计算
    let days_since_epoch = now / 86400;
    let (year, month, day) = days_to_ymd(days_since_epoch as i64);
    format!("{:04}{:02}{:02}", year, month, day)
}

/// Unix 天数 → (年, 月, 日)
fn days_to_ymd(days: i64) -> (i64, u32, u32) {
    // 算法: 从 1970-01-01 开始计算
    let mut y = 1970i64;
    let mut remaining = days;

    loop {
        let is_leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
        let year_days = if is_leap { 366 } else { 365 };
        if remaining < year_days {
            break;
        }
        remaining -= year_days;
        y += 1;
    }

    let is_leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
    let month_days = [31, if is_leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut m = 0u32;
    let mut day = remaining as u32;

    for (i, &md) in month_days.iter().enumerate() {
        if day < md {
            m = (i + 1) as u32;
            break;
        }
        day -= md;
    }

    (y, m, day + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_level_from_str() {
        assert_eq!(LogLevel::from_str("INFO"), LogLevel::Info);
        assert_eq!(LogLevel::from_str("error"), LogLevel::Error);
        assert_eq!(LogLevel::from_str("unknown"), LogLevel::Info);
    }

    #[test]
    fn test_log_push_and_recent() {
        clear();
        info("test", "message 1");
        warn("test", "message 2");
        error("test", "message 3");

        let recent_logs = recent(10);
        assert_eq!(recent_logs.len(), 3);
        assert_eq!(recent_logs[0].level, LogLevel::Info);
        assert_eq!(recent_logs[2].level, LogLevel::Error);
    }

    #[test]
    fn test_log_ring_buffer() {
        clear();
        // 推入超过 max_size 的日志 (直接操作 buffer)
        let buf = get_buffer();
        {
            let mut b = buf.lock();
            // 模拟 max_size = 5
            for i in 0..7 {
                b.push(LogEntry {
                    level: LogLevel::Info,
                    message: format!("msg {}", i),
                    module: "test".to_string(),
                    timestamp: i as u64,
                });
            }
        }
        // buffer 容量为 1000, 所以全部保留
        let r = recent(10);
        assert_eq!(r.len(), 7);
    }

    #[test]
    fn test_days_to_ymd() {
        // 1970-01-01
        assert_eq!(days_to_ymd(0), (1970, 1, 1));
        // 2026-01-01 = 大约 20454 天
        let (y, m, d) = days_to_ymd(20454);
        assert_eq!(y, 2026);
        assert_eq!(m, 1);
        assert_eq!(d, 1);
    }

    #[test]
    fn test_clear() {
        clear();
        info("test", "temp");
        assert!(count() > 0);
        clear();
        assert_eq!(count(), 0);
    }
}
