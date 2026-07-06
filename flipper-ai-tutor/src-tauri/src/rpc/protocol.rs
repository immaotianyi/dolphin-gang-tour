// =============================================================================
// rpc/protocol.rs — FlipperZero Protobuf RPC 协议实现（真实 PB_Main 编解码）
// =============================================================================
// 职责：
//   1. 通过 prost 编解码真实的 PB_Main Protobuf 消息
//   2. 帧格式：[0x55][seq:u8][len:u16 LE][PB_Main payload][checksum:u8]
//      - seq 为 1 字节 u8（非 u16）
//      - checksum = payload 各字节求和 & 0xFF（非异或）
//   3. 实现 start_session / system_get_info / system_reboot / storage_list /
//      storage_write / storage_read / storage_info / storage_stat 等核心命令
//   4. 流式响应处理（DeviceInfo / PowerInfo 通过 has_next 分多条发送）
//
// PB_Main 结构（flipper.proto）：
//   message Main {
//     uint32 command_id = 1;       // 命令 ID（对应 oneof 标签号）
//     CommandStatus command_status = 2;  // 状态码（i32 枚举）
//     bool has_next = 3;           // 是否有后续帧（流式响应）
//     oneof content { ... }        // 具体命令内容
//   }
//   注意：PB_Main 中没有 session_id 字段（旧代码错误地假设 tag 3 是 session_id）
//
// 参考：
//   - https://github.com/flipperdevices/flipperzero-protobuf
//   - https://github.com/flipperdevices/flipperzero-firmware/tree/dev/lib/rpc
// =============================================================================

use crate::device::{DeviceInfo, FirmwareType};
use crate::rpc::{FRAME_MARKER, MAX_PAYLOAD_SIZE, READ_TIMEOUT_MS};
use anyhow::{anyhow, bail, Result};
use prost::Message;
use serde_json::Value;
use std::io::Write;
use std::sync::Arc;
use std::time::{Duration, Instant};

// 重新导出 RpcSession
pub use crate::rpc::RpcSession;

// -------------------- 引入 prost 生成的 Protobuf 模块 --------------------
// prost-build 在 OUT_DIR 下生成 pb.rs / pb_system.rs / pb_storage.rs / pb_gui.rs
// 交叉包引用通过 super::super:: 解析（pb::main::Content → super::super::pb_system）

/// PB 包：Main, CommandStatus, Empty, StopSession
pub mod pb {
    include!(concat!(env!("OUT_DIR"), "/pb.rs"));
}

/// PB_System 包：PingRequest/Response, RebootRequest, DeviceInfoRequest/Response, PowerInfoRequest/Response
pub mod pb_system {
    include!(concat!(env!("OUT_DIR"), "/pb_system.rs"));
}

/// PB_Storage 包：ListRequest/Response, WriteRequest, ReadRequest/Response, InfoRequest/Response, StatRequest/Response 等
pub mod pb_storage {
    include!(concat!(env!("OUT_DIR"), "/pb_storage.rs"));
}

/// PB_Gui 包：StartScreenStreamRequest, StopScreenStreamRequest, ScreenFrame, SendInputEventRequest
pub mod pb_gui {
    include!(concat!(env!("OUT_DIR"), "/pb_gui.rs"));
}

/// PB_App 包：Application 相关命令（pb.proto 中 Main.content 引用）
pub mod pb_app {
    include!(concat!(env!("OUT_DIR"), "/pb_app.rs"));
}

/// PB_Gpio 包：GPIO 相关命令
pub mod pb_gpio {
    include!(concat!(env!("OUT_DIR"), "/pb_gpio.rs"));
}

/// PB_Property 包：属性读写命令
pub mod pb_property {
    include!(concat!(env!("OUT_DIR"), "/pb_property.rs"));
}

/// PB_Desktop 包：桌面状态命令
pub mod pb_desktop {
    include!(concat!(env!("OUT_DIR"), "/pb_desktop.rs"));
}

// -------------------- RPC 命令 ID（对应 oneof 标签号） --------------------

/// RPC 命令 ID，值与 flipper.proto 中 oneof content 的标签号一致
///
/// 特殊情况：
///   - StartSession (0) 和 StopSession (1) 的 command_id 不等于 oneof 标签
///     StartSession 使用 content=Empty (tag 4)，但 command_id=0
///     StopSession 使用 content=StopSession (tag 19)，但 command_id=1
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RpcCommandId {
    StartSession = 0,
    StopSession = 1,
    StorageList = 7,
    StorageRead = 9,
    StorageWrite = 11,
    StorageDelete = 12,
    StorageMkdir = 13,
    StorageStat = 24,
    StorageInfo = 28,
    SystemReboot = 31,
    SystemDeviceInfo = 32,
    GuiStartScreenStream = 20,
    GuiStopScreenStream = 21,
    GuiScreenFrame = 22,
    GuiSendInput = 23,
    SystemPowerInfo = 44,
}

