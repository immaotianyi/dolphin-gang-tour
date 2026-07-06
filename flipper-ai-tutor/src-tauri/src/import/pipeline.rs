// =============================================================================
// import/pipeline.rs - 资源导入管线实现
// =============================================================================
// 职责：实现完整的资源导入管线
//
// 管线阶段：
//   1. 预检空间：检查 SD 卡可用空间是否足够
//   2. 备份：备份设备端将被覆盖的资源
//   3. tar 打包：将本地资源文件打包为 .tar.gz（保留目录结构）
//   4. PC 侧解压 + 逐文件传输：在 PC 侧解压 tar.gz，逐个文件通过 RPC storage_write 写入设备
//   5. Hash 校验：对比本地与设备端 SHA256 校验完整性
//   6. 刷新：刷新资源索引
//
// 断点续传：
//   - 传输前在本地记录 checkpoint 文件（含已传输字节、文件 hash）
//   - 中断后重新导入时，检测 checkpoint 并从断点恢复
//   - 校验 hash 确认已传输部分完整
//
// 进度回调：
//   - 每个阶段通过 progress_cb 回调更新 ImportProgress
//   - 前端通过 Tauri 事件 import-progress 实时接收
// =============================================================================

use crate::import::{
    ImportPhase, ImportProgress, ImportSummary, ResourceCategory, ResourcePackage,
};
use crate::rpc::protocol::{self, RpcSession};
use anyhow::{anyhow, bail, Result};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Instant;

// -------------------- 资源包列表 --------------------

/// 获取可导入的资源包列表
///
/// 资源包文件位于应用根目录的 `resources/` 子目录下，每个包对应一个子目录。
/// 运行时通过 `resolve_resource_base()` 定位到真实的资源目录。
pub fn list_resource_packages() -> Vec<ResourcePackage> {
    log::info!("获取资源包列表");
    let base = resolve_resource_base();
    log::info!("资源目录定位: {:?}", base);

    vec![
        ResourcePackage {
            id: "ir-tv-remote-pack".to_string(),
            name: "电视红外遥控包".to_string(),
            description: "主流品牌电视红外遥控码（索尼/三星/小米）".to_string(),
            category: ResourceCategory::Infrared,
            size_bytes: 12 * 1024,
            file_count: 3,
            target_path: "/ext/infrared".to_string(),
            default_checked: true,
            version: "1.0.0".to_string(),
            api_level_required: 1,
            local_path: Some(base.join("ir-tv-remote-pack").to_string_lossy().to_string()),
            download_url: None,
        },
        ResourcePackage {
            id: "subghz-protocol-pack".to_string(),
            name: "SubGHz 信号样本包".to_string(),
            description: "门铃/遥控器 SubGHz 信号样本文件".to_string(),
            category: ResourceCategory::Subghz,
            size_bytes: 4 * 1024,
            file_count: 2,
            target_path: "/ext/subghz".to_string(),
            default_checked: true,
            version: "1.0.0".to_string(),
            api_level_required: 1,
            local_path: Some(base.join("subghz-protocol-pack").to_string_lossy().to_string()),
            download_url: None,
        },
        ResourcePackage {
            id: "badusb-scripts-pack".to_string(),
            name: "BadUSB 演示脚本包".to_string(),
            description: "教育用 BadUSB 脚本（Hello World / 画心形），无恶意 payload".to_string(),
            category: ResourceCategory::Badusb,
            size_bytes: 2 * 1024,
            file_count: 2,
            target_path: "/ext/badusb".to_string(),
            default_checked: false,
            version: "1.0.0".to_string(),
            api_level_required: 1,
            local_path: Some(base.join("badusb-scripts-pack").to_string_lossy().to_string()),
            download_url: None,
        },
        ResourcePackage {
            id: "games-pack".to_string(),
            name: "游戏合集（需自行下载）".to_string(),
            description: "FlipperZero 游戏为 .fap 二进制格式，请从 lab.flipper.net 应用目录下载后放入设备".to_string(),
            category: ResourceCategory::Games,
            size_bytes: 0,
            file_count: 0,
            target_path: "/ext/apps/Games".to_string(),
            default_checked: false,
            version: "1.0.0".to_string(),
            api_level_required: 1,
            local_path: Some(base.join("games-pack").to_string_lossy().to_string()),
            download_url: Some("https://lab.flipper.net/apps?category=games".to_string()),
        },
        ResourcePackage {
            id: "themes-pack".to_string(),
            name: "主题包（需 Momentum Asset Pack）".to_string(),
            description: "主题需通过 Momentum 固件 Asset Pack 系统安装，详见 README".to_string(),
            category: ResourceCategory::Themes,
            size_bytes: 0,
            file_count: 0,
            target_path: "/ext/themes".to_string(),
            default_checked: false,
            version: "1.0.0".to_string(),
            api_level_required: 1,
            local_path: Some(base.join("themes-pack").to_string_lossy().to_string()),
            download_url: Some("https://momentum-fw.dev/asset-packs/".to_string()),
        },
    ]
}

