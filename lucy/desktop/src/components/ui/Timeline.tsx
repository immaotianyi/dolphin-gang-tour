/** Timeline 事件时间线 — 设备事件/命令/错误/AI建议/安全拦截 */
import React from "react";
import { Icon } from "@/components/ui/Icon";

export type TimelineType = "connect" | "disconnect" | "command" | "error" | "ai" | "security" | "info";

interface TimelineEntry {
  id: string;
  type: TimelineType;
  message: string;
  timestamp: number;
  detail?: string;
}

interface Props {
  entries: TimelineEntry[];
  maxItems?: number;
}

const TYPE_CONFIG: Record<TimelineType, { color: string; icon: "check" | "power" | "chip" | "warning" | "robot" | "shield" | "info" }> = {
  connect:    { color: "var(--c-green)",  icon: "check" },
  disconnect: { color: "var(--c-muted)",  icon: "power" },
  command:    { color: "var(--c-cyan)",   icon: "chip" },
  error:      { color: "var(--c-red)",    icon: "warning" },
  ai:         { color: "var(--c-orange)", icon: "robot" },
  security:   { color: "var(--c-yellow)", icon: "shield" },
  info:       { color: "var(--c-blue)",   icon: "info" },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export const Timeline: React.FC<Props> = ({ entries, maxItems = 50 }) => {
  const items = entries.slice(0, maxItems);

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
        <div className="font-term text-muted" style={{ fontSize: "0.82rem" }}>—</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {items.map((entry, i) => {
        const c = TYPE_CONFIG[entry.type];
        const isLast = i === items.length - 1;
        return (
          <div
            key={entry.id}
            style={{
              display: "flex",
              gap: "0.6rem",
              paddingBottom: isLast ? 0 : "0.5rem",
              position: "relative",
              animation: "slide-in-up 0.2s var(--ease-apple)",
            }}
          >
            {/* Timeline dot + line */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 20 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  border: `2px solid ${c.color}`,
                  background: c.color + "11",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={c.icon} size={10} style={{ color: c.color }} />
              </div>
              {!isLast && (
                <div style={{ width: 2, flex: 1, background: "var(--c-rule)", minHeight: 12 }} />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : "0.1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>{formatTime(entry.timestamp)}</span>
                <span className="font-term" style={{ fontSize: "0.75rem", color: c.color }}>{entry.message}</span>
              </div>
              {entry.detail && (
                <div className="font-mono text-muted" style={{ fontSize: "0.68rem", marginTop: "0.1rem", wordBreak: "break-word" }}>
                  {entry.detail}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
