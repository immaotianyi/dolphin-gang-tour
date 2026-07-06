# FlipperZero AI Tutor — Windows 端接手提示词

> 将此文件完整粘贴给 Windows 环境的 AI 助手（如 TRAE / Cursor / Copilot），即可接手 Windows 平台剩余开发任务。

---

## 一、你的角色

你是一名 Rust + Tauri 跨平台桌面应用开发者。你正在接手 **FlipperZero AI Tutor** 项目的 Windows 平台适配工作。该项目在 macOS 上完成了全部核心功能和虚拟设备模拟器，但有 3 个 Windows 平台专属任务需要在 Windows 环境上实现和测试。

---

## 二、项目概况

- **项目名**：FlipperZero AI Tutor
- **技术栈**：Tauri 2.0 + React 18 + TypeScript + Rust
- **GitHub 仓库**：https://github.com/immaotianyi/flipperzero-ai-tutor
- **工作目录**：`flipper-ai-tutor/src-tauri/`（Rust 后端）
- **构建命令**：`cargo build`（后端）/ `npm run build`（前端）/ `npx tauri dev`（开发模式）
- **编译状态**：macOS 上 `cargo build` + `npm run build` 零错误零警告

---

## 三、你需要完成的 3 个任务

### 任务 1：Windows 驱动自动检测（SetupAPI）

**文件**：`src-tauri/src/device/driver.rs`

**当前状态**：`query_current_driver_windows` 函数返回 `"unknown"`，`get_driver_status` 的 Windows 分支返回"无法自动检测"。

**目标**：用 Windows SetupAPI 查询 Flipper Zero 设备当前安装的驱动名称。

**关键信息**：
- Flipper Zero USB 标识：VID=`0x0483`，PID=`0x5740`（正常模式）/ PID=`0xDF11`（DFU 模式）
- `Cargo.toml` 已声明依赖：`windows = { version = "0.58", features = ["Win32_Devices_DeviceAndDriverInstallation", "Win32_Foundation"] }`
- 需要用 `SetupDiGetClassDevs` + `SetupDiEnumDeviceInfo` + `SetupDiGetDeviceRegistryProperty` 遍历设备节点
- 通过 VID/PID 匹配 Flipper Zero 设备
- 读取 `SPDRP_DRIVER` 或 `SPDRP_DEVICEDESC` 属性获取驱动名称

**需要实现的函数**：
```rust
#[cfg(target_os = "windows")]
fn query_current_driver_windows(port_name: &str) -> Result<String> {
    // 当前：返回 "unknown"
    // 目标：用 SetupAPI 查询并返回真实驱动名称（如 "ST DFU Driver" / "WinUSB" / "libusbK"）
}
```

**验收标准**：
- 连接 Flipper Zero 正常模式 → 返回类似 "USB Serial Device" 或 "STMicroelectronics Virtual COM Port"
- Flipper Zero 进入 DFU 模式 → 返回类似 "ST DFU Driver" 或 "WinUSB"
- 未连接设备 → 返回 "unknown" 且不 panic

---

### 任务 2：Windows Zadig 驱动替换引导增强

**文件**：`src-tauri/src/device/driver.rs`

**当前状态**：`run_zadig_windows` 返回手动操作引导字符串，没有实际检测 Zadig 是否安装。

**目标**：
1. 检测系统中是否安装了 Zadig（检查常见路径或 PATH）
2. 如果安装了 Zadig，尝试通过命令行启动它并预填充参数
3. 如果未安装，返回下载链接引导

**需要实现的函数**：
```rust
#[cfg(target_os = "windows")]
fn run_zadig_windows(port_name: &str) -> Result<String> {
    // 当前：返回固定引导字符串
    // 目标：
    //   1. 检查 Zadig 是否在 PATH 或常见路径（如 C:\Zadig\zadig.exe）
    //   2. 如果找到，用 Command::new("zadig.exe") 启动（可传 --targets 参数）
    //   3. 如果未找到，返回下载链接 https://zadig.akeo.ie/
}
```

**Zadig CLI 参数**（参考）：
- `zadig.exe --targets "STM32 BootLoader"` — 指定目标设备
- Zadig 主要是 GUI 工具，CLI 支持有限，可以启动 GUI 并让用户完成最后一步

**验收标准**：
- 已安装 Zadig → 启动 Zadig GUI 并返回"已启动 Zadig，请在界面中确认替换为 WinUSB"
- 未安装 Zadig → 返回"请从 https://zadig.akeo.ie/ 下载 Zadig"
- 不假装成功，不返回假数据