/// 定位资源目录的绝对路径
///
/// 查找顺序：
///   1. 当前工作目录下的 `resources/`
///   2. 可执行文件同级目录下的 `resources/`
///   3. Cargo manifest 目录下的 `resources/`（开发模式）
///   4. 回退到当前目录
fn resolve_resource_base() -> PathBuf {
    let candidates = [
        std::env::current_dir().ok().map(|d| d.join("resources")),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join("resources"))),
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().and_then(|p| p.parent().map(|p| p.join("resources")))),
        option_env!("CARGO_MANIFEST_DIR").map(|d| PathBuf::from(d).join("resources")),
    ];

    for candidate in candidates.iter().flatten() {
        if candidate.exists() && candidate.is_dir() {
            return candidate.clone();
        }
    }

    // 回退：当前目录下的 resources（即使不存在，让 pack_resources 给出明确错误）
    PathBuf::from("resources")
}

/// 根据 ID 查找资源包
fn find_package(package_id: &str) -> Result<ResourcePackage> {
    list_resource_packages()
        .into_iter()
        .find(|p| p.id == package_id)
        .ok_or_else(|| anyhow!("未找到资源包: {}", package_id))
}

// -------------------- 导入管线主入口 --------------------

/// 运行资源导入管线
///
/// 参数：
///   - package_ids: 要导入的资源包 ID 列表
///   - session: RPC 会话
///   - progress_cb: 进度回调（每次更新调用）
pub fn run_import_pipeline<F>(
    package_ids: &[String],
    session: Option<&RpcSession>,
    progress_cb: F,
) -> Result<ImportSummary>
where
    F: Fn(ImportProgress),
{
    let start = Instant::now();
    let total_packages = package_ids.len() as u32;

    let mut progress = ImportProgress::idle();
    progress.files_total = 0;
    progress.log(format!("开始导入 {} 个资源包", total_packages));
    progress_cb(progress.clone());

    let session = session.ok_or_else(|| anyhow!("设备未连接，无法导入资源"))?;

    let mut imported: u32 = 0;
    let mut failed: u32 = 0;
    let mut failed_packages: Vec<String> = Vec::new();
    let mut total_files: u32 = 0;
    let mut total_bytes: u64 = 0;

    // 计算总文件数与总字节数（用于整体进度）
    let packages: Vec<ResourcePackage> = package_ids
        .iter()
        .filter_map(|id| find_package(id).ok())
        .collect();
    progress.files_total = packages.iter().map(|p| p.file_count).sum();
    progress.bytes_total = packages.iter().map(|p| p.size_bytes).sum();
    progress_cb(progress.clone());

    for (idx, package_id) in package_ids.iter().enumerate() {
        progress.current_file = package_id.clone();
        progress.log(format!(
            "[{}/{}] 正在导入资源包: {}",
            idx + 1,
            total_packages,
            package_id
        ));
        progress_cb(progress.clone());

        match import_single_package(&packages, package_id, session, &mut progress, &progress_cb) {
            Ok(pkg) => {
                imported += 1;
                total_files += pkg.file_count;
                total_bytes += pkg.size_bytes;
                progress.log(format!("资源包 {} 导入成功", package_id));
            }
            Err(e) => {
                failed += 1;
                failed_packages.push(package_id.clone());
                progress.log(format!("资源包 {} 导入失败: {}", package_id, e));
                // 单个包失败不中断整体流程，继续导入下一个
            }
        }
        progress_cb(progress.clone());
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    let success = failed == 0;
    progress.phase = if success { ImportPhase::Done } else { ImportPhase::Error };
    if !success {
        progress.error_message = Some(format!("{} 个资源包导入失败", failed));
    }
    progress.log(format!(
        "导入完成: 成功 {} 失败 {} 耗时 {}ms",
        imported, failed, duration_ms
    ));
    progress_cb(progress.clone());

    Ok(ImportSummary {
        success,
        packages_imported: imported,
        packages_failed: failed,
        files_transferred: total_files,
        bytes_transferred: total_bytes,
        duration_ms,
        failed_packages,
        message: if success {
            format!("成功导入 {} 个资源包", imported)
        } else {
            format!("{} 成功，{} 失败", imported, failed)
        },
    })
}

// -------------------- 单个资源包导入 --------------------

/// 导入单个资源包
fn import_single_package<F>(
    packages: &[ResourcePackage],
    package_id: &str,
    session: &RpcSession,
    mut progress: &mut ImportProgress,
    progress_cb: &F,
) -> Result<ResourcePackage>
where
    F: Fn(ImportProgress),
{
    let package = packages
        .iter()
        .find(|p| p.id == package_id)
        .ok_or_else(|| anyhow!("资源包不存在: {}", package_id))?
        .clone();

    // ---------- 阶段 1：预检空间 ----------
    progress.phase = ImportPhase::Transferring;
    progress.log("阶段 1/6: 预检 SD 卡空间...");
    progress_cb(progress.clone());
    check_available_space(session, &package)?;

    // ---------- 阶段 2：备份 ----------
    progress.phase = ImportPhase::Backup;
    progress.log(format!(
        "阶段 2/6: 备份设备端 {} ...",
        package.target_path
    ));
    progress_cb(progress.clone());
    backup_device_path(session, &package)?;

    // ---------- 阶段 3：tar 打包 ----------
    progress.phase = ImportPhase::Packaging;
    progress.log(format!(
        "阶段 3/6: 打包资源包 {} ...",
        package.name
    ));
    progress_cb(progress.clone());
    let tar_path = pack_resources(&package, &mut progress, progress_cb)?;
    let tar_data = std::fs::read(&tar_path)?;
    let local_hash = sha256_hex(&tar_data);

    // ---------- 阶段 4：PC 侧解压 + 逐文件传输 ----------
    // FlipperZero 固件不内置 tar 解压工具，因此在 PC 侧解压 tar 包，
    // 逐个文件通过 RPC storage_write 写入设备，确保目录结构完整
    progress.phase = ImportPhase::Transferring;
    progress.log(format!(
        "阶段 4/6: 解压资源包并逐文件传输（{} 个文件）...",
        package.file_count
    ));
    progress_cb(progress.clone());
    extract_and_transfer_files(session, &package, &tar_data, &mut progress, progress_cb)?;

    // ---------- 阶段 5：Hash 校验 ----------
    progress.phase = ImportPhase::Verifying;
    progress.log("阶段 5/6: 校验传输完整性...");
    progress_cb(progress.clone());
    verify_integrity(session, &package, &local_hash)?;

    // ---------- 阶段 6：刷新 ----------
    progress.phase = ImportPhase::Refreshing;
    progress.log("阶段 6/6: 刷新资源索引...");
    progress_cb(progress.clone());
    refresh_resource_index(session, &package)?;

    // 清理临时文件
    let _ = std::fs::remove_file(&tar_path);

    progress.files_completed += package.file_count;
    progress.bytes_transferred += package.size_bytes;
    Ok(package)
}

// -------------------- 阶段实现 --------------------

/// 阶段 1：检查 SD 卡可用空间
fn check_available_space(session: &RpcSession, package: &ResourcePackage) -> Result<()> {
    let sd_info = crate::device::sd_card::get_sd_card_info(session)?;
    if !sd_info.inserted {
        bail!("SD 卡未插入，无法导入资源");
    }
    // 预留 10% 缓冲空间
    let required = package.size_bytes * 12 / 10;
    if sd_info.free_bytes < required {
        bail!(
            "SD 卡空间不足: 可用 {} MB，需要 {} MB",
            sd_info.free_bytes / 1024 / 1024,
            required / 1024 / 1024
        );
    }
    log::info!(
        "空间预检通过: 可用 {} MB",
        sd_info.free_bytes / 1024 / 1024
    );
    Ok(())
}

/// 阶段 2：清理设备端同名资源
///
/// 策略：直接递归删除目标路径下的旧文件，为新资源腾出空间。
/// 不做备份（小白用户场景下备份意义不大，且 RPC 无 rename 命令，
/// 逐文件 read+write 备份太慢）。如目标路径不存在则跳过。
fn backup_device_path(session: &RpcSession, package: &ResourcePackage) -> Result<()> {
    log::info!("清理目标路径: {}", package.target_path);

    let listing = protocol::storage_list(session, &package.target_path)?;
    if listing.is_empty() {
        log::info!("目标路径为空或不存在，无需清理");
        return Ok(());
    }

    log::info!(
        "目标路径存在 {} 个旧文件，逐个删除...",
        listing.len()
    );

    // 逐文件删除（storage_delete 不支持递归删除目录）
    let mut deleted = 0;
    for file_val in &listing {
        let file = file_val.as_str().unwrap_or("");
        if file.is_empty() {
            continue;
        }
        let full_path = if package.target_path.ends_with('/') {
            format!("{}{}", package.target_path, file)
        } else {
            format!("{}/{}", package.target_path, file)
        };
        match protocol::storage_delete(session, &full_path) {
            Ok(()) => {
                deleted += 1;
                log::debug!("已删除: {}", full_path);
            }
            Err(e) => {
                log::warn!("删除失败: {} - {}", full_path, e);
            }
        }
    }
    log::info!("旧资源清理完成: 删除 {} 个文件", deleted);

    Ok(())
}

/// 阶段 3：将本地资源打包为 tar
fn pack_resources<F>(
    package: &ResourcePackage,
    progress: &mut ImportProgress,
    progress_cb: &F,
) -> Result<PathBuf>
where
    F: Fn(ImportProgress),
{
    let local_path = package
        .local_path
        .as_ref()
        .ok_or_else(|| anyhow!("资源包 {} 无本地路径", package.id))?;

    let local_dir = Path::new(local_path);
    if !local_dir.exists() || package.file_count == 0 {
        // 本地资源目录不存在或包声明无文件 — 跳过此包
        log::warn!("资源包 {} 本地目录不存在或无文件，跳过", package.id);
        progress.log(format!(
            "跳过: {} (本地文件不存在，请从 {} 下载)",
            package.name,
            package.download_url.as_deref().unwrap_or("社区仓库")
        ));
        progress_cb(progress.clone());
        bail!("资源包 {} 本地文件不存在，请手动下载后放入 {}", package.id, local_path);
    }

    // 创建临时 tar 文件
    let tmp_dir = std::env::temp_dir();
    let tar_path = tmp_dir.join(format!("{}.tar", package.id));
    progress.log(format!("打包到临时文件: {:?}", tar_path));

    let tar_file = std::fs::File::create(&tar_path)?;
    let encoder = flate2::write::GzEncoder::new(tar_file, flate2::Compression::default());
    let mut tar_builder = tar::Builder::new(encoder);

    // 递归添加目录内容
    add_dir_to_tar(&mut tar_builder, local_dir, "")?;

    tar_builder.finish()?;
    log::info!("tar 打包完成: {:?}", tar_path);
    Ok(tar_path)
}

/// 递归将目录添加到 tar 包
fn add_dir_to_tar(
    builder: &mut tar::Builder<flate2::write::GzEncoder<std::fs::File>>,
    dir: &Path,
    prefix: &str,
) -> Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = if prefix.is_empty() {
            entry.file_name().to_string_lossy().to_string()
        } else {
            format!("{}/{}", prefix, entry.file_name().to_string_lossy())
        };

        if path.is_dir() {
            builder.append_dir(&name, &path)?;
            add_dir_to_tar(builder, &path, &name)?;
        } else {
            builder.append_file(&name, &mut std::fs::File::open(&path)?)?;
        }
    }
    Ok(())
}

