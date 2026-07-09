/**
 * GPIO 状态管理 Store
 *
 * 管理 Flipper Zero 的 8 个 GPIO 引脚状态与 OTG 模式。
 * 通过 RPC 协议实时读写引脚模式（OUTPUT/INPUT）与电平值（0/1）。
 *
 * 虚拟设备模式下返回模拟数据，真实设备模式下通过 RPC 协议通信。
 */
import { create } from "zustand";
import type { GpioPinState } from "@/types";
import {
  gpioGetAllPins,
  gpioSetPinMode,
  gpioWritePin,
  gpioGetOtgMode,
  gpioSetOtgMode,
} from "@/lib/tauri";

interface GpioStore {
  /** 引脚状态列表 */
  pins: GpioPinState[];
  /** OTG 模式："on" | "off" */
  otgMode: string;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 最近一次错误信息 */
  lastError: string | null;
  /** 加载所有引脚状态 */
  loadPins: () => Promise<void>;
  /** 设置引脚模式（output / input） */
  setMode: (pin: string, mode: "output" | "input") => Promise<void>;
  /** 写引脚值（仅 OUTPUT 模式） */
  writePin: (pin: string, value: number) => Promise<void>;
  /** 切换输出引脚电平（0 <-> 1） */
  togglePin: (pin: string) => Promise<void>;
  /** 加载 OTG 模式 */
  loadOtgMode: () => Promise<void>;
  /** 设置 OTG 模式（on / off） */
  setOtgMode: (mode: string) => Promise<void>;
}

export const useGpioStore = create<GpioStore>((set, get) => ({
  pins: [],
  otgMode: "off",
  isLoading: false,
  lastError: null,

  loadPins: async () => {
    set({ isLoading: true, lastError: null });
    const result = await gpioGetAllPins();
    if (result.success && result.data) {
      set({ pins: result.data, isLoading: false });
    } else {
      set({ lastError: result.error ?? "加载引脚状态失败", isLoading: false });
    }
  },

  setMode: async (pin, mode) => {
    set({ lastError: null });
    const result = await gpioSetPinMode(pin, mode);
    if (result.success) {
      // 本地立即更新状态，避免重新拉取
      set((state) => ({
        pins: state.pins.map((p) =>
          p.pin === pin
            ? { ...p, mode, value: mode === "input" ? 0 : p.value }
            : p
        ),
      }));
    } else {
      set({ lastError: result.error ?? "设置引脚模式失败" });
    }
  },

  writePin: async (pin, value) => {
    set({ lastError: null });
    const result = await gpioWritePin(pin, value);
    if (result.success) {
      set((state) => ({
        pins: state.pins.map((p) =>
          p.pin === pin ? { ...p, value: value ? 1 : 0 } : p
        ),
      }));
    } else {
      set({ lastError: result.error ?? "写引脚失败" });
    }
  },

  togglePin: async (pin) => {
    const pinState = get().pins.find((p) => p.pin === pin);
    if (!pinState) return;
    const newValue = pinState.value ? 0 : 1;
    await get().writePin(pin, newValue);
  },

  loadOtgMode: async () => {
    set({ lastError: null });
    const result = await gpioGetOtgMode();
    if (result.success && result.data !== undefined) {
      set({ otgMode: result.data });
    } else {
      set({ lastError: result.error ?? "获取 OTG 模式失败" });
    }
  },

  setOtgMode: async (mode) => {
    set({ lastError: null });
    const result = await gpioSetOtgMode(mode);
    if (result.success) {
      set({ otgMode: mode === "on" ? "on" : "off" });
    } else {
      set({ lastError: result.error ?? "设置 OTG 模式失败" });
    }
  },
}));
