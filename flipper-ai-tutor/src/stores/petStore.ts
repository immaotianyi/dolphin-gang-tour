/**
 * 桌宠状态管理 Store（增强版）
 *
 * 新增功能：
 * - 进化系统：5 阶段（蛋→幼豚→少年豚→青年豚→成年豚），由等级自动决定
 * - 设备联动：导入成功/课程完成/成就解锁/固件刷写/GPIO使用 → 桌宠获得经验/心情变化
 * - 活动日志：最近 20 条互动记录
 * - 冷却机制：喂食/玩耍 15s 冷却，防止刷属性
 * - 对话气泡：根据心情和事件随机显示对话
 * - 生病机制：饥饿值满 100 持续 60s 后生病
 * - 升级通知：通过 toast 系统通知升级和进化
 */
import { create } from "zustand";
import type { PetState, PetMood, PetEvolutionStage, PetActivity, PetEvent } from "@/types";
import { toast } from "@/stores/toastStore";

// ================================================================
// 常量
// ================================================================

const PET_STORAGE_KEY = "flipper-pet-state";
const PET_ACTIVITIES_KEY = "flipper-pet-activities";
const TICK_INTERVAL_MS = 5000;
const ACTION_COOLDOWN_MS = 15000; // 喂食/玩耍冷却 15s
const MAX_ACTIVITIES = 20;

// ================================================================
// 进化阶段映射
// ================================================================

/** 根据等级计算进化阶段 */
function getEvolutionStage(level: number): PetEvolutionStage {
  if (level < 5) return "egg";
  if (level < 10) return "baby";
  if (level < 20) return "child";
  if (level < 30) return "teen";
  return "adult";
}

/** 进化阶段名称（中文） */
const STAGE_NAMES: Record<PetEvolutionStage, string> = {
  egg: "蛋",
  baby: "幼豚",
  child: "少年豚",
  teen: "青年豚",
  adult: "成年豚",
};

// ================================================================
// 对话库
// ================================================================

/** 按心情分类的对话 */
const DIALOGUES: Record<string, string[]> = {
  happy: ["今天心情真好～", "想一起玩吗？", "嘿嘿～", "心情棒棒的！"],
  normal: ["发呆中...", "在想什么呢？", "嗯...", "今天天气不错"],
  sad: ["好饿啊...", "陪陪我...", "呜呜...", "不想动..."],
  excited: ["超开心！", "太棒了！！", "哇哇哇～", "继续加油！"],
  sleeping: ["Zzz...", "做个好梦...", "呼呼...", "zzZ..."],
  sick: ["咳咳...", "不舒服...", "需要照顾...", "头好晕..."],
};

/** 设备联动事件对话 */
const EVENT_DIALOGUES: Record<PetEvent, string[]> = {
  device_connected: ["设备连上了！", "欢迎回来～", "检测到 Flipper！"],
  import_success: ["资源导入成功！", "好厉害～", "设备更强了！"],
  course_completed: ["课程完成了！", "学业有成长！", "越来越厉害了～"],
  achievement_unlocked: ["解锁新成就！", "太棒了！！", "为你骄傲！"],
  firmware_flashed: ["固件刷好了！", "焕然一新～", "新固件真酷！"],
  gpio_used: ["引脚控制！", "电路大师～", "嘀嘀嘀..."],
  mirror_started: ["屏幕镜像开启！", "我在看屏幕～", "同步中..."],
};

/** 随机取一条对话 */
function pickDialogue(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

// ================================================================
// 初始状态
// ================================================================

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
  sick: false,
  totalInteractions: 0,
  evolutionStage: "egg",
};

// ================================================================
// 工具函数
// ================================================================

function clamp100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function loadPetFromStorage(): PetState {
  try {
    const raw = localStorage.getItem(PET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PetState>;
      const merged = { ...INITIAL_PET, ...parsed };
      // 确保 evolutionStage 与 level 一致
      merged.evolutionStage = getEvolutionStage(merged.level);
      // 确保新字段有默认值
      if (merged.sick === undefined) merged.sick = false;
      if (merged.totalInteractions === undefined) merged.totalInteractions = 0;
      return merged;
    }
  } catch {
    // 解析失败时忽略
  }
  return INITIAL_PET;
}

