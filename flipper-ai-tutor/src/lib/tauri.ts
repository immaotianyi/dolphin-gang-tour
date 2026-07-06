/**
 * Tauri IPC 封装层（P1.1 统一 IPC 契约版）
 *
 * 核心原则：
 *   1. 命令名 = Rust 函数名（snake_case），如 "device_scan" / "start_screen_mirror"
 *   2. 参数键 = Rust 参数名（snake_case），如 { port_name } / { firmware_id }
 *   3. 返回类型 = Rust 序列化后的 JSON 结构（camelCase 字段，由 serde rename_all 控制）
 *   4. 非 Tauri 环境（浏览器开发模式）自动回退到 mock 实现
 *
 * 与后端 src-tauri/src/lib.rs 的 #[tauri::command] 函数一一对应。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { MOCK_FIRMWARES, MOCK_RESOURCE_PACKAGES } from "@/data/resources";
import type {
  IpcResult,
  DeviceConnectionState,
  DeviceScanResult,
  DeviceInfo,
  KillResult,
  DriverInstallResult,
  ResourcePackage,
  ImportProgress,
  ImportSummary,
  ChatMessage,
  ChatResponse,
  AiModelConfig,
  AiCourseId,
  Course,
  FirmwareId,
  FirmwareInfo,
  FlashResult,
  FlashProgress,
  ScreenMirrorFrame,
  DiagnosticResult,
} from "@/types";

// ================================================================
// 第一部分：常量与类型
// ================================================================

/** Tauri 事件名称常量 */
export const TauriEvents = {
  ImportProgress: "import-progress",
  FlashProgress: "flash-progress",
  ScreenMirrorFrame: "screen-mirror-frame",
  DeviceStateChange: "device-state-change",
  AiChatStream: "ai-chat-stream",
  AiFallback: "ai-fallback",
  ScreenMirrorError: "screen-mirror-error",
} as const;

/** AI 流式响应 chunk — 前后端约定的流式数据结构 */
export interface AiChatStreamChunk {
  /** 对应 assistant 消息的 ID */
  messageId: string;
  /** 本次增量文本 */
  delta: string;
  /** 是否已传输完毕 */
  done: boolean;
  /** 本次消耗的 token 数（仅 done=true 时有值） */
  tokensUsed?: number;
  /** 错误信息（仅出错时有值） */
  error?: string;
}

// ================================================================
// 第二部分：环境检测
// ================================================================

/**
 * 检测当前是否运行在 Tauri 环境中。
 * Tauri 2.0 会在 window 上注入 `__TAURI_INTERNALS__`。
 */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// ================================================================
// 第三部分：Mock 事件总线
// 浏览器开发模式下模拟 Tauri 的事件系统
// ================================================================

type MockEventListener = (payload: unknown) => void;
const mockListeners: Map<string, Set<MockEventListener>> = new Map();

/** 在 mock 事件总线上派发事件 */
function mockEmit(event: string, payload: unknown): void {
  const listeners = mockListeners.get(event);
  if (listeners) {
    listeners.forEach((fn) => fn(payload));
  }
}

/** 在 mock 事件总线上注册监听器，返回取消监听函数 */
function mockListen(event: string, handler: MockEventListener): UnlistenFn {
  if (!mockListeners.has(event)) {
    mockListeners.set(event, new Set());
  }
  mockListeners.get(event)!.add(handler);
  return () => {
    mockListeners.get(event)?.delete(handler);
  };
}

// ================================================================
// 第四部分：Mock 数据
// ================================================================

/** 模拟已连接设备的信息 */
export const MOCK_DEVICE_INFO: DeviceInfo = {
  name: "Flipper Zero (Mock)",
  firmwareVersion: "0.1.3",
  firmwareType: "momentum",
  apiLevel: 20,
  hardwareVersion: "f7",
  batteryLevel: 78,
  batteryVoltage: 3.85,
  isCharging: true,
  sdCardInserted: true,
  sdCardTotalBytes: 8_000_000_000,
  sdCardFreeBytes: 5_200_000_000,
  sdCardFormat: "FAT32",
  dolphinLevel: 3,
};

