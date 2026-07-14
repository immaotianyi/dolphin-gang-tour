/** TaskStepper — 任务流步骤可视化组件 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { useTaskStore } from "@/stores/taskStore";
import type { RiskLevel, TaskStepStatus } from "@/types";

const STATUS_COLOR: Record<TaskStepStatus, string> = {
  pending: "var(--c-muted)",
  active: "var(--c-orange)",
  done: "var(--c-green)",
  skipped: "var(--c-dim)",
  error: "var(--c-red)",
};

const RISK_COLOR: Record<RiskLevel, string> = {
  safe: "var(--c-green)",
  caution: "var(--c-yellow)",
  dangerous: "var(--c-orange)",
  blocked: "var(--c-red)",
};

export const TaskStepper: React.FC = () => {
  const { t } = useTranslation();
  const { activeFlow, advanceStep, skipStep, cancelFlow, completeFlow, errorStep, retryStep, resumeFlow } = useTaskStore();

  if (!activeFlow) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center" }}>
        <Icon name="check" size={28} style={{ color: "var(--c-muted)", marginBottom: "0.4rem" }} />
        <div className="font-pixel text-muted" style={{ fontSize: "0.6rem", letterSpacing: "0.08em" }}>
          {t("taskflow.noActiveFlow")}
        </div>
        <div className="font-mono text-dim" style={{ fontSize: "0.68rem", marginTop: "0.25rem" }}>
          {t("taskflow.noActiveFlowHint")}
        </div>
      </div>
    );
  }

  const currentStep = activeFlow.steps[activeFlow.currentStep];
  const doneCount = activeFlow.steps.filter(s => s.status === "done" || s.status === "skipped").length;
  const progress = (doneCount / activeFlow.steps.length) * 100;
  const isLastStep = activeFlow.currentStep >= activeFlow.steps.length - 1;
  const stepLabel = (id: string, fallback: string) =>
    t(`taskflow.steps.${activeFlow.module}_${id}`, { defaultValue: fallback });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="font-pixel text-orange" style={{ fontSize: "0.58rem", letterSpacing: "0.1em" }}>
            {t(`taskflow.flows.${activeFlow.module}`, { defaultValue: activeFlow.title })}
          </div>
          <div className="font-term text-ink" style={{ fontSize: "0.82rem", marginTop: "0.15rem" }}>
            {activeFlow.title}
          </div>
        </div>
        <div className="font-mono text-dim" style={{ fontSize: "0.68rem" }}>
          {t("taskflow.step")} {activeFlow.currentStep + 1}{t("taskflow.of")}{activeFlow.steps.length}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: "4px", background: "var(--c-bg3)", border: "1px solid var(--c-rule)" }}>
        <div style={{
          height: "100%",
          width: `${progress}%`,
          background: "var(--c-orange)",
          transition: "width 0.3s var(--ease-apple)",
        }} />
      </div>

      {/* Step list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
        {activeFlow.steps.map((step, idx) => {
          const color = STATUS_COLOR[step.status];
          const isCurrent = idx === activeFlow.currentStep;
          return (
            <div key={step.id} style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.3rem 0.4rem",
              background: isCurrent ? "rgba(249,115,22,0.05)" : "transparent",
              borderLeft: isCurrent ? "3px solid var(--c-orange)" : "3px solid transparent",
              transition: "all 0.2s var(--ease-apple)",
            }}>
              <div style={{
                width: "18px",
                height: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `2px solid ${color}`,
                color,
                fontSize: "0.58rem",
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
              }}>
                {step.status === "done" ? <Icon name="check" size={10} /> :
                 step.status === "skipped" ? "-" :
                 step.status === "error" ? "!" :
                 idx + 1}
              </div>
              <span style={{
                fontFamily: "var(--font-term)",
                fontSize: "0.76rem",
                color: step.status === "pending" ? "var(--c-dim)" : "var(--c-ink)",
                textDecoration: step.status === "skipped" ? "line-through" : "none",
                flex: 1,
              }}>
                {stepLabel(step.id, step.title)}
              </span>
              {step.optional && (
                <span className="font-mono text-muted" style={{ fontSize: "0.52rem" }}>OPT</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Current step detail */}
      {currentStep && (
        <div style={{
          padding: "0.5rem 0.7rem",
          background: "var(--c-bg2)",
          border: "2px solid var(--c-rule)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <span className="font-term text-ink" style={{ fontSize: "0.78rem" }}>
              {stepLabel(currentStep.id, currentStep.title)}
            </span>
            <span style={{
              fontSize: "0.52rem",
              fontFamily: "var(--font-mono)",
              padding: "0.1rem 0.35rem",
              border: `1px solid ${RISK_COLOR[currentStep.riskLevel]}`,
              color: RISK_COLOR[currentStep.riskLevel],
            }}>
              {t(`risk.${currentStep.riskLevel}`)}
            </span>
          </div>
          <p className="font-mono text-dim" style={{ fontSize: "0.68rem", lineHeight: 1.5, margin: 0 }}>
            {currentStep.description}
          </p>
        </div>
      )}

      {/* Error message display */}
      {currentStep?.status === "error" && !!currentStep?.resultData?.error && (
        <div style={{
          padding: "0.4rem 0.6rem", marginBottom: "0.4rem",
          background: "rgba(248,113,113,0.1)", border: "1px solid var(--c-red)",
        }}>
          <span className="font-term text-red" style={{ fontSize: "0.72rem" }}>
            <Icon name="cross" size={12} style={{ marginRight: 4 }} />
            {String(currentStep.resultData.error)}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end" }}>
        <button onClick={cancelFlow} style={btnStyle("var(--c-red)")}>
          <Icon name="close" size={11} />
          <span>{t("taskflow.cancelFlow")}</span>
        </button>
        {currentStep?.status === "error" ? (
          <>
            <button onClick={retryStep} style={btnStyle("var(--c-cyan)")}>
              <Icon name="refresh" size={11} />
              <span>{t("errors.retry")}</span>
            </button>
            <button onClick={resumeFlow} style={btnStyle("var(--c-yellow)")}>
              <span>{t("taskflow.nextStep")}</span>
              <Icon name="chevron-right" size={11} />
            </button>
          </>
        ) : (
          <>
            {currentStep?.optional && (
              <button onClick={skipStep} style={btnStyle("var(--c-muted)")}>
                <span>{t("taskflow.skipStep")}</span>
              </button>
            )}
            {isLastStep ? (
              <button onClick={() => completeFlow()} style={btnStyle("var(--c-green)")}>
                <Icon name="check" size={11} />
                <span>{t("taskflow.completeFlow")}</span>
              </button>
            ) : (
              <button onClick={() => advanceStep()} style={btnStyle("var(--c-orange)")}>
                <span>{t("taskflow.nextStep")}</span>
                <Icon name="chevron-right" size={11} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

function btnStyle(color: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.3rem 0.6rem",
    background: "transparent",
    border: `2px solid ${color}`,
    color,
    fontFamily: "var(--font-term)",
    fontSize: "0.7rem",
    cursor: "pointer",
    transition: "all 0.2s var(--ease-apple)",
  };
}
