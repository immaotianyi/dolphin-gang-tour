// =============================================================================
// rpc/stream.rs - 屏幕镜像流模块（真实 PB_Main Protobuf 实现）
// =============================================================================
// 职责：
//   1. 通过 RPC GuiStartScreenStream 命令启动屏幕流
//   2. 持续接收 128x64 单色帧数据（1bit per pixel）
//   3. 将帧转换为前端可用的 ScreenMirrorFrame 结构
//   4. 提供发送虚拟按键的能力（GuiSendInputEventRequest）
//
// FlipperZero 屏幕流协议：
//   - 发送 GuiStartScreenStreamRequest（command_id=20）后，设备持续推送帧
//   - 每帧为 PB_Gui.ScreenFrame { data: bytes, orientation: enum }
//   - data 字段为 1024 字节位图（128*64/8），每字节 8 像素
//   - 帧率约 10-30fps，使用 rpc_recv_timeout(200ms) 非阻塞读取
//   - 停止时发送 GuiStopScreenStreamRequest（command_id=21）
//
// 虚拟按键协议：
//   - 发送 GuiSendInputEventRequest（command_id=23）
//   - key: InputKey 枚举（Up=0, Down=1, Right=2, Left=3, Ok=4, Back=5）
//   - type: InputType 枚举（Press=0, Release=1, Short=2, Long=3, Repeat=4）
// =============================================================================

use crate::rpc::protocol::{pb, pb_gui, rpc_send, rpc_recv_timeout, rpc_send_recv, RpcSession};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

// -------------------- 屏幕帧结构 --------------------

/// 屏幕镜像帧，与前端 ScreenMirrorFrame 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenMirrorFrame {
    pub width: u32,
    pub height: u32,
    /// 位图数据，1bit per pixel，0=灭 1=亮
    /// 长度 = width * height / 8
    pub data: Vec<u8>,
    /// 帧时间戳（毫秒）
    pub timestamp: u64,
}

/// 屏幕尺寸常量（FlipperZero 固定 128x64）
pub const SCREEN_WIDTH: u32 = 128;
pub const SCREEN_HEIGHT: u32 = 64;
/// 单帧字节数（128*64/8）
pub const FRAME_BYTES: usize = (SCREEN_WIDTH * SCREEN_HEIGHT / 8) as usize;

// -------------------- 虚拟按键 --------------------

/// FlipperZero 按键类型
///
/// 注意：枚举值与 pb_gui::InputKey 一致
/// Up=0, Down=1, Right=2, Left=3, Ok=4, Back=5
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum FlipperKey {
    Up,
    Down,
    Left,
    Right,
    Ok,
    Back,
}

impl FlipperKey {
    /// 从字符串解析按键
    pub fn from_str(s: &str) -> Result<Self> {
        match s.to_uppercase().as_str() {
            "UP" => Ok(Self::Up),
            "DOWN" => Ok(Self::Down),
            "LEFT" => Ok(Self::Left),
            "RIGHT" => Ok(Self::Right),
            "OK" => Ok(Self::Ok),
            "BACK" => Ok(Self::Back),
            other => Err(anyhow!("未知按键: {}", other)),
        }
    }

    /// 转为 pb_gui::InputKey 枚举值
    pub fn as_input_key(&self) -> pb_gui::InputKey {
        match self {
            Self::Up => pb_gui::InputKey::Up,
            Self::Down => pb_gui::InputKey::Down,
            Self::Left => pb_gui::InputKey::Left,
            Self::Right => pb_gui::InputKey::Right,
            Self::Ok => pb_gui::InputKey::Ok,
            Self::Back => pb_gui::InputKey::Back,
        }
    }
}

// -------------------- 屏幕流句柄 --------------------

/// 屏幕流句柄，用于持续读取帧
pub struct ScreenStream {
    session: RpcSession,
    /// 是否已停止
    stopped: bool,
    /// 帧计数
    frame_count: u64,
}

impl ScreenStream {
    /// 启动屏幕流
    ///
    /// 发送 GuiStartScreenStreamRequest（command_id=20），设备开始持续推送帧
    pub fn start(session: &RpcSession) -> Result<Self> {
        log::info!("启动屏幕镜像流...");

        let main = pb::Main {
            command_id: 20, // GuiStartScreenStream
            command_status: pb::CommandStatus::Ok as i32,
            has_next: false,
            content: Some(pb::main::Content::GuiStartScreenStreamRequest(
                pb_gui::StartScreenStreamRequest {},
            )),
        };

        // 发送请求并等待确认响应
        let _ = rpc_send_recv(session, main)?;

        log::info!("屏幕流已启动");
        Ok(Self {
            session: session.clone(),
            stopped: false,
            frame_count: 0,
        })
    }

    /// 读取下一帧
    ///
    /// 返回：
    ///   - Ok(Some(frame)): 成功读取一帧
    ///   - Ok(None): 暂无帧可读（超时或非屏幕帧消息）
    ///   - Err(e): 读取错误
    pub fn next_frame(&mut self) -> Result<Option<ScreenMirrorFrame>> {
        if self.stopped {
            return Ok(None);
        }

        // 使用 200ms 超时读取帧（设备以 10-30fps 推送，200ms 足够）
        match rpc_recv_timeout(&self.session, 200) {
            Ok(Some(main)) => {
                // 检查是否为 GuiScreenFrame 响应
                if let Some(pb::main::Content::GuiScreenFrame(frame)) = &main.content {
                    self.frame_count += 1;
                    let screen_frame = parse_screen_frame(&frame.data)?;

                    log::trace!(
                        "屏幕帧 #{}: {}x{} bytes={}",
                        self.frame_count,
                        screen_frame.width,
                        screen_frame.height,
                        screen_frame.data.len()
                    );

                    Ok(Some(screen_frame))
                } else {
                    // 不是屏幕帧消息（可能是其他 RPC 响应），忽略
                    log::trace!(
                        "非屏幕帧消息: command_id={} status={}",
                        main.command_id,
                        main.command_status
                    );
                    Ok(None)
                }
            }
            Ok(None) => {
                // 超时，无帧可读
                Ok(None)
            }
            Err(e) => {
                log::trace!("读取屏幕帧失败: {e}");
                Ok(None)
            }
        }
    }

