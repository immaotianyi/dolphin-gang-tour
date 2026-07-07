/**
 * AI 对话主区域（增强动画版，用于抖音录屏展示）
 * - 顶部对话头：标题 "DOLPHIN AI TUTOR" + 绿色 LED + 模型/上下文信息
 * - 消息列表：AI 绿色文本前缀 [AI]，用户白底蓝框前缀 [YOU]；支持图片消息
 * - 消息中渲染按键标签（<span> 模拟物理按键样式，灰底白边内阴影）
 * - 代码块（```...```）渲染为终端风格（黑底绿字、等宽字体、边框）
 * - AI 流式回复打字机效果：逐字显示（30ms/字符），末尾闪烁光标 "_"，打字完成光标消失
 * - AI 思考动画：流式中且内容为空时显示三个跳动的点
 * - 新消息从右侧滑入（slide-in-right）
 * - 快捷操作按钮行：发送截图 / 粘贴日志 / 常见问题 / 我变砖了 / 一键Dump
 * - 底部输入栏：绿色 prompt "user@flipper:~$" + 输入框 + 发送按钮(Icon send)
 * - 空状态（仅欢迎语）显示欢迎语和课程推荐
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { COURSES } from "@/data/courses";
import type { ChatMessage } from "@/types";

/** 匹配 [OK] / 【OK】 等按键标签（兼容半角 [] 与全角 【】 括号） */
const KEY_RE = /[\[【](OK|BACK|UP|DOWN|LEFT|RIGHT|相机|LEFT\+BACK)[\]】]/g;

