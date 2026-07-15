/** NFC 模块 — 扫描动画 + 卡片信息结构化展示 */
import React, { useState, useEffect, useRef } from "react";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Icon } from "@/components/ui/Icon";
import { invoke } from "@/lib/tauri";
import { useTranslation } from "react-i18next";

interface NfcCard {
  uid: string;
  type: string;
  manufacturer: string;
  rssi: number;
  atqa?: string;
  sak?: string;
}

const KNOWN_CARDS: Record<string, { desc: string; icon: string }> = {
  "NTAG213": { desc: "NFC Forum Type 2 Tag, 144 bytes user memory", icon: "tag" },
  "NTAG215": { desc: "Amiibo compatible, 504 bytes user memory", icon: "star" },
  "NTAG216": { desc: "NFC Forum Type 2 Tag, 888 bytes user memory", icon: "tag" },
  "Mifare Classic 1K": { desc: "1KB memory, 16 sectors × 4 blocks", icon: "lock" },
  "Mifare Classic 4K": { desc: "4KB memory, 40 sectors", icon: "lock" },
  "Mifare Ultralight": { desc: "512 bit EEPROM, no encryption", icon: "unlock" },
  "FeliCa": { desc: "Sony contactless IC card", icon: "bolt" },
};

export const NfcModule: React.FC = () => {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [card, setCard] = useState<NfcCard | null>(null);
  const [history, setHistory] = useState<NfcCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setCard(null);

    // 模拟扫描延迟（2秒动画）
    scanTimerRef.current = window.setTimeout(async () => {
      try {
        const result = await invoke<NfcCard>("nfc_detect");
        setCard(result);
        setHistory((prev) => [result, ...prev].slice(0, 10));
      } catch (e) {
        setError(String(e));
      } finally {
        setScanning(false);
      }
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, []);

  const knownInfo = card ? KNOWN_CARDS[card.type] : null;
  const uidBytes = card?.uid.split(":").map((h) => parseInt(h, 16)) || [];

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
            <Icon name="nfc" size={28} style={{ color: "var(--c-cyan)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="font-pixel text-cyan" style={{ fontSize: "1.1rem" }}>{t("nfc.title")}</div>
            <div className="font-term text-dim" style={{ fontSize: "0.8rem" }}>{t("nfc.subtitle")}</div>
          </div>
          <PixelButton
            variant="primary"
            icon={<Icon name="search" size={14} />}
            onClick={handleScan}
            disabled={scanning}
          >
            {scanning ? t("nfc.scanning") : t("nfc.scan")}
          </PixelButton>
        </div>
      </PixelPanel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Scan visualization */}
        <PixelPanel title={t("nfc.antenna")}>
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 280,
            position: "relative",
          }}>
            {/* NFC antenna animation */}
            <div style={{
              width: 180,
              height: 180,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {/* Concentric rings */}
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    width: 180 - i * 40,
                    height: 180 - i * 40,
                    border: `2px solid var(--c-cyan)`,
                    opacity: scanning ? 0.8 - i * 0.15 : 0.2,
                    transition: "opacity 0.3s var(--ease-apple)",
                    animation: scanning ? `pulse-border ${1 + i * 0.3}s ease-in-out infinite` : "none",
                  }}
                />
              ))}
              {/* Center icon */}
              <div style={{
                width: 60, height: 60,
                background: "var(--c-bg3)",
                border: `2px solid ${scanning ? "var(--c-cyan)" : "var(--c-rule)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.3s var(--ease-apple)",
              }}>
                <Icon
                  name={scanning ? "nfc" : card ? "check" : "nfc"}
                  size={32}
                  style={{ color: scanning ? "var(--c-cyan)" : card ? "var(--c-green)" : "var(--c-muted)" }}
                />
              </div>
            </div>

            {/* Status text */}
            <div style={{ marginTop: "1rem", textAlign: "center" }}>
              {scanning ? (
                <div className="font-pixel text-cyan" style={{ fontSize: "0.7rem", animation: "blink 1s step-end infinite" }}>
                  {t("nfc.placeCard")}
                </div>
              ) : card ? (
                <div className="font-pixel text-green" style={{ fontSize: "0.7rem" }}>
                  {t("nfc.cardDetected")}
                </div>
              ) : (
                <div className="font-pixel text-muted" style={{ fontSize: "0.7rem" }}>
                  {t("nfc.readyToScan")}
                </div>
              )}
            </div>

            {/* RSSI meter */}
            {card && (
              <div style={{ width: "100%", marginTop: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                  <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>RSSI</span>
                  <span className="font-mono text-cyan" style={{ fontSize: "0.65rem" }}>{card.rssi} dBm</span>
                </div>
                <div className="pixel-progress" style={{ height: 6 }}>
                  <div className="pixel-progress-fill" style={{
                    width: `${Math.max(0, Math.min(100, (card.rssi + 100) * 1.5))}%`,
                    background: card.rssi > -50 ? "var(--c-green)" : card.rssi > -70 ? "var(--c-yellow)" : "var(--c-red)",
                  }} />
                </div>
              </div>
            )}
          </div>
        </PixelPanel>

        {/* Card info */}
        <PixelPanel title={t("nfc.cardInfo")}>
          {error ? (
            <div className="callout danger" style={{ margin: 0 }}>
              <strong>Error:</strong> {error}
            </div>
          ) : card ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", animation: "slide-in-up 0.3s var(--ease-apple)" }}>
              {/* Card type banner */}
              <div style={{
                background: "var(--c-bg3)",
                border: `2px solid var(--c-cyan)`,
                padding: "0.6rem 0.8rem",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
              }}>
                <Icon name={knownInfo?.icon as any || "nfc"} size={20} style={{ color: "var(--c-cyan)" }} />
                <div>
                  <div className="font-pixel text-ink" style={{ fontSize: "0.85rem" }}>{card.type}</div>
                  {knownInfo && (
                    <div className="font-mono text-muted" style={{ fontSize: "0.7rem" }}>{knownInfo.desc}</div>
                  )}
                </div>
              </div>

              {/* UID display */}
              <InfoRow label={t("nfc.uid")} value={card.uid} mono accent />
              <InfoRow label={t("nfc.uidBytes")} value={uidBytes.map((b) => "0x" + b.toString(16).toUpperCase().padStart(2, "0")).join(" ")} mono />
              <InfoRow label={t("nfc.manufacturer")} value={card.manufacturer} />
              <InfoRow label={t("nfc.signal")} value={`${card.rssi} dBm`} />

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
                <PixelButton variant="ghost" icon={<Icon name="download" size={12} />} style={{ fontSize: "0.7rem" }}>
                  {t("nfc.save")}
                </PixelButton>
                <PixelButton variant="ghost" icon={<Icon name="upload" size={12} />} style={{ fontSize: "0.7rem" }}>
                  {t("nfc.write")}
                </PixelButton>
                <PixelButton variant="ghost" icon={<Icon name="refresh" size={12} />} style={{ fontSize: "0.7rem" }} onClick={handleScan}>
                  {t("nfc.rescan")}
                </PixelButton>
              </div>
            </div>
          ) : (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 200,
              gap: "0.5rem",
            }}>
              <Icon name="nfc" size={48} style={{ color: "var(--c-muted)", opacity: 0.3 }} />
              <div className="font-term text-muted" style={{ fontSize: "0.82rem" }}>{t("nfc.noCardScanned")}</div>
              <div className="font-mono text-muted" style={{ fontSize: "0.7rem" }}>{t("nfc.noCardHint")}</div>
            </div>
          )}
        </PixelPanel>
      </div>

      {/* History */}
      {history.length > 0 && (
        <PixelPanel title={t("nfc.scanHistory")}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {history.map((h, i) => (
              <div
                key={i}
                className="pixel-card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.4rem 0.6rem",
                  cursor: "pointer",
                  animation: "slide-in-up 0.2s var(--ease-apple)",
                }}
                onClick={() => setCard(h)}
              >
                <span className={`led ${i === 0 ? "green" : "cyan"}`} style={{ flexShrink: 0 }} />
                <span className="font-mono text-ink" style={{ fontSize: "0.78rem", flex: 1 }}>{h.uid}</span>
                <span className="font-term text-dim" style={{ fontSize: "0.72rem" }}>{h.type}</span>
                <span className="font-mono text-muted" style={{ fontSize: "0.68rem" }}>{h.rssi}dBm</span>
              </div>
            ))}
          </div>
        </PixelPanel>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean; accent?: boolean }> = ({ label, value, mono, accent }) => (
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.35rem 0.6rem",
    background: "var(--c-bg3)",
    border: "1px solid var(--c-rule)",
  }}>
    <span className="font-term text-dim" style={{ fontSize: "0.75rem" }}>{label}</span>
    <span
      className={mono ? "font-mono" : "font-term"}
      style={{
        fontSize: "0.78rem",
        color: accent ? "var(--c-cyan)" : "var(--c-ink)",
        wordBreak: "break-all",
        textAlign: "right",
      }}
    >
      {value}
    </span>
  </div>
);