/** 模拟设备扫描结果 */
const MOCK_SCAN_RESULT: DeviceScanResult = {
  devices: [
    {
      portName: "/dev/ttyACM0",
      vid: 0x0483,
      pid: 0x5740,
      mode: "normal",
      friendlyName: "Flipper Zero",
      connectable: true,
    },
  ],
  state: "connected",
  portOccupiers: [],
  scanTimestamp: new Date().toISOString(),
};

/** 模拟诊断结果 */
export const MOCK_DIAGNOSTIC_RESULTS: DiagnosticResult[] = [
  {
    level: "ok",
    category: "设备连接",
    title: "USB 连接正常",
    detail: "设备已通过 USB-C 稳定连接，串口通信正常。",
    autoFixable: false,
  },
  {
    level: "ok",
    category: "SD 卡",
    title: "SD 卡已插入且格式正确",
    detail: "检测到 8GB FAT32 格式 SD 卡，剩余空间充足。",
    autoFixable: false,
  },
  {
    level: "warning",
    category: "固件",
    title: "固件版本可更新",
    detail: "当前固件版本 0.1.3，最新稳定版为 0.1.4。建议更新以获得最新功能和安全修复。",
    autoFixable: true,
    fixAction: "update-firmware",
  },
  {
    level: "warning",
    category: "电池",
    title: "电池电量中等",
    detail: "当前电量 78%，建议在电量低于 30% 时及时充电。",
    autoFixable: false,
  },
  {
    level: "error",
    category: "Sub-GHz",
    title: "Sub-GHz 频率未校准",
    detail: "检测到 Sub-GHz 模块频率偏差较大，可能影响信号收发质量。建议重新校准。",
    autoFixable: true,
    fixAction: "calibrate-subghz",
  },
];

/** 模拟 AI 回复模板 */
const MOCK_AI_RESPONSES: string[] = [
  "好的！让我来帮你。Flipper Zero 是一款多功能便携工具设备，搭载 NFC、RFID、红外、Sub-GHz 等多种无线模块。\n\n你可以用它来读写卡片、收发红外信号、捕捉无线信号等。你具体想了解哪个功能呢？",
  "这个问题问得好！简单来说：\n1. NFC 工作在 13.56MHz，用于 IC 卡、银行卡等\n2. RFID 工作在 125kHz，用于老式门禁卡、ID 卡\n3. 两者频率和协议完全不同，不能互换使用\n\n需要我手把手教你怎么读取吗？",
  "当然可以！按以下步骤操作：\n\n1. 在主菜单用方向键选择对应功能入口\n2. 按 OK 键确认进入\n3. 按屏幕提示操作即可\n\n操作过程中遇到任何问题随时问我！",
  "安全提醒：请仅在你拥有合法权限的设备上进行操作。未经授权复制门禁卡、截获信号等行为可能违法。Flipper Zero 是为安全研究和学习设计的工具，请合法合规使用。",
];

// ================================================================
// 第五部分：工具函数
// ================================================================

/** 延迟工具（模拟网络/IO 延迟） */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 生成唯一 ID */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ================================================================
// 第六部分：核心封装 — safeInvoke & listenEvent
// ================================================================

/**
 * 安全调用 Tauri invoke 命令。
 * - Tauri 环境：调用真实 Rust 后端命令
 * - 浏览器环境：调用 mock 实现
 * 统一返回 IpcResult<T>，永不抛出异常。
 *
 * 注意：args 的键名必须与 Rust 函数参数名完全一致（snake_case）。
 */
async function safeInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<IpcResult<T>> {
  if (!isTauri()) {
    return mockInvoke<T>(cmd, args);
  }
  try {
    const data = await invoke<T>(cmd, args);
    return { success: true, data };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);
    return { success: false, error: message };
  }
}

