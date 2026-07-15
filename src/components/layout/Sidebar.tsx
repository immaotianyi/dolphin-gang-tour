/** 侧边栏 — 设备状态 + 功能导航 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { useUiStore } from "@/stores/uiStore";
import { useDeviceStore } from "@/stores/deviceStore";
import type { NavItem, ViewId } from "@/types";

const NAV_ITEMS: { section: string; items: NavItem[] }[] = [
  {
    section: "sidebar.device",
    items: [
      { id: "dashboard", label: "sidebar.dashboard", icon: "dashboard", shortcut: "1" },
    ],
  },
  {
    section: "sidebar.modules",
    items: [
      { id: "nfc", label: "sidebar.nfcReader", icon: "nfc", shortcut: "2" },
      { id: "subghz", label: "sidebar.subghz", icon: "radio", shortcut: "3" },
      { id: "ir", label: "sidebar.infrared", icon: "ir", shortcut: "4" },
      { id: "badusb", label: "sidebar.badusb", icon: "keyboard", shortcut: "5" },
      { id: "gpio", label: "sidebar.gpio", icon: "circuit", shortcut: "6" },
      { id: "screen", label: "sidebar.screenMirror", icon: "mirror", shortcut: "S" },
    ],
  },
  {
    section: "sidebar.aiSystem",
    items: [
      { id: "ai", label: "sidebar.lucyAI", icon: "robot", shortcut: "7" },
      { id: "firmware", label: "sidebar.firmware", icon: "rocket", shortcut: "8" },
      { id: "library", label: "sidebar.library", icon: "database", shortcut: "L" },
      { id: "virtualLab", label: "sidebar.virtualLab", icon: "flask", shortcut: "V" },
      { id: "audit", label: "sidebar.audit", icon: "shield", shortcut: "A" },
      { id: "changelog", label: "sidebar.changelog", icon: "history", shortcut: "C" },
      { id: "releaseFreeze", label: "sidebar.releaseFreeze", icon: "lock", shortcut: "F" },
      { id: "settings", label: "sidebar.settings", icon: "settings", shortcut: "9" },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const { activeView, setView, sidebarCollapsed } = useUiStore();
  const { deviceInfo, connectionState, isVirtual } = useDeviceStore();

  if (sidebarCollapsed) return null;

  return (
    <aside
      className="app-sidebar"
      style={{ animation: "slide-in-up 0.3s var(--ease-apple)" }}
    >
      {/* Device status card */}
      <div
        style={{
          padding: "0.8rem",
          borderBottom: "2px solid var(--c-rule)",
        }}
      >
        <div
          className="font-pixel text-orange"
          style={{ fontSize: "0.6rem", marginBottom: "0.5rem", letterSpacing: "0.1em" }}
        >
          {t("sidebar.deviceStatus")}
        </div>

        {connectionState === "connected" && deviceInfo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="font-term text-ink" style={{ fontSize: "0.8rem" }}>
                {deviceInfo.name}
              </span>
              {isVirtual && <span className="pixel-badge pixel-badge-info">VIRT</span>}
            </div>
            <div className="font-mono text-dim" style={{ fontSize: "0.7rem" }}>
              {t("sidebar.fw")}: {deviceInfo.firmwareVersion}
            </div>
            <div style={{ display: "flex", gap: "0.8rem", marginTop: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Icon name="battery" size={12} style={{ color: "var(--c-green)" }} />
                <span className="font-mono text-dim" style={{ fontSize: "0.7rem" }}>
                  {deviceInfo.batteryLevel}%
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Icon name="signal" size={12} style={{ color: "var(--c-cyan)" }} />
                <span className="font-mono text-dim" style={{ fontSize: "0.7rem" }}>
                  {(deviceInfo.sdCardFree / 1e9).toFixed(1)}GB
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Icon name="bolt" size={12} style={{ color: "var(--c-yellow)" }} />
                <span className="font-mono text-dim" style={{ fontSize: "0.7rem" }}>
                  {deviceInfo.temperature}°C
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "0.5rem 0" }}>
            <span className="font-term text-muted" style={{ fontSize: "0.78rem" }}>
              {connectionState === "scanning" ? t("sidebar.scanning") : t("sidebar.noDevice")}
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "0.5rem 0" }}>
        {NAV_ITEMS.map((group) => (
          <div key={group.section} style={{ marginBottom: "0.8rem" }}>
            <div
              className="font-pixel text-muted"
              style={{
                fontSize: "0.55rem",
                letterSpacing: "0.12em",
                padding: "0.3rem 0.8rem",
                marginBottom: "0.2rem",
              }}
            >
              {t(group.section)}
            </div>
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id as ViewId)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.45rem 0.8rem",
                  background: activeView === item.id ? "rgba(249,115,22,0.1)" : "transparent",
                  border: "none",
                  borderLeft: activeView === item.id ? "3px solid var(--c-orange)" : "3px solid transparent",
                  color: activeView === item.id ? "var(--c-orange)" : "var(--c-dim)",
                  fontFamily: "var(--font-term)",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  transition: "all 0.2s var(--ease-apple)",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.color = "var(--c-ink)";
                    e.currentTarget.style.background = "rgba(249,115,22,0.04)";
                    e.currentTarget.style.transform = "translateX(4px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeView !== item.id) {
                    e.currentTarget.style.color = "var(--c-dim)";
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.transform = "translateX(0)";
                  }
                }}
              >
                <Icon name={item.icon} size={16} />
                <span style={{ flex: 1 }}>{t(item.label)}</span>
                {item.shortcut && (
                  <kbd style={{
                    background: "var(--c-bg3)",
                    border: "1px solid var(--c-rule)",
                    padding: "0.1rem 0.3rem",
                    fontSize: "0.6rem",
                    fontFamily: "var(--font-mono)",
                    color: "var(--c-muted)",
                  }}>
                    {item.shortcut}
                  </kbd>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "0.6rem 0.8rem",
          borderTop: "2px solid var(--c-rule)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>
          v0.7.0-rc1
        </span>
        <button
          onClick={() => useUiStore.getState().setModal("help")}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--c-muted)",
            cursor: "pointer",
            padding: "0.2rem",
          }}
        >
          <Icon name="help" size={14} />
        </button>
      </div>
    </aside>
  );
};
