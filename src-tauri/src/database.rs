/**
 * SQLite 资产库 — 持久化用户数据
 *
 * 10 张表:
 *   nfc_cards / subghz_signals / ir_remotes / badusb_scripts / gpio_sessions
 *   firmware_history / ai_conversations / audit_logs / device_profiles / user_collections
 *
 * 存储位置: ~/.lucy/assets.db
 */
use crate::error::{LucyError, LucyResult};
use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

/// 数据库句柄 — 线程安全
pub type DbHandle = Arc<Mutex<Connection>>;

/// 打开/创建数据库并执行 migration
pub fn open_db(path: &PathBuf) -> LucyResult<DbHandle> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| LucyError::Database(e.to_string()))?;
    }
    let conn = Connection::open(path).map_err(|e| LucyError::Database(e.to_string()))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    run_migrations(&conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

/// 内存数据库 (测试用 + 降级方案)
pub fn open_in_memory() -> LucyResult<DbHandle> {
    let conn = Connection::open_in_memory().map_err(|e| LucyError::Database(e.to_string()))?;
    run_migrations(&conn)?;
    Ok(Arc::new(Mutex::new(conn)))
}

fn run_migrations(conn: &Connection) -> LucyResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS nfc_cards (
            id TEXT PRIMARY KEY,
            uid TEXT NOT NULL,
            card_type TEXT NOT NULL,
            atqa TEXT,
            sak TEXT,
            manufacturer TEXT,
            data TEXT,
            label TEXT,
            tags TEXT,
            starred INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS subghz_signals (
            id TEXT PRIMARY KEY,
            frequency INTEGER NOT NULL,
            modulation TEXT NOT NULL,
            rssi INTEGER,
            protocol TEXT,
            raw_data TEXT,
            label TEXT,
            tags TEXT,
            starred INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ir_remotes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            brand TEXT,
            protocol TEXT,
            buttons TEXT NOT NULL,
            label TEXT,
            tags TEXT,
            starred INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS badusb_scripts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            risk_level TEXT NOT NULL,
            category TEXT,
            tags TEXT,
            starred INTEGER DEFAULT 0,
            executed_count INTEGER DEFAULT 0,
            last_executed_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS gpio_sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            pin_config TEXT NOT NULL,
            samples TEXT,
            duration_ms INTEGER,
            label TEXT,
            tags TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS firmware_history (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL,
            previous_version TEXT,
            api_level INTEGER,
            channel TEXT,
            status TEXT NOT NULL,
            changelog TEXT,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            messages TEXT NOT NULL,
            model TEXT,
            provider TEXT,
            token_count INTEGER DEFAULT 0,
            starred INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            command TEXT NOT NULL,
            module TEXT NOT NULL,
            risk_level TEXT NOT NULL,
            source TEXT NOT NULL,
            result TEXT NOT NULL,
            detail TEXT,
            user_id TEXT
        );

        CREATE TABLE IF NOT EXISTS device_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            device_name TEXT,
            firmware_version TEXT,
            api_level INTEGER,
            last_connected_at INTEGER,
            config TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_collections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            asset_type TEXT NOT NULL,
            asset_ids TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS timeline_events (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            message TEXT NOT NULL,
            detail TEXT,
            timestamp INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module);
        CREATE INDEX IF NOT EXISTS idx_nfc_uid ON nfc_cards(uid);
        CREATE INDEX IF NOT EXISTS idx_subghz_freq ON subghz_signals(frequency);
        CREATE INDEX IF NOT EXISTS idx_badusb_starred ON badusb_scripts(starred);
        CREATE INDEX IF NOT EXISTS idx_nfc_starred ON nfc_cards(starred);
        CREATE INDEX IF NOT EXISTS idx_timeline_timestamp ON timeline_events(timestamp);
        ",
    )
    .map_err(|e| LucyError::Database(format!("Migration failed: {}", e)))?;
    Ok(())
}

// ─── 通用 helper ───

fn now_ts() -> i64 {
    Utc::now().timestamp()
}

fn new_id(prefix: &str) -> String {
    format!("{}_{}_{}", prefix, now_ts(), uuid::Uuid::new_v4().as_simple())
}

// ─── NFC Cards ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NfcCard {
    pub id: String,
    pub uid: String,
    pub card_type: String,
    pub atqa: Option<String>,
    pub sak: Option<String>,
    pub manufacturer: Option<String>,
    pub data: Option<String>,
    pub label: Option<String>,
    pub tags: Option<String>,
    pub starred: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn nfc_save(db: &DbHandle, card: &NfcCard) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT OR REPLACE INTO nfc_cards (id, uid, card_type, atqa, sak, manufacturer, data, label, tags, starred, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![card.id, card.uid, card.card_type, card.atqa, card.sak, card.manufacturer, card.data, card.label, card.tags, card.starred as i32, card.created_at, card.updated_at],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(card.id.clone())
}

pub fn nfc_list(db: &DbHandle, limit: i64) -> LucyResult<Vec<NfcCard>> {
    let conn = db.lock();
    let mut stmt = conn.prepare("SELECT * FROM nfc_cards ORDER BY created_at DESC LIMIT ?1")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(NfcCard {
            id: row.get(0)?, uid: row.get(1)?, card_type: row.get(2)?,
            atqa: row.get(3)?, sak: row.get(4)?, manufacturer: row.get(5)?,
            data: row.get(6)?, label: row.get(7)?, tags: row.get(8)?,
            starred: row.get::<_, i32>(9)? != 0,
            created_at: row.get(10)?, updated_at: row.get(11)?,
        })
    }).map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

