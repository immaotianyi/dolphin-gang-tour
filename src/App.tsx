/**
 * Lucy Desktop — Main Application
 * 8-bit Pixel x Apple Smooth
 */
import React, { useEffect, useState, useCallback } from "react";
import { BootScreen } from "@/components/layout/BootScreen";
import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";
import { Dashboard } from "@/components/Dashboard";
import { AiChat } from "@/components/AiChat";
import { CommandPalette } from "@/components/CommandPalette";
import { NfcModule } from "@/components/modules/NfcModule";
import { SubGHzModule } from "@/components/modules/SubGHzModule";
import { BadUsbModule } from "@/components/modules/BadUsbModule";
import { GpioModule } from "@/components/modules/GpioModule";
import { IrModule } from "@/components/modules/IrModule";
import { SettingsModule } from "@/components/modules/SettingsModule";
import { ScreenMirror } from "@/components/modules/ScreenMirror";
import { FirmwareModule } from "@/components/modules/FirmwareModule";
import { LibraryModule } from "@/components/modules/LibraryModule";
import { VirtualLabModule } from "@/components/modules/VirtualLabModule";
import { AuditCenterModule } from "@/components/modules/AuditCenterModule";
import { ChangelogModule } from "@/components/modules/ChangelogModule";
import { ReleaseFreezeModule } from "@/components/modules/ReleaseFreezeModule";
import { ToastContainer } from "@/components/ui/Toast";
import { useUiStore } from "@/stores/uiStore";
import { useDeviceStore } from "@/stores/deviceStore";
import { useChatStore } from "@/stores/chatStore";

const App: React.FC = () => {
  const { bootComplete, setBootComplete, activeView, openModal, setModal, loadTimelineFromDB } = useUiStore();
  const { scan } = useDeviceStore();
  const chatCleanup = useChatStore((s) => s.cleanup);
  const [transitioning, setTransitioning] = useState(false);

  // Boot -> auto scan + load timeline from DB
  useEffect(() => {
    if (bootComplete) {
      scan();
      loadTimelineFromDB();
    }
  }, [bootComplete, scan, loadTimelineFromDB]);

  // View transition animation
  useEffect(() => {
    setTransitioning(true);
    const timer = setTimeout(() => setTransitioning(false), 300);
    return () => clearTimeout(timer);
  }, [activeView]);

  // Ctrl+K -> Command Palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal(openModal === "commandPalette" ? null : "commandPalette");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openModal, setModal]);

  // Cleanup
  useEffect(() => {
    return () => {
      chatCleanup();
      useDeviceStore.getState().cleanup();
    };
  }, [chatCleanup]);

  const closePalette = useCallback(() => setModal(null), [setModal]);

  if (!bootComplete) {
    return <BootScreen onComplete={() => setBootComplete(true)} />;
  }

  const renderView = () => {
    switch (activeView) {
      case "dashboard":
        return <Dashboard />;
      case "ai":
        return <AiChat />;
      case "nfc":
        return <NfcModule />;
      case "subghz":
        return <SubGHzModule />;
      case "ir":
        return <IrModule />;
      case "badusb":
        return <BadUsbModule />;
      case "gpio":
        return <GpioModule />;
      case "screen":
        return <ScreenMirror />;
      case "firmware":
        return <FirmwareModule />;
      case "settings":
        return <SettingsModule />;
      case "library":
        return <LibraryModule />;
      case "virtualLab":
        return <VirtualLabModule />;
      case "audit":
        return <AuditCenterModule />;
      case "changelog":
        return <ChangelogModule />;
      case "releaseFreeze":
        return <ReleaseFreezeModule />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main
          className="app-main"
          style={{
            opacity: transitioning ? 0 : 1,
            transform: transitioning ? "translateX(10px)" : "translateX(0)",
            transition: "opacity 0.3s var(--ease-apple), transform 0.3s var(--ease-apple)",
          }}
        >
          {renderView()}
        </main>
      </div>
      <StatusBar />
      <CommandPalette open={openModal === "commandPalette"} onClose={closePalette} />
      <ToastContainer />
    </div>
  );
};

export default App;
