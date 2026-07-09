/**
 * 倒计时 Hook
 *
 * 用于 ETA（预计剩余时间）显示。
 * 接收初始秒数，每秒递减，到达 0 后停止。
 * 当初始秒数变化时自动重置。
 *
 * @example
 * ```tsx
 * // 基本用法
 * const { remaining, formatted, isExpired } = useCountdown(30);
 *
 * // 带激活控制
 * const { remaining, formatted } = useCountdown(etaSeconds, isImporting);
 *
 * // 格式化输出: "00:30" 或 "01:05:30"
 * ```
 */
import { useState, useEffect, useMemo, useCallback } from "react";

/** useCountdown 返回值 */
interface UseCountdownResult {
  /** 剩余秒数 */
  remaining: number;
  /** 格式化后的时间字符串（MM:SS 或 HH:MM:SS） */
  formatted: string;
  /** 是否已到期（剩余 0 秒） */
  isExpired: boolean;
}

/**
 * 格式化秒数为时间字符串
 * - 小于 1 小时: MM:SS
 * - 大于等于 1 小时: HH:MM:SS
 */
function formatDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * 倒计时 hook
 *
 * @param initialSeconds 初始秒数（当此值变化时倒计时重置）
 * @param active 是否激活倒计时（默认 true，设为 false 暂停）
 * @returns 剩余秒数、格式化字符串、是否到期
 */
export function useCountdown(
  initialSeconds: number,
  active: boolean = true
): UseCountdownResult {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor(initialSeconds))
  );

  // 当 initialSeconds 变化时重置倒计时
  useEffect(() => {
    setRemaining(Math.max(0, Math.floor(initialSeconds)));
  }, [initialSeconds]);

  // 每秒递减
  useEffect(() => {
    // 不激活或初始值为 0 时不启动定时器
    if (!active || initialSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // 清理定时器
    return () => clearInterval(timer);
  }, [active, initialSeconds]);

  const isExpired = remaining <= 0;

  const formatted = useMemo(() => formatDuration(remaining), [remaining]);

  return { remaining, formatted, isExpired };
}

/**
 * 带重置功能的倒计时 hook
 *
 * @param initialSeconds 初始秒数
 * @param active 是否激活
 * @returns 剩余秒数、格式化字符串、是否到期、重置函数
 */
export function useCountdownReset(
  initialSeconds: number,
  active: boolean = true
): UseCountdownResult & { reset: (to?: number) => void } {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor(initialSeconds))
  );

  useEffect(() => {
    setRemaining(Math.max(0, Math.floor(initialSeconds)));
  }, [initialSeconds]);

  useEffect(() => {
    if (!active || remaining <= 0) return;

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [active, remaining > 0, initialSeconds]);

  const reset = useCallback((to?: number) => {
    setRemaining(Math.max(0, Math.floor(to ?? initialSeconds)));
  }, [initialSeconds]);

  const isExpired = remaining <= 0;
  const formatted = useMemo(() => formatDuration(remaining), [remaining]);

  return { remaining, formatted, isExpired, reset };
}