impl RpcCommandId {
    pub fn as_u32(&self) -> u32 {
        *self as u32
    }
}

// -------------------- RebootMode 枚举 --------------------

/// 设备重启模式，对应 PB_System.RebootRequest.mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RebootMode {
    /// 正常重启到 OS
    Os = 0,
    /// 重启到 DFU 模式
    Dfu = 1,
    /// 重启并执行固件更新（/update/firmware.fuf）
    Update = 2,
}

impl RebootMode {
    fn as_i32(&self) -> i32 {
        *self as i32
    }
}

// -------------------- 帧编解码 --------------------

/// 计算 payload 的校验和
///
/// FlipperZero RPC 协议使用**求和校验**（非异或）：
///   checksum = (sum of all payload bytes) & 0xFF
fn checksum(data: &[u8]) -> u8 {
    let sum: u64 = data.iter().map(|&b| b as u64).sum();
    (sum & 0xFF) as u8
}

/// 将 PB_Main 消息编码为完整的 RPC 帧
///
/// 帧格式：[0x55][seq:u8][len:u16 LE][PB_Main Protobuf payload][checksum:u8]
fn encode_frame(seq: u8, payload: &[u8]) -> Result<Vec<u8>> {
    if payload.len() > MAX_PAYLOAD_SIZE {
        bail!(
            "payload 过大: {} bytes (最大 {})",
            payload.len(),
            MAX_PAYLOAD_SIZE
        );
    }

    let mut buf = Vec::with_capacity(payload.len() + 5);
    buf.push(FRAME_MARKER);                                        // 0x55
    buf.push(seq);                                                  // seq: u8
    buf.extend_from_slice(&(payload.len() as u16).to_le_bytes());  // len: u16 LE
    buf.extend_from_slice(payload);                                 // PB_Main payload
    buf.push(checksum(payload));                                    // checksum: u8
    Ok(buf)
}

/// 从串口读取并解码一帧
///
/// 读取流程：
///   1. 逐字节读取直到匹配 FRAME_MARKER（0x55）
///   2. 读取 1 字节 seq
///   3. 读取 2 字节 payload_len（小端 u16）
///   4. 读取 payload_len 字节 payload
///   5. 读取 1 字节 checksum 并校验
///
/// 返回 (seq, payload)，payload 为 PB_Main 的 Protobuf 编码字节
fn decode_frame(port: &mut dyn serialport::SerialPort) -> Result<(u8, Vec<u8>)> {
    // 1. 同步帧头
    let mut byte = [0u8; 1];
    loop {
        port.read_exact(&mut byte)?;
        if byte[0] == FRAME_MARKER {
            break;
        }
        // 非 0x55 字节，可能是上一帧残留或噪声，跳过
    }

    // 2. 读取 seq（1 字节 u8）
    let mut seq_buf = [0u8; 1];
    port.read_exact(&mut seq_buf)?;
    let seq = seq_buf[0];

    // 3. 读取 payload 长度（2 字节小端 u16）
    let mut len_buf = [0u8; 2];
    port.read_exact(&mut len_buf)?;
    let payload_len = u16::from_le_bytes(len_buf) as usize;

    if payload_len > MAX_PAYLOAD_SIZE {
        bail!("payload 长度异常: {} (最大 {})", payload_len, MAX_PAYLOAD_SIZE);
    }

    // 4. 读取 payload
    let mut payload = vec![0u8; payload_len];
    port.read_exact(&mut payload)?;

    // 5. 读取并校验 checksum
    let mut cs_buf = [0u8; 1];
    port.read_exact(&mut cs_buf)?;
    let expected_cs = checksum(&payload);
    if cs_buf[0] != expected_cs {
        bail!(
            "checksum 校验失败: 期望 {:#04x} 实际 {:#04x}",
            expected_cs,
            cs_buf[0]
        );
    }

    Ok((seq, payload))
}

// -------------------- 状态码辅助 --------------------

/// 将 CommandStatus 数值转为可读名称
fn status_name(code: i32) -> &'static str {
    match code {
        0 => "OK",
        1 => "ERROR",
        2 => "ERROR_DECODE",
        3 => "ERROR_NOT_IMPLEMENTED",
        4 => "ERROR_BUSY",
        5 => "ERROR_STORAGE_NOT_READY",
        6 => "ERROR_STORAGE_EXIST",
        7 => "ERROR_STORAGE_NOT_EXIST",
        8 => "ERROR_STORAGE_INVALID_PARAMETER",
        9 => "ERROR_STORAGE_DENIED",
        10 => "ERROR_STORAGE_INVALID_NAME",
        11 => "ERROR_STORAGE_INTERNAL",
        12 => "ERROR_STORAGE_NOT_IMPLEMENTED",
        13 => "ERROR_STORAGE_ALREADY_OPEN",
        14 => "ERROR_CONTINUOUS_COMMAND_INTERRUPTED",
        15 => "ERROR_INVALID_PARAMETERS",
        16 => "ERROR_APP_CANT_START",
        17 => "ERROR_APP_SYSTEM_LOCKED",
        _ => "UNKNOWN",
    }
}

