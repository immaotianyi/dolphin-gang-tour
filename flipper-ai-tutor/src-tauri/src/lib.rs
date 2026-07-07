// =============================================================================
// lib.rs - Tauri 应用核心入口
// =============================================================================
// 职责：
//   1. 声明并聚合所有业务子模块（device / rpc / firmware / import / ai / diagnostics）
//   2. 定义全局应用状态 AppState（设备状态、RPC 会话、AI 配置、导入进度）
//   3. 定义统一的 IPC 响应结构 IpcResult<T>
//   4. 注册所有 #[tauri::command] 命令并导出 run() 函数
// 说明：所有传递给前端的数据结构均使用 serde 序列化；长时间操作通过
//       app.emit() 向前端发送进度事件。
//
// Tauri 2.0 约定：async 命令若含引用参数（如 State<'_>），返回值必须为
//   Result<T, E>（E: Serialize）。因此所有 IPC 命令返回 Result<IpcResult<T>, String>，
//   正常时返回 Ok(IpcResult::ok(data))，前端据此解析 success 字段。
// =============================================================================

// -------------------- 模块声明 --------------------
pub mod ai;
pub mod device;
pub mod diagnostics;
pub mod firmware;
pub mod import;
pub mod rpc;

// -------------------- 第三方依赖 --------------------
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Emitter, State};

// H1: API Key 安全存储使用的系统钥匙串
use keyring::Entry;

// -------------------- 通用 IPC 响应结构 --------------------

/// 统一的 IPC 响应结构，与前端 types/index.ts 中的 IpcResult<T> 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcResult<T: Serialize> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T: Serialize> IpcResult<T> {
    /// 构造成功响应
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    /// 构造失败响应
    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg.into()),
        }
    }
}

/// 无数据成功响应的快捷别名
pub type IpcVoid = IpcResult<serde_json::Value>;

/// 构造无返回值的成功响应
pub fn ok_void() -> IpcVoid {
    IpcResult {
        success: true,
        data: Some(serde_json::Value::Null),
        error: None,
    }
}

// -------------------- 成就 IPC 数据结构 --------------------

/// 成就信息（返回给前端的单个成就）
/// 与前端 types/index.ts 中的 Achievement 接口对应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    /// 成就唯一 ID
    pub id: String,
    /// 成就名称
    pub name: String,
    /// 成就描述
    pub description: String,
    /// 图标名，对应前端 IconName
    pub icon: String,
    /// 是否已解锁
    pub unlocked: bool,
    /// 解锁时间（unix 时间戳，秒）；未解锁时为 None
    pub unlocked_at: Option<u64>,
    /// 当前进度
    pub progress: u32,
    /// 目标值，0 表示无进度条
    pub target: u32,
}

// -------------------- 全局应用状态 --------------------

/// 全局应用状态，通过 Tauri 的 manage() 注入，命令中通过 State<AppState> 获取。
/// 内部所有可变状态均使用 parking_lot::Mutex 保护，保证线程安全。
pub struct AppState {
    /// 设备管理状态：当前连接的设备信息与连接状态
    pub device: Arc<Mutex<device::DeviceState>>,
    /// RPC 会话：与 FlipperZero 的串口通信会话（传输时独占）
    pub rpc_session: Arc<Mutex<Option<rpc::RpcSession>>>,
    /// AI 模型配置：当前选择的模型 provider / apiKey 等
    pub ai_config: Arc<Mutex<ai::AiModelConfig>>,
    /// 资源导入进度：当前导入任务的实时进度
    pub import_progress: Arc<Mutex<import::ImportProgress>>,
    /// 屏幕镜像控制句柄：是否正在推流
    pub screen_mirror_running: Arc<Mutex<bool>>,
    /// 日志缓冲：用于 save_log_dump 命令导出
    pub log_buffer: Arc<Mutex<Vec<String>>>,
    /// 取消标志：固件刷写（前端调用 cancel_flash 时置为 true）
    pub cancel_flash_flag: Arc<std::sync::atomic::AtomicBool>,
    /// 取消标志：资源导入（前端调用 cancel_import 时置为 true）
    pub cancel_import_flag: Arc<std::sync::atomic::AtomicBool>,
    /// 取消标志：AI 流式对话（前端调用 cancel_ai_chat 时置为 true）
    pub cancel_ai_chat_flag: Arc<std::sync::atomic::AtomicBool>,
    /// 成就数据：已解锁成就与进度（持久化到 achievements.json）
    pub achievements: parking_lot::Mutex<AchievementData>,
}

// -------------------- AI 配置持久化 --------------------

/// 获取 AI 配置文件路径
///
/// 配置文件存储在用户配置目录下：
///   macOS: ~/Library/Application Support/app/ai_config.json
///   Linux: ~/.config/app/ai_config.json
///   Windows: %APPDATA%\app\ai_config.json
fn ai_config_path() -> Option<std::path::PathBuf> {
    let proj_dirs = directories::ProjectDirs::from("com", "dolphin-gang-tour", "app")?;
    let config_dir = proj_dirs.config_dir();
    let _ = std::fs::create_dir_all(config_dir);
    Some(config_dir.join("ai_config.json"))
}

/// 从磁盘加载 AI 配置（启动时调用）
///
/// 如配置文件不存在或解析失败，返回默认本地配置
fn load_ai_config() -> ai::AiModelConfig {
    let path = match ai_config_path() {
        Some(p) => p,
        None => {
            log::warn!("无法获取配置目录路径，使用默认 AI 配置");
            return ai::AiModelConfig::default_local();
        }
    };

    if !path.exists() {
        log::info!("AI 配置文件不存在，使用默认配置");
        return ai::AiModelConfig::default_local();
    }

    match std::fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<ai::AiModelConfig>(&content) {
            Ok(mut config) => {
                // H1: JSON 文件中 api_key 为空字符串，从系统钥匙串读取真实 API Key 填充回 config
                config.api_key = match Entry::new("com.dolphin-gang-tour.app", "api_key") {
                    Ok(entry) => entry.get_password().unwrap_or_default(),
                    Err(e) => {
                        log::warn!("创建钥匙串条目失败: {e}，API Key 留空");
                        String::new()
                    }
                };
                log::info!(
                    "AI 配置加载成功: provider={} model={}",
                    config.provider.as_str(),
                    config.model_name
                );
                config
            }
            Err(e) => {
                log::warn!("AI 配置解析失败: {e}，使用默认配置");
                ai::AiModelConfig::default_local()
            }
        },
        Err(e) => {
            log::warn!("读取 AI 配置文件失败: {e}，使用默认配置");
            ai::AiModelConfig::default_local()
        }
    }
}

