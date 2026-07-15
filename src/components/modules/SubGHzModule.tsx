/** SubGHz 模块 — 频谱瀑布流 Canvas + 信号列表 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Icon } from "@/components/ui/Icon";
import { invoke, onEvent } from "@/lib/tauri";
import { useTranslation } from "react-i18next";

interface Signal {
  frequency: number;
  rssi: number;
  modulation: string;
  timestamp: number;
}

const FREQ_BANDS = [
  { name: "300-348 MHz", start: 300_000_000, end: 348_000_000, color: "var(--c-cyan)" },
  { name: "387-464 MHz", start: 387_000_000, end: 464_000_000, color: "var(--c-orange)" },
  { name: "779-928 MHz", start: 779_000_000, end: 928_000_000, color: "var(--c-purple)" },
];

const KNOWN_PROTOCOLS: { freq: number; name: string; desc: string }[] = [
  { freq: 433920000, name: "PT2262/EV1527", desc: "Wireless doorbell / remote control" },
  { freq: 315000000, name: "Car Keyless", desc: "Vehicle remote entry system" },
  { freq: 868350000, name: "EU ISM", desc: "European Industrial/Scientific/Medical" },
  { freq: 915000000, name: "US ISM", desc: "North American ISM band" },
  { freq: 433075000, name: "KeeLoq", desc: "Rolling code remote (encrypted)" },
];

export const SubGHzModule: React.FC = () => {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [selectedBand, setSelectedBand] = useState(0);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [rssiHistory, setRssiHistory] = useState<number[]>(new Array(120).fill(-100));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // 监听 SubGHz 信号事件
  useEffect(() => {
    (async () => {
      unlistenRef.current = await onEvent<Signal>("subghz_signal", (sig) => {
        setSignals((prev) => [sig, ...prev].slice(0, 50));
        setRssiHistory((prev) => [...prev.slice(1), sig.rssi]);
      });
    })();
    return () => unlistenRef.current?.();
  }, []);

  // 模拟扫描时持续生成数据
  useEffect(() => {
    if (!scanning) return;
    const timer = setInterval(() => {
      const band = FREQ_BANDS[selectedBand];
      const freq = band.start + Math.random() * (band.end - band.start);
      const rssi = -40 - Math.random() * 60;
      const mod = ["OOK", "2FSK", "ASK"][Math.floor(Math.random() * 3)];
      setSignals((prev) => [{ frequency: Math.round(freq), rssi: Math.round(rssi), modulation: mod, timestamp: Date.now() }, ...prev].slice(0, 50));
      setRssiHistory((prev) => [...prev.slice(1), Math.round(rssi)]);
    }, 200);
    return () => clearInterval(timer);
  }, [scanning, selectedBand]);

  // 绘制瀑布流
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#07090F";
    ctx.fillRect(0, 0, w, h);

    // 绘制频谱柱状图
    const barWidth = w / rssiHistory.length;
    rssiHistory.forEach((rssi, i) => {
      const normalized = Math.max(0, Math.min(1, (rssi + 100) / 100));
      const barHeight = normalized * h;
      const hue = rssi > -50 ? "74,222,128" : rssi > -70 ? "250,204,21" : rssi > -85 ? "249,115,22" : "34,211,238";
      ctx.fillStyle = `rgba(${hue}, ${0.3 + normalized * 0.7})`;
      ctx.fillRect(i * barWidth, h - barHeight, barWidth - 1, barHeight);
    });

    // 绘制网格线
    ctx.strokeStyle = "rgba(48,54,61,0.5)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // RSSI 标签
    ctx.fillStyle = "#6E7681";
    ctx.font = "10px monospace";
    ["0dBm", "-25", "-50", "-75", "-100"].forEach((label, i) => {
      ctx.fillText(label, 2, (h / 4) * i + 10);
    });
  }, [rssiHistory]);

  const handleScan = useCallback(async () => {
    if (scanning) {
      setScanning(false);
      return;
    }
    setScanning(true);
    setSignals([]);
    try {
      await invoke("subghz_scan", {
        startFreq: FREQ_BANDS[selectedBand].start,
        endFreq: FREQ_BANDS[selectedBand].end,
      });
    } catch (e) {
      console.error("Scan error:", e);
    }
  }, [scanning, selectedBand]);

  const formatFreq = (hz: number) => {
    if (hz >= 1_000_000) return (hz / 1_000_000).toFixed(3) + " MHz";
    if (hz >= 1_000) return (hz / 1_000).toFixed(0) + " kHz";
    return hz + " Hz";
  };

  const matchProtocol = (freq: number) => {
    return KNOWN_PROTOCOLS.find((p) => Math.abs(p.freq - freq) < 500000);
  };

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
            <Icon name="radio" size={28} style={{ color: "var(--c-orange)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="font-pixel text-orange" style={{ fontSize: "1.1rem" }}>{t("subghz.title")}</div>
            <div className="font-term text-dim" style={{ fontSize: "0.8rem" }}>{t("subghz.subtitle")}</div>
          </div>
          <PixelButton
            variant={scanning ? "danger" : "primary"}
            icon={<Icon name={scanning ? "stop" : "search"} size={14} />}
            onClick={handleScan}
          >
            {scanning ? t("common.stop") : t("subghz.scan")}
          </PixelButton>
        </div>
      </PixelPanel>

      {/* Compliance notice */}
      <div style={{
        padding: "0.5rem 0.7rem",
        background: "rgba(250,204,21,0.06)",
        border: "1px solid var(--c-yellow)",
        display: "flex", alignItems: "flex-start", gap: "0.5rem",
      }}>
        <Icon name="warning" size={14} style={{ color: "var(--c-yellow)", marginTop: 2, minWidth: 14 }} />
        <div style={{ fontSize: "0.7rem", color: "var(--c-yellow)", lineHeight: 1.5 }}>
          <strong>{t("subghz.radioCompliance")}</strong> {t("subghz.complianceText")}
        </div>
      </div>

      {/* Frequency band selector */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {FREQ_BANDS.map((band, i) => (
          <button
            key={i}
            onClick={() => setSelectedBand(i)}
            style={{
              flex: 1,
              padding: "0.5rem",
              background: selectedBand === i ? "var(--c-bg3)" : "var(--c-bg2)",
              border: `2px solid ${selectedBand === i ? band.color : "var(--c-rule)"}`,
              color: selectedBand === i ? band.color : "var(--c-dim)",
              fontFamily: "var(--font-pixel)",
              fontSize: "0.65rem",
              cursor: "pointer",
              transition: "all 0.2s var(--ease-apple)",
              letterSpacing: "0.05em",
            }}
          >
            {band.name}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
        {/* Waterfall / Spectrum */}
        <PixelPanel title={t("subghz.spectrumAnalyzer")}>
          <div style={{ position: "relative" }}>
            <canvas
              ref={canvasRef}
              width={500}
              height={200}
              style={{
                width: "100%",
                height: 200,
                imageRendering: "pixelated",
                border: "2px solid var(--c-rule)",
                background: "#07090F",
              }}
            />
            {/* Status overlay */}
            <div style={{
              position: "absolute",
              top: 8, right: 8,
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              background: "rgba(7,9,15,0.8)",
              padding: "0.2rem 0.4rem",
              border: "1px solid var(--c-rule)",
            }}>
              <span className={`led ${scanning ? "green blink" : "red"}`} />
              <span className="font-mono" style={{ fontSize: "0.65rem", color: scanning ? "var(--c-green)" : "var(--c-red)" }}>
                {scanning ? t("subghz.live") : t("subghz.idle")}
              </span>
            </div>
          </div>
          {/* Frequency axis */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.3rem" }}>
            <span className="font-mono text-muted" style={{ fontSize: "0.62rem" }}>
              {formatFreq(FREQ_BANDS[selectedBand].start)}
            </span>
            <span className="font-mono text-muted" style={{ fontSize: "0.62rem" }}>
              {formatFreq(FREQ_BANDS[selectedBand].end)}
            </span>
          </div>
        </PixelPanel>

        {/* Signal stats */}
        <PixelPanel title={t("subghz.stats")}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <StatRow label={t("common.status")} value={scanning ? t("common.scanning") : t("common.idle")} color={scanning ? "var(--c-green)" : "var(--c-muted)"} />
            <StatRow label={t("subghz.band")} value={FREQ_BANDS[selectedBand].name} />
            <StatRow label={t("subghz.signals")} value={signals.length.toString()} color="var(--c-cyan)" />
            <StatRow label={t("subghz.peakRssi")} value={signals.length > 0 ? `${Math.max(...signals.map((s) => s.rssi))} dBm` : "N/A"} color="var(--c-orange)" />
            <StatRow label={t("subghz.modulations")} value={[...new Set(signals.map((s) => s.modulation))].join(", ") || "N/A"} />
          </div>
        </PixelPanel>
      </div>

      {/* Signal list */}
      <PixelPanel title={t("subghz.capturedSignals")}>
        {signals.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <Icon name="radio" size={48} style={{ color: "var(--c-muted)", opacity: 0.3 }} />
            <div className="font-term text-muted" style={{ fontSize: "0.82rem", marginTop: "0.5rem" }}>
              {scanning ? t("subghz.listening") : t("subghz.noSignals")}
            </div>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 300, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("subghz.freq")}</th>
                  <th>RSSI</th>
                  <th>{t("subghz.mod")}</th>
                  <th>{t("subghz.protocol")}</th>
                  <th>{t("common.time")}</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((sig, i) => {
                  const proto = matchProtocol(sig.frequency);
                  return (
                    <tr key={i} style={{ animation: "slide-in-up 0.2s var(--ease-apple)" }}>
                      <td><code>{formatFreq(sig.frequency)}</code></td>
                      <td style={{ color: sig.rssi > -50 ? "var(--c-green)" : sig.rssi > -70 ? "var(--c-yellow)" : "var(--c-dim)" }}>
                        {sig.rssi} dBm
                      </td>
                      <td><span className="pixel-badge pixel-badge-info">{sig.modulation}</span></td>
                      <td>
                        {proto ? (
                          <span className="pixel-badge pixel-badge-ok" title={proto.desc}>{proto.name}</span>
                        ) : (
                          <span className="font-mono text-muted" style={{ fontSize: "0.75rem" }}>{t("common.unknown")}</span>
                        )}
                      </td>
                      <td className="font-mono text-muted" style={{ fontSize: "0.72rem" }}>
                        {new Date(sig.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PixelPanel>

      {/* Compliance warning */}
      <div className="callout warn">
        <Icon name="warning" size={14} style={{ color: "var(--c-yellow)", display: "inline", marginRight: "0.3rem" }} />
        <strong>{t("subghz.complianceNotice")}</strong> {t("subghz.complianceNoticeText")}
      </div>
    </div>
  );
};

const StatRow: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.3rem 0.5rem",
    background: "var(--c-bg3)",
    border: "1px solid var(--c-rule)",
  }}>
    <span className="font-term text-dim" style={{ fontSize: "0.75rem" }}>{label}</span>
    <span className="font-mono" style={{ fontSize: "0.75rem", color: color || "var(--c-ink)" }}>{value}</span>
  </div>
);
