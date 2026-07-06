/**
 * 应用主布局
 * - 启动时先展示 BootScreen 开机动画，完成后进入主界面
 * - 顶部 TitleBar
 * - 左右分栏：左侧 DeviceSidebar(260px) + 右侧主内容区
 * - 右侧根据 activeView 切换：AiChat / ImportWizard / FirmwareManager / DiagnosticPanel / CourseView
 * - 工具类入口(mirror/trophy/pet/circuit/resource)走 Modal
 * - 整体黑色背景 + CRT 扫描线（由 body::before 实现）
 */
import React, { useEffect, useRef, useState, Component, ReactNode } from "react";
import { TitleBar } from "@/components/TitleBar";
import { DeviceSidebar } from "@/components/DeviceSidebar";
import { AiChat } from "@/components/AiChat";
import { ImportWizard } from "@/components/ImportWizard";
import { FirmwareManager } from "@/components/FirmwareManager";
import { DiagnosticPanel } from "@/components/DiagnosticPanel";
import { CourseView } from "@/components/CourseView";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { BootScreen } from "@/components/BootScreen";
import { UserAgreement } from "@/components/UserAgreement";
import { SettingsModal } from "@/components/SettingsModal";
import { useImportStore } from "@/stores/importStore";
import { useUiStore } from "@/stores/uiStore";
import type { ModalId } from "@/stores/uiStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type { PetMood } from "@/types";
import { useMirrorStore } from "@/stores/mirrorStore";
import { usePetStore } from "@/stores/petStore";
import { useDeviceStore } from "@/stores/deviceStore";
import { useGpioStore } from "@/stores/gpioStore";
import { cleanupChatListeners } from "@/stores/chatStore";
import { cleanupDeviceListeners } from "@/stores/deviceStore";
import { cleanupFirmwareListeners } from "@/stores/firmwareStore";
import { cleanupImportListeners } from "@/stores/importStore";
import { cleanupMirrorListeners } from "@/stores/mirrorStore";
import { useAchievementStore } from "@/stores/achievementStore";

// -------------------- Error Boundary --------------------

/**
 * 全局错误边界 — 捕获子组件 render 阶段的未处理错误，防止白屏崩溃
 */
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center", color: "#ff7b24", fontFamily: "monospace" }}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>APPLICATION ERROR</div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
            {this.state.error?.message || "未知错误"}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 应用启动时尝试自动扫描一次设备。
 * 仅在主界面渲染后（即 booted=true 后）才会挂载，
 * 因此开机动画期间不会触发设备扫描。
 */
