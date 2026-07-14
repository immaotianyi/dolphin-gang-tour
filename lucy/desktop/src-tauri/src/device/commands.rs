/**
 * Tauri 命令处理 — 暴露给前端的 invoke 接口
 *
 * 所有硬件操作通过 TransportManager 路由：
 *   前端 invoke → commands.rs → TransportManager → DeviceTransport trait → USB/Virtual
 */
use crate::app_state::{ConnectionState, DeviceInfo, NfcCardInfo};
use crate::error::{LucyError, LucyResult};
use crate::SharedState;
use tauri::{AppHandle, Manager, Window};
use tauri::Emitter;
use std::sync::Arc;
use super::detector;
use super::transport_manager::TransportManager;
use super::modules;

/// 获取全局状态
fn get_state(app: &AppHandle) -> SharedState {
    app.state::<SharedState>().inner().clone()
}

/// 获取传输层管理器
fn get_tm(app: &AppHandle) -> Arc<TransportManager> {
    app.state::<Arc<TransportManager>>().inner().clone()
}

// ─── 设备管理命令 ────────────────────────────────────

/// 扫描可用设备（真实串口 + 虚拟设备）
#[tauri::command]
pub async fn device_scan() -> LucyResult<Vec<detector::ScannedDevice>> {
    detector::scan_devices()
        .await
        .map_err(|e| LucyError::Usb(e))
}

/// 连接设备
#[tauri::command]
pub async fn device_connect(
    app: AppHandle,
    port: String,
) -> LucyResult<serde_json::Value> {
    let state = get_state(&app);
    let tm = get_tm(&app);

    // 更新状态为连接中
    {
        let mut s = state.write();
        s.connection_state = ConnectionState::Scanning;
    }
    crate::ui_bridge::emit_state_update(&app, &state);

    // 通过 TransportManager 连接
    tm.connect(&port, &app).await
        .map_err(|e| {
            // 连接失败，更新状态
            let mut s = state.write();
            s.connection_state = ConnectionState::Error;
            e
        })?;

    // 获取设备信息
    let transport = tm.get_transport()?;
    let info = transport.get_info().await;

    let is_virtual = tm.is_virtual();

    match info {
        Ok(device_info) => {
            {
                let mut s = state.write();
                s.connection_state = ConnectionState::Connected;
                s.is_virtual = is_virtual;
                s.device_info = Some(device_info.clone());
            }
            crate::ui_bridge::emit_state_update(&app, &state);

            // 如果是虚拟设备，启动屏幕帧推送
            if is_virtual {
                let app_clone = app.clone();
                tauri::async_runtime::spawn(async move {
                    start_virtual_screen_stream_public(app_clone).await;
                });
            }

            Ok(serde_json::json!({
                "success": true,
                "virtual": is_virtual,
                "device": device_info,
            }))
        }
        Err(e) => {
            // 获取设备信息失败，但仍标记为已连接（设备可能不支持 get_info）
            {
                let mut s = state.write();
                s.connection_state = ConnectionState::Connected;
                s.is_virtual = is_virtual;
            }
            crate::ui_bridge::emit_state_update(&app, &state);
            log::warn!("get_info failed after connect: {}", e);
            Ok(serde_json::json!({
                "success": true,
                "virtual": is_virtual,
                "warning": format!("Connected but get_info failed: {}", e),
            }))
        }
    }
}

/// 断开设备
#[tauri::command]
pub async fn device_disconnect(app: AppHandle) -> LucyResult<()> {
    let state = get_state(&app);
    let tm = get_tm(&app);

    tm.disconnect().await?;

    {
        let mut s = state.write();
        s.connection_state = ConnectionState::Disconnected;
        s.device_info = None;
    }
    crate::ui_bridge::emit_state_update(&app, &state);

    Ok(())
}

/// 获取设备信息
#[tauri::command]
pub async fn device_get_info(app: AppHandle) -> LucyResult<DeviceInfo> {
    let state = get_state(&app);
    let s = state.read();
    s.device_info
        .clone()
        .ok_or(LucyError::NotConnected)
}