/**
 * 监听 Tauri 事件。
 * - Tauri 环境：调用真实 listen
 * - 浏览器环境：使用 mock 事件总线
 * 返回取消监听函数。
 */
async function listenEvent<T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return mockListen(event, handler as MockEventListener);
  }
  return listen(event, (e) => {
    handler(e.payload as T);
  });
}

// ================================================================
// 第七部分：设备相关命令
// 对应后端: device_scan / device_connect / device_disconnect / get_device_info
// ================================================================

/** 扫描设备，返回设备列表与连接状态 */
export function deviceScan(): Promise<IpcResult<DeviceScanResult>> {
  return safeInvoke<DeviceScanResult>("device_scan");
}

/** 连接设备（指定串口端口名） */
export function deviceConnect(portName: string): Promise<IpcResult<null>> {
  return safeInvoke<null>("device_connect", { port_name: portName });
}

/** 断开设备连接 */
export function deviceDisconnect(): Promise<IpcResult<null>> {
  return safeInvoke<null>("device_disconnect");
}

/** 获取设备详细信息（通过 RPC system_get_info） */
export function getDeviceInfo(): Promise<IpcResult<DeviceInfo>> {
  return safeInvoke<DeviceInfo>("get_device_info");
}

// ================================================================
// 第八部分：驱动 / 端口 / SD 卡命令
// 对应后端: install_driver / kill_port_occupier / format_sd_card
// ================================================================

/** 安装驱动（Windows 下 Auto-Zadig） */
export function installDriver(force: boolean): Promise<IpcResult<DriverInstallResult>> {
  return safeInvoke<DriverInstallResult>("install_driver", { force });
}

/** 强制结束占用串口的进程 */
export function killPortOccupier(portName: string): Promise<IpcResult<KillResult>> {
  return safeInvoke<KillResult>("kill_port_occupier", { port_name: portName });
}

/** 格式化 SD 卡（FAT32） */
export function formatSdCard(clusterSizeKb?: number): Promise<IpcResult<null>> {
  return safeInvoke<null>("format_sd_card", {
    cluster_size_kb: clusterSizeKb ?? 32,
  });
}

// ================================================================
// 第九部分：诊断命令
// 对应后端: diagnose / apply_diagnostic_fix
// ================================================================

/** 运行设备诊断 */
export function runDiagnostics(): Promise<IpcResult<DiagnosticResult[]>> {
  return safeInvoke<DiagnosticResult[]>("diagnose");
}

/** 应用诊断修复 */
export function applyDiagnosticFix(action: string): Promise<IpcResult<string>> {
  return safeInvoke<string>("apply_diagnostic_fix", { action });
}

// ================================================================
// 第十部分：固件相关命令
// 对应后端: flash_firmware / cancel_flash / list_firmwares / enter_dfu_mode
// ================================================================

/** 刷写指定固件 */
export function flashFirmware(
  firmwareId: FirmwareId,
  firmwarePath?: string
): Promise<IpcResult<FlashResult>> {
  return safeInvoke<FlashResult>("flash_firmware", {
    firmware_id: firmwareId,
    firmware_path: firmwarePath ?? null,
  });
}

/** 取消固件刷写 */
export function cancelFlash(): Promise<IpcResult<null>> {
  return safeInvoke<null>("cancel_flash");
}

/** 列出可用固件 */
export function listFirmwares(): Promise<IpcResult<FirmwareInfo[]>> {
  return safeInvoke<FirmwareInfo[]>("list_firmwares");
}

/** 进入 DFU 模式 */
export function enterDfuMode(): Promise<IpcResult<null>> {
  return safeInvoke<null>("enter_dfu_mode");
}

// ================================================================
// 第十一部分：资源导入命令
// 对应后端: list_resource_packages / import_resources / cancel_import / get_import_progress
// ================================================================

/** 列出可导入的资源包 */
export function listResourcePackages(): Promise<IpcResult<ResourcePackage[]>> {
  return safeInvoke<ResourcePackage[]>("list_resource_packages");
}

