/**
 * 全局类型定义
 */

// ====== 设备相关 ======

export type DeviceConnectionState =
  | "no_device"    // 未检测到设备
  | "dfu_mode"     // DFU恢复模式
  | "port_busy"    // 串口被占用
  | "sd_error"     // SD卡问题
  | "connecting"   // 连接中
  | "connected"    // 已连接
  | "transferring"; // 传输中

export type DeviceMode = "normal" | "dfu" | "unknown";

export interface DetectedDevice {
  portName: string;
  vid: number;
  pid: number;
  mode: DeviceMode;
  friendlyName: string;
  connectable: boolean;
}

export interface DeviceScanResult {
  devices: DetectedDevice[];
  state: DeviceConnectionState;
  portOccupiers: string[];
  scanTimestamp: string;
}

export interface DeviceInfo {
  name: string;
  firmwareVersion: string;
  firmwareType: "ofw" | "momentum" | "unleashed" | "roguemaster" | "unknown";
  apiLevel: number;
  hardwareVersion: string;
  batteryLevel: number;
  batteryVoltage: number;
  isCharging: boolean;
  sdCardInserted: boolean;
  sdCardTotalBytes: number;
  sdCardFreeBytes: number;
  sdCardFormat: string;
  dolphinLevel: number;
}

export interface KillResult {
  killed: string[];
  failed: string[];
  success: boolean;
}

export interface DriverInstallResult {
  needed: boolean;
  success: boolean;
  previousDriver?: string;
  installedDriver?: string;
  platform: string;
  message: string;
}

// ====== 资源导入相关 ======

export interface ResourcePackage {
  id: string;
  name: string;
  description: string;
  category: ResourceCategory;
  sizeBytes: number;
  fileCount: number;
  targetPath: string;
  defaultChecked: boolean;
  version: string;
  apiLevelRequired: number;
}

export type ResourceCategory =
  | "firmware"
  | "infrared"
  | "nfc"
  | "subghz"
  | "rfid"
  | "badusb"
  | "tools"
  | "games"
  | "themes"
  | "music"
  | "animations";

export interface ImportProgress {
  phase: "idle" | "backup" | "packaging" | "flashing" | "transferring" | "extracting" | "verifying" | "refreshing" | "done" | "error";
  currentFile: string;
  filesCompleted: number;
  filesTotal: number;
  bytesTransferred: number;
  bytesTotal: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  logLines: string[];
  errorMessage?: string;
}

export interface ImportSummary {
  success: boolean;
  packagesImported: number;
  packagesFailed: number;
  filesTransferred: number;
  bytesTransferred: number;
  durationMs: number;
  failedPackages: string[];
  message: string;
}

// ====== AI 对话相关 ======

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  imageUrl?: string;
  isStreaming?: boolean;
  tokensUsed?: number;
}

export interface AiModelConfig {
  provider: "qwen" | "deepseek" | "openai" | "local";
  apiKey: string;
  apiUrl: string;
  modelName: string;
  isMultimodal: boolean;
}

export type AiCourseId =
  | "course-00"
  | "course-01"
  | "course-02"
  | "course-03"
  | "course-04"
  | "course-05"
  | "course-06";

export interface Course {
  id: AiCourseId;
  title: string;
  description: string;
  durationMin: number;
  icon: string;
  steps: string[];
}

export interface ChatResponse {
  content: string;
  tokensUsed: number;
  model: string;
  provider: string;
  isFallback: boolean;
  timestamp: number;
}

// ====== 固件相关 ======

export type FirmwareId = "momentum" | "unleashed" | "ofw" | "roguemaster";

export interface FirmwareInfo {
  id: FirmwareId;
  name: string;
  description: string;
  recommended: boolean;
  apiLevel: number;
  downloadUrl: string;
  sizeBytes: number;
  requiresDfu: boolean;
}

export type FlashPhase =
  | "idle"
  | "downloading"
  | "checking"
  | "entering-dfu"
  | "flashing"
  | "verifying"
  | "rebooting"
  | "done"
  | "error";

export interface FlashProgress {
  phase: FlashPhase;
  progress: number;
  message: string;
  errorMessage?: string;
}

export interface FlashResult {
  success: boolean;
  firmwareId: string;
  method: string;
  durationMs: number;
  message: string;
}

// ====== 诊断相关 ======

export interface DiagnosticResult {
  level: "ok" | "warning" | "error";
  category: string;
  title: string;
  detail: string;
  autoFixable: boolean;
  fixAction?: string;
}

// ====== 屏幕镜像 ======

export interface ScreenMirrorFrame {
  width: number;
  height: number;
  data: number[]; // 1bit per pixel, 0=off 1=on
}

// ====== 通用 IPC 响应 ======

export interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface IpcEvent<T = unknown> {
  event: string;
  payload: T;
}
