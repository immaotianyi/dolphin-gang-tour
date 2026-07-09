/**
 * 关于/署名页面 — 展示作者信息、贡献者、技术栈、开源组件、版本历史、链接
 */
import React from "react";
import { Icon } from "@/components/Icon";

/** 技术栈条目 */
const TECH_STACK = [
  { name: "Tauri 2.0", role: "桌面框架", license: "MIT" },
  { name: "Rust", role: "后端语言", license: "MIT/Apache-2.0" },
  { name: "React 18", role: "前端框架", license: "MIT" },
  { name: "TypeScript", role: "类型系统", license: "Apache-2.0" },
  { name: "Zustand", role: "状态管理", license: "MIT" },
  { name: "Tailwind CSS", role: "样式工具", license: "MIT" },
  { name: "serialport-rs", role: "串口通信", license: "MIT" },
  { name: "prost", role: "Protobuf 编解码", license: "MIT" },
  { name: "dfu-util", role: "固件刷写（独立组件）", license: "GPL-2.0" },
];

/** 版本历史 */
const VERSION_HISTORY = [
  { version: "v1.0.0", date: "2026-07-07", changes: "品牌合规重构、电子宠物进化系统、Toast 通知、学习仪表盘、主题切换、键盘快捷键" },
  { version: "v0.9.0", date: "2026-07-06", changes: "39 项缺陷修复、Windows 驱动检测增强、GPIO 沙盘、成就系统" },
  { version: "v0.8.0", date: "2026-07-05", changes: "多模型路由、数据脱敏层、虚拟设备模拟、一键资源导入" },
  { version: "v0.7.0", date: "2026-07-04", changes: "初始原型：Tauri + Rust + React 基础架构" },
];

const ABOUT_CSS = `
@keyframes about-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.about-section { animation: about-fade-in 0.3s ease-out; }
.about-link:hover { color: var(--c-orange) !important; text-decoration: underline; }
`;

