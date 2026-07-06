/**
 * 设备状态管理 Store
 *
 * 管理 Flipper Zero 设备的连接状态、设备信息、历史连接记录。
 * 自动监听 device-state-change 事件并同步更新状态。
 *
 * 在浏览器（非 Tauri）环境下提供 Demo 连接流程，
 * 模拟完整的"扫描 -> 检测 -> 连接"动画体验，让前端演示不依赖真实设备。
 */
import { create } from "zustand";
import type { DeviceConnectionState, DeviceInfo } from "@/types";
import {
  isTauri,
  MOCK_DEVICE_INFO,
  deviceScan,
  deviceConnect,
  deviceDisconnect,
  getDeviceInfo,
  onDeviceStateChange,
} from "@/lib/tauri";

// ================================================================
// 类型定义
// ================================================================

/** 历史连接记录 */
export interface ConnectionRecord {
  port: string;
  deviceName: string;
  firmwareVersion: string;
  timestamp: number;
}

/** 设备 Store 状态 */
interface DeviceStore {
  // ---- State ----
  /** 当前设备连接状态 */
  connectionState: DeviceConnectionState;
  /** 设备详细信息（已连接时有效） */
  deviceInfo: DeviceInfo | null;
  /** USB 端口名称（已连接时有效） */
  usbPort: string | null;
  /** 历史连接记录（最近 10 条） */
  connectionHistory: ConnectionRecord[];
  /** 是否正在扫描 */
  isScanning: boolean;
  /** 是否正在连接 */
  isConnecting: boolean;
  /** 最近一次错误信息 */
  lastError: string | null;
  /** 是否处于 Demo 演示模式（非 Tauri 环境下为 true） */
  isDemoMode: boolean;
  /** Demo 流程中的状态提示文本（如 "DEVICE DETECTED"），仅 Demo 模式下使用 */
  demoStatusText: string | null;

  // ---- Actions ----
  /** 扫描设备，更新连接状态 */
  scan: () => Promise<void>;
  /** 连接设备（可指定串口端口） */
  connect: (port?: string) => Promise<void>;
  /** 断开设备连接 */
  disconnect: () => Promise<void>;
  /** 刷新设备信息 */
  refreshDeviceInfo: () => Promise<void>;
  /** 清除错误信息 */
  clearError: () => void;
  /** 初始化事件监听，返回取消监听函数 */
  initListeners: () => Promise<() => void>;
  /** Demo 演示模式下的模拟连接流程（浏览器环境） */
  demoConnect: () => Promise<void>;
}

// ================================================================
// 辅助函数
// ================================================================

/** 判断连接状态是否表示设备已就绪 */
export function isDeviceReady(state: DeviceConnectionState): boolean {
  return state === "connected";
}

/** 获取连接状态的中文标签 */
export function getConnectionLabel(state: DeviceConnectionState): string {
  const labels: Record<DeviceConnectionState, string> = {
    no_device: "未检测到设备",
    dfu_mode: "DFU 恢复模式",
    port_busy: "串口被占用",
    sd_error: "SD 卡异常",
    connecting: "连接中...",
    connected: "已连接",
    transferring: "传输中",
  };
  return labels[state] ?? "未知状态";
}

