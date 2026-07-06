/**
 * 设备相关便捷 Hooks
 *
 * 提供对 deviceStore 的封装，简化组件中的使用。
 */
import { useEffect, useRef, useCallback } from "react";
import type { DeviceConnectionState, DeviceInfo } from "@/types";
import {
  useDeviceStore,
  isDeviceReady,
  getConnectionLabel,
} from "@/stores/deviceStore";

// ================================================================
// useDeviceInfo — 获取设备信息（带自动刷新）
// ================================================================

/**
 * 获取设备信息 hook。
 * 返回当前设备信息、是否已连接、以及手动刷新函数。
 *
 * @example
 * ```tsx
 * const { deviceInfo, isConnected, refresh } = useDeviceInfo();
 * ```
 */
export function useDeviceInfo() {
  const deviceInfo = useDeviceStore((s) => s.deviceInfo);
  const connectionState = useDeviceStore((s) => s.connectionState);
  const refreshDeviceInfo = useDeviceStore((s) => s.refreshDeviceInfo);

  const isConnected = isDeviceReady(connectionState);

  const refresh = useCallback(() => {
    if (isConnected) {
      refreshDeviceInfo();
    }
  }, [isConnected, refreshDeviceInfo]);

  return {
    deviceInfo: deviceInfo as DeviceInfo | null,
    isConnected,
    refresh,
  } as const;
}

// ================================================================
// useConnectionState — 获取连接状态（带标签）
// ================================================================

/**
 * 获取设备连接状态 hook。
 * 返回连接状态、中文标签、是否已就绪、是否正在连接。
 *
 * @example
 * ```tsx
 * const { state, label, isReady, isConnecting } = useConnectionState();
 * ```
 */
export function useConnectionState() {
  const connectionState = useDeviceStore((s) => s.connectionState);
  const isConnecting = useDeviceStore((s) => s.isConnecting);
  const isScanning = useDeviceStore((s) => s.isScanning);

  return {
    state: connectionState as DeviceConnectionState,
    label: getConnectionLabel(connectionState),
    isReady: isDeviceReady(connectionState),
    isConnecting,
    isScanning,
  } as const;
}

// ================================================================
// useAutoConnect — 自动扫描连接 + 事件监听
// ================================================================

/**
 * 自动连接 hook（已弃用 — 事件监听已由模块级自动注册）。
 * 保留此 hook 仅为向后兼容，initListeners 已改为空操作。
 * 组件挂载时仅执行自动扫描。
 *
 * @deprecated 事件监听已在模块级自动注册，无需手动调用
 */
export function useAutoConnect(): void {
  const initializedRef = useRef(false);

  useEffect(() => {
    // 防止 StrictMode 双重挂载导致重复初始化
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cleanup: (() => void) | undefined;

    // 注册设备状态变化事件监听
    useDeviceStore
      .getState()
      .initListeners()
      .then((fn) => {
        cleanup = fn;
      })
      .catch((err) => {
        console.error("[useAutoConnect] 事件监听初始化失败:", err);
      });

    // 自动扫描设备
    useDeviceStore.getState().scan().catch((err) => {
      console.error("[useAutoConnect] 扫描失败:", err);
    });

    // 清理函数 — 组件卸载时取消监听
    return () => {
      cleanup?.();
      initializedRef.current = false;
    };
  }, []);
}

// ================================================================
// useBatteryLevel — 电池电量（带格式化）
// ================================================================

/**
 * 获取电池电量信息 hook。
 * 返回电量百分比、电压、是否正在充电。
 *
 * @example
 * ```tsx
 * const { level, voltage, isCharging } = useBatteryLevel();
 * ```
 */
export function useBatteryLevel() {
  const deviceInfo = useDeviceStore((s) => s.deviceInfo);

  if (!deviceInfo) {
    return { level: 0, voltage: 0, isCharging: false } as const;
  }

  return {
    level: deviceInfo.batteryLevel,
    voltage: deviceInfo.batteryVoltage,
    isCharging: deviceInfo.isCharging,
  } as const;
}

// ================================================================
// useSdCardInfo — SD 卡信息
// ================================================================

/**
 * 获取 SD 卡信息 hook。
 * 返回是否插入、总容量、剩余容量、使用百分比。
 *
 * @example
 * ```tsx
 * const { inserted, totalBytes, freeBytes, usedPercent } = useSdCardInfo();
 * ```
 */
export function useSdCardInfo() {
  const deviceInfo = useDeviceStore((s) => s.deviceInfo);

  if (!deviceInfo || !deviceInfo.sdCardInserted) {
    return {
      inserted: false,
      totalBytes: 0,
      freeBytes: 0,
      usedPercent: 0,
      format: "",
    } as const;
  }

  const usedBytes = deviceInfo.sdCardTotalBytes - deviceInfo.sdCardFreeBytes;
  const usedPercent =
    deviceInfo.sdCardTotalBytes > 0
      ? Math.round((usedBytes / deviceInfo.sdCardTotalBytes) * 100)
      : 0;

  return {
    inserted: true,
    totalBytes: deviceInfo.sdCardTotalBytes,
    freeBytes: deviceInfo.sdCardFreeBytes,
    usedPercent,
    format: deviceInfo.sdCardFormat,
  } as const;
}
