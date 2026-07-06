// =============================================================================
// firmware/flasher.rs - 双轨固件刷写实现
// =============================================================================
// 职责：
//   1. 列出可用固件（list_firmwares）
//   2. 双轨刷写（flash_firmware）：
//      - 轨道 A（RPC 刷写）：设备正常模式，通过 RPC 传输固件包到 /update
//      - 轨道 B（DFU 刷写）：DFU 模式救砖，调用 dfu-util 刷写
//   3. Manifest API Level 校验（确保固件与设备硬件兼容）
//   4. 进度回调（通过 Tauri 事件推送 FlashProgress）
//
// 刷写流程（RPC 轨道）：
//   1. 下载固件包（如已本地存在则跳过）
//   2. 校验固件 Manifest 的 API Level
//   3. 通过 RPC storage_write 传输固件包到 /update/firmware.fuf
//   4. 设备端自动解压刷写并重启
//   5. 等待设备重启完成，验证新固件版本
//
// 刷写流程（DFU 轨道）：
//   1. 下载固件包并解压出 dfu 文件
//   2. 设备进入 DFU 模式（用户手动或 RPC 触发）
//   3. 调用 dfu-util -a 0 -s 0x08000000:leave -D firmware.dfu
//   4. 等待设备重启完成
// =============================================================================

use crate::firmware::{
    FlashPhase, FlashProgress, FlashResult, FirmwareId, FirmwareInfo, FirmwareManifest,
};
use crate::rpc::protocol::{self, RpcSession};
use anyhow::{anyhow, bail, Result};
use std::io::Read;
use std::path::Path;
use std::time::Instant;

// -------------------- 临时文件守卫与取消检查 --------------------

/// 临时文件守卫：Drop 时自动删除指定文件（用于清理解压出的临时 dfu 文件）
struct TempFileGuard {
    path: Option<String>,
}

impl TempFileGuard {
    fn new(path: Option<String>) -> Self {
        Self { path }
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if let Some(p) = &self.path {
            log::debug!("清理临时文件: {}", p);
            let _ = std::fs::remove_file(p);
        }
    }
}

/// 检查取消标志，如已取消则返回错误
fn check_cancelled(cancel_flag: Option<&std::sync::atomic::AtomicBool>) -> Result<()> {
    if let Some(flag) = cancel_flag {
        if flag.load(std::sync::atomic::Ordering::SeqCst) {
            bail!("刷写已取消");
        }
    }
    Ok(())
}

// -------------------- 固件列表 --------------------

/// 获取可用固件列表
///
/// 优先从 GitHub API 获取最新版本信息，失败则回退到内置静态列表。
pub fn list_firmwares() -> Vec<FirmwareInfo> {
    log::info!("获取固件列表");

    // 内置静态列表（作为 GitHub API 不可用时的回退）
    let static_list = get_static_firmware_list();

    // 尝试从 GitHub API 获取最新版本信息
    match fetch_latest_firmware_versions() {
        Ok(updates) => {
            // 用 GitHub API 返回的版本信息更新静态列表
            let mut result = static_list;
            for fw in &mut result {
                if let Some(update) = updates.get(&fw.id) {
                    fw.download_url = update.download_url.clone();
                    fw.size_bytes = update.size_bytes;
                }
            }
            log::info!("固件列表已从 GitHub API 更新");
            result
        }
        Err(e) => {
            log::warn!("GitHub API 获取固件版本失败，使用静态列表: {e}");
            static_list
        }
    }
}

/// 内置静态固件列表
fn get_static_firmware_list() -> Vec<FirmwareInfo> {
    vec![
        FirmwareInfo {
            id: "momentum".to_string(),
            name: "Momentum Firmware".to_string(),
            description: "功能最丰富的社区固件，推荐新手使用。包含 SubGHz 协议增强、BadUSB 脚本库、UI 主题等。".to_string(),
            recommended: true,
            api_level: 1,
            download_url: "https://github.com/Next-Flip/Momentum-Firmware/releases/latest".to_string(),
            size_bytes: 4 * 1024 * 1024,
            requires_dfu: false,
        },
        FirmwareInfo {
            id: "unleashed".to_string(),
            name: "Unleashed Firmware".to_string(),
            description: "经典社区固件，稳定可靠，提供丰富的 SubGHz 频段扩展。".to_string(),
            recommended: false,
            api_level: 1,
            download_url: "https://github.com/DarkFlippers/unleashed-firmware/releases/latest".to_string(),
            size_bytes: 4 * 1024 * 1024,
            requires_dfu: false,
        },
        FirmwareInfo {
            id: "ofw".to_string(),
            name: "Official Firmware (OFW)".to_string(),
            description: "Flipper Zero 官方固件，最稳定但功能较少。".to_string(),
            recommended: false,
            api_level: 1,
            download_url: "https://github.com/flipperdevices/flipperzero-firmware/releases/latest".to_string(),
            size_bytes: 4 * 1024 * 1024,
            requires_dfu: false,
        },
        FirmwareInfo {
            id: "roguemaster".to_string(),
            name: "RogueMaster Firmware".to_string(),
            description: "基于 OFW 的社区固件，包含额外游戏与工具。".to_string(),
            recommended: false,
            api_level: 1,
            download_url: "https://github.com/RogueMaster/flipperzero-firmware-wPlugins/releases/latest".to_string(),
            size_bytes: 4 * 1024 * 1024,
            requires_dfu: false,
        },
    ]
}

