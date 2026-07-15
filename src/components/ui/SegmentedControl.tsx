/** SegmentedControl 分段选择器 — 用于模式切换 (Read/Write/Emulate 等) */
import React from "react";

interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}

export function SegmentedControl<T extends string>({ segments, value, onChange, size = "md" }: Props<T>) {
  const fontSize = size === "sm" ? "0.65rem" : "0.72rem";
  const padding = size === "sm" ? "0.2rem 0.6rem" : "0.3rem 0.8rem";

  return (
    <div
      style={{
        display: "inline-flex",
        border: "2px solid var(--c-rule)",
        background: "var(--c-bg2)",
      }}
    >
      {segments.map((seg, i) => {
        const active = seg.value === value;
        return (
          <button
            key={seg.value}
            onClick={() => onChange(seg.value)}
            style={{
              padding,
              fontSize,
              fontFamily: "var(--font-pixel)",
              letterSpacing: "0.03em",
              background: active ? "var(--c-bg3)" : "transparent",
              color: active ? "var(--c-orange)" : "var(--c-muted)",
              border: "none",
              borderRight: i < segments.length - 1 ? "1px solid var(--c-rule)" : "none",
              cursor: "pointer",
              transition: "all 0.15s var(--ease-apple)",
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--c-dim);"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--c-muted)"; }}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
