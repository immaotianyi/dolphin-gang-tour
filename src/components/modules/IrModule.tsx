/** IR 模块 — 红外学习/发射 + 遥控面板 */
import React, { useState, useRef, useEffect } from "react";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Icon } from "@/components/ui/Icon";
import { useTranslation } from "react-i18next";

interface IrSignal {
  id: number;
  name: string;
  protocol: string;
  frequency: number;
  rawData: string;
  timestamp: number;
}

const PROTOCOLS = [
  { name: "NEC", bits: 32, freq: 38000, color: "orange" },
  { name: "RC5", bits: 12, freq: 36000, color: "cyan" },
  { name: "SIRC", bits: 12, freq: 40000, color: "green" },
  { name: "Pioneer", bits: 32, freq: 40000, color: "yellow" },
  { name: "Raw", bits: 0, freq: 38000, color: "dim" },
];

const REMOTE_PRESETS = [
  { name: "TV Power", brand: "Samsung", protocol: "NEC", code: "0xE0E040BF", icon: "power" },
  { name: "TV Vol+", brand: "LG", protocol: "NEC", code: "0x20DF10EF", icon: "plus" },
  { name: "TV Vol-", brand: "LG", protocol: "NEC", code: "0x20DFC03F", icon: "minus" },
  { name: "AC Cool", brand: "Midea", protocol: "Raw", code: "raw:1024", icon: "bolt" },
  { name: "Set-Top Box OK", brand: "Generic", protocol: "NEC", code: "0x00FF38C7", icon: "check" },
  { name: "DVD Play", brand: "Sony", protocol: "SIRC", code: "0x0757", icon: "play" },
];

const MOCK_HISTORY: IrSignal[] = [
  { id: 1, name: "TV Power", protocol: "NEC", frequency: 38000, rawData: "0xE0E040BF", timestamp: Date.now() - 60000 },
  { id: 2, name: "Unknown Signal", protocol: "Raw", frequency: 38000, rawData: "raw:512", timestamp: Date.now() - 120000 },
];

