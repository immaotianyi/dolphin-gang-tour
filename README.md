# FlipperZero AI Tutor

> Flipper Zero 全功能桌面伴侣应用 —— 资源管理、固件刷写、AI 辅导、虚拟设备模拟，一站式搞定。

[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)]()
[![Framework](https://img.shields.io/badge/framework-Tauri%202.0%20%2B%20React%2018-orange)]()
[![Language](https://img.shields.io/badge/lang-Rust%20%2B%20TypeScript-red)]()

---

## 目录

- [简介](#简介)
- [核心功能](#核心功能)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [虚拟设备模式](#虚拟设备模式)
- [资源导入](#资源导入)
- [固件刷写](#固件刷写)
- [AI 辅导系统](#ai-辅导系统)
- [已知限制](#已知限制)
- [开发计划](#开发计划)
- [许可证](#许可证)

---

## 简介

FlipperZero AI Tutor 是一款为 Flipper Zero 硬件爱好者打造的桌面伴侣应用。它不替代 qFlipper，而是在其基础上提供更丰富的功能：一键资源导入、多固件刷写、实时屏幕镜像、AI 智能辅导、虚拟设备模拟等。

**无需 Flipper Zero 硬件即可体验** —— 内置虚拟设备模式，在 PC 上模拟完整设备交互链路。

---

## 核心功能

### 1. 虚拟设备模拟（无需硬件）

在没有真实 Flipper Zero 的情况下，应用内置虚拟设备模拟器：

- 设备扫描自动发现 "Flipper Zero (Virtual Demo)"
- 虚拟设备信息（固件 1.2.0-virtual / 电量 78% / SD 8GB）
- 虚拟屏幕镜像（128x64 动画帧实时渲染）
- 资源导入全链路（真实读取本地文件 → 写入虚拟文件系统 → 校验）
- 虚拟按键交互

### 2. 资源一键导入

预置 7 个资源包，涵盖红外、SubGHz、BadUSB 三大类别：

| 资源包 | 内容 | 文件数 |
|--------|------|--------|
| 电视红外遥控包 | Sony / Samsung / Xiaomi 电视红外信号 | 3 个 .ir 文件 |
| 空调红外遥控包 | 通用空调红外信号 | 2 个 .ir 文件 |
| 通用红外包 | 通用红外协议信号 | 2 个 .ir 文件 |
| SubGHz 协议包 | 门铃 / 遥控器 SubGHz 信号 | 2 个 .sub 文件 |
| SubGHz 扩展包 | 车库门 / 风扇 SubGHz 信号 | 2 个 .sub 文件 |
| BadUSB 脚本包 | Hello World / 画心 DuckyScript | 2 个 .txt 文件 |
| NFC 卡牌包 | 通用 NFC 卡牌数据 | 2 个 .nfc 文件 |

导入流程：PC 打包 → RPC 传输 → 设备写入 → 完整性校验（文件大小逐个对比）

### 3. 固件刷写

支持 4 个主流固件，从 GitHub API 动态获取最新版本信息：

| 固件 | 特点 |
|------|------|
| Momentum Firmware | 功能最丰富，推荐新手 |
| Unleashed Firmware | 经典稳定，SubGHz 扩展 |
| Official Firmware (OFW) | 官方固件，最稳定 |
| RogueMaster Firmware | 社区固件，含额外游戏 |

双轨道刷写：
- **RPC 轨道**：通过 Flipper RPC 协议传输固件包 → 触发 `system_reboot(Update)` → 轮询等待设备重连 → 验证固件版本
- **DFU 轨道**：解压固件包提取 .dfu 文件 → 校验 Manifest API Level → 调用 dfu-util 刷写 → 实时解析进度

### 4. AI 智能辅导

- 内置 Flipper Zero 知识库（SubGHz / NFC / BadUSB / Infrared / GPIO 等协议详解）
- AI 对话自动脱敏（UID / NFC 密钥 / WiFi 密码 / API Key / 手机号 / 邮箱）
- 支持多模型切换（OpenAI / Anthropic / 本地模型）
- 上下文感知（根据当前设备状态提供针对性建议）

### 5. 实时屏幕镜像

- 通过 RPC ScreenFrame 流式获取设备屏幕
- 128x64 单色位图实时渲染
- 虚拟按键远程操控（上/下/左/右/OK/Back）

### 6. 诊断工具

- SD 卡健康检测（可用空间异常检测）
- 端口占用检测（lsof 精确判断）
- 驱动状态查询
- 一键导出诊断日志（Tauri 模式写入文件 / 浏览器模式下载）

---

## 技术架构

```
┌──────────────────────────────────────────────────┐
│                  前端 (React 18)                  │
│  TypeScript + Zustand + Vite + Pixel Art UI      │
├──────────────────────────────────────────────────┤
│                Tauri IPC 桥接层                   │
│         invoke() / listen() / emit()             │
├──────────────────────────────────────────────────┤
│                 后端 (Rust)                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │ device  │ │  rpc    │ │ import  │ │firmware│ │
│  │detector │ │protocol │ │pipeline │ │flasher │ │
│  └─────────┘ └─────────┘ └─────────┘ └────────┘ │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │   ai    │ │  sd_card│ │ virtual │            │
│  │sanitizer│ │         │ │flipper  │            │
│  └─────────┘ └─────────┘ └─────────┘            │
├──────────────────────────────────────────────────┤
│            Flipper Zero RPC Protocol             │
│         (protobuf over USB CDC-ACM)              │
├──────────────────────────────────────────────────┤
│            Flipper Zero 硬件 / 虚拟设备           │
└──────────────────────────────────────────────────┘
```

**技术栈**：
- 前端：React 18 + TypeScript + Zustand + Vite 5
- 后端：Rust + Tauri 2.0 + tokio + serde
- 通信：Tauri IPC + Flipper RPC (protobuf)
- HTTP：reqwest (GitHub API / AI 模型调用)
- 压缩：flate2 + tar (资源打包 / 固件解压)

---

## 项目结构

```
flipperzero/
├── flipper-ai-tutor/              # 主应用
│   ├── src/                        # 前端源码
│   │   ├── components/             # UI 组件
│   │   │   ├── FirmwareManager.tsx # 固件管理
│   │   │   ├── ScreenMirror.tsx    # 屏幕镜像
│   │   │   ├── DeviceSidebar.tsx   # 设备侧边栏
│   │   │   └── ...
│   │   ├── stores/                 # Zustand 状态管理
│   │   │   ├── deviceStore.ts      # 设备状态
│   │   │   ├── firmwareStore.ts    # 固件刷写状态
│   │   │   ├── importStore.ts      # 资源导入状态
│   │   │   └── ...
│   │   ├── lib/
│   │   │   └── tauri.ts            # Tauri IPC 封装
│   │   ├── data/
│   │   │   └── resources.ts        # 资源包定义
│   │   └── types/
│   │       └── index.ts            # TypeScript 类型
│   ├── src-tauri/                  # Rust 后端
│   │   ├── src/
│   │   │   ├── lib.rs              # IPC 命令入口
│   │   │   ├── device/
│   │   │   │   ├── detector.rs     # 设备扫描检测
│   │   │   │   ├── driver.rs       # 驱动状态
│   │   │   │   ├── sd_card.rs      # SD 卡管理
│   │   │   │   └── virtual_flipper.rs # 虚拟设备
│   │   │   ├── rpc/
│   │   │   │   ├── mod.rs          # RPC 会话管理
│   │   │   │   ├── protocol.rs     # Flipper RPC 协议
│   │   │   │   └── stream.rs       # 屏幕流 / 按键
│   │   │   ├── import/
│   │   │   │   └── pipeline.rs     # 资源导入流水线
│   │   │   ├── firmware/
│   │   │   │   └── flasher.rs      # 固件刷写
│   │   │   └── ai/
│   │   │       └── sanitizer.rs    # AI 脱敏
│   │   ├── proto/                  # protobuf 定义
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json
│   ├── resources/                  # 真实资源文件
│   │   ├── ir-tv-remote-pack/      # 红外电视遥控
│   │   ├── ir-ac-remote-pack/      # 红外空调遥控
│   │   ├── ir-universal-pack/      # 通用红外
│   │   ├── subghz-protocol-pack/   # SubGHz 协议
│   │   ├── subghz-extended-pack/   # SubGHz 扩展
│   │   ├── badusb-scripts-pack/    # BadUSB 脚本
│   │   └── nfc-cards-pack/         # NFC 卡牌
│   ├── package.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

---

## 快速开始

### 环境要求

- **Rust** 1.75+（含 cargo）
- **Node.js** 18+（含 npm）
- **Tauri CLI 2.0**：`npm install -g @tauri-apps/cli`
- **系统依赖**：
  - macOS：Xcode Command Line Tools
  - Linux：`webkit2gtk-4.1-dev` `libgtk-3-dev` `librsvg2-dev`
  - Windows：Microsoft Visual Studio C++ Build Tools

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/immaotianyi/flipperzero-ai-tutor.git
cd flipperzero-ai-tutor/flipper-ai-tutor

# 安装前端依赖
npm install

# 开发模式（热重载）
npm run tauri dev

# 构建生产版本
npm run tauri build
```

### 连接真实设备

1. 用 USB 线连接 Flipper Zero
2. 打开应用，设备侧边栏自动扫描
3. 点击设备进行连接
4. 开始使用资源导入 / 固件刷写 / 屏幕镜像等功能

### 使用虚拟设备（无需硬件）

1. 打开应用
2. 设备扫描后列表中会出现 "Flipper Zero (Virtual Demo)"
3. 点击连接即可体验完整功能链路

---

## 虚拟设备模式

虚拟设备模拟器 (`virtual_flipper.rs`) 在内存中模拟 Flipper Zero 的行为：

- **虚拟文件系统**：`HashMap<String, Vec<u8>>` 模拟 SD 卡文件
- **虚拟设备信息**：固件版本 1.2.0-virtual / 电量 78% / SD 8GB
- **虚拟屏幕**：每 100ms 生成 128x64 单色位图帧（含动画光标和菜单模拟）
- **虚拟按键**：改变帧计数器让屏幕产生响应

当端口名为 `VIRTUAL` 时，所有 RPC 命令走虚拟响应器而非真实串口。

---

## 资源导入

### 导入流程

```
用户选择资源包
    ↓
PC 侧打包为 tar.gz
    ↓
清理设备端旧文件（逐个 storage_delete）
    ↓
PC 侧解压 tar.gz + 逐文件 storage_write
    ↓
完整性校验（逐文件 storage_stat 对比文件大小）
    ↓
刷新资源索引
```

### 资源文件格式

所有资源文件均为标准 Flipper 格式：

**红外文件 (.ir)**：
```
Filetype: IR signals file
Version: 1
name: Sony TV
type: parsed
protocol: SIRC
address: 01 00
command: 15 00
```

**SubGHz 文件 (.sub)**：
```
Filetype: Flipper SubGhz Key File
Version: 1
Frequency: 433920000
Preset: FuriHalSubGhzPresetOok650Async
Protocol: Princeton
Bit: 24
Key: 00 00 00 00 00 95 D5 D4
```

**BadUSB 脚本 (.txt)**：
```
GUI r
DELAY 500
STRING notepad
DELAY 500
ENTER
DELAY 500
STRINGLN Hello from Flipper Zero!
```

---

## 固件刷写

### RPC 轨道（正常模式）

```
选择固件文件（本地 .zip / .tar.gz）
    ↓
读取文件内容
    ↓
校验 Manifest API Level
    ↓
storage_write 写入 /update/firmware.fuf
    ↓
system_reboot(Update) 触发固件更新
    ↓
轮询等待设备重连（最多 60 秒）
    ↓
重新建立 RPC 会话
    ↓
system_get_info 验证固件版本
```

### DFU 轨道（救砖模式）

```
设备进入 DFU 模式
    ↓
选择固件包（.zip / .tar.gz）
    ↓
解压提取 .dfu 文件
    ↓
校验 Manifest API Level
    ↓
调用 dfu-util 刷写
    ↓
实时解析 dfu-util stderr 进度
    ↓
等待设备重启
```

**dfu-util 安装**：
- macOS：`brew install dfu-util`
- Linux：`sudo apt install dfu-util`
- Windows：从 [dfu-util.sourceforge.net](http://dfu-util.sourceforge.net/releases/) 下载

---

## AI 辅导系统

### 知识库

内置 Flipper Zero 协议知识库，涵盖：

- SubGHz 频段与协议（Princeton / PT2262 / EV1527 等）
- NFC 协议（Mifare Classic / NTAG / FeliCa）
- BadUSB（DuckyScript 语法）
- Infrared 协议（NEC / SIRC / RC5 / RC6）
- GPIO 引脚功能

### 脱敏机制

AI 对话内容自动脱敏，检测并替换以下敏感信息：

- Flipper UID（10 位十六进制）
- NFC 密钥（AES / Mifare Key A/B）
- WiFi 密码
- API Key（OpenAI / Anthropic / GitHub Token）
- 手机号
- 邮箱

---

## 已知限制

### 协议层限制（Flipper RPC 不支持）

| 功能 | 状态 | 替代方案 |
|------|------|---------|
| SD 卡格式化 | RPC 无 StorageFormat 命令 | 引导用户在设备端操作 |
| SD 卡文件系统信息 | RPC 仅返回 total/free space | format/cluster_size 标注为 unknown |
| SD 卡坏道检测 | RPC 无坏道检测命令 | 基于可用空间异常间接检测 |

### 平台限制

| 功能 | 状态 | 说明 |
|------|------|------|
| Windows 驱动自动检测 | 返回 unknown | 需 SetupAPI，待 Windows 环境实现 |
| Windows Zadig 自动替换 | 返回手动操作引导 | Zadig 是 GUI 工具无 CLI |
| 随包内置 dfu-util | 未实现 | 给出平台安装命令引导 |
| 图片 OCR 脱敏 | 仅文字描述脱敏 | 像素内容无法检测，需用户注意 |

### 功能限制

| 功能 | 状态 | 说明 |
|------|------|------|
| games-pack / themes-pack | 无真实文件 | 需用户自行下载 .fap / .asset 文件 |
| 断点续传 | 已移除 | 逐文件传输方案下单文件很快，无需续传 |
| 成就系统 / 桌宠 / GPIO 沙盘 | COMING SOON | UI 骨架已搭建，功能开发中 |

---

## 开发计划

- [ ] Windows 平台 SetupAPI 驱动检测
- [ ] 随包内置 dfu-util（跨平台交叉编译）
- [ ] 成就系统完整实现
- [ ] 桌宠交互系统
- [ ] GPIO 可视化配置工具
- [ ] GitHub Release 资源包自动下载
- [ ] 多语言支持（i18n）

---

## 许可证

本项目仅供学习和研究使用。请遵守当地法律法规，勿用于非法用途。

Flipper Zero 是 Flipper Devices Inc. 的商标。本项目与 Flipper Devices Inc. 无任何关联。

---

## 致谢

- [Flipper Devices](https://flipperzero.one/) — 硬件设计与官方固件
- [Momentum Firmware](https://github.com/Next-Flip/Momentum-Firmware) — 社区固件
- [Unleashed Firmware](https://github.com/DarkFlippers/unleashed-firmware) — 社区固件
- [Tauri](https://tauri.app/) — 跨平台桌面框架
- [React](https://react.dev/) — 前端框架
