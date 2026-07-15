/** BadUSB 模块 — 三段式执行: 审查 → 预览 → 确认执行
 * 1. REVIEW: AST 静态审查（已有）
 * 2. PREVIEW: 调用后端 badusb_preview 逐行解释
 * 3. CONFIRM: 二次确认后执行
 */
import React, { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Icon } from "@/components/ui/Icon";
import { invoke } from "@/lib/tauri";
import type { BadusbPreviewLine, BadusbReport } from "@/types";

type Stage = "edit" | "preview" | "confirm" | "executing" | "done";

interface RiskIssue {
  line: number;
  severity: "danger" | "warn" | "info";
  message: string;
}

// 简易 DuckyScript AST 风险检测器（前端即时反馈）
function analyzeDuckyScript(script: string): RiskIssue[] {
  const issues: RiskIssue[] = [];
  const lines = script.split("\n");
  const dangerousStrings = [
    "powershell", "cmd.exe", "reg add", "netsh advfirewall",
    "Disable-NetFirewallRule", "Invoke-WebRequest", "Start-BitsTransfer",
    "curl | bash", "rm -rf", "format ", "del /f", "shutdown",
  ];
  let stringBuffer = "";
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    if (lower.match(/^(gui r|ctrl esc|gui\s)/)) {
      issues.push({ line: i + 1, severity: "warn", message: `Opens system dialog/run box` });
    }
    if (lower.startsWith("string ")) {
      const str = trimmed.slice(7);
      stringBuffer += str;
      dangerousStrings.forEach((ds) => {
        if (stringBuffer.toLowerCase().includes(ds)) {
          issues.push({ line: i + 1, severity: "danger", message: `Dangerous pattern: "${ds}"` });
        }
      });
      if (/https?:\/\//.test(stringBuffer) && /(download|invoke|curl)/i.test(stringBuffer)) {
        issues.push({ line: i + 1, severity: "danger", message: `Remote code download detected` });
      }
    }
    if (lower.startsWith("delay ") && parseInt(lower.slice(6)) > 3000) {
      issues.push({ line: i + 1, severity: "info", message: `Long delay (${trimmed.slice(6)}ms)` });
    }
    if (lower === "enter" && i > 0) {
      const prev = lines[i - 1].trim().toLowerCase();
      if (prev.startsWith("string ") && /(cmd|powershell|terminal)/.test(prev)) {
        issues.push({ line: i + 1, severity: "danger", message: `ENTER after opening terminal` });
      }
    }
  });
  return issues;
}

const DUCKY_TEMPLATE = `REM Example: Open Notepad and type a message
GUI r
DELAY 500
STRING notepad
ENTER
DELAY 1000
STRING Hello from Lucy BadUSB!
`;

const DUCKY_COMMANDS = [
  { cmd: "GUI r", desc: "Open Run dialog" },
  { cmd: "STRING", desc: "Type text" },
  { cmd: "ENTER", desc: "Press Enter" },
  { cmd: "DELAY", desc: "Wait (ms)" },
  { cmd: "CTRL", desc: "Ctrl modifier" },
  { cmd: "ALT", desc: "Alt modifier" },
  { cmd: "SHIFT", desc: "Shift modifier" },
  { cmd: "TAB", desc: "Tab key" },
  { cmd: "ESC", desc: "Escape key" },
  { cmd: "REM", desc: "Comment" },
];

