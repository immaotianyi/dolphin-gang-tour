# FlipperZero AI Tutor

> 面向零基础用户的 Flipper Zero 手把手 AI 教学 & 一键资源导入工具
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
│   │   ├── Icon.tsx              # 高级 SVG 图标系统（48个手绘图标）
│   │   ├── TitleBar.tsx          # 顶部标题栏
│   │   ├── DeviceSidebar.tsx     # 左侧设备状态面板
│   │   ├── AiChat.tsx            # AI 对话主区域
│   │   ├── ImportWizard.tsx      # 一键导入向导
│   │   ├── FirmwareManager.tsx   # 固件管理
│   │   ├── DiagnosticPanel.tsx   # 故障诊断
│   │   ├── CourseView.tsx        # 课程学习视图
│   │   └── Modal.tsx             # 通用模态框
│   ├── stores/                   # Zustand 状态管理
│   │   ├── deviceStore.ts        # 设备连接状态
│   │   ├── importStore.ts        # 资源导入进度
│   │   ├── firmwareStore.ts      # 固件刷写状态
│   │   ├── chatStore.ts          # AI 对话消息
│   │   ├── diagnosticStore.ts    # 诊断结果
│   │   └── mirrorStore.ts        # 屏幕镜像帧
│   ├── hooks/                    # 自定义 Hooks
│   ├── lib/                      # Tauri IPC 封装
│   ├── types/                    # TypeScript 类型定义
│   ├── data/                     # 课程与资源包数据
│   └── styles/                   # 全局样式
├── src-tauri/                    # Rust 后端代码
│   ├── src/
│   │   ├── lib.rs                # Tauri 入口（21个IPC命令）
│   │   ├── main.rs               # main 函数
│   │   ├── device/               # 设备检测/驱动/SD卡
│   │   ├── rpc/                  # Protobuf RPC 协议/屏幕流
│   │   ├── firmware/             # 双轨固件刷写
│   │   ├── import/               # tar 极速资源导入
│   │   ├── ai/                   # 多模型路由/脱敏/Prompt
│   │   └── diagnostics/          # 故障诊断
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
└── tsconfig.json
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

## 核心功能

### 设备连接
- USB 自动检测（VID=0x0483，正常/DFU 模式双识别）
- Auto-Zadig 驱动自动安装（Windows）
- 端口占用自动排爆（检测并结束 qFlipper/Cura/Arduino）
- SD 卡格式预检与一键医美（FAT32 + 32K 簇）

### 一键导入
- 10 类精选资源包（固件/红外/NFC/Sub-GHz/RFID/BadUSB/工具/游戏/主题/音乐）
- tar 打包 + 设备端解压，提速 20-40 倍
- Hash Tree 增量同步，断点续传
- 传输期间 RPC 并发锁独占串口

### AI 教学
- 多模型路由（通义千问 / DeepSeek / GPT-4o），断网降级本地 FAQ
- RAG 知识库（官方文档翻译 + 200+ FAQ + 固件 Changelog）
- 7 节手把手课程（认识设备 → 复制门禁 → 红外遥控 → Sub-GHz → BadUSB）
- 多模态卡片识别（拍照识别卡类型，管理期望值）
- 数据脱敏层（门禁 UID / NFC 密钥 / WiFi 密码 / 坐标匿名化）

### 固件刷写
- 双轨守护：RPC 协议刷写（正常）+ dfu-util 底层刷写（DFU 救砖）
- Manifest API Level 强绑定校验
- 100% 救砖率

## 安全合规

- BadUSB 白名单沙盒（仅画图/记事本/Rickroll，屏蔽 powershell/wget）
- 拒绝非法用途（盗车/盗刷/非法入侵）
- 用户 API Key 加密存储本地，永不外传
- 所有资源来自开源项目，遵守对应协议

## 许可证

MIT
