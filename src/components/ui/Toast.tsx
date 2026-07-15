/** Toast 通知组件 — 成功/失败/警告/设备断连 */
import React, { useEffect, useState, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";

export type ToastType = "success" | "error" | "warn" | "info";
export type ToastId = string;

interface ToastItem {
  id: ToastId;
  type: ToastType;
  message: string;
  duration: number;
}

let toastListeners: ((toast: ToastItem) => void)[] = [];

/** 外部调用：显示一个 Toast */
export function showToast(type: ToastType, message: string, duration = 3000) {
  const toast: ToastItem = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    message,
    duration,
  };
  toastListeners.forEach((fn) => fn(toast));
}

const TOAST_STYLE: Record<ToastType, { color: string; bg: string; icon: "check" | "cross" | "warning" | "info" }> = {
  success: { color: "var(--c-green)",  bg: "rgba(74,222,128,0.1)",  icon: "check" },
  error:   { color: "var(--c-red)",    bg: "rgba(248,113,113,0.1)", icon: "cross" },
  warn:    { color: "var(--c-yellow)", bg: "rgba(250,204,21,0.1)",  icon: "warning" },
  info:    { color: "var(--c-cyan)",   bg: "rgba(34,211,238,0.1)",  icon: "info" },
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: ToastId) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const listener = (toast: ToastItem) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => removeToast(toast.id), toast.duration);
    };
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== listener);
    };
  }, [removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 40,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        maxWidth: 360,
      }}
    >
      {toasts.map((toast) => {
        const s = TOAST_STYLE[toast.type];
        return (
          <div
            key={toast.id}
            style={{
              background: s.bg,
              border: `2px solid ${s.color}`,
              padding: "0.5rem 0.7rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.4rem",
              animation: "slide-in-right 0.25s var(--ease-apple)",
            }}
          >
            <Icon name={s.icon} size={14} style={{ color: s.color, marginTop: 2, minWidth: 14 }} />
            <span className="font-term" style={{ fontSize: "0.78rem", color: "var(--c-ink)", flex: 1, lineHeight: 1.5 }}>
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: "none",
                border: "none",
                color: "var(--c-muted)",
                cursor: "pointer",
                padding: 0,
                fontSize: "0.7rem",
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};
