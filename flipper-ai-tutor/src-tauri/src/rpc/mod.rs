// =============================================================================
// rpc/mod.rs - RPC 通信模块入口
// =============================================================================
// 职责：聚合 RPC 相关子模块，定义 RpcSession 会话结构
// 子模块：
//   - protocol: Protobuf RPC 协议实现（与 FlipperZero 串口通信）
//   - stream:   屏幕镜像流（128x64 单色帧）
//
// FlipperZero RPC 协议概述：
//   - 基于 Protobuf 编码的消息帧，通过 USB CDC 串口传输
//   - 每帧结构: [0x55][seq][payload_len(2byte LE)][payload][checksum]
//   - payload 为 Protobuf 编码的 PB_Main 消息
//   - 支持的命令: start_session / stop_session / storage_list /
//     storage_write / storage_read / storage_stat / storage_info /
//     storage_format / system_get_info / device_info / gui_start_screen_stream /
//     gui_send_input / system_reboot 等
//
// 并发控制：
//   - RPC 会话使用 parking_lot::Mutex 保护串口访问
//   - 传输期间独占串口，避免并发读写冲突
// =============================================================================

pub mod protocol;
pub mod stream;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// -------------------- RPC 会话 --------------------

/// RPC 会话，封装串口连接与会话标识
///
/// 使用 Arc<Mutex<Box<dyn SerialPort>>> 保证线程安全的串口访问。
/// 会话建立后，所有 RPC 命令通过此会话发送。
#[derive(Clone)]
pub struct RpcSession {
    /// 串口连接（线程安全共享）
    pub port: Arc<Mutex<Box<dyn serialport::SerialPort>>>,
    /// 会话序列号（用于 RPC 帧的 seq 字段，u8 单字节）
    pub seq: Arc<Mutex<u8>>,
    /// 会话 ID（start_session 返回的 session_id）
    pub session_id: Arc<Mutex<u32>>,
    /// 端口名称
    pub port_name: String,
    /// 会话是否活跃
    pub active: Arc<Mutex<bool>>,
}

impl std::fmt::Debug for RpcSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RpcSession")
            .field("port_name", &self.port_name)
            .field("session_id", &self.session_id.lock())
            .field("active", &self.active.lock())
            .finish()
    }
}

impl RpcSession {
    /// 获取下一个序列号（自增，溢出回绕，u8 单字节）
    pub fn next_seq(&self) -> u8 {
        let mut seq = self.seq.lock();
        let current = *seq;
        *seq = seq.wrapping_add(1);
        current
    }

    /// 会话是否活跃
    pub fn is_active(&self) -> bool {
        *self.active.lock()
    }
}

// -------------------- RPC 通用响应 --------------------

/// RPC 命令状态码（与 FlipperZero 固件定义一致）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RpcStatus {
    Ok = 0,
    Error = 1,
    ErrorStorageNotReady = 2,
    ErrorStorageInternal = 3,
    ErrorStorageNotExists = 4,
    ErrorStorageBusy = 5,
    ErrorStorageInvalidParameter = 6,
    ErrorStorageDenied = 7,
    ErrorStorageAlreadyExists = 8,
    ErrorInvalidParameters = 9,
    ErrorOverflow = 10,
    ErrorTimeout = 11,
}

impl RpcStatus {
    /// 从整数解析状态码
    pub fn from_u32(code: u32) -> Self {
        match code {
            0 => Self::Ok,
            1 => Self::Error,
            2 => Self::ErrorStorageNotReady,
            3 => Self::ErrorStorageInternal,
            4 => Self::ErrorStorageNotExists,
            5 => Self::ErrorStorageBusy,
            6 => Self::ErrorStorageInvalidParameter,
            7 => Self::ErrorStorageDenied,
            8 => Self::ErrorStorageAlreadyExists,
            9 => Self::ErrorInvalidParameters,
            10 => Self::ErrorOverflow,
            11 => Self::ErrorTimeout,
            _ => Self::Error,
        }
    }

    /// 转为人类可读描述
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Ok => "成功",
            Self::Error => "通用错误",
            Self::ErrorStorageNotReady => "存储未就绪",
            Self::ErrorStorageInternal => "存储内部错误",
            Self::ErrorStorageNotExists => "路径不存在",
            Self::ErrorStorageBusy => "存储忙",
            Self::ErrorStorageInvalidParameter => "参数无效",
            Self::ErrorStorageDenied => "访问被拒",
            Self::ErrorStorageAlreadyExists => "已存在",
            Self::ErrorInvalidParameters => "RPC 参数无效",
            Self::ErrorOverflow => "溢出",
            Self::ErrorTimeout => "超时",
        }
    }
}

// -------------------- RPC 通信常量 --------------------

/// 串口波特率（FlipperZero USB CDC 固定为 115200，实际不限速）
pub const BAUD_RATE: u32 = 115200;

/// 串口读写超时（毫秒）
pub const READ_TIMEOUT_MS: u64 = 2000;
pub const WRITE_TIMEOUT_MS: u64 = 2000;

/// 帧起始标志
pub const FRAME_MARKER: u8 = 0x55;

/// 单帧最大 payload 大小（64KB）
pub const MAX_PAYLOAD_SIZE: usize = 64 * 1024;