/// 获取设备信息（强制从设备读取最新值）
#[tauri::command]
pub async fn device_refresh_info(app: AppHandle) -> LucyResult<DeviceInfo> {
    let state = get_state(&app);
    let tm = get_tm(&app);

    let transport = tm.get_transport()?;
    let info = transport.get_info().await?;

    {
        let mut s = state.write();
        s.device_info = Some(info.clone());
    }
    crate::ui_bridge::emit_state_update(&app, &state);

    Ok(info)
}

// ─── NFC 命令 ────────────────────────────────────────

/// NFC 检测
#[tauri::command]
pub async fn nfc_detect(app: AppHandle) -> LucyResult<NfcCardInfo> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    transport.nfc_detect().await
}

/// NFC 读取 UID
#[tauri::command]
pub async fn nfc_read_uid(app: AppHandle) -> LucyResult<NfcCardInfo> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    transport.nfc_detect().await
}

// ─── SubGHz 命令 ─────────────────────────────────────

/// SubGHz 扫描
#[tauri::command]
pub async fn subghz_scan(
    app: AppHandle,
    start_freq: Option<u32>,
    end_freq: Option<u32>,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    let start = start_freq.unwrap_or(300_000_000);
    let end = end_freq.unwrap_or(348_000_000);
    transport.subghz_scan(start, end).await
}

/// SubGHz 接收
#[tauri::command]
pub async fn subghz_rx(
    app: AppHandle,
    frequency: u32,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    transport
        .send_command("subghz", "rx", serde_json::json!({"freq": frequency}))
        .await
}

// ─── GPIO 命令 ───────────────────────────────────────

/// GPIO 设置方向
#[tauri::command]
pub async fn gpio_set_direction(
    app: AppHandle,
    pin: u8,
    direction: String,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    transport
        .send_command("gpio", "set_dir", serde_json::json!({"pin": pin, "dir": direction}))
        .await
}

/// GPIO 设置值
#[tauri::command]
pub async fn gpio_set_value(
    app: AppHandle,
    pin: u8,
    value: u8,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    transport
        .send_command("gpio", "set_val", serde_json::json!({"pin": pin, "val": value}))
        .await
}

/// GPIO 读取值
#[tauri::command]
pub async fn gpio_read(app: AppHandle, pin: u8) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    transport
        .send_command("gpio", "read", serde_json::json!({"pin": pin}))
        .await
}

// ─── IR 命令 ─────────────────────────────────────────

/// IR 学习
#[tauri::command]
pub async fn ir_learn(app: AppHandle) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    transport.send_command("ir", "learn", serde_json::json!({})).await
}

/// IR 发射
#[tauri::command]
pub async fn ir_transmit(
    app: AppHandle,
    data: String,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    transport
        .send_command("ir", "transmit", serde_json::json!({"data": data}))
        .await
}

// ─── 屏幕镜像命令 ────────────────────────────────────

/// 获取屏幕帧（按需请求）
#[tauri::command]
pub async fn screen_get_frame(app: AppHandle) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    let frame = transport.get_screen_frame().await?;

    // base64 编码返回
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&frame);
    Ok(serde_json::json!({
        "width": 240,
        "height": 240,
        "format": "rgb565",
        "data": b64,
    }))
}

// ─── AI 命令 ─────────────────────────────────────────

