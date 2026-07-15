/** 固件更新模块 — OTA 进度 + 版本信息 + 双分区安全启动 */
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Icon } from "@/components/ui/Icon";

type UpdateStage = "idle" | "checking" | "downloading" | "verifying" | "flashing" | "rebooting" | "done" | "error";

interface VersionInfo {
  current: string;
  latest: string;
  apiLevel: number;
  hasUpdate: boolean;
  releaseNotes: string;
}

const MOCK_VERSION: VersionInfo = {
  current: "0.1.0-alpha",
  latest: "0.2.0-beta",
  apiLevel: 2,
  hasUpdate: true,
  releaseNotes: `- Added NFC Mifare Classic decryption
- Improved Sub-GHz sensitivity by 15%
- Fixed USB CDC buffer overflow
- Added iButton protocol support
- Updated LVGL to v9.1`,
};

const STAGE_INFO: Record<UpdateStage, { label: string; progress: number; color: string }> = {
  idle: { label: "Ready", progress: 0, color: "var(--c-dim)" },
  checking: { label: "Checking for updates...", progress: 10, color: "var(--c-cyan)" },
  downloading: { label: "Downloading firmware...", progress: 35, color: "var(--c-cyan)" },
  verifying: { label: "Verifying checksum & API level...", progress: 60, color: "var(--c-yellow)" },
  flashing: { label: "Flashing to OTA partition...", progress: 80, color: "var(--c-orange)" },
  rebooting: { label: "Rebooting device...", progress: 95, color: "var(--c-orange)" },
  done: { label: "Update complete!", progress: 100, color: "var(--c-green)" },
  error: { label: "Update failed", progress: 0, color: "var(--c-red)" },
};