/// 检查 PB_Main 响应的 command_status 是否为 OK
fn check_status(main: &pb::Main) -> Result<()> {
    if main.command_status != pb::CommandStatus::Ok as i32 {
        bail!(
            "RPC 错误: {} (code={})",
            status_name(main.command_status),
            main.command_status
        );
    }
    Ok(())
}

// -------------------- 核心 RPC 函数 --------------------

/// 构建请求 PB_Main 消息
fn build_main(command_id: u32, content: pb::main::Content) -> pb::Main {
    pb::Main {
        command_id,
        command_status: pb::CommandStatus::Ok as i32,
        has_next: false,
        content: Some(content),
    }
}

/// 发送 PB_Main 消息（不等待响应）
///
/// 用于屏幕流的停止命令和虚拟按键（fire-and-forget）
pub fn rpc_send(session: &RpcSession, main: &pb::Main) -> Result<()> {
    if !session.is_active() {
        bail!("RPC 会话未激活");
    }

    let seq = session.next_seq();
    let mut payload = Vec::new();
    main.encode(&mut payload)
        .map_err(|e| anyhow!("Protobuf 编码失败: {e}"))?;

    let frame = encode_frame(seq, &payload)?;

    let mut port = session.port.lock();
    port.write_all(&frame)
        .map_err(|e| anyhow!("发送 RPC 帧失败: {e}"))?;
    port.flush()
        .map_err(|e| anyhow!("刷新串口失败: {e}"))?;

    log::debug!(
        "RPC 发送: seq={} command_id={} payload_len={}",
        seq,
        main.command_id,
        payload.len()
    );
    Ok(())
}

/// 读取一帧 PB_Main 消息（阻塞，使用串口默认超时）
///
/// 用于屏幕流读取设备推送的 ScreenFrame
pub fn rpc_recv(session: &RpcSession) -> Result<pb::Main> {
    let mut port = session.port.lock();
    let deadline = Instant::now() + Duration::from_millis(READ_TIMEOUT_MS);

    loop {
        if Instant::now() > deadline {
            bail!("RPC 读取超时（{}ms）", READ_TIMEOUT_MS);
        }

        match decode_frame(&mut **port) {
            Ok((seq, payload)) => {
                log::debug!(
                    "RPC 接收: seq={} payload_len={}",
                    seq,
                    payload.len()
                );
                let main = pb::Main::decode(payload.as_slice())
                    .map_err(|e| anyhow!("PB_Main 解码失败: {e}"))?;
                return Ok(main);
            }
            Err(e) => {
                log::trace!("读取帧异常: {e}");
                return Err(e);
            }
        }
    }
}

/// 读取一帧 PB_Main 消息（带自定义超时，超时返回 None）
///
/// 用于屏幕流的非阻塞读取（设置短超时，避免长时间占用串口锁）
pub fn rpc_recv_timeout(session: &RpcSession, timeout_ms: u64) -> Result<Option<pb::Main>> {
    let mut port = session.port.lock();

    // 设置短超时
    port.set_timeout(Duration::from_millis(timeout_ms))
        .map_err(|e| anyhow!("设置串口超时失败: {e}"))?;

    let result = decode_frame(&mut **port);

    // 恢复默认超时
    let _ = port.set_timeout(Duration::from_millis(READ_TIMEOUT_MS));

    match result {
        Ok((seq, payload)) => {
            log::debug!(
                "RPC 接收(timeout): seq={} payload_len={}",
                seq,
                payload.len()
            );
            let main = pb::Main::decode(payload.as_slice())
                .map_err(|e| anyhow!("PB_Main 解码失败: {e}"))?;
            Ok(Some(main))
        }
        Err(e) => {
            log::trace!("rpc_recv_timeout: {e}");
            Ok(None)
        }
    }
}