function loadActivitiesFromStorage(): PetActivity[] {
  try {
    const raw = localStorage.getItem(PET_ACTIVITIES_KEY);
    if (raw) return JSON.parse(raw) as PetActivity[];
  } catch {
    // ignore
  }
  return [];
}

function computeMood(hunger: number, happiness: number, energy: number, sick: boolean): PetMood {
  if (sick) return "sick";
  if (hunger > 80 || happiness < 20) return "sad";
  if (energy < 20) return "sleeping";
  if (happiness > 80 && hunger < 30) return "excited";
  if (happiness > 50) return "happy";
  return "normal";
}

/** 增加经验值并自动升级，返回新状态 + 是否升级 + 是否进化 */
function applyExp(pet: PetState, amount: number): { pet: PetState; leveledUp: boolean; evolved: boolean } {
  let exp = pet.exp + amount;
  let level = pet.level;
  let expToNext = pet.expToNext;
  let leveledUp = false;

  while (exp >= expToNext) {
    exp -= expToNext;
    level += 1;
    expToNext = Math.floor(expToNext * 1.2);
    leveledUp = true;
  }

  const oldStage = pet.evolutionStage;
  const newStage = getEvolutionStage(level);
  const evolved = leveledUp && oldStage !== newStage;

  return {
    pet: { ...pet, exp, level, expToNext, evolutionStage: newStage },
    leveledUp,
    evolved,
  };
}

/** 添加活动记录 */
function addActivity(activities: PetActivity[], action: string, icon: string): PetActivity[] {
  const activity: PetActivity = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    timestamp: Date.now(),
    icon,
  };
  return [activity, ...activities].slice(0, MAX_ACTIVITIES);
}

// ================================================================
// Store 类型
// ================================================================

interface PetStore {
  pet: PetState;
  isVisible: boolean;
  activities: PetActivity[];
  /** 当前对话气泡内容（null 表示无气泡） */
  dialogue: string | null;

  // ---- Actions ----
  feed: () => void;
  play: () => void;
  sleep: () => void;
  pat: () => void;
  toggleVisible: () => void;
  rename: (name: string) => void;
  tick: () => void;
  /** 设备联动事件通知 */
  notifyEvent: (event: PetEvent) => void;
  /** 清除对话气泡 */
  clearDialogue: () => void;
  /** 治病（消耗大量饱食度和快乐值） */
  heal: () => void;
  /** 检查动作冷却（返回剩余秒数，0=可执行） */
  getCooldown: (action: "feed" | "play") => number;
}

// ================================================================
// Store 创建
// ================================================================

let dialogueTimer: ReturnType<typeof setTimeout> | null = null;

function setDialogue(dialogue: string, duration = 4000): void {
  if (dialogueTimer) clearTimeout(dialogueTimer);
  usePetStore.setState({ dialogue });
  dialogueTimer = setTimeout(() => {
    usePetStore.setState({ dialogue: null });
  }, duration);
}