pub fn nfc_delete(db: &DbHandle, id: &str) -> LucyResult<()> {
    let conn = db.lock();
    conn.execute("DELETE FROM nfc_cards WHERE id = ?1", params![id])
        .map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(())
}

// ─── SubGHz Signals ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubghzSignal {
    pub id: String,
    pub frequency: i64,
    pub modulation: String,
    pub rssi: Option<i32>,
    pub protocol: Option<String>,
    pub raw_data: Option<String>,
    pub label: Option<String>,
    pub tags: Option<String>,
    pub starred: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn subghz_save(db: &DbHandle, sig: &SubghzSignal) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT OR REPLACE INTO subghz_signals (id, frequency, modulation, rssi, protocol, raw_data, label, tags, starred, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![sig.id, sig.frequency, sig.modulation, sig.rssi, sig.protocol, sig.raw_data, sig.label, sig.tags, sig.starred as i32, sig.created_at, sig.updated_at],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(sig.id.clone())
}

pub fn subghz_list(db: &DbHandle, limit: i64) -> LucyResult<Vec<SubghzSignal>> {
    let conn = db.lock();
    let mut stmt = conn.prepare("SELECT * FROM subghz_signals ORDER BY created_at DESC LIMIT ?1")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(SubghzSignal {
            id: row.get(0)?, frequency: row.get(1)?, modulation: row.get(2)?,
            rssi: row.get(3)?, protocol: row.get(4)?, raw_data: row.get(5)?,
            label: row.get(6)?, tags: row.get(7)?,
            starred: row.get::<_, i32>(8)? != 0,
            created_at: row.get(9)?, updated_at: row.get(10)?,
        })
    }).map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

// ─── IR Remotes ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IrRemote {
    pub id: String,
    pub name: String,
    pub brand: Option<String>,
    pub protocol: Option<String>,
    pub buttons: String,
    pub label: Option<String>,
    pub tags: Option<String>,
    pub starred: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn ir_save(db: &DbHandle, remote: &IrRemote) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT OR REPLACE INTO ir_remotes (id, name, brand, protocol, buttons, label, tags, starred, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![remote.id, remote.name, remote.brand, remote.protocol, remote.buttons, remote.label, remote.tags, remote.starred as i32, remote.created_at, remote.updated_at],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(remote.id.clone())
}

pub fn ir_list(db: &DbHandle, limit: i64) -> LucyResult<Vec<IrRemote>> {
    let conn = db.lock();
    let mut stmt = conn.prepare("SELECT * FROM ir_remotes ORDER BY created_at DESC LIMIT ?1")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(IrRemote {
            id: row.get(0)?, name: row.get(1)?, brand: row.get(2)?,
            protocol: row.get(3)?, buttons: row.get(4)?,
            label: row.get(5)?, tags: row.get(6)?,
            starred: row.get::<_, i32>(7)? != 0,
            created_at: row.get(8)?, updated_at: row.get(9)?,
        })
    }).map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

