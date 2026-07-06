/**
 * 成就系统状态管理 Store
 *
 * 管理成就列表的加载、解锁、进度更新。
 * 成就定义在后端硬编码，解锁状态持久化到 achievements.json。
 *
 * 模块级自动加载：Tauri 环境下应用启动时自动拉取成就列表。
 */
import { create } from "zustand";
import type { Achievement } from "@/types";
import {
  isTauri,
  getAchievements,
  unlockAchievement,
  updateAchievementProgress,
} from "@/lib/tauri";

// ================================================================
// 类型定义
// ================================================================

/** 成就 Store 状态 */
interface AchievementStore {
  // ---- State ----
  /** 全部成就列表（含解锁状态和进度） */
  achievements: Achievement[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 最近一次错误信息 */
  lastError: string | null;

  // ---- Actions ----
  /** 加载全部成就列表 */
  loadAchievements: () => Promise<void>;
  /** 解锁指定成就，返回 true 表示新解锁，false 表示已解锁 */
  unlock: (id: string) => Promise<boolean>;
  /** 更新成就进度，达到 target 时自动解锁，返回是否刚刚解锁 */
  updateProgress: (id: string, progress: number) => Promise<boolean>;

  // ---- 统计 ----
  /** 已解锁成就数量 */
  unlockedCount: () => number;
  /** 成就总数 */
  totalCount: () => number;
}

// ================================================================
// Store 创建
// ================================================================

export const useAchievementStore = create<AchievementStore>((set, get) => ({
  // ---- State 初始值 ----
  achievements: [],
  isLoading: false,
  lastError: null,

  // ---- Actions ----

  loadAchievements: async () => {
    set({ isLoading: true, lastError: null });
    try {
      const result = await getAchievements();
      if (result.success && result.data) {
        set({ achievements: result.data, isLoading: false });
      } else {
        set({
          isLoading: false,
          lastError: result.error ?? "加载成就列表失败",
        });
      }
    } catch (err) {
      set({
        isLoading: false,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  unlock: async (id) => {
    set({ lastError: null });
    try {
      const result = await unlockAchievement(id);
      if (result.success && result.data !== undefined) {
        // 重新拉取列表以同步解锁状态
        await get().loadAchievements();
        return result.data;
      }
      set({ lastError: result.error ?? "解锁成就失败" });
      return false;
    } catch (err) {
      set({
        lastError: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  updateProgress: async (id, progress) => {
    set({ lastError: null });
    try {
      const result = await updateAchievementProgress(id, progress);
      if (result.success && result.data !== undefined) {
        // 重新拉取列表以同步进度与解锁状态
        await get().loadAchievements();
        return result.data;
      }
      set({ lastError: result.error ?? "更新成就进度失败" });
      return false;
    } catch (err) {
      set({
        lastError: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  },

  // ---- 统计 ----

  unlockedCount: () => get().achievements.filter((a) => a.unlocked).length,

  totalCount: () => get().achievements.length,
}));

// ================================================================
// 模块级别自动加载
// Tauri 环境下应用启动时自动拉取成就列表
// ================================================================

if (isTauri()) {
  useAchievementStore.getState().loadAchievements();
}
