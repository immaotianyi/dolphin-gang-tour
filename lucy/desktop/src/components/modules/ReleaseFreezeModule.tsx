/** ReleaseFreezeModule — RC1 发布冻结: 快照 · 命令清单 · 已知问题 · Mock审计 · 模式行为 · Schema */
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { Icon } from "@/components/ui/Icon";
import { invoke } from "@/lib/tauri";

// ===== Types =====
interface FreezeSnapshot {
  version: string; freeze_date: string; tauri_command_count: number;
  i18n_key_count: number; i18n_section_count: number; database_table_count: number;
  rust_test_count: number; frontend_file_count: number; rust_file_count: number;
  bundle_size_kb: number; gzip_size_kb: number; status: string;
}
interface FrozenCommand {
  name: string; module: string; risk: string; ai_allowed: boolean;
  requires_confirm: boolean; requires_region_check: boolean;
  requires_badusb_guard: boolean; audit_logged: boolean;
}
interface HighRiskSummary {
  dangerous_count: number; caution_count: number; safe_count: number; blocked_count: number;
  ai_blocked_count: number; audit_logged_count: number; region_checked_count: number;
  badusb_guarded_count: number; dangerous_commands: string[]; caution_commands: string[];
}
interface KnownIssue {
  id: string; title: string; severity: string; category: string;
  description: string; workaround: string; status: string;
}
interface MockAuditEntry {
  command: string; module: string; returns_sensitive_data: boolean;
  simulates_dangerous_action: boolean; safe_for_real_mode: boolean; notes: string;
}
interface ModeBehavior {
  mode: string; visible_modules: string[]; dangerous_commands_visible: boolean;
  developer_tools_visible: boolean; audit_export_enabled: boolean;
  virtual_device_default: boolean; ai_copilot_enabled: boolean;
  auto_reconnect: boolean; region_override: boolean; notes: string;
}
interface TableInfo { name: string; column_count: number; has_timestamps: boolean; has_foreign_keys: boolean; }
interface DbSchema { version: string; table_count: number; tables: TableInfo[]; migration_strategy: string; }

const RISK_COLOR: Record<string, string> = {
  safe: "var(--c-green)", caution: "var(--c-yellow)",
  dangerous: "var(--c-red)", blocked: "var(--c-red)",
};
const SEVERITY_COLOR: Record<string, string> = {
  critical: "var(--c-red)", high: "var(--c-orange)", medium: "var(--c-yellow)", low: "var(--c-muted)",
};
const STATUS_COLOR: Record<string, string> = {
  open: "var(--c-red)", acknowledged: "var(--c-yellow)", in_progress: "var(--c-orange)", resolved: "var(--c-green)",
};

