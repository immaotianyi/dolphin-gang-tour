/**
 * AI 对话状态管理 Store
 *
 * 管理 AI 对话消息列表、流式响应状态、模型配置、当前课程。
 * 通过 ai-chat-stream 事件处理流式响应，逐字更新 assistant 消息。
 *
 * 兼容别名：isThinking / modelName / ctxUsed / ctxTotal / send / pushAssistant
 * 供 AiChat、CourseView 组件直接使用。
 */
import { create } from "zustand";
import type { ChatMessage, AiModelConfig, AiCourseId } from "@/types";
import {
  generateId,
  aiChat,
  aiChatStream,
  aiChatWithImage,
  cancelAiChat,
  onAiChatStream,
  type AiChatStreamChunk,
} from "@/lib/tauri";

// ================================================================
// 类型定义
// ================================================================

/** AI 对话 Store 状态 */
interface ChatStore {
  // ---- State（规范 API） ----
  /** 消息列表 */
  messages: ChatMessage[];
  /** 是否正在流式响应中 */
  isStreaming: boolean;
  /** AI 模型配置 */
  modelConfig: AiModelConfig;
  /** 当前课程 ID（null 表示自由对话） */
  currentCourseId: AiCourseId | null;
  /** 最近一次错误信息 */
  lastError: string | null;

  // ---- State（组件兼容） ----
  /** isStreaming 别名 */
  isThinking: boolean;
  /** 当前模型名称 */
  modelName: string;
  /** 已使用上下文 token 数（估算） */
  ctxUsed: number;
  /** 上下文 token 上限 */
  ctxTotal: number;

  // ---- Actions（规范 API） ----
  /** 发送文字消息 */
  sendMessage: (text: string) => Promise<void>;
  /** 发送图片消息（多模态） */
  sendImage: (file: File, text?: string) => Promise<void>;
  /** 清空对话历史 */
  clearHistory: () => void;
  /** 开始课程 */
  startCourse: (courseId: AiCourseId) => void;
  /** 退出课程（回到自由对话） */
  exitCourse: () => void;
  /** 设置模型配置 */
  setModelConfig: (config: AiModelConfig) => void;
  /** 停止流式生成 */
  stopStreaming: () => Promise<void>;
  /** 初始化事件监听，返回取消监听函数 */
  initListeners: () => Promise<() => void>;

  // ---- Actions（组件兼容别名） ----
  /** sendMessage 别名（fire-and-forget） */
  send: (text: string) => void;
  /** 直接推送 assistant 消息（课程引导用） */
  pushAssistant: (content: string) => void;
}

// ================================================================
// 常量与工具函数
// ================================================================

/** 上下文 token 上限 */
const CTX_TOKEN_TOTAL = 32000;

/** 默认 AI 模型配置 */
const DEFAULT_MODEL_CONFIG: AiModelConfig = {
  provider: "qwen",
  apiKey: "",
  apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  modelName: "qwen-plus",
  isMultimodal: false,
};

/** 欢迎消息 */
const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "你好！我是 Flipper Zero AI 助手。你可以问我任何关于 Flipper Zero 的问题，比如如何复制门禁卡、使用红外遥控、捕捉无线信号等。也可以选择一门课程，我会手把手教你操作！",
  timestamp: Date.now(),
};

/** 读取文件为 Data URL（用于图片预览和传输） */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/** 估算消息列表已使用的 token 数（约 2 字符/token） */
function estimateTokens(messages: ChatMessage[]): number {
  return messages.reduce(
    (sum, m) => sum + Math.ceil((m.content?.length ?? 0) / 2),
    0
  );
}

// ================================================================
// Store 创建
// ================================================================

