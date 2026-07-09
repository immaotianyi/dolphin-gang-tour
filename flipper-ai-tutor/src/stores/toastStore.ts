/**
 * Toast 通知系统 Store
 *
 * 全局轻量级通知，支持 success/error/info/achievement/pet 五种类型。
 * 自动倒计时消失（默认 3s，achievement 5s），也可手动关闭。
 * 最多同时显示 5 条，超出时自动移除最早的。
 */
import { create } from "zustand";
import type { ToastItem, ToastType } from "@/types";

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 3000;

/** 自动消失计时器映射（id → timer） */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** 生成唯一 ID */
function genId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 清除某个 toast 的自动消失计时器 */
function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

interface ToastStore {
  toasts: ToastItem[];
  /** 显示一条通知 */
  show: (type: ToastType, title: string, message?: string, icon?: string, duration?: number) => string;
  /** 关闭指定通知 */
  dismiss: (id: string) => void;
  /** 关闭全部 */
  clear: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  show: (type, title, message, icon, duration) => {
    const id = genId();
    const dur = duration ?? (type === "achievement" || type === "pet" ? 5000 : DEFAULT_DURATION);

    const toast: ToastItem = { id, type, title, message, icon, duration: dur };

    set((state) => {
      // 超出上限时移除最早的
      const next = [...state.toasts, toast];
      if (next.length > MAX_TOASTS) {
        const removed = next.shift()!;
        clearTimer(removed.id);
      }
      return { toasts: next };
    });

    // 设置自动消失
    if (dur > 0) {
      const timer = setTimeout(() => {
        get().dismiss(id);
      }, dur);
      timers.set(id, timer);
    }

    return id;
  },

  dismiss: (id) => {
    clearTimer(id);
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  clear: () => {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    set({ toasts: [] });
  },
}));

// ================================================================
// 便捷方法（可在非组件代码中直接调用）
// ================================================================

export const toast = {
  success: (title: string, message?: string) =>
    useToastStore.getState().show("success", title, message),
  error: (title: string, message?: string) =>
    useToastStore.getState().show("error", title, message),
  info: (title: string, message?: string) =>
    useToastStore.getState().show("info", title, message),
  achievement: (title: string, message?: string) =>
    useToastStore.getState().show("achievement", title, message, "trophy"),
  pet: (title: string, message?: string) =>
    useToastStore.getState().show("pet", title, message, "pet"),
};
