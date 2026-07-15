/** Audit Center 审计中心 — P7: 独立审计页面 + 筛选 + 导出 + 审批链路 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { showToast } from "@/components/ui/Toast";
import { invoke } from "@/lib/tauri";
import { useUiStore } from "@/stores/uiStore";
import type { RiskLevel, AuditLogEntry } from "@/types";

type ModuleFilter = "all" | "nfc" | "subghz" | "ir" | "badusb" | "gpio" | "firmware" | "system";
type RiskFilter = "all" | "safe" | "caution" | "dangerous" | "blocked";
type TimeFilter = "all" | "today" | "week" | "month";

const MODULE_FILTERS: { id: ModuleFilter; labelKey: string }[] = [
  { id: "all", labelKey: "common.all" },
  { id: "nfc", labelKey: "audit.modules.nfc" },
  { id: "subghz", labelKey: "audit.modules.subghz" },
  { id: "ir", labelKey: "audit.modules.ir" },
  { id: "badusb", labelKey: "audit.modules.badusb" },
  { id: "firmware", labelKey: "audit.modules.firmware" },
  { id: "system", labelKey: "audit.modules.system" },
];

const RISK_FILTERS: { id: RiskFilter; labelKey: string }[] = [
  { id: "all", labelKey: "common.all" },
  { id: "safe", labelKey: "risk.safe" },
  { id: "caution", labelKey: "risk.caution" },
  { id: "dangerous", labelKey: "risk.dangerous" },
  { id: "blocked", labelKey: "risk.blocked" },
];

const TIME_FILTERS: { id: TimeFilter; labelKey: string }[] = [
  { id: "all", labelKey: "common.all" },
  { id: "today", labelKey: "common.today" },
  { id: "week", labelKey: "common.thisWeek" },
  { id: "month", labelKey: "common.thisMonth" },
];

const RISK_COLOR: Record<string, string> = {
  safe: "var(--c-green)",
  caution: "var(--c-yellow)",
  dangerous: "var(--c-orange)",
  blocked: "var(--c-red)",
};

const SOURCE_COLOR: Record<string, string> = {
  User: "var(--c-cyan)",
  AI: "var(--c-orange)",
  AiApproved: "var(--c-green)",
  System: "var(--c-muted)",
  AutoConnect: "var(--c-cyan)",
};

export const AuditCenterModule: React.FC = () => {
  const { t } = useTranslation();
  const { addTimelineEntry } = useUiStore();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [stats, setStats] = useState({ total: 0, byRisk: {} as Record<string, number>, byModule: {} as Record<string, number> });

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<AuditLogEntry[]>("cmd_audit_list", { limit: 500 });
      setLogs(data);
      // Compute stats
      const byRisk: Record<string, number> = {};
      const byModule: Record<string, number> = {};
      for (const log of data) {
        byRisk[log.risk_level] = (byRisk[log.risk_level] || 0) + 1;
        byModule[log.module] = (byModule[log.module] || 0) + 1;
      }
      setStats({ total: data.length, byRisk, byModule });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Time filter
  const now = Date.now() / 1000;
  const timeThreshold = useMemo(() => {
    switch (timeFilter) {
      case "today": return now - 86400;
      case "week": return now - 604800;
      case "month": return now - 2592000;
      default: return 0;
    }
  }, [timeFilter, now]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (moduleFilter !== "all" && log.module !== moduleFilter) return false;
      if (riskFilter !== "all" && log.risk_level !== riskFilter) return false;
      if (timeFilter !== "all" && log.timestamp < timeThreshold) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const text = `${log.command} ${log.detail ?? ""} ${log.source}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [logs, moduleFilter, riskFilter, timeFilter, timeThreshold, searchQuery]);

  const handleExport = useCallback(() => {
    const exportData = {
      exported_at: new Date().toISOString(),
      total_records: filteredLogs.length,
      filters: { module: moduleFilter, risk: riskFilter, time: timeFilter },
      logs: filteredLogs,
    };
    const json = JSON.stringify(exportData, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      showToast("success", t("audit.exportSuccess"));
      addTimelineEntry({ type: "security", message: t("audit.export"), detail: `${filteredLogs.length} records` });
    }).catch(() => {
      showToast("error", t("audit.export") + " failed");
    });
  }, [filteredLogs, moduleFilter, riskFilter, timeFilter, t, addTimelineEntry]);

  const handleClear = useCallback(async () => {
    try {
      await invoke("cmd_audit_clear");
      setLogs([]);
      setStats({ total: 0, byRisk: {}, byModule: {} });
      showToast("success", t("audit.clearSuccess"));
      addTimelineEntry({ type: "security", message: t("audit.clearAll") });
    } catch (e) {
      showToast("error", String(e));
    }
  }, [t, addTimelineEntry]);

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleString();
  };

  return (
    <div style={{ padding: "1rem", overflowY: "auto", height: "100%" }}>
      {/* Header */}
      <PixelPanel style={{ padding: "1rem", marginBottom: "0.8rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
          <div style={{
            width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(250,204,21,0.1)", border: "2px solid var(--c-yellow)",
          }}>
            <Icon name="shield" size={28} style={{ color: "var(--c-yellow)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 className="font-pixel text-ink" style={{ fontSize: "1rem", letterSpacing: "0.05em" }}>
              {t("audit.title")}
            </h2>
            <p className="font-term text-dim" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>
              {t("audit.subtitle")}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="font-pixel text-yellow" style={{ fontSize: "1.2rem" }}>{stats.total}</div>
            <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{t("audit.total")}</div>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
          {Object.entries(stats.byRisk).map(([risk, count]) => (
            <div key={risk} style={{
              padding: "0.2rem 0.5rem", border: `1px solid ${RISK_COLOR[risk] || "var(--c-rule)"}`,
              background: `${RISK_COLOR[risk] || "var(--c-bg3)"}10`,
            }}>
              <span className="font-mono" style={{ fontSize: "0.65rem", color: RISK_COLOR[risk] || "var(--c-muted)" }}>
                {t(`risk.${risk}`)}: {count}
              </span>
            </div>
          ))}
        </div>
      </PixelPanel>

      {/* Filters */}
      <PixelPanel style={{ padding: "0.6rem", marginBottom: "0.8rem" }}>
        {/* Search */}
        <input
          type="text"
          placeholder={t("audit.title")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%", padding: "0.4rem 0.6rem", marginBottom: "0.5rem",
            background: "var(--c-bg2)", border: "1px solid var(--c-rule)",
            color: "var(--c-ink)", fontFamily: "var(--font-mono)", fontSize: "0.75rem",
          }}
        />

        {/* Module filters */}
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
          <span className="font-mono text-muted" style={{ fontSize: "0.6rem", marginRight: "0.3rem", lineHeight: "1.6" }}>
            {t("audit.filterByModule")}:
          </span>
          {MODULE_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setModuleFilter(f.id)}
              style={{
                padding: "0.15rem 0.4rem", fontSize: "0.65rem", cursor: "pointer",
                background: moduleFilter === f.id ? "var(--c-bg3)" : "transparent",
                border: `1px solid ${moduleFilter === f.id ? "var(--c-accent)" : "var(--c-rule)"}`,
                color: moduleFilter === f.id ? "var(--c-accent)" : "var(--c-muted)",
              }}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        {/* Risk filters */}
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
          <span className="font-mono text-muted" style={{ fontSize: "0.6rem", marginRight: "0.3rem", lineHeight: "1.6" }}>
            {t("audit.filterByRisk")}:
          </span>
          {RISK_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setRiskFilter(f.id)}
              style={{
                padding: "0.15rem 0.4rem", fontSize: "0.65rem", cursor: "pointer",
                background: riskFilter === f.id ? "var(--c-bg3)" : "transparent",
                border: `1px solid ${riskFilter === f.id ? (RISK_COLOR[f.id] || "var(--c-accent)") : "var(--c-rule)"}`,
                color: riskFilter === f.id ? (RISK_COLOR[f.id] || "var(--c-accent)") : "var(--c-muted)",
              }}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        {/* Time filters + Actions */}
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
            {TIME_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setTimeFilter(f.id)}
                style={{
                  padding: "0.15rem 0.4rem", fontSize: "0.65rem", cursor: "pointer",
                  background: timeFilter === f.id ? "var(--c-bg3)" : "transparent",
                  border: `1px solid ${timeFilter === f.id ? "var(--c-accent2)" : "var(--c-rule)"}`,
                  color: timeFilter === f.id ? "var(--c-accent2)" : "var(--c-muted)",
                }}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <PixelButton variant="ghost" onClick={handleExport} style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem" }}>
              <Icon name="file" size={12} style={{ marginRight: 4 }} />
              {t("audit.export")}
            </PixelButton>
            <PixelButton variant="ghost" onClick={handleClear} style={{ padding: "0.2rem 0.5rem", fontSize: "0.7rem", borderColor: "var(--c-red)", color: "var(--c-red)" }}>
              <Icon name="cross" size={12} style={{ marginRight: 4 }} />
              {t("audit.clearAll")}
            </PixelButton>
          </div>
        </div>
      </PixelPanel>

      {/* Log table */}
      <PixelPanel style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <span className="font-term text-muted" style={{ fontSize: "0.8rem" }}>{t("app.loading")}</span>
          </div>
        ) : error ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <Icon name="cross" size={24} style={{ color: "var(--c-red)", marginBottom: "0.5rem" }} />
            <p className="font-term text-red" style={{ fontSize: "0.8rem" }}>{error}</p>
            <PixelButton variant="ghost" onClick={loadLogs} style={{ marginTop: "0.5rem", padding: "0.2rem 0.5rem" }}>
              {t("errors.retry")}
            </PixelButton>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <Icon name="shield" size={24} style={{ color: "var(--c-muted)", marginBottom: "0.5rem" }} />
            <p className="font-term text-muted" style={{ fontSize: "0.8rem" }}>{t("audit.empty")}</p>
            <p className="font-term text-muted" style={{ fontSize: "0.7rem", marginTop: "0.2rem" }}>{t("audit.emptyHint")}</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--c-rule)" }}>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", color: "var(--c-accent2)", fontFamily: "var(--font-pixel)", fontSize: "0.65rem" }}>{t("audit.columns.time")}</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", color: "var(--c-accent2)", fontFamily: "var(--font-pixel)", fontSize: "0.65rem" }}>{t("audit.columns.command")}</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", color: "var(--c-accent2)", fontFamily: "var(--font-pixel)", fontSize: "0.65rem" }}>{t("audit.columns.module")}</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", color: "var(--c-accent2)", fontFamily: "var(--font-pixel)", fontSize: "0.65rem" }}>{t("audit.columns.risk")}</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", color: "var(--c-accent2)", fontFamily: "var(--font-pixel)", fontSize: "0.65rem" }}>{t("audit.columns.source")}</th>
                <th style={{ padding: "0.4rem 0.5rem", textAlign: "left", color: "var(--c-accent2)", fontFamily: "var(--font-pixel)", fontSize: "0.65rem" }}>{t("audit.columns.result")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.slice(0, 200).map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  style={{
                    borderBottom: "1px solid var(--c-rule)",
                    cursor: "pointer",
                  }}
                >
                  <td style={{ padding: "0.3rem 0.5rem", color: "var(--c-muted)", fontSize: "0.65rem", whiteSpace: "nowrap" }}>
                    {formatTime(log.timestamp)}
                  </td>
                  <td style={{ padding: "0.3rem 0.5rem", color: "var(--c-ink)" }}>
                    <code style={{ fontSize: "0.7rem" }}>{log.command}</code>
                  </td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>
                    <span style={{ fontSize: "0.65rem", color: "var(--c-cyan)" }}>{log.module}</span>
                  </td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>
                    <span style={{
                      display: "inline-block", padding: "0.1rem 0.3rem", fontSize: "0.6rem",
                      border: `1px solid ${RISK_COLOR[log.risk_level] || "var(--c-rule)"}`,
                      color: RISK_COLOR[log.risk_level] || "var(--c-muted)",
                    }}>
                      {t(`risk.${log.risk_level}`)}
                    </span>
                  </td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>
                    <span style={{ fontSize: "0.65rem", color: SOURCE_COLOR[log.source] || "var(--c-muted)" }}>
                      {log.source}
                    </span>
                  </td>
                  <td style={{ padding: "0.3rem 0.5rem" }}>
                    <span style={{
                      fontSize: "0.65rem",
                      color: log.result === "success" ? "var(--c-green)" : log.result === "blocked" ? "var(--c-red)" : "var(--c-yellow)",
                    }}>
                      {log.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PixelPanel>

      {/* Detail panel */}
      {selectedLog && (
        <PixelPanel style={{ padding: "0.8rem", marginTop: "0.8rem", borderColor: "var(--c-accent2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span className="font-pixel text-cyan" style={{ fontSize: "0.75rem" }}>
              {t("common.details")}
            </span>
            <PixelButton variant="ghost" onClick={() => setSelectedLog(null)} style={{ padding: "0.1rem 0.3rem" }}>
              <Icon name="cross" size={12} />
            </PixelButton>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", fontSize: "0.72rem" }}>
            <div>
              <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>{t("audit.columns.time")}</span>
              <p className="font-term text-ink">{formatTime(selectedLog.timestamp)}</p>
            </div>
            <div>
              <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>{t("audit.columns.command")}</span>
              <p className="font-term text-ink"><code>{selectedLog.command}</code></p>
            </div>
            <div>
              <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>{t("audit.columns.module")}</span>
              <p className="font-term text-ink">{selectedLog.module}</p>
            </div>
            <div>
              <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>{t("audit.columns.risk")}</span>
              <p><RiskBadge level={selectedLog.risk_level as RiskLevel} /></p>
            </div>
            <div>
              <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>{t("audit.columns.source")}</span>
              <p className="font-term text-ink">{selectedLog.source}</p>
            </div>
            <div>
              <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>{t("audit.columns.result")}</span>
              <p className="font-term text-ink">{selectedLog.result}</p>
            </div>
            {selectedLog.detail && (
              <div style={{ gridColumn: "1 / -1" }}>
                <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>{t("audit.columns.detail")}</span>
                <div style={{
                  padding: "0.4rem", marginTop: "0.2rem",
                  background: "var(--c-bg2)", border: "1px solid var(--c-rule)",
                  fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--c-ink)",
                  wordBreak: "break-all",
                }}>
                  {selectedLog.detail}
                </div>
              </div>
            )}
          </div>

          {/* AI Approval Chain */}
          {selectedLog.source === "AiApproved" && (
            <div style={{
              marginTop: "0.5rem", padding: "0.4rem 0.6rem",
              background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.3)",
            }}>
              <span className="font-term text-green" style={{ fontSize: "0.7rem" }}>
                <Icon name="check" size={12} style={{ marginRight: 4 }} />
                {t("gateway.sources.aiApproved")} → {t("gateway.auditRecorded")}
              </span>
            </div>
          )}
        </PixelPanel>
      )}
    </div>
  );
};
