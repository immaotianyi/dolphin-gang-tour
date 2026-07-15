/**
 * Lucy Desktop — Rust 后端入口
 * Tauri 2.0 应用初始化 + 命令注册 + 状态管理
 *
 * 状态架构:
 *   SharedState (Arc<RwLock<AppState>>)  — 全局设备状态 SSOT
 *   TransportManager                     — 传输层管理（真实/虚拟设备切换）
 *
 * 启动流程:
 *   1. 初始化日志
 *   2. 创建 AppState + TransportManager
 *   3. 注册 Tauri 插件 + 管理状态
 *   4. 启动后台任务：设备自动扫描 + 自动连接（降级为虚拟设备）
 */
mod app_state;
mod error;
mod ui_bridge;
mod device;
mod security;
mod ai;
mod config;
mod firmware;
mod storage;
mod logger;
mod policy;
mod region;
mod database;
mod gateway;
mod reliability;
mod release;
mod freeze;

use app_state::AppState;
use device::transport_manager::TransportManager;
use parking_lot::RwLock;
use std::sync::Arc;
use tauri::Manager;

/// 全局应用状态类型
pub type SharedState = Arc<RwLock<AppState>>;

/// Tauri 应用入口 — 初始化日志、状态管理、后台任务和命令注册
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tracing::info!("Lucy Desktop starting up...");

    // 创建共享状态
    let shared_state: SharedState = Arc::new(RwLock::new(AppState::new()));
    let transport_manager = Arc::new(TransportManager::new());
    let command_tracker = Arc::new(reliability::CommandTracker::new());

    // 初始化 SQLite 资产库
    let db_path = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".lucy")
        .join("assets.db");
    let db_handle = match database::open_db(&db_path) {
        Ok(db) => {
            tracing::info!("SQLite asset library opened at {:?}", db_path);
            db
        }
        Err(e) => {
            tracing::error!("Failed to open database: {}, using in-memory fallback", e);
            database::open_in_memory().expect("Failed to open in-memory database")
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(shared_state)
        .manage(transport_manager)
        .manage(db_handle)
        .manage(command_tracker)
        .setup(|app| {
            tracing::info!("Tauri app setup complete");

            // 初始化 crash 日志
            release::init_crash_logger();

            // 启动设备自动扫描后台任务
            let scan_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                device::detector::start_auto_scan(scan_handle).await;
            });

            // 启动自动连接任务（延迟 2 秒等待前端加载）
            let connect_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;

                let tm = connect_handle.state::<Arc<TransportManager>>().inner().clone();
                match tm.auto_connect(&connect_handle).await {
                    Ok(real) => {
                        if real {
                            tracing::info!("Auto-connected to real Lucy device");
                        } else {
                            tracing::info!("Auto-connected to virtual device (no real device found)");
                        }

                        // 更新全局状态
                        let state = connect_handle.state::<SharedState>().inner().clone();
                        {
                            let mut s = state.write();
                            s.connection_state = app_state::ConnectionState::Connected;
                            s.is_virtual = !real;
                        }

                        // 获取设备信息
                        if let Ok(transport) = tm.get_transport() {
                            if let Ok(info) = transport.get_info().await {
                                let mut s = state.write();
                                s.device_info = Some(info);
                            }
                        }

                        crate::ui_bridge::emit_state_update(&connect_handle, &state);

                        // 虚拟设备模式启动屏幕帧推送
                        if !real {
                            let stream_handle = connect_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                // 调用虚拟设备屏幕流（在 commands 中实现）
                                device::commands::start_virtual_screen_stream_public(stream_handle).await;
                            });
                        }
                    }
                    Err(e) => {
                        tracing::error!("Auto-connect failed: {}", e);
                        let state = connect_handle.state::<SharedState>().inner().clone();
                        {
                            let mut s = state.write();
                            s.connection_state = app_state::ConnectionState::Error;
                        }
                        crate::ui_bridge::emit_state_update(&connect_handle, &state);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 设备命令
            device::commands::device_scan,
            device::commands::device_connect,
            device::commands::device_disconnect,
            device::commands::device_get_info,
            device::commands::device_refresh_info,
            // NFC 命令
            device::commands::nfc_detect,
            device::commands::nfc_read_uid,
            device::commands::nfc_read_card,
            device::commands::nfc_write_block,
            device::commands::nfc_emulate,
            device::commands::nfc_list_saved,
            // SubGHz 命令
            device::commands::subghz_scan,
            device::commands::subghz_rx,
            device::commands::subghz_tx,
            device::commands::subghz_save,
            device::commands::subghz_list_saved,
            device::commands::subghz_replay,
            device::commands::subghz_identify,
            // GPIO 命令
            device::commands::gpio_scan,
            device::commands::gpio_set_direction,
            device::commands::gpio_set_value,
            device::commands::gpio_read,
            device::commands::gpio_read_adc,
            device::commands::gpio_capture,
            // IR 命令
            device::commands::ir_learn,
            device::commands::ir_transmit,
            device::commands::ir_list_protocols,
            device::commands::ir_list_saved,
            device::commands::ir_save,
            device::commands::ir_get_presets,
            // BadUSB 命令
            device::commands::badusb_validate,
            device::commands::badusb_execute,
            device::commands::badusb_list_scripts,
            device::commands::badusb_get_script,
            device::commands::badusb_save_script,
            // 屏幕镜像
            device::commands::screen_get_frame,
            // AI 命令
            device::commands::ai_send_message,
            device::commands::ai_clear_history,
            device::commands::ai_check_sensitive,
            device::commands::ai_set_provider,
            // 系统
            device::commands::get_app_state,
            device::commands::close_window,
            device::commands::minimize_window,
            // 配置
            device::commands::config_get,
            device::commands::config_save_ai,
            device::commands::config_save_appearance,
            device::commands::config_save_device,
            device::commands::config_save_general,
            // 固件
            device::commands::firmware_get_current,
            device::commands::firmware_check_update,
            device::commands::firmware_verify_manifest,
            // 存储
            device::commands::storage_list,
            device::commands::storage_read,
            device::commands::storage_write,
            device::commands::storage_delete,
            device::commands::storage_info,
            // 日志
            device::commands::log_get_recent,
            device::commands::log_clear,
            device::commands::log_export,
            // BadUSB 三段式
            device::commands::badusb_preview,
            // SubGHz 频段合规
            device::commands::subghz_get_region,
            device::commands::subghz_set_region,
            device::commands::subghz_check_frequency,
            device::commands::subghz_list_regions,
            // CommandPolicy
            device::commands::policy_list,
            // 设备健康
            device::commands::device_health,
            // 资产库 (SQLite)
            database::cmd_nfc_save,
            database::cmd_nfc_list,
            database::cmd_nfc_delete,
            database::cmd_subghz_save,
            database::cmd_subghz_list,
            database::cmd_ir_save,
            database::cmd_ir_list,
            database::cmd_badusb_save,
            database::cmd_badusb_list,
            database::cmd_badusb_increment_exec,
            database::cmd_audit_list,
            database::cmd_audit_count,
            database::cmd_audit_clear,
            database::cmd_ai_conv_save,
            database::cmd_ai_conv_list,
            database::cmd_firmware_history_list,
            database::cmd_asset_stats,
            database::cmd_timeline_save,
            database::cmd_timeline_list,
            database::cmd_timeline_clear,
            // CommandGateway
            gateway::cmd_gateway_classify,
            gateway::cmd_gateway_check,
            gateway::cmd_gateway_audit_write,
            // 可靠性
            reliability::cmd_device_behavior_diffs,
            reliability::cmd_command_stats,
            reliability::cmd_command_stats_reset,
            reliability::cmd_export_diagnostics,
            // 发布工程
            release::cmd_get_app_version,
            release::cmd_check_for_updates,
            release::cmd_get_changelog,
            release::cmd_get_crash_logs,
            release::cmd_clear_crash_logs,
            release::cmd_log_error,
            release::cmd_get_release_checklist,
            // RC1 Release Freeze
            freeze::cmd_get_freeze_snapshot,
            freeze::cmd_get_frozen_commands,
            freeze::cmd_get_high_risk_summary,
            freeze::cmd_get_known_issues,
            freeze::cmd_get_mock_audit,
            freeze::cmd_get_mode_behaviors,
            freeze::cmd_get_database_schema_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
