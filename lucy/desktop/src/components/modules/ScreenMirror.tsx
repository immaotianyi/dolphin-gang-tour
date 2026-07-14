/** 屏幕镜像 — Canvas 实时渲染设备屏幕 (RGB565) */
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Icon } from "@/components/ui/Icon";
import { useDeviceStore } from "@/stores/deviceStore";

const SCREEN_W = 240;
const SCREEN_H = 240;

export const ScreenMirror: React.FC = () => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { screenFrame, connectionState } = useDeviceStore();
  const [fps, setFps] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [frames, setFrames] = useState<number>(0);
  const fpsCounter = useRef({ count: 0, lastTime: performance.now() });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle both ScreenFrame object and bare Uint8Array (mock mode)
    let data: Uint8Array | null = null;
    if (screenFrame) {
      if (screenFrame instanceof Uint8Array) {
        data = screenFrame;
      } else if (typeof screenFrame === "object" && "data" in screenFrame) {
        data = (screenFrame as any).data;
      }
    }

    if (!data || data.length < SCREEN_W * SCREEN_H * 2) return;

    const imageData = ctx.createImageData(SCREEN_W, SCREEN_H);
    for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
      const byteOffset = i * 2;
      const hi = data[byteOffset];
      const lo = data[byteOffset + 1];
      const rgb565 = (hi << 8) | lo;
      const r = ((rgb565 >> 11) & 0x1f) << 3;
      const g = ((rgb565 >> 5) & 0x3f) << 2;
      const b = (rgb565 & 0x1f) << 3;
      imageData.data[i * 4] = r;
      imageData.data[i * 4 + 1] = g;
      imageData.data[i * 4 + 2] = b;
      imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    // FPS counter
    fpsCounter.current.count++;
    const now = performance.now();
    if (now - fpsCounter.current.lastTime >= 1000) {
      setFps(fpsCounter.current.count);
      fpsCounter.current.count = 0;
      fpsCounter.current.lastTime = now;
    }
    setFrames((f) => f + 1);
  }, [screenFrame]);

  const handleScreenshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `lucy-screen-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const isConnected = connectionState === "connected";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <PixelPanel>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0" }}>
          <div style={{
            width: 48, height: 48,
            background: "var(--c-bg3)",
            border: "2px solid var(--c-cyan)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "var(--shadow-glow-cyan)",
          }}>
            <Icon name="mirror" size={28} style={{ color: "var(--c-cyan)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="font-pixel text-cyan" style={{ fontSize: "1.1rem" }}>{t("screen.title")}</div>
            <div className="font-term text-dim" style={{ fontSize: "0.8rem" }}>{t("screen.subtitle")}</div>
          </div>
          <div style={{ display: "flex", gap: "0.8rem" }}>
            <div style={{ textAlign: "center" }}>
              <div className="font-pixel text-cyan" style={{ fontSize: "1rem" }}>{fps}</div>
              <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>FPS</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="font-pixel text-green" style={{ fontSize: "1rem" }}>{frames}</div>
              <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>FRAMES</div>
            </div>
          </div>
        </div>
      </PixelPanel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1rem" }}>
        {/* Canvas display */}
        <PixelPanel title={t("screen.deviceScreen")}>
          <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "1rem",
            position: "relative",
          }}>
            <div style={{
              position: "relative",
              border: "3px solid var(--c-rule)",
              boxShadow: "0 0 0 1px var(--c-bg), 0 0 20px rgba(34,211,238,0.2)",
              background: "#000",
            }}>
              <canvas
                ref={canvasRef}
                width={SCREEN_W}
                height={SCREEN_H}
                style={{
                  display: "block",
                  width: 320,
                  height: 320,
                  imageRendering: "pixelated",
                }}
              />
              {/* CRT scanline overlay */}
              <div style={{
                position: "absolute",
                top: 0, left: 0, right: 0, bottom: 0,
                background: "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
                pointerEvents: "none",
              }} />
              {/* No signal overlay */}
              {!isConnected && (
                <div style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.8)",
                }}>
                  <div className="font-pixel text-muted" style={{ fontSize: "0.8rem", animation: "blink 1s step-end infinite" }}>
                    {t("screen.noSignal")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </PixelPanel>

        {/* Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <PixelPanel title={t("screen.controls")}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <PixelButton
                variant="ghost"
                icon="download"
                onClick={handleScreenshot}
                disabled={!isConnected}
              >
                {t("screen.screenshot")}
              </PixelButton>
              <PixelButton
                variant={isRecording ? "danger" : "ghost"}
                icon={isRecording ? "stop" : "play"}
                onClick={() => setIsRecording(!isRecording)}
                disabled={!isConnected}
              >
                {isRecording ? t("screen.stopRec") : t("screen.startRec")}
              </PixelButton>
              <PixelButton
                variant="ghost"
                icon="refresh"
                disabled={!isConnected}
              >
                REFRESH
              </PixelButton>
            </div>
          </PixelPanel>

          <PixelPanel title={t("screen.displayInfo")}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <InfoRow label={t("screen.resolution")} value="240x240" />
              <InfoRow label={t("screen.colorFormat")} value="RGB565" />
              <InfoRow label={t("screen.controller")} value="ST7789V" />
              <InfoRow label={t("screen.interface")} value="SPI 4-wire" />
              <InfoRow label={t("screen.refreshRate")} value="~60Hz" />
              <InfoRow label={t("screen.status")} value={isConnected ? t("screen.active") : t("screen.idle")} />
            </div>
            <div className="callout info" style={{ marginTop: "0.6rem", fontSize: "0.65rem" }}>
              <Icon name="info" size={12} style={{ display: "inline", marginRight: "0.3rem" }} />
              {t("screen.frameInfo")}
            </div>
          </PixelPanel>
        </div>
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span className="font-term text-dim" style={{ fontSize: "0.72rem" }}>{label}</span>
    <span className="font-mono text-ink" style={{ fontSize: "0.72rem" }}>{value}</span>
  </div>
);
