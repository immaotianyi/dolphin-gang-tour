/** Lucy Desktop 类型定义 */

// ===== 设备相关 =====
export type ConnectionState = "disconnected" | "scanning" | "connected" | "error";

export interface DeviceInfo {
  name: string;
  firmwareVersion: string;
  batteryLevel: number;
  sdCardFree: number;
  sdCardTotal: number;
  uptime: number;
  temperature: number;
}

export interface ScreenFrame {
  width: number;
  height: number;
  data: Uint8Array;
}

export type Module = "nfc" | "subghz" | "ir" | "gpio" | "sys" | "ui" | "hid";

export interface DeviceRequest {
  id: number;
  mod: Module;
  op: string;
  data: Record<string, unknown>;
}

export interface DeviceResponse {
  id: number;
  ok: boolean;
  data: Record<string, unknown>;
  error?: string;
}

export interface DeviceEvent {
  evt: string;
  data: Record<string, unknown>;
}

// ===== NFC =====
export interface NfcCardInfo {
  uid: string;
  type: string;
  manufacturer: string;
  rssi: number;
  atqa?: number;
  sak?: number;
  ats?: string;
}

// ===== SubGHz =====
export interface SubGHzSignal {
  frequency: number;
  rssi: number;
  modulation: string;
  bandwidth: number;
  timestamp: number;
}

// ===== AI =====
export type AiModel = "deepseek" | "openai" | "claude" | "local";

export interface AiMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  cmds?: AiCommand[];
  suggestions?: CommandSuggestion[];
  blocked_warnings?: string[];
  sanitized?: boolean;
  model?: string;
}

export interface AiCommand {
  mod: Module;
  op: string;
  data: Record<string, unknown>;
}

// ===== AI 命令建议卡片（审批制）=====
export type RiskLevel = "safe" | "caution" | "dangerous" | "blocked";

export interface CommandSuggestion {
  id: string;
  module: string;
  action: string;
  args: string[];
  raw: string;
  risk: RiskLevel;
  risk_label: string;
  description: string;
  ai_reason: string;
  auto_executable: boolean;
}

// ===== BadUSB 预览 =====
export interface BadusbPreviewLine {
  line_num: number;
  raw: string;
  action: string;
  risk: "safe" | "warn" | "danger";
}

export interface BadusbReport {
  passed: boolean;
  danger_count: number;
  warn_count: number;
  safe_count: number;
  total_lines: number;
  issues: Array<{ line: number; severity: string; message: string }>;
}

// ===== 地区合规 =====
export type RegionCode = "us" | "eu" | "jp" | "cn" | "global";

export interface FrequencyBand {
  start: number;
  end: number;
  name: string;
  max_power_dbm: number;
  allowed: boolean;
}

export interface FrequencyCheck {
  allowed: boolean;
  frequency: number;
  band: string | null;
  reason: string;
  region: string;
}

export interface RegionInfo {
  code: RegionCode;
  name: string;
  bands: FrequencyBand[];
}

// ===== 设备健康 =====
export interface DeviceHealth {
  state: string;
  is_virtual: boolean;
  device: DeviceInfo | null;
  pending_ai_commands: number;
}

export interface AiConfig {
  model: AiModel;
  apiKey: string;
  baseUrl: string;
  systemPrompt: string;
}

// ===== UI =====
export type ViewId = "dashboard" | "nfc" | "subghz" | "ir" | "badusb" | "gpio" | "screen" | "ai" | "firmware" | "settings" | "library" | "virtualLab" | "audit" | "changelog" | "releaseFreeze";

export type ModalId =
  | "mirror"
  | "trophy"
  | "pet"
  | "circuit"
  | "resource"
  | "settings"
  | "help"
  | "about"
  | "commandPalette"
  | null;

export interface NavItem {
  id: ViewId;
  label: string;
  icon: IconName;
  shortcut?: string;
}

// ===== Pet =====
export type PetMood = "happy" | "normal" | "sad" | "excited" | "sleeping" | "sick";
export type PetEvolutionStage = "egg" | "baby" | "child" | "teen" | "adult";

export interface PetState {
  name: string;
  level: number;
  exp: number;
  expToNext: number;
  mood: PetMood;
  evolutionStage: PetEvolutionStage;
  hunger: number;
  happiness: number;
  energy: number;
  sick: boolean;
  action: string;
  totalInteractions: number;
  birthDate: number;
}

