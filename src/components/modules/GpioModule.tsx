/** GPIO 模块 — 引脚可视化 + 面包板仿真 */
import React, { useState } from "react";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Icon } from "@/components/ui/Icon";
import { useTranslation } from "react-i18next";

interface PinConfig {
  id: number;
  name: string;
  signal: string;
  direction: "input" | "output" | "disabled";
  value: boolean;
  voltage: number;
}

const INITIAL_PINS: PinConfig[] = [
  { id: 1, name: "GPIO1", signal: "ADC1_CH0", direction: "input", value: false, voltage: 0 },
  { id: 2, name: "GPIO2", signal: "ADC1_CH1", direction: "input", value: false, voltage: 0 },
  { id: 3, name: "GPIO3", signal: "UART_TX", direction: "output", value: false, voltage: 0 },
  { id: 4, name: "GPIO4", signal: "UART_RX", direction: "input", value: false, voltage: 0 },
  { id: 5, name: "GPIO5", signal: "I2C_SCL", direction: "output", value: false, voltage: 0 },
  { id: 6, name: "GPIO6", signal: "I2C_SDA", direction: "disabled", value: false, voltage: 0 },
];

const MODULE_TEMPLATES = [
  { name: "LED", pins: 1, voltage: "3.3V", current: "20mA", safe: true, icon: "bolt" },
  { name: "Button", pins: 1, voltage: "3.3V", current: "0.1mA", safe: true, icon: "check" },
  { name: "DHT11", pins: 1, voltage: "3.3V", current: "1mA", safe: true, icon: "info" },
  { name: "Servo", pins: 1, voltage: "5V", current: "200mA", safe: false, icon: "warning" },
  { name: "Relay", pins: 1, voltage: "5V", current: "70mA", safe: false, icon: "warning" },
  { name: "Buzzer", pins: 1, voltage: "5V", current: "30mA", safe: false, icon: "warning" },
];

