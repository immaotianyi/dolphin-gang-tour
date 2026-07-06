/**
 * 固件刷写状态管理 Store
 *
 * 固件列表从后端 IPC list_firmwares 获取（单一数据源），
 * 浏览器演示模式回退到 MOCK_FIRMWARES。
 *
 * 刷写前需用户通过文件选择器选取本地固件包。
 */
import { create } from "zustand";
import type { FirmwareId, FlashProgress, FirmwareInfo } from "@/types";
import {
  flashFirmware,
  cancelFlash,
  onFlashProgress,
  listFirmwares,
  isTauri,
} from "@/lib/tauri";
import { MOCK_FIRMWARES } from "@/data/resources";
import { useDeviceStore } from "@/stores/deviceStore";

// ================================================================
// 类型定义
// ================================================================

interface FirmwareStore {
  // ---- State ----
  selectedFirmware: FirmwareId;
  flashProgress: FlashProgress | null;
  isFlashing: boolean;
  lastError: string | null;
  firmwares: FirmwareInfo[];
  currentVersion: string;
  selectedId: FirmwareId;
  isDfuMode: boolean;
  /** 用户选择的本地固件文件路径 */
  firmwareFilePath: string | null;

  // ---- Actions ----
  selectFirmware: (id: FirmwareId) => void;
  startFlash: () => Promise<void>;
  cancelFlashAction: () => Promise<void>;
  reset: () => void;
  initListeners: () => Promise<() => void>;
  loadFirmwares: () => Promise<void>;
  setFirmwareFilePath: (path: string | null) => void;

  // 兼容别名
  select: (id: FirmwareId) => void;
  rescue: () => Promise<void>;
  cancel: () => Promise<void>;
  enterDfu: () => Promise<void>;
}

function getCurrentVersion(): string {
  const deviceInfo = useDeviceStore.getState().deviceInfo;
  return deviceInfo?.firmwareVersion ?? (isTauri() ? "未知" : "0.1.3");
}

function getIsDfuMode(): boolean {
  return useDeviceStore.getState().connectionState === "dfu_mode";
}

const initialFirmwares = isTauri() ? [] : MOCK_FIRMWARES;

export const useFirmwareStore = create<FirmwareStore>((set, get) => ({
  selectedFirmware: "momentum",
  flashProgress: null,
  isFlashing: false,
  lastError: null,
  firmwares: initialFirmwares,
  currentVersion: getCurrentVersion(),
  selectedId: "momentum",
  isDfuMode: getIsDfuMode(),
  firmwareFilePath: null,

  selectFirmware: (id) => set({ selectedFirmware: id, selectedId: id }),

  loadFirmwares: async () => {
    try {
      const result = await listFirmwares();
      if (result.success && result.data && result.data.length > 0) {
        set({ firmwares: result.data });
      } else {
        set({ firmwares: MOCK_FIRMWARES });
      }
    } catch {
      set({ firmwares: MOCK_FIRMWARES });
    }
  },

  setFirmwareFilePath: (path) => set({ firmwareFilePath: path }),

  startFlash: async () => {
    const { selectedFirmware, isFlashing, firmwareFilePath } = get();
    if (isFlashing) return;

    // 必须选择固件文件
    if (!firmwareFilePath) {
      set({
        lastError: "请先点击「选择固件文件」按钮选取本地固件包",
      });
      return;
    }

    set({
      isFlashing: true,
      lastError: null,
      flashProgress: { phase: "downloading", progress: 0, message: "" },
    });

    try {
      const result = await flashFirmware(selectedFirmware, firmwareFilePath);
      if (!result.success) {
        set({
          isFlashing: false,
          lastError: result.error ?? "刷写启动失败",
          flashProgress: {
            phase: "error",
            progress: 0,
            message: "",
            errorMessage: result.error ?? "刷写启动失败",
          },
        });
      }
    } catch (err) {
      set({
        isFlashing: false,
        lastError: err instanceof Error ? err.message : String(err),
        flashProgress: {
          phase: "error",
          progress: 0,
          message: "",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  cancelFlashAction: async () => {
    set({ lastError: null });
    try {
      const result = await cancelFlash();
      if (result.success) {
        set({ isFlashing: false, flashProgress: null });
      } else {
        set({ lastError: result.error ?? "取消失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  reset: () =>
    set({
      selectedFirmware: "momentum",
      selectedId: "momentum",
      flashProgress: null,
      isFlashing: false,
      lastError: null,
      firmwareFilePath: null,
    }),

  initListeners: async () => {
    const unlisten = await onFlashProgress((progress) => {
      set({ flashProgress: progress });

      if (progress.phase === "done") {
        set({ isFlashing: false });
        useDeviceStore.getState().refreshDeviceInfo();
      } else if (progress.phase === "error") {
        set({
          isFlashing: false,
          lastError: progress.errorMessage ?? "刷写出错",
        });
      }
    });
    return unlisten;
  },

  // 兼容别名
  select: (id: FirmwareId) => get().selectFirmware(id),

  rescue: async () => {
    await get().startFlash();
  },

  cancel: () => get().cancelFlashAction(),

  enterDfu: async () => {
    set({ isDfuMode: true });
    useDeviceStore.setState({ connectionState: "dfu_mode" });
  },
}));

// ================================================================
// 模块级别自动注册
// ================================================================

let _flashUnlisten: (() => void) | null = null;

onFlashProgress((progress) => {
  useFirmwareStore.setState({ flashProgress: progress });

  if (progress.phase === "done") {
    useFirmwareStore.setState({ isFlashing: false });
    useDeviceStore.getState().refreshDeviceInfo();
  } else if (progress.phase === "error") {
    useFirmwareStore.setState({
      isFlashing: false,
      lastError: progress.errorMessage ?? "刷写出错",
    });
  }
}).then((fn) => {
  _flashUnlisten = fn;
});

useDeviceStore.subscribe((state) => {
  const isDfuMode = state.connectionState === "dfu_mode";
  const currentVersion = state.deviceInfo?.firmwareVersion ?? "未知";
  useFirmwareStore.setState({ isDfuMode, currentVersion });
});

// Tauri 模式下自动加载固件列表
if (isTauri()) {
  useFirmwareStore.getState().loadFirmwares();
}

export function cleanupFirmwareListeners(): void {
  _flashUnlisten?.();
  _flashUnlisten = null;
}