/// AI 发送消息 — SSE 流式响应 + 命令解析
#[tauri::command]
pub async fn ai_send_message(
    app: AppHandle,
    message: String,
    model: Option<String>,
) -> LucyResult<serde_json::Value> {
    let model_str = model.unwrap_or_else(|| "deepseek".to_string());

    // 构建设备上下文
    let state = get_state(&app);
    let device_context = {
        let s = state.read();
        let conn = match s.connection_state {
            crate::app_state::ConnectionState::Connected => {
                if s.is_virtual { "Connected (Virtual Device)" } else { "Connected (Real Device)" }
            }
            crate::app_state::ConnectionState::Disconnected => "Disconnected",
            crate::app_state::ConnectionState::Scanning => "Scanning...",
            crate::app_state::ConnectionState::Error => "Error",
        };
        let info = s.device_info.as_ref().map(|d| {
            format!(
                "Battery: {}%, Temp: {}C, Uptime: {}s",
                d.battery_level, d.temperature, d.uptime
            )
        }).unwrap_or_default();
        format!("- Connection: {}\n- {}", conn, info)
    };

    // 构建 chat history (从 AppState 获取最近消息)
    let history: Vec<crate::ai::provider::ChatMessage> = {
        let s = state.read();
        s.ai.messages.iter().map(|m| {
            crate::ai::provider::ChatMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            }
        }).collect()
    };

    // 执行 AI 管道
    let response = crate::ai::pipeline::run_pipeline(
        &app,
        &message,
        &model_str,
        &device_context,
        &history,
    ).await?;

    // 更新 AppState 中的消息历史
    {
        let mut s = state.write();
        s.ai.messages.push(crate::app_state::AiMessage {
            role: "user".to_string(),
            content: message.clone(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        });
        s.ai.messages.push(crate::app_state::AiMessage {
            role: "assistant".to_string(),
            content: response.content.clone(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        });
        s.ai.is_streaming = false;
        s.ai.model = response.model.clone();
    }

    // 推送状态更新
    crate::ui_bridge::emit_state_update(&app, &state);

    Ok(serde_json::json!({
        "content": response.content,
        "suggestions": response.cmds,
        "sanitized": response.sanitized,
        "model": response.model,
        "blocked_warnings": response.blocked_warnings,
    }))
}

/// AI 清除对话历史
#[tauri::command]
pub async fn ai_clear_history(app: AppHandle) -> LucyResult<serde_json::Value> {
    let state = get_state(&app);
    {
        let mut s = state.write();
        s.ai.messages.clear();
    }
    crate::ui_bridge::emit_state_update(&app, &state);
    Ok(serde_json::json!({"success": true}))
}

/// AI 检查脱敏 — 返回输入中的敏感数据统计
#[tauri::command]
pub async fn ai_check_sensitive(input: String) -> LucyResult<serde_json::Value> {
    let counts = crate::ai::sanitizer::count_sensitive(&input);
    Ok(serde_json::json!({
        "has_sensitive": !counts.is_empty(),
        "items": counts,
    }))
}

/// AI 设置 Provider 配置
#[tauri::command]
pub async fn ai_set_provider(
    _app: AppHandle,
    provider: String,
    _api_key: Option<String>,
    _model: Option<String>,
) -> LucyResult<serde_json::Value> {
    // Phase 4: 持久化到配置文件
    // 目前仅更新运行时状态
    let p = crate::ai::provider::Provider::from_str(&provider);
    Ok(serde_json::json!({
        "success": true,
        "provider": p,
        "endpoint": p.endpoint(),
        "default_model": p.default_model(),
        "needs_api_key": p.needs_api_key(),
    }))
}

// ─── NFC 扩展命令 ────────────────────────────────────

/// NFC 读取完整卡片数据
#[tauri::command]
pub async fn nfc_read_card(app: AppHandle) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let card = modules::nfc::read_card(&tm).await?;
    Ok(serde_json::to_value(&card).unwrap_or_default())
}

/// NFC 写入数据块
#[tauri::command]
pub async fn nfc_write_block(
    app: AppHandle,
    sector: u8,
    block: u8,
    data: String,
    key_a: Option<String>,
    key_b: Option<String>,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    modules::nfc::write_block(&tm, sector, block, data, key_a, key_b).await
}

/// NFC 卡片模拟
#[tauri::command]
pub async fn nfc_emulate(
    app: AppHandle,
    uid: String,
    card_type: String,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    modules::nfc::emulate(&tm, uid, card_type).await
}

