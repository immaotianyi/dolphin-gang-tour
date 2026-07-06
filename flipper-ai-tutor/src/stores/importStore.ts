/**
 * 资源导入状态管理 Store
 *
 * 管理资源包选择状态、导入进度。
 * 自动监听 import-progress 事件并同步更新进度。
 *
 * 资源包列表从后端 IPC list_resource_packages 获取（单一数据源），
 * 浏览器演示模式回退到 MOCK_RESOURCE_PACKAGES。
 *
 * 兼容别名：checked / toggle / useRecommended / start / cancel
 */
import { create } from "zustand";
import type { ImportProgress, ResourcePackage } from "@/types";
import {
  importResources,
  cancelImport,
  onImportProgress,
  listResourcePackages,
  isTauri,
} from "@/lib/tauri";
import { MOCK_RESOURCE_PACKAGES } from "@/data/resources";

// ================================================================
// 类型定义
// ================================================================

/** 导入 Store 状态 */
interface ImportStore {
  // ---- State ----
  /** 资源包列表（从后端获取） */
  packages: ResourcePackage[];
  /** 选中的资源包 ID 集合 */
  selectedPackageIds: Set<string>;
  /** 选中状态映射表 */
  checked: Record<string, boolean>;
  /** 导入进度 */
  progress: ImportProgress;
  /** 是否正在导入 */
  isImporting: boolean;
  /** 是否正在加载资源包列表 */
  isLoadingPackages: boolean;
  /** 最近一次错误信息 */
  lastError: string | null;

  // ---- Actions ----
  /** 从后端加载资源包列表 */
  loadPackages: () => Promise<void>;
  /** 切换资源包选中状态 */
  togglePackage: (pkgId: string) => void;
  /** 选中所有默认推荐的资源包 */
  selectDefaults: () => void;
  /** 全选 */
  selectAll: () => void;
  /** 全不选 */
  deselectAll: () => void;
  /** 开始导入 */
  startImport: () => Promise<void>;
  /** 取消导入 */
  cancelImportAction: () => Promise<void>;
  /** 重置导入状态 */
  reset: () => void;
  /** 初始化事件监听 */
  initListeners: () => Promise<() => void>;

  // ---- 兼容别名 ----
  toggle: (pkgId: string) => void;
  useRecommended: () => void;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
}

// ================================================================
// 常量与工具函数
// ================================================================

const INITIAL_PROGRESS: ImportProgress = {
  phase: "idle",
  currentFile: "",
  filesCompleted: 0,
  filesTotal: 0,
  bytesTransferred: 0,
  bytesTotal: 0,
  speedBytesPerSec: 0,
  etaSeconds: 0,
  logLines: [],
};

/** 获取默认选中的资源包 ID */
function getDefaultIds(packages: ResourcePackage[]): string[] {
  return packages.filter((p) => p.defaultChecked).map((p) => p.id);
}

/** 将 Set 转换为 checked 映射表 */
function setToChecked(
  ids: Set<string>,
  packages: ResourcePackage[]
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const p of packages) {
    result[p.id] = ids.has(p.id);
  }
  return result;
}

// ================================================================
// Store 创建
// ================================================================

// 初始化使用 mock 数据（浏览器演示模式或加载前）
const initialPackages = isTauri() ? [] : MOCK_RESOURCE_PACKAGES;
const initialDefaults = getDefaultIds(initialPackages);
const initialSelectedSet = new Set(initialDefaults);

