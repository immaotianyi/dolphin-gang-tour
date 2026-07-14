/** 像素风 Modal 弹窗组件 — 带苹果风丝滑弹出动画 */
import React, { useEffect } from "react";
import { Icon } from "./Icon";

interface PixelModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

export const PixelModal: React.FC<PixelModalProps> = ({
  open,
  title,
  onClose,
  children,
  width = 520,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "scale-in 0.2s var(--ease-apple)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--c-bg2)",
          border: "2px solid var(--c-rule-light)",
          width: "100%",
          maxWidth: width,
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "8px 8px 0 rgba(0,0,0,0.5)",
          animation: "scale-in 0.25s var(--ease-bounce)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.6rem 1rem",
            borderBottom: "2px solid var(--c-rule)",
            background: "var(--c-bg3)",
          }}
        >
          <span className="font-pixel text-orange" style={{ fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            {title}
          </span>
          <button
            className="pixel-btn-ghost pixel-btn"
            onClick={onClose}
            style={{ padding: "0.2rem 0.4rem", minWidth: "auto" }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: "1.2rem" }}>
          {children}
        </div>
      </div>
    </div>
  );
};
