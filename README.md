# Lucy Desktop

AI 安全硬件实验室桌面端 — 配合 ESP32-S3 + CC1101 + ST25R3916 硬件使用。

## 这是什么

Lucy Desktop 是一个桌面应用，把口袋硬件设备的能力包装成可视化的操作界面。你可以用它读 NFC 卡、扫描 Sub-GHz 信号、学习红外遥控、执行 BadUSB 脚本、控制 GPIO，所有操作都经过安全网关校验，高危动作必须人工确认。

内置虚拟实验室，没有硬件也能学习操作流程。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + Zustand
- **后端**: Rust + Tauri 2.0 + SQLite (WAL 模式)
- **设计**: 8-bit 像素风 + Apple 级动效 (150-240ms)

## 快速开始

```bash
cd lucy/desktop
npm install
npm run dev
```

浏览器打开 `http://localhost:1420` 即可。没有硬件时会自动连接虚拟设备。

## 项目结构

```
lucy/desktop/
├── src/                      # React 前端
│   ├── components/modules/   # 14 个功能视图
│   ├── components/ui/        # 像素风 UI 组件库
│   ├── stores/               # Zustand 状态管理
│   ├── locales/              # 中英文 i18n (1058 keys)
│   └── lib/tauri.ts          # Tauri 命令调用 + mock
├── src-tauri/                # Rust 后端
│   └── src/
│       ├── gateway.rs        # 五级安全管线
│       ├── database.rs       # SQLite 资产库 (11 张表)
│       ├── reliability.rs    # 超时/重试/心跳/重连
│       ├── release.rs        # 版本/更新/日志/检查清单
│       ├── freeze.rs         # RC1 命令冻结 + 风险标记
│       ├── device/           # 硬件协议 + 虚拟设备
│       └── security/         # BadUSB 守卫 + AI 脱敏 + 地区策略
```

## 安全机制

| 机制 | 说明 |
|------|------|
| CommandGateway | 五级管线: 分类 → AI 校验 → 地区检查 → 开发者模式 → BadUSB 守卫 |
| 风险分级 | 100 个命令标注为 safe / caution / dangerous |
| AI 副驾驶 | 永不直接执行高危命令，只给建议卡片 |
| Sub-GHz 发射 | 强制地区策略校验 (US/EU/JP/CN/Global) |
| BadUSB 执行 | 三阶段: validate → preview → confirm |
| 审计日志 | 所有 delete/write/tx/upgrade 写入 SQLite |
| 脱敏导出 | 7 种模式: UID / NFC Key / WiFi / API Key / 手机号 / 邮箱 / 坐标 |

## 当前状态

**v0.7.0-rc1** — 发布候选冻结阶段

- 171 Rust tests passed
- 0 TypeScript errors
- 1058 i18n keys (中英文对等)
- 485 KB bundle (136 KB gzip)

待完成: macOS DMG / Windows NSIS / Linux AppImage 打包 + 真实硬件回归测试。

## 开发阶段

| 阶段 | 内容 |
|------|------|
| P1-P4 | 核心模块: NFC / SubGHz / IR / BadUSB / GPIO / 固件 / 屏幕 |
| P5 | 基础架构: i18n / UI 设计系统 / Settings 2.0 / Dashboard |
| P6 | 产品化: SQLite 资产库 / TaskFlow / Library / Virtual Lab / AI Copilot |
| P7 | 发布准备: 硬件可靠性 / 审计中心 / 发布工程 / UX 加固 |
| RC1 | 范围冻结: 100 命令锁定 / 10 条已知问题 / 模式行为差异表 |

## License

© 2026 Lucy Team. All rights reserved.