export const GpioModule: React.FC = () => {
  const { t } = useTranslation();
  const [pins, setPins] = useState<PinConfig[]>(INITIAL_PINS);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  const togglePin = (id: number) => {
    setPins((prev) => prev.map((p) =>
      p.id === id && p.direction === "output"
        ? { ...p, value: !p.value, voltage: !p.value ? 3.3 : 0 }
        : p
    ));
  };

  const setDirection = (id: number, dir: PinConfig["direction"]) => {
    setPins((prev) => prev.map((p) =>
      p.id === id ? { ...p, direction: dir, value: false, voltage: 0 } : p
    ));
  };

  const activePins = pins.filter((p) => p.direction !== "disabled").length;
  const outputHigh = pins.filter((p) => p.direction === "output" && p.value).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <PixelPanel>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0" }}>
          <div style={{
            width: 48, height: 48,
            background: "var(--c-bg3)",
            border: "2px solid var(--c-green)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "var(--shadow-glow-green)",
          }}>
            <Icon name="circuit" size={28} style={{ color: "var(--c-green)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="font-pixel text-green" style={{ fontSize: "1.1rem" }}>{t("gpio.title")}</div>
            <div className="font-term text-dim" style={{ fontSize: "0.8rem" }}>{t("gpio.subtitle")}</div>
          </div>
          <div style={{ display: "flex", gap: "0.8rem" }}>
            <div style={{ textAlign: "center" }}>
              <div className="font-pixel text-green" style={{ fontSize: "1rem" }}>{activePins}</div>
              <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{t("gpio.active")}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="font-pixel text-orange" style={{ fontSize: "1rem" }}>{outputHigh}</div>
              <div className="font-mono text-muted" style={{ fontSize: "0.6rem" }}>{t("gpio.high")}</div>
            </div>
          </div>
        </div>
      </PixelPanel>

      {/* Pin visualizer */}
      <PixelPanel title={t("gpio.pinLayout")}>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", padding: "1rem 0" }}>
          {/* Pin connector visualization */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.3rem",
            padding: "0.8rem",
            background: "var(--c-bg3)",
            border: "2px solid var(--c-rule)",
          }}>
            {/* VCC pin */}
            <PinRow
              pin={{ id: 0, name: "3.3V", signal: "POWER", direction: "output", value: true, voltage: 3.3 }}
              isPower
              onToggle={() => {}}
              onSetDir={() => {}}
            />
            {pins.map((pin) => (
              <PinRow
                key={pin.id}
                pin={pin}
                onToggle={togglePin}
                onSetDir={setDirection}
              />
            ))}
            {/* GND pin */}
            <PinRow
              pin={{ id: 7, name: "GND", signal: "GROUND", direction: "input", value: false, voltage: 0 }}
              isGround
              onToggle={() => {}}
              onSetDir={() => {}}
            />
          </div>
        </div>
      </PixelPanel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Module templates */}
        <PixelPanel title={t("gpio.quickConnect")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
            {MODULE_TEMPLATES.map((mod) => (
              <button
                key={mod.name}
                onClick={() => setSelectedModule(mod.name)}
                style={{
                  padding: "0.5rem",
                  background: selectedModule === mod.name ? "var(--c-bg3)" : "var(--c-bg2)",
                  border: `2px solid ${selectedModule === mod.name ? "var(--c-green)" : mod.safe ? "var(--c-rule)" : "var(--c-yellow)"}`,
                  cursor: "pointer",
                  transition: "all 0.2s var(--ease-apple)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "var(--shadow-hard-sm)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <Icon name={mod.icon as any} size={14} style={{ color: mod.safe ? "var(--c-green)" : "var(--c-yellow)" }} />
                  <span className="font-pixel text-ink" style={{ fontSize: "0.7rem" }}>{mod.name}</span>
                </div>
                <span className="font-mono text-muted" style={{ fontSize: "0.62rem" }}>
                  {mod.voltage} · {mod.current}
                </span>
                {!mod.safe && (
                  <span className="pixel-badge pixel-badge-warn" style={{ fontSize: "0.5rem" }}>{t("gpio.needsDriver")}</span>
                )}
              </button>
            ))}
          </div>
        </PixelPanel>

        {/* Safety info */}
        <PixelPanel title={t("gpio.safetyInfo")}>
          <div className="callout warn" style={{ margin: "0 0 0.6rem 0" }}>
            {t("gpio.txbLimitation")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <SafetyRow icon="check" color="green" text="Logic level signals (3.3V/5V digital)" />
            <SafetyRow icon="check" color="green" text="UART, SPI, I2C communication" />
            <SafetyRow icon="check" color="green" text="ADC voltage sampling" />
            <SafetyRow icon="check" color="green" text="LED indicators (< 5mA)" />
            <SafetyRow icon="cross" color="red" text="Relays, motors, solenoids" />
            <SafetyRow icon="cross" color="red" text="High-power LEDs (> 5mA)" />
            <SafetyRow icon="cross" color="red" text="Buzzers, speakers" />
            <SafetyRow icon="cross" color="red" text="Long wire runs (> 30cm)" />
          </div>
          <div className="callout info" style={{ marginTop: "0.6rem" }}>
            <Icon name="shield" size={14} style={{ display: "inline", marginRight: "0.3rem", color: "var(--c-cyan)" }} />
            {t("gpio.protectedBy")}
          </div>
        </PixelPanel>
      </div>
    </div>
  );
};

const PinRow: React.FC<{
  pin: PinConfig;
  isPower?: boolean;
  isGround?: boolean;
  onToggle: (id: number) => void;
  onSetDir: (id: number, dir: PinConfig["direction"]) => void;
}> = ({ pin, isPower, isGround, onToggle, onSetDir }) => {
  const isSpecial = isPower || isGround;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.3rem 0.5rem",
      background: "var(--c-bg)",
      border: `1px solid ${
        isPower ? "var(--c-red)" :
        isGround ? "var(--c-muted)" :
        pin.value ? "var(--c-green)" : "var(--c-rule)"
      }`,
      minWidth: 280,
    }}>
      {/* Pin number */}
      <div style={{
        width: 24, height: 24,
        background: "var(--c-bg3)",
        border: "1px solid var(--c-rule)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-pixel)",
        fontSize: "0.6rem",
        color: "var(--c-orange)",
        flexShrink: 0,
      }}>
        {isPower ? "V" : isGround ? "G" : pin.id}
      </div>

      {/* Pin info */}
      <div style={{ flex: 1 }}>
        <div className="font-term" style={{
          fontSize: "0.75rem",
          color: isPower ? "var(--c-red)" : isGround ? "var(--c-muted)" : "var(--c-ink)",
        }}>
          {pin.name}
        </div>
        <div className="font-mono text-muted" style={{ fontSize: "0.62rem" }}>{pin.signal}</div>
      </div>

      {/* Direction selector */}
      {!isSpecial && (
        <select
          value={pin.direction}
          onChange={(e) => onSetDir(pin.id, e.target.value as PinConfig["direction"])}
          style={{
            background: "var(--c-bg3)",
            color: "var(--c-ink)",
            border: "1px solid var(--c-rule)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.62rem",
            padding: "0.15rem 0.3rem",
            cursor: "pointer",
          }}
        >
          <option value="input">IN</option>
          <option value="output">OUT</option>
          <option value="disabled">OFF</option>
        </select>
      )}

      {/* Value toggle */}
      {!isSpecial && pin.direction === "output" && (
        <button
          onClick={() => onToggle(pin.id)}
          style={{
            width: 32, height: 20,
            background: pin.value ? "var(--c-green)" : "var(--c-bg4)",
            border: `1px solid ${pin.value ? "var(--c-green)" : "var(--c-rule)"}`,
            cursor: "pointer",
            padding: 0,
            transition: "all 0.2s var(--ease-apple)",
            boxShadow: pin.value ? "0 0 6px var(--c-green)" : "none",
          }}
        >
          <span className="font-pixel" style={{
            fontSize: "0.55rem",
            color: pin.value ? "var(--c-bg)" : "var(--c-muted)",
          }}>
            {pin.value ? "HI" : "LO"}
          </span>
        </button>
      )}

      {/* Voltage display */}
      {!isSpecial && (
        <span className="font-mono" style={{
          fontSize: "0.62rem",
          color: pin.value ? "var(--c-green)" : "var(--c-muted)",
          minWidth: 36,
          textAlign: "right",
        }}>
          {pin.voltage.toFixed(1)}V
        </span>
      )}

      {/* Power/Ground indicator */}
      {isSpecial && (
        <span className={`led ${isPower ? "red" : ""}`} style={{ flexShrink: 0 }} />
      )}
    </div>
  );
};

const SafetyRow: React.FC<{ icon: string; color: string; text: string }> = ({ icon, color, text }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
    <Icon name={icon as any} size={12} style={{ color: `var(--c-${color})`, flexShrink: 0 }} />
    <span className="font-term text-dim" style={{ fontSize: "0.75rem" }}>{text}</span>
  </div>
);
