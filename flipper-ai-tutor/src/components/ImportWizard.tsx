/**
 * 一键导入向导（主视图，增强动画版，用于抖音录屏展示）
 * - 标题 "ONE-CLICK IMPORT"
 * - 资源包选择列表：遍历 RESOURCE_PACKAGES，每项显示复选框 + 名称 + 大小 + 描述
 * - 全选 / 使用推荐配置 按钮
 * - 导入中状态：显示 "光速写入中，AI暂闭麦..."，进度条（条纹流动），当前文件名（过长滚动），百分比，文件数，速度，ETA
 * - 传输中（transferring 阶段）：进度条上方显示橙绿粒子流动画
 * - 日志区域：终端风格显示步骤日志（[OK]/[..]/[--] 前缀），[OK] 出现时短暂高亮闪烁
 * - 导入完成：显示绿色 "IMPORT COMPLETE" 大字，带脉冲动画
 * - 取消按钮和导入中禁用按钮
 */
import React, { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useImportStore } from "@/stores/importStore";

/** 字节格式化 */
function fmtBytes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " GB";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + " MB";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + " KB";
  return n + " B";
}

/** 资源分类对应的图标 */
const CATEGORY_ICON: Record<string, IconName> = {
  firmware: "chip",
  infrared: "ir",
  nfc: "nfc",
  subghz: "subghz",
  rfid: "card",
  badusb: "badusb",
  tools: "wrench",
  games: "play",
  themes: "mirror",
  music: "tv",
};

/** 日志行渲染（按前缀着色；[OK] 行挂载时触发短暂高亮闪烁） */
const LogLine: React.FC<{ line: string }> = ({ line }) => {
  let cls = "log-line";
  if (line.startsWith("[OK]")) cls += " ok";
  else if (line.startsWith("[..]")) cls += " pending";
  else if (line.startsWith("[--]")) cls += " dim";
  else if (line.startsWith("[ERR]") || line.startsWith("[!!]")) cls += " err";
  return <div className={cls}>{line}</div>;
};

/** 传输中粒子流动画：橙绿光点从左向右流动（纯 CSS，无 emoji） */
const ParticleFlow: React.FC = () => (
  <div className="particle-flow" aria-hidden>
    {Array.from({ length: 10 }).map((_, i) => (
      <span
        key={i}
        className={`pf-dot ${i % 2 === 0 ? "pf-orange" : "pf-green"}`}
        style={{ animationDelay: `${i * 0.12}s` }}
      />
    ))}
  </div>
);

/**
 * 当前文件名显示：过长（>22 字符）时以水平滚动方式展示，否则静态显示。
 * - active（有正在传输的文件）时绿色高亮；等待文件时灰色。
 */
const FileName: React.FC<{ name: string; active: boolean }> = ({
  name,
  active,
}) => {
  const display = active ? name : "等待文件...";
  const long = display.length > 22;
  const color = active ? "var(--c-green)" : "#888";
  const text = `>> ${display}`;
  if (!long) {
    return (
      <div
        className="cur-file-static font-mono"
        style={{ fontSize: 11, marginTop: 4, color }}
      >
        {text}
      </div>
    );
  }
  return (
    <div className="cur-file" style={{ marginTop: 4 }}>
      <div className="cur-file-track">
        <span className="font-mono" style={{ fontSize: 11, color }}>
          {text}
        </span>
        <span className="font-mono" style={{ fontSize: 11, color }}>
          {text}
        </span>
      </div>
    </div>
  );
};