/// GitHub API 返回的最新固件版本信息
struct GithubFirmwareUpdate {
    download_url: String,
    size_bytes: u64,
}

/// 从 GitHub API 获取最新固件版本信息
///
/// GitHub API 速率限制：未认证 60 次/小时，认证 5000 次/小时。
/// 此函数只在 list_firmwares 被调用时请求一次，不会超出限制。
fn fetch_latest_firmware_versions() -> Result<std::collections::HashMap<String, GithubFirmwareUpdate>> {
    use std::collections::HashMap;

    let mut updates = HashMap::new();

    // 固件 ID → (owner, repo) 映射
    let repos: &[(&str, &str, &str)] = &[
        ("momentum", "Next-Flip", "Momentum-Firmware"),
        ("unleashed", "DarkFlippers", "unleashed-firmware"),
        ("ofw", "flipperdevices", "flipperzero-firmware"),
        ("roguemaster", "RogueMaster", "flipperzero-firmware-wPlugins"),
    ];

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .user_agent("DolphinTutor/1.0")
        .build()
        .map_err(|e| anyhow!("创建 HTTP 客户端失败: {e}"))?;

    for (fw_id, owner, repo) in repos {
        let api_url = format!("https://api.github.com/repos/{}/{}/releases/latest", owner, repo);

        match client.get(&api_url).header("Accept", "application/vnd.github+json").send() {
            Ok(resp) => {
                if !resp.status().is_success() {
                    log::debug!("GitHub API 返回 {} for {}/{}", resp.status(), owner, repo);
                    continue;
                }
                match resp.json::<serde_json::Value>() {
                    Ok(json) => {
                        // 查找 update 包的 asset（flipper-z-f7-update-*.zip）
                        let mut download_url = format!("https://github.com/{}/{}/releases/latest", owner, repo);
                        let mut size_bytes: u64 = 4 * 1024 * 1024;

                        if let Some(assets) = json.get("assets").and_then(|a| a.as_array()) {
                            for asset in assets {
                                let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                if name.contains("update") && (name.ends_with(".zip") || name.ends_with(".tgz")) {
                                    download_url = asset.get("browser_download_url")
                                        .and_then(|u| u.as_str())
                                        .unwrap_or(&download_url)
                                        .to_string();
                                    size_bytes = asset.get("size").and_then(|s| s.as_u64()).unwrap_or(size_bytes);
                                    break;
                                }
                            }
                        }

                        updates.insert(fw_id.to_string(), GithubFirmwareUpdate {
                            download_url,
                            size_bytes,
                        });
                    }
                    Err(e) => {
                        log::debug!("解析 GitHub API 响应失败 for {}/{}: {e}", owner, repo);
                    }
                }
            }
            Err(e) => {
                log::debug!("GitHub API 请求失败 for {}/{}: {e}", owner, repo);
            }
        }
    }

    if updates.is_empty() {
        bail!("所有 GitHub API 请求均失败");
    }

    Ok(updates)
}

// -------------------- 固件刷写主入口 --------------------

/// 刷写固件（自动选择刷写轨道）
///
/// 参数：
///   - firmware_id: 固件 ID（momentum / unleashed / ofw / roguemaster）
///   - firmware_path: 本地固件文件路径（如为 None 则下载）
///   - session: RPC 会话（如为 None 则使用 DFU 轨道）
///   - progress_cb: 进度回调
pub fn flash_firmware<F>(
    firmware_id: &str,
    firmware_path: Option<&str>,
    session: Option<&RpcSession>,
    cancel_flag: Option<&std::sync::atomic::AtomicBool>,
    progress_cb: F,
) -> Result<FlashResult>
where
    F: Fn(FlashProgress),
{
    let start = Instant::now();
    let fid = FirmwareId::from_str(firmware_id)
        .ok_or_else(|| anyhow!("未知固件 ID: {}", firmware_id))?;

    log::info!("开始刷写固件: {} ({:?})", firmware_id, fid);

    // 根据是否有 RPC 会话选择刷写轨道
    let method = if session.is_some() {
        "rpc"
    } else {
        "dfu"
    };

    let result = match session {
        Some(s) => flash_via_rpc(s, firmware_id, firmware_path, cancel_flag, &progress_cb),
        None => flash_via_dfu(firmware_id, firmware_path, cancel_flag, &progress_cb),
    };

    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(()) => {
            progress_cb(FlashProgress {
                phase: FlashPhase::Done,
                progress: 100,
                message: format!("固件 {} 刷写完成", firmware_id),
                error_message: None,
            });
            Ok(FlashResult {
                success: true,
                firmware_id: firmware_id.to_string(),
                method: method.to_string(),
                duration_ms,
                message: format!("{} 固件刷写成功（{}模式）", firmware_id, method),
            })
        }
        Err(e) => {
            let msg = format!("固件刷写失败: {e}");
            progress_cb(FlashProgress {
                phase: FlashPhase::Error,
                progress: 0,
                message: msg.clone(),
                error_message: Some(msg.clone()),
            });
            Err(anyhow!(msg))
        }
    }
}