/** 把消息文本里的按键标签渲染成 <span className="key-tag"> */
function renderKeyTags(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  // 每次调用重建正则，避免 lastIndex 串扰
  const re = new RegExp(KEY_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <span key={`${keyBase}-k${i++}`} className="key-tag">
        {m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * 渲染消息内容：先按 ``` 拆分代码块，再对普通文本段处理按键标签。
 * - 奇数段（位于成对 ``` 之间）渲染为终端风格代码块
 * - 偶数段为普通文本，处理按键标签
 * - 流式中未闭合的代码块也能正确显示为代码块
 */
function renderMessageContent(
  text: string,
  keyBase: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  if (!text) return nodes;
  const segments = text.split("```");
  segments.forEach((seg, idx) => {
    if (idx % 2 === 1) {
      // 代码块段：去掉首尾多余换行后渲染为终端代码块
      const code = seg.replace(/^\n/, "").replace(/\n$/, "");
      nodes.push(
        <pre key={`${keyBase}-code-${idx}`} className="code-block">
          <code>{code}</code>
        </pre>,
      );
    } else if (seg.length > 0) {
      // 普通文本段：处理按键标签
      nodes.push(...renderKeyTags(seg, `${keyBase}-t${idx}`));
    }
  });
  return nodes;
}

/** AI 思考跳动点（三个点错开延迟跳动，纯 CSS 圆点，不含任何 emoji） */
const ThinkingDots: React.FC = () => (
  <span className="think-dots" aria-label="AI 正在思考">
    <span className="think-dot" />
    <span className="think-dot" style={{ animationDelay: "0.15s" }} />
    <span className="think-dot" style={{ animationDelay: "0.3s" }} />
  </span>
);

/**
 * 打字机内容：流式消息逐字显示。
 * - 挂载时启动 30ms 定时器，displayedLen 逐步增长至全文长度
 * - 通过 ref 读取最新全文，避免高频流式 chunk 导致定时器反复重置
 * - 打字中（流式中或尚未显示完全文）显示闪烁光标 "_"，完成后光标消失
 * - 每显示一个字符触发 onTick 回调（用于滚动到底部）
 */
const TypewriterContent: React.FC<{
  msg: ChatMessage;
  onTick?: () => void;
}> = ({ msg, onTick }) => {
  const [displayedLen, setDisplayedLen] = useState(0);
  // 最新全文的 ref（定时器读取，避免依赖变化导致重置）
  const fullTextRef = useRef<string>(msg.content);
  // 定时器句柄
  const intervalRef = useRef<number | null>(null);

  // 同步最新全文到 ref
  useEffect(() => {
    fullTextRef.current = msg.content;
  }, [msg.content]);

  // 挂载时启动 30ms 定时器，逐字增长 displayedLen
  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      setDisplayedLen((prev) => {
        const target = fullTextRef.current.length;
        if (prev < target) return prev + 1;
        return prev;
      });
    }, 30);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // 打字完成（非流式且已显示完全文）后停止定时器，避免空转
  const typing = !!msg.isStreaming || displayedLen < msg.content.length;
  useEffect(() => {
    if (!typing && intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [typing]);

  // 每显示一个字符滚动到底部
  useEffect(() => {
    onTick?.();
  }, [displayedLen, onTick]);

  const shown = msg.content.slice(0, displayedLen);

  return (
    <>
      {renderMessageContent(shown, msg.id)}
      {typing && (
        <span className="blink" style={{ marginLeft: 2 }}>
          _
        </span>
      )}
    </>
  );
};

/** 模拟一张 Flipper 屏幕截图（SVG data URI） */
const MOCK_SCREENSHOT =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='64'>
      <rect width='128' height='64' fill='#000'/>
      <rect x='0' y='0' width='128' height='10' fill='#FF7B24'/>
      <text x='3' y='8' font-family='monospace' font-size='7' fill='#000'>FLIPPER</text>
      <text x='100' y='8' font-family='monospace' font-size='7' fill='#000'>78%</text>
      <text x='4' y='24' font-family='monospace' font-size='9' fill='#FF7B24'>&gt; NFC</text>
      <text x='4' y='36' font-family='monospace' font-size='9' fill='#FF7B24'>  RFID</text>
      <text x='4' y='48' font-family='monospace' font-size='9' fill='#FF7B24'>  Sub-GHz</text>
      <text x='4' y='60' font-family='monospace' font-size='9' fill='#FF7B24'>  Infrared</text>
    </svg>`,
  );

/** 把 data URL 转成 File，便于走 sendImage 通道展示图片消息 */
async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/svg+xml" });
}

/** 透传给快捷操作的对话 API */
interface ChatApi {
  send: (text: string) => void;
  sendImage: (file: File, text?: string) => Promise<void>;
}

/** 快捷操作定义 */
interface QuickAction {
  icon: IconName;
  label: string;
  run: (api: ChatApi) => void | Promise<void>;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: "camera",
    label: "发送截图",
    run: async (api) => {
      const file = await dataUrlToFile(MOCK_SCREENSHOT, "flipper-screen.svg");
      await api.sendImage(file, "请分析我的屏幕截图，我卡在 NFC 菜单了。");
    },
  },
  {
    icon: "clipboard",
    label: "粘贴日志",
    run: (api) =>
      api.send(
        "（粘贴日志）\n[INFO] boot ok\n[WARN] sd card slow\n[ERR] nfc read timeout",
      ),
  },
  {
    icon: "help",
    label: "常见问题",
    run: (api) => api.send("新手常见问题有哪些？我该从哪开始学？"),
  },
  {
    icon: "warning",
    label: "我变砖了",
    run: (api) => api.send("我变砖了怎么办？屏幕完全黑屏没反应。"),
  },
  {
    icon: "save",
    label: "一键Dump",
    run: (api) => api.send("一键 Dump 诊断日志，帮我打包给开发者。"),
  },
];

/** 单条消息渲染（AI 流式消息走打字机；流式空内容显示思考点） */
const MessageBubble: React.FC<{ msg: ChatMessage; onGrow?: () => void }> = ({
  msg,
  onGrow,
}) => {
  const isAi = msg.role === "assistant";
  // 记录该消息是否曾经处于流式状态（用于在流式结束后继续把剩余字符打完）
  const [everStreamed, setEverStreamed] = useState<boolean>(
    !!msg.isStreaming,
  );
  useEffect(() => {
    if (msg.isStreaming) setEverStreamed(true);
  }, [msg.isStreaming]);

  // 流式中且内容为空：显示思考跳动点
  const thinking = isAi && !!msg.isStreaming && msg.content.length === 0;
  // AI 且曾经流式：使用打字机；其余直接渲染全文
  const useTypewriter = isAi && everStreamed;

  return (
    <div className={`chat-msg ${isAi ? "ai" : "user"}`}>
      <span className="msg-prefix">[{isAi ? "AI" : "YOU"}]</span>
      {thinking ? (
        <ThinkingDots />
      ) : useTypewriter ? (
        <TypewriterContent msg={msg} onTick={onGrow} />
      ) : (
        renderMessageContent(msg.content, msg.id)
      )}
      {msg.imageUrl && (
        <img className="msg-image" src={msg.imageUrl} alt="screenshot" />
      )}
      {/* AI 生成内容标识 — 符合《深度合成管理规定》第17条 */}
      {isAi && !msg.isStreaming && msg.content.length > 0 && (
        <span style={{
          display: "inline-block",
          marginLeft: 6,
          fontSize: 10,
          color: "var(--c-dim)",
          border: "1px solid var(--c-gray)",
          padding: "0 4px",
          borderRadius: 2,
          verticalAlign: "middle",
        }}>
          AI生成
        </span>
      )}
    </div>
  );
};

/** AiChat 专用动画样式（注入一次，含滑入、思考点、按键增强、代码块） */
const AI_CHAT_CSS = `
/* 新消息从右侧滑入 */
@keyframes slide-in-right {
  from { opacity: 0; transform: translateX(28px); }
  to { opacity: 1; transform: translateX(0); }
}
.chat-msg {
  animation: slide-in-right 0.32s ease-out;
}

/* AI 思考跳动点（纯 CSS 圆点，非 emoji） */
.think-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 14px;
  vertical-align: middle;
  margin-left: 4px;
}
.think-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  background: var(--c-green);
  box-shadow: 0 0 6px var(--c-green);
  animation: think-bounce 0.9s ease-in-out infinite;
}
@keyframes think-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* 聊天内按键标签增强：灰底白边内阴影（物理按键质感） */
.chat-msg .key-tag {
  background: var(--c-gray);
  color: var(--c-white);
  border-color: var(--c-white);
  box-shadow: inset 1px 1px 2px rgba(0,0,0,0.7), 1px 1px 0 var(--c-black);
  text-shadow: 0 1px 0 rgba(0,0,0,0.6);
}

/* 代码块终端风格（黑底绿字、等宽字体、边框） */
.code-block {
  display: block;
  background: #000;
  color: var(--c-green);
  border: 1.5px solid var(--c-green);
  box-shadow: 3px 3px 0 rgba(0,255,65,0.18);
  padding: 8px 10px 8px 24px;
  margin: 6px 0;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  position: relative;
  overflow-x: auto;
}
.code-block::before {
  content: ">";
  position: absolute;
  left: 9px;
  top: 7px;
  color: var(--c-orange);
  font-weight: bold;
}
`;

export const AiChat: React.FC = () => {
  const { messages, isThinking, modelName, ctxUsed, ctxTotal, send, sendImage } =
    useChatStore();
  const { openCourse } = useUiStore();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // 新消息或思考状态变化时滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  // 滚动到底部（供打字机逐字增长时调用，useCallback 保持引用稳定）
  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    send(input);
    setInput("");
  };

  const ctxK = (ctxUsed / 1000).toFixed(1);
  const ctxTotalK = (ctxTotal / 1000).toFixed(0);

  // 仅欢迎消息存在时视为空状态
  const showEmpty = messages.length <= 1 && !isThinking;
  const api: ChatApi = { send, sendImage };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 动画样式注入（仅 AiChat 作用域内的增强动画） */}
      <style>{AI_CHAT_CSS}</style>

      {/* 对话头 */}
      <div
        className="term-titlebar"
        style={{ justifyContent: "space-between", flexShrink: 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="led green" />
          <Icon name="brain" size={18} />
          <span
            className="font-pixel"
            style={{ fontSize: 10, color: "var(--c-white)" }}
          >
            DOLPHIN AI TUTOR
          </span>
        </div>
        <div className="font-mono" style={{ fontSize: 12, color: "var(--c-green)" }}>
          MODEL: {modelName} | CTX: {ctxK}K/{ctxTotalK}K
        </div>
      </div>

      {/* 消息列表 */}
      <div ref={listRef} className="scroll-y" style={{ flex: 1, padding: "8px 14px", minHeight: 0 }}>
        {showEmpty ? (
          <EmptyState onPickCourse={openCourse} />
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onGrow={scrollToBottom} />
          ))
        )}
      </div>

      {/* 快捷操作按钮行 */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "6px 14px",
          borderTop: "1px solid var(--c-gray)",
          flexWrap: "wrap",
          flexShrink: 0,
          background: "var(--c-dark2)",
        }}
      >
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            className="tool-btn"
            onClick={() => void a.run(api)}
            disabled={isThinking}
          >
            <Icon name={a.icon} size={14} />
            {a.label}
          </button>
        ))}
      </div>

      {/* 底部输入栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderTop: "2px solid var(--c-orange)",
          background: "var(--c-dark)",
          flexShrink: 0,
        }}
      >
        <span
          className="font-mono"
          style={{ color: "var(--c-green)", fontSize: 15, whiteSpace: "nowrap" }}
        >
          user@flipper:~$
        </span>
        <input
          className="term-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="问我任何关于 Flipper 的问题..."
          disabled={isThinking}
        />
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={isThinking || !input.trim()}
          style={{ padding: "4px 12px" }}
        >
          <Icon name="send" size={16} />
          SEND
        </button>
      </div>
    </div>
  );
};

/** 空状态：欢迎语 + 课程推荐 */
const EmptyState: React.FC<{ onPickCourse: (id: string) => void }> = ({
  onPickCourse,
}) => (
  <div style={{ padding: "20px 8px", textAlign: "center" }}>
    <div className="bob" style={{ color: "var(--c-orange)", marginBottom: 10 }}>
      <Icon name="dolphin" size={48} />
    </div>
    <div
      className="font-pixel"
      style={{ fontSize: 11, color: "var(--c-orange)", marginBottom: 8 }}
    >
      DOLPHIN ONLINE
    </div>
    <div className="font-term" style={{ color: "var(--c-green)", fontSize: 18, marginBottom: 16 }}>
      嗨！我是你的 Dolphin Gang Tour AI 导师。我可以手把手教你玩转 Flipper Zero。
      <br />
      点下面任一课程开始，或直接在底部输入框提问。
    </div>
    <div
      className="font-pixel"
      style={{ fontSize: 8, color: "var(--c-yellow)", marginBottom: 8 }}
    >
      RECOMMENDED COURSES
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      {COURSES.slice(0, 4).map((c, i) => (
        <button
          key={c.id}
          className="btn"
          onClick={() => onPickCourse(c.id)}
          style={{ justifyContent: "flex-start", textAlign: "left" }}
        >
          <span className="menu-num" style={{ color: "var(--c-yellow)" }}>
            {String(i).padStart(2, "0")}
          </span>
          <Icon name={c.icon as IconName} size={16} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.title}
          </span>
        </button>
      ))}
    </div>
  </div>
);

export default AiChat;
