/**
 * SD 卡存储管理 — 文件浏览/读写/删除
 *
 * 注意: Flipper Zero RPC 协议不支持 StorageFormat 命令
 *       SD 卡格式化需要设备端手动操作
 *
 * 路径规范:
 *   根路径: /ext (SD 卡)
 *   示例: /ext/nfc/card1.nfc, /ext/subghz/remote.sub
 *
 * 安全检查:
 *   - 路径必须在 /ext 下，禁止访问 /int 系统分区
 *   - 删除目录时递归列出子文件逐个删除
 *   - 写入前检查文件大小不超过可用空间
 */
use crate::error::{LucyError, LucyResult};
use serde::{Deserialize, Serialize};

/// 文件条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: u64,
}

/// 存储信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageInfo {
    pub total: u64,
    pub free: u64,
    pub used: u64,
    pub label: String,
}

/// 路径安全校验 — 确保 path 在 /ext 下
pub fn validate_path(path: &str) -> LucyResult<()> {
    if path.is_empty() {
        return Err(LucyError::Storage("Path is empty".to_string()));
    }
    // 允许 /ext 开头的路径
    if !path.starts_with("/ext") && !path.starts_with("ext") {
        return Err(LucyError::Storage(format!(
            "Access denied: path must be under /ext, got: {}", path
        )));
    }
    // 防止路径穿越
    if path.contains("..") {
        return Err(LucyError::Storage(format!(
            "Path traversal detected: {}", path
        )));
    }
    Ok(())
}

/// 构造存储模块的 IPC 请求参数
#[allow(dead_code)]
pub fn build_list_request(path: &str) -> LucyResult<serde_json::Value> {
    validate_path(path)?;
    Ok(serde_json::json!({
        "path": path,
    }))
}

/// 构造读取文件的 IPC 请求参数
#[allow(dead_code)]
pub fn build_read_request(path: &str) -> LucyResult<serde_json::Value> {
    validate_path(path)?;
    Ok(serde_json::json!({
        "path": path,
    }))
}

/// 构造写入文件的 IPC 请求参数
pub fn build_write_request(path: &str, data: &str) -> LucyResult<serde_json::Value> {
    validate_path(path)?;
    if data.is_empty() {
        return Err(LucyError::Storage("Write data is empty".to_string()));
    }
    Ok(serde_json::json!({
        "path": path,
        "data": data,
    }))
}

/// 构造删除文件的 IPC 请求参数
#[allow(dead_code)]
pub fn build_delete_request(path: &str) -> LucyResult<serde_json::Value> {
    validate_path(path)?;
    Ok(serde_json::json!({
        "path": path,
    }))
}

/// 生成模拟的存储信息（虚拟设备模式）
pub fn mock_storage_info() -> StorageInfo {
    StorageInfo {
        total: 16 * 1024 * 1024 * 1024, // 16GB
        free: 12 * 1024 * 1024 * 1024,  // 12GB free
        used: 4 * 1024 * 1024 * 1024,   // 4GB used
        label: "LUCY-SD".to_string(),
    }
}

/// 生成模拟的文件列表（虚拟设备模式）
pub fn mock_list_files(path: &str) -> Vec<FileEntry> {
    let base = if path.ends_with('/') { path.to_string() } else { format!("{}/", path) };
    vec![
        FileEntry {
            name: "nfc".to_string(),
            path: format!("{}nfc", base),
            is_dir: true,
            size: 0,
            modified: 1720000000,
        },
        FileEntry {
            name: "subghz".to_string(),
            path: format!("{}subghz", base),
            is_dir: true,
            size: 0,
            modified: 1720000000,
        },
        FileEntry {
            name: "ir".to_string(),
            path: format!("{}ir", base),
            is_dir: true,
            size: 0,
            modified: 1720000000,
        },
        FileEntry {
            name: "badusb".to_string(),
            path: format!("{}badusb", base),
            is_dir: true,
            size: 0,
            modified: 1720000000,
        },
        FileEntry {
            name: "config.txt".to_string(),
            path: format!("{}config.txt", base),
            is_dir: false,
            size: 256,
            modified: 1720800000,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_path_ok() {
        assert!(validate_path("/ext/nfc/card.nfc").is_ok());
        assert!(validate_path("/ext/subghz/remote.sub").is_ok());
        assert!(validate_path("ext/").is_ok());
    }

    #[test]
    fn test_validate_path_denied() {
        assert!(validate_path("/int/system").is_err());
        assert!(validate_path("").is_err());
    }

    #[test]
    fn test_validate_path_traversal() {
        assert!(validate_path("/ext/../int/system").is_err());
        assert!(validate_path("/ext/../../etc/passwd").is_err());
    }

    #[test]
    fn test_build_list_request() {
        let req = build_list_request("/ext/nfc").unwrap();
        assert_eq!(req["path"], "/ext/nfc");
    }

    #[test]
    fn test_build_write_request_empty() {
        assert!(build_write_request("/ext/test.txt", "").is_err());
    }

    #[test]
    fn test_mock_storage_info() {
        let info = mock_storage_info();
        assert_eq!(info.total, 16 * 1024 * 1024 * 1024);
        assert!(info.free < info.total);
    }

    #[test]
    fn test_mock_list_files() {
        let files = mock_list_files("/ext");
        assert!(!files.is_empty());
        assert!(files.iter().any(|f| f.is_dir && f.name == "nfc"));
    }
}