// -------------------- 轨道 A：RPC 刷写 --------------------

/// 通过 RPC 协议刷写固件（正常模式）
///
/// 流程：
///   1. 准备固件文件（下载或使用本地文件）
///   2. 校验 Manifest API Level
///   3. 通过 storage_write 传输固件包到 /update/
///   4. 触发设备端自动刷写并重启
fn flash_via_rpc<F>(
    session: &RpcSession,
    firmware_id: &str,
    firmware_path: Option<&str>,
    cancel_flag: Option<&std::sync::atomic::AtomicBool>,
    progress_cb: &F,
) -> Result<()>
where
    F: Fn(FlashProgress),
{
    log::info!("RPC 轨道刷写: {}", firmware_id);
    let original_port = session.port_name.clone();

    // 阶段 1：准备固件文件
    progress_cb(FlashProgress {
        phase: FlashPhase::Downloading,
        progress: 5,
        message: "正在准备固件文件...".to_string(),
        error_message: None,
    });

    let firmware_data = prepare_firmware_file(firmware_id, firmware_path, progress_cb)?;

    // 阶段 2：校验 Manifest
    progress_cb(FlashProgress {
        phase: FlashPhase::Checking,
        progress: 30,
        message: "正在校验固件 Manifest...".to_string(),
        error_message: None,
    });

    let manifest = parse_manifest(&firmware_data)?;
    verify_api_level(session, &manifest, progress_cb)?;

    // 阶段 3：传输固件包到设备
    progress_cb(FlashProgress {
        phase: FlashPhase::Flashing,
        progress: 40,
        message: format!("正在传输固件包（{} MB）...", firmware_data.len() / 1024 / 1024),
        error_message: None,
    });

    let target_path = "/update/firmware.fuf";
    protocol::storage_write(session, target_path, &firmware_data, Some(&|written, total| {
        let pct = 40 + ((written as f64 / total as f64) * 50.0) as u8;
        progress_cb(FlashProgress {
            phase: FlashPhase::Flashing,
            progress: pct.min(89),
            message: format!("传输中 {}/{} 字节", written, total),
            error_message: None,
        });
    }))?;

    // 阶段 4：触发设备固件更新重启
    progress_cb(FlashProgress {
        phase: FlashPhase::Rebooting,
        progress: 90,
        message: "正在触发固件更新重启，请勿断开...".to_string(),
        error_message: None,
    });

    // 主动发送 RebootMode::Update 命令，设备收到后会刷写 /update/firmware.fuf 并重启
    log::info!("发送 system_reboot(Update) 命令...");
    match protocol::system_reboot(session, protocol::RebootMode::Update) {
        Ok(()) => log::info!("固件更新重启命令已发送"),
        Err(e) => {
            // reboot 命令失败大概率是因为设备已经开始重启导致串口断开，属预期行为
            log::warn!("system_reboot 返回错误（可能是设备已开始重启）: {e}");
        }
    }

    // 等待设备重启完成（轮询串口重连，最多等 60 秒）
    progress_cb(FlashProgress {
        phase: FlashPhase::Rebooting,
        progress: 92,
        message: "等待设备重启完成...".to_string(),
        error_message: None,
    });

    // 轮询等待设备重新出现（最多 60 秒）
    let port_name = wait_for_device_reconnect(&original_port, 60, cancel_flag)?;

    // 阶段 5：验证固件版本
    progress_cb(FlashProgress {
        phase: FlashPhase::Verifying,
        progress: 95,
        message: "正在验证固件版本...".to_string(),
        error_message: None,
    });

    // 重新建立 RPC 会话验证版本
    match protocol::start_session(&port_name) {
        Ok(new_session) => {
            match protocol::system_get_info(&new_session) {
                Ok(info) => {
                    log::info!(
                        "刷写后设备信息: firmware={} api_level={}",
                        info.firmware_version, info.api_level
                    );
                    // 模糊匹配版本号（固件版本格式可能不同，如 "1.0.0" vs "Release 1.0.0"）
                    let expected = manifest.version.trim();
                    let actual = info.firmware_version.as_str();
                    if !version_matches(actual, expected) {
                        log::warn!(
                            "版本不匹配: 期望={} 实际={}", expected, actual
                        );
                        // 不报错，只警告 — 某些固件版本号格式不同
                    }
                    progress_cb(FlashProgress {
                        phase: FlashPhase::Done,
                        progress: 100,
                        message: format!(
                            "固件刷写完成！版本: {} (API {})",
                            info.firmware_version, info.api_level
                        ),
                        error_message: None,
                    });
                }
                Err(e) => {
                    log::warn!("版本验证失败（设备可能仍在启动中）: {e}");
                    progress_cb(FlashProgress {
                        phase: FlashPhase::Done,
                        progress: 100,
                        message: "固件刷写已触发，版本验证跳过（设备仍在启动）".to_string(),
                        error_message: None,
                    });
                }
            }
        }
        Err(e) => {
            log::warn!("重新连接设备失败: {e}");
            progress_cb(FlashProgress {
                phase: FlashPhase::Done,
                progress: 100,
                message: "固件刷写已触发，请手动重连设备验证".to_string(),
                error_message: None,
            });
        }
    }

    log::info!("RPC 轨道刷写完成");
    Ok(())
}

