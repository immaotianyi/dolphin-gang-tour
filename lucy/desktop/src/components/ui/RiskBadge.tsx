/** RiskBadge 风险等级徽章 — Safe/Caution/Dangerous/Blocked */
import React from "react";
import { Icon } from "@/components/ui/Icon";
import type { RiskLevel } from "@/types";

interface Props {
  level: RiskLevel;
  label?: string;
  size?: "sm" | "md";
}

const STYLES: Record<RiskLevel, { color: string; bg: string; icon: "shield" | "info" | "warning" | "cross" }> = {
  safe:       { color: "var(--c-green)",  bg: "rgba(74,222,128,0.08)",  icon: "shield" },
  caution:    { color: "var(--c-cyan)",   bg: "rgba(34,211,238,0.08)",  icon: "info" },
  dangerous:  { color: "var(--c-yellow)", bg: "rgba(250,204,21,0.08)",  icon: "warning" },
  blocked:    { color: "var(--c-red)",    bg: "rgba(248,113,113,0.08)", icon: "cross" },
};

export const RiskBadge: React.FC<Props> = ({ level, label, size = "md" }) => {
  const s = STYLES[level];
  const fontSize = size === "sm" ? "0.55rem" : "0.6rem";
  const iconSize = size === "sm" ? 8 : 10;

  return (
    <span
      className="font-pixel"
      style={{
        fontSize,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.color}`,
        padding: "0.1rem 0.4rem",
        letterSpacing: "0.05em",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.2rem",
      }}
    >
      <Icon name={s.icon} size={iconSize} style={{ color: s.color }} />
      {label || level.toUpperCase()}
    </span>
  );
};
