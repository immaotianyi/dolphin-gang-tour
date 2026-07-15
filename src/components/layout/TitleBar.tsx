/** 顶部标题栏 — 窗口控制 + Logo + 全局搜索 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { useUiStore } from "@/stores/uiStore";
import { useDeviceStore } from "@/stores/deviceStore";

export const TitleBar: React.FC = () => {
  const { t } = useTranslation();
  const { toggleSidebar, setModal } = useUiStore();
  const { connectionState, isVirtual } = useDeviceStore();

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 44,
        background: "var(--c-bg2)",
        borderBottom: "2px solid var(--c-rule)",
        display: "flex",
        alignItems: "center",
        padding: "0 0.8rem",
        gap: "0.5rem",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {/* Sidebar toggle */}
      <button
        className="pixel-btn pixel-btn-ghost"
        onClick={toggleSidebar}
        style={{ padding: "0.3rem 0.4rem", minWidth: "auto" }}
        title={t("titlebar.toggleSidebar")}
      >
        <Icon name="menu" size={16} />
      </button>

      {/* Logo */}
      <div
        className="font-pixel"
        style={{
          fontSize: "1rem",
          color: "var(--c-orange)",
          letterSpacing: "0.08em",
          marginLeft: "0.3rem",
        }}
      >
        LUCY<span style={{ animation: "blink 1s step-end infinite" }}>_</span>
      </div>

      {/* Connection status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          marginLeft: "0.8rem",
          padding: "0.15rem 0.5rem",
          border: "1px solid var(--c-rule)",
          background: "var(--c-bg3)",
        }}
      >
        <span
          className={`led ${
            connectionState === "connected"
              ? isVirtual ? "cyan" : "green"
              : connectionState === "scanning"
              ? "yellow blink"
              : "red"
          }`}
        />
        <span className="font-mono text-dim" style={{ fontSize: "0.72rem" }}>
          {connectionState === "connected"
            ? isVirtual ? t("titlebar.virtualMode") : t("titlebar.deviceConnected")
            : connectionState === "scanning"
            ? t("titlebar.scanning")
            : connectionState === "error"
            ? t("titlebar.connectionError")
            : t("titlebar.disconnected")}
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Command palette */}
      <button
        className="pixel-btn pixel-btn-ghost"
        onClick={() => setModal("commandPalette")}
        style={{ gap: "0.4rem", fontSize: "0.75rem" }}
        title={t("titlebar.commandPalette")}
      >
        <Icon name="search" size={14} />
        <span className="font-term text-dim">{t("titlebar.search")}</span>
        <kbd style={{
          background: "var(--c-bg3)",
          border: "1px solid var(--c-rule)",
          padding: "0.1rem 0.3rem",
          fontSize: "0.65rem",
          fontFamily: "var(--font-mono)",
          color: "var(--c-orange)",
          marginLeft: "0.3rem",
        }}>
          ⌘K
        </kbd>
      </button>

      {/* Settings */}
      <button
        className="pixel-btn pixel-btn-ghost"
        onClick={() => setModal("settings")}
        style={{ padding: "0.3rem 0.4rem", minWidth: "auto" }}
        title={t("titlebar.settings")}
      >
        <Icon name="settings" size={16} />
      </button>
    </div>
  );
};