// ─── BadUSB Scripts ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BadusbScript {
    pub id: String,
    pub name: String,
    pub content: String,
    pub risk_level: String,
    pub category: Option<String>,
    pub tags: Option<String>,
    pub starred: bool,
    pub executed_count: i32,
    pub last_executed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn badusb_save(db: &DbHandle, script: &BadusbScript) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT OR REPLACE INTO badusb_scripts (id, name, content, risk_level, category, tags, starred, executed_count, last_executed_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![script.id, script.name, script.content, script.risk_level, script.category, script.tags, script.starred as i32, script.executed_count, script.last_executed_at, script.created_at, script.updated_at],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(script.id.clone())
}

pub fn badusb_list(db: &DbHandle, limit: i64) -> LucyResult<Vec<BadusbScript>> {
    let conn = db.lock();
    let mut stmt = conn.prepare("SELECT * FROM badusb_scripts ORDER BY created_at DESC LIMIT ?1")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(BadusbScript {
            id: row.get(0)?, name: row.get(1)?, content: row.get(2)?,
            risk_level: row.get(3)?, category: row.get(4)?, tags: row.get(5)?,
            starred: row.get::<_, i32>(6)? != 0,
            executed_count: row.get(7)?,
            last_executed_at: row.get(8)?,
            created_at: row.get(9)?, updated_at: row.get(10)?,
        })
    }).map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

pub fn badusb_increment_exec(db: &DbHandle, id: &str) -> LucyResult<()> {
    let conn = db.lock();
    conn.execute(
        "UPDATE badusb_scripts SET executed_count = executed_count + 1, last_executed_at = ?1, updated_at = ?1 WHERE id = ?2",
        params![now_ts(), id],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(())
}

// ─── Audit Logs ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: String,
    pub timestamp: i64,
    pub command: String,
    pub module: String,
    pub risk_level: String,
    pub source: String,
    pub result: String,
    pub detail: Option<String>,
    pub user_id: Option<String>,
}

pub fn audit_write(db: &DbHandle, entry: &AuditLog) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT INTO audit_logs (id, timestamp, command, module, risk_level, source, result, detail, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![entry.id, entry.timestamp, entry.command, entry.module, entry.risk_level, entry.source, entry.result, entry.detail, entry.user_id],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(entry.id.clone())
}

pub fn audit_list(db: &DbHandle, limit: i64, module_filter: Option<&str>) -> LucyResult<Vec<AuditLog>> {
    let conn = db.lock();
    let sql = if module_filter.is_some() {
        "SELECT * FROM audit_logs WHERE module = ?1 ORDER BY timestamp DESC LIMIT ?2"
    } else {
        "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?1"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = if let Some(module) = module_filter {
        stmt.query_map(params![module, limit], map_audit_row)
    } else {
        stmt.query_map(params![limit], map_audit_row)
    }.map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

fn map_audit_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AuditLog> {
    Ok(AuditLog {
        id: row.get(0)?, timestamp: row.get(1)?, command: row.get(2)?,
        module: row.get(3)?, risk_level: row.get(4)?, source: row.get(5)?,
        result: row.get(6)?, detail: row.get(7)?, user_id: row.get(8)?,
    })
}

pub fn audit_count(db: &DbHandle) -> LucyResult<i64> {
    let conn = db.lock();
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM audit_logs", [], |row| row.get(0))
        .map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(count)
}

pub fn audit_clear(db: &DbHandle) -> LucyResult<()> {
    let conn = db.lock();
    conn.execute("DELETE FROM audit_logs", [])
        .map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(())
}

// ─── AI Conversations ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConversation {
    pub id: String,
    pub title: String,
    pub messages: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub token_count: i32,
    pub starred: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn ai_conv_save(db: &DbHandle, conv: &AiConversation) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT OR REPLACE INTO ai_conversations (id, title, messages, model, provider, token_count, starred, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![conv.id, conv.title, conv.messages, conv.model, conv.provider, conv.token_count, conv.starred as i32, conv.created_at, conv.updated_at],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(conv.id.clone())
}

pub fn ai_conv_list(db: &DbHandle, limit: i64) -> LucyResult<Vec<AiConversation>> {
    let conn = db.lock();
    let mut stmt = conn.prepare("SELECT * FROM ai_conversations ORDER BY updated_at DESC LIMIT ?1")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(AiConversation {
            id: row.get(0)?, title: row.get(1)?, messages: row.get(2)?,
            model: row.get(3)?, provider: row.get(4)?, token_count: row.get(5)?,
            starred: row.get::<_, i32>(6)? != 0,
            created_at: row.get(7)?, updated_at: row.get(8)?,
        })
    }).map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

// ─── Firmware History ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmwareRecord {
    pub id: String,
    pub version: String,
    pub previous_version: Option<String>,
    pub api_level: Option<i32>,
    pub channel: Option<String>,
    pub status: String,
    pub changelog: Option<String>,
    pub created_at: i64,
}

