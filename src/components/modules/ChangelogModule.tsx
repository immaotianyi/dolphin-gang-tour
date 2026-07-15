/** ChangelogModule — 版本历史 · 更新检查 · 崩溃日志 · 发布检查清单 */
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Icon } from "@/components/ui/Icon";
import { showToast } from "@/components/ui/Toast";
import { invoke } from "@/lib/tauri";

// ===== Types =====
interface AppVersion {
  version: string;
  build_date: string;
  git_hash: string;
  target_os: string;
  target_arch: string;
  rust_version: string;
}

interface UpdateInfo {
  has_update: boolean;
  current_version: string;
  target_version: string;
  changelog: string;
  download_url: string;
  release_date: string;
  critical: boolean;
}

interface ChangelogCategory {
  kind: string;
  title: string;
  items: string[];
}

interface ChangelogEntry {
  version: string;
  date: string;
  phase: string;
  categories: ChangelogCategory[];
}

interface CrashLog {
  timestamp: string;
  level: string;
  message: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  category: string;
  required: boolean;
  status: string;
}

interface ReleaseChecklist {
  items: ChecklistItem[];
  ready: boolean;
}

// ===== Category colors =====
const KIND_COLOR: Record<string, string> = {
  new: "var(--c-green)",
  fix: "var(--c-cyan)",
  improve: "var(--c-yellow)",
  breaking: "var(--c-red)",
  security: "var(--c-orange)",
};

const LEVEL_COLOR: Record<string, string> = {
  error: "var(--c-red)",
  warn: "var(--c-yellow)",
  info: "var(--c-cyan)",
};

