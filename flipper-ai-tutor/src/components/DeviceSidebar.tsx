/**
 * 左侧设备状态面板
 * - 顶部：设备图标(Icon dolphin)动画 + 设备名 + 连接状态 LED
 * - Flipper 屏幕镜像预览框（.flipper-screen，模拟 128x64 屏幕）
 * - 设备信息网格：FIRMWARE / API LVL / BATTERY / SD CARD / DOLPHIN
 * - 快捷操作菜单：学习助手 / 一键导入 / 固件管理 / 故障诊断 / 资源管理
 * - 课程列表菜单（遍历 COURSES）
 * - 工具菜单：屏幕镜像 / 成就图鉴 / 桌宠 / GPIO沙盘
 * - 未连接设备时显示 "WAITING FOR FLIPPER..." 和扫描按钮
 */
import React from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useDeviceStore } from "@/stores/deviceStore";
import { useUiStore } from "@/stores/uiStore";
import { COURSES } from "@/data/courses";

interface MenuItemProps {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, active, onClick, trailing }) => (
  <div className={`menu-item ${active ? "active" : ""}`} onClick={onClick}>
    <Icon name={icon} size={18} />
    <span style={{ flex: 1 }}>{label}</span>
    {trailing}
  </div>
);

/** 格式化字节为可读字符串 */
function fmtBytes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "GB";
  if (n >= 1e6) return (n / 1e6).toFixed(0) + "MB";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "KB";
  return n + "B";
}

/** 屏幕镜像预览（模拟 128x64 主菜单） */
const ScreenPreview: React.FC<{ connected: boolean }> = ({ connected }) => {
  if (!connected) {
    return (
      <div className="flipper-screen screen-preview" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="screen-line blink">NO SIGNAL</span>
      </div>
    );
  }
  return (
    <div className="flipper-screen screen-preview">
      <div className="screen-bar">
        <span>FLIPPER</span>
        <span>78%</span>
      </div>
      <div className="screen-line cur">&gt; NFC</div>
      <div className="screen-line">  125kHz RFID</div>
      <div className="screen-line">  Sub-GHz</div>
      <div className="screen-line">  Infrared</div>
      <div className="screen-line">  Bad USB</div>
    </div>
  );
};