pub fn firmware_record_save(db: &DbHandle, rec: &FirmwareRecord) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT INTO firmware_history (id, version, previous_version, api_level, channel, status, changelog, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![rec.id, rec.version, rec.previous_version, rec.api_level, rec.channel, rec.status, rec.changelog, rec.created_at],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(rec.id.clone())
}

pub fn firmware_history_list(db: &DbHandle, limit: i64) -> LucyResult<Vec<FirmwareRecord>> {
    let conn = db.lock();
    let mut stmt = conn.prepare("SELECT * FROM firmware_history ORDER BY created_at DESC LIMIT ?1")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(FirmwareRecord {
            id: row.get(0)?, version: row.get(1)?, previous_version: row.get(2)?,
            api_level: row.get(3)?, channel: row.get(4)?, status: row.get(5)?,
            changelog: row.get(6)?, created_at: row.get(7)?,
        })
    }).map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

// ─── Device Profiles ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    pub id: String,
    pub name: String,
    pub device_name: Option<String>,
    pub firmware_version: Option<String>,
    pub api_level: Option<i32>,
    pub last_connected_at: Option<i64>,
    pub config: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn device_profile_save(db: &DbHandle, profile: &DeviceProfile) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT OR REPLACE INTO device_profiles (id, name, device_name, firmware_version, api_level, last_connected_at, config, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![profile.id, profile.name, profile.device_name, profile.firmware_version, profile.api_level, profile.last_connected_at, profile.config, profile.created_at, profile.updated_at],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(profile.id.clone())
}

pub fn device_profiles_list(db: &DbHandle) -> LucyResult<Vec<DeviceProfile>> {
    let conn = db.lock();
    let mut stmt = conn.prepare("SELECT * FROM device_profiles ORDER BY updated_at DESC")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = stmt.query_map([], |row| {
        Ok(DeviceProfile {
            id: row.get(0)?, name: row.get(1)?, device_name: row.get(2)?,
            firmware_version: row.get(3)?, api_level: row.get(4)?,
            last_connected_at: row.get(5)?, config: row.get(6)?,
            created_at: row.get(7)?, updated_at: row.get(8)?,
        })
    }).map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

// ─── User Collections ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserCollection {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub asset_type: String,
    pub asset_ids: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn collection_save(db: &DbHandle, coll: &UserCollection) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT OR REPLACE INTO user_collections (id, name, description, asset_type, asset_ids, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![coll.id, coll.name, coll.description, coll.asset_type, coll.asset_ids, coll.created_at, coll.updated_at],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(coll.id.clone())
}

pub fn collection_list(db: &DbHandle) -> LucyResult<Vec<UserCollection>> {
    let conn = db.lock();
    let mut stmt = conn.prepare("SELECT * FROM user_collections ORDER BY updated_at DESC")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = stmt.query_map([], |row| {
        Ok(UserCollection {
            id: row.get(0)?, name: row.get(1)?, description: row.get(2)?,
            asset_type: row.get(3)?, asset_ids: row.get(4)?,
            created_at: row.get(5)?, updated_at: row.get(6)?,
        })
    }).map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

// ─── Timeline Events ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEvent {
    pub id: String,
    pub event_type: String,
    pub message: String,
    pub detail: Option<String>,
    pub timestamp: i64,
}

pub fn timeline_save(db: &DbHandle, event: &TimelineEvent) -> LucyResult<String> {
    let conn = db.lock();
    conn.execute(
        "INSERT OR REPLACE INTO timeline_events (id, event_type, message, detail, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![event.id, event.event_type, event.message, event.detail, event.timestamp],
    ).map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(event.id.clone())
}

pub fn timeline_list(db: &DbHandle, limit: i64) -> LucyResult<Vec<TimelineEvent>> {
    let conn = db.lock();
    let mut stmt = conn.prepare("SELECT * FROM timeline_events ORDER BY timestamp DESC LIMIT ?1")
        .map_err(|e| LucyError::Database(e.to_string()))?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(TimelineEvent {
            id: row.get(0)?,
            event_type: row.get(1)?,
            message: row.get(2)?,
            detail: row.get(3)?,
            timestamp: row.get(4)?,
        })
    }).map_err(|e| LucyError::Database(e.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| LucyError::Database(e.to_string()))
}