/** 导入选中的资源包 */
export function importResources(
  packageIds: string[]
): Promise<IpcResult<ImportSummary>> {
  return safeInvoke<ImportSummary>("import_resources", {
    package_ids: packageIds,
  });
}

/** 取消资源导入 */
export function cancelImport(): Promise<IpcResult<null>> {
  return safeInvoke<null>("cancel_import");
}

/** 获取当前导入进度（轮询兜底） */
export function getImportProgress(): Promise<IpcResult<ImportProgress>> {
  return safeInvoke<ImportProgress>("get_import_progress");
}

// ================================================================
// 第十二部分：AI 对话命令
// 对应后端: ai_chat / ai_chat_stream / ai_chat_with_image / ai_set_model_config / ai_get_courses / cancel_ai_chat
// ================================================================

/** AI 文字对话（非流式，返回完整回复） */
export function aiChat(
  messages: ChatMessage[],
  courseId?: AiCourseId
): Promise<IpcResult<ChatResponse>> {
  return safeInvoke<ChatResponse>("ai_chat", {
    messages,
    course_id: courseId ?? null,
  });
}

/** AI 流式对话（通过 ai-chat-stream 事件逐 token 推送） */
export function aiChatStream(
  messages: ChatMessage[],
  courseId?: AiCourseId
): Promise<IpcResult<string>> {
  return safeInvoke<string>("ai_chat_stream", {
    messages,
    course_id: courseId ?? null,
  });
}

/** AI 图片对话（多模态） */
export function aiChatWithImage(
  messages: ChatMessage[],
  imageBase64: string
): Promise<IpcResult<ChatResponse>> {
  return safeInvoke<ChatResponse>("ai_chat_with_image", {
    messages,
    image_base64: imageBase64,
  });
}

/** 设置 AI 模型配置（自动持久化到磁盘） */
export function setAiModelConfig(
  config: AiModelConfig
): Promise<IpcResult<null>> {
  return safeInvoke<null>("ai_set_model_config", { config });
}

/** 获取当前 AI 模型配置（从持久化存储读取） */
export function getAiModelConfig(): Promise<IpcResult<AiModelConfig>> {
  return safeInvoke<AiModelConfig>("ai_get_model_config");
}

/** 获取 AI 课程列表 */
export function getAiCourses(): Promise<IpcResult<Course[]>> {
  return safeInvoke<Course[]>("ai_get_courses");
}

/** 取消 AI 流式对话 */
export function cancelAiChat(): Promise<IpcResult<null>> {
  return safeInvoke<null>("cancel_ai_chat");
}

// ================================================================
// 第十三部分：屏幕镜像命令
// 对应后端: start_screen_mirror / stop_screen_mirror / send_virtual_key
// ================================================================

/** 开始屏幕镜像 */
export function startMirror(): Promise<IpcResult<null>> {
  return safeInvoke<null>("start_screen_mirror");
}

/** 停止屏幕镜像 */
export function stopMirror(): Promise<IpcResult<null>> {
  return safeInvoke<null>("stop_screen_mirror");
}

/** 发送虚拟按键到设备 */
export function sendMirrorKey(key: string): Promise<IpcResult<null>> {
  return safeInvoke<null>("send_virtual_key", { key });
}

// ================================================================
// 第十四部分：日志命令
// 对应后端: save_log_dump
// ================================================================

/** 导出应用日志到指定文件 */
export function saveLogDump(filePath: string): Promise<IpcResult<number>> {
  return safeInvoke<number>("save_log_dump", { file_path: filePath });
}

// ================================================================
// 第十五部分：事件监听辅助函数
// ================================================================

/** 监听资源导入进度事件 */
export function onImportProgress(
  handler: (progress: ImportProgress) => void
): Promise<UnlistenFn> {
  return listenEvent<ImportProgress>(TauriEvents.ImportProgress, handler);
}

