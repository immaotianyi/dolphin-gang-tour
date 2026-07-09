/**
 * 固件管理（主视图）
 * - 固件选择卡片列表（Momentum/Unleashed/OFW），每项显示名称 + 描述 + 推荐标签
 * - 当前固件版本显示
 * - 刷写按钮 + 安全警告（电量需 >=30%，传输中禁止拔出）
 * - 刷写进度：阶段(downloading/checking/flashing/verifying/rebooting) + 进度条 + 状态消息
 * - DFU 模式检测时显示 "RECOVERY MODE DETECTED" + 一键救砖按钮(红色高亮)
 */
import React, { useCallback } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useFirmwareStore } from "@/stores/firmwareStore";
import { useDeviceStore } from "@/stores/deviceStore";
import { isTauri } from "@/lib/tauri";
import type { FlashPhase } from "@/types";

/** 各阶段中文标签 */
const PHASE_LABEL: Record<FlashPhase, string> = {
  idle: "空闲",
  downloading: "下载固件",
  checking: "校验完整性",
  "entering-dfu": "进入 DFU",
  flashing: "刷写中",
  verifying: "验证闪存",
  rebooting: "重启设备",
  done: "完成",
  error: "出错",
};

/** 各阶段对应的图标 */
const PHASE_ICON: Record<FlashPhase, IconName> = {
  idle: "chip",
  downloading: "download",
  checking: "shield",
  "entering-dfu": "power",
  flashing: "wrench",
  verifying: "check",
  rebooting: "refresh",
  done: "check",
  error: "warning",
};

/** 字节格式化 */
function fmtBytes(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + " KB";
  return n + " B";
}