/// NFC 列出已保存卡片
#[tauri::command]
pub async fn nfc_list_saved() -> LucyResult<serde_json::Value> {
    let cards = modules::nfc::list_saved().await?;
    Ok(serde_json::to_value(&cards).unwrap_or_default())
}

// ─── SubGHz 扩展命令 ─────────────────────────────────

/// SubGHz 信号发射
#[tauri::command]
pub async fn subghz_tx(
    app: AppHandle,
    frequency: u32,
    data: String,
    modulation: Option<String>,
    repeat: Option<u8>,
) -> LucyResult<serde_json::Value> {
    // 频段合规校验
    let check = crate::region::check_tx_frequency(frequency);
    if !check.allowed {
        crate::logger::warn("subghz", &format!(
            "TX blocked: {} MHz - {}",
            frequency as f32 / 1_000_000.0, check.reason
        ));
        return Err(LucyError::Compliance(check.reason));
    }
    let tm = get_tm(&app);
    modules::subghz::tx(&tm, frequency, data, modulation, repeat).await
}

/// SubGHz 保存信号
#[tauri::command]
pub async fn subghz_save(
    app: AppHandle,
    name: String,
    frequency: u32,
    modulation: String,
    data: String,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let signal = modules::subghz::SubghzSignal {
        frequency,
        rssi: -60,
        modulation,
        timestamp: 0,
        data: Some(data),
        protocol: modules::subghz::identify_protocol(frequency)
            .map(|(name, _)| name.to_string()),
    };
    modules::subghz::save(&tm, name, signal).await
}

/// SubGHz 列出已保存信号
#[tauri::command]
pub async fn subghz_list_saved() -> LucyResult<serde_json::Value> {
    let signals = modules::subghz::list_saved().await?;
    Ok(serde_json::to_value(&signals).unwrap_or_default())
}

/// SubGHz 重放信号
#[tauri::command]
pub async fn subghz_replay(app: AppHandle, signal_id: String) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    modules::subghz::replay(&tm, signal_id).await
}

/// SubGHz 识别已知协议
#[tauri::command]
pub async fn subghz_identify(frequency: u32) -> LucyResult<serde_json::Value> {
    match modules::subghz::identify_protocol(frequency) {
        Some((name, desc)) => Ok(serde_json::json!({"protocol": name, "description": desc})),
        None => Ok(serde_json::json!({"protocol": null, "description": "Unknown"})),
    }
}

// ─── BadUSB 命令 ─────────────────────────────────────

/// BadUSB 验证脚本安全性
#[tauri::command]
pub async fn badusb_validate(script: String) -> LucyResult<serde_json::Value> {
    let report = modules::badusb::validate(&script);
    Ok(serde_json::to_value(&report).unwrap_or_default())
}

/// BadUSB 执行脚本
#[tauri::command]
pub async fn badusb_execute(
    app: AppHandle,
    script: String,
    force: Option<bool>,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    modules::badusb::execute(&tm, script, force.unwrap_or(false)).await
}

/// BadUSB 列出脚本
#[tauri::command]
pub async fn badusb_list_scripts() -> LucyResult<serde_json::Value> {
    let scripts = modules::badusb::list_scripts().await?;
    Ok(serde_json::to_value(&scripts).unwrap_or_default())
}

/// BadUSB 获取脚本内容
#[tauri::command]
pub async fn badusb_get_script(id: String) -> LucyResult<String> {
    modules::badusb::get_script(id).await
}

/// BadUSB 保存脚本
#[tauri::command]
pub async fn badusb_save_script(
    app: AppHandle,
    name: String,
    script: String,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    modules::badusb::save_script(&tm, name, script).await
}

// ─── GPIO 扩展命令 ───────────────────────────────────

/// GPIO 扫描引脚
#[tauri::command]
pub async fn gpio_scan() -> LucyResult<serde_json::Value> {
    let pins = modules::gpio::scan_pins();
    Ok(serde_json::to_value(&pins).unwrap_or_default())
}