// -------------------- 轨道 B：DFU 刷写 --------------------

/// 通过 dfu-util 刷写固件（DFU 模式救砖）
///
/// 流程：
///   1. 准备固件 dfu 文件（下载或解压本地固件包）
///   2. 校验 Manifest API Level
///   3. 调用 dfu-util 刷写
///   4. 等待设备重启
fn flash_via_dfu<F>(
    firmware_id: &str,
    firmware_path: Option<&str>,
    cancel_flag: Option<&std::sync::atomic::AtomicBool>,
    progress_cb: &F,
) -> Result<()>
where
    F: Fn(FlashProgress),
{
    log::info!("DFU 轨道刷写: {}", firmware_id);

    // 阶段 1：准备固件 dfu 文件
    progress_cb(FlashProgress {
        phase: FlashPhase::Downloading,
        progress: 10,
        message: "正在准备 DFU 固件文件...".to_string(),
        error_message: None,
    });

    let dfu_path = prepare_dfu_file(firmware_id, firmware_path, progress_cb)?;
    // 仅当 dfu 文件为从压缩包提取的临时文件时，才在函数结束时清理
    // （用户直接提供的 .dfu 文件不应被删除）
    let is_temp = firmware_path.map_or(true, |p| p != dfu_path.as_str());
    let _dfu_guard = TempFileGuard::new(if is_temp { Some(dfu_path.clone()) } else { None });

    // 阶段 2：校验 Manifest API Level
    progress_cb(FlashProgress {
        phase: FlashPhase::Checking,
        progress: 25,
        message: "正在校验固件兼容性...".to_string(),
        error_message: None,
    });
    // 从固件包中提取 Manifest 校验 API Level
    if let Some(fw_path) = firmware_path {
        match verify_dfu_manifest(fw_path) {
            Ok(Some(level)) => {
                log::info!("DFU Manifest 校验通过: API Level {}", level);
            }
            Ok(None) => {
                log::warn!("固件包无 Manifest，跳过 API Level 校验");
            }
            Err(e) => {
                log::warn!("Manifest 校验失败（不阻塞）: {e}");
            }
        }
    }

    // 阶段 3：检测 DFU 设备
    progress_cb(FlashProgress {
        phase: FlashPhase::EnteringDfu,
        progress: 35,
        message: "正在检测 DFU 设备...".to_string(),
        error_message: None,
    });

    let dfu_device = wait_for_dfu_device()?;
    log::info!("检测到 DFU 设备: {}", dfu_device);

    // 阶段 4：调用 dfu-util 刷写
    progress_cb(FlashProgress {
        phase: FlashPhase::Flashing,
        progress: 50,
        message: "正在通过 dfu-util 刷写固件...".to_string(),
        error_message: None,
    });

    run_dfu_util(&dfu_path, cancel_flag, progress_cb)?;

    // 阶段 5：等待重启
    progress_cb(FlashProgress {
        phase: FlashPhase::Rebooting,
        progress: 95,
        message: "固件刷写完成，设备正在重启...".to_string(),
        error_message: None,
    });

    // dfu-util 的 :leave 参数会让设备自动退出 DFU 模式并重启
    std::thread::sleep(std::time::Duration::from_secs(3));

    log::info!("DFU 轨道刷写完成");
    Ok(())
}

// -------------------- 固件文件准备 --------------------

/// 准备固件文件数据
///
/// firmware_path 必须提供（用户通过文件选择器选取本地固件包）。
/// 不支持自动下载（GitHub Releases URL 是 HTML 页面，需用户手动下载）。
fn prepare_firmware_file<F>(
    firmware_id: &str,
    firmware_path: Option<&str>,
    _progress_cb: &F,
) -> Result<Vec<u8>>
where
    F: Fn(FlashProgress),
{
    match firmware_path {
        Some(path) => {
            log::info!("读取本地固件文件: {}", path);
            let data = std::fs::read(path)
                .map_err(|e| anyhow!("读取固件文件失败: {e}"))?;
            log::info!("固件文件大小: {} 字节", data.len());
            if data.is_empty() {
                bail!("固件文件为空");
            }
            Ok(data)
        }
        None => {
            // 不支持自动下载：GitHub Releases URL 是 HTML 页面而非直链，
            // 需要用户手动从 release 页面下载固件包后通过文件选择器选取
            bail!(
                "请先下载固件包到本地，然后在固件管理页面点击「选择固件文件」按钮选取。\n\
                 下载地址: {}",
                get_firmware_download_page(firmware_id)
            )
        }
    }
}

/// 获取固件下载页面 URL（用于提示用户手动下载）
fn get_firmware_download_page(firmware_id: &str) -> &'static str {
    match firmware_id {
        "momentum" => "https://github.com/Next-Flip/Momentum-Firmware/releases/latest",
        "unleashed" => "https://github.com/DarkFlippers/unleashed-firmware/releases/latest",
        "ofw" => "https://github.com/flipperdevices/flipperzero-firmware/releases/latest",
        "roguemaster" => "https://github.com/RogueMaster/flipperzero-firmware-wPlugins/releases/latest",
        _ => "https://github.com/flipperdevices/flipperzero-firmware/releases",
    }
}