export const FirmwareManager: React.FC = () => {
  const {
    firmwares,
    currentVersion,
    selectedId,
    flashProgress,
    isFlashing,
    isDfuMode,
    firmwareFilePath,
    select,
    startFlash,
    rescue,
    cancel,
    enterDfu,
    setFirmwareFilePath,
  } = useFirmwareStore();
  const { deviceInfo } = useDeviceStore();

  const battery = deviceInfo?.batteryLevel ?? 0;
  const batteryOk = battery >= 30;
  const selected = firmwares.find((f) => f.id === selectedId) ?? firmwares[0];
  const pct = flashProgress?.progress ?? 0;
  const done = flashProgress?.phase === "done";

  /** 选择固件文件（Tauri 模式尝试用 dialog 插件，失败回退到 input） */
  const handleSelectFile = useCallback(async () => {
    if (isTauri()) {
      try {
        // 动态导入 dialog 插件，如未安装则回退
        const dialogMod = await import("@tauri-apps/plugin-dialog");
        const selected = await dialogMod.open({
          multiple: false,
          filters: [
            {
              name: "固件包",
              extensions: ["zip", "tar.gz", "tgz", "dfu", "fuf"],
            },
          ],
        });
        if (typeof selected === "string") {
          setFirmwareFilePath(selected);
        }
      } catch {
        // 插件未安装，回退到 input
        triggerFileInput();
      }
    } else {
      triggerFileInput();
    }
  }, [setFirmwareFilePath]);

  /** 浏览器模式文件选择回退 */
  const triggerFileInput = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,.tar.gz,.tgz,.dfu,.fuf";
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        // 浏览器模式只能拿到文件名（无法获取真实路径）
        setFirmwareFilePath(target.files[0].name);
      }
    };
    input.click();
  }, [setFirmwareFilePath]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 标题栏 */}
      <div className="term-titlebar" style={{ flexShrink: 0 }}>
        <span className="term-dot red" />
        <span className="term-dot yellow" />
        <span className="term-dot green" />
        <Icon name="wrench" size={18} />
        <span className="font-pixel" style={{ fontSize: 10, color: "var(--c-white)" }}>
          FIRMWARE MANAGER
        </span>
      </div>

      <div className="scroll-y" style={{ flex: 1, padding: 14, minHeight: 0 }}>
        {/* 当前固件版本 */}
        <div
          className="term-card"
          style={{ margin: 0, marginBottom: 12, padding: 0 }}
        >
          <div className="term-titlebar" style={{ borderBottom: "2px solid var(--c-white)" }}>
            <Icon name="chip" size={16} />
            <span className="font-mono text-orange" style={{ fontSize: 13 }}>
              CURRENT FIRMWARE
            </span>
          </div>
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="font-pixel text-green" style={{ fontSize: 11 }}>
              {currentVersion}
            </span>
            <span className="badge badge-ok">API {selected.apiLevel}</span>
            <span
              className={`badge ${batteryOk ? "badge-ok" : "badge-err"}`}
            >
              电量 {battery}%
            </span>
            {!isDfuMode && !isFlashing && (
              <button className="btn" onClick={enterDfu} style={{ marginLeft: "auto" }}>
                <Icon name="power" size={14} />
                模拟进入 DFU
              </button>
            )}
          </div>
        </div>

        {/* DFU 救砖横幅 */}
        {isDfuMode && (
          <div
            className="pixel-border-red"
            style={{
              background: "rgba(255,51,51,0.1)",
              padding: "12px 14px",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span className="led red blink" />
            <Icon name="warning" size={22} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="font-pixel text-red blink" style={{ fontSize: 10 }}>
                RECOVERY MODE DETECTED
              </div>
              <div className="font-mono text-dim" style={{ fontSize: 12 }}>
                设备处于 DFU 恢复模式。点下方按钮一键救砖（刷入 {selected.name}）。
              </div>
            </div>
            <button
              className="btn btn-danger"
              onClick={rescue}
              disabled={isFlashing}
              style={{ fontWeight: "bold" }}
            >
              <Icon name="shield" size={16} />
              一键救砖
            </button>
          </div>
        )}

        {/* 安全警告 */}
        <div
          style={{
            border: "1.5px dashed var(--c-yellow)",
            background: "rgba(255,204,0,0.06)",
            padding: "8px 12px",
            marginBottom: 14,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <span className="text-yellow">
            <Icon name="warning" size={18} />
          </span>
          <div className="font-mono" style={{ fontSize: 13, color: "var(--c-yellow)" }}>
            <strong>安全警告：</strong>刷写期间请保持 USB 连接稳定，
            <span className="text-red">禁止拔出数据线</span>。
            建议电量 <span className={batteryOk ? "text-green" : "text-red"}>&gt;= 30%</span>
            {deviceInfo && !batteryOk && (
              <span className="text-red">（当前 {battery}%，请先充电）</span>
            )}
            。
          </div>
        </div>

        {/* 固件卡片列表 */}
        <div className="font-pixel text-orange" style={{ fontSize: 8, marginBottom: 8 }}>
          SELECT FIRMWARE
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {firmwares.map((fw) => {
            const active = fw.id === selectedId;
            return (
              <div
                key={fw.id}
                className={`fw-card ${active ? "active" : ""}`}
                onClick={() => !isFlashing && select(fw.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Icon name="chip" size={18} />
                  <span className="font-pixel text-white" style={{ fontSize: 10 }}>
                    {fw.name}
                  </span>
                  {fw.recommended && <span className="badge badge-mvp">推荐</span>}
                  <span className="badge badge-new">API {fw.apiLevel}</span>
                  <span className="font-mono text-dim" style={{ fontSize: 11, marginLeft: "auto" }}>
                    {fmtBytes(fw.sizeBytes)}
                  </span>
                </div>
                <div className="font-term text-dim" style={{ fontSize: 15 }}>
                  {fw.description}
                </div>
                {/* 第三方固件风险提示（非 OFW 官方固件） */}
                {fw.id !== "ofw" && (
                  <span style={{ fontSize: 10, color: "#ff4444", display: "block", marginTop: 2 }}>
                    ⚠ 第三方固件可能解除频段锁定，刷写后使用需遵守当地法律
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 刷写按钮 + 进度 */}
        <div style={{ marginTop: 14 }}>
          {/* 文件选择器 */}
          {!isFlashing && !flashProgress && (
            <>
              <div
                style={{
                  border: "1.5px dashed var(--c-gray)",
                  background: "var(--c-dark2)",
                  padding: "8px 12px",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Icon name="chip" size={16} style={{ color: "var(--c-orange)" }} />
                {firmwareFilePath ? (
                  <>
                    <span
                      className="font-mono text-green"
                      style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={firmwareFilePath}
                    >
                      {firmwareFilePath.split("/").pop() ?? firmwareFilePath}
                    </span>
                    <button className="btn" onClick={() => setFirmwareFilePath(null)} style={{ padding: "2px 8px" }}>
                      <Icon name="cross" size={12} />
                      清除
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-term text-dim" style={{ fontSize: 14, flex: 1 }}>
                      未选择固件文件
                    </span>
                  </>
                )}
                <button className="btn" onClick={handleSelectFile}>
                  <Icon name="download" size={14} />
                  选择固件文件
                </button>
              </div>
              {selected?.downloadUrl && (
                <div className="font-term text-dim" style={{ fontSize: 13, marginBottom: 8 }}>
                  <Icon name="warning" size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  下载地址: {selected.downloadUrl}（请下载后选取本地文件）
                </div>
              )}
            </>
          )}

          {!isFlashing && !flashProgress && (
            <button
              className="btn btn-primary"
              onClick={startFlash}
              disabled={(!batteryOk && !isDfuMode) || !firmwareFilePath}
              style={{ width: "100%", justifyContent: "center", padding: "8px" }}
            >
              <Icon name="download" size={18} />
              刷写 {selected?.name ?? ""} 到设备
            </button>
          )}

          {isFlashing && (
            <button className="btn btn-danger" onClick={cancel} style={{ width: "100%", justifyContent: "center" }}>
              <Icon name="cross" size={16} />
              取消刷写
            </button>
          )}

          {flashProgress && (
            <div
              className="term-card"
              style={{ margin: "12px 0 0", padding: 0 }}
            >
              <div className="term-titlebar">
                <Icon name={PHASE_ICON[flashProgress.phase]} size={16} />
                <span className="font-mono text-orange" style={{ fontSize: 13 }}>
                  {done ? "FLASH COMPLETE" : "FLASHING..."}
                </span>
              </div>
              <div style={{ padding: "10px 14px" }}>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${pct}%`,
                      background: done
                        ? "var(--c-green)"
                        : undefined,
                    }}
                  />
                </div>
                <div
                  className="font-mono"
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6 }}
                >
                  <span className="text-green">{pct}%</span>
                  <span className="text-orange">
                    {PHASE_LABEL[flashProgress.phase]}
                  </span>
                </div>
                <div className="font-mono text-dim" style={{ fontSize: 12, marginTop: 6 }}>
                  {flashProgress.message}
                </div>
                {done && (
                  <div className="font-term text-green" style={{ fontSize: 16, marginTop: 8 }}>
                    刷写完成！可以拔掉 USB 开始使用了。
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FirmwareManager;
