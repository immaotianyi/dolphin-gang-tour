/** Toggle 开关组件 — 用于安全设置/隐私模式 */
import React from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled, size = "md" }) => {
  const w = size === "sm" ? 32 : 40;
  const h = size === "sm" ? 18 : 22;
  const knob = size === "sm" ? 12 : 16;

  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: w,
        height: h,
        background: checked ? "var(--c-green)" : "var(--c-bg4)",
        border: `2px solid ${checked ? "var(--c-green)" : "var(--c-rule-light)"}`,
        borderRadius: 0,
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.2s var(--ease-apple)",
        opacity: disabled ? 0.5 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 1,
          left: checked ? w - knob - 3 : 1,
          width: knob,
          height: knob,
          background: checked ? "var(--c-bg)" : "var(--c-dim)",
          transition: "left 0.2s var(--ease-apple), background 0.2s",
        }}
      />
    </button>
  );
};