export const IrModule: React.FC = () => {
  const { t } = useTranslation();
  const [isLearning, setIsLearning] = useState(false);
  const [learnProgress, setLearnProgress] = useState(0);
  const [history, setHistory] = useState<IrSignal[]>(MOCK_HISTORY);
  const [selectedSignal, setSelectedSignal] = useState<IrSignal | null>(null);
  const [transmitting, setTransmitting] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startLearn = () => {
    setIsLearning(true);
    setLearnProgress(0);
    timerRef.current = setInterval(() => {
      setLearnProgress((p) => {
        if (p >= 100) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsLearning(false);
          const newSignal: IrSignal = {
            id: Date.now(),
            name: `Signal ${history.length + 1}`,
            protocol: PROTOCOLS[Math.floor(Math.random() * 3)].name,
            frequency: 38000,
            rawData: `0x${Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, "0")}`,
            timestamp: Date.now(),
          };
          setHistory((prev) => [newSignal, ...prev]);
          setSelectedSignal(newSignal);
          return 0;
        }
        return p + 5;
      });
    }, 80);
  };

  const stopLearn = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsLearning(false);
    setLearnProgress(0);
  };

  const transmit = (signal: IrSignal | typeof REMOTE_PRESETS[0]) => {
    const id = "id" in signal ? signal.id : Date.now();
    setTransmitting(id);
    setTimeout(() => setTransmitting(null), 1000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <PixelPanel>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0" }}>
          <div style={{
            width: 48, height: 48,
            background: "var(--c-bg3)",
            border: "2px solid var(--c-orange)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "var(--shadow-glow-orange)",
          }}>
            <Icon name="ir" size={28} style={{ color: "var(--c-orange)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="font-pixel text-orange" style={{ fontSize: "1.1rem" }}>{t("ir.title")}</div>
            <div className="font-term text-dim" style={{ fontSize: "0.8rem" }}>{t("ir.subtitle")}</div>
          </div>
          <div style={{ display: "flex", gap: "0.8rem" }}>
            <div style={{ textAlign: "center" }}>
              <div className="font-pixel text-orange" style={{ fontSize: "1rem" }}>{history.length}</div>
              <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{t("ir.captured")}</div>
            </div>
          </div>
        </div>
      </PixelPanel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Learn section */}
        <PixelPanel title={t("ir.learnMode")}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "1rem 0" }}>
            {/* IR receiver visualization */}
            <div style={{
              width: 120, height: 120,
              position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {/* Pulse rings */}
              {isLearning && [0, 1, 2].map((i) => (
                <div key={i} style={{
                  position: "absolute",
                  width: 120, height: 120,
                  border: `2px solid var(--c-orange)`,
                  borderRadius: "50%",
                  opacity: 0,
                  animation: `ir-pulse 1.5s ease-out ${i * 0.5}s infinite`,
                }} />
              ))}
              <div style={{
                width: 64, height: 64,
                background: isLearning ? "var(--c-orange)" : "var(--c-bg3)",
                border: `2px solid ${isLearning ? "var(--c-orange)" : "var(--c-rule)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: isLearning ? "0 0 20px var(--c-orange)" : "none",
                transition: "all 0.3s var(--ease-apple)",
                zIndex: 1,
              }}>
                <Icon name="ir" size={32} style={{ color: isLearning ? "var(--c-bg)" : "var(--c-dim)" }} />
              </div>
            </div>

            {isLearning ? (
              <>
                <div className="font-pixel text-orange" style={{ fontSize: "0.85rem", animation: "blink 1s step-end infinite" }}>
                  {t("ir.aimRemote")}
                </div>
                <div className="pixel-progress" style={{ width: "100%" }}>
                  <div className="pixel-progress-fill" style={{ width: `${learnProgress}%` }} />
                </div>
                <PixelButton variant="danger" onClick={stopLearn} icon="stop">
                  {t("ir.cancel")}
                </PixelButton>
              </>
            ) : (
              <>
                <div className="font-term text-dim" style={{ fontSize: "0.78rem", textAlign: "center" }}>
                  {t("ir.learnHint")}
                </div>
                <PixelButton variant="primary" onClick={startLearn} icon="bolt">
                  {t("ir.startLearning")}
                </PixelButton>
              </>
            )}
          </div>
        </PixelPanel>

        {/* Remote presets */}
        <PixelPanel title={t("ir.quickRemotes")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
            {REMOTE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => transmit(preset)}
                disabled={transmitting !== null}
                style={{
                  padding: "0.6rem 0.5rem",
                  background: transmitting === Date.now() ? "var(--c-orange)" : "var(--c-bg2)",
                  border: `2px solid ${transmitting !== null ? "var(--c-orange)" : "var(--c-rule)"}`,
                  cursor: transmitting !== null ? "wait" : "pointer",
                  transition: "all 0.2s var(--ease-apple)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                  alignItems: "center",
                  opacity: transmitting !== null && transmitting !== Date.now() ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (transmitting === null) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "var(--shadow-hard-sm)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <Icon name={preset.icon as any} size={18} style={{ color: "var(--c-orange)" }} />
                <span className="font-pixel text-ink" style={{ fontSize: "0.65rem" }}>{preset.name}</span>
                <span className="font-mono text-muted" style={{ fontSize: "0.55rem" }}>{preset.brand}</span>
              </button>
            ))}
          </div>
          <div className="callout warn" style={{ marginTop: "0.6rem", fontSize: "0.7rem" }}>
            <Icon name="warning" size={12} style={{ display: "inline", marginRight: "0.3rem" }} />
            {t("ir.transmitRange")}
          </div>
        </PixelPanel>
      </div>

      {/* Signal history */}
      <PixelPanel title={t("ir.capturedSignals")}>
        {history.length === 0 ? (
          <div className="font-term text-dim" style={{ textAlign: "center", padding: "2rem", fontSize: "0.8rem" }}>
            {t("ir.noSignals")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {history.map((signal) => {
              const proto = PROTOCOLS.find((p) => p.name === signal.protocol);
              const age = Date.now() - signal.timestamp;
              const ageStr = age < 60000 ? `${Math.floor(age / 1000)}s ago` : `${Math.floor(age / 60000)}m ago`;
              return (
                <div
                  key={signal.id}
                  onClick={() => setSelectedSignal(signal)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem 0.6rem",
                    background: selectedSignal?.id === signal.id ? "var(--c-bg3)" : "var(--c-bg)",
                    border: `1px solid ${selectedSignal?.id === signal.id ? "var(--c-orange)" : "var(--c-rule)"}`,
                    cursor: "pointer",
                    transition: "all 0.2s var(--ease-apple)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--c-orange)";
                  }}
                  onMouseLeave={(e) => {
                    if (selectedSignal?.id !== signal.id) e.currentTarget.style.borderColor = "var(--c-rule)";
                  }}
                >
                  <span className={`pixel-badge pixel-badge-${proto?.color || "dim"}`} style={{ fontSize: "0.55rem" }}>
                    {signal.protocol}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="font-term text-ink" style={{ fontSize: "0.78rem" }}>{signal.name}</div>
                    <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>
                      {(signal.frequency / 1000).toFixed(0)}kHz · {signal.rawData}
                    </div>
                  </div>
                  <span className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{ageStr}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); transmit(signal); }}
                    disabled={transmitting !== null}
                    style={{
                      width: 28, height: 28,
                      background: transmitting === signal.id ? "var(--c-green)" : "var(--c-bg3)",
                      border: `1px solid ${transmitting === signal.id ? "var(--c-green)" : "var(--c-rule)"}`,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s var(--ease-apple)",
                      padding: 0,
                    }}
                  >
                    <Icon name={transmitting === signal.id ? "check" : "play"} size={12} style={{ color: transmitting === signal.id ? "var(--c-bg)" : "var(--c-green)" }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PixelPanel>
    </div>
  );
};
