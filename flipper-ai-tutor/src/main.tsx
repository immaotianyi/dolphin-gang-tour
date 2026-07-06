/**
 * React 入口
 * 渲染 App 到 #root，并引入全局样式（Tailwind + 自定义像素终端主题）
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/styles/globals.css";
// 提前加载主题 store：在渲染前读取 localStorage 并设置 data-theme，
// 避免首屏闪烁，同时保证 SettingsModal 未挂载时主题仍生效。
import "@/stores/themeStore";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("找不到 #root 挂载节点");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