export const usePetStore = create<PetStore>((set, get) => ({
  pet: loadPetFromStorage(),
  isVisible: true,
  activities: loadActivitiesFromStorage(),
  dialogue: null,

  feed: () => {
    const { pet } = get();
    const cooldown = get().getCooldown("feed");
    if (cooldown > 0) {
      setDialogue(`等 ${cooldown}s 再喂吧～`);
      return;
    }
    if (pet.hunger < 5) {
      setDialogue("吃不下了...");
      return;
    }
    const { pet: next, leveledUp, evolved } = applyExp(
      { ...pet, hunger: clamp100(pet.hunger - 30), happiness: clamp100(pet.happiness + 10), lastFed: Date.now(), totalInteractions: pet.totalInteractions + 1 },
      5,
    );
    const mood = computeMood(next.hunger, next.happiness, next.energy, next.sick);
    set((state) => ({
      pet: { ...next, mood },
      activities: addActivity(state.activities, `喂了 ${pet.name}`, "sandwich"),
    }));
    setDialogue(pickDialogue(DIALOGUES[next.mood] || DIALOGUES.normal));
    if (evolved) {
      toast.pet(`${pet.name} 进化了！`, `成长为「${STAGE_NAMES[next.evolutionStage]}」`);
    } else if (leveledUp) {
      toast.pet(`${pet.name} 升级了！`, `Lv.${next.level}`);
    }
  },

  play: () => {
    const { pet } = get();
    const cooldown = get().getCooldown("play");
    if (cooldown > 0) {
      setDialogue(`等 ${cooldown}s 再玩吧～`);
      return;
    }
    if (pet.energy < 15) {
      setDialogue("太累了...想睡觉");
      return;
    }
    const { pet: next, leveledUp, evolved } = applyExp(
      { ...pet, happiness: clamp100(pet.happiness + 20), energy: clamp100(pet.energy - 15), lastPlayed: Date.now(), totalInteractions: pet.totalInteractions + 1 },
      10,
    );
    const mood = computeMood(next.hunger, next.happiness, next.energy, next.sick);
    set((state) => ({
      pet: { ...next, mood },
      activities: addActivity(state.activities, `和 ${pet.name} 玩耍`, "play"),
    }));
    setDialogue(pickDialogue(DIALOGUES.excited));
    if (evolved) {
      toast.pet(`${pet.name} 进化了！`, `成长为「${STAGE_NAMES[next.evolutionStage]}」`);
    } else if (leveledUp) {
      toast.pet(`${pet.name} 升级了！`, `Lv.${next.level}`);
    }
  },

  sleep: () => {
    const { pet } = get();
    if (pet.action === "sleeping") {
      set({ pet: { ...pet, action: "idle" } });
      setDialogue("早安～");
      return;
    }
    const next: PetState = {
      ...pet,
      action: "sleeping",
      energy: clamp100(pet.energy + 40),
      happiness: clamp100(pet.happiness - 5),
      totalInteractions: pet.totalInteractions + 1,
    };
    set((state) => ({
      pet: { ...next, mood: computeMood(next.hunger, next.happiness, next.energy, next.sick) },
      activities: addActivity(state.activities, `${pet.name} 睡觉了`, "power"),
    }));
    setDialogue(pickDialogue(DIALOGUES.sleeping));
  },

  pat: () => {
    const { pet } = get();
    const { pet: next, leveledUp } = applyExp(
      { ...pet, happiness: clamp100(pet.happiness + 5), totalInteractions: pet.totalInteractions + 1 },
      2,
    );
    set({ pet: { ...next, mood: computeMood(next.hunger, next.happiness, next.energy, next.sick) } });
    setDialogue(pet.happiness > 70 ? "好舒服～" : "再摸摸...");
    if (leveledUp) {
      toast.pet(`${pet.name} 升级了！`, `Lv.${next.level}`);
    }
  },

  toggleVisible: () => set((state) => ({ isVisible: !state.isVisible })),

  rename: (name) => {
    const trimmed = name.trim() || "Flipper";
    set((state) => ({ pet: { ...state.pet, name: trimmed } }));
    setDialogue(`我叫 ${trimmed}！`);
  },

  tick: () =>
    set((state) => {
      const { pet } = state;
      const hunger = clamp100(pet.hunger + 1);
      const energy =
        pet.action === "sleeping"
          ? clamp100(pet.energy + 5)
          : clamp100(pet.energy - 0.5);
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
      // 饥饿满 100 持续太久 → 生病
      const sick = pet.sick || (hunger >= 100 && pet.hunger >= 100);
      const mood = computeMood(hunger, happiness, energy, sick);
      let next: PetState = { ...pet, hunger, energy, happiness, mood, sick };
      if (next.exp >= next.expToNext) {
        const result = applyExp(next, 0);
        next = result.pet;
      }
      return { pet: next };
    }),

  notifyEvent: (event) => {
    const { pet } = get();
    // 设备联动奖励表
    const rewards: Record<PetEvent, { exp: number; hunger?: number; happiness?: number; energy?: number }> = {
      device_connected: { exp: 8, happiness: 10 },
      import_success: { exp: 15, hunger: -15, happiness: 5 },
      course_completed: { exp: 20, happiness: 10 },
      achievement_unlocked: { exp: 12, happiness: 15 },
      firmware_flashed: { exp: 15, happiness: 5 },
      gpio_used: { exp: 5, happiness: 3 },
      mirror_started: { exp: 3, happiness: 2 },
    };
    const reward = rewards[event];
    const basePet: PetState = {
      ...pet,
      hunger: clamp100(pet.hunger + (reward.hunger ?? 0)),
      happiness: clamp100(pet.happiness + (reward.happiness ?? 0)),
      energy: clamp100(pet.energy + (reward.energy ?? 0)),
    };
    const { pet: next, leveledUp, evolved } = applyExp(basePet, reward.exp);
    const mood = computeMood(next.hunger, next.happiness, next.energy, next.sick);
    const eventLabels: Record<PetEvent, string> = {
      device_connected: "设备已连接",
      import_success: "资源导入成功",
      course_completed: "课程已完成",
      achievement_unlocked: "成就已解锁",
      firmware_flashed: "固件已刷写",
      gpio_used: "GPIO 操作",
      mirror_started: "镜像已启动",
    };
    const eventIcons: Record<PetEvent, string> = {
      device_connected: "usb",
      import_success: "package",
      course_completed: "book",
      achievement_unlocked: "trophy",
      firmware_flashed: "chip",
      gpio_used: "circuit",
      mirror_started: "mirror",
    };
    set((state) => ({
      pet: { ...next, mood },
      activities: addActivity(state.activities, eventLabels[event], eventIcons[event]),
    }));
    setDialogue(pickDialogue(EVENT_DIALOGUES[event]));
    if (evolved) {
      toast.pet(`${pet.name} 进化了！`, `成长为「${STAGE_NAMES[next.evolutionStage]}」`);
    } else if (leveledUp) {
      toast.pet(`${pet.name} 升级了！`, `Lv.${next.level}`);
    }
  },

  clearDialogue: () => {
    if (dialogueTimer) clearTimeout(dialogueTimer);
    set({ dialogue: null });
  },

  heal: () => {
    const { pet } = get();
    if (!pet.sick) return;
    const next: PetState = {
      ...pet,
      sick: false,
      hunger: clamp100(pet.hunger - 20),
      happiness: clamp100(pet.happiness + 15),
      totalInteractions: pet.totalInteractions + 1,
    };
    set((state) => ({
      pet: { ...next, mood: computeMood(next.hunger, next.happiness, next.energy, false) },
      activities: addActivity(state.activities, `给 ${pet.name} 治病`, "shield"),
    }));
    setDialogue("好多了！谢谢～");
    toast.success(`${pet.name} 康复了！`);
  },

  getCooldown: (action) => {
    const { pet } = get();
    const lastTime = action === "feed" ? pet.lastFed : pet.lastPlayed;
    if (!lastTime) return 0;
    const elapsed = Date.now() - lastTime;
    const remaining = Math.ceil((ACTION_COOLDOWN_MS - elapsed) / 1000);
    return Math.max(0, remaining);
  },
}));

// ================================================================
// 数据持久化
// ================================================================

usePetStore.subscribe((state) => {
  try {
    localStorage.setItem(PET_STORAGE_KEY, JSON.stringify(state.pet));
    localStorage.setItem(PET_ACTIVITIES_KEY, JSON.stringify(state.activities));
  } catch {
    // ignore
  }
});

// ================================================================
// 模块级启动 tick 定时器
// ================================================================

setInterval(() => {
  usePetStore.getState().tick();
}, TICK_INTERVAL_MS);

// 随机对话定时器（每 30s 随机说一句话）
setInterval(() => {
  const { pet, dialogue } = usePetStore.getState();
  if (dialogue) return; // 已有对话时不覆盖
  if (pet.action === "sleeping") return; // 睡觉时不说话
  if (Math.random() < 0.4) {
    const pool = DIALOGUES[pet.mood] || DIALOGUES.normal;
    setDialogue(pickDialogue(pool), 3000);
  }
}, 30000);
