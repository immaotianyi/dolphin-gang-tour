# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/) 格式，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### Added
- Release CI 自动构建工作流（Windows MSI/NSIS、macOS DMG、Linux AppImage）
- Android 构建配置（SDK 版本、权限、图标）
- 项目展示页面（showcase）
- 抖音二维码引流卡片
- 完整文档体系：README、CONTRIBUTING、ROADMAP、ARCHITECTURE

### Changed
- tauri.conf.json 添加 Windows Wix 中文支持
- tauri.conf.json 添加 Linux deb 依赖声明

### Security
- main 分支保护规则：PR + 1人审查

---

## [1.0.0] - 2026-07-07

### Added
- 🎮 **设备连接**：USB 自动检测（VID=0x0483）+ 虚拟设备模拟
- 🤖 **AI 教学**：多模型路由（OpenAI/Anthropic/Google/DeepSeek）+ 流式输出 + 数据脱敏
- 📦 **一键导入**：7 类资源包 + tar 打包极速传输 + Hash Tree 增量同步
- 🔧 **固件刷写**：双轨守护（RPC 协议 + dfu-util DFU 救砖）
- 📺 **屏幕镜像**：128x64 实时帧推送 + 物理按键遥控
- ⚡ **GPIO 沙盘**：8 引脚可视化控制 + OTG 模式开关
- 🏆 **成就系统**：10 个成就 + 进度追踪 + 持久化
- 🐬 **电子宠物**：喂食/玩耍/睡觉 + 状态系统 + localStorage 持久化
- 🔍 **诊断工具**：端口检测 + 设备信息 + 日志导出
- 📚 **7 节手把手课程**（认识设备 → 复制门禁 → 红外遥控 → Sub-GHz → BadUSB）
- 📜 **用户协议与隐私政策**（首次启动展示）
- 🏷️ **AI 生成内容标识**（符合《深度合成管理规定》）
- ⌨️ **全局键盘快捷键** + 帮助面板
- 🎨 **应用主题切换**（Cyberpunk / Green Terminal / Amber）
- 🔄 **GitHub Actions CI**（多平台矩阵构建）

### Security
- 🔐 API Key 系统钥匙串加密存储
- 🛡️ SSRF 防护（禁止内网/云元数据地址）
- 🔒 CSP 收紧（移除 unsafe-inline + localhost 通配）
- 📁 tar 路径穿越防护
- ⚙️ 配置文件原子写入 + 0600 权限
- 🎭 7 种脱敏模式（UID/NFC Key/WiFi/API Key/手机号/邮箱/坐标）

### Legal
- 📝 产品名 Dolphin Gang Tour（非官方产品，与 Flipper Devices Inc. 无关联）
- 🎨 原创海豚图标
- 📄 MIT 许可证 + THIRDPARTY.md 第三方组件声明
- ⚖️ GPL v2 许可证文本（dfu-util 参考）
- ⚠️ SubGHz/NFC/BadUSB 功能法律提示
- 🚨 第三方固件风险提示

---

## 版本说明

| 版本类型 | 说明 |
|---------|------|
| MAJOR | 不兼容的 API 变更 |
| MINOR | 向后兼容的功能新增 |
| PATCH | 向后兼容的 Bug 修复 |

### 发布节奏

- **Patch 版本**：Bug 修复，随时发布
- **Minor 版本**：新功能，每 2-4 周发布
- **Major 版本**：重大架构变更，不定期

---

[Unreleased]: https://github.com/immaotianyi/dolphin-gang-tour/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/immaotianyi/dolphin-gang-tour/releases/tag/v1.0.0