pub fn timeline_clear(db: &DbHandle) -> LucyResult<()> {
    let conn = db.lock();
    conn.execute("DELETE FROM timeline_events", [])
        .map_err(|e| LucyError::Database(e.to_string()))?;
    Ok(())
}

pub fn new_timeline_entry(event_type: &str, message: &str, detail: Option<String>) -> TimelineEvent {
    TimelineEvent {
        id: new_id("tl"),
        event_type: event_type.to_string(),
        message: message.to_string(),
        detail,
        timestamp: now_ts(),
    }
}

// ─── 统计 ───

pub fn asset_stats(db: &DbHandle) -> LucyResult<serde_json::Value> {
    let conn = db.lock();
    let counts = [
        ("nfc_cards", "SELECT COUNT(*) FROM nfc_cards"),
        ("subghz_signals", "SELECT COUNT(*) FROM subghz_signals"),
        ("ir_remotes", "SELECT COUNT(*) FROM ir_remotes"),
        ("badusb_scripts", "SELECT COUNT(*) FROM badusb_scripts"),
        ("gpio_sessions", "SELECT COUNT(*) FROM gpio_sessions"),
        ("firmware_history", "SELECT COUNT(*) FROM firmware_history"),
        ("ai_conversations", "SELECT COUNT(*) FROM ai_conversations"),
        ("audit_logs", "SELECT COUNT(*) FROM audit_logs"),
        ("device_profiles", "SELECT COUNT(*) FROM device_profiles"),
        ("user_collections", "SELECT COUNT(*) FROM user_collections"),
        ("timeline_events", "SELECT COUNT(*) FROM timeline_events"),
    ];
    let mut stats = serde_json::Map::new();
    for (name, sql) in &counts {
        let c: i64 = conn.query_row(sql, [], |row| row.get(0))
            .map_err(|e| LucyError::Database(e.to_string()))?;
        stats.insert(name.to_string(), serde_json::Value::from(c));
    }
    Ok(serde_json::Value::Object(stats))
}

// ─── 工厂函数 ───

pub fn new_audit_entry(command: &str, module: &str, risk: &str, source: &str, result: &str, detail: Option<String>) -> AuditLog {
    AuditLog {
        id: new_id("audit"),
        timestamp: now_ts(),
        command: command.to_string(),
        module: module.to_string(),
        risk_level: risk.to_string(),
        source: source.to_string(),
        result: result.to_string(),
        detail,
        user_id: None,
    }
}

