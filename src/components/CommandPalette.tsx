/** Command Palette — Ctrl+K 全局快速搜索 */
import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { useUiStore } from "@/stores/uiStore";
import type { ViewId } from "@/types";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setView } = useUiStore();

  const navigate = (view: ViewId) => {
    setView(view);
    onClose();
  };

  const commands: Command[] = [
    { id: "go-dashboard", label: t("sidebar.dashboard"), icon: "dashboard", category: t("commandPalette.navigation"), action: () => navigate("dashboard") },
    { id: "go-nfc", label: t("sidebar.nfcReader"), icon: "nfc", category: t("commandPalette.modules"), action: () => navigate("nfc") },
    { id: "go-subghz", label: t("sidebar.subghz"), icon: "radio", category: t("commandPalette.modules"), action: () => navigate("subghz") },
    { id: "go-ir", label: t("sidebar.infrared"), icon: "ir", category: t("commandPalette.modules"), action: () => navigate("ir") },
    { id: "go-badusb", label: t("sidebar.badusb"), icon: "keyboard", category: t("commandPalette.modules"), action: () => navigate("badusb") },
    { id: "go-gpio", label: t("sidebar.gpio"), icon: "circuit", category: t("commandPalette.modules"), action: () => navigate("gpio") },
    { id: "go-screen", label: t("sidebar.screenMirror"), icon: "mirror", category: t("commandPalette.modules"), action: () => navigate("screen") },
    { id: "go-ai", label: t("sidebar.lucyAI"), icon: "robot", category: t("commandPalette.ai"), action: () => navigate("ai") },
    { id: "go-firmware", label: t("sidebar.firmware"), icon: "rocket", category: t("commandPalette.system"), action: () => navigate("firmware") },
    { id: "go-settings", label: t("sidebar.settings"), icon: "settings", category: t("commandPalette.system"), action: () => navigate("settings") },
    { id: "act-scan", label: t("commandPalette.scanDevices"), shortcut: "Ctrl+S", icon: "search", category: t("commandPalette.actions"), action: () => { useUiStore.getState(); onClose(); } },
    { id: "act-screenshot", label: t("commandPalette.captureScreenshot"), shortcut: "Ctrl+Shift+S", icon: "download", category: t("commandPalette.actions"), action: () => onClose() },
    { id: "act-toggle-sidebar", label: t("commandPalette.toggleSidebar"), shortcut: "Ctrl+B", icon: "menu", category: t("commandPalette.actions"), action: () => { useUiStore.getState().toggleSidebar(); onClose(); } },
  ];

  const filtered = commands.filter((cmd) => {
    const q = query.toLowerCase();
    return cmd.label.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[selectedIndex];
        if (cmd) cmd.action();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selectedIndex, onClose]);

  if (!open) return null;

  // Group by category
  const categories = [...new Set(filtered.map((c) => c.category))];

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 9000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        animation: "fadeIn 0.15s var(--ease-apple)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--c-bg2)",
          border: "2px solid var(--c-orange)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px var(--c-bg), var(--shadow-glow-orange)",
          animation: "scaleIn 0.2s var(--ease-bounce)",
        }}
      >
        {/* Search input */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          padding: "0.8rem 1rem",
          borderBottom: "1px solid var(--c-rule)",
        }}>
          <Icon name="search" size={18} style={{ color: "var(--c-orange)" }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commandPalette.title")}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--c-ink)",
              fontFamily: "var(--font-term)",
              fontSize: "0.9rem",
            }}
          />
          <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>ESC</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: "auto", padding: "0.4rem" }}>
          {filtered.length === 0 ? (
            <div className="font-term text-dim" style={{ textAlign: "center", padding: "2rem", fontSize: "0.8rem" }}>
              {t("commandPalette.noResults", { query })}
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat} style={{ marginBottom: "0.4rem" }}>
                <div className="font-mono text-muted" style={{ fontSize: "0.6rem", padding: "0.3rem 0.6rem", letterSpacing: "0.1em" }}>
                  {cat.toUpperCase()}
                </div>
                {filtered.filter((c) => c.category === cat).map((cmd) => {
                  const idx = filtered.indexOf(cmd);
                  return (
                    <button
                      key={cmd.id}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => cmd.action()}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        padding: "0.5rem 0.8rem",
                        background: selectedIndex === idx ? "var(--c-bg3)" : "transparent",
                        border: "none",
                        cursor: "pointer",
                        transition: "background 0.1s var(--ease-apple)",
                        textAlign: "left",
                      }}
                    >
                      <Icon name={cmd.icon as any} size={16} style={{
                        color: selectedIndex === idx ? "var(--c-orange)" : "var(--c-dim)",
                        flexShrink: 0,
                      }} />
                      <span className="font-term" style={{
                        flex: 1,
                        fontSize: "0.82rem",
                        color: selectedIndex === idx ? "var(--c-ink)" : "var(--c-dim)",
                      }}>
                        {cmd.label}
                      </span>
                      {cmd.shortcut && (
                        <span className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>
                          {cmd.shortcut}
                        </span>
                      )}
                      {selectedIndex === idx && (
                        <span className="font-pixel text-orange" style={{ fontSize: "0.6rem" }}>→</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0.4rem 0.8rem",
          borderTop: "1px solid var(--c-rule)",
        }}>
          <div style={{ display: "flex", gap: "0.8rem" }}>
            <span className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>
              <kbd style={{ background: "var(--c-bg3)", padding: "0 0.3rem", border: "1px solid var(--c-rule)" }}>↑↓</kbd> {t("commandPalette.navigate")}
            </span>
            <span className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>
              <kbd style={{ background: "var(--c-bg3)", padding: "0 0.3rem", border: "1px solid var(--c-rule)" }}>↵</kbd> {t("commandPalette.select")}
            </span>
          </div>
          <span className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>
            {filtered.length} {t("commandPalette.results")}
          </span>
        </div>
      </div>
    </div>
  );
};