/// GPIO 读取 ADC
#[tauri::command]
pub async fn gpio_read_adc(app: AppHandle, pin: u8) -> LucyResult<f32> {
    let tm = get_tm(&app);
    modules::gpio::read_adc(&tm, pin).await
}

/// GPIO 逻辑分析仪采样
#[tauri::command]
pub async fn gpio_capture(
    app: AppHandle,
    pin: u8,
    sample_rate: u32,
    duration_ms: u32,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let capture = modules::gpio::capture(&tm, pin, sample_rate, duration_ms).await?;
    Ok(serde_json::to_value(&capture).unwrap_or_default())
}

// ─── IR 扩展命令 ─────────────────────────────────────

/// IR 列出已知协议
#[tauri::command]
pub async fn ir_list_protocols() -> LucyResult<serde_json::Value> {
    let protocols = modules::ir::list_protocols();
    Ok(serde_json::to_value(&protocols).unwrap_or_default())
}

/// IR 列出已保存信号
#[tauri::command]
pub async fn ir_list_saved() -> LucyResult<serde_json::Value> {
    let signals = modules::ir::list_saved().await?;
    Ok(serde_json::to_value(&signals).unwrap_or_default())
}

/// IR 保存信号
#[tauri::command]
pub async fn ir_save(
    app: AppHandle,
    name: String,
    protocol: String,
    address: u16,
    command: u16,
    device_type: String,
) -> LucyResult<serde_json::Value> {
    let tm = get_tm(&app);
    let signal = modules::ir::IrSignal {
        protocol,
        address,
        command,
        raw_data: vec![],
        frequency: 38_000,
    };
    modules::ir::save(&tm, name, signal, device_type).await
}

/// IR 获取遥控器预设
#[tauri::command]
pub async fn ir_get_presets() -> LucyResult<serde_json::Value> {
    let presets = modules::ir::get_remote_presets();
    let result: Vec<serde_json::Value> = presets.iter().map(|(name, addr, keys)| {
        let keys_json: Vec<serde_json::Value> = keys.iter()
            .map(|(code, label)| serde_json::json!({"code": code, "label": label}))
            .collect();
        serde_json::json!({"name": name, "address": addr, "keys": keys_json})
    }).collect();
    Ok(serde_json::Value::Array(result))
}

// ─── 系统命令 ────────────────────────────────────────

/// 获取应用状态
#[tauri::command]
pub async fn get_app_state(app: AppHandle) -> LucyResult<serde_json::Value> {
    let state = get_state(&app);
    let snapshot = state.read().snapshot();
    Ok(snapshot)
}

/// 关闭窗口
#[tauri::command]
pub async fn close_window(window: Window) -> () {
    window.close().unwrap_or(());
}

/// 最小化窗口
#[tauri::command]
pub async fn minimize_window(window: Window) -> () {
    window.minimize().unwrap_or(());
}

// ─── 内部辅助 ────────────────────────────────────────

// ─── 配置命令 ────────────────────────────────────────

/// 获取配置
#[tauri::command]
pub async fn config_get() -> LucyResult<serde_json::Value> {
    let config = crate::config::load();
    Ok(serde_json::to_value(&config).unwrap_or_default())
}

/// 保存 AI 配置
#[tauri::command]
pub async fn config_save_ai(
    provider: String,
    api_key: String,
    model: String,
) -> LucyResult<serde_json::Value> {
    let config = crate::config::update_ai(&provider, &api_key, &model)?;
    crate::logger::info("config", &format!("AI config updated: provider={}", provider));
    Ok(serde_json::to_value(&config).unwrap_or_default())
}

/// 保存外观配置
#[tauri::command]
pub async fn config_save_appearance(
    theme: String,
    font_size: u8,
    crt_effect: bool,
    scanlines: bool,
) -> LucyResult<serde_json::Value> {
    let config = crate::config::update_appearance(&theme, font_size, crt_effect, scanlines)?;
    crate::logger::info("config", &format!("Appearance updated: theme={}", theme));
    Ok(serde_json::to_value(&config).unwrap_or_default())
}

