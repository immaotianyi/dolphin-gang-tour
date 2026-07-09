/**
 * 故障诊断面板（主视图）
 * - 诊断结果列表：每项显示级别图标(ok=check绿/warning=warning黄/error=cross红) + 标题 + 详情
 * - 可自动修复的显示 "FIX" 按钮
 * - 一键 Dump 按钮：打包日志
 * - 重新扫描按钮
 */
import React, { useEffect } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useDiagnosticStore } from "@/stores/diagnosticStore";
import type { DiagnosticResult } from "@/types";

/** 根据诊断级别返回图标、颜色、徽章 */
function levelMeta(level: DiagnosticResult["level"]): {
  icon: IconName;
  color: string;
  badge: string;
  badgeText: string;
} {
  switch (level) {
    case "ok":
      return { icon: "check", color: "var(--c-green)", badge: "badge-ok", badgeText: "OK" };
    case "warning":
      return { icon: "warning", color: "var(--c-yellow)", badge: "badge-warn", badgeText: "WARN" };
    case "error":
    default:
      return { icon: "cross", color: "var(--c-red)", badge: "badge-err", badgeText: "ERR" };
  }
}

export const DiagnosticPanel: React.FC = () => {
  const { results, isScanning, isDumping, lastScanAt, scan, applyFix, dump } =
    useDiagnosticStore();

  // 首次挂载自动扫描一次
  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const okCount = results.filter((r) => r.level === "ok").length;
  const warnCount = results.filter((r) => r.level === "warning").length;
  const errCount = results.filter((r) => r.level === "error").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 标题栏 */}
      <div className="term-titlebar" style={{ flexShrink: 0 }}>
        <span className="term-dot red" />
        <span className="term-dot yellow" />
        <span className="term-dot green" />
        <Icon name="search" size={18} />
        <span className="font-pixel" style={{ fontSize: 10, color: "var(--c-white)" }}>
          DIAGNOSTIC PANEL
        </span>
      </div>

      {/* 操作栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderBottom: "1px solid var(--c-gray)",
          flexWrap: "wrap",
          background: "var(--c-dark2)",
          flexShrink: 0,
        }}
      >
        <button className="btn" onClick={scan} disabled={isScanning}>
          <Icon name="refresh" size={14} />
          {isScanning ? "扫描中..." : "重新扫描"}
        </button>
        <button className="btn btn-primary" onClick={dump} disabled={isDumping}>
          <Icon name="save" size={14} />
          {isDumping ? "打包中..." : "一键 Dump 日志"}
        </button>
        <div style={{ flex: 1 }} />
        <span className="badge badge-ok">OK {okCount}</span>
        <span className="badge badge-warn">WARN {warnCount}</span>
        <span className="badge badge-err">ERR {errCount}</span>
        {lastScanAt && (
          <span className="font-mono text-dim" style={{ fontSize: 11 }}>
            上次扫描: {new Date(lastScanAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* 结果列表 */}
      <div className="scroll-y" style={{ flex: 1, padding: "6px 10px", minHeight: 0 }}>
        {isScanning && results.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center" }}>
            <div className="bob" style={{ color: "var(--c-orange)", marginBottom: 10 }}>
              <Icon name="search" size={32} />
            </div>
            <div className="font-pixel text-orange blink" style={{ fontSize: 9 }}>
              SCANNING DEVICE...
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="font-term text-dim" style={{ padding: 30, textAlign: "center", fontSize: 18 }}>
            暂无诊断结果，点上方「重新扫描」。
          </div>
        ) : (
          results.map((r, i) => {
            const meta = levelMeta(r.level);
            return (
              <div key={i} className="diag-row">
                <span style={{ color: meta.color, display: "flex", alignItems: "center" }}>
                  <Icon name={meta.icon} size={22} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span className={`badge ${meta.badge}`}>{meta.badgeText}</span>
                    <span className="font-mono text-dim" style={{ fontSize: 11 }}>
                      [{r.category}]
                    </span>
                    <span style={{ color: meta.color, fontWeight: 600, fontSize: 15 }}>
                      {r.title}
                    </span>
                  </div>
                  <div className="font-term text-dim" style={{ fontSize: 15, whiteSpace: "pre-wrap" }}>
                    {r.detail}
                  </div>
                </div>
                <div>
                  {r.autoFixable && (
                    <button
                      className="btn btn-primary"
                      onClick={() => applyFix(i)}
                      style={{ padding: "2px 8px", fontSize: "0.95rem" }}
                    >
                      <Icon name="wrench" size={14} />
                      FIX
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DiagnosticPanel;
