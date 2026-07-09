import { useEffect } from "react";
import { useUiStore } from "@/stores/uiStore";
import type { ViewId } from "@/stores/uiStore";

/**
 * 全局键盘快捷键系统
 * - Ctrl/Cmd+1~5: 切换主视图 (AI/Import/Firmware/Diagnostic/Course)
 * - Ctrl/Cmd+,: 打开设置
 * - Ctrl/Cmd+B: 折叠/展开侧栏
 * - Ctrl/Cmd+K: 快速切换视图（循环）
 * - ?: 打开帮助面板（需非输入框聚焦）
 * - Esc: 关闭当前弹窗（已有，但统一到此处）
 */
export function useKeyboardShortcuts() {
  const { setView, setModal, toggleSidebar } = useUiStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Ctrl/Cmd+1~5: 切换视图
      if (mod && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const views: ViewId[] = ["ai", "import", "firmware", "diagnostic", "course"];
        setView(views[parseInt(e.key) - 1]);
        return;
      }

      // Ctrl/Cmd+,: 设置
      if (mod && e.key === ",") {
        e.preventDefault();
        setModal("settings");
        return;
      }

      // Ctrl/Cmd+B: 折叠侧栏
      if (mod && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Ctrl/Cmd+K: 循环切换视图
      if (mod && e.key === "k") {
        e.preventDefault();
        const current = useUiStore.getState().activeView;
        const views: ViewId[] = ["ai", "import", "firmware", "diagnostic", "course"];
        const idx = views.indexOf(current);
        setView(views[(idx + 1) % views.length]);
        return;
      }

      // ?: 帮助面板（非输入框）
      if (e.key === "?" && !isInput && !mod) {
        e.preventDefault();
        setModal("help");
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setView, setModal, toggleSidebar]);
}
