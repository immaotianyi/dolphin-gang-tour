/**
 * UI 桥接层 — 将 AppState 变更通知给前端
 * emit_state_update 在 lib.rs 中使用
 * emit_screen_frame / emit_ai_token / emit_subghz_signal 保留供 reader_loop 使用
 */
use tauri::{AppHandle, Emitter};
use crate::SharedState;

/// 向前端推送状态更新
pub fn emit_state_update(app: &AppHandle, state: &SharedState) {
    let snapshot = state.read().snapshot();
    let _ = app.emit("state_update", snapshot);
}

/// 向前端推送屏幕帧（二进制数据）
#[allow(dead_code)]
pub fn emit_screen_frame(app: &AppHandle, frame: &[u8]) {
    let _ = app.emit("screen_frame", frame);
}

/// 向前端推送 AI token
#[allow(dead_code)]
pub fn emit_ai_token(app: &AppHandle, token: &str) {
    let _ = app.emit("ai_token", token);
}

/// 向前端推送 SubGHz 信号事件
#[allow(dead_code)]
pub fn emit_subghz_signal(app: &AppHandle, freq: u32, rssi: i16) {
    let _ = app.emit("subghz_signal", serde_json::json!({
        "frequency": freq,
        "rssi": rssi,
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    }));
}