/** 监听固件刷写进度事件 */
export function onFlashProgress(
  handler: (progress: FlashProgress) => void
): Promise<UnlistenFn> {
  return listenEvent<FlashProgress>(TauriEvents.FlashProgress, handler);
}

/** 监听屏幕镜像帧事件 */
export function onScreenMirrorFrame(
  handler: (frame: ScreenMirrorFrame) => void
): Promise<UnlistenFn> {
  return listenEvent<ScreenMirrorFrame>(TauriEvents.ScreenMirrorFrame, handler);
}

/** 监听设备状态变化事件 */
export function onDeviceStateChange(
  handler: (state: DeviceConnectionState) => void
): Promise<UnlistenFn> {
  return listenEvent<DeviceConnectionState>(
    TauriEvents.DeviceStateChange,
    handler
  );
}

/** 监听 AI 流式响应事件 */
export function onAiChatStream(
  handler: (chunk: AiChatStreamChunk) => void
): Promise<UnlistenFn> {
  return listenEvent<AiChatStreamChunk>(TauriEvents.AiChatStream, handler);
}

// ================================================================
// 第十六部分：Mock 命令实现
// 以下函数仅在浏览器开发模式下被调用
// ================================================================

// Mock 定时器引用（用于取消操作）
let mockImportTimer: ReturnType<typeof setInterval> | null = null;
let mockFlashTimer: ReturnType<typeof setInterval> | null = null;
let mockMirrorTimer: ReturnType<typeof setInterval> | null = null;
const mockAiTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

/** Mock 连接状态（内部追踪） */
let mockConnected = false;

/**
 * Mock 命令分派器 — 根据命令名返回模拟数据
 * 与后端 #[tauri::command] 函数一一对应
 */