export const ReleaseFreezeModule: React.FC = () => {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<FreezeSnapshot | null>(null);
  const [commands, setCommands] = useState<FrozenCommand[]>([]);
  const [riskSummary, setRiskSummary] = useState<HighRiskSummary | null>(null);
  const [issues, setIssues] = useState<KnownIssue[]>([]);
  const [mockAudit, setMockAudit] = useState<MockAuditEntry[]>([]);
  const [modes, setModes] = useState<ModeBehavior[]>([]);
  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    try {
      const [snap, cmds, risk, iss, audit, mds, sch] = await Promise.all([
        invoke<FreezeSnapshot>("cmd_get_freeze_snapshot"),
        invoke<FrozenCommand[]>("cmd_get_frozen_commands"),
        invoke<HighRiskSummary>("cmd_get_high_risk_summary"),
        invoke<KnownIssue[]>("cmd_get_known_issues"),
        invoke<MockAuditEntry[]>("cmd_get_mock_audit"),
        invoke<ModeBehavior[]>("cmd_get_mode_behaviors"),
        invoke<DbSchema>("cmd_get_database_schema_snapshot"),
      ]);
      setSnapshot(snap); setCommands(cmds); setRiskSummary(risk);
      setIssues(iss); setMockAudit(audit); setModes(mds); setSchema(sch);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredCommands = riskFilter === "all" ? commands : commands.filter(c => c.risk === riskFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", paddingBottom: "1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="font-pixel text-orange" style={{ fontSize: "1rem", letterSpacing: "0.05em" }}>
              {t("freeze.title")}
            </span>
            {snapshot?.status === "frozen" && (
              <span className="font-pixel" style={{
                fontSize: "0.5rem", color: "var(--c-cyan)", border: "1px solid var(--c-cyan)",
                padding: "0.1rem 0.35rem", background: "rgba(34,211,238,0.1)", letterSpacing: "0.1em",
              }}>
                {t("freeze.frozenBadge")}
              </span>
            )}
          </div>
          <div className="font-mono text-muted" style={{ fontSize: "0.68rem", marginTop: "0.15rem" }}>
            {t("freeze.subtitle")}
          </div>
        </div>
        <Icon name="shield" size={24} style={{ color: "var(--c-cyan)" }} />
      </div>

      {/* Freeze Snapshot */}
      {snapshot && (
        <PixelPanel title={t("freeze.snapshot")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
            <SnapStat label="Version" value={snapshot.version} color="var(--c-orange)" />
            <SnapStat label="Tauri CMDs" value={String(snapshot.tauri_command_count)} color="var(--c-cyan)" />
            <SnapStat label="i18n Keys" value={String(snapshot.i18n_key_count)} color="var(--c-green)" />
            <SnapStat label="DB Tables" value={String(snapshot.database_table_count)} color="var(--c-yellow)" />
            <SnapStat label="Rust Tests" value={String(snapshot.rust_test_count)} color="var(--c-green)" />
            <SnapStat label="TS/TSX Files" value={String(snapshot.frontend_file_count)} color="var(--c-cyan)" />
            <SnapStat label="Rust Files" value={String(snapshot.rust_file_count)} color="var(--c-orange)" />
            <SnapStat label="Bundle" value={`${snapshot.bundle_size_kb}KB`} color="var(--c-yellow)" />
          </div>
        </PixelPanel>
      )}

      {/* High-Risk Summary */}
      {riskSummary && (
        <PixelPanel title={t("freeze.highRiskSummary")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.4rem", marginBottom: "0.5rem" }}>
            <RiskStat label={t("freeze.dangerous")} value={riskSummary.dangerous_count} color="var(--c-red)" cmds={riskSummary.dangerous_commands} />
            <RiskStat label={t("freeze.caution")} value={riskSummary.caution_count} color="var(--c-yellow)" cmds={riskSummary.caution_commands} />
            <RiskStat label={t("freeze.safe")} value={riskSummary.safe_count} color="var(--c-green)" />
            <RiskStat label={t("freeze.aiBlocked")} value={riskSummary.ai_blocked_count} color="var(--c-orange)" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem" }}>
            <MiniStat label={t("freeze.auditLogged")} value={riskSummary.audit_logged_count} color="var(--c-cyan)" />
            <MiniStat label={t("freeze.regionChecked")} value={riskSummary.region_checked_count} color="var(--c-yellow)" />
            <MiniStat label={t("freeze.badusbGuarded")} value={riskSummary.badusb_guarded_count} color="var(--c-orange)" />
          </div>
        </PixelPanel>
      )}

      {/* Frozen Commands */}
      <PixelPanel title={`${t("freeze.frozenCommands")} (${commands.length})`}>
        <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.5rem" }}>
          {["all", "dangerous", "caution", "safe"].map(r => (
            <button key={r} onClick={() => setRiskFilter(r)} style={{
              padding: "0.15rem 0.5rem", fontSize: "0.6rem", fontFamily: "var(--font-mono)", cursor: "pointer",
              border: `1px solid ${riskFilter === r ? RISK_COLOR[r] || "var(--c-cyan)" : "var(--c-rule)"}`,
              color: riskFilter === r ? RISK_COLOR[r] || "var(--c-cyan)" : "var(--c-muted)",
              background: riskFilter === r ? "rgba(34,211,238,0.05)" : "transparent",
            }}>
              {t(`freeze.${r}`)}
            </button>
          ))}
        </div>
        <div style={{ maxHeight: "240px", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.68rem" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "var(--c-bg2)" }}>
                <th style={thStyle}>{t("freeze.command")}</th>
                <th style={thStyle}>{t("freeze.module")}</th>
                <th style={thStyle}>{t("freeze.risk")}</th>
                <th style={thStyle}>AI</th>
                <th style={thStyle}>{t("freeze.confirm")}</th>
                <th style={thStyle}>{t("freeze.regionCheck")}</th>
                <th style={thStyle}>{t("freeze.badusbGuard")}</th>
                <th style={thStyle}>{t("freeze.audit")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredCommands.map(c => (
                <tr key={c.name} style={{ borderBottom: "1px solid var(--c-rule)" }}>
                  <td style={tdStyle}><code style={{ fontSize: "0.65rem" }}>{c.name}</code></td>
                  <td style={tdStyle}>{c.module}</td>
                  <td style={tdStyle}><span style={{ color: RISK_COLOR[c.risk], fontSize: "0.6rem" }}>{c.risk}</span></td>
                  <td style={tdStyle}>{c.ai_allowed ? "✓" : "✗"}</td>
                  <td style={tdStyle}>{c.requires_confirm ? "✓" : "—"}</td>
                  <td style={tdStyle}>{c.requires_region_check ? "✓" : "—"}</td>
                  <td style={tdStyle}>{c.requires_badusb_guard ? "✓" : "—"}</td>
                  <td style={tdStyle}>{c.audit_logged ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PixelPanel>

      {/* Known Issues + Mock Audit */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
        <PixelPanel title={`${t("freeze.knownIssues")} (${issues.length})`}>
          <div style={{ maxHeight: "280px", overflowY: "auto" }}>
            {issues.map(iss => (
              <div key={iss.id} style={{ padding: "0.35rem 0.3rem", borderBottom: "1px solid var(--c-rule)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <span className="font-mono" style={{ fontSize: "0.55rem", color: "var(--c-dim)" }}>{iss.id}</span>
                  <span style={{ fontSize: "0.5rem", padding: "0.05rem 0.25rem", border: `1px solid ${SEVERITY_COLOR[iss.severity]}`, color: SEVERITY_COLOR[iss.severity] }}>
                    {t(`freeze.${iss.severity}`)}
                  </span>
                  <span style={{ fontSize: "0.5rem", padding: "0.05rem 0.25rem", border: `1px solid ${STATUS_COLOR[iss.status]}`, color: STATUS_COLOR[iss.status] }}>
                    {t(`freeze.${iss.status}`)}
                  </span>
                </div>
                <div className="font-term text-ink" style={{ fontSize: "0.72rem", marginTop: "0.15rem" }}>{iss.title}</div>
                <div className="font-mono text-dim" style={{ fontSize: "0.6rem", marginTop: "0.1rem" }}>{iss.description}</div>
                <div className="font-mono text-muted" style={{ fontSize: "0.58rem", marginTop: "0.1rem" }}>→ {iss.workaround}</div>
              </div>
            ))}
          </div>
        </PixelPanel>

        <PixelPanel title={`${t("freeze.mockAudit")} (${mockAudit.length})`}>
          <div style={{ maxHeight: "280px", overflowY: "auto" }}>
            {mockAudit.map(a => (
              <div key={a.command} style={{ padding: "0.35rem 0.3rem", borderBottom: "1px solid var(--c-rule)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <code style={{ fontSize: "0.65rem", color: "var(--c-cyan)" }}>{a.command}</code>
                  {a.simulates_dangerous_action && (
                    <span style={{ fontSize: "0.48rem", padding: "0.05rem 0.2rem", border: "1px solid var(--c-orange)", color: "var(--c-orange)" }}>DANGER SIM</span>
                  )}
                  {a.returns_sensitive_data && (
                    <span style={{ fontSize: "0.48rem", padding: "0.05rem 0.2rem", border: "1px solid var(--c-yellow)", color: "var(--c-yellow)" }}>SENSITIVE</span>
                  )}
                  <span style={{ fontSize: "0.48rem", padding: "0.05rem 0.2rem", border: "1px solid var(--c-green)", color: "var(--c-green)" }}>SAFE</span>
                </div>
                <div className="font-mono text-dim" style={{ fontSize: "0.6rem", marginTop: "0.1rem" }}>{a.notes}</div>
              </div>
            ))}
          </div>
        </PixelPanel>
      </div>

      {/* Mode Behaviors */}
      <PixelPanel title={`${t("freeze.modeBehaviors")} (${modes.length})`}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {modes.map(m => (
            <div key={m.mode} style={{ border: "2px solid var(--c-rule)", padding: "0.4rem 0.6rem", background: "var(--c-bg2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
                <span className="font-pixel" style={{ fontSize: "0.7rem", color: "var(--c-orange)" }}>{m.mode}</span>
                <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                  {m.dangerous_commands_visible && <Tag color="var(--c-red)">DANGER</Tag>}
                  {m.developer_tools_visible && <Tag color="var(--c-purple)">DEV</Tag>}
                  {m.virtual_device_default && <Tag color="var(--c-cyan)">VIRTUAL</Tag>}
                  {m.region_override && <Tag color="var(--c-yellow)">REGION-OVR</Tag>}
                  {m.auto_reconnect && <Tag color="var(--c-green)">RECONNECT</Tag>}
                </div>
              </div>
              <div className="font-mono text-dim" style={{ fontSize: "0.62rem", marginBottom: "0.2rem" }}>
                {t("freeze.visibleModules")}: {m.visible_modules.join(", ")}
              </div>
              <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{m.notes}</div>
            </div>
          ))}
        </div>
      </PixelPanel>

      {/* Database Schema */}
      {schema && (
        <PixelPanel title={t("freeze.dbSchema")}>
          <div className="font-mono text-muted" style={{ fontSize: "0.62rem", marginBottom: "0.4rem" }}>
            {t("freeze.migrationStrategy")}: {schema.migration_strategy}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.3rem" }}>
            {schema.tables.map(tbl => (
              <div key={tbl.name} style={{ border: "1px solid var(--c-rule)", padding: "0.25rem 0.4rem", background: "var(--c-bg2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <code style={{ fontSize: "0.65rem", color: "var(--c-cyan)" }}>{tbl.name}</code>
                  <span className="font-mono text-muted" style={{ fontSize: "0.55rem" }}>{tbl.column_count} col</span>
                </div>
                <div style={{ display: "flex", gap: "0.2rem", marginTop: "0.1rem" }}>
                  {tbl.has_timestamps && <span style={{ fontSize: "0.45rem", color: "var(--c-green)" }}>TS</span>}
                  {tbl.has_foreign_keys && <span style={{ fontSize: "0.45rem", color: "var(--c-yellow)" }}>FK</span>}
                </div>
              </div>
            ))}
          </div>
        </PixelPanel>
      )}
    </div>
  );
};

// ===== Sub-components =====
function SnapStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "0.3rem", background: "var(--c-bg2)", border: "1px solid var(--c-rule)" }}>
      <div className="font-pixel" style={{ fontSize: "0.85rem", color, fontWeight: 700 }}>{value}</div>
      <div className="font-mono text-muted" style={{ fontSize: "0.52rem", marginTop: "0.1rem" }}>{label}</div>
    </div>
  );
}
function RiskStat({ label, value, color, cmds }: { label: string; value: number; color: string; cmds?: string[] }) {
  return (
    <div style={{ padding: "0.3rem", background: "var(--c-bg2)", border: `1px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
        <span className="font-pixel" style={{ fontSize: "0.9rem", color, fontWeight: 700 }}>{value}</span>
        <span className="font-mono" style={{ fontSize: "0.55rem", color: "var(--c-muted)" }}>{label}</span>
      </div>
      {cmds && cmds.length > 0 && (
        <div className="font-mono text-dim" style={{ fontSize: "0.52rem", marginTop: "0.1rem", lineHeight: 1.3 }}>
          {cmds.join(", ")}
        </div>
      )}
    </div>
  );
}
function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.2rem 0.4rem", background: "var(--c-bg2)", border: "1px solid var(--c-rule)" }}>
      <span className="font-pixel" style={{ fontSize: "0.7rem", color, fontWeight: 700 }}>{value}</span>
      <span className="font-mono text-muted" style={{ fontSize: "0.55rem" }}>{label}</span>
    </div>
  );
}
function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ fontSize: "0.45rem", padding: "0.05rem 0.2rem", border: `1px solid ${color}`, color, fontFamily: "var(--font-mono)" }}>{children}</span>;
}
const thStyle: React.CSSProperties = { textAlign: "left", padding: "0.2rem 0.3rem", borderBottom: "2px solid var(--c-rule)", fontSize: "0.55rem", color: "var(--c-cyan)", fontFamily: "var(--font-mono)", position: "sticky", top: 0 };
const tdStyle: React.CSSProperties = { padding: "0.15rem 0.3rem", borderBottom: "1px solid var(--c-rule)", fontFamily: "var(--font-mono)", fontSize: "0.62rem" };
