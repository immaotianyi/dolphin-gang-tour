// =============================================================================
// device/virtual_flipper.rs - 虚拟 Flipper Zero 设备模拟器
// =============================================================================
// 职责：在没有真实硬件的情况下，模拟 Flipper Zero 的 RPC 响应
//
// 原理：
//   - 当 device_connect 收到端口名 "VIRTUAL" 时，不打开串口
//   - 而是在 AppState 中设置 is_virtual_device = true
//   - 所有 RPC 命令在执行前检查该标志，为 true 则走虚拟响应器
//   - 虚拟响应器返回合理的模拟数据（设备信息、SD卡、文件列表等）
//
// 可验证的功能链路：
//   ✅ 设备扫描发现虚拟设备
//   ✅ 设备连接（虚拟握手）
//   ✅ 设备信息读取（虚拟固件版本/电量/SD卡）
//   ✅ SD 卡信息查询
//   ✅ 资源导入（虚拟文件写入 + 列表确认）
//   ✅ 屏幕镜像（虚拟 128x64 帧）
//   ✅ 虚拟按键
//   ❌ 固件刷写（虚拟设备不会真刷固件，但传输链路可测）
// =============================================================================

use crate::device::{DeviceInfo, FirmwareType};
use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::Mutex;

/// 虚拟设备端口名（用于标识虚拟连接）
pub const VIRTUAL_PORT_NAME: &str = "VIRTUAL";

/// 虚拟设备标志（全局，由 device_connect 设置）
static IS_VIRTUAL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// 是否当前处于虚拟设备模式
pub fn is_virtual() -> bool {
    IS_VIRTUAL.load(std::sync::atomic::Ordering::Relaxed)
}

/// 设置虚拟设备模式
pub fn set_virtual(enabled: bool) {
    IS_VIRTUAL.store(enabled, std::sync::atomic::Ordering::Relaxed);
    if enabled {
        log::info!("虚拟设备模式已启用");
    } else {
        log::info!("虚拟设备模式已禁用");
    }
}

// -------------------- 虚拟设备状态 --------------------

/// 虚拟设备内部状态（模拟 SD 卡上的文件系统）
pub struct VirtualFlipper {
    /// 模拟的文件系统：路径 → 文件内容
    pub fs: Arc<Mutex<HashMap<String, Vec<u8>>>>,
    /// 设备信息
    pub device_info: DeviceInfo,
    /// 屏幕帧计数器（用于生成动画）
    pub frame_counter: Arc<Mutex<u32>>,
}

impl VirtualFlipper {
    /// 创建虚拟设备实例
    pub fn new() -> Self {
        let mut fs = HashMap::new();

        // 预填充一些虚拟文件（模拟设备上已有的文件）
        fs.insert(
            "/ext/infrared/tv_sony.ir".to_string(),
            b"Filetype: IR signals file\nVersion: 1\nname: Sony TV\ntype: parsed\nprotocol: SIRC\naddress: 01 00\ncommand: 15 00\n"
                .to_vec(),
        );
        fs.insert(
            "/ext/subghz/door_bell.sub".to_string(),
            b"Filetype: Flipper SubGhz Key File\nVersion: 1\nFrequency: 433920000\nPreset: FuriHalSubGhzPresetOok650Async\nProtocol: Princeton\nBit: 24\nKey: 00 00 00 00 00 95 D5 D4\n"
                .to_vec(),
        );
        fs.insert(
            "/ext/badusb/hello.txt".to_string(),
            b"GUI r\nDELAY 500\nSTRING notepad\nDELAY 500\nENTER\nDELAY 500\nSTRINGLN Hello from Flipper Zero!\n"
                .to_vec(),
        );

        Self {
            fs: Arc::new(Mutex::new(fs)),
            device_info: DeviceInfo {
                name: "Flipper Zero (Virtual)".to_string(),
                firmware_version: "1.2.0-virtual".to_string(),
                firmware_type: FirmwareType::Momentum,
                api_level: 1,
                hardware_version: "f7".to_string(),
                battery_level: 78,
                battery_voltage: 3.85,
                is_charging: true,
                sd_card_inserted: true,
                sd_card_total_bytes: 8 * 1024 * 1024 * 1024, // 8GB
                sd_card_free_bytes: 6 * 1024 * 1024 * 1024,  // 6GB free
                sd_card_format: "FAT32".to_string(),
                dolphin_level: 3,
            },
            frame_counter: Arc::new(Mutex::new(0)),
        }
    }

    /// 获取设备信息
    pub fn get_device_info(&self) -> DeviceInfo {
        self.device_info.clone()
    }

    /// 列出路径下的文件
    pub fn storage_list(&self, path: &str) -> Vec<String> {
        let fs = self.fs.lock();
        let mut results = Vec::new();

        // 简单模拟：找出以 path 开头的文件，返回文件名部分
        let prefix = if path.ends_with('/') { path.to_string() } else { format!("{}/", path) };

        for key in fs.keys() {
            if let Some(rest) = key.strip_prefix(&prefix) {
                // 只返回直接子项（不含子目录中的文件）
                if !rest.contains('/') {
                    results.push(rest.to_string());
                }
            }
        }

        results.sort();
        results
    }

    /// 写入文件到虚拟文件系统
    pub fn storage_write(&self, path: &str, data: Vec<u8>) {
        log::info!("虚拟写入: {} ({} 字节)", path, data.len());

        // 确保父目录存在（虚拟文件系统自动创建）
        let mut fs = self.fs.lock();
        fs.insert(path.to_string(), data);
    }

