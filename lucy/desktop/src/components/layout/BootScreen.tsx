/** 开机动画 — Lucy BIOS 启动序列，像素风终端打字效果 */
import React, { useEffect, useState, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";

interface BootScreenProps {
  onComplete: () => void;
}

export const BootScreen: React.FC<BootScreenProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const bootLines = useMemo(() => [
    `[OK] ${t("boot.bios")}`,
    `[OK] ESP32-S3-WROOM-1-N8R8 ....... ${t("boot.detected")}`,
    `[OK] CC1101 Sub-GHz Transceiver ... ${t("boot.initialized")}`,
    `[OK] ST25R3916 NFC Reader ......... ${t("boot.ready")}`,
    `[OK] ST7789V 240x240 IPS Display .. ${t("boot.online")}`,
    `[OK] USB CDC+HID Composite Device . ${t("boot.mounted")}`,
    `[OK] TXB0108 Level Shifter ........ ${t("boot.enabled")}`,
    `[OK] FreeRTOS SMP Dual-Core ....... ${t("boot.running")}`,
    `[OK] Kill Switch (VCC+SPI) ........ ${t("boot.armed")}`,
    `[OK] Factory Reset Partition ...... ${t("boot.protected")}`,
    "",
    `> ${t("boot.loadingDesktop")}`,
    `> ${t("boot.ready2")}`,
  ], [t]);

  useEffect(() => {
    let lineIdx = 0;
    const interval = setInterval(() => {
      if (lineIdx < bootLines.length) {
        setVisibleLines((prev) => [...prev, bootLines[lineIdx]]);
        setProgress(((lineIdx + 1) / bootLines.length) * 100);
        lineIdx++;
        // 自动滚动到底部
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      } else {
        clearInterval(interval);
        setTimeout(onComplete, 600);
      }
    }, 120);
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "var(--c-bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "2rem",
      }}
    >
      {/* Logo */}
      <div
        className="font-pixel"
        style={{
          fontSize: "clamp(2.5rem, 8vw, 5rem)",
          color: "var(--c-orange)",
          marginBottom: "0.5rem",
          letterSpacing: "0.1em",
          textShadow: "0 0 20px rgba(249,115,22,0.5)",
        }}
      >
        LUCY
      </div>
      <div
        className="font-term text-dim"
        style={{
          fontSize: "0.85rem",
          marginBottom: "2rem",
          letterSpacing: "0.15em",
        }}
      >
        {t("boot.subtitle")}
      </div>

      {/* Boot log */}
      <div
        ref={containerRef}
        className="crt-screen"
        style={{
          width: "100%",
          maxWidth: 600,
          maxHeight: 300,
          overflowY: "auto",
          background: "var(--c-bg2)",
          border: "2px solid var(--c-rule)",
          padding: "1rem",
          fontFamily: "var(--font-mono)",
          fontSize: "0.78rem",
          lineHeight: 1.6,
        }}
      >
        {visibleLines.map((line, i) => {
          const text = line || "";
          return (
          <div
            key={i}
            style={{
              color: text.startsWith("[OK]")
                ? "var(--c-green)"
                : text.startsWith(">")
                ? "var(--c-cyan)"
                : "var(--c-dim)",
              animation: "slide-in-up 0.2s var(--ease-apple)",
            }}
          >
            {text}
            {i === visibleLines.length - 1 && (
              <span style={{ animation: "blink 1s step-end infinite", color: "var(--c-orange)" }}>█</span>
            )}
          </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{ width: "100%", maxWidth: 600, marginTop: "1rem" }}>
        <div className="pixel-progress">
          <div className="pixel-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div
          className="font-mono text-muted"
          style={{ fontSize: "0.7rem", textAlign: "center", marginTop: "0.4rem" }}
        >
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
};
