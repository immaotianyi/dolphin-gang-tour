/** Lucy AI 对话面板 — SSE 流式响应 + 命令建议卡片（审批制） + 上下文感知 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/Icon";
import { PixelButton } from "@/components/ui/PixelButton";
import { SuggestionCard } from "@/components/ui/SuggestionCard";
import { useChatStore } from "@/stores/chatStore";
import { useUiStore } from "@/stores/uiStore";
import { useDeviceStore } from "@/stores/deviceStore";
import type { AiMessage, ViewId } from "@/types";

// Context-aware suggestion mapping
const CONTEXT_SUGGESTIONS: Record<string, string[]> = {
  dashboard: ["ai.suggestNfc", "ai.suggestSubghz", "ai.suggestFirmware", "ai.suggestAudit"],
  nfc: ["ai.suggestNfc", "ai.suggestPrivacy", "ai.suggestLibrary"],
  subghz: ["ai.suggestSubghz", "ai.suggestRegion", "ai.suggestPrivacy"],
  ir: ["ai.suggestLibrary", "ai.suggestDiagnostics"],
  badusb: ["ai.suggestDucky", "ai.suggestBadusb", "ai.suggestAudit"],
  gpio: ["ai.suggestGpio"],
  firmware: ["ai.suggestFirmware", "ai.suggestDiagnostics"],
  library: ["ai.suggestLibrary", "ai.suggestTimeline", "ai.suggestAudit"],
  virtualLab: ["ai.suggestDucky", "ai.suggestNfc", "ai.suggestSubghz"],
  settings: ["ai.suggestPrivacy", "ai.suggestRegion"],
};

const CONTEXT_LABELS: Record<string, string> = {
  dashboard: "ai.contextNfc", // fallback
  nfc: "ai.contextNfc",
  subghz: "ai.contextSubghz",
  badusb: "ai.contextBadusb",
  settings: "ai.contextSettings",
};

export const AiChat: React.FC = () => {
  const { t } = useTranslation();
  const { messages, isStreaming, streamingContent, sendMessage, clearMessages, model, setModel, approveSuggestion, rejectSuggestion } = useChatStore();
  const { setModal, activeView } = useUiStore();
  const { isVirtual } = useDeviceStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApprove = useCallback((id: string) => {
    approveSuggestion(id);
  }, [approveSuggestion]);

  const handleReject = useCallback((id: string) => {
    rejectSuggestion(id);
  }, [rejectSuggestion]);

  // Context-aware suggestions based on current view
  const suggestions = useMemo(() => {
    const keys = CONTEXT_SUGGESTIONS[activeView] || CONTEXT_SUGGESTIONS.dashboard;
    return keys.map((k) => t(k));
  }, [activeView, t]);

  const contextLabel = activeView in CONTEXT_LABELS ? t(CONTEXT_LABELS[activeView]) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "0.8rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: "var(--c-bg3)",
              border: "2px solid var(--c-orange)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-glow-orange)",
            }}
          >
            <Icon name="robot" size={20} style={{ color: "var(--c-orange)" }} />
          </div>
          <div>
            <div className="font-pixel text-orange" style={{ fontSize: "0.85rem", letterSpacing: "0.05em" }}>
              {t("ai.title")}
            </div>
            <div className="font-mono text-muted" style={{ fontSize: "0.7rem" }}>
              {t("ai.model")}: {model.toUpperCase()} · {isStreaming ? t("ai.thinking") : t("app.ready")} · {t("ai.allOpsRequireApproval")}
            </div>
            {contextLabel && (
              <div className="font-mono" style={{ fontSize: "0.62rem", color: "var(--c-cyan)", marginTop: "0.15rem" }}>
                <Icon name="info" size={10} style={{ marginRight: 3 }} />
                {contextLabel}
              </div>
            )}
            {isVirtual && (
              <div className="font-pixel" style={{ fontSize: "0.55rem", color: "var(--c-cyan)", marginTop: "0.1rem" }}>
                ● {t("virtual.simulated")}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as typeof model)}
            className="pixel-input"
            style={{ width: "auto", fontSize: "0.75rem", padding: "0.3rem 0.5rem" }}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
            <option value="claude">Claude</option>
            <option value="local">Local</option>
          </select>
          <PixelButton variant="ghost" icon={<Icon name="settings" size={14} />} onClick={() => setModal("settings")}>
          </PixelButton>
          <PixelButton variant="ghost" icon={<Icon name="refresh" size={14} />} onClick={clearMessages}>
          </PixelButton>
        </div>
      </div>

      {/* Privacy notice */}
      <div style={{
        padding: "0.4rem 0.6rem",
        background: "rgba(34,211,238,0.06)",
        border: "1px solid var(--c-cyan)",
        fontSize: "0.7rem",
        color: "var(--c-cyan)",
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
      }}>
        <Icon name="shield" size={12} />
        <span className="font-term">{t("ai.privacyNotice")}</span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="crt-screen"
        style={{
          flex: 1,
          overflowY: "auto",
          background: "var(--c-bg2)",
          border: "2px solid var(--c-rule)",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.8rem",
        }}
      >
        {messages.length === 0 && !isStreaming && (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <Icon name="robot" size={48} style={{ color: "var(--c-orange)", opacity: 0.3 }} />
            <div className="font-term text-dim" style={{ fontSize: "0.9rem", marginTop: "0.8rem" }}>
              {t("ai.noMessages")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: "center", marginTop: "1rem" }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="pixel-btn pixel-btn-ghost"
                  style={{ fontSize: "0.75rem" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} onApprove={handleApprove} onReject={handleReject} />
        ))}

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <MessageBubble
            msg={{ role: "assistant", content: streamingContent, timestamp: Date.now() }}
            streaming
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}

        {/* Loading indicator */}
        {isStreaming && !streamingContent && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Icon name="robot" size={20} style={{ color: "var(--c-orange)" }} />
            <span style={{ color: "var(--c-orange)", animation: "blink 1s step-end infinite" }}>●●●</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          className="pixel-input"
          placeholder={t("ai.placeholder")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          style={{ flex: 1 }}
        />
        <PixelButton
          variant="primary"
          icon={<Icon name="play" size={14} />}
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
        >
          {t("ai.send")}
        </PixelButton>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{
  msg: AiMessage;
  streaming?: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}> = ({ msg, streaming, onApprove, onReject }) => {
  const isUser = msg.role === "user";
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        flexDirection: isUser ? "row-reverse" : "row",
        animation: "slide-in-up 0.3s var(--ease-apple)",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          minWidth: 28,
          background: "var(--c-bg3)",
          border: `2px solid ${isUser ? "var(--c-cyan)" : "var(--c-orange)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={isUser ? "chip" : "robot"}
          size={16}
          style={{ color: isUser ? "var(--c-cyan)" : "var(--c-orange)" }}
        />
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: "75%",
          background: isUser ? "rgba(34,211,238,0.08)" : "var(--c-bg3)",
          border: `2px solid ${isUser ? "var(--c-cyan)" : "var(--c-rule)"}`,
          padding: "0.6rem 0.8rem",
        }}
      >
        {/* Message text */}
        <div className="font-mono" style={{ fontSize: "0.82rem", color: "var(--c-ink)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {stripCmdsTags(msg.content)}
          {streaming && (
            <span style={{ animation: "blink 1s step-end infinite", color: "var(--c-orange)" }}>█</span>
          )}
        </div>

        {/* Blocked warnings */}
        {msg.blocked_warnings && msg.blocked_warnings.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            {msg.blocked_warnings.map((w, i) => (
              <div
                key={i}
                style={{
                  padding: "0.3rem 0.5rem",
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid var(--c-red)",
                  fontSize: "0.72rem",
                  color: "var(--c-red)",
                  marginBottom: "0.2rem",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.3rem",
                }}
              >
                <Icon name="cross" size={12} style={{ color: "var(--c-red)", marginTop: 2, minWidth: 12 }} />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Suggestion cards (审批制) */}
        {msg.suggestions && msg.suggestions.length > 0 && (
          <div style={{ marginTop: "0.4rem" }}>
            <div
              className="font-pixel"
              style={{ fontSize: "0.6rem", color: "var(--c-dim)", letterSpacing: "0.08em", marginBottom: "0.2rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
            >
              <Icon name="bolt" size={10} style={{ color: "var(--c-orange)" }} />
              {t("ai.suggestions")}
            </div>
            {msg.suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** 移除 <cmds>...</cmds> 标签（后端已经转为 suggestions 字段） */
function stripCmdsTags(content: string): string {
  return content.replace(/<cmds>[\s\S]*?<\/cmds>/g, "").trim();
}