    /// 读取文件
    pub fn storage_read(&self, path: &str) -> Option<Vec<u8>> {
        let fs = self.fs.lock();
        fs.get(path).cloned()
    }

    /// 删除文件
    pub fn storage_delete(&self, path: &str) -> bool {
        let mut fs = self.fs.lock();
        // 尝试精确删除
        if fs.remove(path).is_some() {
            return true;
        }
        // 尝试删除前缀匹配的所有文件
        let prefix = if path.ends_with('/') { path.to_string() } else { format!("{}/", path) };
        let to_delete: Vec<String> = fs.keys()
            .filter(|k| k.starts_with(&prefix))
            .cloned()
            .collect();
        for key in &to_delete {
            fs.remove(key);
        }
        !to_delete.is_empty()
    }

    /// 创建目录（虚拟文件系统无需真实创建，记录日志即可）
    pub fn storage_mkdir(&self, path: &str) {
        log::info!("虚拟创建目录: {}", path);
    }

    /// 获取文件大小
    pub fn storage_stat(&self, path: &str) -> Option<u64> {
        let fs = self.fs.lock();
        fs.get(path).map(|d| d.len() as u64)
    }

    /// 生成虚拟屏幕帧（128x64 单色位图）
    pub fn generate_screen_frame(&self) -> Vec<u8> {
        let mut counter = self.frame_counter.lock();
        *counter = counter.wrapping_add(1);
        let frame = *counter;

        // 生成一个有动画的 128x64 单色帧（1024 字节 = 128*64/8）
        let mut data = vec![0u8; 1024];

        // 绘制边框
        for x in 0..128 {
            data[x / 8] |= 0x80 >> (x % 8); // 顶行
            data[63 * 16 + x / 8] |= 0x80 >> (x % 8); // 底行
        }
        for y in 0..64 {
            data[y * 16] |= 0x80; // 左列
            data[y * 16 + 15] |= 1; // 右列
        }

        // 绘制移动的点（模拟菜单光标）
        let cursor_y = (frame % 8) as usize;
        let cursor_x = 8;
        for dx in 0..40 {
            let px = cursor_x + dx;
            let byte_idx = cursor_y * 16 + px / 8;
            if byte_idx < data.len() {
                data[byte_idx] |= 0x80 >> (px % 8);
            }
        }

        // 绘制文字区域（模拟菜单项）
        for y in 1..8 {
            let line = y * 16;
            for x in 10..80 {
                // 间隔绘制像素模拟文字
                if (frame / 4 + y as u32) % 3 != 0 {
                    data[line + x / 8] |= 0x80 >> (x % 8);
                }
            }
        }

        // 底部状态栏
        let status_y = 60;
        for x in 2..120 {
            if x % 3 != 0 {
                data[status_y * 16 + x / 8] |= 0x80 >> (x % 8);
            }
        }

        data
    }

    /// 发送虚拟按键（记录日志）
    pub fn send_key(&self, key: &str) {
        log::info!("虚拟按键: {}", key);
        // 改变帧计数器让屏幕产生变化
        let mut counter = self.frame_counter.lock();
        *counter += 2;
    }
}

// -------------------- 全局虚拟设备实例 --------------------

use std::sync::OnceLock;

static VIRTUAL_DEVICE: OnceLock<VirtualFlipper> = OnceLock::new();

/// 获取全局虚拟设备实例
pub fn virtual_device() -> &'static VirtualFlipper {
    VIRTUAL_DEVICE.get_or_init(VirtualFlipper::new)
}

// -------------------- 虚拟 RPC 响应函数 --------------------

/// 虚拟版 system_get_info — 返回模拟设备信息
pub fn virtual_system_get_info() -> DeviceInfo {
    virtual_device().get_device_info()
}

/// 虚拟版 storage_list — 返回模拟文件列表
pub fn virtual_storage_list(path: &str) -> Vec<String> {
    virtual_device().storage_list(path)
}

/// 虚拟版 storage_write — 写入虚拟文件系统
pub fn virtual_storage_write(path: &str, data: &[u8]) {
    virtual_device().storage_write(path, data.to_vec());
}

/// 虚拟版 storage_read — 读取虚拟文件
pub fn virtual_storage_read(path: &str) -> Option<Vec<u8>> {
    virtual_device().storage_read(path)
}

/// 虚拟版 storage_delete — 删除虚拟文件
pub fn virtual_storage_delete(path: &str) -> bool {
    virtual_device().storage_delete(path)
}

/// 虚拟版 storage_mkdir — 创建虚拟目录
pub fn virtual_storage_mkdir(path: &str) {
    virtual_device().storage_mkdir(path);
}

/// 虚拟版 generate_screen_frame — 生成虚拟屏幕帧
pub fn virtual_screen_frame() -> Vec<u8> {
    virtual_device().generate_screen_frame()
}

/// 虚拟版 send_key — 发送虚拟按键
pub fn virtual_send_key(key: &str) {
    virtual_device().send_key(key);
}

/// 虚拟版 storage_info — 返回虚拟 SD 卡信息
pub fn virtual_storage_info() -> (u64, u64) {
    let info = &virtual_device().device_info;
    (info.sd_card_total_bytes, info.sd_card_free_bytes)
}