/// 保存 AI 配置到磁盘（设置配置时调用）
///
/// H1: API Key 不再明文存入 JSON 文件，改用系统钥匙串（keyring）存储。
/// M11: 采用临时文件 + rename 的原子写入方式，避免写入中途崩溃导致配置损坏。
fn save_ai_config(config: &ai::AiModelConfig) {
    let path = match ai_config_path() {
        Some(p) => p,
        None => {
            log::warn!("无法获取配置目录路径，跳过保存 AI 配置");
            return;
        }
    };

    // H1: 将 API Key 存入系统钥匙串，失败时 fallback 到空字符串（不 panic）
    let api_key = config.api_key.clone();
    if !api_key.is_empty() {
        match Entry::new("com.dolphin-gang-tour.app", "api_key") {
            Ok(entry) => {
                if let Err(e) = entry.set_password(&api_key) {
                    log::warn!("钥匙串存储 API Key 失败: {e}");
                }
            }
            Err(e) => {
                log::warn!("创建钥匙串条目失败: {e}");
            }
        }
    }

    // H1: 构造 JSON 副本，api_key 写空字符串，避免明文落盘
    let mut config_for_file = config.clone();
    config_for_file.api_key = String::new();

    match serde_json::to_string_pretty(&config_for_file) {
        Ok(json) => {
            // M11: 原子写入：先写临时文件，再 rename
            let tmp_path = path.with_extension("json.tmp");
            if let Err(e) = std::fs::write(&tmp_path, &json) {
                log::warn!("写入 AI 配置临时文件失败: {e}");
                return;
            }
            // H1: 设置文件权限 0600
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = std::fs::metadata(&tmp_path) {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o600);
                    let _ = std::fs::set_permissions(&tmp_path, perms);
                }
            }
            if let Err(e) = std::fs::rename(&tmp_path, &path) {
                log::warn!("重命名 AI 配置文件失败: {e}");
                let _ = std::fs::remove_file(&tmp_path);
            } else {
                log::debug!("AI 配置已保存到 {:?}", path);
            }
        }
        Err(e) => {
            log::warn!("序列化 AI 配置失败: {e}");
        }
    }
}

// -------------------- 成就数据持久化 --------------------

/// 成就数据（持久化到 achievements.json）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AchievementData {
    /// 已解锁成就：id -> 解锁时间（unix 时间戳，秒）
    pub unlocked: std::collections::HashMap<String, u64>,
    /// 成就进度：id -> 当前进度值
    pub progress: std::collections::HashMap<String, u32>,
}

/// 获取当前 unix 时间戳（秒）
fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 成就数据持久化文件路径（app_config_dir/achievements.json）
fn achievements_file_path() -> Option<std::path::PathBuf> {
    let proj_dirs = directories::ProjectDirs::from("com", "dolphin-gang-tour", "app")?;
    let config_dir = proj_dirs.config_dir();
    let _ = std::fs::create_dir_all(config_dir);
    Some(config_dir.join("achievements.json"))
}

/// 从磁盘加载成就数据（文件不存在或解析失败时返回空数据）
fn load_achievement_data() -> AchievementData {
    let path = match achievements_file_path() {
        Some(p) => p,
        None => return AchievementData::default(),
    };
    if !path.exists() {
        return AchievementData::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str::<AchievementData>(&content).unwrap_or_default(),
        Err(_) => AchievementData::default(),
    }
}

/// 将成就数据持久化到磁盘（原子写入：临时文件 + rename）
fn save_achievement_data(data: &AchievementData) {
    let path = match achievements_file_path() {
        Some(p) => p,
        None => {
            log::warn!("无法获取配置目录路径，跳过保存成就数据");
            return;
        }
    };
    match serde_json::to_string_pretty(data) {
        Ok(json) => {
            let tmp_path = path.with_extension("json.tmp");
            if let Err(e) = std::fs::write(&tmp_path, &json) {
                log::warn!("写入成就数据临时文件失败: {e}");
                return;
            }
            if let Err(e) = std::fs::rename(&tmp_path, &path) {
                log::warn!("重命名成就数据文件失败: {e}");
                let _ = std::fs::remove_file(&tmp_path);
            } else {
                log::debug!("成就数据已保存到 {:?}", path);
            }
        }
        Err(e) => log::warn!("序列化成就数据失败: {e}"),
    }
}

/// 全部成就定义（硬编码）
/// 返回 (id, name, description, icon, target) 元组列表
fn all_achievements() -> Vec<(&'static str, &'static str, &'static str, &'static str, u32)> {
    vec![
        ("first_import", "首次导入", "完成第一次一键导入", "rocket", 1),
        ("card_master", "卡牌大师", "复制 10 张卡", "nfc", 10),
        ("signal_hunter", "信号猎手", "捕获 5 个信号", "subghz", 5),
        ("keyboard_warrior", "键盘侠", "运行 BadUSB 脚本", "badusb", 1),
        ("flash_master", "刷机达人", "刷写 3 次固件", "wrench", 3),
        ("graduate", "毕业", "完成全部课程", "dolphin", 7),
        ("first_connect", "初次连接", "首次连接 Flipper Zero", "usb", 1),
        ("mirror_master", "镜像大师", "使用屏幕镜像 10 次", "mirror", 10),
        ("ai_scholar", "AI 学者", "与 AI 对话 100 次", "chip", 100),
        ("collector", "收藏家", "导入全部 7 个资源包", "folder", 7),
    ]
}