export const DeviceSidebar: React.FC = () => {
  const { connectionState, deviceInfo, scan } = useDeviceStore();
  const { activeView, activeCourseId, openModal, setView, openCourse, setModal, sidebarCollapsed, toggleSidebar } =
    useUiStore();

  const connected =
    connectionState === "connected" || connectionState === "transferring";
  const connecting = connectionState === "connecting";

  // 快捷操作菜单定义
  const quickActions: {
    icon: IconName;
    label: string;
    active: boolean;
    onClick: () => void;
  }[] = [
    { icon: "terminal", label: "学习助手", active: activeView === "ai", onClick: () => setView("ai") },
    { icon: "rocket", label: "一键导入", active: activeView === "import", onClick: () => setView("import") },
    { icon: "wrench", label: "固件管理", active: activeView === "firmware", onClick: () => setView("firmware") },
    { icon: "search", label: "故障诊断", active: activeView === "diagnostic", onClick: () => setView("diagnostic") },
    { icon: "package", label: "资源管理", active: openModal === "resource", onClick: () => setModal("resource") },
  ];

  // 工具菜单定义
  const tools: { icon: IconName; label: string; modal: "mirror" | "trophy" | "pet" | "circuit" | "dashboard" | "about" | "settings" | "help" }[] = [
    { icon: "mirror", label: "屏幕镜像", modal: "mirror" },
    { icon: "trophy", label: "成就图鉴", modal: "trophy" },
    { icon: "pet", label: "桌宠", modal: "pet" },
    { icon: "circuit", label: "GPIO 沙盘", modal: "circuit" },
    { icon: "chart", label: "仪表盘", modal: "dashboard" },
    { icon: "info", label: "关于", modal: "about" },
  ];

  // 折叠态：渲染窄条（仅设备图标 + 展开提示），点击展开
  if (sidebarCollapsed) {
    return (
      <aside
        onClick={toggleSidebar}
        title="点击展开侧栏 (Ctrl/Cmd+B)"
        style={{
          width: 48,
          flexShrink: 0,
          background: "var(--c-dark)",
          borderRight: "2px solid var(--c-orange)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "10px 0",
          gap: 12,
          cursor: "pointer",
        }}
      >
        <span className={connected ? "bob" : ""} style={{ color: "var(--c-orange)" }}>
          <Icon name="dolphin" size={26} />
        </span>
        <span
          className={
            connected
              ? "led green"
              : connecting
                ? "led orange blink"
                : "led red"
          }
        />
        {/* 纵向 EXPAND 提示 */}
        <span
          className="font-pixel blink"
          style={{
            fontSize: 7,
            color: "var(--c-orange)",
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            marginTop: "auto",
            marginBottom: 12,
            letterSpacing: 2,
          }}
        >
          EXPAND
        </span>
        <Icon name="chevron-right" size={14} style={{ color: "var(--c-gray)" }} />
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        background: "var(--c-dark)",
        borderRight: "2px solid var(--c-orange)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div className="scroll-y" style={{ flex: 1 }}>
        {/* 顶部设备头 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "2px solid var(--c-gray)",
            background: "var(--c-dark2)",
          }}
        >
          <span className={connected ? "bob" : ""} style={{ color: "var(--c-orange)" }}>
            <Icon name="dolphin" size={26} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="font-pixel" style={{ fontSize: 9, color: "var(--c-white)" }}>
              FLIPPER ZERO
            </div>
            <div className="font-mono" style={{ fontSize: 11, color: "#888" }}>
              {connected ? "ONLINE" : connecting ? "SCANNING..." : "OFFLINE"}
            </div>
          </div>
          <span
            className={
              connected
                ? "led green"
                : connecting
                  ? "led orange blink"
                  : "led red"
            }
          />
          {/* 折叠按钮（Ctrl/Cmd+B 也可触发） */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              toggleSidebar();
            }}
            title="折叠侧栏 (Ctrl/Cmd+B)"
            style={{
              cursor: "pointer",
              color: "var(--c-gray)",
              display: "inline-flex",
              padding: 2,
              borderRadius: 3,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--c-orange)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-gray)")}
          >
            <Icon name="chevron-down" size={14} style={{ transform: "rotate(90deg)" }} />
          </span>
        </div>

        {/* 屏幕镜像预览 */}
        <div style={{ padding: "10px 12px" }}>
          <div
            className="font-pixel"
            style={{ fontSize: 7, color: "var(--c-orange)", marginBottom: 6 }}
          >
            SCREEN MIRROR
          </div>
          <ScreenPreview connected={connected} />
        </div>

        {/* 设备信息 / 等待扫描 */}
        {connected && deviceInfo ? (
          <div className="dev-info-grid">
            <span className="dev-info-label">FIRMWARE</span>
            <span className="dev-info-value">{deviceInfo.firmwareVersion}</span>
            <span className="dev-info-label">API LVL</span>
            <span className="dev-info-value">{deviceInfo.apiLevel}</span>
            <span className="dev-info-label">BATTERY</span>
            <span
              className="dev-info-value"
              style={{
                color:
                  deviceInfo.batteryLevel < 20
                    ? "var(--c-red)"
                    : deviceInfo.batteryLevel < 40
                      ? "var(--c-yellow)"
                      : "var(--c-green)",
              }}
            >
              {deviceInfo.batteryLevel}% ({deviceInfo.batteryVoltage}V
              {deviceInfo.isCharging ? " +" : ""})
            </span>
            <span className="dev-info-label">SD CARD</span>
            <span className="dev-info-value">
              {deviceInfo.sdCardInserted
                ? `${fmtBytes(deviceInfo.sdCardFreeBytes)}/${fmtBytes(deviceInfo.sdCardTotalBytes)}`
                : "NOT INSERTED"}
            </span>
            <span className="dev-info-label">DOLPHIN</span>
            <span className="dev-info-value">LVL {deviceInfo.dolphinLevel}</span>
          </div>
        ) : (
          <div style={{ padding: "10px 12px", textAlign: "center" }}>
            <div
              className="font-pixel blink"
              style={{ fontSize: 8, color: "var(--c-orange)", marginBottom: 8 }}
            >
              WAITING FOR FLIPPER...
            </div>
            <button
              className="btn btn-primary"
              onClick={() => void scan()}
              disabled={connecting}
              style={{ width: "100%", justifyContent: "center" }}
            >
              <Icon name="search" size={16} />
              {connecting ? "SCANNING..." : "SCAN DEVICE"}
            </button>
          </div>
        )}

        {/* 快捷操作菜单 */}
        <div className="menu-section">QUICK ACTIONS</div>
        {quickActions.map((a) => (
          <MenuItem key={a.label} {...a} />
        ))}

        {/* 课程列表菜单 */}
        <div className="menu-section">COURSES</div>
        {COURSES.map((c, i) => (
          <MenuItem
            key={c.id}
            icon={c.icon as IconName}
            label={c.title}
            active={activeView === "course" && activeCourseId === c.id}
            onClick={() => openCourse(c.id)}
            trailing={
              <span className="menu-num">
                {String(i).padStart(2, "0")}
              </span>
            }
          />
        ))}

        {/* 工具菜单 */}
        <div className="menu-section">TOOLS</div>
        {tools.map((t) => (
          <MenuItem
            key={t.label}
            icon={t.icon}
            label={t.label}
            active={openModal === t.modal}
            onClick={() => setModal(t.modal)}
          />
        ))}

        {/* 底部留白 */}
        <div style={{ height: 16 }} />
      </div>
    </aside>
  );
};

export default DeviceSidebar;