export const FirmwareModule: React.FC = () => {
  const { t } = useTranslation();
  const [stage, setStage] = useState<UpdateStage>("idle");
  const [version, setVersion] = useState<VersionInfo>(MOCK_VERSION);
  const [progress, setProgress] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);

  const startUpdate = () => {
    if (stage !== "idle" && stage !== "error" && stage !== "done") return;
    setStage("checking");
    setProgress(0);
  };

  // Simulate update process
  useEffect(() => {
    if (stage === "idle" || stage === "done" || stage === "error") return;

    const stageProgress = STAGE_INFO[stage].progress;
    const targetProgress = stageProgress;

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= targetProgress) {
          clearInterval(interval);
          // Advance to next stage
          const stages: UpdateStage[] = ["checking", "downloading", "verifying", "flashing", "rebooting", "done"];
          const currentIdx = stages.indexOf(stage);
          if (currentIdx < stages.length - 1) {
            const nextStage = stages[currentIdx + 1];
            setStage(nextStage);
            if (nextStage === "done") {
              setVersion((v) => ({ ...v, current: v.latest, hasUpdate: false }));
            }
            return STAGE_INFO[nextStage].progress;
          }
          return p;
        }
        return p + Math.random() * 8 + 2;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [stage]);

  const stageInfo = STAGE_INFO[stage];
  const isUpdating = stage !== "idle" && stage !== "done" && stage !== "error";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <PixelPanel>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0" }}>
          <div style={{
            width: 48, height: 48,
            background: "var(--c-bg3)",
            border: `2px solid ${stageInfo.color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: isUpdating ? `0 0 12px ${stageInfo.color}` : "none",
            transition: "all 0.3s var(--ease-apple)",
          }}>
            <Icon name="rocket" size={28} style={{ color: stageInfo.color }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="font-pixel" style={{ fontSize: "1.1rem", color: stageInfo.color }}>{t("firmware.title")}</div>
            <div className="font-term text-dim" style={{ fontSize: "0.8rem" }}>
              {t("firmware.subtitle")} {version.apiLevel}
            </div>
          </div>
          {version.hasUpdate && stage === "idle" && (
            <span className="pixel-badge pixel-badge-orange" style={{ animation: "pulse-border 2s infinite" }}>
              {t("firmware.updateAvailable")}
            </span>
          )}
        </div>
      </PixelPanel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Version info */}
        <PixelPanel title={t("firmware.versionInfo")}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.8rem",
              padding: "0.6rem",
              background: "var(--c-bg)",
              border: "1px solid var(--c-rule)",
            }}>
              <div style={{ flex: 1 }}>
                <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{t("firmware.current")}</div>
                <div className="font-pixel text-green" style={{ fontSize: "0.9rem" }}>{version.current}</div>
              </div>
              {version.hasUpdate && (
                <>
                  <Icon name="chevron-right" size={16} style={{ color: "var(--c-muted)" }} />
                  <div>
                    <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{t("firmware.latest")}</div>
                    <div className="font-pixel text-orange" style={{ fontSize: "0.9rem" }}>{version.latest}</div>
                  </div>
                </>
              )}
            </div>

            <InfoRow label="API Level" value={`v${version.apiLevel}`} />
            <InfoRow label={t("firmware.bootPartition")} value={stage === "done" ? "OTA_1 (Active)" : "OTA_0 (Active)"} />
            <InfoRow label="Rollback" value={t("firmware.rollbackEnabled")} />
            <InfoRow label={t("firmware.buildDate")} value="2026-07-10" />
            <InfoRow label={t("firmware.gitCommit")} value="a3f8b2c" />

            {version.hasUpdate && (
              <button
                onClick={() => setShowNotes(!showNotes)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--c-rule)",
                  padding: "0.4rem 0.6rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  transition: "all 0.2s var(--ease-apple)",
                }}
              >
                <Icon name={showNotes ? "chevron-up" : "chevron-down"} size={12} style={{ color: "var(--c-cyan)" }} />
                <span className="font-term text-cyan" style={{ fontSize: "0.72rem" }}>{t("firmware.releaseNotes")}</span>
              </button>
            )}

            {showNotes && (
              <div className="crt-screen" style={{
                padding: "0.6rem",
                fontSize: "0.72rem",
                fontFamily: "var(--font-mono)",
                color: "var(--c-dim)",
                whiteSpace: "pre-wrap",
                animation: "slide-in-up 0.2s var(--ease-apple)",
              }}>
                {version.releaseNotes}
              </div>
            )}
          </div>
        </PixelPanel>

        {/* Update progress */}
        <PixelPanel title={t("firmware.updateStatus")}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            {/* Progress display */}
            <div style={{
              padding: "1rem",
              background: "var(--c-bg)",
              border: `1px solid ${isUpdating ? stageInfo.color : "var(--c-rule)"}`,
              transition: "border-color 0.3s var(--ease-apple)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span className="font-term" style={{ fontSize: "0.78rem", color: stageInfo.color }}>
                  {stageInfo.label}
                </span>
                <span className="font-pixel" style={{ fontSize: "0.85rem", color: stageInfo.color }}>
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="pixel-progress" style={{ height: 16 }}>
                <div
                  className="pixel-progress-fill"
                  style={{
                    width: `${progress}%`,
                    background: stageInfo.color,
                    transition: "width 0.3s var(--ease-apple)",
                  }}
                />
              </div>
            </div>

            {/* Stage indicators */}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {(["checking", "downloading", "verifying", "flashing", "rebooting"] as UpdateStage[]).map((s) => {
                const stageOrder = ["checking", "downloading", "verifying", "flashing", "rebooting", "done"];
                const currentIdx = stageOrder.indexOf(stage);
                const stageIdx = stageOrder.indexOf(s);
                const isDone = stage === "done" || currentIdx > stageIdx;
                const isActive = stage === s;

                return (
                  <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
                    <div style={{
                      width: 12, height: 12,
                      background: isDone ? "var(--c-green)" : isActive ? stageInfo.color : "var(--c-bg4)",
                      border: `1px solid ${isDone ? "var(--c-green)" : isActive ? stageInfo.color : "var(--c-rule)"}`,
                      boxShadow: isActive ? `0 0 6px ${stageInfo.color}` : "none",
                      transition: "all 0.3s var(--ease-apple)",
                    }} />
                    <span className="font-mono" style={{
                      fontSize: "0.5rem",
                      color: isDone ? "var(--c-green)" : isActive ? stageInfo.color : "var(--c-muted)",
                    }}>
                      {s.slice(0, 4).toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {stage === "idle" && (
                <PixelButton
                  variant={version.hasUpdate ? "primary" : "ghost"}
                  onClick={startUpdate}
                  disabled={!version.hasUpdate}
                  icon="download"
                >
                  {version.hasUpdate ? t("firmware.updateNow") : t("firmware.upToDate")}
                </PixelButton>
              )}
              {isUpdating && (
                <PixelButton variant="danger" icon="stop" disabled>
                  {t("firmware.updating")}
                </PixelButton>
              )}
              {stage === "done" && (
                <PixelButton variant="success" icon="check">
                  {t("firmware.complete")}
                </PixelButton>
              )}
              {stage === "error" && (
                <PixelButton variant="danger" onClick={startUpdate} icon="refresh">
                  {t("firmware.retry")}
                </PixelButton>
              )}
            </div>
          </div>
        </PixelPanel>
      </div>

      {/* Safety info */}
      <PixelPanel title={t("firmware.safetyRollback")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
          <div className="callout info" style={{ fontSize: "0.72rem" }}>
            <Icon name="shield" size={14} style={{ display: "inline", marginRight: "0.3rem", color: "var(--c-cyan)" }} />
            {t("firmware.dualPartition")}
          </div>
          <div className="callout warn" style={{ fontSize: "0.72rem" }}>
            <Icon name="warning" size={14} style={{ display: "inline", marginRight: "0.3rem" }} />
            {t("firmware.apiLevelCheck")}{version.apiLevel}.
          </div>
          <div className="callout info" style={{ fontSize: "0.72rem" }}>
            <Icon name="lock" size={14} style={{ display: "inline", marginRight: "0.3rem", color: "var(--c-cyan)" }} />
            {t("firmware.signedFirmware")}
          </div>
          <div className="callout warn" style={{ fontSize: "0.72rem" }}>
            <Icon name="bolt" size={14} style={{ display: "inline", marginRight: "0.3rem" }} />
            {t("firmware.batteryRequirement")}
          </div>
        </div>
      </PixelPanel>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span className="font-term text-dim" style={{ fontSize: "0.72rem" }}>{label}</span>
    <span className="font-mono text-ink" style={{ fontSize: "0.72rem" }}>{value}</span>
  </div>
);