// ─── Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_migration() {
        let db = open_in_memory().unwrap();
        let stats = asset_stats(&db).unwrap();
        assert_eq!(stats["nfc_cards"], 0);
        assert_eq!(stats["audit_logs"], 0);
    }

    #[test]
    fn test_nfc_crud() {
        let db = open_in_memory().unwrap();
        let card = NfcCard {
            id: new_id("nfc"), uid: "04A3B2C1".to_string(),
            card_type: "Mifare Classic 1K".to_string(),
            atqa: Some("0x0400".to_string()), sak: Some("0x08".to_string()),
            manufacturer: Some("NXP".to_string()), data: None,
            label: Some("Office Card".to_string()), tags: Some("work,access".to_string()),
            starred: true, created_at: now_ts(), updated_at: now_ts(),
        };
        let id = nfc_save(&db, &card).unwrap();
        assert!(!id.is_empty());
        let list = nfc_list(&db, 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].uid, "04A3B2C1");
        assert!(list[0].starred);
        nfc_delete(&db, &id).unwrap();
        let list2 = nfc_list(&db, 10).unwrap();
        assert_eq!(list2.len(), 0);
    }

    #[test]
    fn test_subghz_crud() {
        let db = open_in_memory().unwrap();
        let sig = SubghzSignal {
            id: new_id("sub"), frequency: 433920000, modulation: "OOK".to_string(),
            rssi: Some(-55), protocol: Some("PT2262".to_string()),
            raw_data: None, label: Some("Doorbell".to_string()),
            tags: None, starred: false, created_at: now_ts(), updated_at: now_ts(),
        };
        subghz_save(&db, &sig).unwrap();
        let list = subghz_list(&db, 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].frequency, 433920000);
    }

    #[test]
    fn test_badusb_crud_and_exec() {
        let db = open_in_memory().unwrap();
        let script = BadusbScript {
            id: new_id("bad"), name: "Hello World".to_string(),
            content: "STRING Hello World\nENTER".to_string(),
            risk_level: "safe".to_string(), category: Some("demo".to_string()),
            tags: None, starred: true, executed_count: 0,
            last_executed_at: None, created_at: now_ts(), updated_at: now_ts(),
        };
        badusb_save(&db, &script).unwrap();
        badusb_increment_exec(&db, &script.id).unwrap();
        let list = badusb_list(&db, 10).unwrap();
        assert_eq!(list[0].executed_count, 1);
        assert!(list[0].last_executed_at.is_some());
    }

    #[test]
    fn test_audit_log() {
        let db = open_in_memory().unwrap();
        let entry = new_audit_entry("nfc_detect", "nfc", "safe", "user", "success", None);
        audit_write(&db, &entry).unwrap();
        assert_eq!(audit_count(&db).unwrap(), 1);
        let list = audit_list(&db, 10, None).unwrap();
        assert_eq!(list[0].command, "nfc_detect");
        // Filter by module
        let filtered = audit_list(&db, 10, Some("nfc")).unwrap();
        assert_eq!(filtered.len(), 1);
        let filtered2 = audit_list(&db, 10, Some("badusb")).unwrap();
        assert_eq!(filtered2.len(), 0);
    }

    #[test]
    fn test_audit_clear() {
        let db = open_in_memory().unwrap();
        for i in 0..5 {
            let entry = new_audit_entry(&format!("cmd_{}", i), "test", "safe", "user", "ok", None);
            audit_write(&db, &entry).unwrap();
        }
        assert_eq!(audit_count(&db).unwrap(), 5);
        audit_clear(&db).unwrap();
        assert_eq!(audit_count(&db).unwrap(), 0);
    }

    #[test]
    fn test_ir_crud() {
        let db = open_in_memory().unwrap();
        let remote = IrRemote {
            id: new_id("ir"), name: "AC Remote".to_string(),
            brand: Some("Daikin".to_string()), protocol: Some("NEC".to_string()),
            buttons: r#"[{"name":"power","code":"0x1234"}]"#.to_string(),
            label: None, tags: None, starred: false,
            created_at: now_ts(), updated_at: now_ts(),
        };
        ir_save(&db, &remote).unwrap();
        let list = ir_list(&db, 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].brand.as_deref(), Some("Daikin"));
    }

    #[test]
    fn test_ai_conversation() {
        let db = open_in_memory().unwrap();
        let conv = AiConversation {
            id: new_id("ai"), title: "Device Analysis".to_string(),
            messages: r#"[{"role":"user","content":"hi"}]"#.to_string(),
            model: Some("deepseek-chat".to_string()),
            provider: Some("deepseek".to_string()),
            token_count: 100, starred: false,
            created_at: now_ts(), updated_at: now_ts(),
        };
        ai_conv_save(&db, &conv).unwrap();
        let list = ai_conv_list(&db, 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].token_count, 100);
    }

    #[test]
    fn test_firmware_history() {
        let db = open_in_memory().unwrap();
        let rec = FirmwareRecord {
            id: new_id("fw"), version: "0.2.0".to_string(),
            previous_version: Some("0.1.0".to_string()),
            api_level: Some(2), channel: Some("stable".to_string()),
            status: "success".to_string(), changelog: Some("Bug fixes".to_string()),
            created_at: now_ts(),
        };
        firmware_record_save(&db, &rec).unwrap();
        let list = firmware_history_list(&db, 10).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].version, "0.2.0");
    }

    #[test]
    fn test_device_profiles() {
        let db = open_in_memory().unwrap();
        let p = DeviceProfile {
            id: new_id("dev"), name: "Lucy #001".to_string(),
            device_name: Some("Lucy ESP32-S3".to_string()),
            firmware_version: Some("0.1.0".to_string()),
            api_level: Some(1), last_connected_at: Some(now_ts()),
            config: None, created_at: now_ts(), updated_at: now_ts(),
        };
        device_profile_save(&db, &p).unwrap();
        let list = device_profiles_list(&db).unwrap();
        assert_eq!(list.len(), 1);
    }

    #[test]
    fn test_user_collections() {
        let db = open_in_memory().unwrap();
        let c = UserCollection {
            id: new_id("col"), name: "Favorite Cards".to_string(),
            description: Some("Best NFC cards".to_string()),
            asset_type: "nfc_cards".to_string(),
            asset_ids: r#"["nfc_1","nfc_2"]"#.to_string(),
            created_at: now_ts(), updated_at: now_ts(),
        };
        collection_save(&db, &c).unwrap();
        let list = collection_list(&db).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].asset_type, "nfc_cards");
    }

    #[test]
    fn test_asset_stats() {
        let db = open_in_memory().unwrap();
        // Add some data
        let card = NfcCard {
            id: new_id("nfc"), uid: "12345678".to_string(),
            card_type: "Mifare".to_string(), atqa: None, sak: None,
            manufacturer: None, data: None, label: None, tags: None,
            starred: false, created_at: now_ts(), updated_at: now_ts(),
        };
        nfc_save(&db, &card).unwrap();
        let entry = new_audit_entry("test", "test", "safe", "user", "ok", None);
        audit_write(&db, &entry).unwrap();
        let stats = asset_stats(&db).unwrap();
        assert_eq!(stats["nfc_cards"], 1);
        assert_eq!(stats["audit_logs"], 1);
        assert_eq!(stats["subghz_signals"], 0);
    }

    #[test]
    fn test_timeline_crud() {
        let db = open_in_memory().unwrap();
        let e1 = new_timeline_entry("connect", "Device connected", None);
        let e2 = new_timeline_entry("command", "NFC scan executed", Some("uid=04A3B2C1".to_string()));
        timeline_save(&db, &e1).unwrap();
        timeline_save(&db, &e2).unwrap();
        let list = timeline_list(&db, 10).unwrap();
        assert_eq!(list.len(), 2);
        // ordered by timestamp DESC — e2 created after e1
        assert_eq!(list[0].message, "NFC scan executed");
        assert_eq!(list[0].detail.as_deref(), Some("uid=04A3B2C1"));
        assert_eq!(list[1].event_type, "connect");
        // clear
        timeline_clear(&db).unwrap();
        assert_eq!(timeline_list(&db, 10).unwrap().len(), 0);
    }
}