async function mockInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<IpcResult<T>> {
  // 模拟 IPC 延迟
  await delay(150 + Math.random() * 350);

  switch (cmd) {
    // ---------- 设备 ----------
    case "device_scan": {
      const result: DeviceScanResult = {
        ...MOCK_SCAN_RESULT,
        state: mockConnected ? "connected" : "no_device",
        scanTimestamp: new Date().toISOString(),
      };
      return { success: true, data: result as T };
    }

    case "device_connect": {
      const portName = (args?.port_name as string) ?? "/dev/ttyACM0";
      mockEmit(TauriEvents.DeviceStateChange, "connecting");
      await delay(600);
      mockConnected = true;
      mockEmit(TauriEvents.DeviceStateChange, "connected");
      return { success: true, data: null as T };
    }

    case "device_disconnect":
      mockConnected = false;
      mockEmit(TauriEvents.DeviceStateChange, "no_device");
      return { success: true, data: null as T };

    case "get_device_info":
      return { success: true, data: MOCK_DEVICE_INFO as T };

    // ---------- 驱动 / 端口 / SD 卡 ----------
    case "install_driver":
      return {
        success: true,
        data: {
          needed: false,
          success: true,
          platform: "macos",
          message: "macOS 无需安装驱动",
        } as T,
      };

    case "kill_port_occupier":
      return {
        success: true,
        data: { killed: [], failed: [], success: true } as T,
      };

    case "format_sd_card":
      return { success: true, data: null as T };

    // ---------- 诊断 ----------
    case "diagnose":
      return { success: true, data: MOCK_DIAGNOSTIC_RESULTS as T };

    case "apply_diagnostic_fix": {
      const action = (args?.action as string) ?? "";
      return {
        success: true,
        data: `修复操作 "${action}" 已执行（Mock）` as T,
      };
    }

    // ---------- 固件 ----------
    case "flash_firmware": {
      const firmwareId = (args?.firmware_id as string) ?? "momentum";
      startMockFlash(firmwareId);
      return {
        success: true,
        data: {
          success: true,
          firmwareId,
          method: "rpc",
          durationMs: 5000,
          message: "固件刷写成功（Mock）",
        } as T,
      };
    }

    case "cancel_flash":
      if (mockFlashTimer) {
        clearInterval(mockFlashTimer);
        mockFlashTimer = null;
      }
      return { success: true, data: null as T };

    case "list_firmwares": {
      // Mock: 返回与后端 flasher.rs 一致的 4 个固件
      return { success: true, data: MOCK_FIRMWARES as T };
    }

    case "enter_dfu_mode":
      return { success: true, data: null as T };

    // ---------- 资源导入 ----------
    case "list_resource_packages": {
      // Mock: 返回与后端 pipeline.rs 一致的 5 个资源包
      return { success: true, data: MOCK_RESOURCE_PACKAGES as T };
    }

    case "import_resources": {
      const packageIds = (args?.package_ids as string[]) ?? [];
      startMockImport(packageIds);
      return {
        success: true,
        data: {
          success: true,
          packagesImported: packageIds.length,
          packagesFailed: 0,
          filesTransferred: 80 + packageIds.length * 12,
          bytesTransferred: packageIds.length * 5_000_000,
          durationMs: 5000,
          failedPackages: [],
          message: "导入完成（Mock）",
        } as T,
      };
    }

    case "cancel_import":
      if (mockImportTimer) {
        clearInterval(mockImportTimer);
        mockImportTimer = null;
      }
      return { success: true, data: null as T };

    case "get_import_progress":
      return {
        success: true,
        data: {
          phase: "idle",
          currentFile: "",
          filesCompleted: 0,
          filesTotal: 0,
          bytesTransferred: 0,
          bytesTotal: 0,
          speedBytesPerSec: 0,
          etaSeconds: 0,
          logLines: [],
        } as T,
      };

    // ---------- AI ----------
    case "ai_chat": {
      const messages = (args?.messages as ChatMessage[]) ?? [];
      const lastMsg = messages[messages.length - 1]?.content ?? "";
      const response = pickMockResponse(lastMsg);
      return {
        success: true,
        data: {
          content: response,
          tokensUsed: Math.ceil(response.length / 2),
          model: "mock-model",
          provider: "local",
          isFallback: false,
          timestamp: Date.now(),
        } as T,
      };
    }

    case "ai_chat_stream": {
      const messages = (args?.messages as ChatMessage[]) ?? [];
      const lastMsg = messages[messages.length - 1]?.content ?? "";
      const messageId = generateId();
      startMockAiStream(messageId, lastMsg);
      return { success: true, data: messageId as T };
    }

    case "ai_chat_with_image": {
      const messages = (args?.messages as ChatMessage[]) ?? [];
      const lastMsg = messages[messages.length - 1]?.content ?? "";
      const response = pickMockResponse(lastMsg);
      return {
        success: true,
        data: {
          content: response,
          tokensUsed: Math.ceil(response.length / 2),
          model: "mock-model",
          provider: "local",
          isFallback: false,
          timestamp: Date.now(),
        } as T,
      };
    }

    case "ai_set_model_config":
      // Mock: 持久化到 localStorage（浏览器演示模式）
      try {
        const cfg = args?.config;
        if (cfg) {
          localStorage.setItem("ai_config", JSON.stringify(cfg));
        }
      } catch {
        /* ignore */
      }
      return { success: true, data: null as T };

    case "ai_get_model_config": {
      // Mock: 从 localStorage 读取，无则返回默认本地配置
      try {
        const saved = localStorage.getItem("ai_config");
        if (saved) {
          return { success: true, data: JSON.parse(saved) as T };
        }
      } catch {
        /* ignore */
      }
      return {
        success: true,
        data: {
          provider: "local",
          apiKey: "",
          apiUrl: "",
          modelName: "local-faq",
          isMultimodal: false,
        } as T,
      };
    }

    case "ai_get_courses":
      return { success: true, data: [] as T };

    case "cancel_ai_chat":
      mockAiTimers.forEach((timer) => clearInterval(timer));
      mockAiTimers.clear();
      return { success: true, data: null as T };

    // ---------- 屏幕镜像 ----------
    case "start_screen_mirror":
      startMockMirror();
      return { success: true, data: null as T };

    case "stop_screen_mirror":
      if (mockMirrorTimer) {
        clearInterval(mockMirrorTimer);
        mockMirrorTimer = null;
      }
      return { success: true, data: null as T };

    case "send_virtual_key":
      // 模拟按键后立即刷新一帧
      mockEmit(TauriEvents.ScreenMirrorFrame, generateMockFrame());
      return { success: true, data: null as T };

    // ---------- 日志 ----------
    case "save_log_dump":
      return { success: true, data: 0 as T };

    default:
      console.warn(`[Mock] 未知命令: ${cmd}`);
      return { success: false, error: `未知命令: ${cmd}` };
  }
}