/** 延时工具（Demo 流程使用） */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ================================================================
// Store 创建
// ================================================================

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  // ---- State 初始值 ----
  // 无论是否 Tauri 环境，初始都为"未检测到设备"，
  // 由 scan() / AutoScanOnBoot 触发后续连接流程。
  // 浏览器（非 Tauri）环境进入 Demo 演示模式。
  connectionState: "no_device",
  deviceInfo: null,
  usbPort: null,
  connectionHistory: [],
  isScanning: false,
  isConnecting: false,
  lastError: null,
  isDemoMode: !isTauri(),
  demoStatusText: null,

  // ---- Actions ----

  scan: async () => {
    // 非 Tauri 环境（浏览器）下走 Demo 连接流程，
    // 让演示模式也具备完整的"扫描 -> 检测 -> 连接"动画体验。
    if (!isTauri()) {
      await get().demoConnect();
      return;
    }
    // Tauri 环境：调用真实后端扫描
    set({ isScanning: true, lastError: null });
    try {
      const result = await deviceScan();
      if (result.success && result.data) {
        // DeviceScanResult 包含 devices[] / state / portOccupiers / scanTimestamp
        const scanResult = result.data;
        set({ connectionState: scanResult.state });
        // 如果扫描到设备已连接，自动获取设备信息
        if (scanResult.state === "connected" && !get().deviceInfo) {
          await get().refreshDeviceInfo();
        }
        // 如果检测到端口占用，记录错误
        if (scanResult.portOccupiers.length > 0) {
          set({ lastError: `端口被占用: ${scanResult.portOccupiers.join(", ")}` });
        }
      } else {
        set({ lastError: result.error ?? "扫描失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isScanning: false });
    }
  },

  /**
   * Demo 演示模式下的模拟连接流程。
   * 仅在浏览器（非 Tauri）环境下由 scan() 调用。
   * 流程：扫描 USB 端口(1.5s) -> 检测到设备 -> 安装驱动(1s) -> 连接完成
   */
  demoConnect: async () => {
    // 阶段一：开始扫描 USB 端口
    set({
      isScanning: true,
      isDemoMode: true,
      lastError: null,
      demoStatusText: "SCANNING USB PORTS",
      connectionState: "connecting",
    });

    // 模拟扫描 USB 端口耗时
    await delay(1500);

    // 阶段二：检测到设备（仍在连接中，更新提示文本）
    set({
      connectionState: "connecting",
      demoStatusText: "DEVICE DETECTED",
    });

    // 模拟安装驱动耗时
    await delay(1000);

    // 阶段三：连接完成，写入模拟设备信息
    const record: ConnectionRecord = {
      port: "/dev/cu.usbmodem_flipper1",
      deviceName: MOCK_DEVICE_INFO.name,
      firmwareVersion: MOCK_DEVICE_INFO.firmwareVersion,
      timestamp: Date.now(),
    };

    set({
      connectionState: "connected",
      deviceInfo: MOCK_DEVICE_INFO,
      usbPort: "/dev/cu.usbmodem_flipper1",
      isScanning: false,
      demoStatusText: "CONNECTED",
      connectionHistory: [record, ...get().connectionHistory].slice(0, 10),
    });

    // 一段时间后清除提示文本，避免长期占用 UI
    setTimeout(() => {
      useDeviceStore.setState({ demoStatusText: null });
    }, 1500);
  },

  connect: async (port?: string) => {
    set({ isConnecting: true, lastError: null });
    // 先设置为 connecting 状态
    set({ connectionState: "connecting" });
    try {
      // deviceConnect 返回 IpcVoid（null），不直接返回 DeviceInfo
      const portName = port ?? "auto";
      const result = await deviceConnect(portName);
      if (result.success) {
        // 连接成功后需要主动获取设备信息
        set({ usbPort: portName });
        await get().refreshDeviceInfo();
        set({ connectionState: "connected" });
        // 添加到历史记录
        const info = get().deviceInfo;
        if (info) {
          const record: ConnectionRecord = {
            port: portName,
            deviceName: info.name,
            firmwareVersion: info.firmwareVersion,
            timestamp: Date.now(),
          };
          set((state) => ({
            connectionHistory: [record, ...state.connectionHistory].slice(0, 10),
          }));
        }
      } else {
        set({
          connectionState: "no_device",
          lastError: result.error ?? "连接失败",
        });
      }
    } catch (err) {
      set({
        connectionState: "no_device",
        lastError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      set({ isConnecting: false });
    }
  },

  disconnect: async () => {
    set({ lastError: null });
    try {
      const result = await deviceDisconnect();
      if (result.success) {
        set({
          connectionState: "no_device",
          deviceInfo: null,
          usbPort: null,
        });
      } else {
        set({ lastError: result.error ?? "断开失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  refreshDeviceInfo: async () => {
    set({ lastError: null });
    try {
      const result = await getDeviceInfo();
      if (result.success && result.data) {
        set({ deviceInfo: result.data });
      } else {
        set({ lastError: result.error ?? "获取设备信息失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  clearError: () => set({ lastError: null }),

  initListeners: async () => {
    const unlisten = await onDeviceStateChange((state) => {
      set({ connectionState: state });

      // 根据新状态自动处理
      if (state === "connected") {
        // 设备刚连上，自动获取设备信息
        get().refreshDeviceInfo();
      } else if (state === "no_device") {
        // 设备断开，清空设备信息
        set({ deviceInfo: null, usbPort: null });
      }
    });
    return unlisten;
  },
}));

// ================================================================
// 模块级别自动注册事件监听
// 应用启动时自动生效，确保不遗漏任何设备状态变化事件
// ================================================================

let _deviceUnlisten: (() => void) | null = null;

onDeviceStateChange((state) => {
  useDeviceStore.setState({ connectionState: state });
  if (state === "connected") {
    useDeviceStore.getState().refreshDeviceInfo();
  } else if (state === "no_device") {
    useDeviceStore.setState({ deviceInfo: null, usbPort: null });
  }
}).then((fn) => {
  _deviceUnlisten = fn;
});

/** 清理设备事件监听（用于 HMR 热更新或测试） */
export function cleanupDeviceListeners(): void {
  _deviceUnlisten?.();
  _deviceUnlisten = null;
}