/// 保存设备配置
#[tauri::command]
pub async fn config_save_device(
    last_port: Option<String>,
    auto_connect: bool,
) -> LucyResult<serde_json::Value> {
    let config = crate::config::update_device(last_port, auto_connect)?;
    crate::logger::info("config", "Device config updated");
    Ok(serde_json::to_value(&config).unwrap_or_default())
}

/// 保存通用配置 (语言/地区/时区)
#[tauri::command]
pub async fn config_save_general(
    language: String,
    region: String,
    timezone: String,
) -> LucyResult<serde_json::Value> {
    let config = crate::config::update_general(&language, &region, &timezone)?;
    crate::logger::info("config", &format!("General config updated: lang={}, region={}", language, region));
    Ok(serde_json::to_value(&config).unwrap_or_default())
}

// ─── 固件命令 ────────────────────────────────────────

/// 获取当前固件信息
#[tauri::command]
pub async fn firmware_get_current(app: AppHandle) -> LucyResult<serde_json::Value> {
    let state = get_state(&app);
    let is_virtual = {
        let s = state.read();
        s.is_virtual
    };

    // 虚拟设备返回模拟信息
    if is_virtual {
        let fw = crate::firmware::mock_current_firmware();
        return Ok(serde_json::to_value(&fw).unwrap_or_default());
    }

    // 真实设备：从 device_info 提取
    let s = state.read();
    if let Some(info) = &s.device_info {
        Ok(serde_json::json!({
            "version": info.firmware_version,
            "api_level": 1,
            "commit_hash": "",
            "build_date": "",
            "active_partition": "A",
            "hardware_rev": 1,
        }))
    } else {
        Err(LucyError::NotConnected)
    }
}

/// 检查固件更新
#[tauri::command]
pub async fn firmware_check_update(
    _app: AppHandle,
    manifest_json: String,
) -> LucyResult<serde_json::Value> {
    let manifest = crate::firmware::parse_manifest(&manifest_json)?;
    let current = crate::firmware::mock_current_firmware();
    let has_update = crate::firmware::check_update(&current, &manifest);

    crate::logger::info("firmware", &format!(
        "Update check: current={} target={} update_available={}",
        current.version, manifest.version, has_update
    ));

    Ok(serde_json::json!({
        "has_update": has_update,
        "current_version": current.version,
        "target_version": manifest.version,
        "changelog": manifest.changelog,
    }))
}

/// 验证固件清单
#[tauri::command]
pub async fn firmware_verify_manifest(
    manifest_json: String,
    current_api_level: u16,
) -> LucyResult<serde_json::Value> {
    let manifest = crate::firmware::parse_manifest(&manifest_json)?;
    crate::firmware::verify_manifest(&manifest, current_api_level)?;

    crate::logger::info("firmware", &format!(
        "Manifest verified: v{} API Level {}",
        manifest.version, manifest.api_level
    ));

    Ok(serde_json::json!({
        "valid": true,
        "version": manifest.version,
        "api_level": manifest.api_level,
        "size": manifest.size,
        "sha256": manifest.sha256,
    }))
}

// ─── 存储命令 ────────────────────────────────────────

/// 列出目录文件
#[tauri::command]
pub async fn storage_list(
    app: AppHandle,
    path: String,
) -> LucyResult<serde_json::Value> {
    // 路径安全校验
    crate::storage::validate_path(&path)?;

    let state = get_state(&app);
    let is_virtual = {
        let s = state.read();
        s.is_virtual
    };

    if is_virtual {
        let files = crate::storage::mock_list_files(&path);
        return Ok(serde_json::to_value(&files).unwrap_or_default());
    }

    // 真实设备：通过 IPC 请求
    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    let result = transport
        .send_command("storage", "list", serde_json::json!({"path": path}))
        .await?;
    Ok(result)
}

/// 读取文件内容
#[tauri::command]
pub async fn storage_read(
    app: AppHandle,
    path: String,
) -> LucyResult<serde_json::Value> {
    crate::storage::validate_path(&path)?;

    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    let result = transport
        .send_command("storage", "read", serde_json::json!({"path": path}))
        .await?;
    Ok(result)
}

