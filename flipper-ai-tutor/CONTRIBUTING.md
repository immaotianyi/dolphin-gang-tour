# 贡献指南

感谢你对 Dolphin Gang Tour 的关注！欢迎提交 Issue 和 Pull Request。

## 开发环境

- Node.js >= 18
- Rust >= 1.75
- 系统依赖：
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev`
  - Windows: Microsoft Visual Studio C++ Build Tools

## 快速开始

```bash
git clone https://github.com/immaotianyi/dolphin-gang-tour.git
cd dolphin-gang-tour
npm install
npm run tauri:dev
```

## 代码规范

- **前端**：TypeScript strict 模式，React 函数组件 + Hooks
- **后端**：RustEdition 2021，零 `unwrap()`，使用 `anyhow::Result`
- **命名**：
  - Rust IPC 命令：`snake_case`（如 `device_scan`）
  - 前端函数：`camelCase`（如 `safeInvoke`）
  - React 组件：`PascalCase`（如 `AiChat`）
  - CSS class：`kebab-case`（如 `fw-btn`）
- **注释**：中文注释，模块级文档注释说明职责

## 提交格式

使用 Conventional Commits：

```
<type>: <description>

type 可选值:
  feat     新功能
  fix      修复 Bug
  docs     文档变更
  style    代码格式（不影响功能）
  refactor 重构
  test     测试相关
  chore    构建/工具变更
```

## PR 流程

1. Fork 仓库并创建分支：`git checkout -b feat/your-feature`
2. 确保编译通过：`npm run tauri:dev` 或 `cargo check`
3. 提交 PR，描述变更内容和动机

## 项目结构

详见 [README.md](README.md) 的目录结构章节。

## 许可证

提交的代码将以 MIT 许可证发布。