/// 准备 DFU 文件路径
///
/// 支持 .dfu 文件直接使用，或从 .zip/.tar.gz 固件包中解压提取 .dfu 文件。
fn prepare_dfu_file<F>(
    firmware_id: &str,
    firmware_path: Option<&str>,
    _progress_cb: &F,
) -> Result<String>
where
    F: Fn(FlashProgress),
{
    match firmware_path {
        Some(path) => {
            if path.ends_with(".dfu") {
                return Ok(path.to_string());
            }

            // 尝试从固件包中解压 .dfu 文件
            log::info!("从固件包中提取 .dfu 文件: {}", path);
            let dfu_path = extract_dfu_from_archive(path)?;
            log::info!("提取到 .dfu 文件: {}", dfu_path);
            Ok(dfu_path)
        }
        None => {
            bail!("DFU 模式刷写需要提供本地固件文件: {}", firmware_id)
        }
    }
}

/// 从固件压缩包中提取 .dfu 文件
///
/// 支持 zip 和 tar.gz 格式。提取到系统临时目录。
fn extract_dfu_from_archive(archive_path: &str) -> Result<String> {
    let path = std::path::Path::new(archive_path);
    if !path.exists() {
        bail!("固件文件不存在: {}", archive_path);
    }

    let tmp_dir = std::env::temp_dir();
    // 使用含进程 ID 的唯一文件名，避免并发刷写时互相覆盖（M9）
    let dfu_output = tmp_dir.join(format!("flipper_firmware_{}.dfu", std::process::id()));

    // 根据扩展名选择解压方式
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let is_tar_gz = ext == "gz" || archive_path.ends_with(".tar.gz");
    let is_zip = ext == "zip";

    if is_tar_gz {
        // tar.gz 解压
        let file = std::fs::File::open(path)?;
        let decoder = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);

        for entry_result in archive.entries()? {
            let mut entry = entry_result?;
            let entry_path = entry.path()?.to_path_buf();
            if entry_path.extension().and_then(|e| e.to_str()) == Some("dfu") {
                let mut dfu_file = std::fs::File::create(&dfu_output)?;
                std::io::copy(&mut entry, &mut dfu_file)?;
                return Ok(dfu_output.to_string_lossy().to_string());
            }
        }
        bail!("tar.gz 包中未找到 .dfu 文件");
    } else if is_zip {
        // zip 解压 — 使用 zip crate（避免依赖外部 unzip 命令，消除命令注入与依赖风险，L3）
        let file = std::fs::File::open(path)
            .map_err(|e| anyhow!("打开 zip 文件失败: {e}"))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| anyhow!("读取 zip 归档失败: {e}"))?;

        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| anyhow!("读取 zip 条目失败: {e}"))?;
            let name = entry.name().to_string();
            if name.ends_with(".dfu") {
                let mut dfu_file = std::fs::File::create(&dfu_output)
                    .map_err(|e| anyhow!("创建临时 dfu 文件失败: {e}"))?;
                std::io::copy(&mut entry, &mut dfu_file)
                    .map_err(|e| anyhow!("写入 dfu 文件失败: {e}"))?;
                return Ok(dfu_output.to_string_lossy().to_string());
            }
        }
        bail!("zip 包中未找到 .dfu 文件");
    } else {
        // 未知格式，假设已经是 dfu 文件
        log::warn!("未知文件格式，尝试直接作为 .dfu 使用: {}", archive_path);
        Ok(archive_path.to_string())
    }
}

// -------------------- Manifest 校验 --------------------

/// 解析固件 Manifest
///
/// 从固件包中提取 manifest.json / update_manifest.json 并解析。
/// 支持两种格式：
///   1. tar.gz 压缩包（标准 Flipper Zero 固件更新包格式）
///   2. 纯 JSON 文件（manifest.json 单独提供时的降级解析）
///
/// 解析流程：
///   1. 检测 gzip 魔数（0x1f 0x8b）
///   2. 如为 gzip → 解压并作为 tar 遍历，查找 manifest 文件
///   3. 如非 gzip → 尝试直接作为 JSON 解析
///   4. 解析 JSON 字段，兼容多种字段名（version/firmware_version 等）
///   5. 解析失败时返回带警告的默认 Manifest（不阻塞刷写流程）
fn parse_manifest(firmware_data: &[u8]) -> Result<FirmwareManifest> {
    log::info!("解析固件 Manifest，数据大小: {} 字节", firmware_data.len());

    if firmware_data.is_empty() {
        bail!("固件数据为空，无法解析 Manifest");
    }

    // 检测 gzip 魔数：0x1f 0x8b
    let is_gzip = firmware_data.len() >= 2
        && firmware_data[0] == 0x1f
        && firmware_data[1] == 0x8b;

    let manifest_json = if is_gzip {
        // gzip 压缩包 → 解压为 tar 并查找 manifest 文件
        log::debug!("检测到 gzip 格式，解压 tar 并查找 manifest");
        extract_manifest_from_targz(firmware_data)?
    } else {
        // 非 gzip → 尝试直接作为 JSON 解析
        log::debug!("非 gzip 格式，尝试直接解析为 JSON");
        String::from_utf8_lossy(firmware_data).to_string()
    };

    if manifest_json.is_empty() {
        log::warn!("未在固件包中找到 manifest 文件，使用默认 Manifest");
        return Ok(default_manifest_with_warning("固件包中未包含 manifest 文件"));
    }

    // 解析 JSON
    parse_manifest_json(&manifest_json)
}