/// 发送 PB_Main 请求并等待匹配 seq 的响应（不检查状态码）
fn rpc_send_recv_raw(session: &RpcSession, main: pb::Main) -> Result<pb::Main> {
    if !session.is_active() {
        bail!("RPC 会话未激活");
    }

    let seq = session.next_seq();
    let mut payload = Vec::new();
    main.encode(&mut payload)
        .map_err(|e| anyhow!("Protobuf 编码失败: {e}"))?;

    let frame = encode_frame(seq, &payload)?;

    let mut port = session.port.lock();
    port.write_all(&frame)
        .map_err(|e| anyhow!("发送 RPC 帧失败: {e}"))?;
    port.flush()
        .map_err(|e| anyhow!("刷新串口失败: {e}"))?;

    log::debug!(
        "RPC 请求: seq={} command_id={}",
        seq,
        main.command_id
    );

    let deadline = Instant::now() + Duration::from_millis(READ_TIMEOUT_MS);
    loop {
        if Instant::now() > deadline {
            bail!("RPC 响应超时（{}ms）", READ_TIMEOUT_MS);
        }

        match decode_frame(&mut **port) {
            Ok((resp_seq, resp_payload)) => {
                if resp_seq == seq {
                    let resp = pb::Main::decode(resp_payload.as_slice())
                        .map_err(|e| anyhow!("PB_Main 解码失败: {e}"))?;
                    log::debug!(
                        "RPC 响应: seq={} command_id={} status={}",
                        seq,
                        resp.command_id,
                        status_name(resp.command_status)
                    );
                    return Ok(resp);
                }
                log::trace!(
                    "非匹配帧 seq={} (期望 {})，忽略",
                    resp_seq,
                    seq
                );
            }
            Err(e) => {
                log::trace!("读取响应帧异常: {e}");
            }
        }
    }
}

/// 发送 PB_Main 请求并等待响应（检查状态码，返回非 OK 时报错）
pub fn rpc_send_recv(session: &RpcSession, main: pb::Main) -> Result<pb::Main> {
    let resp = rpc_send_recv_raw(session, main)?;
    check_status(&resp)?;
    Ok(resp)
}

/// 发送 PB_Main 请求并收集流式响应（通过 has_next 分多条发送）
///
/// 用于 SystemDeviceInfo 和 SystemPowerInfo（设备分多条发送 key-value 对）
fn rpc_send_recv_stream(session: &RpcSession, main: pb::Main) -> Result<Vec<pb::Main>> {
    if !session.is_active() {
        bail!("RPC 会话未激活");
    }

    let seq = session.next_seq();
    let mut payload = Vec::new();
    main.encode(&mut payload)
        .map_err(|e| anyhow!("Protobuf 编码失败: {e}"))?;

    let frame = encode_frame(seq, &payload)?;

    let mut port = session.port.lock();
    port.write_all(&frame)
        .map_err(|e| anyhow!("发送 RPC 帧失败: {e}"))?;
    port.flush()
        .map_err(|e| anyhow!("刷新串口失败: {e}"))?;

    log::debug!(
        "RPC 流式请求: seq={} command_id={}",
        seq,
        main.command_id
    );

    let mut responses = Vec::new();
    // 流式响应给 10 秒超时
    let deadline = Instant::now() + Duration::from_millis(READ_TIMEOUT_MS * 5);

    loop {
        if Instant::now() > deadline {
            bail!("RPC 流式响应超时");
        }

        match decode_frame(&mut **port) {
            Ok((resp_seq, resp_payload)) => {
                if resp_seq == seq {
                    let resp = pb::Main::decode(resp_payload.as_slice())
                        .map_err(|e| anyhow!("PB_Main 解码失败: {e}"))?;
                    check_status(&resp)?;
                    let has_next = resp.has_next;
                    responses.push(resp);
                    if !has_next {
                        log::debug!(
                            "RPC 流式响应完成: seq={} 共 {} 条",
                            seq,
                            responses.len()
                        );
                        return Ok(responses);
                    }
                } else {
                    log::trace!(
                        "流式读取: 非匹配帧 seq={} (期望 {})",
                        resp_seq,
                        seq
                    );
                }
            }
            Err(e) => {
                log::trace!("读取流式响应帧异常: {e}");
            }
        }
    }
}

// -------------------- 兼容接口：rpc_call（供 stream.rs 过渡使用） --------------------

/// 兼容旧 API 的 rpc_call（已弃用，新代码应直接使用 rpc_send_recv / rpc_send / rpc_recv）
///
/// 接受 command_id 和原始 payload，内部构建 PB_Main 并发送。
/// 空 payload 时使用 Empty content；非空 payload 时尝试解码为 PB_Main。
#[allow(dead_code)]
pub fn rpc_call(
    session: &RpcSession,
    command_id: RpcCommandId,
    payload: Vec<u8>,
) -> Result<Vec<u8>> {
    let main = if payload.is_empty() {
        build_main(
            command_id.as_u32(),
            pb::main::Content::Empty(pb::Empty {}),
        )
    } else {
        // 尝试将 payload 解码为 PB_Main（兼容模式）
        match pb::Main::decode(payload.as_slice()) {
            Ok(decoded) => decoded,
            Err(_) => {
                log::warn!(
                    "rpc_call: 无法解码 payload 为 PB_Main, command_id={:?}",
                    command_id
                );
                build_main(
                    command_id.as_u32(),
                    pb::main::Content::Empty(pb::Empty {}),
                )
            }
        }
    };

    let resp = rpc_send_recv(session, main)?;
    let mut buf = Vec::new();
    resp.encode(&mut buf)
        .map_err(|e| anyhow!("Protobuf 编码失败: {e}"))?;
    Ok(buf)
}

// -------------------- 会话管理 --------------------