/// 写入文件
#[tauri::command]
pub async fn storage_write(
    app: AppHandle,
    path: String,
    data: String,
) -> LucyResult<serde_json::Value> {
    let req = crate::storage::build_write_request(&path, &data)?;

    let tm = get_tm(&app);
    let transport = tm.get_transport()?;
    let result = transport.send_command("storage", "write", req).await?;

    crate::logger::info("storage", &format!("File written: {}", path));
    Ok(result)
}

/// 删除文件/目录（递归删除子文件）
#[tauri::command]
pub async fn storage_delete(
    app: AppHandle,
    path: String,
) -> LucyResult<serde_json::Value> {
    crate::storage::validate_path(&path)?;

    let tm = get_tm(&app);
    let transport = tm.get_transport()?;

    // 先尝试列出子项，如果是目录则递归删除
    let list_result = transport
        .send_command("storage", "list", serde_json::json!({"path": &path}))
        .await;

    if let Ok(items) = list_result {
        if let Some(arr) = items.as_array() {
            for item in arr {
                if let Some(child_path) = item.get("path").and_then(|p| p.as_str()) {
                    let _ = transport
                        .send_command("storage", "delete", serde_json::json!({"path": child_path}))
                        .await;
                }
            }
        }
    }

    // 删除自身
    let result = transport
        .send_command("storage", "delete", serde_json::json!({"path": &path}))
        .await?;

    crate::logger::info("storage", &format!("Deleted: {}", path));
    Ok(result)
}

/// 获取存储信息
#[tauri::command]
pub async fn storage_info(app: AppHandle) -> LucyResult<serde_json::Value> {
    let state = get_state(&app);
    let is_virtual = {
        let s = state.read();
        s.is_virtual
    };

    if is_virtual {
        let info = crate::storage::mock_storage_info();
        return Ok(serde_json::to_value(&info).unwrap_or_default());
    }

    // 真实设备：从 device_info 获取
    let s = state.read();
    if let Some(info) = &s.device_info {
        Ok(serde_json::json!({
            "total": info.sd_card_total,
            "free": info.sd_card_free,
            "used": info.sd_card_total.saturating_sub(info.sd_card_free),
            "label": "SD",
        }))
    } else {
        Err(LucyError::NotConnected)
    }
}

// ─── 日志命令 ────────────────────────────────────────

/// 获取最近日志
#[tauri::command]
pub async fn log_get_recent(count: Option<usize>) -> LucyResult<Vec<crate::logger::LogEntry>> {
    Ok(crate::logger::recent(count.unwrap_or(100)))
}

/// 清空日志
#[tauri::command]
pub async fn log_clear() -> LucyResult<serde_json::Value> {
    crate::logger::clear();
    Ok(serde_json::json!({"success": true}))
}

/// 导出日志到文件
#[tauri::command]
pub async fn log_export() -> LucyResult<String> {
    crate::logger::export()
}

// ─── BadUSB 三段式命令 ───────────────────────────────

/// BadUSB 脚本预览（三段式: validate → preview → execute）
#[tauri::command]
pub async fn badusb_preview(script: String) -> LucyResult<serde_json::Value> {
    let preview_lines = modules::badusb::preview(&script);
    let report = modules::badusb::validate(&script);
    Ok(serde_json::json!({
        "lines": preview_lines,
        "report": {
            "passed": report.passed,
            "danger_count": report.danger_count,
            "warn_count": report.warn_count,
            "safe_count": report.safe_count,
            "total_lines": report.total_lines,
            "issues": report.issues,
        }
    }))
}

// ─── SubGHz 频段合规命令 ─────────────────────────────

/// 获取当前地区设置
#[tauri::command]
pub async fn subghz_get_region() -> LucyResult<serde_json::Value> {
    let region = crate::region::get_region();
    Ok(serde_json::json!({
        "region": region.as_str(),
        "name": region.label_zh(),
        "bands": crate::region::allowed_bands(region),
        "forbidden": crate::region::forbidden_bands().iter().map(|(s,e,r)| serde_json::json!({
            "start": s, "end": e, "reason": r
        })).collect::<Vec<_>>(),
    }))
}

