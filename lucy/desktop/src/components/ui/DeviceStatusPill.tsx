/** DeviceStatusPill 设备状态胶囊 — Connected/Virtual/Disconnected/Scanning */
import React from "react";
import { Icon } from "@/components/ui/Icon";

type Status = "connected" | "virtual" | "disconnected" | "scanning" | "error" | "updating";

interface Props {
  status: Status;
  label?: string;
}

const CONFIG: Record<Status, { color: string; icon: "check" | "chip" | "power" | "search" | "warning" | "refresh"; pulse?: boolean }> = {
  connected:    { color: "var(--c-green)",  icon: "check" },
  virtual:      { color: "var(--c-cyan)",   icon: "chip" },
  disconnected: { color: "var(--c-muted)",  icon: "power" },
  scanning:     { color: "var(--c-yellow)", icon: "search", pulse: true },
  error:        { color: "var(--c-red)",    icon: "warning" },
  updating:     { color: "var(--c-purple)", icon: "refresh", pulse: true },
};

export const DeviceStatusPill: React.FC<Props> = ({ status, label }) => {
  const c = CONFIG[status];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.15rem 0.5rem",
        border: `1px solid ${c.color}`,
        background: c.color + "11",
      }}
    >
      <span
        className="led"
        style={{
          width: 6,
          height: 6,
          background: c.color,
          animation: c.pulse ? "blink 1s step-end infinite" : "none",
        }}
      />
      <Icon name={c.icon} size={10} style={{ color: c.color }} />
      <span
        className="font-pixel"
        style={{ fontSize: "0.58rem", color: c.color, letterSpacing: "0.05em" }}
      >
        {label || status.toUpperCase()}
      </span>
    </div>
  );
};