/// 从 tar.gz 固件包中提取 manifest 文件内容
///
/// 遍历 tar 条目，查找以下文件名之一：
///   - manifest.json
///   - update_manifest.json
///   - UpdateManifest.json
fn extract_manifest_from_targz(targz_data: &[u8]) -> Result<String> {
    let decoder = flate2::read::GzDecoder::new(targz_data);
    let mut archive = tar::Archive::new(decoder);

    let manifest_filenames = [
        "manifest.json",
        "update_manifest.json",
        "UpdateManifest.json",
    ];

    for entry_result in archive.entries()? {
        let mut entry = entry_result.map_err(|e| anyhow!("读取 tar 条目失败: {e}"))?;
        let path = entry.path().map_err(|e| anyhow!("获取条目路径失败: {e}"))?;
        let path_str = path.to_string_lossy().to_string();

        // 检查文件名是否匹配 manifest 文件名（支持子目录路径）
        let filename = path_str
            .rsplit('/')
            .next()
            .unwrap_or(&path_str)
            .to_lowercase();

        if manifest_filenames.iter().any(|mf| filename == *mf) {
            log::info!("找到 manifest 文件: {}", path_str);
            let mut content = String::new();
            entry
                .read_to_string(&mut content)
                .map_err(|e| anyhow!("读取 manifest 内容失败: {e}"))?;
            return Ok(content);
        }
    }

    log::warn!("tar 包中未找到 manifest 文件");
    Ok(String::new())
}