// ─── Tauri 命令 ───

use tauri::State;

/// 保存 NFC 卡片到资产库
#[tauri::command]
pub async fn cmd_nfc_save(db: State<'_, DbHandle>, card: NfcCard) -> LucyResult<String> {
    nfc_save(&db, &card)
}

/// 列出已保存的 NFC 卡片
#[tauri::command]
pub async fn cmd_nfc_list(db: State<'_, DbHandle>, limit: Option<i64>) -> LucyResult<Vec<NfcCard>> {
    nfc_list(&db, limit.unwrap_or(50))
}

/// 删除 NFC 卡片
#[tauri::command]
pub async fn cmd_nfc_delete(db: State<'_, DbHandle>, id: String) -> LucyResult<()> {
    nfc_delete(&db, &id)
}

/// 保存 SubGHz 信号
#[tauri::command]
pub async fn cmd_subghz_save(db: State<'_, DbHandle>, signal: SubghzSignal) -> LucyResult<String> {
    subghz_save(&db, &signal)
}

/// 列出已保存的 SubGHz 信号
#[tauri::command]
pub async fn cmd_subghz_list(db: State<'_, DbHandle>, limit: Option<i64>) -> LucyResult<Vec<SubghzSignal>> {
    subghz_list(&db, limit.unwrap_or(50))
}