/// 建立 RPC 会话
///
/// 流程：
///   1. 以 115200 波特率打开串口
///   2. 发送 StartSession 请求（command_id=0, content=Empty）
///   3. 验证响应状态
///   4. 返回 RpcSession
pub fn start_session(port_name: &str) -> Result<RpcSession> {
    log::info!("正在打开串口: {} @ 115200", port_name);

    let port = serialport::new(port_name, crate::rpc::BAUD_RATE)
        .timeout(Duration::from_millis(READ_TIMEOUT_MS))
        .open()
        .map_err(|e| anyhow!("打开串口 {} 失败: {e}", port_name))?;

    let session = RpcSession {
        port: Arc::new(parking_lot::Mutex::new(port)),
        seq: Arc::new(parking_lot::Mutex::new(1)),
        session_id: Arc::new(parking_lot::Mutex::new(0)),
        port_name: port_name.to_string(),
        active: Arc::new(parking_lot::Mutex::new(true)),
    };

    // 发送 StartSession 请求
    log::info!("发送 start_session 请求...");
    let main = build_main(0, pb::main::Content::Empty(pb::Empty {}));
    let _resp = rpc_send_recv(&session, main)?;

    log::info!("RPC 会话已建立");
    Ok(session)
}

/// 停止 RPC 会话
pub fn stop_session(session: &RpcSession) -> Result<()> {
    if !session.is_active() {
        return Ok(());
    }
    log::info!("停止 RPC 会话...");
    let main = build_main(1, pb::main::Content::StopSession(pb::StopSession {}));
    let _ = rpc_send_recv(session, main);
    *session.active.lock() = false;
    Ok(())
}

// -------------------- 系统命令 --------------------

/// 获取设备完整信息（SystemDeviceInfo + SystemPowerInfo + StorageInfo）
///
/// 返回 DeviceInfo 结构，包含：
///   - 硬件名称、固件版本、固件类型、API Level（来自 DeviceInfo）
///   - 电池电量、电压、充电状态（来自 PowerInfo）
///   - SD 卡容量、可用空间（来自 StorageInfo）
pub fn system_get_info(session: &RpcSession) -> Result<DeviceInfo> {
    log::debug!("RPC: system_get_info");

    // 1. 获取设备基本信息（流式 key-value 响应）
    let main = build_main(
        32, // SystemDeviceInfo
        pb::main::Content::SystemDeviceInfoRequest(pb_system::DeviceInfoRequest {}),
    );
    let responses = rpc_send_recv_stream(session, main)?;

    // 收集所有 key-value 对
    let mut info_pairs: Vec<(String, String)> = Vec::new();
    for resp in responses {
        if let Some(pb::main::Content::SystemDeviceInfoResponse(info)) = &resp.content {
            info_pairs.push((info.key.clone(), info.value.clone()));
        }
    }
    log::debug!("DeviceInfo 收到 {} 个键值对", info_pairs.len());

    // 2. 获取电源信息（流式 key-value 响应）
    let mut power_pairs: Vec<(String, String)> = Vec::new();
    let power_main = build_main(
        44, // SystemPowerInfo
        pb::main::Content::SystemPowerInfoRequest(pb_system::PowerInfoRequest {}),
    );
    match rpc_send_recv_stream(session, power_main) {
        Ok(power_responses) => {
            for resp in power_responses {
                if let Some(pb::main::Content::SystemPowerInfoResponse(info)) = &resp.content {
                    power_pairs.push((info.key.clone(), info.value.clone()));
                }
            }
            log::debug!("PowerInfo 收到 {} 个键值对", power_pairs.len());
        }
        Err(e) => {
            log::warn!("获取 PowerInfo 失败: {e}，使用默认值");
        }
    }

    // 3. 获取 SD 卡信息
    let (sd_inserted, sd_total, sd_free) = match get_storage_info_raw(session) {
        Ok((total, free)) => (true, total, free),
        Err(e) => {
            log::warn!("获取 StorageInfo 失败: {e}，SD 卡可能未插入");
            (false, 0u64, 0u64)
        }
    };

    // 4. 组装 DeviceInfo
    let info = assemble_device_info(&info_pairs, &power_pairs, sd_inserted, sd_total, sd_free);

    log::info!(
        "设备信息: name={} firmware={} battery={}%",
        info.name,
        info.firmware_version,
        info.battery_level
    );

    Ok(info)
}

/// 获取存储信息原始数据（内部使用）
fn get_storage_info_raw(session: &RpcSession) -> Result<(u64, u64)> {
    let main = build_main(
        28, // StorageInfo
        pb::main::Content::StorageInfoRequest(pb_storage::InfoRequest {
            path: "/".to_string(),
        }),
    );
    let resp = rpc_send_recv(session, main)?;

    if let Some(pb::main::Content::StorageInfoResponse(info)) = resp.content {
        Ok((info.total_space, info.free_space))
    } else {
        bail!("StorageInfo 响应内容缺失");
    }
}

