/** UI 状态管理 — 包含语言、主题、事件时间线 */
import { create } from "zustand";
import type { ViewId, ModalId } from "@/types";
import type { AppLanguage } from "@/lib/i18n";
import { getSavedLanguage, saveLanguage } from "@/lib/i18n";
import i18n from "i18next";
import { invoke } from "@/lib/tauri";

export type AppMode = "beginner" | "standard" | "developer" | "education" | "demo";

export interface TimelineEntry {
  id: string;
  type: "connect" | "disconnect" | "command" | "error" | "ai" | "security" | "info";
  message: string;
  timestamp: number;
  detail?: string;
}

interface UiStore {
  activeView: ViewId;
  openModal: ModalId;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  consoleVisible: boolean;
  theme: "cyberpunk" | "gameboy" | "nes" | "pro";
  bootComplete: boolean;
  language: AppLanguage;
  appMode: AppMode;
  timeline: TimelineEntry[];

  setView: (view: ViewId) => void;
  setModal: (modal: ModalId) => void;
  toggleSidebar: () => void;
  toggleConsole: () => void;
  setTheme: (theme: UiStore["theme"]) => void;
  setBootComplete: (v: boolean) => void;
  setLanguage: (lang: AppLanguage) => void;
  setAppMode: (mode: AppMode) => void;
  addTimelineEntry: (entry: Omit<TimelineEntry, "id" | "timestamp">) => void;
  clearTimeline: () => void;
  loadTimelineFromDB: () => Promise<void>;
}

let entryCounter = 0;

export const useUiStore = create<UiStore>((set, get) => ({
  activeView: "dashboard",
  openModal: null,
  sidebarCollapsed: false,
  sidebarWidth: 240,
  consoleVisible: false,
  theme: "cyberpunk",
  bootComplete: false,
  language: getSavedLanguage(),
  appMode: "standard",
  timeline: [],

  setView: (view) => set({ activeView: view, openModal: null }),
  setModal: (modal) => set({ openModal: modal }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleConsole: () => set((s) => ({ consoleVisible: !s.consoleVisible })),
  setTheme: (theme) => set({ theme }),
  setBootComplete: (v) => set({ bootComplete: v }),

  setLanguage: (lang) => {
    saveLanguage(lang);
    i18n.changeLanguage(lang);
    set({ language: lang });
  },

  setAppMode: (mode) => {
    set({ appMode: mode });
  },

  addTimelineEntry: (entry) => {
    const ts = Date.now();
    const fullEntry: TimelineEntry = {
      ...entry,
      id: `tl-${ts}-${++entryCounter}`,
      timestamp: ts,
    };
    set((s) => ({ timeline: [fullEntry, ...s.timeline].slice(0, 100) }));
    // Fire-and-forget persist to SQLite
    invoke("cmd_timeline_save", {
      event: {
        id: fullEntry.id,
        event_type: fullEntry.type,
        message: fullEntry.message,
        detail: fullEntry.detail ?? null,
        timestamp: Math.floor(ts / 1000),
      },
    }).catch(() => { /* silent fail — timeline is non-critical */ });
  },

  clearTimeline: () => {
    set({ timeline: [] });
    invoke("cmd_timeline_clear").catch(() => {});
  },

  loadTimelineFromDB: async () => {
    try {
      const events = await invoke<Array<{
        id: string;
        event_type: string;
        message: string;
        detail: string | null;
        timestamp: number;
      }>>("cmd_timeline_list", { limit: 100 });
      const entries: TimelineEntry[] = events.map((e) => ({
        id: e.id,
        type: e.event_type as TimelineEntry["type"],
        message: e.message,
        detail: e.detail ?? undefined,
        timestamp: e.timestamp * 1000, // DB stores seconds, frontend uses ms
      }));
      // Only load if we don't already have in-memory entries (avoid duplicates on re-render)
      if (get().timeline.length === 0 && entries.length > 0) {
        set({ timeline: entries });
      }
    } catch {
      // Silent fail — in-memory timeline still works
    }
  },
}));
