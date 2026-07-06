/**
 * 开机动画组件 BootScreen
 *
 * 应用启动时全屏展示的复古像素风开机自检动画：
 *   - 顶部海豚图标 + 应用标题
 *   - 中部逐行出现的启动日志（每行带状态图标）
 *   - 底部进度条 + 百分比
 * 动画播放完毕后通过 onComplete 回调通知父组件切换到主界面。
 *
 * 设计约束：零 emoji，所有图标均使用 <Icon /> 组件；
 * 复用全局 CSS 类（.pixel-border-orange / .led / .progress-bar 等）。
 */
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";

// ================================================================
// 类型定义
// ================================================================

interface BootScreenProps {
  /** 开机动画完成回调，触发后父组件应切换到主界面 */
  onComplete: () => void;
}

/** 单条启动日志定义 */
interface BootLine {
  /** 日志文本（大写英文，贴合终端美学） */
  text: string;
  /** 该行对应的图标 */
  icon: IconName;
}

// ================================================================
// 启动日志序列
// ================================================================

const BOOT_LINES: BootLine[] = [
  { text: "INITIALIZING SYSTEM", icon: "chip" },
  { text: "LOADING USB DRIVERS", icon: "usb" },
  { text: "MOUNTING SD CARD", icon: "sd" },
  { text: "CONNECTING MODULES", icon: "circuit" },
  { text: "STARTING AI CORE", icon: "brain" },
  { text: "SYSTEM READY", icon: "check" },
];

/** 每行日志出现的间隔（毫秒） */
const LINE_INTERVAL_MS = 360;
/** 全部日志显示完毕后，等待多久再触发 onComplete */
const COMPLETE_DELAY_MS = 700;

// ================================================================
// 组件实现
// ================================================================

export const BootScreen: React.FC<BootScreenProps> = ({ onComplete }) => {
  /** 当前已显示的日志行数 */
  const [visibleLines, setVisibleLines] = useState(0);
  /** 进度百分比（0-100） */
  const [progress, setProgress] = useState(0);
  /** 防止 onComplete 被重复调用 */
  const completedRef = useRef(false);

  useEffect(() => {
    let lineIdx = 0;

    // 定时逐行显示启动日志
    const lineTimer = setInterval(() => {
      lineIdx += 1;
      setVisibleLines(lineIdx);
      setProgress(Math.round((lineIdx / BOOT_LINES.length) * 100));

      // 全部日志显示完毕
      if (lineIdx >= BOOT_LINES.length) {
        clearInterval(lineTimer);
        window.setTimeout(() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete();
          }
        }, COMPLETE_DELAY_MS);
      }
    }, LINE_INTERVAL_MS);

    return () => clearInterval(lineTimer);
  }, [onComplete]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        background: "var(--c-black)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="pixel-border-orange"
        style={{
          width: "min(560px, 94vw)",
          background: "var(--c-dark2)",
          padding: 24,
        }}
      >
        {/* ---- 顶部标题区 ---- */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div
            className="bob"
            style={{
              color: "var(--c-orange)",
              display: "inline-block",
              marginBottom: 8,
            }}
          >
            <Icon name="dolphin" size={56} />
          </div>
          <div
            className="font-pixel text-orange"
            style={{ fontSize: 14, letterSpacing: 2 }}
          >
            FLIPPER AI TUTOR
          </div>
          <div
            className="font-term text-dim"
            style={{ fontSize: 16, marginTop: 4 }}
          >
            v0.1.3 | MOMENTUM FIRMWARE
          </div>
        </div>

        {/* ---- 状态指示条 ---- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            padding: "4px 8px",
            background: "var(--c-dark)",
            border: "1px solid var(--c-gray)",
          }}
        >
          <span
            className={`led ${progress >= 100 ? "green" : "orange blink"}`}
          />
          <span className="font-term text-orange" style={{ fontSize: 16 }}>
            {progress >= 100 ? "BOOT COMPLETE" : "BOOTING..."}
          </span>
          <span
            className="font-term text-dim"
            style={{ fontSize: 14, marginLeft: "auto" }}
          >
            STEP {Math.min(visibleLines, BOOT_LINES.length)}/{BOOT_LINES.length}
          </span>
        </div>

        {/* ---- 启动日志区 ---- */}
        <div
          style={{
            background: "var(--c-black)",
            border: "1px solid var(--c-gray)",
            padding: "10px 12px",
            minHeight: 168,
            maxHeight: 168,
            overflow: "hidden",
          }}
        >
          {BOOT_LINES.map((line, idx) => {
            // 仅渲染已显示的行
            if (idx >= visibleLines) return null;
            const isCurrent = idx === visibleLines - 1;
            const isReady = idx === BOOT_LINES.length - 1;
            return (
              <div
                key={line.text}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "4px 0",
                }}
              >
                <span style={{ color: "var(--c-orange)", flexShrink: 0 }}>
                  <Icon name={line.icon} size={14} />
                </span>
                <span
                  className="font-term"
                  style={{
                    fontSize: 17,
                    color: isReady ? "var(--c-green)" : "var(--c-green-dim)",
                    flex: 1,
                  }}
                >
                  {`> ${line.text}`}
                  {isCurrent && !isReady && (
                    <span className="blink" style={{ marginLeft: 2 }}>
                      _
                    </span>
                  )}
                </span>
                {isCurrent && !isReady ? (
                  <span
                    className="font-term text-dim blink"
                    style={{ fontSize: 14 }}
                  >
                    ...
                  </span>
                ) : (
                  <span style={{ color: "var(--c-green)", flexShrink: 0 }}>
                    <Icon name="check" size={14} />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ---- 进度条 ---- */}
        <div style={{ marginTop: 14 }}>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 6,
            }}
          >
            <span className="font-term text-dim" style={{ fontSize: 14 }}>
              LOADING SYSTEM
            </span>
            <span className="font-term text-green" style={{ fontSize: 16 }}>
              {progress}%
            </span>
          </div>
        </div>

        {/* ---- 底部提示 ---- */}
        <div
          className="font-term text-dim"
          style={{ fontSize: 14, marginTop: 12, textAlign: "center" }}
        >
          {progress >= 100
            ? "ENTERING MAIN INTERFACE"
            : "PLEASE WAIT WHILE SYSTEM INITIALIZE"}
        </div>
      </div>
    </div>
  );
};

export default BootScreen;