/// 系统重启
///
/// 参数：
///   - Os: 正常重启
///   - Dfu: 重启到 DFU 模式
///   - Update: 重启并执行固件更新（需先传输固件包到 /update/）
pub fn system_reboot(session: &RpcSession, mode: RebootMode) -> Result<()> {
    log::info!("RPC: system_reboot mode={:?}", mode);

    let main = build_main(
        31, // SystemReboot
        pb::main::Content::SystemRebootRequest(pb_system::RebootRequest {
            mode: mode.as_i32(),
        }),
    );

    // 重启命令可能不会收到响应（设备直接重启），所以忽略错误
    match rpc_send_recv_raw(session, main) {
        Ok(_) => {
            log::info!("重启指令已确认");
        }
        Err(e) => {
            // 重启后串口断开是正常的
            log::debug!("重启后串口断开（预期行为）: {e}");
        }
    }

    *session.active.lock() = false;
    Ok(())
}

/// 进入 DFU 模式（便捷封装）
pub fn enter_dfu(session: &RpcSession) -> Result<()> {
    system_reboot(session, RebootMode::Dfu)
}

/// 正常重启（便捷封装）
pub fn reboot(session: &RpcSession) -> Result<()> {
    system_reboot(session, RebootMode::Os)
}

// -------------------- 存储命令 --------------------

/// 列出指定路径下的文件和目录
///
/// 返回 JSON 数组，每项包含 name / type(file|dir) / size
pub fn storage_list(session: &RpcSession, path: &str) -> Result<Vec<Value>> {
    log::debug!("RPC: storage_list path={}", path);

    let main = build_main(
        7, // StorageList
        pb::main::Content::StorageListRequest(pb_storage::ListRequest {
            path: path.to_string(),
            include_md5: false,
            filter_max_size: 0,
        }),
    );

    // ListResponse 可能分多条发送（has_next=true）
    let responses = rpc_send_recv_stream(session, main)?;

    let mut files = Vec::new();
    for resp in responses {
        if let Some(pb::main::Content::StorageListResponse(list_resp)) = resp.content {
            for file in &list_resp.file {
                let file_type = if file.r#type == pb_storage::file::FileType::Dir as i32 {
                    "dir"
                } else {
                    "file"
                };
                files.push(serde_json::json!({
                    "name": file.name,
                    "type": file_type,
                    "size": file.size,
                }));
            }
        }
    }

    log::debug!("storage_list: 共 {} 项", files.len());
    Ok(files)
}

/// 写入文件到设备（支持大文件分片传输）
///
/// 协议：
///   - 第一条消息：path 设为目标路径，file.data 包含首块数据，has_next=true
///   - 后续消息：path 为空，file.data 包含数据块，has_next=true
///   - 最后消息：path 为空，file.data 包含末块数据，has_next=false
///
/// 参数：
///   - session: RPC 会话
///   - path: 设备上的目标路径（如 /ext/apps_data/test.txt）
///   - data: 文件数据
///   - progress_cb: 进度回调 (written_bytes, total_bytes)
pub fn storage_write(
    session: &RpcSession,
    path: &str,
    data: &[u8],
    progress_cb: Option<&dyn Fn(u64, u64)>,
) -> Result<()> {
    log::info!("RPC: storage_write path={} bytes={}", path, data.len());

    // 分片大小：4KB（与 qFlipper 一致，固件缓冲区支持 8KB）
    const CHUNK_SIZE: usize = 4 * 1024;

    let total = data.len() as u64;
    let mut written: u64 = 0;

    for (idx, chunk) in data.chunks(CHUNK_SIZE).enumerate() {
        let is_first = idx == 0;
        let has_next = (written as usize + chunk.len()) < data.len();

        let write_req = pb_storage::WriteRequest {
            // 仅第一条消息设置 path，后续消息 path 为空（proto3 默认值不编码）
            path: if is_first { path.to_string() } else { String::new() },
            file: Some(pb_storage::File {
                r#type: pb_storage::file::FileType::File as i32,
                name: String::new(),
                size: if is_first { total as u32 } else { 0 },
                data: chunk.to_vec(),
                md5sum: String::new(),
            }),
        };

        let main = pb::Main {
            command_id: 11, // StorageWrite
            command_status: pb::CommandStatus::Ok as i32,
            has_next,
            content: Some(pb::main::Content::StorageWriteRequest(write_req)),
        };

        rpc_send_recv(session, main)?;

        written += chunk.len() as u64;
        if let Some(cb) = progress_cb {
            cb(written, total);
        }

        log::trace!(
            "storage_write 进度: {}/{} ({:.1}%)",
            written,
            total,
            if total > 0 {
                written as f64 / total as f64 * 100.0
            } else {
                100.0
            }
        );
    }

    log::info!("RPC: storage_write 完成");
    Ok(())
}

