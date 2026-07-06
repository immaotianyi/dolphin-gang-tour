/**
 * Toast 通知容器 — 固定在右上角，堆叠显示通知卡片
 * 每条通知带类型图标、标题、消息、自动消失进度条
 */
import React from "react";
import { useToastStore } from "@/stores/toastStore";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import type { ToastType } from "@/types";

const TYPE_CONFIG: Record<ToastType, { icon: IconName; color: string; bg: string; border: string }> = {
  success: { icon: "check", color: "var(--c-green)", bg: "rgba(0,255,65,0.12)", border: "var(--c-green)" },
  error: { icon: "warning", color: "var(--c-red)", bg: "rgba(255,51,51,0.12)", border: "var(--c-red)" },
  info: { icon: "info", color: "var(--c-blue)", bg: "rgba(68,170,255,0.12)", border: "var(--c-blue)" },
  achievement: { icon: "trophy", color: "var(--c-orange)", bg: "rgba(255,123,36,0.15)", border: "var(--c-orange)" },
  pet: { icon: "pet", color: "var(--c-green)", bg: "rgba(0,255,65,0.10)", border: "var(--c-green)" },
};

const TOAST_CSS = `
@keyframes toast-slide-in {
  from { opacity: 0; transform: translateX(40px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes toast-progress {
  from { width: 100%; }
  to { width: 0%; }
}
.toast-card {
  animation: toast-slide-in 0.3s ease-out;
}
.toast-progress-bar {
  animation: toast-progress linear forwards;
}
`;

export const ToastContainer: React.FC = () => {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{TOAST_CSS}</style>
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 340,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          const cfg = TYPE_CONFIG[t.type];
          return (
            <div
              key={t.id}
              className="toast-card"
              style={{
                background: cfg.bg,
                border: `1.5px solid ${cfg.border}`,
                padding: "8px 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                pointerEvents: "auto",
                position: "relative",
                overflow: "hidden",
                boxShadow: `0 4px 12px rgba(0,0,0,0.4), 0 0 8px ${cfg.border}33`,
              }}
            >
              {/* 图标 */}
              <Icon name={cfg.icon} size={18} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />

              {/* 内容 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="font-pixel"
                  style={{ fontSize: 9, color: cfg.color, marginBottom: 2 }}
                >
                  {t.title}
                </div>
                {t.message && (
                  <div className="font-term text-dim" style={{ fontSize: 13, lineHeight: 1.4 }}>
                    {t.message}
                  </div>
                )}
              </div>

              {/* 关闭按钮 */}
              <button
                onClick={() => dismiss(t.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  color: "var(--c-gray)",
                  flexShrink: 0,
                }}
              >
                <Icon name="cross" size={14} />
              </button>

              {/* 进度条 */}
              <div
                className="toast-progress-bar"
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  height: 2,
                  background: cfg.border,
                  animationDuration: `${t.duration}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
};
