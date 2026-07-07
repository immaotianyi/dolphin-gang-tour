// =============================================================================
// import/mod.rs - 资源导入模块入口
// =============================================================================
// 职责：聚合资源导入子模块，定义资源包与进度数据结构
// 子模块：
//   - pipeline: 导入管线（预检→备份→打包→传输→解压→校验→刷新）
//
// 资源类型：
//   firmware / infrared / nfc / subghz / rfid / badusb / tools / games /
//   themes / music / animations
//
// 导入管线设计：
//   1. 预检空间：检查 SD 卡可用空间是否足够
//   2. 备份：备份设备端将被覆盖的同名资源
//   3. tar 打包：将本地资源文件打包为 .tar.gz
//   4. PC 侧解压 + 逐文件传输：在 PC 侧解压 tar.gz，逐个文件通过 RPC storage_write 写入设备
//   5. Hash 校验：校验传输完整性（SHA256）
//   6. 刷新：刷新资源索引
//   注：支持断点续传（checkpoint 机制，当前预留，未来可启用）
// =============================================================================

pub mod pipeline;
pub mod badusb_guard;

use serde::{Deserialize, Serialize};

// -------------------- 资源分类 --------------------

/// 资源分类，与前端 ResourceCategory 对应
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceCategory {
    Firmware,
    Infrared,
    Nfc,
    Subghz,
    Rfid,
    Badusb,
    Tools,
    Games,
    Themes,
    Music,
    Animations,
}

impl ResourceCategory {
    /// 转为设备端目录名
    pub fn device_dir(&self) -> &'static str {
        match self {
            Self::Firmware => "/firmware",
            Self::Infrared => "/ext/infrared",
            Self::Nfc => "/ext/nfc",
            Self::Subghz => "/ext/subghz",
            Self::Rfid => "/ext/lfrfid",
            Self::Badusb => "/ext/badusb",
            Self::Tools => "/ext/apps_data/tools",
            Self::Games => "/ext/apps/Games",
            Self::Themes => "/ext/themes",
            Self::Music => "/ext/apps_data/music_player",
            Self::Animations => "/ext/dolphin",
        }
    }
}

// -------------------- 资源包 --------------------

/// 资源包定义，与前端 ResourcePackage 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePackage {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: ResourceCategory,
    pub size_bytes: u64,
    pub file_count: u32,
    /// 设备端目标路径
    pub target_path: String,
    pub default_checked: bool,
    pub version: String,
    /// 所需最低 API Level
    pub api_level_required: u32,
    /// 本地源路径（如内置资源）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_path: Option<String>,
    /// 下载 URL（如需联网下载）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
}

// -------------------- 导入进度 --------------------

/// 导入阶段，与前端 ImportProgress.phase 对应
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportPhase {
    Idle,
    Backup,
    Packaging,
    Flashing,
    Transferring,
    Extracting,
    Verifying,
    Refreshing,
    Done,
    Error,
}

/// 导入进度，与前端 ImportProgress 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub phase: ImportPhase,
    pub current_file: String,
    pub files_completed: u32,
    pub files_total: u32,
    pub bytes_transferred: u64,
    pub bytes_total: u64,
    pub speed_bytes_per_sec: u64,
    pub eta_seconds: u64,
    pub log_lines: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

impl ImportProgress {
    /// 创建空闲状态的进度
    pub fn idle() -> Self {
        Self {
            phase: ImportPhase::Idle,
            current_file: String::new(),
            files_completed: 0,
            files_total: 0,
            bytes_transferred: 0,
            bytes_total: 0,
            speed_bytes_per_sec: 0,
            eta_seconds: 0,
            log_lines: Vec::new(),
            error_message: None,
        }
    }

    /// 更新进度并添加日志
    pub fn log(&mut self, message: impl Into<String>) {
        let msg = message.into();
        log::info!("[import] {}", msg);
        self.log_lines.push(msg);
        // 限制日志条数
        if self.log_lines.len() > 100 {
            self.log_lines.remove(0);
        }
    }
}

// -------------------- 导入结果摘要 --------------------

/// 导入结果摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub success: bool,
    pub packages_imported: u32,
    pub packages_failed: u32,
    pub files_transferred: u32,
    pub bytes_transferred: u64,
    pub duration_ms: u64,
    pub failed_packages: Vec<String>,
    pub message: String,
}