// ================================================================
// 第十七部分：Mock 事件模拟器
// ================================================================

/** 根据用户消息内容选择 Mock 回复 */
function pickMockResponse(userMessage: string): string {
  const lowerMsg = userMessage.toLowerCase();
  if (lowerMsg.includes("nfc") || lowerMsg.includes("rfid") || lowerMsg.includes("卡")) {
    return MOCK_AI_RESPONSES[1];
  }
  if (
    lowerMsg.includes("步骤") ||
    lowerMsg.includes("怎么") ||
    lowerMsg.includes("操作") ||
    lowerMsg.includes("如何")
  ) {
    return MOCK_AI_RESPONSES[2];
  }
  if (lowerMsg.includes("安全") || lowerMsg.includes("合法")) {
    return MOCK_AI_RESPONSES[3];
  }
  return MOCK_AI_RESPONSES[0];
}

/** 模拟固件刷写进度推送 */
function startMockFlash(firmwareId: string): void {
  const phases: FlashProgress["phase"][] = [
    "downloading",
    "checking",
    "entering-dfu",
    "flashing",
    "verifying",
    "rebooting",
    "done",
  ];
  const phaseMessages: Record<string, string> = {
    downloading: `正在下载 ${firmwareId} 固件...`,
    checking: "校验固件完整性...",
    "entering-dfu": "进入 DFU 模式...",
    flashing: "正在刷写固件...",
    verifying: "验证刷写结果...",
    rebooting: "重启设备中...",
    done: "固件刷写完成！",
  };

  const phaseDuration = 800;
  let phaseIndex = 0;
  let phaseElapsed = 0;
  const tickMs = 100;

  mockFlashTimer = setInterval(() => {
    phaseElapsed += tickMs;

    if (phaseElapsed >= phaseDuration && phaseIndex < phases.length - 1) {
      phaseIndex++;
      phaseElapsed = 0;
    }

    const phase = phases[phaseIndex];
    const phaseProgress = phaseElapsed / phaseDuration;
    const overallProgress =
      phaseIndex >= phases.length - 1
        ? 100
        : Math.min(
            ((phaseIndex + phaseProgress) / phases.length) * 100,
            100
          );

    const flashProgress: FlashProgress = {
      phase,
      progress: Math.round(overallProgress),
      message: phaseMessages[phase] ?? "",
    };

    mockEmit(TauriEvents.FlashProgress, flashProgress);

    if (phase === "done") {
      if (mockFlashTimer) {
        clearInterval(mockFlashTimer);
        mockFlashTimer = null;
      }
    }
  }, tickMs);
}

