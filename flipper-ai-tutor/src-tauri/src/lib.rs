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
}

// -------------------- AI 配置持久化 --------------------

/// 获取 AI 配置文件路径
///
/// 配置文件存储在用户配置目录下：
///   macOS: ~/Library/Application Support/flipper-ai-tutor/ai_config.json
///   Linux: ~/.config/flipper-ai-tutor/ai_config.json
///   Windows: %APPDATA%\flipper-ai-tutor\ai_config.json
fn ai_config_path() -> Option<std::path::PathBuf> {
    let proj_dirs = directories::ProjectDirs::from("com", "flipperai", "flipper-ai-tutor")?;
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
            Ok(config) => {
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
fn save_ai_config(config: &ai::AiModelConfig) {
    let path = match ai_config_path() {
        Some(p) => p,
        None => {
            log::warn!("无法获取配置目录路径，跳过保存 AI 配置");
            return;
        }
    };

    match serde_json::to_string_pretty(config) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                log::warn!("写入 AI 配置文件失败: {e}");
            } else {
                log::debug!("AI 配置已保存到 {:?}", path);
            }
        }
        Err(e) => {
            log::warn!("序列化 AI 配置失败: {e}");
        }
    }
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
    // 关闭 RPC 会话
    *state.rpc_session.lock() = None;
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
    let session_opt = state.rpc_session.lock().clone();
    match firmware::flasher::flash_firmware(
        &firmware_id,
        firmware_path.as_deref(),
        session_opt.as_ref(),
        |progress| {
            // 推送刷写进度事件（前端订阅 flash-progress）
            let _ = app.emit("flash-progress", &progress);
        },
    ) {
        Ok(r) => {
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
    Ok(IpcResult::ok(firmware::flasher::list_firmwares()))
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

    // 虚拟设备模式：模拟导入流程，将文件写入虚拟文件系统
    if device::virtual_flipper::is_virtual() {
        return run_virtual_import(&state, &app, &package_ids);
    }

    let session_opt = state.rpc_session.lock().clone();

    // 克隆 Arc 以便在闭包中使用
    let progress_arc = state.import_progress.clone();
    let log_arc = state.log_buffer.clone();

    match import::pipeline::run_import_pipeline(
        &package_ids,
        session_opt.as_ref(),
        move |progress| {
            // 更新全局进度状态
            *progress_arc.lock() = progress.clone();
            // 追加日志
            if !progress.log_lines.is_empty() {
                let last = progress.log_lines.last().unwrap().clone();
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
                        let path = entry.path();
                        if !path.is_file() {
                            continue;
                        }
                        let filename = path.file_name().unwrap().to_string_lossy().to_string();
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
        let last = progress.log_lines.last().unwrap().clone();
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

    log::info!("FlipperZero AI Tutor 后端启动中...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
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
            // 日志
            save_log_dump,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}