// ===== Icons =====
export type IconName =
  | "chip"
  | "nfc"
  | "radio"
  | "ir"
  | "keyboard"
  | "circuit"
  | "robot"
  | "rocket"
  | "wrench"
  | "mirror"
  | "trophy"
  | "pet"
  | "settings"
  | "help"
  | "about"
  | "dashboard"
  | "package"
  | "warning"
  | "check"
  | "cross"
  | "chevron-down"
  | "chevron-up"
  | "chevron-left"
  | "chevron-right"
  | "battery"
  | "signal"
  | "heart"
  | "star"
  | "sandwich"
  | "book"
  | "terminal"
  | "shield"
  | "download"
  | "upload"
  | "play"
  | "pause"
  | "stop"
  | "refresh"
  | "search"
  | "menu"
  | "close"
  | "plus"
  | "minus"
  | "info"
  | "lock"
  | "unlock"
  | "power"
  | "bolt"
  | "fire"
  | "edit"
  | "folder"
  | "tag"
  | "export"
  | "trash"
  | "copy"
  | "filter"
  | "database"
  | "list"
  | "grid"
  | "save"
  | "file"
  | "flask"
  | "graduation"
  | "history"
  | "cloud"
  | "alert"
  | "lock";

// ===== TaskFlow 任务流 =====
export type TaskFlowModule = "nfc" | "subghz" | "ir" | "badusb" | "firmware";

export type TaskStepStatus = "pending" | "active" | "done" | "skipped" | "error";

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  status: TaskStepStatus;
  riskLevel: RiskLevel;
  optional?: boolean;
  resultData?: Record<string, unknown>;
}

export interface TaskFlow {
  id: string;
  title: string;
  module: TaskFlowModule;
  steps: TaskStep[];
  currentStep: number;
  riskLevel: RiskLevel;
  canPause: boolean;
  canResume: boolean;
  resultAssetId?: string;
  createdAt: number;
  updatedAt: number;
}

// ===== 资产库类型 =====
export type AssetType = "nfc_cards" | "subghz_signals" | "ir_remotes" | "badusb_scripts" | "gpio_sessions" | "firmware_history" | "ai_conversations" | "audit_logs" | "device_profiles" | "user_collections";

export interface NfcCardAsset {
  id: string;
  uid: string;
  card_type: string;
  atqa?: string;
  sak?: string;
  manufacturer?: string;
  data?: string;
  label?: string;
  tags?: string;
  starred: boolean;
  created_at: number;
  updated_at: number;
}

export interface SubghzSignalAsset {
  id: string;
  frequency: number;
  modulation: string;
  rssi?: number;
  protocol?: string;
  raw_data?: string;
  label?: string;
  tags?: string;
  starred: boolean;
  created_at: number;
  updated_at: number;
}

export interface IrRemoteAsset {
  id: string;
  name: string;
  brand?: string;
  protocol?: string;
  buttons: string;
  label?: string;
  tags?: string;
  starred: boolean;
  created_at: number;
  updated_at: number;
}

export interface BadusbScriptAsset {
  id: string;
  name: string;
  content: string;
  risk_level: string;
  category?: string;
  tags?: string;
  starred: boolean;
  executed_count: number;
  last_executed_at?: number;
  created_at: number;
  updated_at: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  command: string;
  module: string;
  risk_level: string;
  source: string;
  result: string;
  detail?: string;
  user_id?: string;
}

export interface AssetStats {
  nfc_cards: number;
  subghz_signals: number;
  ir_remotes: number;
  badusb_scripts: number;
  gpio_sessions: number;
  firmware_history: number;
  ai_conversations: number;
  audit_logs: number;
  device_profiles: number;
  user_collections: number;
  [key: string]: number;
}

// ===== Gateway =====
export interface GatewayResult {
  allowed: boolean;
  risk_level: string;
  requires_approval: boolean;
  requires_region_check: boolean;
  requires_badusb_guard: boolean;
  reason: string;
  policy?: {
    command: string;
    module: string;
    risk: string;
    ai_allowed: boolean;
    requires_confirm: boolean;
    description: string;
  };
}