/// 设置地区
#[tauri::command]
pub async fn subghz_set_region(region_code: String) -> LucyResult<serde_json::Value> {
    let region = crate::region::Region::from_str(&region_code);
    crate::region::set_region(region);
    crate::logger::info("region", &format!("Region set to {}", region.label_zh()));
    Ok(serde_json::json!({
        "success": true,
        "region": region.as_str(),
        "name": region.label_zh(),
    }))
}

/// 校验频率是否允许发射
#[tauri::command]
pub async fn subghz_check_frequency(frequency: u32) -> LucyResult<serde_json::Value> {
    let check = crate::region::check_tx_frequency(frequency);
    Ok(serde_json::to_value(&check).unwrap_or_default())
}

/// 获取所有地区及频段信息
#[tauri::command]
pub async fn subghz_list_regions() -> LucyResult<serde_json::Value> {
    Ok(serde_json::json!(crate::region::list_regions()))
}

// ─── CommandPolicy 命令 ──────────────────────────────

/// 获取所有命令策略（前端用于风险标注）
#[tauri::command]
pub async fn policy_list() -> LucyResult<serde_json::Value> {
    let policies = crate::policy::all_policies();
    Ok(serde_json::to_value(&policies).unwrap_or_default())
}

// ─── 设备健康/诊断命令 ───────────────────────────────

/// 获取设备健康诊断信息
#[tauri::command]
pub async fn device_health(app: AppHandle) -> LucyResult<serde_json::Value> {
    let state = get_state(&app);
    let s = state.read();

    let conn_info = serde_json::json!({
        "state": format!("{:?}", s.connection_state),
        "is_virtual": s.is_virtual,
        "device": s.device_info,
        "pending_ai_commands": s.ai.messages.len(),
    });

    Ok(conn_info)
}

// ─── 内部辅助 ────────────────────────────────────────

/// 虚拟设备屏幕帧推送任务
/// 在虚拟设备模式下，定时生成 RGB565 帧并 emit 给前端
pub async fn start_virtual_screen_stream_public(app: AppHandle) {
    use std::sync::atomic::{AtomicU32, Ordering};
    let frame_count = AtomicU32::new(0);

    loop {
        // 检查是否仍然连接且为虚拟设备
        let tm = get_tm(&app);
        if !tm.is_connected() || !tm.is_virtual() {
            break;
        }

        let count = frame_count.fetch_add(1, Ordering::SeqCst);
        let frame = generate_virtual_screen_frame(count);

        // base64 编码
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&frame);
        let _ = app.emit("screen_frame", serde_json::json!({
            "width": 240,
            "height": 240,
            "format": "rgb565",
            "data": b64,
        }));

        // ~10fps
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

/// 生成虚拟屏幕帧（正弦波图案）— 使用 screen 模块的 RGB565 编码器
fn generate_virtual_screen_frame(count: u32) -> Vec<u8> {
    let w = 240u32;
    let h = 240u32;
    let mut data = vec![0u8; (w * h * 2) as usize];
    let t = count as f32 * 0.1;

    for y in 0..h {
        for x in 0..w {
            let cx = w as f32 / 2.0;
            let cy = h as f32 / 2.0;
            let dist = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
            let wave = (dist * 0.05 - t * 2.0).sin() * 0.5 + 0.5;
            let r = (wave * 249.0) as u8;
            let g = (wave * 115.0) as u8;
            let b = (wave * 22.0) as u8;
            let rgb565 = modules::screen::rgb_to_rgb565(r, g, b);
            let idx = ((y * w + x) * 2) as usize;
            data[idx] = ((rgb565 >> 8) & 0xff) as u8;
            data[idx + 1] = (rgb565 & 0xff) as u8;
        }
    }
    data
}