/** ImportWizard 专用动画样式（注入一次） */
const IMPORT_CSS = `
/* 进度条条纹流动 */
@keyframes progress-stripes {
  from { background-position: 0 0; }
  to { background-position: 10px 0; }
}
.progress-flow {
  animation: progress-stripes 0.7s linear infinite;
}

/* 传输中粒子流（橙绿光点从左向右流动） */
.particle-flow {
  position: relative;
  height: 14px;
  margin-bottom: 6px;
  overflow: hidden;
}
.pf-dot {
  position: absolute;
  top: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: pf-flow 1.1s linear infinite;
}
.pf-orange { background: var(--c-orange); box-shadow: 0 0 6px var(--c-orange); }
.pf-green { background: var(--c-green); box-shadow: 0 0 6px var(--c-green); }
@keyframes pf-flow {
  0% { left: -6%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { left: 106%; opacity: 0; }
}

/* 当前文件名滚动（过长时无缝循环） */
.cur-file {
  overflow: hidden;
  white-space: nowrap;
  height: 16px;
  border: 1px dashed var(--c-gray);
  padding: 1px 4px;
}
.cur-file-track {
  display: inline-flex;
  gap: 32px;
  animation: file-marquee 7s linear infinite;
}
.cur-file-track > span {
  flex-shrink: 0;
}
.cur-file-static {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@keyframes file-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

/* 日志 [OK] 步骤完成短暂高亮闪烁（仅导入日志区作用域） */
.import-log .log-line.ok {
  animation: log-ok-flash 0.7s ease-out;
}
@keyframes log-ok-flash {
  0% { background: rgba(0,255,65,0.45); color: #fff; text-shadow: 0 0 6px var(--c-green); }
  100% { background: transparent; color: var(--c-green); text-shadow: none; }
}

/* 导入完成庆祝横幅 */
.import-complete-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px;
  margin-bottom: 8px;
  border: 2px solid var(--c-green);
  background: rgba(0,255,65,0.08);
  color: var(--c-green);
  animation: complete-pulse 1.4s ease-in-out infinite;
}
.import-complete-text {
  font-family: var(--font-pixel);
  font-size: 13px;
  color: var(--c-green);
  letter-spacing: 2px;
}
@keyframes complete-pulse {
  0%, 100% { box-shadow: 0 0 6px var(--c-green); transform: scale(1); }
  50% { box-shadow: 0 0 22px var(--c-green), 0 0 6px var(--c-green); transform: scale(1.03); }
}
`;

