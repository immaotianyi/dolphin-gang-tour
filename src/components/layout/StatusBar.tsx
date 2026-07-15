/** 底部状态栏 — 连接/视图/AI/地区/隐私/控制台 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeviceStore } from "@/stores/deviceStore";
import { useUiStore } from "@/stores/uiStore";
import { useChatStore } from "@/stores/chatStore";
import { Icon } from "@/components/ui/Icon";
import { invoke } from "@/lib/tauri";

export const StatusBar: React.FC = () => {
  const { t } = useTranslation();
  const { connectionState, isVirtual } = useDeviceStore();
  const { activeView, consoleVisible, toggleConsole } = useUiStore();
  const { model, isStreaming } = useChatStore();
  const [region, setRegion] = useState<string>("GLOBAL");
  const [privacyOn] = useState(true);

  useEffect(() => {
    if (connectionState === "connected") {
      invoke<{ region: string; name: string }>("subghz_get_region")
        .then((r) => setRegion(r.region.toUpperCase()))
        .catch(() => {});
    }
  }, [connectionState]);

  return (
    <div className="app-statusbar">
      {/* Connection */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <span
          className={`led ${
            connectionState === "connected"
              ? isVirtual ? "cyan" : "green"
              : connectionState === "scanning" ? "yellow" : "red"
          } blink`}
        />
        <span>
          {connectionState === "connected"
            ? isVirtual ? t("status.virtual") : t("connection.usb")
            : connectionState === "scanning" ? t("status.scanShort") : t("status.offline")}
        </span>
      </div>

      <span style={{ color: "var(--c-rule-light)" }}>│</span>

      <span style={{ color: "var(--c-muted)" }}>{t("status.view")}: </span>
      <span style={{ color: "var(--c-orange)", textTransform: "uppercase" }}>{activeView}</span>

      <span style={{ color: "var(--c-rule-light)" }}>│</span>

      {/* Region */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <Icon name="signal" size={10} style={{ color: region === "GLOBAL" ? "var(--c-yellow)" : "var(--c-green)" }} />
        <span style={{ color: region === "GLOBAL" ? "var(--c-yellow)" : "var(--c-muted)" }}>
          {region}
        </span>
      </div>

      <span style={{ color: "var(--c-rule-light)" }}>│</span>

      {/* AI */}
      <span style={{ color: "var(--c-muted)" }}>{t("status.ai")}: </span>
      <span style={{ color: "var(--c-purple)" }}>{model.toUpperCase()}</span>
      {isStreaming && (
        <span style={{ color: "var(--c-yellow)" }}>
          <span className="led yellow blink" style={{ marginLeft: "0.3rem" }} />
          {t("status.streaming")}
        </span>
      )}

      <span style={{ color: "var(--c-rule-light)" }}>│</span>

      {/* Privacy */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
        <Icon name="shield" size={10} style={{ color: privacyOn ? "var(--c-green)" : "var(--c-red)" }} />
        <span style={{ color: privacyOn ? "var(--c-green)" : "var(--c-red)", fontSize: "0.65rem" }}>
          {privacyOn ? t("status.privacyOn") : t("status.privacyOff")}
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Console toggle */}
      <button
        onClick={toggleConsole}
        style={{
          background: consoleVisible ? "var(--c-bg3)" : "transparent",
          border: "1px solid var(--c-rule)",
          color: consoleVisible ? "var(--c-cyan)" : "var(--c-muted)",
          padding: "0.1rem 0.5rem",
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
        }}
      >
        <Icon name="terminal" size={10} />
        {t("status.console")}
      </button>
    </div>
  );
};