/// 读取设备上的文件
///
/// 返回文件全部内容字节
pub fn storage_read(session: &RpcSession, path: &str) -> Result<Vec<u8>> {
    log::debug!("RPC: storage_read path={}", path);

    let main = build_main(
        9, // StorageRead
        pb::main::Content::StorageReadRequest(pb_storage::ReadRequest {
            path: path.to_string(),
        }),
    );

    // ReadResponse 分多条发送（has_next=true）
    let responses = rpc_send_recv_stream(session, main)?;

    let mut data = Vec::new();
    for resp in responses {
        if let Some(pb::main::Content::StorageReadResponse(read_resp)) = resp.content {
            if let Some(file) = read_resp.file {
                data.extend_from_slice(&file.data);
            }
        }
    }

    log::debug!("RPC: storage_read 完成，共 {} 字节", data.len());
    Ok(data)
}

/// 查询存储信息（返回 JSON，兼容 sd_card.rs 期望的格式）
///
/// JSON 结构：
///   { "sd_card": { "inserted": bool, "format": "FAT32", "cluster_size": 32768,
///                  "total_bytes": u64, "free_bytes": u64, "label": "", "serial": "" } }
pub fn storage_info(session: &RpcSession) -> Result<Value> {
    log::debug!("RPC: storage_info");

    let main = build_main(
        28, // StorageInfo
        pb::main::Content::StorageInfoRequest(pb_storage::InfoRequest {
            path: "/".to_string(),
        }),
    );

    match rpc_send_recv_raw(session, main) {
        Ok(resp) => {
            if let Some(pb::main::Content::StorageInfoResponse(info)) = resp.content {
                // Flipper RPC StorageInfoResponse 仅返回 total_space 和 free_space
                // format/cluster_size/label/serial 不在 RPC 协议中，标注为 "unknown"
                // sd_card.rs 可通过 storage_stat 和文件系统探测补充部分信息
                Ok(serde_json::json!({
                    "sd_card": {
                        "inserted": true,
                        "format": "unknown",
                        "cluster_size": 0,
                        "total_bytes": info.total_space,
                        "free_bytes": info.free_space,
                        "label": null,
                        "serial": null
                    }
                }))
            } else {
                Ok(serde_json::json!({
                    "sd_card": {
                        "inserted": false,
                        "format": "unknown",
                        "cluster_size": 0,
                        "total_bytes": 0,
                        "free_bytes": 0
                    }
                }))
            }
        }
        Err(e) => {
            // SD 卡未插入或存储未就绪
            log::warn!("storage_info 失败: {e}");
            Ok(serde_json::json!({
                "sd_card": {
                    "inserted": false,
                    "format": "unknown",
                    "cluster_size": 0,
                    "total_bytes": 0,
                    "free_bytes": 0
                }
            }))
        }
    }
}

/// 查询文件/目录统计信息
pub fn storage_stat(session: &RpcSession, path: &str) -> Result<Value> {
    log::debug!("RPC: storage_stat path={}", path);

    let main = build_main(
        24, // StorageStat
        pb::main::Content::StorageStatRequest(pb_storage::StatRequest {
            path: path.to_string(),
        }),
    );

    let resp = rpc_send_recv(session, main)?;

    if let Some(pb::main::Content::StorageStatResponse(stat)) = resp.content {
        if let Some(file) = stat.file {
            let file_type = if file.r#type == pb_storage::file::FileType::Dir as i32 {
                "dir"
            } else {
                "file"
            };
            return Ok(serde_json::json!({
                "type": file_type,
                "size": file.size,
                "name": file.name,
            }));
        }
    }

    Ok(serde_json::json!({ "type": "unknown", "size": 0 }))
}

/// 格式化 SD 卡
///
/// 注意：FlipperZero RPC 协议中没有 StorageFormat 命令。
/// SD 卡格式化需要在设备端操作：设置 → 存储 → 格式化 SD 卡
/// 或取出 SD 卡在电脑上格式化为 FAT32（32KB 簇）
pub fn storage_format(
    _session: &RpcSession,
    _fs_type: &str,
    _cluster_size: u32,
) -> Result<Value> {
    bail!("SD 卡格式化通过 RPC 不支持，请在设备端操作：设置 → 存储 → 格式化 SD 卡，或取出 SD 卡在电脑上格式化为 FAT32（32KB 簇）")
}

/// 创建目录
pub fn storage_mkdir(session: &RpcSession, path: &str) -> Result<()> {
    log::debug!("RPC: storage_mkdir path={}", path);
    let main = build_main(
        13, // StorageMkdir
        pb::main::Content::StorageMkdirRequest(pb_storage::MkdirRequest {
            path: path.to_string(),
        }),
    );
    let _ = rpc_send_recv(session, main)?;
    Ok(())
}