export const ChangelogModule: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState<AppVersion | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [logs, setLogs] = useState<CrashLog[]>([]);
  const [checklist, setChecklist] = useState<ReleaseChecklist | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [v, cl, lg, ck] = await Promise.all([
        invoke<AppVersion>("cmd_get_app_version"),
        invoke<ChangelogEntry[]>("cmd_get_changelog"),
        invoke<CrashLog[]>("cmd_get_crash_logs", { limit: 50 }),
        invoke<ReleaseChecklist>("cmd_get_release_checklist"),
      ]);
      setVersion(v);
      setChangelog(cl);
      setLogs(lg);
      setChecklist(ck);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      const info = await invoke<UpdateInfo>("cmd_check_for_updates");
      setUpdateInfo(info);
      if (info.has_update) {
        showToast("info", t("changelog.updateAvailable") + ": v" + info.target_version);
      } else {
        showToast("success", t("changelog.upToDate"));
      }
    } catch {
      showToast("error", t("changelog.checkUpdate"));
    }
    setChecking(false);
  };

  const handleClearLogs = async () => {
    try {
      await invoke("cmd_clear_crash_logs");
      setLogs([]);
      showToast("success", t("changelog.clearLogs"));
    } catch {
      showToast("error", t("changelog.clearLogs"));
    }
  };

  // ===== Render =====
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", paddingBottom: "1rem" }}>
      {/* ===== Header ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="font-pixel text-orange" style={{ fontSize: "1rem", letterSpacing: "0.05em" }}>
            {t("changelog.title")}
          </div>
          <div className="font-mono text-muted" style={{ fontSize: "0.68rem", marginTop: "0.15rem" }}>
            {t("changelog.subtitle")}
          </div>
        </div>
        <Icon name="history" size={24} style={{ color: "var(--c-orange)" }} />
      </div>

      {/* ===== Version + Update Check ===== */}
      <PixelPanel>
        <div style={{ display: "flex", gap: "1rem", alignItems: "stretch" }}>
          {/* Version card */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="font-pixel text-ink" style={{ fontSize: "0.6rem", letterSpacing: "0.1em" }}>
                {t("changelog.currentVersion")}
              </span>
              <span className="font-pixel" style={{ fontSize: "1.4rem", color: "var(--c-orange)", letterSpacing: "0.03em" }}>
                v{version?.version ?? "—"}
              </span>
            </div>
            {version && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem 1rem" }}>
                <BuildInfoItem label={t("changelog.targetOs")} value={version.target_os} />
                <BuildInfoItem label={t("changelog.targetArch")} value={version.target_arch} />
                <BuildInfoItem label={t("changelog.rustVersion")} value={version.rust_version} />
                <BuildInfoItem label={t("changelog.gitHash")} value={version.git_hash} />
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: "2px", background: "var(--c-rule)" }} />

          {/* Update check */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem", justifyContent: "center" }}>
            <PixelButton
              variant={updateInfo?.has_update ? "danger" : "primary"}
              icon="cloud"
              onClick={handleCheckUpdate}
              disabled={checking}
              style={{ width: "100%" }}
            >
              {checking ? t("changelog.checking") : t("changelog.checkUpdate")}
            </PixelButton>

            {updateInfo && (
              <div style={{
                padding: "0.4rem 0.6rem",
                background: updateInfo.has_update ? "rgba(248,113,113,0.08)" : "rgba(34,211,238,0.08)",
                border: `1px solid ${updateInfo.has_update ? "var(--c-red)" : "var(--c-cyan)"}`,
              }}>
                {updateInfo.has_update ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      {updateInfo.critical && (
                        <span className="font-pixel" style={{ fontSize: "0.5rem", color: "var(--c-red)", border: "1px solid var(--c-red)", padding: "0.05rem 0.25rem" }}>
                          {t("changelog.criticalUpdate")}
                        </span>
                      )}
                      <span className="font-term text-ink" style={{ fontSize: "0.76rem" }}>
                        {t("changelog.newVersion")}: v{updateInfo.target_version}
                      </span>
                    </div>
                    {updateInfo.release_date && (
                      <div className="font-mono text-muted" style={{ fontSize: "0.6rem", marginTop: "0.15rem" }}>
                        {t("changelog.releaseDate")}: {updateInfo.release_date}
                      </div>
                    )}
                    {updateInfo.changelog && (
                      <p className="font-mono text-dim" style={{ fontSize: "0.65rem", marginTop: "0.25rem", lineHeight: 1.4, margin: "0.25rem 0 0 0" }}>
                        {updateInfo.changelog}
                      </p>
                    )}
                  </>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <Icon name="check" size={12} style={{ color: "var(--c-cyan)" }} />
                    <span className="font-term text-ink" style={{ fontSize: "0.76rem" }}>
                      {t("changelog.upToDate")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PixelPanel>

      {/* ===== Version History ===== */}
      <PixelPanel title={t("changelog.versionHistory")}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: "320px", overflowY: "auto" }}>
          {changelog.map((entry) => (
            <div
              key={entry.version}
              style={{
                border: "2px solid var(--c-rule)",
                background: "var(--c-bg2)",
                padding: "0.5rem 0.7rem",
              }}
            >
              {/* Version header */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                <span className="font-pixel" style={{ fontSize: "0.8rem", color: "var(--c-orange)" }}>
                  v{entry.version}
                </span>
                <span className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>
                  {entry.date}
                </span>
                <span className="font-mono text-dim" style={{ fontSize: "0.6rem", marginLeft: "auto" }}>
                  {entry.phase}
                </span>
              </div>

              {/* Categories */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {entry.categories.map((cat, idx) => (
                  <div key={idx}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.15rem" }}>
                      <span style={{
                        fontSize: "0.5rem",
                        fontFamily: "var(--font-mono)",
                        padding: "0.05rem 0.3rem",
                        border: `1px solid ${KIND_COLOR[cat.kind] ?? "var(--c-muted)"}`,
                        color: KIND_COLOR[cat.kind] ?? "var(--c-muted)",
                        textTransform: "uppercase",
                      }}>
                        {t(`changelog.${cat.kind}`, { defaultValue: cat.kind })}
                      </span>
                      <span className="font-term text-ink" style={{ fontSize: "0.72rem" }}>
                        {cat.title}
                      </span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "1.2rem", listStyle: "none" }}>
                      {cat.items.map((item, i) => (
                        <li key={i} className="font-mono text-dim" style={{ fontSize: "0.65rem", lineHeight: 1.5, position: "relative" }}>
                          <span style={{ position: "absolute", left: "-0.7rem", color: "var(--c-muted)" }}>·</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PixelPanel>

      {/* ===== Crash Logs + Release Checklist ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
        {/* Crash Logs */}
        <PixelPanel title={t("changelog.crashLogs")}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
              <span className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>
                {t("changelog.crashLogsTitle")}
              </span>
              {logs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--c-red)",
                    color: "var(--c-red)",
                    padding: "0.15rem 0.4rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.55rem",
                    cursor: "pointer",
                  }}
                >
                  {t("changelog.clearLogs")}
                </button>
              )}
            </div>
            <div style={{ maxHeight: "200px", overflowY: "auto" }}>
              {logs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1rem" }}>
                  <Icon name="check" size={20} style={{ color: "var(--c-green)", marginBottom: "0.3rem" }} />
                  <div className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>
                    {t("changelog.noLogs")}
                  </div>
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      gap: "0.4rem",
                      padding: "0.2rem 0.3rem",
                      borderBottom: "1px solid var(--c-rule)",
                    }}
                  >
                    <span className="font-mono" style={{ fontSize: "0.55rem", color: "var(--c-dim)", flexShrink: 0 }}>
                      {log.timestamp}
                    </span>
                    <span style={{
                      fontSize: "0.5rem",
                      fontFamily: "var(--font-mono)",
                      padding: "0.05rem 0.25rem",
                      border: `1px solid ${LEVEL_COLOR[log.level] ?? "var(--c-muted)"}`,
                      color: LEVEL_COLOR[log.level] ?? "var(--c-muted)",
                      flexShrink: 0,
                      textTransform: "uppercase",
                    }}>
                      {log.level}
                    </span>
                    <span className="font-mono text-ink" style={{ fontSize: "0.6rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </PixelPanel>

        {/* Release Checklist */}
        <PixelPanel title={t("changelog.releaseChecklist")}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {checklist && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.3rem 0.5rem",
                marginBottom: "0.3rem",
                background: checklist.ready ? "rgba(34,197,94,0.08)" : "rgba(249,115,22,0.08)",
                border: `1px solid ${checklist.ready ? "var(--c-green)" : "var(--c-orange)"}`,
              }}>
                <Icon
                  name={checklist.ready ? "check" : "alert"}
                  size={14}
                  style={{ color: checklist.ready ? "var(--c-green)" : "var(--c-orange)" }}
                />
                <span className="font-pixel" style={{
                  fontSize: "0.6rem",
                  color: checklist.ready ? "var(--c-green)" : "var(--c-orange)",
                  letterSpacing: "0.05em",
                }}>
                  {checklist.ready ? t("changelog.checklistReady") : t("changelog.checklistNotReady")}
                </span>
              </div>
            )}
            <div style={{ maxHeight: "200px", overflowY: "auto" }}>
              {checklist?.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.2rem 0.3rem",
                    borderBottom: "1px solid var(--c-rule)",
                  }}
                >
                  <div style={{
                    width: "14px",
                    height: "14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `2px solid ${item.status === "done" ? "var(--c-green)" : "var(--c-muted)"}`,
                    color: item.status === "done" ? "var(--c-green)" : "var(--c-muted)",
                    flexShrink: 0,
                  }}>
                    {item.status === "done" && <Icon name="check" size={8} />}
                  </div>
                  <span className="font-term" style={{
                    fontSize: "0.68rem",
                    color: item.status === "done" ? "var(--c-ink)" : "var(--c-dim)",
                    flex: 1,
                  }}>
                    {item.label}
                  </span>
                  {!item.required && (
                    <span className="font-mono" style={{ fontSize: "0.48rem", color: "var(--c-dim)" }}>
                      {t("changelog.optional")}
                    </span>
                  )}
                  <span className="font-mono" style={{
                    fontSize: "0.48rem",
                    color: t(`changelog.cat_${item.category}`, { defaultValue: item.category }) === item.category
                      ? "var(--c-dim)"
                      : "var(--c-muted)",
                  }}>
                    {t(`changelog.cat_${item.category}`, { defaultValue: item.category })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
};

// ===== Sub-components =====
function BuildInfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
      <span className="font-mono text-muted" style={{ fontSize: "0.58rem" }}>
        {label}:
      </span>
      <span className="font-mono text-ink" style={{ fontSize: "0.62rem" }}>
        {value}
      </span>
    </div>
  );
}