/// 保存 IR 遥控器
#[tauri::command]
pub async fn cmd_ir_save(db: State<'_, DbHandle>, remote: IrRemote) -> LucyResult<String> {
    ir_save(&db, &remote)
}

/// 列出已保存的 IR 遥控器
#[tauri::command]
pub async fn cmd_ir_list(db: State<'_, DbHandle>, limit: Option<i64>) -> LucyResult<Vec<IrRemote>> {
    ir_list(&db, limit.unwrap_or(50))
}

/// 保存 BadUSB 脚本
#[tauri::command]
pub async fn cmd_badusb_save(db: State<'_, DbHandle>, script: BadusbScript) -> LucyResult<String> {
    badusb_save(&db, &script)
}

/// 列出已保存的 BadUSB 脚本
#[tauri::command]
pub async fn cmd_badusb_list(db: State<'_, DbHandle>, limit: Option<i64>) -> LucyResult<Vec<BadusbScript>> {
    badusb_list(&db, limit.unwrap_or(50))
}

/// 增加 BadUSB 执行计数
#[tauri::command]
pub async fn cmd_badusb_increment_exec(db: State<'_, DbHandle>, id: String) -> LucyResult<()> {
    badusb_increment_exec(&db, &id)
}

/// 列出审计日志
#[tauri::command]
pub async fn cmd_audit_list(db: State<'_, DbHandle>, limit: Option<i64>, module: Option<String>) -> LucyResult<Vec<AuditLog>> {
    audit_list(&db, limit.unwrap_or(100), module.as_deref())
}

/// 获取审计日志总数
#[tauri::command]
pub async fn cmd_audit_count(db: State<'_, DbHandle>) -> LucyResult<i64> {
    audit_count(&db)
}

/// 清空审计日志
#[tauri::command]
pub async fn cmd_audit_clear(db: State<'_, DbHandle>) -> LucyResult<()> {
    audit_clear(&db)
}

/// 保存 AI 对话
#[tauri::command]
pub async fn cmd_ai_conv_save(db: State<'_, DbHandle>, conv: AiConversation) -> LucyResult<String> {
    ai_conv_save(&db, &conv)
}

/// 列出 AI 对话
#[tauri::command]
pub async fn cmd_ai_conv_list(db: State<'_, DbHandle>, limit: Option<i64>) -> LucyResult<Vec<AiConversation>> {
    ai_conv_list(&db, limit.unwrap_or(50))
}

/// 列出固件历史
#[tauri::command]
pub async fn cmd_firmware_history_list(db: State<'_, DbHandle>, limit: Option<i64>) -> LucyResult<Vec<FirmwareRecord>> {
    firmware_history_list(&db, limit.unwrap_or(20))
}

/// 获取资产统计
#[tauri::command]
pub async fn cmd_asset_stats(db: State<'_, DbHandle>) -> LucyResult<serde_json::Value> {
    asset_stats(&db)
}

/// 保存时间线事件
#[tauri::command]
pub async fn cmd_timeline_save(db: State<'_, DbHandle>, event: TimelineEvent) -> LucyResult<String> {
    timeline_save(&db, &event)
}

/// 列出时间线事件
#[tauri::command]
pub async fn cmd_timeline_list(db: State<'_, DbHandle>, limit: Option<i64>) -> LucyResult<Vec<TimelineEvent>> {
    timeline_list(&db, limit.unwrap_or(100))
}

/// 清空时间线事件
#[tauri::command]
pub async fn cmd_timeline_clear(db: State<'_, DbHandle>) -> LucyResult<()> {
    timeline_clear(&db)
}
