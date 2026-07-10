# 🐬 Dolphin Gang Tour

> **Flipper Zero 全功能桌面伴侣应用 — AI 辅导 · 资源导入 · 固件刷写 · 虚拟模拟
>
> 80s 复古赛博朋克像素风 | Tauri 2.0 + Rust + React 18
>
> [![抖音](https://img.shields.io/badge/抖音-@Ciao778899-ff0050?logo=tiktok)](https://www.douyin.com/)
> [![GitHub](https://img.shields.io/badge/GitHub-dolphin--gang--tour-blue?logo=github)](https://github.com/immaotianyi/dolphin-gang-tour)
> [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
> [![Version](https://img.shields.io/badge/version-v1.0.0-orange)]()

---

## 📖 项目简介

**Dolphin Gang Tour（海豚黑帮巡演）** 是一款面向 Flipper Zero 用户的一站式桌面伴侣应用。无论你是刚拿到设备的新手小白，还是折腾多年的老玩家，都能在这里找到趁手的工具。

我们相信硬件不应该有门槛——从 AI 手把手教学、一键资源导入，到固件刷写、虚拟设备模拟、屏幕镜像，再到电子宠物养成和故障诊断，**一个 App 全部搞定。

> ⚠️ **非官方产品声明**：本项目与 Flipper Devices Inc. 无任何关联、赞助或合作关系。"Flipper Zero" 是 Flipper Devices Inc. 的注册商标，本产品仅在描述兼容性时进行指示性使用。

---

## ✨ 核心功能

### 🤖 AI 智能辅导
- **多模型路由**：支持 OpenAI / Anthropic / Google / DeepSeek 四大模型厂商，智能切换最优通路
- **数据脱敏层**：7 种脱敏模式（门禁 UID、NFC 密钥、WiFi 密码、坐标匿名化等），敏感数据永不离境
- **7 节手把手课程**：从认识设备、复制门禁、红外遥控、Sub-GHz 到 BadUSB，零基础也能轻松上手
- **多模态卡片识别**：拍照即可识别卡类型，AI 生成内容带显著标识，符合《深度合成管理规定》
- **断网降级**：无网络时自动切换本地 FAQ，不耽误学习

### 📦 一键资源导入
- **5 类资源包**：红外、SubGHz、BadUSB、游戏、主题，覆盖日常所需
- **tar 极速传输**：打包后设备端解压，速度比单文件传输快 **20-40 倍**
- **SHA256 校验**：Hash Tree 增量同步，断点续传，确保文件完整
- **BadUSB 白名单沙盒**：仅允许画图/记事本等安全脚本，屏蔽 powershell / wget 等危险操作

### 🔧 固件刷写管理
- **多固件源**：支持 Momentum / Unleashed / OFW / RogueMaster 四大固件一键切换
- **双轨刷写**：RPC 协议刷写（正常模式）+ dfu-util 底层刷写（DFU 救砖模式），双重保障
- **自动检测**：USB 自动识别正常模式与 DFU 模式，智能选择刷写路径

### 🎮 虚拟设备模拟
- **零硬件体验**：没有 Flipper Zero 也能完整体验全部功能
- **全功能模拟**：菜单导航、GPIO 控制、屏幕交互，和真机操作一致
- **学习首选**：新手先在虚拟设备上练手，再上真机不翻车

### 📺 屏幕镜像 & GPIO 沙盒
- **实时屏幕镜像**：通过 Protobuf RPC 协议流式传输设备屏幕
- **8 引脚可视化控制**：OUTPUT / INPUT 切换 + HIGH / LOW 电平，拖拽式操作
- **OTG 模式开关**：一键切换供电模式
- **虚拟 / 真机双模式**：沙盒内随意折腾，不怕烧板

### 🐬 电子宠物 & 成就系统
- **海豚宠物养成**：陪伴式交互，增加使用越久等级越高
- **成就系统**：解锁各类隐藏成就，探索设备的每一种玩法
- **状态持久化**：关闭 App 也不丢失进度

### 🔍 故障诊断工具
- **一键体检**：自动检测串口、驱动、SD 卡、固件版本等多项指标
- **端口排爆**：自动检测并结束占用端口的进程（qFlipper / Cura / Arduino 等）
- **诊断报告**：生成详细诊断信息，方便排查问题

---

## 🛡️ 安全合规

| 特性 | 说明 |
|------|------|
| BadUSB 白名单沙盒 | 仅允许安全脚本，屏蔽危险命令 |
| API Key 安全存储 | 使用系统钥匙串，永不外传 |
| 7 种数据脱敏模式 | 门禁 UID / NFC 密钥 / WiFi 密码 / 坐标等 |
| SSRF 防护 | 严格的网络请求白名单 |
| CSP 安全策略 | Content Security Policy 限制资源加载来源 |
| 法律警示弹窗 | SubGHz / NFC / BadUSB 功能附带使用提示 |
| 用户协议 & 隐私政策 | 首次启动必须同意 |
| 拒绝非法用途 | 盗车 / 盗刷 / 非法入侵一律禁止 |

---

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri 2.0 | 安装包 ~15MB，冷启动 0.3s |
| 后端 | Rust + serialport-rs | 串口通信、固件刷写、资源导入 |
| 前端 | React 18 + TypeScript | Retro Cyberpunk 像素风 UI |
| 状态管理 | Zustand | 响应式设备状态、AI 对话、导入进度 |
| 样式 | Tailwind CSS + 自定义 CSS | CRT 扫描线、点阵网格、像素边框 |
| 图标 | 全手绘 SVG（48 个） | 零 emoji，复古像素线条风 |
| 构建工具 | Vite 5 | 极速热更新，秒级启动 |
| 通信协议 | Protobuf RPC | 与 Flipper 设备原生协议 |

---

## 📸 截图 & 预览

想看实际效果演示视频？欢迎前往抖音观看完整演示 👇

**🎬 抖音 @Ciao778899** — 50 万+ 播放 · 2.3 万点赞 · 1 万+ 收藏

搜索账号 **@Ciao778899** 即可查看完整功能演示、上手教程和幕后开发故事。

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18
- **Rust** >= 1.75
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```
- **系统依赖**：
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev`
  - Windows: Microsoft Visual Studio C++ Build Tools

### 安装与开发

```bash
# 克隆仓库
git clone https://github.com/immaotianyi/dolphin-gang-tour.git
cd dolphin-gang-tour

# 安装前端依赖
npm install

# 前端开发模式（浏览器预览，Mock 数据）
npm run dev
# → 访问 http://localhost:1420

# Tauri 桌面应用开发模式（可连接真实硬件）
npm run tauri:dev

# 打包发布
npm run tauri:build
```

### 资源包下载

游戏和主题资源因许可证原因不直接包含在仓库中，请运行下载脚本获取：

```bash
# 下载游戏 .fap 文件（来源: xMasterX/all-the-plugins, GPL-3.0）
bash resources/games-pack/download.sh

# 下载主题 Asset Pack（来源: 社区仓库, 各自许可证）
bash resources/themes-pack/download.sh
```

---

## 📦 下载安装

前往 [GitHub Releases](https://github.com/immaotianyi/dolphin-gang-tour/releases) 页面下载最新版本。

支持平台：

| 平台 | 格式 | 说明 |
|------|------|------|
| macOS | `.dmg` / `.app` | 支持 Intel & Apple Silicon |
| Windows | `.msi` / `.exe` | Windows 10 及以上 |
| Linux | `.deb` / `.AppImage` | Debian / Ubuntu 系 |

---

## 📂 项目结构

```
flipper-ai-tutor/
├── src/                          # 前端 React 代码
│   ├── components/               # UI 组件（16个核心组件）
│   │   ├── AiChat.tsx           # AI 对话界面
│   │   ├── CourseView.tsx        # 课程视图
│   │   ├── FirmwareManager.tsx   # 固件管理器
│   │   ├── ImportWizard.tsx      # 导入向导
│   │   ├── DiagnosticPanel.tsx   # 故障诊断面板
│   │   └── ...
│   ├── stores/                   # Zustand 状态管理（12 个 store）
│   │   ├── chatStore.ts          # AI 对话状态
│   │   ├── deviceStore.ts        # 设备状态
│   │   ├── firmwareStore.ts     # 固件状态
│   │   ├── petStore.ts           # 电子宠物
│   │   └── ...
│   ├── lib/                      # Tauri IPC 封装
│   ├── types/                    # TypeScript 类型定义
│   ├── data/                     # 课程与资源包数据
│   ├── hooks/                    # 自定义 Hooks
│   └── styles/                   # 全局样式（CRT 动画、像素主题）
├── src-tauri/                    # Rust 后端代码
│   ├── src/
│   │   ├── lib.rs                # Tauri 入口（30+ IPC 命令）
│   │   ├── main.rs               # 应用入口
│   │   ├── device/               # 设备检测 / 驱动 / SD卡 / 虚拟设备
│   │   ├── rpc/                  # Protobuf RPC 协议 / 屏幕流
│   │   ├── firmware/             # 双轨固件刷写
│   │   ├── import/               # tar 极速资源导入 / BadUSB 防护
│   │   ├── ai/                   # 多模型路由 / 脱敏 / Prompt
│   │   └── diagnostics/          # 故障诊断
│   ├── Cargo.toml
│   └── tauri.conf.json
├── resources/                    # 资源包
│   ├── ir-tv-remote-pack/        # 红外电视遥控器
│   ├── subghz-protocol-pack/     # SubGHz 示例
│   ├── badusb-scripts-pack/      # BadUSB 安全脚本
│   ├── games-pack/               # 游戏资源（需下载）
│   └── themes-pack/              # 主题资源（需下载）
├── LICENSES/                     # 第三方许可证文本
├── LICENSE                        # MIT 许可证
├── THIRDPARTY.md                  # 第三方组件声明
├── CONTRIBUTING.md               # 贡献指南
├── CHANGELOG.md                  # 变更日志
└── package.json
```

---

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request！

- 🐛 发现 Bug？请先搜索现有 Issue，没有的话新建一个
- 💡 有好点子？欢迎提 Feature Request
- 🔧 想写代码？请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解代码规范和 PR 流程

### 快速贡献流程：

```bash
# 1. Fork 仓库
# 2. 创建功能分支
git checkout -b feat/your-feature

# 3. 确保编译通过
npm run tauri:dev   # 或 cargo check

# 4. 提交 PR
```

更多细节请查阅 [贡献指南](CONTRIBUTING.md)。

---

## 📄 许可证

本项目采用 **MIT** 许可证 — 详见 [LICENSE](LICENSE) 文件。

第三方组件清单及许可证见 [THIRDPARTY.md](THIRDPARTY.md)。

---

## ⚠️ 免责声明

1. **非官方产品**：Dolphin Gang Tour 是独立的开源项目，与 Flipper Devices Inc. 无任何关联、赞助或合作关系。

2. **合理使用**：本软件仅用于学习、研究和合法的安全测试目的。用户应当遵守所在地法律法规，不得将本软件用于任何非法用途。

3. **风险自担**：使用本软件进行固件刷写、资源导入等操作存在一定风险，包括但不限于设备变砖、数据丢失等。请在充分了解风险后谨慎操作，作者不对任何直接或间接损失承担责任。

4. **商标声明**：
   - "Flipper Zero" 是 Flipper Devices Inc. 的注册商标
   - "Dolphin Gang Tour" 是本项目的独立品牌名称
   - 本产品仅在描述兼容性时对上述商标进行指示性使用

---

<p align="center">
Made with ❤️ by <strong>MAO</strong> (抖音 @Ciao778899)
</p>
