/** AI 对话状态管理 */
import { create } from "zustand";
import { invoke, onEvent } from "@/lib/tauri";
import type { AiMessage, AiModel, CommandSuggestion, Module } from "@/types";

interface ChatStore {
  messages: AiMessage[];
  isStreaming: boolean;
  streamingContent: string;
  model: AiModel;
  error: string | null;

  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  setModel: (model: AiModel) => void;
  approveSuggestion: (id: string) => Promise<void>;
  rejectSuggestion: (id: string) => void;
  cleanup: () => void;
}

let unlistenToken: (() => void) | null = null;

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: "",
  model: "deepseek",
  error: null,

  sendMessage: async (content: string) => {
    const userMsg: AiMessage = {
      role: "user",
      content,
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, userMsg], isStreaming: true, streamingContent: "", error: null }));

    // 监听 AI token 流
    if (!unlistenToken) {
      unlistenToken = (await onEvent<string>("ai_token", (token) => {
        set((s) => ({ streamingContent: s.streamingContent + token }));
      })) as (() => void) | null;
    }

    try {
      const result = await invoke<{
        content: string;
        suggestions?: CommandSuggestion[];
        blocked_warnings?: string[];
        sanitized?: boolean;
        model?: string;
      }>(
        "ai_send_message",
        { message: content, model: get().model }
      );

      const aiMsg: AiMessage = {
        role: "assistant",
        content: result.content || get().streamingContent,
        timestamp: Date.now(),
        cmds: result.suggestions?.map(s => ({
          mod: s.module as Module,
          op: s.action,
          data: { args: s.args, raw: s.raw },
        })),
        suggestions: result.suggestions,
        blocked_warnings: result.blocked_warnings,
        sanitized: result.sanitized,
        model: result.model,
      };
      set((s) => ({
        messages: [...s.messages, aiMsg],
        isStreaming: false,
        streamingContent: "",
      }));
    } catch (e) {
      set({ isStreaming: false, error: String(e) });
    }
  },

  /** 批准执行一个 AI 建议的命令 */
  approveSuggestion: async (_suggestionId: string) => {
    // 前端占位：实际执行需要用户点击后调用对应模块命令
    // 目前由 UI 层处理：safe 级别的命令自动执行，其他需确认
  },

  /** 拒绝一个 AI 建议 */
  rejectSuggestion: (_suggestionId: string) => {
    // 从消息中移除该建议
    set((s) => ({
      messages: s.messages.map(m => ({
        ...m,
        suggestions: m.suggestions?.filter(s => s.id !== _suggestionId),
      })),
    }));
  },

  clearMessages: () => set({ messages: [], streamingContent: "", error: null }),
  setModel: (model) => set({ model }),
  cleanup: () => {
    unlistenToken?.();
    unlistenToken = null;
  },
}));