---

### 任务 3：随包内置 dfu-util 或自动安装引导

**文件**：`src-tauri/src/firmware/flasher.rs`

**当前状态**：`which_dfu_util` 在未找到 dfu-util 时返回错误信息（含平台安装命令），`get_bundled_dfu_util_path` 返回路径但该路径下没有真实文件。

**目标**（二选一）：

**方案 A（推荐）：自动下载安装 dfu-util**
- 首次使用 DFU 功能时，自动下载 dfu-util 到应用数据目录
- 下载源：`https://github.com/dfu-util/dfu-util/releases` 或镜像
- 下载后校验文件大小/哈希
- 后续直接使用已下载的 dfu-util

**方案 B：随包内置 dfu-util**
- 在 `tauri.conf.json` 的 `bundle.resources` 中添加 dfu-util 二进制
- 从 `https://github.com/dfu-util/dfu-util/releases` 下载 Windows 版 dfu-util.exe
- 放入 `src-tauri/resources/dfu-util.exe`
- `get_bundled_dfu_util_path` 返回的路径应指向打包后的位置

**需要修改的函数**：
```rust
// 方案 A 示例
fn which_dfu_util() -> Result<String> {
    // 1. 检查随包内置路径
    // 2. 检查 PATH
    // 3. 检查应用数据目录是否已下载
    // 4. 如果都没有，自动下载到应用数据目录
    // 5. 返回路径
}
```

**验收标准**：
- Windows 上首次使用 DFU 功能 → 自动下载或引导安装 dfu-util
- 后续使用 → 直接使用已安装的 dfu-util
- macOS/Linux 不受影响（继续用 brew/apt 安装的）

---

## 四、架构上下文

### 4.1 代码结构

```
src-tauri/src/
├── lib.rs                    # IPC 命令入口（所有 #[tauri::command] 函数）
├── device/
│   ├── mod.rs                # 设备模块入口 + DetectedDevice/DeviceInfo 结构体
│   ├── detector.rs           # USB 设备扫描（serialport crate + VID/PID 匹配）
│   ├── driver.rs             # ★ 驱动管理（你要改的文件）
│   ├── sd_card.rs            # SD 卡健康检测
│   └── virtual_flipper.rs    # 虚拟设备模拟器
├── rpc/
│   ├── mod.rs                # RpcSession 结构体（含 port_name 字段）
│   ├── protocol.rs           # Flipper RPC 协议（protobuf 编解码）
│   └── stream.rs             # 屏幕流 / 按键
├── import/
│   └── pipeline.rs           # 资源导入流水线
├── firmware/
│   └── flasher.rs            # ★ 固件刷写（你要改的文件）
└── ai/
    └── sanitizer.rs          # AI 脱敏
```

### 4.2 关键结构体

```rust
// device/mod.rs
pub struct DetectedDevice {
    pub port_name: String,
    pub vid: u16,          // 0x0483
    pub pid: u16,          // 0x5740 正常 / 0xDF11 DFU
    pub mode: DeviceMode,  // Normal / Dfu
    pub friendly_name: String,
    pub connectable: bool,
}

pub enum DeviceMode {
    Normal,
    Dfu,
}

// rpc/mod.rs
pub struct RpcSession {
    pub port: Box<dyn SerialPort>,
    pub port_name: String,
    // ...
}

// device/driver.rs
pub struct DriverStatus {
    pub platform: String,
    pub driver_installed: bool,
    pub driver_name: Option<String>,
    pub needs_update: bool,
}

pub struct DriverInstallResult {
    pub needed: bool,
    pub success: bool,
    pub previous_driver: Option<String>,
    pub installed_driver: Option<String>,
    pub platform: String,
    pub message: String,
}
```

### 4.3 设备扫描流程

```
device_scan (IPC 命令)
  → detector::scan_devices()
    → serialport::available_ports()  枚举所有串口
    → 对每个串口检查 USB VID/PID
    → VID=0x0483 PID=0x5740 → DeviceMode::Normal
    → VID=0x0483 PID=0xDF11 → DeviceMode::Dfu
  → 注入虚拟设备 VIRTUAL
  → 返回 DeviceScanResult { devices, status }
```

### 4.4 编码约定