/// 解析 manifest JSON 内容为 FirmwareManifest
///
/// 兼容多种固件格式的字段名：
///   - version / firmware_version
///   - api_level / min_api_level / manifest_version
///   - target / firmware_target
///   - build_date / firmware_build_date
///   - commit / firmware_commit
fn parse_manifest_json(json_str: &str) -> Result<FirmwareManifest> {
    let json: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| anyhow!("解析 manifest JSON 失败: {e}"))?;

    // 提取字段（兼容多种字段名）
    let version = json
        .get("version")
        .or_else(|| json.get("firmware_version"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    // API Level：优先 api_level，其次 min_api_level，最后 manifest_version
    let api_level = json
        .get("api_level")
        .or_else(|| json.get("min_api_level"))
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| {
            json.get("manifest_version")
                .and_then(|v| v.as_u64())
                .unwrap_or(1) as u64
        }) as u32;

    let target = json
        .get("target")
        .or_else(|| json.get("firmware_target"))
        .and_then(|v| v.as_str())
        .unwrap_or("f7")
        .to_string();

    let build_date = json
        .get("build_date")
        .or_else(|| json.get("firmware_build_date"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let commit = json
        .get("commit")
        .or_else(|| json.get("firmware_commit"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let changelog = json
        .get("changelog")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    log::info!(
        "Manifest 解析成功: version={} api_level={} target={} build_date={} commit={}",
        version,
        api_level,
        target,
        build_date,
        commit
    );

    Ok(FirmwareManifest {
        version,
        api_level,
        target,
        build_date,
        commit,
        changelog,
    })
}

/// 生成带警告的默认 Manifest（解析失败时降级使用）
fn default_manifest_with_warning(reason: &str) -> FirmwareManifest {
    log::warn!("使用默认 Manifest: {}", reason);
    FirmwareManifest {
        version: "unknown".to_string(),
        api_level: 1,
        target: "f7".to_string(),
        build_date: String::new(),
        commit: "unknown".to_string(),
        changelog: Some(format!("⚠ Manifest 解析失败: {reason}")),
    }
}

/// 校验 API Level 兼容性
///
/// 规则：固件 API Level 必须与设备硬件 Target 兼容
/// FlipperZero F7 硬件支持 API Level 1
fn verify_api_level<F>(
    session: &RpcSession,
    manifest: &FirmwareManifest,
    _progress_cb: &F,
) -> Result<()>
where
    F: Fn(FlashProgress),
{
    log::info!(
        "校验 API Level: 固件={} 设备待查询",
        manifest.api_level
    );

    // 获取设备信息
    let device_info = protocol::system_get_info(session)?;

    // FlipperZero F7 硬件支持 API Level 1
    // 如果固件要求更高 API Level 则拒绝
    if manifest.api_level > 1 {
        bail!(
            "固件 API Level {} 高于设备支持的最大 Level 1（硬件 {}）",
            manifest.api_level,
            device_info.hardware_version
        );
    }

    log::info!("API Level 校验通过");
    Ok(())
}

// -------------------- dfu-util 调用 --------------------

/// 等待 DFU 设备出现
fn wait_for_dfu_device() -> Result<String> {
    use crate::device::detector::wait_for_device;
    use crate::device::DeviceMode;

    log::info!("等待 DFU 设备出现...");
    let dev = wait_for_device(30, true).map_err(|e| anyhow!("未检测到 DFU 设备: {e}"))?;
    if dev.mode != DeviceMode::Dfu {
        bail!("设备不在 DFU 模式");
    }
    Ok(dev.port_name)
}

/// 调用 dfu-util 刷写固件
///
/// 命令：dfu-util -a 0 -s 0x08000000:leave -D <firmware.dfu>
///   -a 0:          alt interface 0
///   -s 0x08000000: 写入起始地址（STM32F7 Flash 基址）
///   :leave:        刷写完成后退出 DFU 模式并重启
///   -D:            指定固件文件
///
/// 进度解析：dfu-util 向 stderr 输出进度（如 "100%\r"），
/// 使用 spawn + Stdio::piped() 实时读取 stderr 解析百分比。
fn run_dfu_util<F>(
    dfu_path: &str,
    cancel_flag: Option<&std::sync::atomic::AtomicBool>,
    progress_cb: &F,
) -> Result<()>
where
    F: Fn(FlashProgress),
{
    log::info!("调用 dfu-util 刷写: {}", dfu_path);

    // 检查 dfu-util 是否安装
    let dfu_util_path = which_dfu_util()?;
    log::info!("dfu-util 路径: {}", dfu_util_path);

    // 使用 spawn 而非 output，实时读取 stderr 进度
    // stdout 不需要，丢弃以避免管道缓冲区写满导致 dfu-util 阻塞（M7）
    let mut child = std::process::Command::new(&dfu_util_path)
        .arg("-a").arg("0")
        .arg("-s").arg("0x08000000:leave")
        .arg("-D").arg(dfu_path)
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .spawn()
        .map_err(|e| anyhow!("调用 dfu-util 失败: {e}"))?;

    // 实时读取 stderr 解析进度
    use std::io::{BufRead, BufReader};
    let stderr = child.stderr.take()
        .ok_or_else(|| anyhow!("无法获取 dfu-util stderr"))?;
    let reader = BufReader::new(stderr);

    for line_result in reader.lines() {
        // 每行检查取消标志：为 true 时终止子进程并返回错误（H5）
        if let Some(flag) = cancel_flag {
            if flag.load(std::sync::atomic::Ordering::SeqCst) {
                let _ = child.kill();
                bail!("刷写已取消");
            }
        }
        match line_result {
            Ok(line) => {
                log::debug!("dfu-util: {}", line);

                // 解析进度百分比（dfu-util 输出格式如 "  45%" 或 "100%"）
                let trimmed = line.trim();
                if let Some(pct_str) = trimmed.strip_suffix('%') {
                    if let Ok(pct) = pct_str.trim().parse::<u8>() {
                        let mapped_pct = 50 + (pct as u32 * 40 / 100) as u8; // 映射到 50-90
                        progress_cb(FlashProgress {
                            phase: FlashPhase::Flashing,
                            progress: mapped_pct,
                            message: format!("dfu-util 刷写中... {}%", pct),
                            error_message: None,
                        });
                    }
                }
            }
            Err(e) => {
                log::warn!("读取 dfu-util 输出失败: {e}");
                break;
            }
        }
    }

    // 等待子进程结束
    let status = child
        .wait()
        .map_err(|e| anyhow!("等待 dfu-util 结束失败: {e}"))?;

    if !status.success() {
        bail!("dfu-util 刷写失败，退出码: {:?}", status.code());
    }

    log::info!("dfu-util 刷写完成");
    Ok(())
}

/// 查找 dfu-util 可执行文件路径
fn which_dfu_util() -> Result<String> {
    // 1. 优先使用随包内置的 dfu-util
    let bundled = get_bundled_dfu_util_path();
    if bundled.exists() {
        return Ok(bundled.to_string_lossy().to_string());
    }

    // 2. 尝试系统 PATH 中的 dfu-util
    let candidates = ["dfu-util", "dfu-util.exe"];
    for cand in &candidates {
        if let Ok(output) = std::process::Command::new("which")
            .arg(cand)
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    // L2：从 PATH 找到 dfu-util 时打印完整路径供用户确认，
                    // 提醒优先使用随包内置版本以降低 PATH 劫持风险
                    log::warn!(
                        "使用系统 PATH 中的 dfu-util: {}（建议使用随包内置版本以确保安全性）",
                        path
                    );
                    return Ok(path);
                }
            }
        }
        // Windows 下 which 不可用，直接返回名称（依赖 PATH）
        #[cfg(target_os = "windows")]
        {
            return Ok(cand.to_string());
        }
    }

    // 3. 未找到，返回带安装引导的详细错误
    let install_hint = if cfg!(target_os = "macos") {
        "macOS: brew install dfu-util"
    } else if cfg!(target_os = "linux") {
        "Linux: sudo apt install dfu-util (或 yum install dfu-util)"
    } else {
        "Windows: 从 http://dfu-util.sourceforge.net/releases/ 下载并加入 PATH"
    };
    bail!(
        "未找到 dfu-util 工具。请安装后重试：\n  {}\n\
         安装完成后重新打开应用即可使用 DFU 救砖功能。",
        install_hint
    )
}

/// 获取随包内置 dfu-util 的路径
fn get_bundled_dfu_util_path() -> std::path::PathBuf {
    // 路径取决于平台: resources/dfu-util-{platform}
    let exe_dir = std::env::current_exe()
        .map(|p| p.parent().unwrap_or(Path::new(".")).to_path_buf())
        .unwrap_or_else(|_| Path::new(".").to_path_buf());
    exe_dir.join("resources").join("dfu-util")
}

// -------------------- 辅助函数 --------------------

/// 轮询等待设备重新连接（固件更新重启后）
///
/// 每 3 秒扫描一次串口，检测原端口是否重新出现。
/// 超时则返回错误。
fn wait_for_device_reconnect(
    original_port: &str,
    timeout_secs: u64,
    cancel_flag: Option<&std::sync::atomic::AtomicBool>,
) -> Result<String> {
    log::info!(
        "等待设备重连: 端口={} 超时={}s",
        original_port,
        timeout_secs
    );

    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(timeout_secs);

    // 首次等待 8 秒（设备重启需要时间）
    std::thread::sleep(std::time::Duration::from_secs(8));

    loop {
        // 每轮循环检查取消标志（H5）
        check_cancelled(cancel_flag)?;

        if start.elapsed() > timeout {
            log::warn!("设备重连超时");
            // 超时不报错，返回原端口让后续验证尝试
            return Ok(original_port.to_string());
        }

        match crate::device::detector::scan_devices() {
            Ok(scan) => {
                for dev in &scan.devices {
                    if dev.port_name == original_port {
                        log::info!("设备已重新出现: {}", original_port);
                        // 再等 2 秒让串口稳定
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        return Ok(original_port.to_string());
                    }
                }
            }
            Err(e) => {
                log::debug!("扫描设备失败（重连中）: {e}");
            }
        }

        std::thread::sleep(std::time::Duration::from_secs(3));
    }
}

/// 版本号模糊匹配
///
/// 判断 actual 是否包含 expected 的主要版本号。
/// 例如 "Release 1.0.0" 匹配 "1.0.0"
fn version_matches(actual: &str, expected: &str) -> bool {
    if actual == expected {
        return true;
    }
    // 提取 expected 中的数字部分
    let expected_parts: Vec<&str> = expected.split('.').collect();
    if expected_parts.is_empty() {
        return actual.contains(expected);
    }

    // 检查 actual 是否包含 expected 的前两个版本号部分
    let major_minor = if expected_parts.len() >= 2 {
        format!("{}.{}", expected_parts[0], expected_parts[1])
    } else {
        expected_parts[0].to_string()
    };

    actual.contains(&major_minor)
}

/// 从固件压缩包中提取并校验 Manifest 的 API Level（DFU 轨道用）
///
/// 解压固件包，查找 manifest.json，解析并返回 api_level。
/// 如未找到 manifest.json 则返回 None（不阻塞刷写，只警告）。
fn verify_dfu_manifest(archive_path: &str) -> Result<Option<u32>> {
    let path = std::path::Path::new(archive_path);
    if !path.exists() {
        return Ok(None);
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let is_zip = ext == "zip";
    let is_tar_gz = ext == "gz" || archive_path.ends_with(".tar.gz");

    let manifest_data: Option<Vec<u8>> = if is_tar_gz {
        // tar.gz 解压查找 manifest.json
        let file = std::fs::File::open(path)
            .map_err(|e| anyhow!("打开固件包失败: {e}"))?;
        let decoder = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);

        let mut found: Option<Vec<u8>> = None;
        for entry_result in archive.entries()? {
            let mut entry = entry_result?;
            let entry_path = entry.path()?.to_path_buf();
            let name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            if name == "manifest.json" || name == "update_manifest.json" {
                let mut buf = Vec::new();
                use std::io::Read;
                entry.read_to_end(&mut buf)?;
                found = Some(buf);
                break;
            }
        }
        found
    } else if is_zip {
        // zip 解压查找 manifest.json — 使用 zip crate（避免依赖外部 unzip 命令，L3）
        let file = std::fs::File::open(path)
            .map_err(|e| anyhow!("打开 zip 文件失败: {e}"))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| anyhow!("读取 zip 归档失败: {e}"))?;
        let manifest_names = ["manifest.json", "update_manifest.json"];
        let mut found: Option<Vec<u8>> = None;
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| anyhow!("读取 zip 条目失败: {e}"))?;
            let name = entry.name().to_string();
            let filename = name.rsplit('/').next().unwrap_or(&name).to_lowercase();
            if manifest_names.iter().any(|m| filename == *m) {
                let mut buf = Vec::new();
                entry
                    .read_to_end(&mut buf)
                    .map_err(|e| anyhow!("读取 manifest 内容失败: {e}"))?;
                found = Some(buf);
                break;
            }
        }
        found
    } else {
        None
    };

    match manifest_data {
        Some(data) => {
            let json: serde_json::Value = serde_json::from_slice(&data)
                .map_err(|e| anyhow!("解析 Manifest JSON 失败: {e}"))?;

            let api_level = json
                .get("api_level")
                .or_else(|| json.get("min_api_level"))
                .or_else(|| json.get("manifest_version"))
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);

            if let Some(level) = api_level {
                log::info!("DFU Manifest API Level: {}", level);
                // Flipper Zero F7 硬件 API_level 通常为 1
                if level > 1 {
                    log::warn!("Manifest API Level ({}) 可能不兼容当前硬件", level);
                }
            }
            Ok(api_level)
        }
        None => {
            log::warn!("固件包中未找到 manifest.json，跳过 API Level 校验");
            Ok(None)
        }
    }
}
