/**
 * 桌宠状态管理 Store
 *
 * 管理 Flipper 桌宠的饱食度、快乐值、精力值、等级经验与心情。
 * 纯前端实现，状态通过 localStorage 持久化（key: "flipper-pet-state"）。
 * 模块级定时器每 5 秒调用 tick()，自动衰减/恢复属性并更新心情。
 *
 * 供 App.tsx 中的 PetModalContent 直接使用。
 */
import { create } from "zustand";
import type { PetState, PetMood } from "@/types";

// ================================================================
// 常量
// ================================================================

/** localStorage 存储键 */
const PET_STORAGE_KEY = "flipper-pet-state";

/** tick 调用间隔（毫秒） */
const TICK_INTERVAL_MS = 5000;

// ================================================================
// 初始状态
// ================================================================

/** 桌宠初始状态（首次创建 / 无存档时使用） */
const INITIAL_PET: PetState = {
  name: "Flipper",
  mood: "happy",
  action: "idle",
  level: 1,
  exp: 0,
  expToNext: 100,
  hunger: 20,
  happiness: 80,
  energy: 90,
  lastFed: null,
  lastPlayed: null,
  birthDate: Date.now(),
};

// ================================================================
// 工具函数
// ================================================================

/** 将数值限制在 [0, 100] 区间 */
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** 从 localStorage 读取桌宠状态，失败时回退到初始状态 */
function loadPetFromStorage(): PetState {
  try {
    const raw = localStorage.getItem(PET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PetState>;
      // 合并初始状态，确保新增字段有默认值
      return { ...INITIAL_PET, ...parsed };
    }
  } catch {
    // 解析失败时忽略，使用初始状态
  }
  return INITIAL_PET;
}

/**
 * 根据饱食/快乐/精力计算心情
 * 优先级：饥饿过高或低快乐 → 难过；低精力 → 困倦；
 *        高快乐且低饥饿 → 兴奋；较高快乐 → 开心；其余 → 普通
 */
function computeMood(hunger: number, happiness: number, energy: number): PetMood {
  if (hunger > 80 || happiness < 20) return "sad";
  if (energy < 20) return "sleeping";
  if (happiness > 80 && hunger < 30) return "excited";
  if (happiness > 50) return "happy";
  return "normal";
}

/**
 * 增加经验值并在满足条件时自动升级
 * 升级规则：level+1，exp 扣除 expToNext，expToNext *= 1.2（向下取整）
 */
function applyExp(pet: PetState, amount: number): PetState {
  let exp = pet.exp + amount;
  let level = pet.level;
  let expToNext = pet.expToNext;
  while (exp >= expToNext) {
    exp -= expToNext;
    level += 1;
    expToNext = Math.floor(expToNext * 1.2);
  }
  return { ...pet, exp, level, expToNext };
}

// ================================================================
// 类型定义
// ================================================================

/** 桌宠 Store 状态 */
interface PetStore {
  /** 桌宠状态 */
  pet: PetState;
  /** 桌宠是否可见（预留，便于后续做悬浮窗） */
  isVisible: boolean;

  // ---- Actions ----
  /** 喂食：hunger-30, happiness+10, exp+5 */
  feed: () => void;
  /** 玩耍：happiness+20, energy-15, exp+10 */
  play: () => void;
  /** 睡觉/起床切换：进入睡眠时 energy+40, happiness-5 */
  sleep: () => void;
  /** 抚摸：happiness+5, exp+2（命名为 pat 以避免与状态字段 pet 冲突） */
  pat: () => void;
  /** 切换可见性 */
  toggleVisible: () => void;
  /** 改名 */
  rename: (name: string) => void;
  /** 状态衰减/恢复（每 5 秒由定时器调用一次） */
  tick: () => void;
}

// ================================================================
// Store 创建
// ================================================================

export const usePetStore = create<PetStore>((set) => ({
  pet: loadPetFromStorage(),
  isVisible: true,

  // ---- Actions ----

  feed: () =>
    set((state) => {
      const next = applyExp(
        {
          ...state.pet,
          hunger: clamp100(state.pet.hunger - 30),
          happiness: clamp100(state.pet.happiness + 10),
          lastFed: Date.now(),
        },
        5
      );
      return { pet: { ...next, mood: computeMood(next.hunger, next.happiness, next.energy) } };
    }),

  play: () =>
    set((state) => {
      const next = applyExp(
        {
          ...state.pet,
          happiness: clamp100(state.pet.happiness + 20),
          energy: clamp100(state.pet.energy - 15),
          lastPlayed: Date.now(),
        },
        10
      );
      return { pet: { ...next, mood: computeMood(next.hunger, next.happiness, next.energy) } };
    }),

  sleep: () =>
    set((state) => {
      // 已在睡眠 → 起床
      if (state.pet.action === "sleeping") {
        return { pet: { ...state.pet, action: "idle" } };
      }
      // 进入睡眠：energy+40, happiness-5
      const next: PetState = {
        ...state.pet,
        action: "sleeping",
        energy: clamp100(state.pet.energy + 40),
        happiness: clamp100(state.pet.happiness - 5),
      };
      return { pet: { ...next, mood: computeMood(next.hunger, next.happiness, next.energy) } };
    }),

  pat: () =>
    set((state) => {
      const next = applyExp(
        {
          ...state.pet,
          happiness: clamp100(state.pet.happiness + 5),
        },
        2
      );
      return { pet: { ...next, mood: computeMood(next.hunger, next.happiness, next.energy) } };
    }),

  toggleVisible: () => set((state) => ({ isVisible: !state.isVisible })),

  rename: (name) =>
    set((state) => ({ pet: { ...state.pet, name: name.trim() || "Flipper" } })),

  tick: () =>
    set((state) => {
      const { pet } = state;
      // 饥饿值每次 +1（最高 100）
      const hunger = clamp100(pet.hunger + 1);
      // 精力：睡眠中 +5，否则 -0.5
      const energy =
        pet.action === "sleeping"
          ? clamp100(pet.energy + 5)
          : clamp100(pet.energy - 0.5);
      // 快乐：饥饿过高则 -2，否则缓慢回归 50
      let happiness: number;
      if (hunger > 80) {
        happiness = clamp100(pet.happiness - 2);
      } else if (pet.happiness > 50) {
        happiness = clamp100(pet.happiness - 0.5);
      } else if (pet.happiness < 50) {
        happiness = clamp100(pet.happiness + 0.5);
      } else {
        happiness = pet.happiness;
      }
      // 更新心情
      const mood = computeMood(hunger, happiness, energy);
      let next: PetState = { ...pet, hunger, energy, happiness, mood };
      // 经验满自动升级（防御性兜底：动作已即时升级）
      if (next.exp >= next.expToNext) {
        next = applyExp(next, 0);
      }
      return { pet: next };
    }),
}));

// ================================================================
// 数据持久化：每次状态变化时保存 pet 到 localStorage
// ================================================================

usePetStore.subscribe((state) => {
  try {
    localStorage.setItem(PET_STORAGE_KEY, JSON.stringify(state.pet));
  } catch {
    // 写入失败时忽略（如隐私模式 / 配额已满）
  }
});

// ================================================================
// 模块级启动 tick 定时器（每 5 秒一次）
// ================================================================

setInterval(() => {
  usePetStore.getState().tick();
}, TICK_INTERVAL_MS);
