/**
 * 诊断状态管理 Store
 *
 * 管理设备诊断结果和自动修复操作。
 * 诊断为请求-响应模式，不涉及事件监听。
 *
 * 兼容别名：isDumping / lastScanAt / scan / dump
 * 供 DiagnosticPanel 组件直接使用。
 */
import { create } from "zustand";
import type { DiagnosticResult } from "@/types";
import { runDiagnostics, applyDiagnosticFix, saveLogDump, isTauri } from "@/lib/tauri";

// ================================================================
// 类型定义
// ================================================================

/** 诊断 Store 状态 */
interface DiagnosticStore {
  // ---- State（规范 API） ----
  /** 诊断结果列表 */
  results: DiagnosticResult[];
  /** 是否正在扫描诊断 */
  isScanning: boolean;
  /** 最近一次错误信息 */
  lastError: string | null;

  // ---- State（组件兼容） ----
  /** 是否正在导出诊断日志 */
  isDumping: boolean;
  /** 上次扫描时间戳 */
  lastScanAt: number | null;

  // ---- Actions（规范 API） ----
  /** 运行设备诊断 */
  runDiagnostics: () => Promise<void>;
  /** 应用诊断修复（按结果索引） */
  applyFix: (index: number) => Promise<void>;
  /** 清除诊断结果 */
  clear: () => void;
  /** 清除错误信息 */
  clearError: () => void;

  // ---- Actions（组件兼容别名） ----
  /** runDiagnostics 别名 */
  scan: () => Promise<void>;
  /** 导出诊断日志 */
  dump: () => Promise<void>;
}

// ================================================================
// Store 创建
// ================================================================

export const useDiagnosticStore = create<DiagnosticStore>((set, get) => ({
  // ---- State 初始值 ----
  results: [],
  isScanning: false,
  lastError: null,

  // 组件兼容 State
  isDumping: false,
  lastScanAt: null,

  // ---- Actions（规范 API） ----

  runDiagnostics: async () => {
    set({ isScanning: true, lastError: null });
    try {
      const result = await runDiagnostics();
      if (result.success && result.data) {
        set({
          results: result.data,
          lastScanAt: Date.now(),
        });
      } else {
        set({ lastError: result.error ?? "诊断失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ isScanning: false });
    }
  },

  applyFix: async (index: number) => {
    const { results } = get();
    const diagnosticResult = results[index];
    if (!diagnosticResult) {
      set({ lastError: "无效的诊断项索引" });
      return;
    }

    if (!diagnosticResult.autoFixable || !diagnosticResult.fixAction) {
      set({ lastError: "该项无法自动修复" });
      return;
    }

    const action = diagnosticResult.fixAction;
    set({ lastError: null });

    try {
      const result = await applyDiagnosticFix(action);
      if (result.success) {
        // 修复成功后，更新该诊断项为 OK
        set((state) => ({
          results: state.results.map((r, i) =>
            i === index
              ? {
                  ...r,
                  level: "ok" as const,
                  detail: `${r.detail}\n[已自动修复]`,
                  autoFixable: false,
                  fixAction: undefined,
                }
              : r
          ),
        }));
      } else {
        set({ lastError: result.error ?? "修复失败" });
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    }
  },

  clear: () => set({ results: [], lastError: null, lastScanAt: null }),

  clearError: () => set({ lastError: null }),

  // ---- Actions（组件兼容别名） ----

  scan: () => get().runDiagnostics(),

  dump: async () => {
    set({ isDumping: true, lastError: null });
    try {
      if (isTauri()) {
        // Tauri 模式：用 dialog 插件选择保存路径，然后写入文件
        try {
          const { save } = await import("@tauri-apps/plugin-dialog");
          const filePath = await save({
            defaultPath: `flipper-diag-${new Date().toISOString().slice(0, 10)}.log`,
            filters: [{ name: "日志文件", extensions: ["log", "txt"] }],
          });
          if (filePath) {
            const result = await saveLogDump(filePath);
            if (!result.success) {
              set({ isDumping: false, lastError: result.error ?? "导出失败" });
              return;
            }
          }
        } catch {
          // dialog 插件不可用，回退到自动路径
          const autoPath = `/tmp/flipper-diag-${Date.now()}.log`;
          await saveLogDump(autoPath);
        }
      } else {
        // 浏览器模式：生成日志文件下载
        const logs = [
          `FlipperZero AI Tutor 诊断日志`,
          `导出时间: ${new Date().toLocaleString()}`,
          `---`,
          ...get().results.map(
            (r) => `[${r.level.toUpperCase()}] ${r.title}: ${r.detail ?? ""}`
          ),
        ];
        const blob = new Blob([logs.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `flipper-diag-${new Date().toISOString().slice(0, 10)}.log`;
        a.click();
        URL.revokeObjectURL(url);
      }
      set({ isDumping: false });
    } catch (err) {
      set({
        isDumping: false,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));
