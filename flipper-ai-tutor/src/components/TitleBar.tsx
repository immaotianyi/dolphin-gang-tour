/**
 * 应用顶部标题栏
 * 左侧：LED 指示灯 + 应用标题 "FLIPPER AI TUTOR v1.0"
 * 右侧：连接状态文本 + USB 信息
 * 橙色背景，黑色文字，像素字体
 */
import React from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useDeviceStore } from "@/stores/deviceStore";
import { useUiStore } from "@/stores/uiStore";
import type { DeviceConnectionState } from "@/types";

/** 根据连接状态返回 LED class 与文案 */
function statusInfo(
  state: DeviceConnectionState,
  port: string | null,
): { led: string; text: string; icon: IconName } {
  switch (state) {
    case "connected":
      return { led: "led green", text: "CONNECTED", icon: "usb" };
    case "connecting":
      return { led: "led orange blink", text: "CONNECTING...", icon: "usb" };
    case "dfu_mode":
      return { led: "led red blink", text: "DFU MODE", icon: "chip" };
    case "port_busy":
      return { led: "led red", text: "PORT BUSY", icon: "warning" };
    case "sd_error":
      return { led: "led red", text: "SD ERROR", icon: "sd" };
    case "transferring":
      return { led: "led orange blink", text: "TRANSFERRING", icon: "download" };
    case "no_device":
    default:
      return { led: "led red", text: "NO DEVICE", icon: "usb" };
  }
}

export const TitleBar: React.FC = () => {
  const { connectionState, usbPort, deviceInfo } = useDeviceStore();
  const { setModal } = useUiStore();
  const info = statusInfo(connectionState, usbPort);

  return (
    <header
      style={{
        background: "var(--c-orange)",
        color: "var(--c-black)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 14px",
        borderBottom: "2px solid var(--c-black)",
        boxShadow: "0 2px 0 var(--c-white)",
        flexShrink: 0,
      }}
    >
      {/* 左侧：LED + 标题 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className={info.led} style={{ border: "1.5px solid #000" }} />
        <Icon name="dolphin" size={20} />
        <h1
          className="font-pixel"
          style={{ fontSize: 12, letterSpacing: 1 }}
        >
          FLIPPER AI TUTOR v1.0
        </h1>
      </div>

      {/* 右侧：连接状态 + USB 信息 */}
      <div
        className="font-mono"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name={info.icon} size={16} />
          {info.text}
        </span>
        <span style={{ opacity: 0.85 }}>
          USB: {usbPort ?? "--"}
        </span>
        {deviceInfo && (
          <span style={{ opacity: 0.85 }}>
            FW: {deviceInfo.firmwareVersion}
          </span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Icon name="battery" size={16} />
          {deviceInfo ? `${deviceInfo.batteryLevel}%` : "--"}
        </span>
        <button
          onClick={() => setModal("settings")}
          title="AI 设置"
          style={{
            background: "transparent",
            border: "1.5px solid #000",
            color: "var(--c-black)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 3,
            marginLeft: 4,
          }}
        >
          <Icon name="settings" size={16} />
        </button>
      </div>
    </header>
  );
};

export default TitleBar;
