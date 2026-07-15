# Lucy Desktop

ESP32-S3 + CC1101 + ST25R3916 硬件的桌面控制台。读 NFC、扫 Sub-GHz、学红外、跑 BadUSB 脚本、控制 GPIO，所有高危操作经过安全网关校验，必须人工确认。

没有硬件时自动连接虚拟设备，内置 13 节实验室课程。

## 环境要求

- Node.js 18+
- Rust 1.75+ (`rustup install stable`)
- macOS 10.15+ / Windows 10+ / Ubuntu 20.04+

## 快速开始

```bash
npm install
npm run dev
```

打开 `http://localhost:1420`。没插设备会自动连虚拟设备。

## 构建

```bash
npm run build          # 前端打包
cd src-tauri && cargo build --release   # Rust 编译
```

打包安装程序（需要对应平台环境）：

```bash
npm run tauri build    # 产出 DMG / NSIS / AppImage
```

## 项目结构

```
src/                    前端 (React 18 + TypeScript + Vite)
src-tauri/             后端 (Rust + Tauri 2.0)
├── src/
│   ├── gateway.rs     安全执行网关，五级管线
│   ├── database.rs     SQLite 资产库，11 张表
│   ├── reliability.rs  超时/重试/心跳/自动重连
│   ├── freeze.rs       RC1 命令冻结 + 风险标记
│   ├── device/         硬件协议层 + 虚拟设备
│   └── security/       BadUSB 守卫 + AI 脱敏 + 地区策略
docs/                  设计文档、阶段概览、硬件调研
```

## 安全机制

- **风险分级**: 100 个命令标注 safe / caution / dangerous
- **AI 副驾驶**: 只给建议卡片，不直接执行高危命令
- **Sub-GHz 发射**: 强制地区策略校验（US/EU/JP/CN/Global）
- **BadUSB 执行**: validate → preview → confirm 三阶段
- **审计日志**: 所有写入/删除/发射/升级操作记入 SQLite
- **脱敏导出**: 7 种模式过滤 UID / NFC Key / WiFi / API Key / 手机号 / 邮箱 / 坐标

## 开发状态

**v0.7.0-rc1** — 发布候选冻结

| 指标 | 数值 |
|------|------|
| Rust 测试 | 171 passed |
| TS 错误 | 0 |
| i18n | 1058 keys（中英文对等）|
| 打包体积 | 485 KB（gzip 136 KB）|

## License

MIT
