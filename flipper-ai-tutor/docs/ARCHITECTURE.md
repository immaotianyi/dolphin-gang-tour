# Dolphin Gang Tour 技术架构文档

> 项目名称：Dolphin Gang Tour（Flipper Zero AI 教学伴侣）
> 技术栈：Tauri 2.0 + Rust + React 18 + TypeScript + Tailwind CSS + Zustand + Protobuf
> 文档版本：v1.0.0
> 更新日期：2026-07-10

---

## 目录

1. [整体架构概述](#1-整体架构概述)
2. [前端架构](#2-前端架构)
3. [后端架构（Rust）](#3-后端架构rust)
4. [IPC 通信层](#4-ipc-通信层)
5. [安全架构](#5-安全架构)
6. [数据持久化](#6-数据持久化)
7. [构建设置与 CI/CD](#7-构建设置与-cicd)
8. [核心模块详解](#8-核心模块详解)
9. [扩展与演进方向](#9-扩展与演进方向)

---

## 1. 整体架构概述

Dolphin Gang Tour 是一款基于 **Tauri 2.0** 的桌面应用，专为 Flipper Zero 设备提供资源管理、固件刷写、AI 教学辅导和虚拟设备模拟等一站式功能。应用采用经典的前后端分离架构，通过 Tauri IPC 进行通信。

### 1.1 架构分层图

```
┌─────────────────────────────────────────────────────────┐
│                     WebView (前端)                       │
│  ┌──────────┐  ┌───────────┐  ┌─────────────────────┐  │
│  │  React   │  │  Zustand  │  │  Tailwind CSS UI    │  │
│  │  组件树  │  │  状态管理  │  │  赛博朋克主题       │  │
│  └────┬─────┘  └─────┬─────┘  └─────────────────────┘  │
│       │              │                                  │
│  ┌────┴──────────────┴─────┐                            │
│  │   Tauri IPC Invoke      │  ←── invoke / event       │
│  └────────────┬────────────┘                            │
└───────────────┼─────────────────────────────────────────┘
                │ IPC (snake_case 命令)
┌───────────────┼─────────────────────────────────────────┐
│               │              Rust 核心 (后端)            │
│  ┌────────────┴────────────┐                            │
│  │   Tauri Command Layer   │  ←── 30+ IPC 命令          │
│  └────────────┬────────────┘                            │
│               │                                         │
│  ┌────────────┴────────────┐  ┌──────────────────────┐ │
│  │     AppState (全局)     │  │  业务模块             │ │
│  │  parking_lot::Mutex     │  │  ├─ device/          │ │
│  │  ├─ device 状态         │  │  ├─ rpc/             │ │
│  │  ├─ rpc_session         │  │  ├─ firmware/        │ │
│  │  ├─ ai_config           │  │  ├─ import/          │ │
│  │  ├─ import_progress     │  │  ├─ ai/              │ │
│  │  ├─ cancel_flags        │  │  └─ diagnostics/     │ │
│  │  └─ achievements        │  │                      │ │
│  └─────────────────────────┘  └──────────────────────┘ │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  串口驱动    │  │  Protobuf    │  │  系统钥匙串   │  │
│  │  serialport  │  │  prost       │  │  keyring      │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
└─────────┼───────────────────────────────────────────────┘
          │ USB Serial
┌─────────┴───────────────────────────────────────────────┐
│               Flipper Zero 设备（硬件）                   │
│         VID: 0x0483 / PID: 0x5740 (Normal)              │
│         VID: 0x0483 / PID: 0xDF11 (DFU)                 │
└─────────────────────────────────────────────────────────┘
```

### 1.2 技术选型说明

| 层级 | 技术 | 选型理由 |
|------|------|---------|
| 桌面框架 | Tauri 2.0 | 比 Electron 更轻量（Rust 内核），包体小，内存占用低 |
| 前端框架 | React 18 + TypeScript | 成熟的生态，类型安全，组件化开发 |
| 构建工具 | Vite + esbuild | 极速 HMR，原生 ESM，构建速度快 |
| 样式方案 | Tailwind CSS | 原子化 CSS，快速构建赛博朋克风格 UI |
| 状态管理 | Zustand | 轻量、简洁、无 Provider 嵌套，性能优异 |
| 后端语言 | Rust | 内存安全，高性能，适合串口/硬件通信 |
| 设备协议 | Protobuf (prost) | Flipper Zero 官方 RPC 协议格式 |
| 异步运行时 | Tokio | Rust 生态最成熟的异步运行时 |
| 密钥存储 | keyring crate | 跨平台系统钥匙串（macOS Keychain / Windows Credential Manager / Linux Secret Service） |

---

## 2. 前端架构

### 2.1 目录结构

```
src/
├── components/          # UI 组件层
│   ├── App.tsx          # 主应用入口（三栏布局 + 路由切换）
│   ├── TitleBar.tsx     # 自定义标题栏
│   ├── DeviceSidebar.tsx    # 左侧设备信息栏
│   ├── AiChat.tsx       # AI 对话面板（主视图）
│   ├── ImportWizard.tsx     # 资源导入向导
│   ├── FirmwareManager.tsx  # 固件管理器
│   ├── DiagnosticPanel.tsx  # 故障诊断面板
│   ├── CourseView.tsx   # 课程学习视图
│   ├── BootScreen.tsx   # 启动动画（赛博朋克风格）
│   ├── LegalWarning.tsx     # 法律警示弹窗
│   ├── UserAgreement.tsx    # 用户协议页面
│   ├── SettingsModal.tsx    # AI 设置弹窗
│   ├── AboutModal.tsx       # 关于弹窗
│   ├── Modal.tsx        # 通用弹窗组件
│   ├── Icon.tsx         # SVG 图标库
│   ├── ScanRadar.tsx    # 扫描雷达动效
│   └── ToastContainer.tsx   # 全局通知容器
├── stores/              # Zustand 状态管理
│   ├── uiStore.ts       # UI 状态（视图切换、弹窗、侧栏）
│   ├── deviceStore.ts   # 设备连接状态
│   ├── chatStore.ts     # AI 对话消息与流式状态
│   ├── importStore.ts   # 资源导入进度
│   ├── firmwareStore.ts     # 固件刷写进度
│   ├── mirrorStore.ts   # 屏幕镜像帧数据
│   ├── gpioStore.ts     # GPIO 引脚状态
│   ├── petStore.ts      # 桌宠状态（进化、心情、属性）
│   ├── achievementStore.ts  # 成就系统
│   ├── themeStore.ts    # 主题设置
│   └── toastStore.ts    # 全局通知
├── hooks/               # 自定义 React Hooks
│   ├── useKeyboardShortcuts.ts   # 全局快捷键
│   ├── useDevice.ts     # 设备操作封装
│   └── useCountdown.ts  # 倒计时 Hook
├── lib/                 # 工具库
│   └── tauri.ts         # Tauri IPC 调用封装
├── data/                # 静态数据
│   ├── courses.ts       # 课程数据（7 门课程）
│   └── resources.ts     # 资源包元数据
├── types/               # TypeScript 类型定义
│   └── index.ts         # 全局类型（IpcResult / Pet / Achievement 等）
├── styles/              # 全局样式
│   ├── globals.css      # 全局样式 + Tailwind 指令
│   └── animations.css   # 动画关键帧
├── main.tsx             # React 入口
└── App.tsx              # 根组件
```

### 2.2 主应用布局

应用采用 **左侧栏 + 主内容区** 的经典双栏布局，主内容区通过 `activeView` 切换五个核心视图。

```
┌───────────────────────────────────────────────┐
│  TitleBar (自定义标题栏 + 工具按钮)            │
├──────────┬────────────────────────────────────┤
│          │                                    │
│  左侧栏  │        主内容区 (activeView)       │
│  260px   │                                    │
│  ┌─────┐ │  ┌───────────────────────────┐    │
│  │设备 │ │  │  AI 对话 / 资源导入 /      │    │
│  │信息 │ │  │  固件管理 / 故障诊断 /     │    │
│  │扫描 │ │  │  课程学习                  │    │
│  └─────┘ │  └───────────────────────────┘    │
│          │                                    │
└──────────┴────────────────────────────────────┘
```

核心布局逻辑定义在 `src/App.tsx` 中：

```tsx
// 视图切换由 uiStore 驱动
const { activeView, openModal, setModal } = useUiStore();

// 主内容区根据 activeView 渲染不同组件
<main className="app-main">
  {activeView === "ai" && <AiChat />}
  {activeView === "import" && <ImportWizard />}
  {activeView === "firmware" && <FirmwareManager />}
  {activeView === "diagnostic" && <DiagnosticPanel />}
  {activeView === "course" && <CourseView />}
</main>
```

### 2.3 启动流程

应用启动时经历三个阶段，确保法律合规与用户体验：

```
BootScreen (开机动画)
    │
    ▼
LegalWarning (法律警示 - 每次启动展示)
    │ 5秒倒计时 + 法律条文 + 免责声明
    ▼
UserAgreement (用户协议 - 首次启动)
    │ 同意后写入 localStorage
    ▼
主界面 (自动扫描设备)
```

### 2.4 状态管理（Zustand）

采用 **多 Store 分治** 策略，每个业务领域一个 Store，避免单一大 Store 带来的复杂性。

| Store | 职责 | 关键状态 |
|-------|------|---------|
| `uiStore` | 视图与弹窗管理 | `activeView`, `openModal`, `sidebarCollapsed`, `stepProgress` |
| `deviceStore` | 设备连接状态 | `connectionState`, `deviceInfo`, `portName` |
| `chatStore` | AI 对话消息 | `messages`, `streaming`, `isLoading` |
| `importStore` | 资源导入进度 | `progress`, `packages` |
| `firmwareStore` | 固件刷写进度 | `flashProgress`, `firmwares` |
| `mirrorStore` | 屏幕镜像 | `currentFrame`, `isMirroring`, `fps` |
| `gpioStore` | GPIO 控制 | `pins`, `otgMode` |
| `petStore` | 桌宠系统 | `pet`, `activities`, `dialogue` |
| `achievementStore` | 成就系统 | `achievements` |
| `toastStore` | 通知系统 | `toasts` |

状态变更通过 Tauri 事件驱动：

```tsx
// 示例：订阅固件刷写进度事件
useEffect(() => {
  const unlisten = await listen("flash-progress", (event) => {
    setFlashProgress(event.payload as FlashProgress);
  });
  return () => unlisten();
}, []);
```

### 2.5 全局快捷键

通过 `useKeyboardShortcuts.ts` Hook 注册全局快捷键：

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + 1~5` | 切换到对应视图（AI/导入/固件/诊断/课程） |
| `Ctrl/Cmd + K` | 循环切换视图 |
| `Ctrl/Cmd + B` | 折叠/展开侧栏 |
| `Ctrl/Cmd + ,` | 打开设置 |
| `?` | 打开帮助面板 |
| `Esc` | 关闭当前弹窗 |
| `Enter` | 发送 AI 消息（输入框聚焦时） |

---

## 3. 后端架构（Rust）

### 3.1 目录结构

```
src-tauri/src/
├── main.rs          # 应用主入口（二进制 crate）
├── lib.rs           # Tauri 库入口（注册命令 + AppState）
├── device/          # 设备检测与通信模块
│   ├── mod.rs       # 模块声明 + 公共类型
│   ├── detector.rs  # USB 设备检测（VID/PID 匹配）
│   ├── driver.rs    # 串口驱动封装 + 驱动安装
│   ├── sd_card.rs   # SD 卡管理（格式化等）
│   └── virtual_flipper.rs   # 虚拟设备模拟器
├── rpc/             # Flipper Zero RPC 协议层
│   ├── mod.rs
│   ├── protocol.rs  # Protobuf 编解码 + 命令封装
│   └── stream.rs    # 串口流处理（屏幕流/按键流）
├── firmware/        # 固件管理
│   ├── mod.rs
│   └── flasher.rs   # 双轨刷写逻辑（RPC / DFU）
├── import/          # 资源导入
│   ├── mod.rs
│   ├── pipeline.rs  # 导入流水线（7 步流程）
│   └── badusb_guard.rs  # BadUSB 安全审查
├── ai/              # AI 模型路由
│   ├── mod.rs
│   ├── router.rs    # 多模型路由 + 流式对话
│   ├── prompt.rs    # Prompt 模板（课程注入）
│   └── sanitizer.rs # 数据脱敏（7 种模式）
└── diagnostics/     # 故障诊断
    └── mod.rs       # 诊断项定义 + 执行引擎
```

### 3.2 全局应用状态（AppState）

`AppState` 是后端的核心状态容器，通过 Tauri 的 `manage()` 机制注入，所有 IPC 命令通过 `State<'_, AppState>` 获取。所有可变状态均使用 `parking_lot::Mutex` 保护，保证线程安全。

```rust
pub struct AppState {
    // 设备状态
    pub device: Arc<Mutex<device::DeviceState>>,
    // RPC 会话（与 Flipper Zero 的串口通信）
    pub rpc_session: Arc<Mutex<Option<rpc::RpcSession>>>,
    // AI 模型配置
    pub ai_config: Arc<Mutex<ai::AiModelConfig>>,
    // 资源导入进度
    pub import_progress: Arc<Mutex<import::ImportProgress>>,
    // 屏幕镜像运行标志
    pub screen_mirror_running: Arc<Mutex<bool>>,
    // 日志缓冲
    pub log_buffer: Arc<Mutex<Vec<String>>>,
    // 取消标志（原子布尔值）
    pub cancel_flash_flag: Arc<AtomicBool>,
    pub cancel_import_flag: Arc<AtomicBool>,
    pub cancel_ai_chat_flag: Arc<AtomicBool>,
    // 成就数据
    pub achievements: Mutex<AchievementData>,
}
```

### 3.3 统一 IPC 响应结构

所有 IPC 命令返回统一的 `IpcResult<T>` 结构，与前端类型一一对应：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcResult<T: Serialize> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

// 命令返回类型：Result<IpcResult<T>, String>
// - Ok(IpcResult::ok(data))  → 业务成功
// - Ok(IpcResult::err(msg))  → 业务失败（前端展示错误消息）
// - Err(string)              → IPC 层错误（Tauri 框架异常）
```

---

## 4. IPC 通信层

### 4.1 命令命名规范

所有 IPC 命令采用 **snake_case** 命名，使用 **前缀分类** 便于识别和管理。

### 4.2 命令清单

#### 设备管理（device_*）

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `device_scan` | 扫描 Flipper Zero 设备 | - | `DeviceScanResult` |
| `device_connect` | 连接设备（建立 RPC 会话） | `port_name: String` | `IpcVoid` |
| `device_disconnect` | 断开设备连接 | - | `IpcVoid` |
| `get_device_info` | 获取设备详细信息 | - | `DeviceInfo` |

#### 驱动 / SD 卡

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `install_driver` | 安装 USB 驱动（Windows） | `force: bool` | `DriverInstallResult` |
| `kill_port_occupier` | 强制结束占用串口的进程 | `port_name: String` | `KillResult` |
| `format_sd_card` | 格式化 SD 卡 | `cluster_size_kb: Option<u32>` | `FormatResult` |

#### 故障诊断

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `diagnose` | 执行全量故障诊断 | - | `Vec<DiagnosticResult>` |
| `apply_diagnostic_fix` | 应用诊断修复 | `action: String` | `String` |

#### 固件管理（firmware_*）

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `list_firmwares` | 列出可用固件列表 | - | `Vec<FirmwareInfo>` |
| `flash_firmware` | 刷写固件（双轨） | `firmware_id`, `firmware_path` | `FlashResult` |
| `cancel_flash` | 取消固件刷写 | - | `IpcVoid` |
| `enter_dfu_mode` | 进入 DFU 模式 | - | `IpcVoid` |

#### 资源导入（import_*）

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `list_resource_packages` | 列出可导入的资源包 | - | `Vec<ResourcePackage>` |
| `import_resources` | 导入资源包到设备 | `package_ids: Vec<String>` | `ImportSummary` |
| `cancel_import` | 取消导入 | - | `IpcVoid` |
| `get_import_progress` | 获取导入进度 | - | `ImportProgress` |

#### AI 对话（ai_*）

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `ai_chat` | AI 文字对话 | `messages`, `course_id` | `ChatResponse` |
| `ai_chat_stream` | AI 流式对话 | `messages`, `course_id` | `String` (messageId) |
| `ai_chat_with_image` | AI 多模态对话 | `messages`, `image_base64` | `ChatResponse` |
| `ai_set_model_config` | 设置 AI 模型配置 | `config: AiModelConfig` | `IpcVoid` |
| `ai_get_model_config` | 获取当前 AI 配置 | - | `AiModelConfig` |
| `ai_get_courses` | 获取 AI 课程列表 | - | `Vec<Course>` |
| `cancel_ai_chat` | 取消 AI 对话 | - | `IpcVoid` |

#### 屏幕镜像

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `start_screen_mirror` | 启动屏幕镜像流 | - | `IpcVoid` |
| `stop_screen_mirror` | 停止屏幕镜像流 | - | `IpcVoid` |
| `send_virtual_key` | 发送虚拟按键 | `key: String` | `IpcVoid` |

#### GPIO 控制（gpio_*）

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `gpio_get_all_pins` | 获取所有引脚状态 | - | `Vec<GpioPinState>` |
| `gpio_set_pin_mode` | 设置引脚模式 | `pin`, `mode` | `IpcVoid` |
| `gpio_write_pin` | 写引脚电平 | `pin`, `value` | `IpcVoid` |
| `gpio_read_pin` | 读引脚电平 | `pin` | `u32` |
| `gpio_get_otg_mode` | 获取 OTG 模式 | - | `String` |
| `gpio_set_otg_mode` | 设置 OTG 模式 | `mode` | `IpcVoid` |

#### 成就系统

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `get_achievements` | 获取全部成就 | - | `Vec<Achievement>` |
| `unlock_achievement` | 解锁指定成就 | `id` | `bool` |
| `update_achievement_progress` | 更新成就进度 | `id`, `progress` | `bool` |

#### 其他

| 命令 | 功能 | 参数 | 返回 |
|------|------|------|------|
| `save_log_dump` | 导出应用日志 | `file_path` | `usize` (行数) |

### 4.3 事件系统

长时间运行的操作通过 Tauri 事件向前端推送进度，前端通过 `listen()` 订阅：

| 事件名 | 触发模块 | 说明 |
|--------|---------|------|
| `flash-progress` | firmware | 固件刷写进度 |
| `import-progress` | import | 资源导入进度 |
| `sd-format-progress` | device/sd_card | SD 卡格式化进度 |
| `screen-mirror-frame` | rpc/stream | 屏幕镜像帧数据 |
| `screen-mirror-error` | rpc/stream | 屏幕镜像错误 |
| `ai-chat-stream` | ai/router | AI 流式响应 token |
| `ai-fallback` | ai/router | AI 降级通知 |

### 4.4 调用约定

```typescript
// 前端调用方式（src/lib/tauri.ts 封装）
import { invoke } from "@tauri-apps/api/core";

// 统一封装：自动解析 IpcResult，失败时抛错
export async function ipcInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const result = await invoke<IpcResult<T>>(command, args);
  if (!result.success) {
    throw new Error(result.error || "Unknown error");
  }
  return result.data as T;
}

// 使用示例
export async function scanDevices() {
  return ipcInvoke<DeviceScanResult>("device_scan");
}
```

---

## 5. 安全架构

Dolphin Gang Tour 在设计时充分考虑了安全风险，构建了 **多层防御体系**。

### 5.1 内容安全策略（CSP）

在 `tauri.conf.json` 中配置严格的 CSP，限制 WebView 可访问的资源来源：

```json
{
  "security": {
    "csp": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.github.com https://raw.githubusercontent.com https://*.flipperzero.one"
  }
}
```

| 指令 | 允许来源 | 说明 |
|------|---------|------|
| `default-src` | `'self'` | 默认只允许同源资源 |
| `img-src` | `'self' data: blob:` | 允许内联图片和 Blob URL |
| `style-src` | `'self' 'unsafe-inline'` | 允许内联样式（Tailwind 运行时需要） |
| `script-src` | `'self'` | 只允许本地脚本，禁止远程脚本 |
| `connect-src` | 有限白名单 | 仅允许 GitHub 和 Flipper Zero 官方域名 |

### 5.2 SSRF 防护

AI 模型和固件下载的 URL 需经过安全校验，防止 SSRF 攻击：

- **内网地址拦截**：禁止 `10.x.x.x`、`172.16-31.x.x`、`192.168.x.x`、`127.x.x.x` 等内网网段
- **云元数据地址拦截**：禁止 `169.254.169.254`（AWS/GCP 元数据服务）
- **协议限制**：仅允许 `https://` 协议
- 实现位置：`ai/router.rs` URL 校验逻辑

### 5.3 API Key 安全存储

使用 `keyring` crate 将 API Key 存储在系统钥匙串中，而非明文落盘：

```
macOS:   Keychain Access
Windows: Credential Manager
Linux:   Secret Service / libsecret
```

实现细节：
- AI 配置文件 `ai_config.json` 中 `api_key` 字段始终为空字符串
- 真实密钥通过 `keyring::Entry::new("com.dolphin-gang-tour.app", "api_key")` 存取
- 配置文件权限设为 `0o600`（仅所有者可读）
- 采用临时文件 + rename 的原子写入方式，避免中途崩溃导致配置损坏

### 5.4 数据脱敏层（7 种模式）

在 AI 对话消息发送到云端模型前，自动扫描并脱敏敏感数据。由 `src-tauri/src/ai/sanitizer.rs` 实现。

| 序号 | 脱敏类型 | 匹配模式 | 替换占位符 |
|------|---------|---------|-----------|
| 1 | 门禁 UID | `UID: 04A3B2C1D2E3` / `0x...` | `[REDACTED:UID]` |
| 2 | NFC 密钥 | `Key A: FFFFFFFFFFFF` | `[REDACTED:KEY]` |
| 3 | WiFi 密码 | `password=xxx` / `PSK="xxx"` | `[REDACTED:WIFI]` |
| 4 | 地理坐标 | `lat=39.9042` / `39°54'15"N` | `[REDACTED:COORD]` |
| 5 | API Key / Token | `sk-xxx` / `Bearer xxx` / `ghp_xxx` / JWT | `[REDACTED:APIKEY]` |
| 6 | 手机号 | 中国大陆 11 位 / 国际号码 | `[REDACTED:PHONE]` |
| 7 | 邮箱 | 标准邮箱格式 | `[REDACTED:EMAIL]` |

脱敏策略：
- **用户消息**：脱敏后追加系统提示，告知用户敏感数据已被处理
- **AI 回复/系统消息**：静默脱敏，不追加提示（避免污染上下文）
- **图片内容**：图片像素内容中的敏感信息无法自动检测，需用户自行注意

### 5.5 BadUSB 沙盒

BadUSB 脚本导入前经过安全审查白名单机制：

- 只允许预设的安全脚本（如 `hello_world.txt`、`draw_heart.txt`）
- 禁止包含危险指令的脚本（如格式化磁盘、删除文件、窃取数据等）
- 审查模块：`src-tauri/src/import/badusb_guard.rs`

### 5.6 tar 路径穿越防护

资源包导入时对 tar/zip 文件进行路径校验：

- 禁止包含 `..` 的文件路径（防止路径穿越）
- 禁止绝对路径（必须在目标目录内）
- 限制单文件大小和总文件数量
- 校验文件扩展名与目标目录是否匹配

### 5.7 日志导出安全

`save_log_dump` 命令对导出路径进行校验：
- 仅允许 `.txt` / `.log` 扩展名
- 禁止路径包含 `..`
- 防止任意文件写入攻击

---

## 6. 数据持久化

### 6.1 持久化分布

```
┌─────────────────────────────────────────────────────┐
│                   持久化存储层                        │
├─────────────┬──────────────────┬────────────────────┤
│   前端层     │     后端配置层    │     系统钥匙串      │
│             │                  │                    │
│ localStorage │  配置目录下 JSON  │  keyring crate    │
│             │                  │                    │
│ • 用户偏好   │  • ai_config.json│  • API Key         │
│ • 桌宠状态   │  • achievements..│                    │
│ • 课程进度   │                  │                    │
│ • 主题设置   │                  │                    │
└─────────────┴──────────────────┴────────────────────┘
```

### 6.2 前端持久化（localStorage）

| 存储项 | Key | 说明 |
|--------|-----|------|
| 用户协议同意 | `dolphin-gang-tour-agreed` | 首次启动同意后记录 |
| 桌宠状态 | `dolphin-pet` | 宠物属性、等级、心情等 |
| 课程进度 | `dolphin-step-progress` | 各课程已完成的步骤 |
| 主题设置 | `dolphin-theme` | 主题偏好 |
| 成就缓存 | `dolphin-achievements` | 已解锁成就缓存 |

### 6.3 后端持久化（配置目录）

使用 `directories` crate 获取系统配置目录：

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/com.dolphin-gang-tour.app/` |
| Windows | `%APPDATA%\dolphin-gang-tour\app\` |
| Linux | `~/.config/app/` |

| 文件 | 说明 | 写入方式 |
|------|------|---------|
| `ai_config.json` | AI 模型配置（不含 API Key） | 原子写入（tmp + rename） |
| `achievements.json` | 成就解锁与进度数据 | 原子写入 |

原子写入流程：
1. 写入到 `xxx.json.tmp` 临时文件
2. 设置文件权限 `0o600`（Unix）
3. `rename` 替换原文件
4. 失败时清理临时文件

### 6.4 日志系统

- 使用 `env_logger` crate
- 日志级别：默认 `info`，可通过环境变量 `RUST_LOG` 调整
- 日志格式：`[时间戳] [级别] 模块 - 消息`
- 内存缓冲：最多 5000 条，可通过 `save_log_dump` 导出到文件

---

## 7. 构建设置与 CI/CD

### 7.1 构建工具链

| 层级 | 工具 | 说明 |
|------|------|------|
| 前端构建 | Vite + esbuild | 极速构建，代码分割，Tree Shaking |
| 后端构建 | Cargo + rustc | Rust 原生构建系统 |
| 打包工具 | Tauri CLI | 跨平台应用打包 |
| Protobuf 编译 | prost-build | build.rs 中编译 .proto 文件 |

### 7.2 前端构建优化

- **代码分割**：Vite 自动按路由分割
- **Minify**：esbuild 压缩（默认开启）
- **资源哈希**：生产构建文件名带哈希，便于缓存
- **目标浏览器**：基于 Vite 默认的现代浏览器目标

### 7.3 Rust 构建优化（Release）

在 `Cargo.toml` 中配置了极致的体积优化：

```toml
[profile.release]
opt-level = "z"       # 优化目标：最小体积
lto = true            # 链接时优化（全程序优化）
codegen-units = 1     # 单代码单元（优化更好，编译更慢）
strip = "symbols"     # 剥离符号表
panic = "abort"       # panic 时直接终止（减少展开代码）
```

### 7.4 CI 流水线（GitHub Actions）

#### CI 检查（ci.yml）

触发条件：`push` 到 main/dev 分支、PR 到 main 分支

```
┌───────────────────────────────────────────────┐
│              CI Workflow                      │
├──────────────────┬────────────────────────────┤
│  Frontend Check  │  Backend Check (Matrix)    │
│  (ubuntu-latest) │  ├─ ubuntu-latest          │
│                  │  ├─ macos-latest           │
│  • npm ci        │  └─ windows-latest         │
│  • tsc --noEmit  │                            │
│  • vite build    │  • cargo check             │
│                  │  • cargo clippy -D warnings│
└──────────────────┴────────────────────────────┘
```

#### Release 构建（release.yml）

触发条件：打 `v*` 标签 / 手动触发

构建矩阵：

| 平台 | 目标三元组 | 输出格式 |
|------|-----------|---------|
| Windows x64 | `x86_64-pc-windows-msvc` | `.msi` / `.nsis.zip` |
| macOS Intel | `x86_64-apple-darwin` | `.dmg` |
| macOS Apple Silicon | `aarch64-apple-darwin` | `.dmg` |
| Linux x64 | `x86_64-unknown-linux-gnu` | `.AppImage` / `.deb` |

发布流程：
1. 使用 `tauri-apps/tauri-action@v0` 官方 Action 构建
2. 自动创建 GitHub Release（草稿模式）
3. 上传各平台安装包到 Release Assets

---

## 8. 核心模块详解

### 8.1 设备检测模块（device/detector.rs）

**功能**：扫描系统串口，识别 Flipper Zero 设备，检测端口占用。

**设备识别规则**：

| VID | PID | 模式 | 可连接 |
|-----|-----|------|--------|
| `0x0483` | `0x5740` | Normal（正常模式） | 是 |
| `0x0483` | `0xDF11` | DFU（固件升级模式） | 否 |

**端口占用检测**：
- 通过 `sysinfo` 遍历系统进程
- 匹配已知占用程序：qflipper、cura、arduino、picocom、screen、minicom 等
- Unix 系统补充 `lsof` 精确检测
- 提供 `kill_port_occupier` 强制结束功能

**状态推断逻辑**：
```
无设备 → NoDevice
有 DFU 设备 → DfuMode
有正常设备 + 有占用进程 → PortBusy
有可连接设备 → Connected
```

### 8.2 RPC 协议模块（rpc/）

**功能**：实现 Flipper Zero 的 Protobuf RPC 协议，与设备进行命令-应答式通信。

**核心组件**：

| 组件 | 文件 | 职责 |
|------|------|------|
| `protocol.rs` | 协议命令封装 | system_get_info / enter_dfu / gpio_* / storage_* 等 |
| `stream.rs` | 流处理 | 屏幕帧流、按键流的持续读取 |
| `RpcSession` | 会话对象 | 持有串口句柄 + 命令序列号 |

**协议栈**：
```
┌─────────────────────────────┐
│   业务命令（RPC Command）    │
│   (System / GPIO / GUI /    │
│    Storage / Application)   │
├─────────────────────────────┤
│   Protobuf 编解码 (prost)   │
│   flipper.proto 定义        │
├─────────────────────────────┤
│   串口帧封装 / 解析         │
│   (长度 + 命令ID + payload) │
├─────────────────────────────┤
│   serialport (USB CDC ACM)  │
└─────────────────────────────┘
```

**Protobuf 定义**位于 `src-tauri/proto/` 目录，包含：
- `flipper.proto` - 主协议
- `system.proto` - 系统命令
- `gpio.proto` - GPIO 控制
- `gui.proto` - 屏幕与输入
- `storage.proto` - 文件管理
- `application.proto` - 应用加载
- `desktop.proto` - 桌面控制
- `property.proto` - 属性读写

### 8.3 固件刷写模块（firmware/flasher.rs）

**双轨刷写机制**：

```
                ┌─────────────┐
                │  选择固件   │
                └──────┬──────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌───────────────┐             ┌───────────────┐
│  RPC 刷写      │             │  DFU 刷写      │
│  (正常模式)    │             │  (DFU 模式)    │
│               │             │               │
│ • 串口传输     │             │ • USB DFU 协议 │
│ • 无需重启     │             │ • dfu-util 工具│
│ • 可在线升级   │             │ • 救砖/底层    │
└───────┬───────┘             └───────┬───────┘
        │                             │
        └──────────────┬──────────────┘
                       ▼
                ┌─────────────┐
                │  校验结果    │
                └─────────────┘
```

**支持的固件发行版**：
- Official Firmware (OFW)
- Momentum
- Unleashed
- RogueMaster

**刷写流程**：
1. 下载固件包（或使用本地文件）
2. 校验固件完整性
3. 选择刷写轨道（RPC / DFU）
4. 分块传输 + 进度回调
5. 校验刷写结果
6. 支持中途取消（`AtomicBool` 取消标志）

### 8.4 资源导入流水线（import/pipeline.rs）

**七步导入流程**：

```
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│  预检    │→│  备份    │→│  打包    │→│  传输    │
│(检查设备)│  │(旧文件)  │  │(压缩)   │  │(串口)   │
└─────────┘  └─────────┘  └─────────┘  └────┬────┘
                                             │
┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  刷新    │←│  校验    │←│  解压    │←──────┘
│(设备端)  │  │(MD5/SHA)│  │(设备端)  │
└─────────┘  └─────────┘  └─────────┘
```

**资源包类型**（7 个）：

| 资源包 | 目标路径 | 说明 |
|--------|---------|------|
| BadUSB 脚本包 | `/badusb/` | 预设安全脚本 |
| 游戏包 | `/apps/` | 第三方应用/游戏 |
| IR 遥控器包 | `/infrared/` | 电视/空调遥控器 |
| Sub-GHz 协议包 | `/subghz/` | 信号协议文件 |
| 主题包 | `/themes/` | 设备主题美化 |
| NFC 卡包 | `/nfc/` | 示例卡数据 |
| 教程文件包 | `/apps_data/` | 教学文件 |

**进度追踪**：
- 通过 `import-progress` 事件实时推送
- 支持 `cancel_import` 中途取消
- 每步均可独立报告错误与日志

### 8.5 AI 路由模块（ai/router.rs）

**多模型路由架构**：

```
            ┌──────────────────┐
            │   ai_chat()      │
            │  用户消息入口     │
            └────────┬─────────┘
                     │
         ┌───────────▼───────────┐
         │  sanitize_messages()  │
         │  (数据脱敏 - 7 种模式) │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   Prompt 构建         │
         │   (课程上下文注入)     │
         └───────────┬───────────┘
                     │
    ┌────────────────┼────────────────┐
    ▼                ▼                ▼
┌─────────┐    ┌─────────┐    ┌──────────┐
│ OpenAI  │    │ Anthropic│    │ 本地 FAQ │
│ GPT-4o  │    │ Claude   │    │ (降级)   │
└────┬────┘    └────┬────┘    └─────┬────┘
     │              │               │
     └──────────────┼───────────────┘
                    ▼
            ┌──────────────┐
            │  流式响应     │
            │  (SSE/Chunk) │
            └──────────────┘
```

**核心功能**：
- 多 Provider 支持（OpenAI 兼容接口 / Anthropic）
- 流式对话（逐 token 推送 `ai-chat-stream` 事件）
- 多模态对话（图片输入）
- 课程 Prompt 注入（根据 course_id 注入课程上下文）
- 断网降级（本地 FAQ 知识库兜底）
- 可配置模型参数（temperature、max_tokens 等）

### 8.6 虚拟设备模块（device/virtual_flipper.rs）

**功能**：在没有真实 Flipper Zero 设备时，提供完整的模拟体验。

**模拟范围**：

| 功能 | 模拟实现 |
|------|---------|
| 设备信息 | 返回预设的虚拟设备信息（名称/固件版本/UID） |
| 屏幕镜像 | 生成模拟画面（状态图标 + 时间 + 菜单） |
| 虚拟按键 | 更新虚拟屏幕状态 |
| 文件存储 | 内存中的虚拟文件系统（HashMap） |
| GPIO 控制 | 内存中的引脚状态模拟 |
| 资源导入 | 将资源文件写入虚拟文件系统 |
| 固件刷写 | 模拟刷写进度（延时 + 进度回调） |

**用途**：
- 开发测试（无需真实设备）
- 用户体验演示
- CI 自动化测试
- 离线模式使用

### 8.7 故障诊断模块（diagnostics/mod.rs）

**功能**：自动检测常见问题并给出修复建议。

**诊断项类型**：

| 诊断类别 | 检查内容 | 修复动作 |
|---------|---------|---------|
| 设备连接 | USB 连接、串口占用 | 释放端口、重启设备 |
| 固件版本 | 版本过低、不兼容 | 触发固件更新 |
| SD 卡状态 | 未插卡、容量不足、格式错误 | 格式化引导 |
| Sub-GHz | 频率校准、天线连接 | 校准引导 |
| NFC | 读取失败、密钥问题 | 操作建议 |
| 驱动 | USB 驱动缺失或不匹配 | 驱动安装 |

---

## 9. 扩展与演进方向

### 9.1 短期规划

- **蓝牙支持**：增加 BLE 连接方式，摆脱 USB 线缆限制
- **插件系统**：支持第三方资源包和功能插件
- **更多固件源**：增加社区固件的自动发现和更新

### 9.2 中期规划

- **多设备管理**：同时管理多台 Flipper Zero 设备
- **云端同步**：配置、成就、桌宠数据云端同步
- **课程编辑器**：可视化编辑 AI 教学课程

### 9.3 长期愿景

- **移动版本**：基于 Tauri Mobile 的 iOS/Android 伴侣应用
- **社区平台**：资源分享与用户创作社区
- **AI 本地推理**：集成本地大模型（llama.cpp），实现离线 AI 辅导

---

## 附录

### A. 依赖清单（Rust）

| Crate | 版本 | 用途 |
|-------|------|------|
| `tauri` | 2.0 | 桌面应用框架 |
| `tauri-plugin-shell` | 2.0 | Shell 命令执行 |
| `tauri-plugin-dialog` | 2.0 | 原生对话框 |
| `prost` / `prost-types` | 0.13 | Protobuf 编解码 |
| `tokio` | 1.40 | 异步运行时 |
| `serialport` | 4.5 | 串口通信 |
| `reqwest` | 0.12 | HTTP 客户端 |
| `parking_lot` | 0.12 | 高性能互斥锁 |
| `keyring` | 3 | 系统钥匙串 |
| `directories` | 5.0 | 系统目录 |
| `sysinfo` | 0.31 | 系统进程信息 |
| `tar` / `zip` / `flate2` | - | 压缩解压 |
| `regex` | 1.10 | 正则表达式（脱敏） |
| `chrono` | 0.4 | 时间处理 |
| `sha2` / `crc32fast` | - | 哈希校验 |
| `thiserror` / `anyhow` | - | 错误处理 |
| `env_logger` | 0.11 | 日志输出 |

### B. 依赖清单（前端）

| 包名 | 用途 |
|------|------|
| `react` / `react-dom` | UI 框架 |
| `typescript` | 类型系统 |
| `vite` | 构建工具 |
| `tailwindcss` | CSS 框架 |
| `zustand` | 状态管理 |
| `@tauri-apps/api` | Tauri 前端 API |

---

*本文档随项目迭代持续更新。如有疑问，请参考源代码或提交 Issue。*
