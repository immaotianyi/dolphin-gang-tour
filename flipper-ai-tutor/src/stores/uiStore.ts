/**
 * UI store
 * 管理当前主视图、当前课程、模态框开关、课程步骤进度
 */
import { create } from "zustand";

/** 主内容区可切换的视图 */
export type ViewId =
  | "ai"
  | "import"
  | "firmware"
  | "diagnostic"
  | "course";

/** 弹窗类型（mirror/trophy/pet/circuit 等工具走 Modal） */
export type ModalId = "mirror" | "trophy" | "pet" | "circuit" | "resource" | "settings" | "help" | "about" | "dashboard" | null;

interface UiState {
  activeView: ViewId;
  activeCourseId: string | null;
  openModal: ModalId;
  /** 各课程已勾选的步骤索引集合（key=courseId, value=Set 序列化为 number[]） */
  stepProgress: Record<string, number[]>;
  /** 侧栏是否折叠（Ctrl+B 切换） */
  sidebarCollapsed: boolean;
  setView: (v: ViewId) => void;
  openCourse: (id: string) => void;
  setModal: (m: ModalId) => void;
  toggleStep: (courseId: string, stepIndex: number) => void;
  isStepDone: (courseId: string, stepIndex: number) => boolean;
  /** 折叠/展开侧栏 */
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  activeView: "ai",
  activeCourseId: null,
  openModal: null,
  stepProgress: {},
  sidebarCollapsed: false,

  setView: (v) => set({ activeView: v, openModal: null }),

  openCourse: (id) =>
    set({ activeView: "course", activeCourseId: id, openModal: null }),

  setModal: (m) => set({ openModal: m }),

  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

  toggleStep: (courseId, stepIndex) => {
    const cur = get().stepProgress[courseId] ?? [];
    const exists = cur.includes(stepIndex);
    const nextArr = exists
      ? cur.filter((i) => i !== stepIndex)
      : [...cur, stepIndex];
    set({ stepProgress: { ...get().stepProgress, [courseId]: nextArr } });
  },

  isStepDone: (courseId, stepIndex) =>
    (get().stepProgress[courseId] ?? []).includes(stepIndex),
}));
