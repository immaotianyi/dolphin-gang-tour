/** 功能模块占位视图 — NFC/SubGHz/IR/BadUSB/GPIO/Firmware/Settings */
import React from "react";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/types";

interface PlaceholderProps {
  title: string;
  icon: IconName;
  description: string;
  status?: "planned" | "in-development" | "ready";
}

export const PlaceholderView: React.FC<PlaceholderProps> = ({ title, icon, description, status = "planned" }) => {
  const statusInfo = {
    planned: { label: "PLANNED", color: "var(--c-yellow)", badge: "pixel-badge-warn" },
    "in-development": { label: "IN DEVELOPMENT", color: "var(--c-cyan)", badge: "pixel-badge-info" },
    ready: { label: "READY", color: "var(--c-green)", badge: "pixel-badge-ok" },
  }[status];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <PixelPanel>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 0" }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: "var(--c-bg3)",
              border: "2px solid var(--c-orange)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-glow-orange)",
            }}
          >
            <Icon name={icon} size={32} style={{ color: "var(--c-orange)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="font-pixel text-orange" style={{ fontSize: "1.2rem", letterSpacing: "0.05em" }}>
              {title}
            </div>
            <div className="font-term text-dim" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
              {description}
            </div>
          </div>
          <span className={`pixel-badge ${statusInfo.badge}`}>{statusInfo.label}</span>
        </div>
      </PixelPanel>

      <PixelPanel title="MODULE PREVIEW">
        <div style={{ textAlign: "center", padding: "2rem 0" }}>
          <div
            style={{
              display: "inline-flex",
              padding: "2rem",
              background: "var(--c-bg3)",
              border: "2px dashed var(--c-rule)",
              position: "relative",
            }}
          >
            <Icon name={icon} size={64} style={{ color: "var(--c-muted)", opacity: 0.4 }} />
            <div
              style={{
                position: "absolute",
                bottom: "-0.6rem",
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--c-bg2)",
                padding: "0 0.5rem",
              }}
            >
              <span className="font-pixel text-muted" style={{ fontSize: "0.6rem" }}>COMING SOON</span>
            </div>
          </div>
          <div className="font-term text-dim" style={{ fontSize: "0.85rem", marginTop: "1.5rem", maxWidth: 400, margin: "1.5rem auto 0" }}>
            This module is part of the Lucy MVP roadmap. The architecture and UI components are ready — 
            connect a real device or use virtual mode to start development.
          </div>
        </div>
      </PixelPanel>
    </div>
  );
};
