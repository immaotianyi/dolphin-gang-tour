/**
 * 主题切换 store
 * 管理应用主题（Cyberpunk / Green / Amber / Ice），
 * 通过在 <html> 上设置 data-theme 属性切换 CSS 变量，
 * 并将选择持久化到 localStorage。
 */
import { create } from "zustand";

export type AppTheme = "cyberpunk" | "green" | "amber" | "ice";

export const THEMES: { id: AppTheme; name: string; desc: string; color: string }[] = [
  { id: "cyberpunk", name: "Cyberpunk", desc: "橙色赛博朋克", color: "#ff8c00" },
  { id: "green", name: "Green Terminal", desc: "绿色终端", color: "#00ff41" },
  { id: "amber", name: "Amber Terminal", desc: "琥珀色CRT", color: "#ffb000" },
  { id: "ice", name: "Ice Blue", desc: "冰蓝冷色", color: "#4d9eff" },
];

interface ThemeState {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
}

const STORAGE_KEY = "dolphintutor-theme";

function loadTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as AppTheme;
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {}
  return "cyberpunk";
}

function applyTheme(theme: AppTheme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// 初始化时应用主题
const initialTheme = loadTheme();
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
    set({ theme });
  },
}));