export const useChatStore = create<ChatStore>((set, get) => ({
  // ---- State 初始值 ----
  messages: [WELCOME_MESSAGE],
  isStreaming: false,
  modelConfig: DEFAULT_MODEL_CONFIG,
  currentCourseId: null,
  lastError: null,

  // 组件兼容 State
  isThinking: false,
  modelName: DEFAULT_MODEL_CONFIG.modelName,
  ctxUsed: estimateTokens([WELCOME_MESSAGE]),
  ctxTotal: CTX_TOKEN_TOTAL,

  // ---- Actions（规范 API） ----

  sendMessage: async (text) => {
    if (!text.trim() || get().isStreaming) return;

    set({ lastError: null });

    // 1. 添加用户消息
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };

    // 2. 创建 assistant 占位消息（isStreaming = true）
    const assistantId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    };

    set((state) => {
      const messages = [...state.messages, userMessage, assistantMessage];
      return {
        messages,
        isStreaming: true,
        isThinking: true,
        ctxUsed: estimateTokens(messages),
      };
    });

    // 3. 调用 AI 流式对话 IPC
    //    传入完整的消息历史（排除空的 assistant 占位消息）
    //    后端返回 messageId，用于匹配后续的 ai-chat-stream 事件
    const { currentCourseId, messages: allMessages } = get();
    const apiMessages = allMessages.filter((m) => m.id !== assistantId);

    const result = await aiChatStream(apiMessages, currentCourseId ?? undefined);

    if (result.success && result.data) {
      // 4. 将 assistant 占位消息的 ID 更新为后端返回的 messageId
      //    这样 ai-chat-stream 事件中的 chunk.messageId 才能正确匹配
      const backendMessageId = result.data;
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === assistantId ? { ...m, id: backendMessageId } : m
        ),
      }));
      // 流式响应通过 ai-chat-stream 事件逐步更新
    } else {
      // 更新 assistant 消息为错误信息
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `抱歉，发生了错误：${result.error ?? "未知错误"}`,
                isStreaming: false,
              }
            : m
        ),
        isStreaming: false,
        isThinking: false,
        lastError: result.error ?? null,
      }));
    }
  },

  sendImage: async (file, text) => {
    if (get().isStreaming) return;

    set({ lastError: null });

    try {
      // 读取图片为 Data URL
      const dataUrl = await readFileAsDataURL(file);
      // 提取 base64 部分（去掉 "data:image/xxx;base64," 前缀）
      const base64Data = dataUrl.split(",")[1] ?? dataUrl;

      // 1. 添加用户图片消息
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: text?.trim() || "请分析这张图片",
        timestamp: Date.now(),
        imageUrl: dataUrl,
      };

      // 2. 创建 assistant 占位消息
      const assistantId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      };

      set((state) => {
        const messages = [...state.messages, userMessage, assistantMessage];
        return {
          messages,
          isStreaming: true,
          isThinking: true,
          ctxUsed: estimateTokens(messages),
        };
      });

      // 3. 调用多模态 AI 对话 IPC（非流式，返回完整 ChatResponse）
      const { messages: allMessages } = get();
      const apiMessages = allMessages.filter((m) => m.id !== assistantId);

      const result = await aiChatWithImage(apiMessages, base64Data);

      if (result.success && result.data) {
        // 直接用返回的 ChatResponse 更新 assistant 消息
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: result.data!.content,
                  isStreaming: false,
                  tokensUsed: result.data!.tokensUsed,
                }
              : m
          ),
          isStreaming: false,
          isThinking: false,
        }));
      } else {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `抱歉，发生了错误：${result.error ?? "未知错误"}`,
                  isStreaming: false,
                }
              : m
          ),
          isStreaming: false,
          isThinking: false,
          lastError: result.error ?? null,
        }));
      }
    } catch (err) {
      set({
        isStreaming: false,
        isThinking: false,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  clearHistory: () => {
    const newMessages = [{ ...WELCOME_MESSAGE, timestamp: Date.now() }];
    set({
      messages: newMessages,
      isStreaming: false,
      isThinking: false,
      lastError: null,
      ctxUsed: estimateTokens(newMessages),
    });
  },

  startCourse: (courseId) => {
    const { isStreaming } = get();
    if (isStreaming) return; // 流式响应中不允许切换课程

    const newMessages = [{ ...WELCOME_MESSAGE, timestamp: Date.now() }];
    set({
      currentCourseId: courseId,
      messages: newMessages,
      lastError: null,
      isThinking: false,
      ctxUsed: estimateTokens(newMessages),
    });
  },

  exitCourse: () => set({ currentCourseId: null }),

  setModelConfig: (config) =>
    set({ modelConfig: config, modelName: config.modelName }),

  stopStreaming: async () => {
    try {
      await cancelAiChat();
    } catch {
      // 忽略取消错误
    }
    set((state) => ({
      isStreaming: false,
      isThinking: false,
      messages: state.messages.map((m) =>
        m.isStreaming ? { ...m, isStreaming: false } : m
      ),
    }));
  },

  initListeners: async () => {
    const unlisten = await onAiChatStream((chunk: AiChatStreamChunk) => {
      const { messages } = get();

      // 找到对应的 assistant 消息并追加内容
      const updatedMessages = messages.map((msg) => {
        if (msg.id === chunk.messageId) {
          return {
            ...msg,
            content: msg.content + chunk.delta,
            isStreaming: !chunk.done,
            tokensUsed: chunk.tokensUsed ?? msg.tokensUsed,
          };
        }
        return msg;
      });

      set({
        messages: updatedMessages,
        isStreaming: !chunk.done,
        isThinking: !chunk.done,
        ctxUsed: estimateTokens(updatedMessages),
      });
    });
    return unlisten;
  },

  // ---- Actions（组件兼容别名） ----

  send: (text: string) => {
    // fire-and-forget，不等待 Promise
    void get().sendMessage(text);
  },

  pushAssistant: (content: string) => {
    const msg: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content,
      timestamp: Date.now(),
    };
    set((state) => {
      const messages = [...state.messages, msg];
      return {
        messages,
        ctxUsed: estimateTokens(messages),
      };
    });
  },
}));

// ================================================================
// 模块级别自动注册事件监听
// ================================================================

let _chatUnlisten: (() => void) | null = null;

onAiChatStream((chunk: AiChatStreamChunk) => {
  const { messages } = useChatStore.getState();

  const updatedMessages = messages.map((msg) => {
    if (msg.id === chunk.messageId) {
      return {
        ...msg,
        content: msg.content + chunk.delta,
        isStreaming: !chunk.done,
        tokensUsed: chunk.tokensUsed ?? msg.tokensUsed,
      };
    }
    return msg;
  });

  useChatStore.setState({
    messages: updatedMessages,
    isStreaming: !chunk.done,
    isThinking: !chunk.done,
    ctxUsed: estimateTokens(updatedMessages),
  });
}).then((fn) => {
  _chatUnlisten = fn;
});

/** 清理 AI 对话事件监听（用于 HMR 热更新或测试） */
export function cleanupChatListeners(): void {
  _chatUnlisten?.();
  _chatUnlisten = null;
}