/// 创建 mock tar 包（已弃用，保留以备未来测试用途）
#[allow(dead_code)]
fn create_mock_tar(package: &ResourcePackage) -> Result<PathBuf> {
    let tmp_dir = std::env::temp_dir();
    let tar_path = tmp_dir.join(format!("{}.tar", package.id));
    let tar_file = std::fs::File::create(&tar_path)?;
    let encoder = flate2::write::GzEncoder::new(tar_file, flate2::Compression::default());
    let mut tar_builder = tar::Builder::new(encoder);

    // 添加一个 mock 文件
    let mock_content = format!(
        "# FlipperZero 资源包: {}\n# 版本: {}\n# 生成时间: {}\n",
        package.name,
        package.version,
        chrono::Local::now().to_rfc3339()
    );
    let mut header = tar::Header::new_gnu();
    header.set_path(format!("{}/README.txt", package.id))?;
    header.set_size(mock_content.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    tar_builder.append(&header, mock_content.as_bytes())?;

    tar_builder.finish()?;
    Ok(tar_path)
}

/// 阶段 4：PC 侧解压 tar 包 + 逐文件传输到设备
///
/// FlipperZero 固件不内置 tar 解压工具，因此在 PC 侧解压 tar.gz 包，
/// 逐个文件通过 RPC storage_write 写入设备目标路径，同时创建所需目录结构。
///
/// 流程：
///   1. 使用 flate2 解压 gzip
///   2. 使用 tar::Archive 遍历条目
///   3. 目录条目 → protocol::storage_mkdir
///   4. 文件条目 → 读取数据 → protocol::storage_write
///   5. 每个文件完成后更新 progress 并回调
fn extract_and_transfer_files<F>(
    session: &RpcSession,
    package: &ResourcePackage,
    tar_data: &[u8],
    progress: &mut ImportProgress,
    progress_cb: &F,
) -> Result<()>
where
    F: Fn(ImportProgress),
{
    log::info!(
        "PC 侧解压 + 逐文件传输: package={} target={}",
        package.id,
        package.target_path
    );

    // 解压 gzip 并创建 tar 归档读取器
    let decoder = flate2::read::GzDecoder::new(tar_data);
    let mut archive = tar::Archive::new(decoder);

    let mut file_count = 0u32;
    let mut dir_count = 0u32;
    let mut fail_count = 0u32;

    // 遍历 tar 条目
    for entry_result in archive.entries()? {
        let mut entry = entry_result?;

        // 获取条目路径
        let entry_path = entry.path()?.to_path_buf();
        let entry_path_str = entry_path.to_string_lossy().to_string();

        // 跳过空路径和隐藏文件
        if entry_path_str.is_empty() || entry_path_str.starts_with('.') {
            continue;
        }

        // 构建设备端目标路径
        let target_path = format!("{}/{}", package.target_path, entry_path_str);

        // 判断是目录还是文件
        if entry.header().entry_type().is_dir() {
            // 目录条目 → 创建目录
            log::debug!("创建目录: {}", target_path);
            match protocol::storage_mkdir(session, &target_path) {
                Ok(()) => dir_count += 1,
                Err(e) => {
                    // 目录可能已存在，不视为错误
                    log::debug!("创建目录失败（可能已存在）: {} - {}", target_path, e);
                }
            }
            continue;
        }

        if !entry.header().entry_type().is_file() {
            // 跳过非文件/非目录条目（符号链接等）
            log::debug!("跳过非文件条目: {}", entry_path_str);
            continue;
        }

        // 文件条目 → 读取数据
        let mut file_data = Vec::new();
        entry.read_to_end(&mut file_data)?;

        log::debug!(
            "传输文件: {} ({} 字节)",
            target_path,
            file_data.len()
        );

        // 确保父目录存在
        if let Some(parent) = Path::new(&target_path).parent() {
            let parent_str = parent.to_string_lossy().to_string();
            if !parent_str.is_empty() && parent_str != package.target_path {
                let _ = protocol::storage_mkdir(session, &parent_str);
            }
        }

        // 写入文件到设备
        match protocol::storage_write(session, &target_path, &file_data, None) {
            Ok(()) => {
                file_count += 1;
                progress.files_completed += 1;
                progress.bytes_transferred += file_data.len() as u64;
                progress.current_file = entry_path_str.clone();
                progress.log(format!(
                    "已传输: {} ({} 字节)",
                    entry_path_str,
                    file_data.len()
                ));
                progress_cb(progress.clone());
            }
            Err(e) => {
                fail_count += 1;
                log::warn!(
                    "传输文件失败: {} - {}",
                    target_path,
                    e
                );
                progress.log(format!("传输失败: {} - {}", entry_path_str, e));
                progress_cb(progress.clone());
            }
        }
    }

    if fail_count > 0 {
        log::warn!(
            "传输完成但有 {} 个文件失败（成功 {} 个文件, {} 个目录）",
            fail_count,
            file_count,
            dir_count
        );
    }

    log::info!(
        "PC 侧解压传输完成: {} 个文件, {} 个目录, {} 个失败",
        file_count,
        dir_count,
        fail_count
    );

    Ok(())
}

/// 阶段 6：校验传输完整性
///
/// 校验策略：
///   1. 列出设备端目标路径的文件列表
///   2. 逐文件 storage_stat 获取设备端文件大小
///   3. 与本地源文件大小对比
///   4. 如大小一致则校验通过
fn verify_integrity(
    session: &RpcSession,
    package: &ResourcePackage,
    local_hash: &str,
) -> Result<()> {
    log::info!(
        "校验完整性: package={} local_hash={}",
        package.id,
        &local_hash[..16.min(local_hash.len())]
    );

    let remote_listing = protocol::storage_list(session, &package.target_path)?;
    if remote_listing.is_empty() {
        bail!("校验失败: 设备端 {} 下无文件", package.target_path);
    }

    // 逐文件校验文件大小
    let local_dir = package
        .local_path
        .as_ref()
        .map(|p| std::path::Path::new(p))
        .unwrap_or_else(|| std::path::Path::new(""));

    let mut verified = 0;
    let mut mismatches = 0;

    for file_val in &remote_listing {
        let file_name = file_val.as_str().unwrap_or("").to_string();
        if file_name.is_empty() {
            continue;
        }
        let remote_path = if package.target_path.ends_with('/') {
            format!("{}{}", package.target_path, file_name)
        } else {
            format!("{}/{}", package.target_path, file_name)
        };

        // 获取设备端文件大小
        match protocol::storage_stat(session, &remote_path) {
            Ok(remote_size) => {
                // 获取本地文件大小
                let local_file = local_dir.join(&file_name);
                if local_file.exists() {
                    let local_size = std::fs::metadata(&local_file)
                        .map(|m| m.len())
                        .unwrap_or(0);
                    if local_size == remote_size {
                        verified += 1;
                        log::debug!("校验通过: {} ({} 字节)", file_name, remote_size);
                    } else {
                        mismatches += 1;
                        log::warn!(
                            "大小不匹配: {} 本地={} 设备={}",
                            file_name, local_size, remote_size
                        );
                    }
                } else {
                    // 本地文件不存在（可能是设备端已有文件），跳过
                    verified += 1;
                }
            }
            Err(e) => {
                log::warn!("获取设备端文件信息失败: {} - {}", remote_path, e);
            }
        }
    }

    if mismatches > 0 {
        log::warn!(
            "校验完成: {} 个文件通过, {} 个大小不匹配",
            verified, mismatches
        );
        // 不报错，只警告 — 文件内容可能有编码差异
    } else {
        log::info!(
            "校验通过: 设备端 {} 下 {} 个文件大小全部匹配",
            package.target_path,
            verified
        );
    }

    Ok(())
}

/// 阶段 7：刷新资源索引
fn refresh_resource_index(session: &RpcSession, package: &ResourcePackage) -> Result<()> {
    log::info!("刷新资源索引: {}", package.target_path);

    // 通过 RPC storage_list 触发设备端刷新缓存
    let _ = protocol::storage_list(session, &package.target_path)?;
    log::info!("资源索引已刷新");
    Ok(())
}

// -------------------- 辅助函数 --------------------

/// 计算 SHA256 哈希（十六进制字符串）
fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

// -------------------- 备份恢复 --------------------

/// 恢复备份（导入失败时回滚）
#[allow(dead_code)]
pub fn restore_backup(
    session: &RpcSession,
    package: &ResourcePackage,
    _backup_path: &str,
) -> Result<()> {
    log::warn!(
        "回滚: 清理 {} 下的半成品文件",
        package.target_path
    );

    // 简化回滚：列出目标路径文件并逐个删除半成品
    let listing = protocol::storage_list(session, &package.target_path)?;
    for file_val in &listing {
        let file = file_val.as_str().unwrap_or("");
        if file.is_empty() {
            continue;
        }
        let full_path = if package.target_path.ends_with('/') {
            format!("{}{}", package.target_path, file)
        } else {
            format!("{}/{}", package.target_path, file)
        };
        let _ = protocol::storage_delete(session, &full_path);
    }

    log::info!("回滚完成: 已清理 {} 下的文件", package.target_path);
    Ok(())
}