const AutoScanOnBoot: React.FC = () => {
  const { connectionState, scan } = useDeviceStore();
  useEffect(() => {
    if (connectionState === "no_device") {
      void scan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

/** 屏幕镜像弹窗内容（打开时启动镜像、关闭时停止；canvas 渲染 128x64 帧） */
const MirrorModalContent: React.FC = () => {
  const { isMirroring, currentFrame, fps, lastError, startMirror, stopMirror, sendKey } =
    useMirrorStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 打开时启动镜像，关闭时停止
  useEffect(() => {
    void startMirror();
    return () => {
      void stopMirror();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 帧到达时绘制到 canvas（橙色像素 + 黑底）
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !currentFrame) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const { width, height, data } = currentFrame;
    if (cv.width !== width) cv.width = width;
    if (cv.height !== height) cv.height = height;
    const img = ctx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      const on = data[i] ? 1 : 0;
      img.data[i * 4 + 0] = on ? 255 : 0;
      img.data[i * 4 + 1] = on ? 123 : 0;
      img.data[i * 4 + 2] = on ? 36 : 0;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [currentFrame]);

  return (
    <div>
      <div
        className="font-mono text-dim"
        style={{ fontSize: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      >
        <span className={`led ${isMirroring ? "green blink" : "red"}`} />
        {isMirroring ? "LIVE MIRRORING" : "STOPPED"} | 128x64 @ {fps}FPS
      </div>
      {/* 屏幕画布（像素化放大，保持 2:1 比例） */}
      <div
        className="flipper-screen"
        style={{ padding: 6, display: "flex", justifyContent: "center" }}
      >
        <canvas
          ref={canvasRef}
          width={128}
          height={64}
          style={{
            width: "100%",
            maxWidth: 384,
            aspectRatio: "2 / 1",
            imageRendering: "pixelated",
            background: "#000",
          }}
        />
      </div>
      {lastError && (
        <div className="font-mono text-red" style={{ fontSize: 12, marginTop: 8 }}>
          {lastError}
        </div>
      )}
      {/* 物理按键遥控 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 6,
          marginTop: 12,
        }}
      >
        <button className="btn" onClick={() => void sendKey("up")}>
          <Icon name="chevron-down" size={14} style={{ transform: "rotate(180deg)" }} />
          UP
        </button>
        <button className="btn" onClick={() => void sendKey("down")}>
          <Icon name="chevron-down" size={14} />
          DOWN
        </button>
        <button className="btn btn-primary" onClick={() => void sendKey("ok")}>
          <Icon name="check" size={14} />
          OK
        </button>
        <button className="btn btn-danger" onClick={() => void sendKey("back")}>
          <Icon name="cross" size={14} />
          BACK
        </button>
      </div>
      <div className="font-term text-dim" style={{ fontSize: 14, marginTop: 8, textAlign: "center" }}>
        提示：实机镜像通过 qFlipper RPC / serial 协议实时拉取帧；浏览器演示模式输出模拟画面。
      </div>
    </div>
  );
};

/** 成就图鉴 */
const TrophyModalContent: React.FC = () => {
  const { achievements, isLoading, loadAchievements, unlockedCount, totalCount } = useAchievementStore();

  React.useEffect(() => {
    if (achievements.length === 0) {
      loadAchievements();
    }
  }, []);

  if (isLoading && achievements.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <div className="font-term text-dim" style={{ fontSize: 14 }}>加载中...</div>
      </div>
    );
  }

  const unlocked = unlockedCount();
  const total = totalCount();
  const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;

  return (
    <div>
      <div className="font-pixel text-orange" style={{ fontSize: 10, marginBottom: 10 }}>
        ACHIEVEMENTS
      </div>

      {/* 总进度 */}
      <div className="fw-card" style={{ marginBottom: 10, padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span className="font-pixel text-orange" style={{ fontSize: 9 }}>解锁进度</span>
          <span className="font-term" style={{ fontSize: 14 }}>{unlocked} / {total}</span>
        </div>
        <div style={{ height: 6, background: "var(--c-dark2)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${percent}%`, height: "100%", background: "var(--c-orange)", transition: "width 0.5s" }} />
        </div>
      </div>

      {/* 成就网格 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {achievements.map((a) => (
          <div
            key={a.id}
            className="fw-card"
            style={{
              opacity: a.unlocked ? 1 : 0.45,
              cursor: "default",
              border: a.unlocked ? "1.5px solid var(--c-orange)" : undefined,
              transition: "all 0.2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name={a.icon as IconName} size={20} style={{ color: a.unlocked ? "var(--c-orange)" : "var(--c-gray)" }} />
              <span className="font-pixel text-orange" style={{ fontSize: 9 }}>
                {a.name}
              </span>
              {a.unlocked && <span className="badge badge-ok">已解锁</span>}
            </div>
            <div className="font-term text-dim" style={{ fontSize: 14, marginTop: 4 }}>
              {a.description}
            </div>
            {/* 进度条（有 target 且未解锁时显示） */}
            {!a.unlocked && a.target > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ height: 4, background: "var(--c-dark2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (a.progress / a.target) * 100)}%`, height: "100%", background: "var(--c-blue)" }} />
                </div>
                <span className="font-term text-dim" style={{ fontSize: 11 }}>
                  {a.progress} / {a.target}
                </span>
              </div>
            )}
            {/* 解锁时间 */}
            {a.unlocked && a.unlockedAt && (
              <div className="font-term text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                {new Date(a.unlockedAt * 1000).toLocaleDateString("zh-CN")}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/** 心情对应的文字提示 */
function moodText(mood: PetMood): string {
  const map: Record<PetMood, string> = {
    happy: "心情不错～",
    normal: "发呆中...",
    sad: "好饿啊...",
    excited: "超开心！",
    sleeping: "Zzz...",
  };
  return map[mood];
}

/** 状态进度条（像素风） */
const StatBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <span className="font-term text-dim" style={{ fontSize: 12, width: 30 }}>{label}</span>
    <div style={{ flex: 1, height: 8, background: "var(--c-dark2)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", background: color, transition: "width 0.3s" }} />
    </div>
    <span className="font-term text-dim" style={{ fontSize: 12, width: 30, textAlign: "right" }}>{Math.round(value)}</span>
  </div>
);

/** 桌宠 */
const PetModalContent: React.FC = () => {
  const { pet, feed, play, sleep, rename } = usePetStore();

  return (
    <div style={{ textAlign: "center", padding: 10 }}>
      {/* 桌宠展示区 — 根据 mood 显示不同颜色和浮动动画 */}
      <div className="bob" style={{ display: "inline-block", marginBottom: 8 }}>
        <Icon name="pet" size={64} style={{
          color: pet.mood === "sad" ? "var(--c-gray)"
               : pet.mood === "excited" ? "var(--c-orange)"
               : pet.mood === "sleeping" ? "var(--c-blue)"
               : "var(--c-green)"
        }} />
      </div>

      {/* 名字 + 等级 */}
      <div className="font-pixel text-orange" style={{ fontSize: 10 }}>
        {pet.name} Lv.{pet.level}
      </div>

      {/* 心情显示 */}
      <div className="font-term text-dim" style={{ fontSize: 14, marginTop: 4 }}>
        {moodText(pet.mood)}
      </div>

      {/* 状态条 */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <StatBar label="饱食" value={100 - pet.hunger} color="var(--c-green)" />
        <StatBar label="快乐" value={pet.happiness} color="var(--c-orange)" />
        <StatBar label="精力" value={pet.energy} color="var(--c-blue)" />
        <StatBar label="经验" value={Math.floor(pet.exp / pet.expToNext * 100)} color="var(--c-purple)" />
      </div>

      {/* 操作按钮 */}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button className="btn btn-primary" onClick={feed} disabled={pet.hunger < 10}>
          喂食
        </button>
        <button className="btn btn-primary" onClick={play} disabled={pet.energy < 15}>
          玩耍
        </button>
        <button className="btn" onClick={sleep}>
          {pet.action === "sleeping" ? "起床" : "睡觉"}
        </button>
        <button className="btn" onClick={() => {
          const name = prompt("给桌宠起个名字：");
          if (name && name.trim()) rename(name);
        }}>
          改名
        </button>
      </div>
    </div>
  );
};

/** GPIO 沙盘 */
/** GPIO 沙盘 — 可视化配置 8 个引脚模式与电平，控制 OTG 供电 */
const CircuitModalContent: React.FC = () => {
  const {
    pins,
    otgMode,
    isLoading,
    lastError,
    loadPins,
    setMode,
    togglePin,
    loadOtgMode,
    setOtgMode,
  } = useGpioStore();

  useEffect(() => {
    void loadPins();
    void loadOtgMode();
  }, [loadPins, loadOtgMode]);

  return (
    <div>
      <div className="font-pixel text-orange" style={{ fontSize: 10, marginBottom: 10 }}>
        GPIO SANDBOX
      </div>

      {/* 加载中提示 */}
      {isLoading && pins.length === 0 && (
        <div className="font-term text-dim" style={{ fontSize: 13, textAlign: "center", padding: 20 }}>
          正在读取引脚状态...
        </div>
      )}

      {/* 错误提示 */}
      {lastError && (
        <div
          className="font-term text-red"
          style={{
            fontSize: 12,
            marginBottom: 8,
            padding: "6px 8px",
            border: "1px solid var(--c-red)",
            background: "var(--c-dark2)",
          }}
        >
          {lastError}
        </div>
      )}

      {/* 引脚列表 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pins.map((pin) => (
          <div
            key={pin.pin}
            className="fw-card"
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px" }}
          >
            {/* 引脚名 */}
            <span className="font-pixel text-orange" style={{ fontSize: 10, width: 40 }}>
              {pin.pin}
            </span>

            {/* 模式切换（OUTPUT / INPUT） */}
            <button
              className="btn"
              style={{ fontSize: 12, padding: "2px 8px", minWidth: 48 }}
              onClick={() =>
                void setMode(pin.pin, pin.mode === "output" ? "input" : "output")
              }
            >
              {pin.mode === "output" ? "OUT" : "IN"}
            </button>

            {/* 值显示/控制：OUTPUT 可点击切换，INPUT 只读显示 */}
            {pin.mode === "output" ? (
              <button
                className="btn btn-primary"
                style={{
                  fontSize: 12,
                  padding: "2px 12px",
                  minWidth: 60,
                  background: pin.value ? "var(--c-green)" : "var(--c-dark2)",
                }}
                onClick={() => void togglePin(pin.pin)}
              >
                {pin.value ? "HIGH" : "LOW"}
              </button>
            ) : (
              <span
                className="font-term"
                style={{
                  fontSize: 14,
                  minWidth: 60,
                  color: pin.value ? "var(--c-green)" : "#888",
                }}
              >
                {pin.value ? "HIGH" : "LOW"}
              </span>
            )}

            {/* LED 指示灯 */}
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: pin.value ? "var(--c-green)" : "var(--c-dark2)",
                boxShadow: pin.value ? "0 0 6px var(--c-green)" : "none",
                transition: "all 0.2s",
                marginLeft: "auto",
              }}
            />
          </div>
        ))}
      </div>

      {/* OTG 模式 */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          borderTop: "1px solid var(--c-gray)",
        }}
      >
        <span className="font-pixel text-orange" style={{ fontSize: 10 }}>
          OTG
        </span>
        <button
          className="btn"
          style={{
            background: otgMode === "on" ? "var(--c-green)" : "var(--c-dark2)",
            fontSize: 12,
            padding: "2px 12px",
          }}
          onClick={() => void setOtgMode(otgMode === "on" ? "off" : "on")}
        >
          {otgMode === "on" ? "ON" : "OFF"}
        </button>
        <span className="font-term text-dim" style={{ fontSize: 12 }}>
          USB OTG 供电开关
        </span>
      </div>

      {/* 提示 */}
      <div className="font-term text-dim" style={{ fontSize: 12, marginTop: 8, textAlign: "center" }}>
        通过 RPC 协议实时控制 Flipper Zero 的 GPIO 引脚
      </div>
    </div>
  );
};

/** 资源管理浏览器（只读列表） */
const ResourceModalContent: React.FC = () => {
  const { packages } = useImportStore();
  return (
    <div>
      <div className="font-pixel text-orange" style={{ fontSize: 10, marginBottom: 8 }}>
        RESOURCE PACKAGES ({packages.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {packages.map((p) => (
        <div
          key={p.id}
          style={{
            border: "1px solid var(--c-gray)",
            background: "var(--c-dark2)",
            padding: "6px 8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Icon name="package" size={14} />
            <span className="text-orange" style={{ fontWeight: 600 }}>{p.name}</span>
            {p.defaultChecked && <span className="badge badge-mvp">推荐</span>}
            <span className="badge badge-new">v{p.version}</span>
            <span className="font-mono text-dim" style={{ fontSize: 11, marginLeft: "auto" }}>
              {(p.sizeBytes / 1e6).toFixed(1)}MB | {p.fileCount} 文件
            </span>
          </div>
          <div className="font-term text-dim" style={{ fontSize: 14 }}>
            {p.description}
          </div>
        </div>
      ))}
    </div>
    <div className="font-term text-dim" style={{ fontSize: 14, marginTop: 10 }}>
      浏览完毕后，前往「一键导入」勾选并写入设备。
    </div>
  </div>
  );
};

/** 帮助面板 — 键盘快捷键 + 功能导览 */
const HelpModalContent: React.FC = () => {
  const { setModal } = useUiStore();

  const shortcuts = [
    { keys: "Ctrl/Cmd + 1", desc: "切换到 AI 对话" },
    { keys: "Ctrl/Cmd + 2", desc: "切换到资源导入" },
    { keys: "Ctrl/Cmd + 3", desc: "切换到固件管理" },
    { keys: "Ctrl/Cmd + 4", desc: "切换到故障诊断" },
    { keys: "Ctrl/Cmd + 5", desc: "切换到课程学习" },
    { keys: "Ctrl/Cmd + K", desc: "循环切换视图" },
    { keys: "Ctrl/Cmd + B", desc: "折叠/展开侧栏" },
    { keys: "Ctrl/Cmd + ,", desc: "打开设置" },
    { keys: "?", desc: "打开本帮助面板" },
    { keys: "Esc", desc: "关闭当前弹窗" },
    { keys: "Enter", desc: "发送 AI 消息（输入框聚焦时）" },
  ];

  const features = [
    { icon: "chip", name: "AI 辅导", desc: "多模型对话教学" },
    { icon: "rocket", name: "一键导入", desc: "7类资源包快速导入" },
    { icon: "wrench", name: "固件刷写", desc: "双轨守护刷写" },
    { icon: "mirror", name: "屏幕镜像", desc: "实时设备画面" },
    { icon: "circuit", name: "GPIO 沙盘", desc: "8引脚可视化控制" },
    { icon: "trophy", name: "成就", desc: "10个成就解锁" },
    { icon: "pet", name: "桌宠", desc: "养成互动" },
  ];

  return (
    <div>
      <div className="font-pixel text-orange" style={{ fontSize: 10, marginBottom: 10 }}>
        KEYBOARD SHORTCUTS
      </div>

      {/* 快捷键列表 */}
      <div style={{ marginBottom: 16 }}>
        {shortcuts.map((s) => (
          <div key={s.keys} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--c-dark2)" }}>
            <span className="font-term text-dim" style={{ fontSize: 13 }}>{s.desc}</span>
            <kbd style={{
              background: "var(--c-dark2)", border: "1px solid var(--c-gray)",
              borderRadius: 3, padding: "2px 8px", fontSize: 11,
              fontFamily: "monospace", color: "var(--c-orange)",
            }}>
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>

      {/* 功能导览 */}
      <div className="font-pixel text-orange" style={{ fontSize: 10, marginBottom: 8 }}>
        FEATURES
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {features.map((f) => (
          <div key={f.name} className="fw-card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}
            onClick={() => setModal(null)}>
            <Icon name={f.icon as IconName} size={16} style={{ color: "var(--c-orange)" }} />
            <div>
              <div className="font-pixel text-orange" style={{ fontSize: 9 }}>{f.name}</div>
              <div className="font-term text-dim" style={{ fontSize: 11 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 提示 */}
      <div className="font-term text-dim" style={{ fontSize: 12, textAlign: "center", padding: "8px 0", borderTop: "1px solid var(--c-gray)" }}>
        按 <kbd style={{ background: "var(--c-dark2)", border: "1px solid var(--c-gray)", borderRadius: 3, padding: "1px 6px", fontSize: 11 }}>?</kbd> 随时打开此面板
      </div>
    </div>
  );
};

/** 工具弹窗集合 */
const ToolModals: React.FC<{
  openModal: ModalId;
  setModal: (m: ModalId) => void;
}> = ({ openModal, setModal }) => {
  const close = () => setModal(null);
  const map: { id: ModalId; title: string; node: React.ReactNode; width?: number }[] = [
    { id: "mirror", title: "SCREEN MIRROR", node: <MirrorModalContent />, width: 460 },
    { id: "trophy", title: "TROPHY ROOM", node: <TrophyModalContent />, width: 560 },
    { id: "pet", title: "DOLPHIN PET", node: <PetModalContent />, width: 360 },
    { id: "circuit", title: "GPIO SANDBOX", node: <CircuitModalContent />, width: 560 },
    { id: "resource", title: "RESOURCE MANAGER", node: <ResourceModalContent />, width: 560 },
    { id: "settings", title: "AI SETTINGS", node: <SettingsModal />, width: 520 },
    { id: "help", title: "KEYBOARD SHORTCUTS", node: <HelpModalContent />, width: 480 },
  ];
  return (
    <>
      {map.map((m) => (
        <Modal
          key={m.id}
          open={openModal === m.id}
          title={m.title}
          onClose={close}
          width={m.width ?? 520}
        >
          {m.node}
        </Modal>
      ))}
    </>
  );
};

export const App: React.FC = () => {
  const { activeView, openModal, setModal } = useUiStore();
  // 注册全局键盘快捷键
  useKeyboardShortcuts();
  // 开机动画状态：未完成时只渲染 BootScreen，完成后渲染主界面
  const [booted, setBooted] = useState(false);
  // 首次启动用户协议：未同意时（BootScreen 完成后）展示，同意后进入主界面
  const [showAgreement, setShowAgreement] = useState(() => {
    return !localStorage.getItem("dolphintutor-agreed");
  });

  // 组件卸载时清理所有 Tauri 事件监听器，防止内存泄漏
  useEffect(() => {
    return () => {
      cleanupChatListeners();
      cleanupDeviceListeners();
      cleanupFirmwareListeners();
      cleanupImportListeners();
      cleanupMirrorListeners();
    };
  }, []);

  // 开机动画未完成：仅渲染 BootScreen，主界面（含 AutoScanOnBoot）尚未挂载
  if (!booted) {
    return (
      <ErrorBoundary>
        <BootScreen onComplete={() => setBooted(true)} />
      </ErrorBoundary>
    );
  }

  // 首次启动展示用户协议（BootScreen 完成后、主界面显示前）
  if (showAgreement) {
    return <UserAgreement onAgree={() => setShowAgreement(false)} />;
  }

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <AutoScanOnBoot />
        <TitleBar />
        <div className="app-body">
          <DeviceSidebar />
          <main className="app-main">
            {activeView === "ai" && <AiChat />}
            {activeView === "import" && <ImportWizard />}
            {activeView === "firmware" && <FirmwareManager />}
            {activeView === "diagnostic" && <DiagnosticPanel />}
            {activeView === "course" && <CourseView />}
          </main>
        </div>
        <ToolModals openModal={openModal} setModal={setModal} />
      </div>
    </ErrorBoundary>
  );
};

export default App;