impl AppState {
    /// 创建默认的应用状态（启动时自动加载持久化的 AI 配置）
    pub fn new() -> Self {
        Self {
            device: Arc::new(Mutex::new(device::DeviceState::default())),
            rpc_session: Arc::new(Mutex::new(None)),
            ai_config: Arc::new(Mutex::new(load_ai_config())),
            import_progress: Arc::new(Mutex::new(import::ImportProgress::idle())),
            screen_mirror_running: Arc::new(Mutex::new(false)),
            log_buffer: Arc::new(Mutex::new(Vec::new())),
            cancel_flash_flag: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_import_flag: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            cancel_ai_chat_flag: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            achievements: parking_lot::Mutex::new(load_achievement_data()),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// 向日志缓冲追加一条记录（供 save_log_dump 导出）
pub fn push_log(state: &AppState, line: impl Into<String>) {
    let mut buf = state.log_buffer.lock();
    // 限制缓冲最大 5000 条，避免内存膨胀
    if buf.len() >= 5000 {
        buf.remove(0);
    }
    buf.push(line.into());
}

// =============================================================================
// IPC 命令实现
// 每个命令均标注 #[tauri::command]，返回 Result<IpcResult<T>, String>
// （Tauri 2.0 要求 async 命令含引用参数时必须返回 Result）
// =============================================================================

// -------------------- 设备相关命令 --------------------

/// 扫描已连接的 FlipperZero 设备
/// 返回设备列表及连接状态（no_device / dfu_mode / port_busy / connected 等）
#[tauri::command]
async fn device_scan(
    state: State<'_, AppState>,
) -> Result<IpcResult<device::DeviceScanResult>, String> {
    log::info!("IPC: device_scan 被调用");
    match device::detector::scan_devices() {
        Ok(mut scan_result) => {
            // 注入虚拟设备（始终出现在列表中）
            scan_result.devices.push(device::DetectedDevice {
                port_name: device::virtual_flipper::VIRTUAL_PORT_NAME.to_string(),
                vid: 0x0483,
                pid: 0x5740,
                mode: device::DeviceMode::Normal,
                friendly_name: "Flipper Zero (Virtual Demo)".to_string(),
                connectable: true,
            });
            let device_count = scan_result.devices.len();
            // 更新内部设备状态
            {
                let mut dev = state.device.lock();
                dev.last_scan = Some(scan_result.clone());
            }
            push_log(&state, format!("device_scan: 找到 {} 个设备（含 1 个虚拟设备）", device_count));
            Ok(IpcResult::ok(scan_result))
        }
        Err(e) => {
            let msg = format!("设备扫描失败: {e}");
            push_log(&state, &msg);
            Ok(IpcResult::err(msg))
        }
    }
}

/// 连接到指定 FlipperZero 设备（建立 RPC 会话）
#[tauri::command]
async fn device_connect(
    state: State<'_, AppState>,
    port_name: String,
) -> Result<IpcVoid, String> {
    log::info!("IPC: device_connect port={}", port_name);
    push_log(&state, format!("开始连接设备: {}", port_name));
    // 标记连接中
    {
        let mut dev = state.device.lock();
        dev.connection_state = device::DeviceConnectionState::Connecting;
    }

    // M10: 尝试停止旧会话（如果存在），避免旧会话占用串口
    if let Some(old_session) = state.rpc_session.lock().take() {
        let _ = rpc::protocol::stop_session(&old_session);
    }

    // 检查是否为虚拟设备
    if port_name == device::virtual_flipper::VIRTUAL_PORT_NAME {
        device::virtual_flipper::set_virtual(true);
        *state.rpc_session.lock() = None; // 虚拟模式无 session
        {
            let mut dev = state.device.lock();
            dev.connection_state = device::DeviceConnectionState::Connected;
            dev.port_name = Some(port_name.clone());
            dev.device_info = Some(device::virtual_flipper::virtual_system_get_info());
        }
        push_log(&state, format!("虚拟设备连接成功: {}", port_name));
        return Ok(ok_void());
    }

    // 真实设备连接
    device::virtual_flipper::set_virtual(false);
    match rpc::protocol::start_session(&port_name) {
        Ok(session) => {
            // 保存 RPC 会话
            *state.rpc_session.lock() = Some(session);
            // 更新设备状态为已连接
            {
                let mut dev = state.device.lock();
                dev.connection_state = device::DeviceConnectionState::Connected;
                dev.port_name = Some(port_name.clone());
            }
            push_log(&state, format!("设备连接成功: {}", port_name));
            Ok(ok_void())
        }
        Err(e) => {
            let msg = format!("设备连接失败: {e}");
            push_log(&state, &msg);
            {
                let mut dev = state.device.lock();
                dev.connection_state = device::DeviceConnectionState::NoDevice;
            }
            Ok(IpcResult::err(msg))
        }
    }
}

/// 断开当前设备连接
#[tauri::command]
async fn device_disconnect(state: State<'_, AppState>) -> Result<IpcVoid, String> {
    log::info!("IPC: device_disconnect");
    device::virtual_flipper::set_virtual(false);
    // 停止屏幕镜像（如果在运行）
    *state.screen_mirror_running.lock() = false;
    // M10: 尝试停止 RPC 会话（如果存在），再置空
    if let Some(session) = state.rpc_session.lock().take() {
        let _ = rpc::protocol::stop_session(&session);
    }
    // 重置设备状态
    {
        let mut dev = state.device.lock();
        dev.connection_state = device::DeviceConnectionState::NoDevice;
        dev.port_name = None;
        dev.device_info = None;
    }
    push_log(&state, "设备已断开");
    Ok(ok_void())
}

/// 获取当前设备的详细信息（通过 RPC system_get_info / device_info）
#[tauri::command]
async fn get_device_info(
    state: State<'_, AppState>,
) -> Result<IpcResult<device::DeviceInfo>, String> {
    log::info!("IPC: get_device_info");

    // 虚拟设备模式：直接返回虚拟设备信息
    if device::virtual_flipper::is_virtual() {
        let info = device::virtual_flipper::virtual_system_get_info();
        state.device.lock().device_info = Some(info.clone());
        push_log(&state, format!("获取虚拟设备信息成功: {}", info.name));
        return Ok(IpcResult::ok(info));
    }

    let session_opt = state.rpc_session.lock().clone();
    match session_opt {
        Some(session) => match rpc::protocol::system_get_info(&session) {
            Ok(info) => {
                // 缓存设备信息
                state.device.lock().device_info = Some(info.clone());
                push_log(&state, format!("获取设备信息成功: {}", info.name));
                Ok(IpcResult::ok(info))
            }
            Err(e) => Ok(IpcResult::err(format!("获取设备信息失败: {e}"))),
        },
        None => Ok(IpcResult::err("设备未连接，请先连接设备")),
    }
}

// -------------------- 驱动 / 端口 / SD 卡命令 --------------------

/// 安装驱动（Windows 下 Auto-Zadig 自动替换 libusb 驱动）
#[tauri::command]
async fn install_driver(
    state: State<'_, AppState>,
    force: bool,
) -> Result<IpcResult<device::driver::DriverInstallResult>, String> {
    log::info!("IPC: install_driver force={}", force);
    push_log(&state, "开始安装驱动...");
    match device::driver::install_driver(force) {
        Ok(r) => {
            push_log(&state, format!("驱动安装完成: {:?}", r));
            Ok(IpcResult::ok(r))
        }
        Err(e) => Ok(IpcResult::err(format!("驱动安装失败: {e}"))),
    }
}

/// 强制结束占用串口的进程（qflipper / cura / arduino 等）
#[tauri::command]
async fn kill_port_occupier(
    state: State<'_, AppState>,
    port_name: String,
) -> Result<IpcResult<device::detector::KillResult>, String> {
    log::info!("IPC: kill_port_occupier port={}", port_name);
    push_log(&state, format!("尝试释放串口占用: {}", port_name));
    match device::detector::kill_port_occupier(&port_name) {
        Ok(r) => {
            push_log(&state, format!("串口释放完成: {:?}", r));
            Ok(IpcResult::ok(r))
        }
        Err(e) => Ok(IpcResult::err(format!("释放串口失败: {e}"))),
    }
}

/// 格式化 SD 卡（FAT32 + 32K 簇）
#[tauri::command]
async fn format_sd_card(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    cluster_size_kb: Option<u32>,
) -> Result<IpcResult<device::sd_card::FormatResult>, String> {
    log::info!("IPC: format_sd_card cluster={:?}", cluster_size_kb);
    push_log(&state, "开始格式化 SD 卡...");
    let session_opt = state.rpc_session.lock().clone();
    match session_opt {
        Some(session) => {
            match device::sd_card::format_sd_card(
                &session,
                cluster_size_kb.unwrap_or(32),
                |progress, message| {
                    // 通过 Tauri 事件向前端推送格式化进度
                    let _ = app.emit(
                        "sd-format-progress",
                        serde_json::json!({ "progress": progress, "message": message }),
                    );
                },
            ) {
                Ok(r) => {
                    push_log(&state, "SD 卡格式化完成");
                    Ok(IpcResult::ok(r))
                }
                Err(e) => Ok(IpcResult::err(format!("SD 卡格式化失败: {e}"))),
            }
        }
        None => Ok(IpcResult::err("设备未连接，无法格式化 SD 卡")),
    }
}

// -------------------- 诊断命令 --------------------

/// 执行全量故障诊断，返回 DiagnosticResult 列表
#[tauri::command]
async fn diagnose(
    state: State<'_, AppState>,
) -> Result<IpcResult<Vec<diagnostics::DiagnosticResult>>, String> {
    log::info!("IPC: diagnose");
    push_log(&state, "开始故障诊断...");
    let device_state = state.device.lock().clone();
    let session_opt = state.rpc_session.lock().clone();
    match diagnostics::run_diagnostics(&device_state, session_opt.as_ref()) {
        Ok(results) => {
            push_log(
                &state,
                format!("诊断完成，共 {} 项结果", results.len()),
            );
            Ok(IpcResult::ok(results))
        }
        Err(e) => Ok(IpcResult::err(format!("诊断失败: {e}"))),
    }
}

// -------------------- 固件相关命令 --------------------

/// 刷写固件（双轨：RPC 刷写 / DFU 刷写），通过事件推送进度
#[tauri::command]
async fn flash_firmware(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    firmware_id: String,
    firmware_path: Option<String>,
) -> Result<IpcResult<firmware::FlashResult>, String> {
    log::info!("IPC: flash_firmware id={} path={:?}", firmware_id, firmware_path);
    push_log(&state, format!("开始刷写固件: {}", firmware_id));

    // 重置取消标志
    state.cancel_flash_flag.store(false, std::sync::atomic::Ordering::SeqCst);

    let session_opt = state.rpc_session.lock().clone();
    let cancel_flag = state.cancel_flash_flag.clone();

    // M6: 使用 spawn_blocking 将阻塞的刷写操作移出 tokio 运行时线程，避免阻塞异步任务
    let result = tokio::task::spawn_blocking(move || {
        // H4/M6: 传递 cancel_flag 给 flasher 内部，同时克隆一份给进度回调
        let cancel_for_cb = cancel_flag.clone();
        firmware::flasher::flash_firmware(
            &firmware_id,
            firmware_path.as_deref(),
            session_opt.as_ref(),
            Some(cancel_flag.as_ref()),
            move |progress| {
                // 检查取消标志
                if cancel_for_cb.load(std::sync::atomic::Ordering::SeqCst) {
                    return;
                }
                // 推送刷写进度事件（前端订阅 flash-progress）
                let _ = app.emit("flash-progress", &progress);
            },
        )
    })
    .await
    .map_err(|e| format!("刷写任务异常: {e}"))?;

    match result {
        Ok(r) => {
            if state.cancel_flash_flag.load(std::sync::atomic::Ordering::SeqCst) {
                push_log(&state, "固件刷写已取消".to_string());
                return Ok(IpcResult::err("固件刷写已取消"));
            }
            push_log(&state, format!("固件刷写完成: {:?}", r));
            Ok(IpcResult::ok(r))
        }
        Err(e) => {
            push_log(&state, format!("固件刷写失败: {e}"));
            Ok(IpcResult::err(format!("固件刷写失败: {e}")))
        }
    }
}

/// 列出可用的固件列表（Momentum / Unleashed / OFW / RogueMaster）
#[tauri::command]
async fn list_firmwares(
    _state: State<'_, AppState>,
) -> Result<IpcResult<Vec<firmware::FirmwareInfo>>, String> {
    log::info!("IPC: list_firmwares");
    let result = tokio::task::spawn_blocking(|| {
        firmware::flasher::list_firmwares()
    })
    .await
    .map_err(|e| format!("获取固件列表失败: {e}"))?;
    Ok(IpcResult::ok(result))
}

/// 进入 DFU 模式（通过 RPC 发送重启到 DFU 的命令）
#[tauri::command]
async fn enter_dfu_mode(state: State<'_, AppState>) -> Result<IpcVoid, String> {
    log::info!("IPC: enter_dfu_mode");
    push_log(&state, "尝试进入 DFU 模式...");
    let session_opt = state.rpc_session.lock().clone();
    match session_opt {
        Some(session) => match rpc::protocol::enter_dfu(&session) {
            Ok(_) => {
                push_log(&state, "已发送 DFU 模式指令");
                // 更新设备状态为 DFU 模式
                state.device.lock().connection_state =
                    device::DeviceConnectionState::DfuMode;
                // 断开 RPC 会话（DFU 模式下串口不可用）
                *state.rpc_session.lock() = None;
                Ok(ok_void())
            }
            Err(e) => Ok(IpcResult::err(format!("进入 DFU 模式失败: {e}"))),
        },
        None => Ok(IpcResult::err("设备未连接，无法进入 DFU 模式")),
    }
}

// -------------------- 资源导入命令 --------------------

/// 列出可导入的资源包列表
#[tauri::command]
async fn list_resource_packages(
    _state: State<'_, AppState>,
) -> Result<IpcResult<Vec<import::ResourcePackage>>, String> {
    log::info!("IPC: list_resource_packages");
    Ok(IpcResult::ok(import::pipeline::list_resource_packages()))
}

/// 导入资源包到设备（完整管线：预检→备份→打包→传输→解压→校验→刷新）
/// 通过 import-progress 事件实时推送进度
#[tauri::command]
async fn import_resources(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    package_ids: Vec<String>,
) -> Result<IpcResult<import::ImportSummary>, String> {
    log::info!("IPC: import_resources ids={:?}", package_ids);
    push_log(&state, format!("开始导入 {} 个资源包", package_ids.len()));

    // H4: 重置取消标志
    state
        .cancel_import_flag
        .store(false, std::sync::atomic::Ordering::SeqCst);

    // 虚拟设备模式：模拟导入流程，将文件写入虚拟文件系统
    if device::virtual_flipper::is_virtual() {
        return run_virtual_import(&state, &app, &package_ids);
    }

    let session_opt = state.rpc_session.lock().clone();

    // 克隆 Arc 以便在闭包中使用
    let progress_arc = state.import_progress.clone();
    let log_arc = state.log_buffer.clone();
    // H4: 克隆取消标志以便在进度回调中检查，并传递给 pipeline
    let cancel_flag = state.cancel_import_flag.clone();
    let cancel_for_cb = cancel_flag.clone();

    match import::pipeline::run_import_pipeline(
        &package_ids,
        session_opt.as_ref(),
        Some(cancel_flag.as_ref()),
        move |progress| {
            // H4: 如果用户已请求取消，则跳过进度更新
            if cancel_for_cb.load(std::sync::atomic::Ordering::SeqCst) {
                return;
            }
            // 更新全局进度状态
            *progress_arc.lock() = progress.clone();
            // 追加日志
            if !progress.log_lines.is_empty() {
                // L1: 使用 cloned().unwrap_or_default() 避免 unwrap panic
                let last = progress.log_lines.last().cloned().unwrap_or_default();
                let mut buf = log_arc.lock();
                if buf.len() >= 5000 {
                    buf.remove(0);
                }
                buf.push(last);
            }
            // 推送事件给前端
            let _ = app.emit("import-progress", &progress);
        },
    ) {
        Ok(summary) => {
            push_log(&state, format!("资源导入完成: {:?}", summary));
            Ok(IpcResult::ok(summary))
        }
        Err(e) => {
            let msg = format!("资源导入失败: {e}");
            push_log(&state, &msg);
            // 更新进度为错误状态
            {
                let mut p = state.import_progress.lock();
                p.phase = import::ImportPhase::Error;
                p.error_message = Some(msg.clone());
            }
            Ok(IpcResult::err(msg))
        }
    }
}

/// 虚拟设备导入流程（模拟导入，将文件写入虚拟文件系统）
fn run_virtual_import(
    state: &AppState,
    app: &tauri::AppHandle,
    package_ids: &[String],
) -> Result<IpcResult<import::ImportSummary>, String> {
    let packages = import::pipeline::list_resource_packages();
    let mut imported: u32 = 0;
    let mut total_files: u32 = 0;
    let mut total_bytes: u64 = 0;
    let start = std::time::Instant::now();

    let total = package_ids.len() as u32;

    // 推送开始进度
    let mut progress = import::ImportProgress::idle();
    progress.files_total = 0;
    progress.log(format!("开始导入 {} 个资源包（虚拟设备）", total));
    progress_cb(app, state, &progress);

    for (idx, pkg_id) in package_ids.iter().enumerate() {
        // H4: 检查取消标志，用户请求取消时立即终止导入
        if state
            .cancel_import_flag
            .load(std::sync::atomic::Ordering::SeqCst)
        {
            progress.phase = import::ImportPhase::Error;
            progress.log("导入已取消".to_string());
            progress_cb(app, state, &progress);
            return Ok(IpcResult::err("导入已取消"));
        }

        let pkg = match packages.iter().find(|p| &p.id == pkg_id) {
            Some(p) => p.clone(),
            None => {
                progress.log(format!("资源包 {} 未找到，跳过", pkg_id));
                progress_cb(app, state, &progress);
                continue;
            }
        };

        progress.phase = import::ImportPhase::Transferring;
        progress.current_file = pkg.name.clone();
        progress.log(format!("[{}/{}] 导入: {}", idx + 1, total, pkg.name));
        progress_cb(app, state, &progress);

        // 读取本地资源目录并逐文件写入虚拟文件系统
        if let Some(local_path) = &pkg.local_path {
            let local_dir = std::path::Path::new(local_path);
            if local_dir.exists() {
                let mut file_count: u32 = 0;
                let mut byte_count: u64 = 0;

                // 遍历目录
                if let Ok(entries) = std::fs::read_dir(local_dir) {
                    for entry in entries.flatten() {
                        // H4: 文件遍历循环中检查取消标志
                        if state
                            .cancel_import_flag
                            .load(std::sync::atomic::Ordering::SeqCst)
                        {
                            progress.phase = import::ImportPhase::Error;
                            progress.log("导入已取消".to_string());
                            progress_cb(app, state, &progress);
                            return Ok(IpcResult::err("导入已取消"));
                        }
                        let path = entry.path();
                        if !path.is_file() {
                            continue;
                        }
                        // L1: 使用 and_then + unwrap_or 避免 unwrap panic
                        let filename = path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("unknown")
                            .to_string();
                        let target_path = format!("{}/{}", pkg.target_path, filename);

                        // 读取文件内容
                        match std::fs::read(&path) {
                            Ok(data) => {
                                let size = data.len();
                                log::info!(
                                    "虚拟导入: {} -> {} ({} 字节)",
                                    path.display(),
                                    target_path,
                                    size
                                );
                                device::virtual_flipper::virtual_storage_write(&target_path, &data);
                                file_count += 1;
                                byte_count += size as u64;
                                progress.files_completed += 1;
                                progress.bytes_transferred += size as u64;
                                progress.log(format!("  写入: {} ({} 字节)", filename, size));
                                progress_cb(app, state, &progress);
                            }
                            Err(e) => {
                                progress.log(format!("  读取失败: {} - {}", filename, e));
                            }
                        }
                    }
                }

                imported += 1;
                total_files += file_count;
                total_bytes += byte_count;
                progress.log(format!("资源包 {} 导入完成: {} 个文件, {} 字节", pkg.name, file_count, byte_count));
            } else {
                progress.log(format!("资源包 {} 本地目录不存在: {}", pkg.name, local_path));
            }
        }

        // 校验：列出虚拟设备上的文件
        progress.phase = import::ImportPhase::Verifying;
        progress.log(format!("校验: 列出设备端 {} ...", pkg.target_path));
        progress_cb(app, state, &progress);
        let remote_files = device::virtual_flipper::virtual_storage_list(&pkg.target_path);
        progress.log(format!("校验通过: 设备端 {} 下有 {} 个文件", pkg.target_path, remote_files.len()));
        progress_cb(app, state, &progress);
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    progress.phase = import::ImportPhase::Done;
    progress.log(format!(
        "导入完成: 成功 {} 失败 0 耗时 {}ms",
        imported, duration_ms
    ));
    progress_cb(app, state, &progress);

    Ok(IpcResult::ok(import::ImportSummary {
        success: true,
        packages_imported: imported,
        packages_failed: 0,
        files_transferred: total_files,
        bytes_transferred: total_bytes,
        duration_ms,
        failed_packages: vec![],
        message: format!("成功导入 {} 个资源包（虚拟设备）", imported),
    }))
}

/// 推送导入进度到前端
fn progress_cb(app: &tauri::AppHandle, state: &AppState, progress: &import::ImportProgress) {
    *state.import_progress.lock() = progress.clone();
    if !progress.log_lines.is_empty() {
        // L1: 使用 cloned().unwrap_or_default() 避免 unwrap panic
        let last = progress.log_lines.last().cloned().unwrap_or_default();
        let mut buf = state.log_buffer.lock();
        if buf.len() >= 5000 {
            buf.remove(0);
        }
        buf.push(last);
    }
    let _ = app.emit("import-progress", progress);
}

/// 获取当前导入进度（前端轮询兜底，正常通过事件接收）
#[tauri::command]
async fn get_import_progress(
    state: State<'_, AppState>,
) -> Result<IpcResult<import::ImportProgress>, String> {
    let progress = state.import_progress.lock().clone();
    Ok(IpcResult::ok(progress))
}

// -------------------- AI 相关命令 --------------------

/// AI 文字对话
#[tauri::command]
async fn ai_chat(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    messages: Vec<ai::ChatMessage>,
    course_id: Option<String>,
) -> Result<IpcResult<ai::ChatResponse>, String> {
    log::info!("IPC: ai_chat messages={} course={:?}", messages.len(), course_id);
    let config = state.ai_config.lock().clone();
    match ai::router::chat(&config, &messages, course_id.as_deref()).await {
        Ok(resp) => {
            push_log(&state, format!("AI 回复完成，tokens={}", resp.tokens_used));
            Ok(IpcResult::ok(resp))
        }
        Err(e) => {
            let msg = format!("AI 调用失败: {e}");
            push_log(&state, &msg);
            // 断网降级：尝试本地 FAQ
            log::warn!("AI 主链路失败，尝试本地 FAQ 降级: {e}");
            match ai::router::local_faq_fallback(&messages) {
                Ok(fallback) => {
                    push_log(&state, "已降级到本地 FAQ");
                    Ok(IpcResult::ok(fallback))
                }
                Err(_) => {
                    let _ = app.emit("ai-fallback", &serde_json::json!({"reason": msg}));
                    Ok(IpcResult::err(msg))
                }
            }
        }
    }
}

/// AI 多模态对话（带图片）
#[tauri::command]
async fn ai_chat_with_image(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    messages: Vec<ai::ChatMessage>,
    image_base64: String,
) -> Result<IpcResult<ai::ChatResponse>, String> {
    log::info!("IPC: ai_chat_with_image messages={}", messages.len());
    let config = state.ai_config.lock().clone();
    // 先对图片相关内容做脱敏检查
    let sanitized = ai::sanitizer::sanitize_messages(&messages);
    // M4: 多模态图片未脱敏警告，提示用户图片以原始内容发送给模型
    log::warn!(
        "多模态对话：图片将以原始内容发送给 {}，请确保不含敏感信息",
        config.provider.as_str()
    );
    match ai::router::chat_with_image(&config, &sanitized, &image_base64).await {
        Ok(resp) => {
            push_log(&state, "AI 多模态回复完成");
            Ok(IpcResult::ok(resp))
        }
        Err(e) => {
            let msg = format!("AI 多模态调用失败: {e}");
            push_log(&state, &msg);
            let _ = app.emit("ai-fallback", &serde_json::json!({"reason": msg}));
            Ok(IpcResult::err(msg))
        }
    }
}

/// 设置 AI 模型配置（同时持久化到磁盘）
#[tauri::command]
async fn ai_set_model_config(
    state: State<'_, AppState>,
    config: ai::AiModelConfig,
) -> Result<IpcVoid, String> {
    log::info!(
        "IPC: ai_set_model_config provider={} model={}",
        config.provider.as_str(),
        config.model_name
    );
    push_log(
        &state,
        format!("AI 模型配置已更新: {} / {}", config.provider.as_str(), config.model_name),
    );
    *state.ai_config.lock() = config.clone();
    save_ai_config(&config);
    Ok(ok_void())
}

/// 获取当前 AI 模型配置（前端设置面板打开时调用）
#[tauri::command]
async fn ai_get_model_config(
    state: State<'_, AppState>,
) -> Result<IpcResult<ai::AiModelConfig>, String> {
    log::info!("IPC: ai_get_model_config");
    let config = state.ai_config.lock().clone();
    Ok(IpcResult::ok(config))
}

/// 获取 AI 课程列表
#[tauri::command]
async fn ai_get_courses(
    _state: State<'_, AppState>,
) -> Result<IpcResult<Vec<ai::Course>>, String> {
    log::info!("IPC: ai_get_courses");
    Ok(IpcResult::ok(ai::router::get_courses()))
}

// -------------------- 屏幕镜像命令 --------------------

/// 启动屏幕镜像流（通过 RPC StartScreenStream 获取 128x64 单色帧）
/// 持续通过 screen-mirror-frame 事件推送帧数据
#[tauri::command]
async fn start_screen_mirror(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<IpcVoid, String> {
    log::info!("IPC: start_screen_mirror");

    // M8: 检查是否已在运行，避免重复启动
    if *state.screen_mirror_running.lock() {
        log::warn!("屏幕镜像已在运行，跳过重复启动");
        return Ok(ok_void());
    }

    // 虚拟设备模式：生成虚拟屏幕帧
    if device::virtual_flipper::is_virtual() {
        *state.screen_mirror_running.lock() = true;
        let running = state.screen_mirror_running.clone();
        tokio::spawn(async move {
            while *running.lock() {
                let frame_data = device::virtual_flipper::virtual_screen_frame();
                let _ = app.emit(
                    "screen-mirror-frame",
                    &serde_json::json!({
                        "data": frame_data,
                        "orientation": 0,
                    }),
                );
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
            log::info!("虚拟屏幕镜像流已停止");
        });
        return Ok(ok_void());
    }

    let session_opt = state.rpc_session.lock().clone();
    let session = match session_opt {
        Some(s) => s,
        None => return Ok(IpcResult::err("设备未连接，无法启动屏幕镜像")),
    };

    // 标记镜像运行中
    *state.screen_mirror_running.lock() = true;
    let running = state.screen_mirror_running.clone();

    // 在独立的 tokio 任务中持续拉取屏幕帧
    tokio::spawn(async move {
        let mut stream = match rpc::stream::start_screen_stream(&session) {
            Ok(s) => s,
            Err(e) => {
                log::error!("启动屏幕流失败: {e}");
                let _ = app.emit(
                    "screen-mirror-error",
                    &serde_json::json!({ "error": e.to_string() }),
                );
                *running.lock() = false;
                return;
            }
        };

        while *running.lock() {
            match stream.next_frame() {
                Ok(Some(frame)) => {
                    let _ = app.emit("screen-mirror-frame", &frame);
                }
                Ok(None) => {
                    // 无帧可读，短暂休眠
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }
                Err(e) => {
                    log::warn!("读取屏幕帧失败: {e}");
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                }
            }
        }
        // 停止流
        let _ = stream.stop();
        log::info!("屏幕镜像流已停止");
    });

    Ok(ok_void())
}

/// 停止屏幕镜像流
#[tauri::command]
async fn stop_screen_mirror(state: State<'_, AppState>) -> Result<IpcVoid, String> {
    log::info!("IPC: stop_screen_mirror");
    *state.screen_mirror_running.lock() = false;
    Ok(ok_void())
}

/// 发送虚拟按键到设备（模拟 FlipperZero 按键操作）
#[tauri::command]
async fn send_virtual_key(
    state: State<'_, AppState>,
    key: String,
) -> Result<IpcVoid, String> {
    log::info!("IPC: send_virtual_key key={}", key);

    // 虚拟设备模式
    if device::virtual_flipper::is_virtual() {
        device::virtual_flipper::virtual_send_key(&key);
        return Ok(ok_void());
    }

    let session_opt = state.rpc_session.lock().clone();
    match session_opt {
        Some(session) => match rpc::stream::send_virtual_key(&session, &key) {
            Ok(_) => Ok(ok_void()),
            Err(e) => Ok(IpcResult::err(format!("发送按键失败: {e}"))),
        },
        None => Ok(IpcResult::err("设备未连接")),
    }
}

// -------------------- GPIO 命令 --------------------

/// GPIO 引脚状态（与前端 types/index.ts 中的 GpioPinState 对应）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpioPinState {
    /// 引脚名称，如 "PC0" / "PC1" / "PC3" / "PB2" / "PB3" / "PA4" / "PA6" / "PA7"
    pub pin: String,
    /// 模式："output" | "input"
    pub mode: String,
    /// 上下拉："no" | "up" | "down"（RPC 协议无 GetInputPull，默认 "no"）
    pub pull: String,
    /// 电平值：0 或 1（OUTPUT 为写入值，INPUT 为读取值）
    pub value: u32,
}

/// 获取所有 GPIO 引脚状态（遍历 8 个引脚，逐个查询模式与电平）
///
/// 虚拟设备模式返回模拟状态；真实设备模式通过 RPC 逐个查询 GetPinMode / ReadPin
#[tauri::command]
async fn gpio_get_all_pins(
    state: State<'_, AppState>,
) -> Result<IpcResult<Vec<GpioPinState>>, String> {
    log::info!("IPC: gpio_get_all_pins");

    // 虚拟设备模式：返回虚拟 GPIO 状态
    if device::virtual_flipper::is_virtual() {
        let pins = device::virtual_flipper::virtual_gpio_get_all();
        let result: Vec<GpioPinState> = pins
            .into_iter()
            .map(|(name, mode, pull, value)| GpioPinState {
                pin: name,
                mode,
                pull,
                value,
            })
            .collect();
        return Ok(IpcResult::ok(result));
    }

    // 真实设备：逐个查询 8 个引脚的模式与电平
    let session_opt = state.rpc_session.lock().clone();
    let session = match session_opt {
        Some(s) => s,
        None => return Ok(IpcResult::err("设备未连接，GPIO 功能需要设备连接")),
    };

    let mut pins = Vec::with_capacity(8);
    for &name in rpc::protocol::GPIO_PIN_NAMES {
        // 查询模式（失败时回退为 input）
        let mode = rpc::protocol::gpio_get_pin_mode(&session, name).unwrap_or_else(|e| {
            log::warn!("查询引脚 {} 模式失败: {}，默认 input", name, e);
            "input".to_string()
        });
        // 读取电平（失败时回退为 0）
        let value = rpc::protocol::gpio_read_pin(&session, name).unwrap_or_else(|e| {
            log::warn!("读取引脚 {} 电平失败: {}，默认 0", name, e);
            0
        });
        pins.push(GpioPinState {
            pin: name.to_string(),
            mode,
            // RPC 协议无 GetInputPull 命令，统一默认 "no"
            pull: "no".to_string(),
            value,
        });
    }
    push_log(
        &state,
        format!("GPIO: 已获取 {} 个引脚状态", pins.len()),
    );
    Ok(IpcResult::ok(pins))
}

/// 设置 GPIO 引脚模式（OUTPUT / INPUT）
///
/// 虚拟设备模式直接修改虚拟状态；真实设备模式通过 RPC GpioSetPinMode
#[tauri::command]
async fn gpio_set_pin_mode(
    pin: String,
    mode: String,
    state: State<'_, AppState>,
) -> Result<IpcVoid, String> {
    log::info!("IPC: gpio_set_pin_mode pin={} mode={}", pin, mode);

    // 虚拟设备模式
    if device::virtual_flipper::is_virtual() {
        if device::virtual_flipper::virtual_gpio_set_mode(&pin, &mode) {
            return Ok(ok_void());
        }
        return Ok(IpcResult::err(format!("未知 GPIO 引脚或模式: {} {}", pin, mode)));
    }

    let session_opt = state.rpc_session.lock().clone();
    match session_opt {
        Some(session) => match rpc::protocol::gpio_set_pin_mode(&session, &pin, &mode) {
            Ok(_) => {
                push_log(&state, format!("GPIO: 设置 {} 模式为 {}", pin, mode));
                Ok(ok_void())
            }
            Err(e) => Ok(IpcResult::err(format!("设置 GPIO 模式失败: {e}"))),
        },
        None => Ok(IpcResult::err("设备未连接，GPIO 功能需要设备连接")),
    }
}

/// 写 GPIO 引脚电平值（仅 OUTPUT 模式有效）
#[tauri::command]
async fn gpio_write_pin(
    pin: String,
    value: u32,
    state: State<'_, AppState>,
) -> Result<IpcVoid, String> {
    log::info!("IPC: gpio_write_pin pin={} value={}", pin, value);

    // 虚拟设备模式
    if device::virtual_flipper::is_virtual() {
        if device::virtual_flipper::virtual_gpio_write_pin(&pin, value) {
            return Ok(ok_void());
        }
        return Ok(IpcResult::err(format!("未知 GPIO 引脚: {}", pin)));
    }

    let session_opt = state.rpc_session.lock().clone();
    match session_opt {
        Some(session) => match rpc::protocol::gpio_write_pin(&session, &pin, value) {
            Ok(_) => {
                push_log(&state, format!("GPIO: 写 {} = {}", pin, value));
                Ok(ok_void())
            }
            Err(e) => Ok(IpcResult::err(format!("写 GPIO 失败: {e}"))),
        },
        None => Ok(IpcResult::err("设备未连接，GPIO 功能需要设备连接")),
    }
}

/// 读 GPIO 引脚电平值
#[tauri::command]
async fn gpio_read_pin(
    pin: String,
    state: State<'_, AppState>,
) -> Result<IpcResult<u32>, String> {
    log::info!("IPC: gpio_read_pin pin={}", pin);

    // 虚拟设备模式
    if device::virtual_flipper::is_virtual() {
        return match device::virtual_flipper::virtual_gpio_read_pin(&pin) {
            Some(v) => Ok(IpcResult::ok(v)),
            None => Ok(IpcResult::err(format!("未知 GPIO 引脚: {}", pin))),
        };
    }

    let session_opt = state.rpc_session.lock().clone();
    match session_opt {
        Some(session) => match rpc::protocol::gpio_read_pin(&session, &pin) {
            Ok(v) => Ok(IpcResult::ok(v)),
            Err(e) => Ok(IpcResult::err(format!("读 GPIO 失败: {e}"))),
        },
        None => Ok(IpcResult::err("设备未连接，GPIO 功能需要设备连接")),
    }
}

/// 获取 OTG 模式（返回 "on" | "off"）
#[tauri::command]
async fn gpio_get_otg_mode(state: State<'_, AppState>) -> Result<IpcResult<String>, String> {
    log::info!("IPC: gpio_get_otg_mode");

    // 虚拟设备模式
    if device::virtual_flipper::is_virtual() {
        return Ok(IpcResult::ok(device::virtual_flipper::virtual_gpio_get_otg_mode()));
    }

    let session_opt = state.rpc_session.lock().clone();
    match session_opt {
        Some(session) => match rpc::protocol::gpio_get_otg_mode(&session) {
            Ok(m) => Ok(IpcResult::ok(m)),
            Err(e) => Ok(IpcResult::err(format!("获取 OTG 模式失败: {e}"))),
        },
        None => Ok(IpcResult::err("设备未连接，GPIO 功能需要设备连接")),
    }
}

/// 设置 OTG 模式（"on" | "off"）
#[tauri::command]
async fn gpio_set_otg_mode(
    mode: String,
    state: State<'_, AppState>,
) -> Result<IpcVoid, String> {
    log::info!("IPC: gpio_set_otg_mode mode={}", mode);

    // 虚拟设备模式
    if device::virtual_flipper::is_virtual() {
        device::virtual_flipper::virtual_gpio_set_otg_mode(&mode);
        return Ok(ok_void());
    }

    let session_opt = state.rpc_session.lock().clone();
    match session_opt {
        Some(session) => match rpc::protocol::gpio_set_otg_mode(&session, &mode) {
            Ok(_) => {
                push_log(&state, format!("GPIO: OTG 模式设为 {}", mode));
                Ok(ok_void())
            }
            Err(e) => Ok(IpcResult::err(format!("设置 OTG 模式失败: {e}"))),
        },
        None => Ok(IpcResult::err("设备未连接，GPIO 功能需要设备连接")),
    }
}

// -------------------- 取消操作命令 --------------------

/// 取消固件刷写
#[tauri::command]
async fn cancel_flash(state: State<'_, AppState>) -> Result<IpcVoid, String> {
    log::info!("IPC: cancel_flash");
    state.cancel_flash_flag.store(true, std::sync::atomic::Ordering::SeqCst);
    push_log(&state, "已请求取消固件刷写");
    Ok(ok_void())
}

/// 取消资源导入
#[tauri::command]
async fn cancel_import(state: State<'_, AppState>) -> Result<IpcVoid, String> {
    log::info!("IPC: cancel_import");
    state.cancel_import_flag.store(true, std::sync::atomic::Ordering::SeqCst);
    push_log(&state, "已请求取消资源导入");
    Ok(ok_void())
}

/// 取消 AI 流式对话
#[tauri::command]
async fn cancel_ai_chat(state: State<'_, AppState>) -> Result<IpcVoid, String> {
    log::info!("IPC: cancel_ai_chat");
    state.cancel_ai_chat_flag.store(true, std::sync::atomic::Ordering::SeqCst);
    push_log(&state, "已请求取消 AI 对话");
    Ok(ok_void())
}

// -------------------- 诊断修复命令 --------------------

/// 应用诊断修复（根据诊断结果的 fixAction 字段执行对应修复操作）
#[tauri::command]
async fn apply_diagnostic_fix(
    state: State<'_, AppState>,
    action: String,
) -> Result<IpcResult<String>, String> {
    log::info!("IPC: apply_diagnostic_fix action={}", action);
    push_log(&state, format!("开始执行修复操作: {}", action));

    let session_opt = state.rpc_session.lock().clone();

    let result = match action.as_str() {
        "update-firmware" => {
            // 修复：通过 RPC 触发固件更新（需要先传输固件包到 /update/）
            match &session_opt {
                Some(session) => {
                    match rpc::protocol::system_reboot(session, rpc::protocol::RebootMode::Update) {
                        Ok(_) => "已触发固件更新重启".to_string(),
                        Err(e) => return Ok(IpcResult::err(format!("固件更新失败: {e}"))),
                    }
                }
                None => return Ok(IpcResult::err("设备未连接，无法执行固件更新")),
            }
        }
        "calibrate-subghz" => {
            // 修复：提示用户手动校准 Sub-GHz
            "Sub-GHz 校准需要手动操作：进入 Sub-GHz → Frequency Analyzer → 对准已知信号源校准".to_string()
        }
        "format-sd-card" => {
            // SD 卡格式化通过 RPC 不支持，返回设备端操作引导
            "SD 卡格式化请在设备端操作：设置 → 存储 → 格式化 SD 卡，或取出 SD 卡在电脑上格式化为 FAT32（32KB 簇）".to_string()
        }
        "reboot-device" => {
            match &session_opt {
                Some(session) => {
                    match rpc::protocol::system_reboot(session, rpc::protocol::RebootMode::Os) {
                        Ok(_) => "设备重启指令已发送".to_string(),
                        Err(e) => return Ok(IpcResult::err(format!("设备重启失败: {e}"))),
                    }
                }
                None => return Ok(IpcResult::err("设备未连接，无法重启")),
            }
        }
        _ => {
            return Ok(IpcResult::err(format!("未知的修复操作: {}", action)));
        }
    };

    push_log(&state, format!("修复完成: {}", result));
    Ok(IpcResult::ok(result))
}

// -------------------- AI 流式对话命令 --------------------

/// AI 流式文字对话
/// 通过 ai-chat-stream 事件逐 token 推送响应，支持前端取消
#[tauri::command]
async fn ai_chat_stream(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    messages: Vec<ai::ChatMessage>,
    course_id: Option<String>,
) -> Result<IpcResult<String>, String> {
    log::info!("IPC: ai_chat_stream messages={} course={:?}", messages.len(), course_id);

    // 生成消息 ID
    let message_id = format!("msg-{}", chrono::Local::now().timestamp_millis());

    // 重置取消标志
    state.cancel_ai_chat_flag.store(false, std::sync::atomic::Ordering::SeqCst);

    let config = state.ai_config.lock().clone();
    let cancel_flag = state.cancel_ai_chat_flag.clone();
    let msg_id = message_id.clone();
    let msg_id_for_closure = message_id.clone();
    let app_handle = app.clone();

    // 在独立 tokio 任务中执行流式调用
    tokio::spawn(async move {
        let result = ai::router::chat_stream(
            &config,
            &messages,
            course_id.as_deref(),
            &msg_id,
            &cancel_flag,
            move |delta, done, tokens| {
                let chunk = serde_json::json!({
                    "messageId": msg_id_for_closure,
                    "delta": delta,
                    "done": done,
                    "tokensUsed": tokens,
                });
                let _ = app_handle.emit("ai-chat-stream", &chunk);
            },
        ).await;

        if let Err(e) = result {
            log::error!("AI 流式调用失败: {e}");
            let _ = app.emit("ai-chat-stream", &serde_json::json!({
                "messageId": msg_id,
                "delta": "",
                "done": true,
                "error": e.to_string(),
            }));
        }
    });

    push_log(&state, format!("AI 流式对话已启动: {}", message_id));
    Ok(IpcResult::ok(message_id))
}

// -------------------- 日志导出命令 --------------------

/// 导出应用日志到指定文件路径
#[tauri::command]
async fn save_log_dump(
    state: State<'_, AppState>,
    file_path: String,
) -> Result<IpcResult<usize>, String> {
    log::info!("IPC: save_log_dump path={}", file_path);

    // M2: 校验文件路径安全，防止任意文件写入
    let path = std::path::Path::new(&file_path);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext != "txt" && ext != "log" {
        return Ok(IpcResult::err("仅支持导出 .txt 或 .log 文件"));
    }
    if file_path.contains("..") {
        return Ok(IpcResult::err("路径不允许包含 .. "));
    }

    let logs = state.log_buffer.lock().clone();
    let content = logs.join("\n");
    match std::fs::write(&file_path, &content) {
        Ok(_) => {
            push_log(&state, format!("日志已导出到: {}", file_path));
            Ok(IpcResult::ok(logs.len()))
        }
        Err(e) => Ok(IpcResult::err(format!("日志导出失败: {e}"))),
    }
}

// -------------------- 成就相关命令 --------------------

/// 获取全部成就列表（含解锁状态和进度）
/// 成就定义是硬编码的，解锁状态从 achievements.json 读取
#[tauri::command]
async fn get_achievements(
    state: State<'_, AppState>,
) -> Result<IpcResult<Vec<Achievement>>, String> {
    log::info!("IPC: get_achievements");
    let data = state.achievements.lock();
    let list = all_achievements()
        .into_iter()
        .map(|(id, name, desc, icon, target)| {
            let unlocked_at = data.unlocked.get(id).copied();
            let progress = data.progress.get(id).copied().unwrap_or(0);
            Achievement {
                id: id.to_string(),
                name: name.to_string(),
                description: desc.to_string(),
                icon: icon.to_string(),
                unlocked: unlocked_at.is_some(),
                unlocked_at,
                progress,
                target,
            }
        })
        .collect();
    Ok(IpcResult::ok(list))
}

/// 解锁指定成就（写入 achievements.json）
/// 返回 true 表示新解锁，false 表示已解锁
#[tauri::command]
async fn unlock_achievement(
    id: String,
    state: State<'_, AppState>,
) -> Result<IpcResult<bool>, String> {
    log::info!("IPC: unlock_achievement id={}", id);
    let mut data = state.achievements.lock();
    if data.unlocked.contains_key(&id) {
        // 已解锁，直接返回 false
        return Ok(IpcResult::ok(false));
    }
    data.unlocked.insert(id, now_unix_secs());
    save_achievement_data(&data);
    Ok(IpcResult::ok(true))
}

/// 更新成就进度，达到 target 时自动解锁
/// 返回是否刚刚解锁
#[tauri::command]
async fn update_achievement_progress(
    id: String,
    progress: u32,
    state: State<'_, AppState>,
) -> Result<IpcResult<bool>, String> {
    log::info!(
        "IPC: update_achievement_progress id={} progress={}",
        id,
        progress
    );
    let mut data = state.achievements.lock();
    // 已解锁的成就不再更新进度
    if data.unlocked.contains_key(&id) {
        return Ok(IpcResult::ok(false));
    }
    // 更新进度
    data.progress.insert(id.clone(), progress);
    // 查找该成就的 target，达到则自动解锁
    let target = all_achievements()
        .into_iter()
        .find(|(aid, _, _, _, _)| *aid == id)
        .map(|(_, _, _, _, t)| t);
    let just_unlocked = match target {
        Some(t) if t > 0 && progress >= t => {
            data.unlocked.insert(id, now_unix_secs());
            true
        }
        _ => false,
    };
    save_achievement_data(&data);
    Ok(IpcResult::ok(just_unlocked))
}

// =============================================================================
// 应用启动入口
// =============================================================================

/// Tauri 应用启动入口，由 main.rs 调用
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_secs()
        .init();

    log::info!("Dolphin Gang Tour 后端启动中...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|_app| {
            log::info!("Tauri 应用初始化完成");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 设备管理
            device_scan,
            device_connect,
            device_disconnect,
            get_device_info,
            // 驱动 / 端口 / SD 卡
            install_driver,
            kill_port_occupier,
            format_sd_card,
            // 诊断
            diagnose,
            apply_diagnostic_fix,
            // 固件
            flash_firmware,
            cancel_flash,
            list_firmwares,
            enter_dfu_mode,
            // 资源导入
            list_resource_packages,
            import_resources,
            cancel_import,
            get_import_progress,
            // AI
            ai_chat,
            ai_chat_stream,
            ai_chat_with_image,
            ai_set_model_config,
            ai_get_model_config,
            ai_get_courses,
            cancel_ai_chat,
            // 屏幕镜像
            start_screen_mirror,
            stop_screen_mirror,
            send_virtual_key,
            // GPIO
            gpio_get_all_pins,
            gpio_set_pin_mode,
            gpio_write_pin,
            gpio_read_pin,
            gpio_get_otg_mode,
            gpio_set_otg_mode,
            // 日志
            save_log_dump,
            // 成就
            get_achievements,
            unlock_achievement,
            update_achievement_progress,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}