export const ImportWizard: React.FC = () => {
  const { packages, checked, progress, isImporting, toggle, selectAll, useRecommended, start, cancel } =
    useImportStore();
  const logRef = useRef<HTMLDivElement>(null);

  // 日志自动滚动到底
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress?.logLines]);

  // 统计选中包
  const selectedPkgs = packages.filter((p) => checked[p.id]);
  const totalSize = selectedPkgs.reduce((s, p) => s + p.sizeBytes, 0);
  const totalFiles = selectedPkgs.reduce((s, p) => s + p.fileCount, 0);

  const pct =
    progress && progress.bytesTotal > 0
      ? Math.min(100, Math.round((progress.bytesTransferred / progress.bytesTotal) * 100))
      : 0;

  const done = progress?.phase === "done";
  const transferring = progress?.phase === "transferring";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 动画样式注入 */}
      <style>{IMPORT_CSS}</style>

      {/* 标题栏 */}
      <div className="term-titlebar" style={{ flexShrink: 0 }}>
        <span className="term-dot red" />
        <span className="term-dot yellow" />
        <span className="term-dot green" />
        <Icon name="rocket" size={18} />
        <span className="font-pixel" style={{ fontSize: 10, color: "var(--c-white)" }}>
          ONE-CLICK IMPORT
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
        <button className="btn" onClick={selectAll} disabled={isImporting}>
          <Icon name="check" size={14} />
          全选
        </button>
        <button className="btn" onClick={useRecommended} disabled={isImporting}>
          <Icon name="shield" size={14} />
          使用推荐配置
        </button>
        <span className="font-mono text-dim" style={{ fontSize: 13 }}>
          已选 {selectedPkgs.length} / {packages.length} 包 | {totalFiles} 文件 | {fmtBytes(totalSize)}
        </span>
        <div style={{ flex: 1 }} />
        {isImporting ? (
          <button className="btn btn-danger" onClick={cancel}>
            <Icon name="cross" size={14} />
            取消导入
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={start}
            disabled={selectedPkgs.length === 0}
          >
            <Icon name="download" size={16} />
            {done ? "重新导入" : "开始导入"}
          </button>
        )}
      </div>

      {/* 主体：左侧包列表 + 右侧进度/日志 */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* 包列表 */}
        <div
          className="scroll-y"
          style={{
            flex: 1,
            minWidth: 0,
            borderRight: "1px solid var(--c-gray)",
            padding: "6px 10px",
          }}
        >
          {packages.map((p) => {
            const isChecked = !!checked[p.id];
            return (
              <div
                key={p.id}
                className="pkg-row"
                onClick={() => !isImporting && toggle(p.id)}
                style={{ opacity: isImporting ? 0.6 : 1, cursor: isImporting ? "default" : "pointer" }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 18,
                    height: 18,
                    border: `1.5px solid ${isChecked ? "var(--c-green)" : "var(--c-gray)"}`,
                    color: "var(--c-green)",
                  }}
                >
                  {isChecked && <Icon name="check" size={14} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name={CATEGORY_ICON[p.category] ?? "package"} size={14} />
                    <span className="text-orange" style={{ fontWeight: 600 }}>
                      {p.name}
                    </span>
                    {p.defaultChecked && <span className="badge badge-mvp">推荐</span>}
                    <span className="badge badge-new">v{p.version}</span>
                  </div>
                  <div className="text-dim font-mono" style={{ fontSize: 12 }}>
                    {p.description}
                  </div>
                  {/* 法律提示：敏感资源类别 */}
                  {p.category === "subghz" && (
                    <span style={{ fontSize: 10, color: "#ff4444", marginLeft: 4 }}>⚠ 信号重放需遵守《无线电管理条例》</span>
                  )}
                  {p.category === "nfc" && (
                    <span style={{ fontSize: 10, color: "#ff4444", marginLeft: 4 }}>⚠ 仅限复制本人合法持有的卡片</span>
                  )}
                  {p.category === "rfid" && (
                    <span style={{ fontSize: 10, color: "#ff4444", marginLeft: 4 }}>⚠ 仅限复制本人合法持有的卡片</span>
                  )}
                  {p.category === "badusb" && (
                    <span style={{ fontSize: 10, color: "#ff4444", marginLeft: 4 }}>⚠ 仅限在自有设备上测试</span>
                  )}
                  <div className="font-mono text-dim" style={{ fontSize: 11 }}>
                    {p.fileCount} 文件 | {fmtBytes(p.sizeBytes)} | -&gt; {p.targetPath}
                  </div>
                </div>
                <span className="font-mono text-green" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {fmtBytes(p.sizeBytes)}
                </span>
              </div>
            );
          })}
        </div>

        {/* 进度 / 日志面板 */}
        <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {progress.phase === "idle" ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                textAlign: "center",
              }}
            >
              <Icon name="rocket" size={40} />
              <div className="font-pixel text-orange" style={{ fontSize: 9, marginTop: 12 }}>
                READY TO LAUNCH
              </div>
              <div className="text-dim font-term" style={{ fontSize: 16, marginTop: 8 }}>
                勾选左侧资源包，点「开始导入」即可光速写入设备。
              </div>
            </div>
          ) : (
            <>
              {/* 进度头部 */}
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--c-gray)" }}>
                <div className="font-pixel text-orange blink" style={{ fontSize: 9, marginBottom: 8 }}>
                  {done ? "导入完成！" : "光速写入中，AI 暂闭麦..."}
                </div>

                {/* 完成庆祝横幅 */}
                {done && (
                  <div className="import-complete-banner">
                    <Icon name="trophy" size={24} />
                    <span className="import-complete-text">IMPORT COMPLETE</span>
                  </div>
                )}

                {/* 传输中粒子流（进度条上方） */}
                {transferring && <ParticleFlow />}

                <div className="progress-bar">
                  <div
                    className={`progress-fill${done ? "" : " progress-flow"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div
                  className="font-mono"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginTop: 4,
                    color: "var(--c-green)",
                  }}
                >
                  <span>{pct}%</span>
                  <span>
                    {progress.filesCompleted} / {progress.filesTotal} 文件
                  </span>
                </div>
                {/* 当前文件名（过长滚动） */}
                <FileName
                  name={progress.currentFile || ""}
                  active={!!progress.currentFile}
                />
                <div className="font-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
                  <span className="text-blue">
                    速度: {fmtBytes(progress.speedBytesPerSec)}/s
                  </span>
                  <span className="text-yellow">
                    ETA: {formatEta(progress.etaSeconds)}
                  </span>
                </div>
                <div className="font-mono text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                  阶段: <span className="text-orange">{phaseLabel(progress.phase)}</span>
                </div>
              </div>

              {/* 日志区 */}
              <div
                ref={logRef}
                className="scroll-y import-log"
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  background: "#000",
                  minHeight: 0,
                }}
              >
                {progress.logLines.map((line, i) => (
                  // key 含行内容：行从 [--]/[..] 变为 [OK] 时 key 改变 -> 重新挂载 -> 触发高亮闪烁
                  <LogLine key={`${i}:${line}`} line={line} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** ETA 格式化 */
function formatEta(sec: number): string {
  if (sec <= 0) return "--";
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.floor(sec / 60)}m${Math.round(sec % 60)}s`;
}

/** 导入阶段文案 */
function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    idle: "空闲",
    backup: "备份中",
    packaging: "打包中",
    flashing: "刷写中",
    transferring: "传输中",
    extracting: "解压中",
    verifying: "校验中",
    refreshing: "刷新索引",
    done: "完成",
    error: "出错",
  };
  return map[phase] ?? phase;
}

export default ImportWizard;
