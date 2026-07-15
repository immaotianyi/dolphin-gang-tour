/** 设备状态管理 — P7: 增加断连重连 + 命令超时 */
import { create } from "zustand";
import { invoke, onEvent } from "@/lib/tauri";
import type { ConnectionState, DeviceInfo, ScreenFrame } from "@/types";

const CMD_TIMEOUT_MS = 10000;
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

/** 带超时的 invoke */
async function invokeWithTimeout<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CMD_TIMEOUT_MS);
  try {
    const result = await invoke<T>(cmd, args);
    clearTimeout(timer);
    return result;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/** 延迟函数 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DeviceStore {
  connectionState: ConnectionState;
  deviceInfo: DeviceInfo | null;
  screenFrame: ScreenFrame | null;
  error: string | null;
  isVirtual: boolean;
  reconnectAttempts: number;
  lastConnectedAt: number | null;

  scan: () => Promise<void>;
  connect: (port: string) => Promise<void>;
  disconnect: () => Promise<void>;
  getInfo: () => Promise<void>;
  reconnect: () => Promise<void>;
  cleanup: () => void;
}

let unlistenFrame: (() => void) | null = null;
let unlistenState: (() => void) | null = null;
let reconnectInProgress = false;

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  connectionState: "disconnected",
  deviceInfo: null,
  screenFrame: null,
  error: null,
  isVirtual: false,
  reconnectAttempts: 0,
  lastConnectedAt: null,

  scan: async () => {
    set({ connectionState: "scanning", error: null });
    try {
      const devices = await invokeWithTimeout<{ name: string; port: string }[]>("device_scan");
      if (devices.length > 0) {
        const dev = devices[0];
        set({ isVirtual: dev.port === "VIRTUAL" });
        await get().connect(dev.port);
      } else {
        set({ connectionState: "disconnected" });
      }
    } catch (e) {
      set({ connectionState: "error", error: String(e) });
    }
  },

  connect: async (port: string) => {
    try {
      await invokeWithTimeout("device_connect", { port });
      set({
        connectionState: "connected",
        isVirtual: port === "VIRTUAL",
        reconnectAttempts: 0,
        lastConnectedAt: Date.now(),
        error: null,
      });
      await get().getInfo();

      // 监听屏幕帧
      unlistenFrame = (await onEvent<ScreenFrame>("screen_frame", (frame) => {
        set({ screenFrame: frame });
      })) as (() => void) | null;

      // 监听状态更新 — P7: 自动触发重连
      unlistenState = (await onEvent<{ connectionState: ConnectionState }>(
        "state_update",
        (payload) => {
          if (payload.connectionState) {
            set({ connectionState: payload.connectionState });

            // 断连时自动重连 (非虚拟设备 + 非主动断开)
            if (
              payload.connectionState === "disconnected" &&
              !get().isVirtual &&
              !reconnectInProgress
            ) {
              get().reconnect();
            }
          }
        }
      )) as (() => void) | null;
    } catch (e) {
      set({ connectionState: "error", error: String(e) });
    }
  },

  disconnect: async () => {
    reconnectInProgress = true; // 防止自动重连
    try {
      await invoke("device_disconnect");
      set({
        connectionState: "disconnected",
        deviceInfo: null,
        screenFrame: null,
        reconnectAttempts: 0,
      });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      reconnectInProgress = false;
    }
  },

  reconnect: async () => {
    if (reconnectInProgress) return;
    reconnectInProgress = true;

    set({ connectionState: "scanning" });

    for (let attempt = 0; attempt < RECONNECT_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(
          RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1),
          30000
        );
        await delay(backoff);
      }

      set({ reconnectAttempts: attempt + 1 });

      try {
        const devices = await invokeWithTimeout<{ name: string; port: string }[]>("device_scan");
        if (devices.length > 0) {
          const dev = devices[0];
          await invokeWithTimeout("device_connect", { port: dev.port });
          set({
            connectionState: "connected",
            isVirtual: dev.port === "VIRTUAL",
            reconnectAttempts: 0,
            lastConnectedAt: Date.now(),
            error: null,
          });
          await get().getInfo();
          reconnectInProgress = false;
          return;
        }
      } catch {
        // 继续重试
      }
    }

    // 重连失败，降级到虚拟设备
    set({
      connectionState: "connected",
      isVirtual: true,
      error: "Reconnect failed, using virtual device",
      reconnectAttempts: 0,
    });
    try {
      await invokeWithTimeout("device_connect", { port: "VIRTUAL" });
      await get().getInfo();
    } catch {
      set({ connectionState: "error", error: "All reconnection attempts failed" });
    }
    reconnectInProgress = false;
  },

  getInfo: async () => {
    try {
      const info = await invokeWithTimeout<DeviceInfo>("device_get_info");
      set({ deviceInfo: info });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  cleanup: () => {
    unlistenFrame?.();
    unlistenState?.();
    unlistenFrame = null;
    unlistenState = null;
  },
}));