/** 模拟资源导入进度推送 */
function startMockImport(packageIds: string[]): void {
  const phases: ImportProgress["phase"][] = [
    "backup",
    "packaging",
    "transferring",
    "extracting",
    "verifying",
    "refreshing",
    "done",
  ];
  const phaseDurations = [600, 600, 2500, 800, 600, 600, 0];
  let phaseIndex = 0;
  let phaseElapsed = 0;
  let filesCompleted = 0;
  const filesTotal = 80 + packageIds.length * 12;
  const bytesTotal = packageIds.length * 5_000_000 + 2_000_000;
  let bytesTransferred = 0;
  const logLines: string[] = [`开始导入 ${packageIds.length} 个资源包...`];

  const tickMs = 100;

  mockImportTimer = setInterval(() => {
    phaseElapsed += tickMs;

    if (
      phaseElapsed >= phaseDurations[phaseIndex] &&
      phaseIndex < phases.length - 1
    ) {
      phaseIndex++;
      phaseElapsed = 0;
      logLines.push(`进入 ${phases[phaseIndex]} 阶段`);
    }

    const phase = phases[phaseIndex];

    if (phase === "transferring") {
      const phaseProgress = phaseElapsed / phaseDurations[phaseIndex];
      filesCompleted = Math.floor(filesTotal * phaseProgress);
      bytesTransferred = Math.floor(bytesTotal * phaseProgress);
    } else if (phase === "done") {
      filesCompleted = filesTotal;
      bytesTransferred = bytesTotal;
    }

    const speed = 800_000 + Math.random() * 400_000;
    const remainingBytes = bytesTotal - bytesTransferred;
    const etaSeconds =
      phase === "transferring" && remainingBytes > 0
        ? Math.ceil(remainingBytes / speed)
        : 0;

    if (Math.random() < 0.25) {
      logLines.push(`[${phase}] 已处理 ${filesCompleted}/${filesTotal} 文件`);
    }

    const progress: ImportProgress = {
      phase,
      currentFile: phase === "transferring" ? `file_${filesCompleted}.dat` : "",
      filesCompleted,
      filesTotal,
      bytesTransferred: Math.round(bytesTransferred),
      bytesTotal,
      speedBytesPerSec: phase === "transferring" ? Math.round(speed) : 0,
      etaSeconds,
      logLines: [...logLines].slice(-20),
    };

    mockEmit(TauriEvents.ImportProgress, progress);

    if (phase === "done") {
      if (mockImportTimer) {
        clearInterval(mockImportTimer);
        mockImportTimer = null;
      }
    }
  }, tickMs);
}

/** 模拟 AI 流式响应 */
function startMockAiStream(messageId: string, userMessage: string): void {
  const response = pickMockResponse(userMessage);

  // 将回复拆分为小 chunk 模拟流式
  const chunks: string[] = [];
  let current = "";
  for (const char of response) {
    current += char;
    if (current.length >= 3 || char === "\n") {
      chunks.push(current);
      current = "";
    }
  }
  if (current) chunks.push(current);

  let chunkIndex = 0;
  const tokensUsed = Math.ceil(response.length / 2);

  const timer = setInterval(() => {
    if (chunkIndex < chunks.length) {
      mockEmit(TauriEvents.AiChatStream, {
        messageId,
        delta: chunks[chunkIndex],
        done: false,
      } as AiChatStreamChunk);
      chunkIndex++;
    } else {
      mockEmit(TauriEvents.AiChatStream, {
        messageId,
        delta: "",
        done: true,
        tokensUsed,
      } as AiChatStreamChunk);
      clearInterval(timer);
      mockAiTimers.delete(messageId);
    }
  }, 50);

  mockAiTimers.set(messageId, timer);
}

/** 生成 Mock 屏幕镜像帧（128x64 1bit 动画图案） */
function generateMockFrame(): ScreenMirrorFrame {
  const width = 128;
  const height = 64;
  const data: number[] = new Array(width * height);
  const tick = Date.now() / 200;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      // 边框
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        data[idx] = 1;
        continue;
      }
      // 滚动正弦波纹
      const wave = Math.sin((x + tick) * 0.15) + Math.sin(y * 0.2);
      data[idx] = wave > 0.5 ? 1 : 0;
    }
  }

  return { width, height, data };
}

/** 模拟屏幕镜像帧持续推送（~10fps） */
function startMockMirror(): void {
  // 立即推送第一帧
  mockEmit(TauriEvents.ScreenMirrorFrame, generateMockFrame());

  mockMirrorTimer = setInterval(() => {
    mockEmit(TauriEvents.ScreenMirrorFrame, generateMockFrame());
  }, 100);
}
