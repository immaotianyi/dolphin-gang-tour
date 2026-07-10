# 贡献指南

感谢你对 **Dolphin Gang Tour** 的关注！无论你是想报告 Bug、提交新功能、改进文档，还是单纯想提建议，我们都非常欢迎。

---

## 📋 目录

- [项目概览](#项目概览)
- [开发环境搭建](#开发环境搭建)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [PR 流程](#pr-流程)
- [常见任务指南](#常见任务指南)
- [联系与沟通](#联系与沟通)

---

## 项目概览

### 这是什么项目？

Dolphin Gang Tour 是一个面向 Flipper Zero 的桌面伴侣应用，目标是让新手也能轻松上手 Flipper Zero，同时为老玩家提供一站式资源管理和固件刷写工具。

### 核心原则

1. **安全第一** — 所有功能必须遵守法律法规，绝不提供可能被滥用的功能
2. **用户友好** — 界面直观，新手零门槛
3. **代码质量** — 类型安全，零 `unwrap()`（除非确实安全），充分注释
4. **开源精神** — 尊重上游项目许可证，所有第三方资源标注来源

### 技术栈速览

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 |
| 后端 | Rust + Tokio + Protobuf |
| 前端 | React 18 + TypeScript + Vite |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS + 自定义像素风 CSS |

更详细的架构说明请参考 [ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 开发环境搭建

### 前置要求

- **Node.js** >= 18（推荐 20 LTS）
- **Rust** >= 1.75（推荐 stable）
- **系统依赖**：
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev`
  - **Windows**: Microsoft Visual Studio C++ Build Tools + WebView2

### 快速开始

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/immaotianyi/dolphin-gang-tour.git
cd dolphin-gang-tour

# 2. 安装前端依赖
npm install

# 3. 前端开发模式（浏览器预览，不连接硬件）
npm run dev
# → 打开 http://localhost:1420

# 4. Tauri 桌面应用开发模式（完整功能，可连接真机）
npm run tauri:dev

# 5. 打包发布
npm run tauri:build
# 产物在 src-tauri/target/release/bundle/
```

### 验证你的环境

```bash
# 前端类型检查
npx tsc --noEmit

# Rust 编译检查
cd src-tauri && cargo check

# Rust 代码质量检查
cd src-tauri && cargo clippy -- -D warnings
```

---

## 代码规范

### 前端 (TypeScript / React)

- **严格模式**：启用 `strict: true`，禁止 `any` 类型（除非必要且有注释）
- **组件**：函数组件 + Hooks，避免 class 组件
- **命名**：
  - 组件名：`PascalCase`（如 `AiChat`, `DeviceSidebar`）
  - 函数/变量：`camelCase`（如 `safeInvoke`, `deviceInfo`）
  - CSS class：`kebab-case`（如 `fw-btn`, `chat-bubble`）
  - 常量：`UPPER_SNAKE_CASE`
- **状态管理**：优先使用 Zustand store，组件内状态用 `useState`
- **IPC 调用**：统一通过 `src/lib/tauri.ts` 中的封装函数，不直接调用 `invoke`
- **注释**：中文注释，复杂逻辑必须说明设计思路

### 后端 (Rust)

- **Edition**：2021
- **错误处理**：使用 `anyhow::Result` / 自定义错误类型，禁止 `unwrap()`（测试代码除外）
- **命名**：
  - IPC 命令：`snake_case`（如 `device_scan`, `ai_chat`）
  - 结构体/枚举：`PascalCase`
  - 函数/变量：`snake_case`
- **并发**：使用 Tokio async，CPU 密集型任务用 `spawn_blocking`
- **日志**：使用 `log` crate，避免 `println!`
- **unsafe**：原则上禁止，如必须使用需加详细 SAFETY 注释
- **格式化**：`cargo fmt` 自动格式化

### 资源与素材

- 所有第三方资源（图片、字体、固件等）必须标注来源和许可证
- 二进制资源不要直接提交到 Git，使用下载脚本或 Git LFS
- 图标优先使用 SVG，保持像素风格一致

---

## 提交规范

我们使用 **Conventional Commits** 格式：

```
<type>: <description>

[可选的详细描述]

[可选的 footer，如 BREAKING CHANGE, Fixes #123]
```

### type 类型

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 Bug |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响功能，如空格、分号） |
| `refactor` | 重构（既不是新功能也不是修 Bug） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建工具、依赖升级等杂项 |
| `ci` | CI/CD 配置变更 |
| `revert` | 回滚提交 |

### 示例

```
feat: 添加NFC卡模拟可视化功能

- 实现卡片UID显示和扇区数据浏览
- 支持读写操作的进度反馈
- 添加安全提示弹窗

Closes #42
```

```
fix: 修复macOS上串口检测失败的问题

- 增加对IOService的错误处理
- 重试机制防止瞬时故障

Fixes #123
```

---

## PR 流程

### 1. 创建分支

从 `main` 分支创建你的功能分支：

```bash
git checkout main
git pull origin main
git checkout -b feat/your-feature-name
```

分支命名建议：
- 新功能：`feat/xxx`
- 修复：`fix/xxx`
- 文档：`docs/xxx`
- 重构：`refactor/xxx`

### 2. 开发与自测

- 确保代码可以编译通过
- 运行类型检查和 lint
- 手动测试你的改动
- 如有必要，添加测试用例

### 3. 提交 PR

- 推送你的分支到 GitHub
- 打开 Pull Request，目标分支为 `main`
- PR 标题遵循 Conventional Commits 格式
- PR 描述中说明：
  - 变更了什么（What）
  - 为什么这么做（Why）
  - 如何测试（How to test）
  - 相关 Issue 编号（Closes #xxx）
  - 截图/录屏（UI 相关改动必须有）

### 4. 代码审查

- 至少需要 1 位审查者批准才能合并
- 审查意见请认真对待，有不同意见可以讨论
- 审查通过后，由维护者合并（Squash Merge）

### 5. 合并后

- 你的贡献会出现在下一个 Release 中
- 恭喜！你已经是 Dolphin Gang Tour 的贡献者了 🎉

---

## 常见任务指南

### 添加一个新的 IPC 命令

1. 在 `src-tauri/src/lib.rs` 中添加 `#[tauri::command]` 函数
2. 在 `tauri::Builder` 中注册命令（`.invoke_handler`）
3. 在 `src/lib/tauri.ts` 中添加对应的前端封装函数
4. 添加类型定义（`src/types/`）
5. 更新文档

### 添加一个新的视图/面板

1. 在 `src/components/` 中创建组件
2. 在 `src/stores/uiStore.ts` 中添加视图 ID
3. 在侧边栏菜单中添加入口
4. 在 `App.tsx` 中添加渲染逻辑
5. 更新快捷键（`useKeyboardShortcuts.ts`）

### 添加一个新的资源包类型

1. 在 `src-tauri/src/import/` 中添加导入逻辑
2. 在前端添加对应的 UI 组件
3. 更新资源包元数据
4. 添加安全审查逻辑（如适用）

---

## 联系与沟通

### 提交 Issue

遇到 Bug 或有功能建议？欢迎提 Issue：
- **Bug 报告**：请描述复现步骤、预期行为、实际行为、环境信息
- **功能建议**：请说明使用场景和期望效果

### 社区交流

- **抖音**：[@Ciao778899](https://v.douyin.com/SeSACarhNWo/) — 项目演示和开发日常
- **GitHub Discussions**：通用讨论、问答、想法分享

### 维护者

- **MAO** ([@immaotianyi](https://github.com/immaotianyi)) — 项目创始人

---

## 行为准则

参与本项目请遵守以下原则：

- 尊重他人，友善沟通
- 对事不对人
- 鼓励不同意见和建设性讨论
- 拒绝人身攻击、骚扰、歧视性言论

违反者将被禁止参与项目。

---

再次感谢你的贡献！🐬✨