export const useImportStore = create<ImportStore>((set, get) => ({
  // ---- State 初始值 ----
  packages: initialPackages,
  selectedPackageIds: initialSelectedSet,
  checked: setToChecked(initialSelectedSet, initialPackages),
  progress: INITIAL_PROGRESS,
  isImporting: false,
  isLoadingPackages: false,
  lastError: null,

  // ---- Actions ----

  loadPackages: async () => {
    set({ isLoadingPackages: true });
    try {
      const result = await listResourcePackages();
      if (result.success && result.data && result.data.length > 0) {
        const pkgs = result.data;
        const defaultIds = getDefaultIds(pkgs);
        const selectedSet = new Set(defaultIds);
        set({
          packages: pkgs,
          selectedPackageIds: selectedSet,
          checked: setToChecked(selectedSet, pkgs),
          isLoadingPackages: false,
        });
      } else {
        // IPC 失败或返回空，使用 mock
        set({
          packages: MOCK_RESOURCE_PACKAGES,
          isLoadingPackages: false,
        });
      }
    } catch {
      set({
        packages: MOCK_RESOURCE_PACKAGES,
        isLoadingPackages: false,
      });
    }
  },

  togglePackage: (pkgId) =>
    set((state) => {
      const newSet = new Set(state.selectedPackageIds);
      if (newSet.has(pkgId)) {
        newSet.delete(pkgId);
      } else {
        newSet.add(pkgId);
      }
      return {
        selectedPackageIds: newSet,
        checked: setToChecked(newSet, state.packages),
      };
    }),

  selectDefaults: () =>
    set((state) => {
      const ids = getDefaultIds(state.packages);
      const selectedSet = new Set(ids);
      return {
        selectedPackageIds: selectedSet,
        checked: setToChecked(selectedSet, state.packages),
      };
    }),

  selectAll: () =>
    set((state) => {
      const ids = state.packages.map((p) => p.id);
      const selectedSet = new Set(ids);
      return {
        selectedPackageIds: selectedSet,
        checked: setToChecked(selectedSet, state.packages),
      };
    }),

  deselectAll: () =>
    set((state) => ({
      selectedPackageIds: new Set(),
      checked: setToChecked(new Set(), state.packages),
    })),

  startImport: async () => {
    const { selectedPackageIds, isImporting } = get();
    if (isImporting) return;

    const ids = Array.from(selectedPackageIds);
    if (ids.length === 0) {
      set({ lastError: "请至少选择一个资源包" });
      return;
    }

    set({
      isImporting: true,
      lastError: null,
      progress: { ...INITIAL_PROGRESS, phase: "backup" },
    });

    try {
      const result = await importResources(ids);
      if (!result.success) {
        set({
          isImporting: false,
          lastError: result.error ?? "导入启动失败",
          progress: {
            ...INITIAL_PROGRESS,
            phase: "error",
            errorMessage: result.error ?? "导入启动失败",
          },
        });
      }
    } catch (err) {
      set({
        isImporting: false,
        lastError: err instanceof Error ? err.message : String(err),
        progress: {
          ...INITIAL_PROGRESS,
          phase: "error",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  cancelImportAction: async () => {
    set({ lastError: null });
    try {
      const result = await cancelImport();
      if (result.success) {
        set({
          isImporting: false,
          progress: { ...INITIAL_PROGRESS, phase: "idle" },
        });
      } else {
        set({ lastError: result.error ?? "取消失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  reset: () =>
    set((state) => {
      const ids = getDefaultIds(state.packages);
      const selectedSet = new Set(ids);
      return {
        selectedPackageIds: selectedSet,
        checked: setToChecked(selectedSet, state.packages),
        progress: INITIAL_PROGRESS,
        isImporting: false,
        lastError: null,
      };
    }),

  initListeners: async () => {
    const unlisten = await onImportProgress((progress) => {
      set({ progress });

      if (progress.phase === "done") {
        set({ isImporting: false });
      } else if (progress.phase === "error") {
        set({
          isImporting: false,
          lastError: progress.errorMessage ?? "导入出错",
        });
      }
    });
    return unlisten;
  },

  // ---- 兼容别名 ----

  toggle: (pkgId: string) => get().togglePackage(pkgId),
  useRecommended: () => get().selectDefaults(),
  start: () => get().startImport(),
  cancel: () => get().cancelImportAction(),
}));

// ================================================================
// 模块级别自动注册事件监听
// ================================================================

let _importUnlisten: (() => void) | null = null;

onImportProgress((progress) => {
  useImportStore.setState({ progress });

  if (progress.phase === "done") {
    useImportStore.setState({ isImporting: false });
  } else if (progress.phase === "error") {
    useImportStore.setState({
      isImporting: false,
      lastError: progress.errorMessage ?? "导入出错",
    });
  }
}).then((fn) => {
  _importUnlisten = fn;
});

// Tauri 模式下自动加载资源包列表
if (isTauri()) {
  useImportStore.getState().loadPackages();
}

/** 清理导入事件监听 */
export function cleanupImportListeners(): void {
  _importUnlisten?.();
  _importUnlisten = null;
}
