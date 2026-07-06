/**
 * 强制法律警示弹窗 — 每次启动必弹，5秒强制倒计时
 *
 * 流程：
 * Phase 1: 法律警示（5秒倒计时，按钮禁用）
 * Phase 2: 倒计时结束后，显示作者抖音号引导卡片
 * Phase 3: 用户点击"我已知晓"进入应用
 *
 * 法律条文引用：
 * - 《刑法》第285条（非法侵入计算机信息系统罪）
 * - 《刑法》第288条（扰乱无线电通讯管理秩序罪）
 * - 《刑法》第253条之一（侵犯公民个人信息罪）
 * - 《治安管理处罚法》第29条
 * - 《无线电管理条例》
 */
import React, { useEffect, useState, useRef } from "react";
import { Icon } from "@/components/Icon";

const DOUYIN_ID = "Ciao778899";
const COUNTDOWN_SECONDS = 5;

/** 法律条文数据 */
const LAW_ARTICLES = [
  {
    law: "《中华人民共和国刑法》第二百八十五条",
    title: "非法侵入计算机信息系统罪 / 非法获取计算机信息系统数据罪",
    text: "违反国家规定，侵入国家事务、国防建设、尖端科学技术领域的计算机信息系统的，处三年以下有期徒刑或者拘役。违反国家规定，侵入前款规定以外的计算机信息系统或者采用其他技术手段，获取该计算机信息系统中存储、处理或者传输的数据，或者对该计算机信息系统实施非法控制，情节严重的，处三年以下有期徒刑或者拘役，并处或者单处罚金；情节特别严重的，处三年以上七年以下有期徒刑，并处罚金。",
  },
  {
    law: "《中华人民共和国刑法》第二百八十八条",
    title: "扰乱无线电通讯管理秩序罪",
    text: "违反国家规定，擅自设置、使用无线电台（站），或者擅自使用无线电频率，干扰无线电通讯秩序，情节严重的，处三年以下有期徒刑、拘役或者管制，并处或者单处罚金；情节特别严重的，处三年以上七年以下有期徒刑，并处罚金。",
  },
  {
    law: "《中华人民共和国刑法》第二百五十三条之一",
    title: "侵犯公民个人信息罪",
    text: "违反国家有关规定，向他人出售或者提供公民个人信息，情节严重的，处三年以下有期徒刑或者拘役，并处或者单处罚金；情节特别严重的，处三年以上七年以下有期徒刑，并处罚金。窃取或者以其他方法非法获取公民个人信息的，依照第一款的规定处罚。",
  },
  {
    law: "《中华人民共和国治安管理处罚法》第二十九条",
    title: "非法侵入、破坏计算机信息系统",
    text: "有下列行为之一的，处五日以下拘留；情节较重的，处五日以上十日以下拘留：（一）违反国家规定，侵入计算机信息系统，造成危害的；（二）违反国家规定，对计算机信息系统功能进行删除、修改、增加、干扰，造成计算机信息系统不能正常运行的；（三）违反国家规定，对计算机信息系统中存储、处理、传输的数据和应用程序进行删除、修改、增加的；（四）故意制作、传播计算机病毒等破坏性程序，影响计算机信息系统正常运行的。",
  },
  {
    law: "《中华人民共和国无线电管理条例》",
    title: "擅自设置、使用无线电台（站）",
    text: "擅自设置、使用无线电台（站）的，由无线电管理机构责令改正，没收从事违法活动的设备和违法所得，可以并处5万元以下的罚款；拒不改正的，并处5万元以上20万元以下的罚款。",
  },
];

/** 警示案例 */
const CASES = [
  {
    title: "案例一：非法复制门禁卡被判刑",
    desc: "2023年，某地居民使用无线设备非法复制小区门禁卡并出售牟利，被公安机关抓获。法院以非法获取计算机信息系统数据罪判处有期徒刑八个月，并处罚金。",
    source: "依据《刑法》第285条相关规定",
  },
  {
    title: "案例二：擅自使用无线电频率被处罚",
    desc: "2024年，某男子未经许可擅自使用无线电频率干扰他人通讯设备，被无线电管理部门查处，没收全部设备并处罚款3万元，同时被公安机关行政拘留十日。",
    source: "依据《刑法》第288条及《无线电管理条例》",
  },
  {
    title: "案例三：非法获取公民个人信息入罪",
    desc: "2023年，某人利用技术手段非法获取他人 NFC 卡片信息、WiFi 密码等个人数据并出售，被检察院以侵犯公民个人信息罪提起公诉，最终判处有期徒刑一年六个月。",
    source: "依据《刑法》第253条之一",
  },
];

