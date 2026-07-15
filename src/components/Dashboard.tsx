/** Dashboard 仪表盘 — 设备数字孪生 + 快速任务 + 风险中心 + 事件时间线 */
import React, { useEffect, useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Icon } from "@/components/ui/Icon";
import { DeviceStatusPill } from "@/components/ui/DeviceStatusPill";
import { Timeline } from "@/components/ui/Timeline";
import { showToast } from "@/components/ui/Toast";
import { useDeviceStore } from "@/stores/deviceStore";
import { useUiStore } from "@/stores/uiStore";
import type { TimelineEntry } from "@/stores/uiStore";
import type { DeviceHealth } from "@/types";
import { invoke } from "@/lib/tauri";

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { deviceInfo, connectionState, isVirtual, scan, getInfo } = useDeviceStore();
  const { setView, timeline, addTimelineEntry } = useUiStore();
  const [health, setHealth] = useState<DeviceHealth | null>(null);
  const [region, setRegion] = useState<{ region: string; name: string } | null>(null);
  const [policyCount, setPolicyCount] = useState(0);

  // ----- Data loading -----
  useEffect(() => {
    if (connectionState === "disconnected") {
      scan();
    } else if (connectionState === "connected") {
      if (!deviceInfo) getInfo();
      invoke<DeviceHealth>("device_health").then(setHealth).catch(() => {});
      invoke<{ region: string; name: string }>("subghz_get_region").then(setRegion).catch(() => {});
      invoke<unknown[]>("policy_list").then((p) => setPolicyCount(p.length)).catch(() => {});
    }
  }, [connectionState]);

  // ----- Timeline auto-add on connection state changes -----
  const prevConnRef = useRef(connectionState);
  useEffect(() => {
    if (prevConnRef.current === connectionState) return;
    const prev = prevConnRef.current;
    prevConnRef.current = connectionState;

    if (connectionState === "connected") {
      addTimelineEntry({ type: "connect", message: t("connection.connected") });
      showToast("success", t("connection.connected"));
      if (isVirtual) {
        addTimelineEntry({ type: "info", message: t("connection.fallingBack") });
      }
    } else if (connectionState === "disconnected" && prev !== "disconnected") {
      addTimelineEntry({ type: "disconnect", message: t("connection.disconnected") });
    } else if (connectionState === "error") {
      addTimelineEntry({ type: "error", message: t("connection.error") });
      showToast("error", t("connection.error"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionState]);

  // ----- Derived values -----
  const pillStatus =
    isVirtual && connectionState === "connected" ? "virtual" : connectionState;

  const pillLabel =
    pillStatus === "connected" ? t("connection.connected")
    : pillStatus === "virtual" ? t("connection.virtual")
    : pillStatus === "scanning" ? t("connection.scanning")
    : pillStatus === "error" ? t("connection.error")
    : t("connection.disconnected");

  const isConnected = connectionState === "connected" && !!deviceInfo;

  const regionLabel = region
    ? t(`region.${region.region}`, { defaultValue: region.name || t("region.global") })
    : t("region.global");

  const quickActions = [
    { icon: "nfc" as const, label: t("dashboard.scanNFC"), view: "nfc" as const, color: "var(--c-cyan)", risk: "safe" as const },
    { icon: "radio" as const, label: t("dashboard.listenSubghz"), view: "subghz" as const, color: "var(--c-orange)", risk: "caution" as const },
    { icon: "ir" as const, label: t("dashboard.learnIR"), view: "ir" as const, color: "var(--c-red)", risk: "safe" as const },
    { icon: "keyboard" as const, label: t("dashboard.reviewBadusb"), view: "badusb" as const, color: "var(--c-purple)", risk: "danger" as const },
    { icon: "circuit" as const, label: t("nav.gpio"), view: "gpio" as const, color: "var(--c-green)", risk: "caution" as const },
    { icon: "robot" as const, label: t("dashboard.askAI"), view: "ai" as const, color: "var(--c-orange)", risk: "safe" as const },
    { icon: "flask" as const, label: t("virtual.title"), view: "virtualLab" as const, color: "var(--c-cyan)", risk: "safe" as const },
    { icon: "database" as const, label: t("library.title"), view: "library" as const, color: "var(--c-green)", risk: "safe" as const },
    { icon: "shield" as const, label: t("audit.title"), view: "audit" as const, color: "var(--c-yellow)", risk: "safe" as const },
  ];

  const riskColor = (r: string) =>
    r === "danger" ? "var(--c-red)" : r === "caution" ? "var(--c-yellow)" : "var(--c-green)";

  const riskLabel = (r: string) =>
    r === "danger" ? t("risk.dangerous") : r === "caution" ? t("risk.caution") : t("risk.safe");

  const tlEntries: TimelineEntry[] = timeline;

  // Compute health score
  const healthScore = useMemo(() => {
    let score = 100;
    if (connectionState === "disconnected" || connectionState === "error") score -= 30;
    if (connectionState === "scanning") score -= 10;
    if (isVirtual) score -= 5;
    if (health?.is_virtual) score -= 5;
    if (health?.pending_ai_commands && health.pending_ai_commands > 0) score -= 5;
    return Math.max(0, Math.min(100, score));
  }, [connectionState, isVirtual, health]);

  const healthLabel = healthScore >= 90 ? t("health.excellent")
    : healthScore >= 70 ? t("health.good")
    : healthScore >= 50 ? t("health.fair")
    : healthScore >= 30 ? t("health.poor")
    : t("health.critical");

  const healthColor = healthScore >= 90 ? "var(--c-green)"
    : healthScore >= 70 ? "var(--c-cyan)"
    : healthScore >= 50 ? "var(--c-yellow)"
    : healthScore >= 30 ? "var(--c-orange)"
    : "var(--c-red)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* ===== 0. Health Score Bar ===== */}
      <PixelPanel style={{ padding: "0.5rem 0.8rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <Icon name="shield" size={16} style={{ color: healthColor }} />
          <span className="font-pixel text-ink" style={{ fontSize: "0.7rem" }}>
            {t("health.title")}
          </span>
          <div style={{ flex: 1, height: 8, background: "var(--c-bg3)", border: "1px solid var(--c-rule)" }}>
            <div style={{
              height: "100%", width: `${healthScore}%`, background: healthColor,
              transition: "width 0.5s var(--ease-apple)",
            }} />
          </div>
          <span className="font-pixel" style={{ fontSize: "0.9rem", color: healthColor }}>
            {healthScore}
          </span>
          <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>
            {healthLabel}
          </span>
        </div>
      </PixelPanel>

      {/* ===== 1. Top device status bar ===== */}
      <PixelPanel>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0" }}>
          {/* Device digital twin icon */}
          <div
            style={{
              width: 56,
              height: 56,
              background: "var(--c-bg3)",
              border: `2px solid ${isConnected ? "var(--c-orange)" : "var(--c-rule)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: isConnected ? "0 0 12px rgba(255,163,71,0.2)" : "none",
              transition: "all 0.25s var(--ease-apple)",
            }}
          >
            <Icon
              name={
                connectionState === "connected" ? "chip"
                : connectionState === "scanning" ? "search"
                : connectionState === "error" ? "warning"
                : "power"
              }
              size={28}
              style={{ color: isConnected ? "var(--c-orange)" : "var(--c-muted)" }}
            />
          </div>

          {/* Title + status line */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="font-pixel"
              style={{ fontSize: "1.4rem", color: "var(--c-orange)", letterSpacing: "0.05em" }}
            >
              {t("dashboard.welcome")}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginTop: "0.25rem",
              }}
            >
              <DeviceStatusPill status={pillStatus} label={pillLabel} />
              {isConnected && (
                <span className="font-term text-dim" style={{ fontSize: "0.82rem" }}>
                  <span className="font-mono text-ink">{deviceInfo.name}</span>
                  {" · "}
                  {t("dashboard.firmware")} {deviceInfo.firmwareVersion}
                </span>
              )}
              {isConnected && isVirtual && (
                <span
                  className="font-pixel"
                  style={{
                    fontSize: "0.55rem",
                    color: "var(--c-cyan)",
                    border: "1px solid var(--c-cyan)",
                    padding: "0.1rem 0.3rem",
                    background: "rgba(34,211,238,0.1)",
                    letterSpacing: "0.05em",
                  }}
                >
                  VIRTUAL MODE
                </span>
              )}
            </div>
          </div>

          {/* Right side: policy count or scan button */}
          {isConnected ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "0.2rem",
              }}
            >
              {policyCount > 0 && (
                <div className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>
                  {policyCount} {t("security.rules")}
                </div>
              )}
              <div className="font-pixel" style={{ fontSize: "0.6rem", color: "var(--c-green)" }}>
                ● ONLINE
              </div>
            </div>
          ) : connectionState === "disconnected" ? (
            <PixelButton variant="primary" icon="search" onClick={scan}>
              {t("connection.scanNow")}
            </PixelButton>
          ) : null}
        </div>
      </PixelPanel>

      {/* ===== 2. Health metrics row (4 cards, only when connected) ===== */}
      {isConnected && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.6rem" }}>
          <HealthCard
            icon="battery"
            label={t("dashboard.battery")}
            value={`${deviceInfo.batteryLevel}%`}
            color={
              deviceInfo.batteryLevel > 30 ? "var(--c-green)"
              : deviceInfo.batteryLevel > 15 ? "var(--c-yellow)"
              : "var(--c-red)"
            }
          />
          <HealthCard
            icon="chip"
            label={t("dashboard.temperature")}
            value={`${deviceInfo.temperature}°C`}
            color={
              deviceInfo.temperature < 50 ? "var(--c-green)"
              : deviceInfo.temperature < 70 ? "var(--c-yellow)"
              : "var(--c-red)"
            }
          />
          <HealthCard
            icon="package"
            label={t("dashboard.sdFree")}
            value={`${(deviceInfo.sdCardFree / 1e9).toFixed(1)}GB`}
            color="var(--c-cyan)"
          />
          <HealthCard
            icon="signal"
            label={t("dashboard.region")}
            value={regionLabel.toUpperCase()}
            color="var(--c-orange)"
          />
        </div>
      )}

      {/* ===== 3. Quick Actions grid (3 columns x 2 rows) ===== */}
      <PixelPanel title={t("dashboard.quickActions")}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.6rem" }}>
          {quickActions.map((action) => (
            <button
              key={action.view}
              onClick={() => setView(action.view)}
              title={riskLabel(action.risk)}
              style={{
                background: "var(--c-bg3)",
                border: "2px solid var(--c-rule)",
                padding: "0.8rem 0.5rem",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.4rem",
                transition: "all 0.25s var(--ease-apple)",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = action.color;
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 4px 0 var(--c-bg4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--c-rule)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {/* Risk indicator dot */}
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 6,
                  height: 6,
                  background: riskColor(action.risk),
                }}
              />
              <Icon name={action.icon} size={24} style={{ color: action.color }} />
              <span
                className="font-pixel text-ink"
                style={{ fontSize: "0.62rem", letterSpacing: "0.03em" }}
              >
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </PixelPanel>

      {/* ===== 4. Two-column: Device Info + Security Status ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isConnected ? "1fr 1fr" : "1fr",
          gap: "1rem",
        }}
      >
        {/* Device Info panel (left) */}
        <PixelPanel title={t("dashboard.deviceInfo")}>
          {isConnected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <InfoRow label="Name" value={deviceInfo.name} />
              <InfoRow
                label={t("dashboard.firmware")}
                value={deviceInfo.firmwareVersion}
                color="var(--c-cyan)"
              />
              <InfoRow
                label={t("dashboard.battery")}
                value={`${deviceInfo.batteryLevel}%`}
                color={deviceInfo.batteryLevel > 30 ? "var(--c-green)" : "var(--c-yellow)"}
              />
              <InfoRow
                label={t("dashboard.sdFree")}
                value={`${(deviceInfo.sdCardFree / 1e9).toFixed(2)} GB`}
              />
              <InfoRow
                label="SD Total"
                value={`${(deviceInfo.sdCardTotal / 1e9).toFixed(2)} GB`}
              />
              <InfoRow
                label={t("dashboard.uptime")}
                value={`${Math.floor(deviceInfo.uptime / 3600)}h ${Math.floor(
                  (deviceInfo.uptime % 3600) / 60
                )}m`}
              />
              <InfoRow
                label={t("dashboard.temperature")}
                value={`${deviceInfo.temperature}°C`}
                color={deviceInfo.temperature < 50 ? "var(--c-green)" : "var(--c-yellow)"}
              />
              {health?.pending_ai_commands !== undefined && health.pending_ai_commands > 0 && (
                <InfoRow
                  label={t("dashboard.pendingAI")}
                  value={`${health.pending_ai_commands}`}
                  color="var(--c-orange)"
                />
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <div
                className="font-term text-muted"
                style={{ fontSize: "0.85rem", marginBottom: "0.8rem" }}
              >
                {connectionState === "scanning"
                  ? t("connection.scanning")
                  : t("connection.noDevice")}
              </div>
              <PixelButton variant="primary" icon="refresh" onClick={scan}>
                {t("connection.scanNow")}
              </PixelButton>
            </div>
          )}
        </PixelPanel>

        {/* Security Status panel (right, only when connected) */}
        {isConnected && (
          <PixelPanel title={t("dashboard.securityStatus")}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <SecurityItem
                icon="shield"
                label={t("security.commandPolicy")}
                status={`${policyCount} ${t("security.rules")}`}
                ok={policyCount > 0}
              />
              <SecurityItem
                icon="lock"
                label={t("security.privacyMode")}
                status={`ON (${t("security.sanitizing")})`}
                ok={true}
              />
              <SecurityItem
                icon="warning"
                label={t("security.badusbReview")}
                status={t("security.threeStageEnforced")}
                ok={true}
              />
              <SecurityItem
                icon="radio"
                label={t("security.regionCheck")}
                status={regionLabel}
                ok={region?.region !== "global"}
              />
              <SecurityItem
                icon="robot"
                label={t("security.aiCommands")}
                status={t("security.approvalRequired")}
                ok={true}
              />
              <SecurityItem
                icon="chip"
                label={t("security.virtualMode")}
                status={isVirtual ? t("security.activeNoHw") : t("security.hardware")}
                ok={!isVirtual}
              />
            </div>
            <div
              style={{
                marginTop: "0.8rem",
                paddingTop: "0.6rem",
                borderTop: "1px solid var(--c-rule)",
              }}
            >
              <PixelButton
                variant="ghost"
                icon="settings"
                iconSize={12}
                onClick={() => setView("settings")}
                style={{ width: "100%", fontSize: "0.7rem" }}
              >
                {t("settings.security")}
              </PixelButton>
            </div>
          </PixelPanel>
        )}
      </div>

      {/* ===== 5. Diagnostics + Audit quick row ===== */}
      <PixelPanel>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <PixelButton
            variant="ghost"
            icon="shield"
            iconSize={14}
            onClick={() => setView("library")}
            style={{ fontSize: "0.72rem" }}
          >
            {t("audit.title")}
          </PixelButton>
          <PixelButton
            variant="ghost"
            icon="file"
            iconSize={14}
            onClick={async () => {
              try {
                const diag = await invoke("cmd_export_diagnostics", {
                  isVirtual: isVirtual,
                  connectionState: connectionState,
                });
                const json = JSON.stringify(diag, null, 2);
                await navigator.clipboard.writeText(json);
                showToast("success", t("diagnostics.exportSuccess"));
                addTimelineEntry({ type: "info", message: t("diagnostics.export"), detail: t("diagnostics.privacyNote") });
              } catch (e) {
                showToast("error", t("diagnostics.exportFailed") + ": " + String(e));
              }
            }}
            style={{ fontSize: "0.72rem" }}
          >
            {t("diagnostics.export")}
          </PixelButton>
          <PixelButton
            variant="ghost"
            icon="flask"
            iconSize={14}
            onClick={() => setView("virtualLab")}
            style={{ fontSize: "0.72rem" }}
          >
            {t("virtual.title")}
          </PixelButton>
        </div>
      </PixelPanel>

      {/* ===== 6. Event Timeline (full width) ===== */}
      <PixelPanel title={t("dashboard.eventTimeline")}>
        {tlEntries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <div className="font-term text-muted" style={{ fontSize: "0.82rem" }}>
              {t("dashboard.noRecentActivity")}
            </div>
          </div>
        ) : (
          <Timeline entries={tlEntries} />
        )}
      </PixelPanel>
    </div>
  );
};

// ===== Helper components =====

const InfoRow: React.FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0.15rem 0",
    }}
  >
    <span className="font-term text-dim" style={{ fontSize: "0.78rem" }}>
      {label}
    </span>
    <span
      className="font-mono"
      style={{ fontSize: "0.78rem", color: color || "var(--c-ink)" }}
    >
      {value}
    </span>
  </div>
);

const HealthCard: React.FC<{
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => (
  <div
    style={{
      background: "var(--c-bg3)",
      border: "2px solid var(--c-rule)",
      padding: "0.6rem",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.3rem",
      transition: "border-color 0.3s var(--ease-apple)",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = color;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = "var(--c-rule)";
    }}
  >
    <Icon name={icon} size={20} style={{ color }} />
    <span
      className="font-mono"
      style={{ fontSize: "0.9rem", color, fontWeight: "bold" }}
    >
      {value}
    </span>
    <span
      className="font-pixel"
      style={{ fontSize: "0.55rem", color: "var(--c-muted)", letterSpacing: "0.05em" }}
    >
      {label}
    </span>
  </div>
);

const SecurityItem: React.FC<{
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  status: string;
  ok: boolean;
}> = ({ icon, label, status, ok }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.35rem 0.5rem",
      background: ok ? "rgba(74,222,128,0.04)" : "rgba(250,204,21,0.06)",
      border: `1px solid ${ok ? "rgba(74,222,128,0.2)" : "var(--c-yellow)"}`,
    }}
  >
    <Icon name={icon} size={14} style={{ color: ok ? "var(--c-green)" : "var(--c-yellow)" }} />
    <span className="font-term" style={{ fontSize: "0.75rem", flex: 1 }}>
      {label}
    </span>
    <span
      className="font-mono"
      style={{ fontSize: "0.7rem", color: ok ? "var(--c-green)" : "var(--c-yellow)" }}
    >
      {status}
    </span>
  </div>
);
