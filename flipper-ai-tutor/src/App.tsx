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
import { SettingsModal } from "@/components/SettingsModal";
import { useImportStore } from "@/stores/importStore";
import { useUiStore } from "@/stores/uiStore";
import type { ModalId } from "@/stores/uiStore";
import { useMirrorStore } from "@/stores/mirrorStore";
import { useDeviceStore } from "@/stores/deviceStore";
import { cleanupChatListeners } from "@/stores/chatStore";
import { cleanupDeviceListeners } from "@/stores/deviceStore";
import { cleanupFirmwareListeners } from "@/stores/firmwareStore";
import { cleanupImportListeners } from "@/stores/importStore";
import { cleanupMirrorListeners } from "@/stores/mirrorStore";

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

/** 成就图鉴（开发中） */
const TrophyModalContent: React.FC = () => (
  <div>
    <div className="font-pixel text-orange" style={{ fontSize: 10, marginBottom: 10 }}>
      ACHIEVEMENTS
    </div>
    <div style={{
      border: "1.5px dashed var(--c-gray)",
      background: "var(--c-dark2)",
      padding: "20px 16px",
      textAlign: "center",
      marginBottom: 10,
    }}>
      <Icon name="rocket" size={32} style={{ color: "var(--c-gray)" }} />
      <div className="font-pixel text-dim" style={{ fontSize: 9, marginTop: 8 }}>
        COMING SOON
      </div>
      <div className="font-term text-dim" style={{ fontSize: 14, marginTop: 6 }}>
        成就系统正在开发中，敬请期待
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {[
        { icon: "rocket", name: "首次导入", desc: "完成第一次一键导入", unlocked: true },
        { icon: "nfc", name: "卡牌大师", desc: "复制 10 张卡", unlocked: true },
        { icon: "subghz", name: "信号猎手", desc: "捕获 5 个信号", unlocked: false },
        { icon: "badusb", name: "键盘侠", desc: "运行 BadUSB 脚本", unlocked: false },
        { icon: "wrench", name: "刷机达人", desc: "刷写 3 次固件", unlocked: false },
        { icon: "dolphin", name: "毕业", desc: "完成全部课程", unlocked: false },
      ].map((a) => (
        <div
          key={a.name}
          className="fw-card"
          style={{ opacity: a.unlocked ? 1 : 0.4, cursor: "default" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name={a.icon as IconName} size={20} />
            <span className="font-pixel text-orange" style={{ fontSize: 9 }}>
              {a.name}
            </span>
            {a.unlocked && <span className="badge badge-ok">已解锁</span>}
          </div>
          <div className="font-term text-dim" style={{ fontSize: 14, marginTop: 4 }}>
            {a.desc}
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** 桌宠（开发中） */
const PetModalContent: React.FC = () => (
  <div style={{ textAlign: "center", padding: 10 }}>
    <div className="bob" style={{ color: "var(--c-gray)", display: "inline-block" }}>
      <Icon name="pet" size={72} />
    </div>
    <div className="font-pixel text-dim" style={{ fontSize: 10, marginTop: 10 }}>
      COMING SOON
    </div>
    <div className="font-term text-dim" style={{ fontSize: 15, marginTop: 6 }}>
      桌宠系统正在开发中
    </div>
  </div>
);

/** GPIO 沙盘（开发中） */
const CircuitModalContent: React.FC = () => (
  <div>
    <div className="font-pixel text-orange" style={{ fontSize: 10, marginBottom: 10 }}>
      GPIO SANDBOX
    </div>
    <div style={{
      border: "1.5px dashed var(--c-gray)",
      background: "var(--c-dark2)",
      padding: "20px 16px",
      textAlign: "center",
    }}>
      <Icon name="circuit" size={32} style={{ color: "var(--c-gray)" }} />
      <div className="font-pixel text-dim" style={{ fontSize: 9, marginTop: 8 }}>
        COMING SOON
      </div>
      <div className="font-term text-dim" style={{ fontSize: 14, marginTop: 6 }}>
        GPIO 可视化配置工具正在开发中
      </div>
    </div>
  </div>
);

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
  // 开机动画状态：未完成时只渲染 BootScreen，完成后渲染主界面
  const [booted, setBooted] = useState(false);

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