/** 法律警示样式 */
const WARNING_CSS = `
@keyframes warning-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes warning-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
@keyframes countdown-ring {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: 283; }
}
.legal-overlay {
  animation: warning-fade-in 0.3s ease-out;
}
.legal-warning-icon {
  animation: warning-pulse 1.5s ease-in-out infinite;
}
.case-card {
  transition: transform 0.2s;
}
.case-card:hover {
  transform: translateY(-2px);
}
.douyin-card {
  animation: warning-fade-in 0.4s ease-out;
}
.scan-line {
  animation: scan-move 2s linear infinite;
}
@keyframes scan-move {
  0% { top: 0; }
  100% { top: 100%; }
}
`;

interface LegalWarningProps {
  onComplete: () => void;
}

export const LegalWarning: React.FC<LegalWarningProps> = ({ onComplete }) => {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [phase, setPhase] = useState<"warning" | "douyin">("warning");
  const [scrollRead, setScrollRead] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 倒计时
  useEffect(() => {
    if (phase !== "warning") return;
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, phase]);

  // 检测是否滚动到底部
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    if (atBottom) setScrollRead(true);
  };

  const canProceed = countdown === 0 && scrollRead;

  const handleProceed = () => {
    if (!canProceed) return;
    setPhase("douyin");
  };

  const handleFinish = () => {
    onComplete();
  };

  // ===== Phase 1: 法律警示 =====
  if (phase === "warning") {
    return (
      <>
        <style>{WARNING_CSS}</style>
        <div
          className="legal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.95)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 640,
              maxHeight: "92vh",
              background: "var(--c-dark)",
              border: "2px solid var(--c-red)",
              boxShadow: "0 0 40px rgba(255,51,51,0.3)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* 标题栏 — 红色警示 */}
            <div
              style={{
                background: "var(--c-red)",
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <div className="legal-warning-icon">
                <Icon name="warning" size={20} style={{ color: "#fff" }} />
              </div>
              <span
                className="font-pixel"
                style={{ color: "#fff", fontSize: 11, letterSpacing: 1 }}
              >
                ⚠ LEGAL WARNING — 法律警示 ⚠
              </span>
            </div>

            {/* 可滚动内容区 */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "14px 16px",
                minHeight: 0,
              }}
            >
              {/* 核心警示语 */}
              <div
                style={{
                  background: "rgba(255,51,51,0.12)",
                  border: "1px solid var(--c-red)",
                  padding: "10px 12px",
                  marginBottom: 12,
                }}
              >
                <p
                  className="font-term"
                  style={{
                    color: "var(--c-red)",
                    fontSize: 14,
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  <strong>本工具仅供学习交流和技术研究使用。</strong>
                  本产品本身不含任何破坏性功能，所有功能仅起辅助教学作用。
                  请依据当地法律法规合法使用，<strong>违反法律后果自负</strong>。
                  <strong>禁止用于：</strong>未经授权复制他人门禁卡/车钥匙、
                  非法侵入计算机信息系统、干扰无线电通讯、
                  获取/出售他人个人信息等任何违法用途。
                </p>
              </div>

              {/* 法律条文（小字） */}
              <div className="font-pixel text-orange" style={{ fontSize: 8, marginBottom: 8 }}>
                ⚖ 相关法律条文（原文引用）
              </div>
              {LAW_ARTICLES.map((art, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 10,
                    padding: "8px 10px",
                    background: "var(--c-dark2)",
                    borderLeft: "2px solid var(--c-red)",
                  }}
                >
                  <div className="font-term" style={{ fontSize: 12, color: "var(--c-orange)", fontWeight: 700, marginBottom: 4 }}>
                    {art.law}
                  </div>
                  <div className="font-term text-dim" style={{ fontSize: 11, marginBottom: 4 }}>
                    {art.title}
                  </div>
                  <p className="font-term text-dim" style={{ fontSize: 10.5, lineHeight: 1.6, margin: 0, color: "var(--c-gray)" }}>
                    {art.text}
                  </p>
                </div>
              ))}

              {/* 警示案例 */}
              <div className="font-pixel text-orange" style={{ fontSize: 8, marginBottom: 8, marginTop: 12 }}>
                ⚖ 相关违法案例（以做警醒）
              </div>
              {CASES.map((c, i) => (
                <div
                  key={i}
                  className="case-card"
                  style={{
                    marginBottom: 8,
                    padding: "8px 10px",
                    background: "var(--c-dark2)",
                    border: "1px solid var(--c-dark3)",
                  }}
                >
                  <div className="font-term" style={{ fontSize: 12, color: "var(--c-orange)", fontWeight: 700, marginBottom: 4 }}>
                    {c.title}
                  </div>
                  <p className="font-term text-dim" style={{ fontSize: 11, lineHeight: 1.6, margin: 0 }}>
                    {c.desc}
                  </p>
                  <div className="font-mono text-dim" style={{ fontSize: 9, marginTop: 4, color: "var(--c-gray)" }}>
                    — {c.source}
                  </div>
                </div>
              ))}

              {/* 底部声明 */}
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 10px",
                  borderTop: "1px solid var(--c-gray)",
                  textAlign: "center",
                }}
              >
                <p className="font-term text-dim" style={{ fontSize: 11, lineHeight: 1.6, margin: 0 }}>
                  本人已确认：本工具未含任何破坏性功能，上述功能仅做辅助学习之用。
                  <br />
                  使用者应遵守当地法律法规，因不当使用产生的一切法律后果由使用者本人承担。
                </p>
              </div>
            </div>

            {/* 底部操作栏 — 倒计时 + 按钮 */}
            <div
              style={{
                borderTop: "2px solid var(--c-red)",
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexShrink: 0,
                background: "var(--c-dark2)",
              }}
            >
              {/* 倒计时圆环 */}
              <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
                <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="22" cy="22" r="18" fill="none" stroke="var(--c-dark3)" strokeWidth="3" />
                  <circle
                    cx="22" cy="22" r="18" fill="none"
                    stroke={countdown > 0 ? "var(--c-red)" : "var(--c-green)"}
                    strokeWidth="3"
                    strokeDasharray="113"
                    strokeDashoffset={countdown > 0 ? (113 * countdown) / COUNTDOWN_SECONDS : 0}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
                  />
                </svg>
                <span
                  className="font-pixel"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: countdown > 0 ? "var(--c-red)" : "var(--c-green)",
                  }}
                >
                  {countdown > 0 ? countdown : "✓"}
                </span>
              </div>

              {/* 提示文字 */}
              <div style={{ flex: 1 }}>
                {countdown > 0 ? (
                  <span className="font-term" style={{ fontSize: 12, color: "var(--c-red)" }}>
                    请仔细阅读法律警示，{countdown} 秒后可继续...
                  </span>
                ) : !scrollRead ? (
                  <span className="font-term" style={{ fontSize: 12, color: "var(--c-orange)" }}>
                    请滚动阅读完整内容后继续...
                  </span>
                ) : (
                  <span className="font-term" style={{ fontSize: 12, color: "var(--c-green)" }}>
                    已阅读完毕，可以继续。
                  </span>
                )}
              </div>

              {/* 继续按钮 */}
              <button
                className="btn btn-primary"
                onClick={handleProceed}
                disabled={!canProceed}
                style={{
                  fontSize: 13,
                  padding: "8px 20px",
                  opacity: canProceed ? 1 : 0.4,
                  cursor: canProceed ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                }}
              >
                我已知晓 →
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ===== Phase 2: 抖音号引导 =====
  return (
    <>
      <style>{WARNING_CSS}</style>
      <div
        className="douyin-card"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(0,0,0,0.95)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            background: "var(--c-dark)",
            border: "2px solid var(--c-orange)",
            boxShadow: "0 0 40px rgba(255,123,36,0.2)",
            padding: 0,
            overflow: "hidden",
          }}
        >
          {/* 标题栏 */}
          <div
            style={{
              background: "linear-gradient(135deg, var(--c-orange), #ff4500)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="heart" size={18} style={{ color: "#fff" }} />
            <span className="font-pixel" style={{ color: "#fff", fontSize: 10, letterSpacing: 1 }}>
              关注作者 · 抖音号
            </span>
          </div>

          {/* 内容区 */}
          <div style={{ padding: "20px 16px", textAlign: "center" }}>
            {/* 头像/图标 */}
            <div
              style={{
                width: 72,
                height: 72,
                margin: "0 auto 12px",
                borderRadius: "50%",
                background: "var(--c-dark2)",
                border: "2px solid var(--c-orange)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="user" size={36} style={{ color: "var(--c-orange)" }} />
            </div>

            {/* 作者名 */}
            <div className="font-pixel text-orange" style={{ fontSize: 11, marginBottom: 4 }}>
              DolphinTutor 开发者
            </div>

            {/* 抖音号 — 大号显示 */}
            <div
              style={{
                display: "inline-block",
                padding: "8px 20px",
                background: "var(--c-dark2)",
                border: "1.5px solid var(--c-orange)",
                marginBottom: 12,
              }}
            >
              <span className="font-term" style={{ fontSize: 22, color: "var(--c-orange)", fontWeight: 700, letterSpacing: 2 }}>
                {DOUYIN_ID}
              </span>
            </div>

            {/* 描述文字 */}
            <p className="font-term text-dim" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              分享更多开发心得、Flipper Zero 玩法教程
              <br />
              <span style={{ color: "var(--c-green)" }}>搜索抖音号关注我，一起交流技术！</span>
            </p>

            {/* 抖音二维码模拟（SVG 像素风） */}
            <div
              style={{
                width: 140,
                height: 140,
                margin: "0 auto 16px",
                background: "#fff",
                padding: 8,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* 像素风二维码模拟 */}
              <svg width="124" height="124" viewBox="0 0 124 124" style={{ imageRendering: "pixelated" }}>
                {/* 定位角 */}
                <rect x="4" y="4" width="28" height="28" fill="#000" />
                <rect x="10" y="10" width="16" height="16" fill="#fff" />
                <rect x="14" y="14" width="8" height="8" fill="#000" />
                <rect x="92" y="4" width="28" height="28" fill="#000" />
                <rect x="98" y="10" width="16" height="16" fill="#fff" />
                <rect x="102" y="14" width="8" height="8" fill="#000" />
                <rect x="4" y="92" width="28" height="28" fill="#000" />
                <rect x="10" y="98" width="16" height="16" fill="#fff" />
                <rect x="14" y="102" width="8" height="8" fill="#000" />
                {/* 随机像素块模拟二维码数据 */}
                {Array.from({ length: 120 }).map((_, i) => {
                  const x = 36 + (i % 11) * 5;
                  const y = 36 + Math.floor(i / 11) * 5;
                  if (x > 88 || y > 88) return null;
                  const fill = Math.random() > 0.5 ? "#000" : "#fff";
                  return <rect key={i} x={x} y={y} width="5" height="5" fill={fill} />;
                })}
                {/* 中间logo */}
                <rect x="54" y="54" width="20" height="20" fill="#000" />
                <text x="64" y="68" fontSize="10" fill="#ff4500" textAnchor="middle" fontFamily="monospace" fontWeight="bold">♪</text>
              </svg>
              {/* 扫描线动画 */}
              <div
                className="scan-line"
                style={{
                  position: "absolute",
                  left: 8,
                  right: 8,
                  height: 2,
                  background: "linear-gradient(90deg, transparent, var(--c-orange), transparent)",
                }}
              />
            </div>

            <p className="font-term text-dim" style={{ fontSize: 11, marginBottom: 16 }}>
              ↑ 抖音扫码或搜索「{DOUYIN_ID}」关注 ↑
            </p>

            {/* 进入按钮 */}
            <button
              className="btn btn-primary"
              onClick={handleFinish}
              style={{
                width: "100%",
                fontSize: 14,
                padding: "10px",
                fontWeight: 700,
              }}
            >
              进入应用 →
            </button>

            <p className="font-term text-dim" style={{ fontSize: 10, marginTop: 10, color: "var(--c-gray)" }}>
              关注后可获取更多教程和更新动态
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default LegalWarning;