    /// 停止屏幕流
    ///
    /// 发送 GuiStopScreenStreamRequest（command_id=21），fire-and-forget
    pub fn stop(&mut self) -> Result<()> {
        if self.stopped {
            return Ok(());
        }
        log::info!("停止屏幕镜像流...");
        self.stopped = true;

        let main = pb::Main {
            command_id: 21, // GuiStopScreenStream
            command_status: pb::CommandStatus::Ok as i32,
            has_next: false,
            content: Some(pb::main::Content::GuiStopScreenStreamRequest(
                pb_gui::StopScreenStreamRequest {},
            )),
        };

        // 停止命令使用 fire-and-forget（不等待响应）
        let _ = rpc_send(&self.session, &main);

        log::info!("屏幕流已停止，共接收 {} 帧", self.frame_count);
        Ok(())
    }
}

impl Drop for ScreenStream {
    fn drop(&mut self) {
        if !self.stopped {
            let _ = self.stop();
        }
    }
}

// -------------------- 顶层便捷接口 --------------------

/// 启动屏幕镜像流（供 IPC 命令调用）
pub fn start_screen_stream(session: &RpcSession) -> Result<ScreenStream> {
    ScreenStream::start(session)
}

/// 发送虚拟按键到设备
///
/// 参数：
///   - session: RPC 会话
///   - key_str: 按键名称（up/down/left/right/ok/back）
///
/// 协议：发送 GuiSendInputEventRequest（command_id=23），使用 Short 类型
pub fn send_virtual_key(session: &RpcSession, key_str: &str) -> Result<()> {
    log::info!("发送虚拟按键: {}", key_str);
    let key = FlipperKey::from_str(key_str)?;

    let main = pb::Main {
        command_id: 23, // GuiSendInput
        command_status: pb::CommandStatus::Ok as i32,
        has_next: false,
        content: Some(pb::main::Content::GuiSendInputEventRequest(
            pb_gui::SendInputEventRequest {
                key: key.as_input_key() as i32,
                r#type: pb_gui::InputType::Short as i32,
            },
        )),
    };

    // 按键命令使用 fire-and-forget（不等待响应，避免阻塞屏幕流）
    rpc_send(session, &main)?;

    log::debug!("虚拟按键已发送: {:?}", key);
    Ok(())
}

// -------------------- 帧解析 --------------------

/// 解析屏幕帧
///
/// 从 PB_Gui.ScreenFrame.data 提取位图数据
/// data 为 1024 字节位图，每字节 8 像素，MSB 在前
fn parse_screen_frame(data: &[u8]) -> Result<ScreenMirrorFrame> {
    if data.is_empty() {
        log::warn!("屏幕帧数据为空");
        return Ok(ScreenMirrorFrame {
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
            data: vec![0u8; FRAME_BYTES],
            timestamp: chrono::Local::now().timestamp_millis() as u64,
        });
    }

    if data.len() < FRAME_BYTES {
        log::warn!(
            "屏幕帧数据不足: {}/{} 字节，不足部分补零",
            data.len(),
            FRAME_BYTES
        );
        let mut frame_data = vec![0u8; FRAME_BYTES];
        frame_data[..data.len()].copy_from_slice(data);
        return Ok(ScreenMirrorFrame {
            width: SCREEN_WIDTH,
            height: SCREEN_HEIGHT,
            data: frame_data,
            timestamp: chrono::Local::now().timestamp_millis() as u64,
        });
    }

    // 取前 FRAME_BYTES 字节作为位图数据
    let frame_data = data[..FRAME_BYTES].to_vec();

    Ok(ScreenMirrorFrame {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        data: frame_data,
        timestamp: chrono::Local::now().timestamp_millis() as u64,
    })
}

// -------------------- 帧转换辅助 --------------------

/// 将 1bit 位图转换为 8bit 灰度 RGBA 数据（供前端 Canvas 使用）
#[allow(dead_code)]
pub fn frame_to_rgba(frame: &ScreenMirrorFrame) -> Vec<u8> {
    let mut rgba = Vec::with_capacity((frame.width * frame.height * 4) as usize);
    for y in 0..frame.height {
        for x in 0..frame.width {
            let byte_idx = (y * frame.width + x) / 8;
            let bit_idx = 7 - (x % 8) as usize;
            let on = if (byte_idx as usize) < frame.data.len() {
                (frame.data[byte_idx as usize] >> bit_idx) & 1 == 1
            } else {
                false
            };
            // FlipperZero 屏幕：亮=橙色(255,138,24)，灭=深色(20,20,20)
            let (r, g, b) = if on { (255, 138, 24) } else { (20, 20, 20) };
            rgba.extend_from_slice(&[r, g, b, 255]);
        }
    }
    rgba
}
