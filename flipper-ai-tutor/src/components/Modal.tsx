/**
 * 通用模态框组件
 * 半透明黑色遮罩 + 居中像素边框卡片 + 标题栏 + 关闭按钮
 * 支持 ESC 键关闭、点击遮罩关闭
 */
import React, { useEffect, useCallback } from "react";
import { Icon } from "@/components/Icon";

interface ModalProps {
  /** 是否打开 */
  open: boolean;
  /** 标题栏文字 */
  title: string;
  /** 关闭回调 */
  onClose: () => void;
  /** 内容区 */
  children: React.ReactNode;
  /** 卡片宽度（px 或 CSS 字符串），默认 640 */
  width?: number | string;
  /** 是否允许点击遮罩关闭，默认 true */
  closeOnOverlay?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  title,
  onClose,
  children,
  width = 640,
  closeOnOverlay = true,
}) => {
  // ESC 键关闭
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    },
    [open, onClose],
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onKey]);

  if (!open) return null;

  return (
    <div
      onClick={() => closeOnOverlay && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        className="pixel-border"
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "92vw",
          maxHeight: "88vh",
          background: "var(--c-dark)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 标题栏 */}
        <div className="term-titlebar" style={{ justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="term-dot red" />
            <span className="term-dot yellow" />
            <span className="term-dot green" />
            <span
              className="font-pixel"
              style={{ fontSize: 9, marginLeft: 8, color: "var(--c-white)" }}
            >
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            style={{
              background: "transparent",
              border: "1.5px solid var(--c-white)",
              color: "var(--c-white)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 2,
            }}
          >
            <Icon name="cross" size={16} />
          </button>
        </div>

        {/* 内容区 */}
        <div
          className="scroll-y"
          style={{ flex: 1, padding: 14, minHeight: 0 }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
