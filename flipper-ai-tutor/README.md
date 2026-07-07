# Dolphin Gang Tour

> 面向零基础用户的 Flipper Zero 手把手 AI 教学 & 一键资源导入工具
>
> **非官方产品** — 与 Flipper Devices Inc. 无任何关联、赞助或合作关系。"Flipper Zero" 是 Flipper Devices Inc. 的注册商标，本产品仅在描述兼容性时进行指示性使用。
>
> Tauri 2.0 + Rust + React + TypeScript | 80s Retro Cyberpunk UI

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri 2.0 | 安装包 ~15MB，冷启动 0.3s |
| 后端 | Rust + serialport-rs | 串口通信、固件刷写、资源导入 |
| 前端 | React 18 + TypeScript | Retro Cyberpunk 像素风 UI |
| 状态管理 | Zustand | 响应式设备状态、AI对话、导入进度 |
| 样式 | Tailwind CSS + 自定义 CSS | CRT扫描线、点阵网格、像素边框 |
| 图标 | 全手绘 SVG（48个） | 零 emoji，复古像素线条风 |

## 目录结构

```
flipper-ai-tutor/
├── src/                          # 前端 React 代码
│   ├── components/               # UI 组件
│   ├── stores/                   # Zustand 状态管理
│   ├── lib/                      # Tauri IPC 封装
│   ├── types/                    # TypeScript 类型定义
│   ├── data/                     # 课程与资源包数据
│   └── styles/                   # 全局样式
├── src-tauri/                    # Rust 后端代码
│   ├── src/
│   │   ├── lib.rs                # Tauri 入口（30+ IPC 命令）
│   │   ├── device/               # 设备检测/驱动/SD卡
│   │   ├── rpc/                  # Protobuf RPC 协议/屏幕流
│   │   ├── firmware/             # 双轨固件刷写
│   │   ├── import/               # tar 极速资源导入
│   │   ├── ai/                   # 多模型路由/脱敏/Prompt
│   │   └── diagnostics/          # 故障诊断
│   ├── Cargo.toml
│   └── tauri.conf.json
├── resources/                    # 资源包（含下载脚本）
├── LICENSES/                     # 第三方许可证文本
├── LICENSE                       # MIT 许可证
├── THIRDPARTY.md                 # 第三方组件声明
└── package.json
```

## 开发环境要求

- Node.js >= 18
- Rust >= 1.75（`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`）
- 系统依赖：
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev`
  - Windows: Microsoft Visual Studio C++ Build Tools

## 快速开始

```bash
# 安装前端依赖
npm install

# 前端开发模式（浏览器预览，Mock 数据）
npm run dev
# → http://localhost:1420

# Tauri 桌面应用开发模式（连接真实硬件）
npm run tauri:dev

# 打包发布
npm run tauri:build
```

## 资源包下载

游戏和主题资源因许可证原因不直接包含在仓库中，请运行下载脚本获取：

```bash
# 下载游戏 .fap 文件（来源: xMasterX/all-the-plugins, GPL-3.0）
bash resources/games-pack/download.sh

# 下载主题 Asset Pack（来源: 社区仓库, 各自许可证）
bash resources/themes-pack/download.sh
```

## 核心功能

### 设备连接
- USB 自动检测（VID=0x0483，正常/DFU 模式双识别）
- 虚拟设备模拟（无需硬件即可体验全流程）
- 端口占用自动排爆（检测并结束 qFlipper/Cura/Arduino）

### 一键导入
- 7 类资源包（固件/红外/NFC/Sub-GHz/RFID/BadUSB/游戏/主题）
- tar 打包 + 设备端解压，提速 20-40 倍
- Hash Tree 增量同步，断点续传

### AI 教学
- 多模型路由（OpenAI / Anthropic / Google / DeepSeek），断网降级本地 FAQ
- 7 节手把手课程（认识设备 → 复制门禁 → 红外遥控 → Sub-GHz → BadUSB）
- 多模态卡片识别（拍照识别卡类型）
- 数据脱敏层（门禁 UID / NFC 密钥 / WiFi 密码 / 坐标匿名化）
- AI 生成内容显著标识（符合《深度合成管理规定》）

### 固件刷写
- 双轨守护：RPC 协议刷写（正常）+ dfu-util 底层刷写（DFU 救砖）
- dfu-util 为 GPL v2 独立组件，用户需自行安装

### GPIO 沙盘
- 8 引脚可视化控制（OUTPUT/INPUT 切换 + HIGH/LOW 电平）
- OTG 模式开关
- 虚拟设备/真机双模式

## 安全合规

- BadUSB 白名单沙盒（仅画图/记事本，屏蔽 powershell/wget）
- 拒绝非法用途（盗车/盗刷/非法入侵）
- 用户 API Key 加密存储（系统钥匙串），永不外传
- 所有资源来自开源项目，遵守对应协议
- 首次启动展示用户协议与隐私政策
- SubGHz/NFC/BadUSB 功能附带法律使用提示

## 许可证

MIT — 见 [LICENSE](LICENSE) 文件

## 第三方组件

完整第三方组件清单见 [THIRDPARTY.md](THIRDPARTY.md)。

## 商标声明

- "Flipper Zero" 是 Flipper Devices Inc. 的注册商标
- "Dolphin Gang Tour" 是本项目的独立品牌名称
- 本产品与 Flipper Devices Inc. 无任何关联、赞助或合作关系
