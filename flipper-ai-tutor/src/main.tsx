/**
 * React 入口
 * 渲染 App 到 #root，并引入全局样式（Tailwind + 自定义像素终端主题）
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/styles/globals.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("找不到 #root 挂载节点");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