/// 删除文件或目录
pub fn storage_delete(session: &RpcSession, path: &str) -> Result<()> {
    log::debug!("RPC: storage_delete path={}", path);
    let main = build_main(
        12, // StorageDelete
        pb::main::Content::StorageDeleteRequest(pb_storage::DeleteRequest {
            path: path.to_string(),
            recursive: false,
        }),
    );
    let _ = rpc_send_recv(session, main)?;
    Ok(())
}

/// 重命名/移动文件
#[allow(dead_code)]
pub fn storage_rename(session: &RpcSession, old_path: &str, new_path: &str) -> Result<()> {
    log::debug!("RPC: storage_rename {} -> {}", old_path, new_path);
    let main = build_main(
        30, // StorageRename
        pb::main::Content::StorageRenameRequest(pb_storage::RenameRequest {
            old_path: old_path.to_string(),
            new_path: new_path.to_string(),
        }),
    );
    let _ = rpc_send_recv(session, main)?;
    Ok(())
}

// -------------------- DeviceInfo 组装 --------------------

/// 从 DeviceInfo 和 PowerInfo 键值对组装 DeviceInfo 结构
fn assemble_device_info(
    info_pairs: &[(String, String)],
    power_pairs: &[(String, String)],
    sd_inserted: bool,
    sd_total: u64,
    sd_free: u64,
) -> DeviceInfo {
    // 从键值对中提取值
    let get = |key: &str| -> Option<&str> {
        info_pairs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    };

    let get_power = |key: &str| -> Option<&str> {
        power_pairs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    };

    // 设备名称：优先 device.name，其次 hardware.name
    let name = get("device.name")
        .or_else(|| get("hardware.name"))
        .unwrap_or("Flipper Zero")
        .to_string();

    // 固件版本
    let firmware_version = get("firmware.version")
        .unwrap_or("unknown")
        .to_string();

    // 固件类型：从 firmware.branch 推断
    let firmware_type = detect_firmware_type(
        get("firmware.branch").unwrap_or(""),
    );

    // API Level
    let api_level = get("firmware.api")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0);

    // 硬件版本
    let hardware_version = get("hardware.target")
        .unwrap_or("f7")
        .to_string();

    // 电池信息
    let is_charging = get_power("charge")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let battery_voltage = get_power("voltage")
        .and_then(|v| v.parse::<f32>().ok())
        .map(|mv| mv / 1000.0) // mV → V
        .unwrap_or(0.0);

    // 电池百分比：优先 level 字段，否则从电压估算
    let battery_level = get_power("level")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or_else(|| estimate_battery_level(battery_voltage));

    // dolphin level（FlipperZero 海豚等级，固件可能不返回）
    let dolphin_level = get("dolphin.level")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(1);

    DeviceInfo {
        name,
        firmware_version,
        firmware_type,
        api_level,
        hardware_version,
        battery_level,
        battery_voltage,
        is_charging,
        sd_card_inserted: sd_inserted,
        sd_card_total_bytes: sd_total,
        sd_card_free_bytes: sd_free,
        sd_card_format: if sd_inserted { "FAT32".to_string() } else { "unknown".to_string() },
        dolphin_level,
    }
}

/// 从固件分支名推断固件类型
fn detect_firmware_type(branch: &str) -> FirmwareType {
    let b = branch.to_lowercase();
    if b.contains("momentum") {
        FirmwareType::Momentum
    } else if b.contains("unleashed") || b.contains("darkflipper") {
        FirmwareType::Unleashed
    } else if b.contains("roguemaster") {
        FirmwareType::Roguemaster
    } else if b.contains("official") || b.contains("release") || b.contains("dev") {
        FirmwareType::Ofw
    } else {
        FirmwareType::Unknown
    }
}

/// 从电压估算电池百分比（近似值）
///
/// FlipperZero 使用 3.7V 锂电池：
///   4.2V = 100%
///   3.7V ≈ 20%
///   3.3V = 0%
fn estimate_battery_level(voltage: f32) -> u32 {
    if voltage <= 0.0 {
        return 0;
    }
    let pct = ((voltage - 3.3) / (4.2 - 3.3) * 100.0).round() as i32;
    pct.clamp(0, 100) as u32
}

// -------------------- 兼容函数（供旧代码引用） --------------------

/// 生成 mock 设备信息（仅用于无设备连接时的测试）
#[allow(dead_code)]
fn parse_device_info_mock(_resp: &[u8]) -> DeviceInfo {
    DeviceInfo {
        name: "Flipper Zero (Mock)".to_string(),
        firmware_version: "0.1.3-mock".to_string(),
        firmware_type: FirmwareType::Ofw,
        api_level: 1,
        hardware_version: "f7".to_string(),
        battery_level: 78,
        battery_voltage: 3.92,
        is_charging: false,
        sd_card_inserted: true,
        sd_card_total_bytes: 8 * 1024 * 1024 * 1024,
        sd_card_free_bytes: 6 * 1024 * 1024 * 1024,
        sd_card_format: "FAT32".to_string(),
        dolphin_level: 1,
    }
}