- **错误处理**：用 `anyhow::Result<T>` + `bail!` / `?` 操作符
- **日志**：用 `log::info!` / `log::warn!` / `log::debug!`
- **序列化**：所有 IPC 返回类型 derive `Serialize`，用 `#[serde(rename_all = "camelCase")]`
- **平台条件编译**：用 `#[cfg(target_os = "windows")]` / `#[cfg(not(target_os = "windows"))]`
- **不返回假数据**：功能未实现时返回 `"unknown"` / `None` / 引导信息，不用 `TODO` 标记，不假装成功

---

## 五、依赖说明

### 5.1 已声明的 Windows 依赖

`Cargo.toml` 第 76-77 行：

```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.58", features = ["Win32_Devices_DeviceAndDriverInstallation", "Win32_Foundation"] }
```

`Win32_Devices_DeviceAndDriverInstallation` feature 包含 SetupAPI 所需的所有函数：
- `SetupDiGetClassDevsW`
- `SetupDiEnumDeviceInfo`
- `SetupDiGetDeviceRegistryPropertyW`
- `SetupDiDestroyDeviceInfoList`

如果需要更多 Windows API，在 `Cargo.toml` 中追加 feature，例如：
```toml
windows = { version = "0.58", features = [
    "Win32_Devices_DeviceAndDriverInstallation",
    "Win32_Foundation",
    "Win32_Devices_Usb",           # USB 设备信息
    "Win32_System_Registry",       # 注册表读取
] }
```

### 5.2 其他关键依赖

| 依赖 | 用途 |
|------|------|
| `serialport = "4.5"` | USB 串口通信 |
| `sysinfo = "0.31"` | 进程检测 |
| `reqwest = "0.12"` (blocking) | GitHub API / HTTP 请求 |
| `prost = "0.13"` | protobuf 编解码 |
| `parking_lot = "0.12"` | 互斥锁 |

---

## 六、构建与测试

### 6.1 构建

```bash
# 后端编译（在 src-tauri/ 目录下）
cargo build

# 前端编译（在 flipper-ai-tutor/ 目录下）
npm install
npm run build

# 开发模式（热重载）
npx tauri dev

# 生产构建
npx tauri build
```

### 6.2 测试验证

**任务 1 测试（驱动检测）**：
1. 连接 Flipper Zero（正常模式）
2. 运行应用 → 诊断工具 → 查看驱动状态
3. 应显示真实驱动名称，而非"无法自动检测"

**任务 2 测试（Zadig 引导）**：
1. Flipper Zero 进入 DFU 模式（按左+右+Back 3 秒）
2. 运行应用 → 固件管理 → DFU 刷写
3. 如果未安装 Zadig → 应显示下载链接
4. 如果已安装 Zadig → 应自动启动 Zadig

**任务 3 测试（dfu-util）**：
1. 不预装 dfu-util
2. 运行应用 → 固件管理 → DFU 刷写
3. 应自动下载或引导安装 dfu-util
4. 安装后 DFU 刷写功能可用

### 6.3 编译要求

- `cargo build` 零错误零警告
- `npm run build` 零错误
- 所有平台条件编译正确（macOS/Linux 代码不能被破坏）

---

## 七、注意事项

1. **不要修改 macOS/Linux 代码**：你的修改只在 `#[cfg(target_os = "windows")]` 块内
2. **不要返回假数据**：功能未完成时返回 `"unknown"` / `None` / 引导信息
3. **不要用 `TODO` 标记**：要么实现，要么返回诚实的 unknown
4. **保持 IPC 接口不变**：前端调用的命令名和参数不能变
5. **测试真机**：驱动检测和 DFU 刷写必须在真实 Flipper Zero 上测试
6. **提交规范**：commit message 用 `feat(windows): xxx` 格式

---

## 八、参考资源

- [Windows SetupAPI 文档](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/setupapi)
- [windows crate 文档](https://docs.rs/windows/latest/windows/)
- [Zadig 官网](https://zadig.akeo.ie/)
- [dfu-util 下载](https://github.com/dfu-util/dfu-util/releases)
- [Flipper Zero DFU 模式](https://docs.flipperzero.one/basics/firmware-update/firmware-recovery)
- [Tauri 2.0 打包配置](https://v2.tauri.app/reference/config/)

---

## 九、完成后

1. 在 Windows 上运行 `cargo build` + `npm run build` 确认零错误
2. 连接真实 Flipper Zero 测试三个任务
3. `git add -A && git commit -m "feat(windows): SetupAPI 驱动检测 + Zadig 引导 + dfu-util 自动安装"`
4. `git push origin main`
5. 更新 README.md 的"已知限制"章节，将 Windows 相关项标记为已实现
