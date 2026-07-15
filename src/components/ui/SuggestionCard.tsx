/** AI 命令建议卡片 — 审批制 UI
 * 显示命令风险等级、描述，提供批准/拒绝按钮
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { PixelButton } from "@/components/ui/PixelButton";
import type { CommandSuggestion } from "@/types";

interface Props {
  suggestion: CommandSuggestion;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const RISK_STYLE: Record<string, { color: string; bg: string; border: string; labelKey: string; icon: "shield" | "info" | "warning" | "cross" }> = {
  safe: {
    color: "var(--c-green)",
    bg: "rgba(74,222,128,0.08)",
    border: "var(--c-green)",
    labelKey: "risk.safe",
    icon: "shield",
  },
  caution: {
    color: "var(--c-cyan)",
    bg: "rgba(34,211,238,0.08)",
    border: "var(--c-cyan)",
    labelKey: "risk.caution",
    icon: "info",
  },
  dangerous: {
    color: "var(--c-yellow)",
    bg: "rgba(250,204,21,0.08)",
    border: "var(--c-yellow)",
    labelKey: "risk.dangerous",
    icon: "warning",
  },
  blocked: {
    color: "var(--c-red)",
    bg: "rgba(248,113,113,0.08)",
    border: "var(--c-red)",
    labelKey: "risk.blocked",
    icon: "cross",
  },
};

export const SuggestionCard: React.FC<Props> = ({ suggestion, onApprove, onReject }) => {
  const { t } = useTranslation();
  const style = RISK_STYLE[suggestion.risk] || RISK_STYLE.caution;
  const isBlocked = suggestion.risk === "blocked" || suggestion.risk === "dangerous";

  return (
    <div
      style={{
        background: style.bg,
        border: `2px solid ${style.border}`,
        padding: "0.6rem 0.7rem",
        marginTop: "0.4rem",
        animation: "slide-in-up 0.3s var(--ease-apple)",
      }}
    >
      {/* Header: risk badge + command */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
        <span
          className="font-pixel"
          style={{
            fontSize: "0.6rem",
            color: style.color,
            border: `1px solid ${style.color}`,
            padding: "0.1rem 0.4rem",
            letterSpacing: "0.05em",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.2rem",
          }}
        >
          <Icon name={style.icon} size={10} style={{ color: style.color }} />
          {suggestion.risk_label || t(style.labelKey)}
        </span>
        <span
          className="font-mono"
          style={{ fontSize: "0.72rem", color: "var(--c-ink)", flex: 1, wordBreak: "break-all" }}
        >
          {suggestion.raw}
        </span>
      </div>

      {/* Description */}
      {suggestion.description && (
        <div
          className="font-term"
          style={{ fontSize: "0.75rem", color: "var(--c-dim)", marginBottom: "0.3rem", lineHeight: 1.5 }}
        >
          {suggestion.description}
        </div>
      )}

      {/* AI reason */}
      {suggestion.ai_reason && (
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--c-muted)",
            fontStyle: "italic",
            marginBottom: "0.4rem",
            paddingLeft: "0.5rem",
            borderLeft: "2px solid var(--c-orange)",
          }}
        >
          Lucy: {suggestion.ai_reason}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
        <PixelButton
          variant="ghost"
          style={{ fontSize: "0.65rem", padding: "0.2rem 0.5rem" }}
          icon={<Icon name="cross" size={10} />}
          onClick={() => onReject(suggestion.id)}
        >
          REJECT
        </PixelButton>
        {!isBlocked && (
          <PixelButton
            variant={suggestion.auto_executable ? "primary" : "danger"}
            style={{ fontSize: "0.65rem", padding: "0.2rem 0.5rem" }}
            icon={<Icon name="check" size={10} />}
            onClick={() => onApprove(suggestion.id)}
          >
            {suggestion.auto_executable ? t("ai.execute") : t("ai.confirmExecute")}
          </PixelButton>
        )}
        {isBlocked && (
          <span
            className="font-term"
            style={{ fontSize: "0.65rem", color: style.color, alignSelf: "center" }}
          >
            此命令已被安全策略拦截，请手动操作
          </span>
        )}
      </div>
    </div>
  );
};