export const BadUsbModule: React.FC = () => {
  const { t } = useTranslation();
  const [script, setScript] = useState(DUCKY_TEMPLATE);
  const [stage, setStage] = useState<Stage>("edit");
  const [showCmdRef, setShowCmdRef] = useState(false);
  const [previewLines, setPreviewLines] = useState<BadusbPreviewLine[]>([]);
  const [report, setReport] = useState<BadusbReport | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [emergencyStop, setEmergencyStop] = useState(false);

  const issues = useMemo(() => analyzeDuckyScript(script), [script]);
  const dangerCount = issues.filter((i) => i.severity === "danger").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;
  const lineCount = script.split("\n").length;

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setStage("preview");
    try {
      const result = await invoke<{ lines: BadusbPreviewLine[]; report: BadusbReport }>("badusb_preview", { script });
      setPreviewLines(result.lines);
      setReport(result.report);
      // 如果报告通过，进入确认阶段
      if (result.report.passed) {
        setStage("confirm");
      } else {
        // 有危险项，停在预览阶段
        setStage("preview");
      }
    } catch (e) {
      console.error("Preview failed:", e);
      setStage("edit");
    } finally {
      setPreviewLoading(false);
    }
  }, [script]);

  const handleConfirmExecute = useCallback(async () => {
    setStage("executing");
    setEmergencyStop(false);
    try {
      await invoke("badusb_execute", { script });
      setStage("done");
    } catch (e) {
      console.error("Execute failed:", e);
      setStage("confirm");
    }
  }, [script]);

  const handleEmergencyStop = useCallback(() => {
    setEmergencyStop(true);
    setStage("edit");
  }, []);

  const handleReset = useCallback(() => {
    setStage("edit");
    setPreviewLines([]);
    setReport(null);
    setEmergencyStop(false);
  }, []);

  // 步骤指示器
  const steps = [
    { id: "edit", label: "1. EDIT", icon: "edit" as const },
    { id: "preview", label: `2. ${t("badusb.review")}`, icon: "search" as const },
    { id: "confirm", label: `3. ${t("badusb.execute")}`, icon: "play" as const },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <PixelPanel>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0" }}>
          <div style={{
            width: 48, height: 48,
            background: "var(--c-bg3)",
            border: "2px solid var(--c-purple)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 12px rgba(167,139,250,0.3)",
          }}>
            <Icon name="keyboard" size={28} style={{ color: "var(--c-purple)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="font-pixel text-purple" style={{ fontSize: "1.1rem" }}>{t("badusb.title")}</div>
            <div className="font-term text-dim" style={{ fontSize: "0.8rem" }}>
              {t("badusb.subtitle")}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <PixelButton
              variant="ghost"
              icon={<Icon name={showCmdRef ? "book" : "info"} size={14} />}
              onClick={() => setShowCmdRef(!showCmdRef)}
            >
              {showCmdRef ? t("badusb.hideRef") : t("badusb.cmdRef")}
            </PixelButton>
          </div>
        </div>

        {/* Stage indicator */}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--c-rule)" }}>
          {steps.map((step, i) => {
            const stepIdx = ["edit", "preview", "confirm"].indexOf(stage === "executing" || stage === "done" ? "confirm" : stage);
            const active = ["edit", "preview", "confirm"].indexOf(step.id) <= stepIdx;
            const current = step.id === stage || (stage === "executing" && step.id === "confirm") || (stage === "done" && step.id === "confirm");
            return (
              <React.Fragment key={step.id}>
                <div style={{
                  display: "flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem",
                  background: current ? "rgba(167,139,250,0.12)" : active ? "rgba(74,222,128,0.06)" : "transparent",
                  border: `2px solid ${current ? "var(--c-purple)" : active ? "var(--c-green)" : "var(--c-rule)"}`,
                  opacity: active ? 1 : 0.5,
                }}>
                  <Icon name={step.icon} size={12} style={{ color: current ? "var(--c-purple)" : active ? "var(--c-green)" : "var(--c-muted)" }} />
                  <span className="font-pixel" style={{ fontSize: "0.6rem", color: current ? "var(--c-purple)" : active ? "var(--c-green)" : "var(--c-muted)" }}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ alignSelf: "center", color: "var(--c-rule)", fontSize: "0.7rem" }}>→</div>
                )}
              </React.Fragment>
            );
          })}
          {emergencyStop && (
            <div style={{ marginLeft: "auto", color: "var(--c-red)", fontSize: "0.7rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Icon name="cross" size={12} /> EMERGENCY STOPPED
            </div>
          )}
        </div>
      </PixelPanel>

      <div style={{ display: "grid", gridTemplateColumns: showCmdRef ? "1fr 280px" : "1fr", gap: "1rem" }}>
        {/* Editor */}
        <PixelPanel title={t("badusb.editor")}>
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <PixelButton variant="ghost" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
              onClick={() => setScript(DUCKY_TEMPLATE)}>
              <Icon name="refresh" size={10} /> {t("badusb.reset")}
            </PixelButton>
            <PixelButton variant="ghost" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
              onClick={() => setScript("")}>
              <Icon name="close" size={10} /> {t("badusb.clear")}
            </PixelButton>
            <PixelButton variant="ghost" style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
              onClick={() => {
                const blob = new Blob([script], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "script.txt"; a.click();
              }}>
              <Icon name="download" size={10} /> {t("badusb.save")}
            </PixelButton>
            <div style={{ flex: 1 }} />
            <span className="font-mono text-muted" style={{ fontSize: "0.65rem", alignSelf: "center" }}>
              {lineCount} {t("badusb.lines")} · {script.length} {t("badusb.chars")}
            </span>
          </div>

          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: 32,
              background: "var(--c-bg3)", borderRight: "1px solid var(--c-rule)",
              fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--c-muted)",
              textAlign: "right", padding: "0.5rem 0.4rem 0.5rem 0", lineHeight: "1.6",
              userSelect: "none", overflow: "hidden",
            }}>
              {script.split("\n").map((_, i) => {
                const hasIssue = issues.find((iss) => iss.line === i + 1);
                return (
                  <div key={i} style={{
                    color: hasIssue?.severity === "danger" ? "var(--c-red)" :
                           hasIssue?.severity === "warn" ? "var(--c-yellow)" :
                           hasIssue ? "var(--c-cyan)" : "var(--c-muted)",
                  }}>
                    {i + 1}
                  </div>
                );
              })}
            </div>
            <textarea
              value={script}
              onChange={(e) => { setScript(e.target.value); setStage("edit"); }}
              spellCheck={false}
              disabled={stage === "executing"}
              placeholder={t("badusb.placeholder")}
              style={{
                width: "100%", minHeight: 280,
                background: "var(--c-bg)", color: "var(--c-ink)",
                border: "2px solid var(--c-rule)", fontFamily: "var(--font-mono)",
                fontSize: "0.78rem", lineHeight: "1.6",
                padding: "0.5rem 0.5rem 0.5rem 2.5rem",
                outline: "none", resize: "vertical", whiteSpace: "pre", overflow: "auto", tabSize: 2,
              }}
              onFocus={(e) => { if (stage !== "executing") e.target.style.borderColor = "var(--c-purple)"; }}
              onBlur={(e) => e.target.style.borderColor = "var(--c-rule)"}
            />
          </div>
        </PixelPanel>

        {showCmdRef && (
          <PixelPanel title={t("badusb.commands")}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {DUCKY_COMMANDS.map((cmd) => (
                <div key={cmd.cmd} className="pixel-card" style={{ padding: "0.3rem 0.5rem", cursor: "pointer" }}
                  onClick={() => setScript((prev) => prev + (prev.endsWith("\n") ? "" : "\n") + cmd.cmd + " ")}>
                  <code style={{ fontSize: "0.72rem" }}>{cmd.cmd}</code>
                  <div className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>{cmd.desc}</div>
                </div>
              ))}
            </div>
          </PixelPanel>
        )}
      </div>

      {/* Preview panel (visible in preview/confirm/executing stages) */}
      {(stage === "preview" || stage === "confirm" || stage === "executing" || stage === "done") && (
        <PixelPanel title={previewLoading ? "ANALYZING..." : t("badusb.stepByStepPreview")}>
          {previewLoading ? (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <span style={{ color: "var(--c-purple)", animation: "blink 1s step-end infinite" }}>●●●</span>
              <div className="font-term text-dim" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>Analyzing script...</div>
            </div>
          ) : report && (
            <>
              {/* Report summary */}
              <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.8rem", flexWrap: "wrap" }}>
                <StatusBadge count={report.danger_count} label={t("risk.dangerous")} color="red" icon="warning" />
                <StatusBadge count={report.warn_count} label={t("risk.caution")} color="yellow" icon="info" />
                <StatusBadge count={report.safe_count} label={t("risk.safe")} color="green" icon="shield" />
                <div style={{ flex: 1 }} />
                {report.passed ? (
                  <span className="font-pixel" style={{ fontSize: "0.65rem", color: "var(--c-green)", alignSelf: "center" }}>
                    ✓ {t("badusb.readyToExecute")}
                  </span>
                ) : (
                  <span className="font-pixel" style={{ fontSize: "0.65rem", color: "var(--c-red)", alignSelf: "center" }}>
                    ✗ {t("badusb.blockedFixFirst")}
                  </span>
                )}
              </div>

              {/* Line-by-line preview */}
              <div style={{ maxHeight: 250, overflowY: "auto", border: "1px solid var(--c-rule)" }}>
                {previewLines.map((line) => (
                  <div key={line.line_num} style={{
                    display: "flex", gap: "0.5rem", padding: "0.25rem 0.5rem",
                    borderBottom: "1px solid var(--c-bg3)",
                    background: line.risk === "danger" ? "rgba(248,113,113,0.05)" :
                               line.risk === "warn" ? "rgba(250,204,21,0.03)" : "transparent",
                  }}>
                    <span className="font-mono text-muted" style={{ fontSize: "0.68rem", minWidth: 28 }}>L{line.line_num}</span>
                    <code className="font-mono" style={{ fontSize: "0.72rem", color: "var(--c-dim)", minWidth: 120 }}>{line.raw}</code>
                    <span style={{ flex: 1 }} />
                    <span className="font-term" style={{
                      fontSize: "0.72rem",
                      color: line.risk === "danger" ? "var(--c-red)" :
                             line.risk === "warn" ? "var(--c-yellow)" : "var(--c-green)",
                    }}>
                      {line.action}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.8rem", justifyContent: "flex-end" }}>
                <PixelButton variant="ghost" icon={<Icon name="close" size={12} />} onClick={handleReset}>
                  {t("badusb.backToEdit")}
                </PixelButton>
                {stage === "confirm" && report.passed && (
                  <>
                    <PixelButton variant="danger" icon={<Icon name="stop" size={12} />} onClick={handleEmergencyStop}>
                      {t("badusb.emergencyStop")}
                    </PixelButton>
                    <PixelButton
                      variant="primary"
                      icon={<Icon name="play" size={12} />}
                      onClick={handleConfirmExecute}
                    >
                      {t("badusb.confirmAndExecute")}
                    </PixelButton>
                  </>
                )}
                {stage === "executing" && (
                  <PixelButton variant="danger" icon={<Icon name="stop" size={12} />} onClick={handleEmergencyStop}>
                    STOP NOW
                  </PixelButton>
                )}
                {stage === "done" && (
                  <PixelButton variant="primary" icon={<Icon name="check" size={12} />} onClick={handleReset}>
                    DONE — NEW SCRIPT
                  </PixelButton>
                )}
                {stage === "preview" && !report.passed && (
                  <PixelButton variant="ghost" icon={<Icon name="refresh" size={12} />} onClick={handlePreview}>
                    RE-ANALYZE
                  </PixelButton>
                )}
              </div>
            </>
          )}
        </PixelPanel>
      )}

      {/* Static analysis (always visible in edit stage) */}
      {stage === "edit" && (
        <PixelPanel title={t("badusb.complianceCheck")}>
          <div style={{ display: "flex", gap: "1rem", marginBottom: "0.8rem" }}>
            <StatusBadge count={dangerCount} label={t("risk.dangerous")} color="red" icon="warning" />
            <StatusBadge count={warnCount} label={t("risk.caution")} color="yellow" icon="info" />
            <div style={{ flex: 1 }} />
            <PixelButton
              variant={dangerCount > 0 ? "ghost" : "primary"}
              icon={<Icon name="search" size={12} />}
              onClick={handlePreview}
              disabled={previewLoading || !script.trim()}
            >
              {previewLoading ? "ANALYZING..." : `${t("badusb.review")} & ${t("badusb.preview")}`}
            </PixelButton>
          </div>
          {issues.length === 0 ? (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <Icon name="shield" size={32} style={{ color: "var(--c-green)", opacity: 0.5 }} />
              <div className="font-term text-green" style={{ fontSize: "0.82rem", marginTop: "0.3rem" }}>
                {t("badusb.noIssues")}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {issues.map((issue, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: "0.5rem", padding: "0.3rem 0.5rem",
                  background: issue.severity === "danger" ? "rgba(248,113,113,0.06)" :
                              issue.severity === "warn" ? "rgba(250,204,21,0.06)" : "rgba(34,211,238,0.06)",
                  borderLeft: `3px solid ${
                    issue.severity === "danger" ? "var(--c-red)" :
                    issue.severity === "warn" ? "var(--c-yellow)" : "var(--c-cyan)"
                  }`,
                }}>
                  <Icon name={issue.severity === "danger" ? "warning" : "info"} size={14} style={{
                    color: issue.severity === "danger" ? "var(--c-red)" :
                           issue.severity === "warn" ? "var(--c-yellow)" : "var(--c-cyan)", marginTop: 2,
                  }} />
                  <div>
                    <span className="font-mono text-muted" style={{ fontSize: "0.68rem" }}>L{issue.line}: </span>
                    <span className="font-term" style={{
                      fontSize: "0.78rem",
                      color: issue.severity === "danger" ? "var(--c-red)" :
                             issue.severity === "warn" ? "var(--c-yellow)" : "var(--c-cyan)",
                    }}>{issue.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PixelPanel>
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ count: number; label: string; color: "red" | "yellow" | "green"; icon: "warning" | "info" | "shield" }> = ({ count, label, color, icon }) => {
  const colorVar = color === "red" ? "var(--c-red)" : color === "yellow" ? "var(--c-yellow)" : "var(--c-green)";
  return (
    <div style={{
      background: count > 0 ? (color === "red" ? "rgba(248,113,113,0.1)" : color === "yellow" ? "rgba(250,204,21,0.1)" : "rgba(74,222,128,0.1)") : "transparent",
      border: `2px solid ${count > 0 ? colorVar : "var(--c-rule)"}`,
      padding: "0.3rem 0.7rem",
      display: "flex", alignItems: "center", gap: "0.4rem",
    }}>
      <Icon name={icon} size={14} style={{ color: count > 0 ? colorVar : "var(--c-muted)" }} />
      <span className="font-pixel" style={{ fontSize: "0.65rem", color: count > 0 ? colorVar : "var(--c-muted)" }}>
        {count} {label}
      </span>
    </div>
  );
};