export const AboutModal: React.FC = () => {
  return (
    <div>
      <style>{ABOUT_CSS}</style>

      {/* ---------- 品牌标识 ---------- */}
      <div className="about-section" style={{ textAlign: "center", marginBottom: 16 }}>
        <div className="bob" style={{ display: "inline-block", marginBottom: 8 }}>
          <Icon name="dolphin" size={48} style={{ color: "var(--c-orange)" }} />
        </div>
        <div className="font-pixel text-orange" style={{ fontSize: 14 }}>
          Dolphin Gang Tour
        </div>
        <div className="font-term text-dim" style={{ fontSize: 12, marginTop: 4 }}>
          v2.0.0-beta.0 | MIT License
        </div>
        <div className="font-term text-dim" style={{ fontSize: 11, marginTop: 2 }}>
          Flipper Zero 桌面伴侣 · 资源管理 · 固件刷写 · 学习指导
        </div>
      </div>

      {/* ---------- 开发团队 ---------- */}
      <div className="about-section" style={{ marginBottom: 14 }}>
        <div className="font-pixel text-orange" style={{ fontSize: 9, marginBottom: 8 }}>
          DEVELOPERS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            className="fw-card"
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}
          >
            <Icon name="user" size={28} style={{ color: "var(--c-green)" }} />
            <div style={{ flex: 1 }}>
              <div className="font-pixel text-orange" style={{ fontSize: 9 }}>
                immaotianyi
              </div>
              <div className="font-term text-dim" style={{ fontSize: 12 }}>
                Maintainer · Product & Design
              </div>
            </div>
            <a
              href="https://github.com/immaotianyi"
              target="_blank"
              rel="noopener noreferrer"
              className="about-link font-term"
              style={{ fontSize: 12, color: "var(--c-green)", textDecoration: "none" }}
            >
              GitHub
            </a>
          </div>
          <div
            className="fw-card"
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}
          >
            <Icon name="user" size={28} style={{ color: "var(--c-green)" }} />
            <div style={{ flex: 1 }}>
              <div className="font-pixel text-orange" style={{ fontSize: 9 }}>
                naante845
              </div>
              <div className="font-term text-dim" style={{ fontSize: 12 }}>
                Lead Developer · Android / Release / Infrastructure
              </div>
            </div>
            <a
              href="https://github.com/naante845"
              target="_blank"
              rel="noopener noreferrer"
              className="about-link font-term"
              style={{ fontSize: 12, color: "var(--c-green)", textDecoration: "none" }}
            >
              GitHub
            </a>
          </div>
        </div>
      </div>

      {/* ---------- 社区贡献 ---------- */}
      <div className="about-section" style={{ marginBottom: 14 }}>
        <div className="font-pixel text-orange" style={{ fontSize: 9, marginBottom: 6 }}>
          CONTRIBUTORS
        </div>
        <div className="font-term text-dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
          <Icon name="heart" size={12} style={{ color: "var(--c-red)", verticalAlign: "middle", marginRight: 4 }} />
          欢迎通过 Pull Request 贡献 — 详见
          <a
            href="https://github.com/immaotianyi/dolphin-gang-tour/blob/main/flipper-ai-tutor/CONTRIBUTING.md"
            target="_blank"
            rel="noopener noreferrer"
            className="about-link"
            style={{ color: "var(--c-green)", textDecoration: "none", marginLeft: 4 }}
          >
            CONTRIBUTING.md
          </a>
        </div>
      </div>

      {/* ---------- 技术栈 ---------- */}
      <div className="about-section" style={{ marginBottom: 14 }}>
        <div className="font-pixel text-orange" style={{ fontSize: 9, marginBottom: 8 }}>
          TECH STACK
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {TECH_STACK.map((t) => (
            <div
              key={t.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 8px",
                background: "var(--c-dark2)",
                border: "1px solid var(--c-dark3)",
              }}
            >
              <span className="font-term" style={{ fontSize: 13, color: "var(--c-orange)", minWidth: 100 }}>
                {t.name}
              </span>
              <span className="font-term text-dim" style={{ fontSize: 12, flex: 1 }}>
                {t.role}
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  color: t.license.includes("GPL") ? "var(--c-red)" : "var(--c-green)",
                  border: `1px solid ${t.license.includes("GPL") ? "var(--c-red)" : "var(--c-green)"}`,
                  padding: "0 4px",
                }}
              >
                {t.license}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- 开源声明 ---------- */}
      <div className="about-section" style={{ marginBottom: 14 }}>
        <div className="font-pixel text-orange" style={{ fontSize: 9, marginBottom: 6 }}>
          OPEN SOURCE
        </div>
        <div
          style={{
            background: "var(--c-dark2)",
            border: "1px solid var(--c-gray)",
            padding: "8px 12px",
          }}
        >
          <div className="font-term text-dim" style={{ fontSize: 12, lineHeight: 1.7 }}>
            Dolphin Gang Tour 基于 MIT 许可证开源。
            <br />
            "Flipper Zero" 是 Flipper Devices Inc. 的注册商标，本产品为非官方社区项目。
            <br />
            游戏资源（.fap）来自 xMasterX/all-the-plugins（GPL-3.0），通过下载脚本获取。
            <br />
            主题资源来自社区贡献者，各自保留版权。
            <br />
            dfu-util 为 GPL-2.0 独立组件，用户需自行安装。
          </div>
        </div>
      </div>

      {/* ---------- 版本历史 ---------- */}
      <div className="about-section" style={{ marginBottom: 14 }}>
        <div className="font-pixel text-orange" style={{ fontSize: 9, marginBottom: 8 }}>
          CHANGELOG
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {VERSION_HISTORY.map((v) => (
            <div key={v.version} className="fw-card" style={{ padding: "6px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span className="font-pixel text-orange" style={{ fontSize: 8 }}>{v.version}</span>
                <span className="font-mono text-dim" style={{ fontSize: 10 }}>{v.date}</span>
              </div>
              <div className="font-term text-dim" style={{ fontSize: 12 }}>
                {v.changes}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- 链接 ---------- */}
      <div className="about-section" style={{ marginBottom: 8 }}>
        <div className="font-pixel text-orange" style={{ fontSize: 9, marginBottom: 8 }}>
          LINKS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <a
            href="https://github.com/immaotianyi/dolphin-gang-tour"
            target="_blank"
            rel="noopener noreferrer"
            className="about-link btn"
            style={{ fontSize: 12, textDecoration: "none", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <Icon name="folder" size={14} />
            仓库
          </a>
          <a
            href="https://github.com/immaotianyi/dolphin-gang-tour/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="about-link btn"
            style={{ fontSize: 12, textDecoration: "none", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <Icon name="bug" size={14} />
            反馈
          </a>
          <a
            href="https://github.com/immaotianyi/dolphin-gang-tour/blob/main/THIRDPARTY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="about-link btn"
            style={{ fontSize: 12, textDecoration: "none", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <Icon name="shield" size={14} />
            第三方许可
          </a>
          <a
            href="https://github.com/immaotianyi/dolphin-gang-tour/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            className="about-link btn"
            style={{ fontSize: 12, textDecoration: "none", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <Icon name="book" size={14} />
            更新日志
          </a>
        </div>
      </div>

      {/* ---------- 版权 ---------- */}
      <div
        className="font-term text-dim"
        style={{ fontSize: 11, textAlign: "center", marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--c-gray)" }}
      >
        © 2026 Dolphin Gang Tour. Licensed under the MIT License.
        <br />
        Made with <Icon name="heart" size={10} style={{ color: "var(--c-red)", verticalAlign: "middle" }} /> for the Flipper Zero community.
      </div>
    </div>
  );
};

export default AboutModal;
