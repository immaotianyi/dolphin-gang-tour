/** Tauri IPC 封装层 — 提供类型安全的 invoke/listen 接口 */
// 使用动态导入避免在浏览器环境中崩溃

/** 是否在 Tauri 环境中运行 */
export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

/** 类型安全的 invoke 封装 */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  if (!isTauri()) {
    return mockInvoke<T>(cmd, args);
  }
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

/** 监听后端事件 */
export async function onEvent<T>(
  event: string,
  handler: (payload: T) => void
): Promise<(() => void) | null> {
  if (!isTauri()) {
    return mockListen(event, handler);
  }
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<T>(event, (e) => handler(e.payload));
  return () => unlisten();
}

// ===== 虚拟设备 Mock（浏览器开发模式） =====

const mockState: Record<string, unknown> = {
  connectionState: "connected",
  deviceInfo: {
    name: "Lucy (Virtual Demo)",
    firmwareVersion: "0.1.0-virtual",
    batteryLevel: 78,
    sdCardFree: 6_800_000_000,
    sdCardTotal: 8_000_000_000,
    uptime: 3600,
    temperature: 42,
  },
};

const mockHandlers: Record<string, ((payload: unknown) => void)[]> = {};

// ===== Library mock data =====
const mockNfcCards = [
  { id: "nfc-1", uid: "04:A3:B2:C1", card_type: "NTAG213", manufacturer: "NXP", label: "Office Badge", tags: "work,access", starred: true, created_at: 1720000000, updated_at: 1720000000 },
  { id: "nfc-2", uid: "1A:2B:3C:4D", card_type: "Mifare Classic 1K", manufacturer: "NXP", label: "Metro Card", tags: "transit", starred: false, created_at: 1720100000, updated_at: 1720100000 },
];
const mockSubghzSignals = [
  { id: "sub-1", frequency: 433920000, modulation: "OOK", rssi: -42, protocol: "Princeton", label: "Gate Remote", tags: "gate,home", starred: true, created_at: 1720000000, updated_at: 1720000000 },
  { id: "sub-2", frequency: 315000000, modulation: "ASK", rssi: -55, protocol: "EV1527", label: "Door Bell", tags: "home", starred: false, created_at: 1720200000, updated_at: 1720200000 },
];
const mockIrRemotes = [
  { id: "ir-1", name: "TV Samsung", brand: "Samsung", protocol: "NEC", buttons: '[{"code":2,"label":"Power"},{"code":4,"label":"Vol+"},{"code":5,"label":"Vol-"}]', label: "Living Room TV", tags: "tv,living", starred: false, created_at: 1720000000, updated_at: 1720000000 },
];
const mockBadusbScripts = [
  { id: "bad-1", name: "Hello World", content: "STRING Hello World\nENTER\n", risk_level: "safe", category: "demo", tags: "test", starred: false, executed_count: 3, last_executed_at: 1720500000, created_at: 1720000000, updated_at: 1720000000 },
];
const mockAuditLogs = [
  { id: "aud-1", timestamp: 1720500000, command: "nfc_read_card", module: "nfc", risk_level: "safe", source: "User", result: "success", detail: "Read NTAG213 UID=04:A3:B2:C1" },
  { id: "aud-2", timestamp: 1720400000, command: "subghz_tx", module: "subghz", risk_level: "caution", source: "AiApproved", result: "success", detail: "TX 433.92MHz OOK" },
  { id: "aud-3", timestamp: 1720300000, command: "badusb_execute", module: "badusb", risk_level: "dangerous", source: "User", result: "success", detail: "Executed: Hello World" },
];
const mockTimelineEvents = [
  { id: "tl-1", event_type: "connect", message: "Virtual device connected", detail: null, timestamp: 1720500000 },
  { id: "tl-2", event_type: "command", message: "NFC card scanned", detail: "UID=04:A3:B2:C1", timestamp: 1720490000 },
  { id: "tl-3", event_type: "security", message: "Privacy mode enabled", detail: null, timestamp: 1720480000 },
];

// ===== RC1 Frozen command list (81 commands) =====
const FROZEN_COMMANDS = [
  { name: "device_scan", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "device_connect", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "device_disconnect", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "device_get_info", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "device_refresh_info", module: "device", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "nfc_detect", module: "nfc", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "nfc_read_uid", module: "nfc", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "nfc_read_card", module: "nfc", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "nfc_write_block", module: "nfc", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "nfc_emulate", module: "nfc", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "nfc_list_saved", module: "nfc", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "subghz_scan", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "subghz_rx", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "subghz_tx", module: "subghz", risk: "dangerous", ai_allowed: false, requires_confirm: true, requires_region_check: true, requires_badusb_guard: false, audit_logged: true },
  { name: "subghz_save", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "subghz_list_saved", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "subghz_replay", module: "subghz", risk: "dangerous", ai_allowed: false, requires_confirm: true, requires_region_check: true, requires_badusb_guard: false, audit_logged: true },
  { name: "subghz_identify", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "subghz_get_region", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "subghz_set_region", module: "subghz", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "subghz_check_frequency", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: true, requires_badusb_guard: false, audit_logged: false },
  { name: "subghz_list_regions", module: "subghz", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "gpio_scan", module: "gpio", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "gpio_set_direction", module: "gpio", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "gpio_set_value", module: "gpio", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "gpio_read", module: "gpio", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "gpio_read_adc", module: "gpio", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "gpio_capture", module: "gpio", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "ir_learn", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "ir_transmit", module: "ir", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "ir_list_protocols", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "ir_list_saved", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "ir_save", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "ir_get_presets", module: "ir", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "badusb_validate", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: true, audit_logged: false },
  { name: "badusb_preview", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: true, audit_logged: false },
  { name: "badusb_execute", module: "badusb", risk: "dangerous", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: true, audit_logged: true },
  { name: "badusb_list_scripts", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "badusb_get_script", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "badusb_save_script", module: "badusb", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "screen_get_frame", module: "screen", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "ai_send_message", module: "ai", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "ai_clear_history", module: "ai", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "ai_check_sensitive", module: "ai", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "ai_set_provider", module: "ai", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "get_app_state", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "close_window", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "minimize_window", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "config_get", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "config_save_ai", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "config_save_appearance", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "config_save_device", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "config_save_general", module: "config", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "firmware_get_current", module: "firmware", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "firmware_check_update", module: "firmware", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "firmware_verify_manifest", module: "firmware", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "storage_list", module: "storage", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "storage_read", module: "storage", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "storage_write", module: "storage", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "storage_delete", module: "storage", risk: "dangerous", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "storage_info", module: "storage", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "log_get_recent", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "log_clear", module: "system", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "log_export", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "policy_list", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "device_health", module: "system", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_nfc_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_nfc_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_nfc_delete", module: "database", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_subghz_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_subghz_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_ir_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_ir_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_badusb_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_badusb_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_badusb_increment_exec", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_audit_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_audit_count", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_audit_clear", module: "database", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_ai_conv_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_ai_conv_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_firmware_history_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_asset_stats", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_timeline_save", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_timeline_list", module: "database", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_timeline_clear", module: "database", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_gateway_classify", module: "gateway", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_gateway_check", module: "gateway", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_gateway_audit_write", module: "gateway", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_device_behavior_diffs", module: "reliability", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_command_stats", module: "reliability", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_command_stats_reset", module: "reliability", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_export_diagnostics", module: "reliability", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_get_app_version", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_check_for_updates", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_get_changelog", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_get_crash_logs", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_clear_crash_logs", module: "release", risk: "caution", ai_allowed: false, requires_confirm: true, requires_region_check: false, requires_badusb_guard: false, audit_logged: true },
  { name: "cmd_log_error", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
  { name: "cmd_get_release_checklist", module: "release", risk: "safe", ai_allowed: true, requires_confirm: false, requires_region_check: false, requires_badusb_guard: false, audit_logged: false },
];

const KNOWN_ISSUES = [
  { id: "RC1-001", title: "macOS DMG build not yet produced", severity: "high", category: "packaging", description: "tauri.conf.json has DMG target configured but no actual build has been run.", workaround: "Use npm run dev for development.", status: "open" },
  { id: "RC1-002", title: "Windows NSIS installer not yet produced", severity: "high", category: "packaging", description: "NSIS config exists but no build has been run.", workaround: "Use npm run dev for development.", status: "open" },
  { id: "RC1-003", title: "Linux AppImage not yet produced", severity: "high", category: "packaging", description: "AppImage + deb config exists but no build has been run.", workaround: "Use npm run dev for development.", status: "open" },
  { id: "RC1-004", title: "Code signing not configured", severity: "high", category: "signing", description: "signingIdentity is null. No certificates obtained.", workaround: "Unsigned builds trigger OS security warnings.", status: "open" },
  { id: "RC1-005", title: "Update server manifest not deployed", severity: "medium", category: "distribution", description: "Endpoint configured but no server exists.", workaround: "Manual download from GitHub releases.", status: "open" },
  { id: "RC1-006", title: "No real hardware regression tests", severity: "high", category: "testing", description: "All tests pass but no real hardware smoke tests recorded.", workaround: "Virtual Lab provides functional coverage.", status: "open" },
  { id: "RC1-007", title: "App Mode system has no UI yet", severity: "medium", category: "ux", description: "AppMode exists in store but no UI switcher implemented.", workaround: "Mode defaults to standard.", status: "acknowledged" },
  { id: "RC1-008", title: "Database migration version not tracked", severity: "low", category: "data", description: "Uses CREATE TABLE IF NOT EXISTS but no version table.", workaround: "Schema frozen for RC1.", status: "acknowledged" },
  { id: "RC1-009", title: "Crash logs only tested in dev", severity: "medium", category: "reliability", description: "init_crash_logger works in dev but not verified in packaged app.", workaround: "Diagnostics export includes recent_errors.", status: "open" },
  { id: "RC1-010", title: "Mock handlers return hardcoded data", severity: "low", category: "testing", description: "Browser dev mode returns mock data for all 81 commands.", workaround: "Virtual device indicator badge shown on Dashboard.", status: "acknowledged" },
];

const MOCK_AUDIT = [
  { command: "subghz_tx", module: "subghz", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without RF output." },
  { command: "badusb_execute", module: "badusb", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without HID injection." },
  { command: "nfc_write_block", module: "nfc", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without writing." },
  { command: "storage_delete", module: "storage", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without deleting." },
  { command: "storage_write", module: "storage", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without writing." },
  { command: "ai_send_message", module: "ai", returns_sensitive_data: false, simulates_dangerous_action: false, safe_for_real_mode: true, notes: "Mock generates canned responses." },
  { command: "config_get", module: "config", returns_sensitive_data: true, simulates_dangerous_action: false, safe_for_real_mode: true, notes: "Mock returns empty API key." },
  { command: "cmd_export_diagnostics", module: "reliability", returns_sensitive_data: false, simulates_dangerous_action: false, safe_for_real_mode: true, notes: "Mock returns sanitized data." },
  { command: "gpio_set_value", module: "gpio", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without pin write." },
  { command: "ir_transmit", module: "ir", returns_sensitive_data: false, simulates_dangerous_action: true, safe_for_real_mode: true, notes: "Mock returns success without IR output." },
];

const MODE_BEHAVIORS = [
  { mode: "beginner", visible_modules: ["dashboard","nfc","ir","virtualLab","library","changelog"], dangerous_commands_visible: false, developer_tools_visible: false, audit_export_enabled: false, virtual_device_default: true, ai_copilot_enabled: true, auto_reconnect: true, region_override: false, notes: "Simplified interface. No SubGHz TX, BadUSB, GPIO, Firmware." },
  { mode: "standard", visible_modules: ["dashboard","nfc","subghz","ir","badusb","gpio","screen","ai","firmware","library","virtualLab","audit","changelog","settings"], dangerous_commands_visible: true, developer_tools_visible: false, audit_export_enabled: true, virtual_device_default: false, ai_copilot_enabled: true, auto_reconnect: true, region_override: false, notes: "Full module access. Dangerous commands require confirmation." },
  { mode: "developer", visible_modules: ["dashboard","nfc","subghz","ir","badusb","gpio","screen","ai","firmware","library","virtualLab","audit","changelog","settings"], dangerous_commands_visible: true, developer_tools_visible: true, audit_export_enabled: true, virtual_device_default: false, ai_copilot_enabled: true, auto_reconnect: true, region_override: true, notes: "All modules + dev tools. Region override available." },
  { mode: "education", visible_modules: ["dashboard","nfc","subghz","ir","badusb","gpio","screen","ai","library","virtualLab","changelog"], dangerous_commands_visible: true, developer_tools_visible: false, audit_export_enabled: true, virtual_device_default: true, ai_copilot_enabled: true, auto_reconnect: true, region_override: false, notes: "Classroom mode. Virtual device by default. No firmware flashing." },
  { mode: "demo", visible_modules: ["dashboard","nfc","subghz","ir","badusb","gpio","screen","ai","library","virtualLab","audit","changelog"], dangerous_commands_visible: false, developer_tools_visible: false, audit_export_enabled: true, virtual_device_default: true, ai_copilot_enabled: true, auto_reconnect: false, region_override: false, notes: "Read-only demo. All dangerous commands hidden. Virtual device only." },
];

async function mockInvoke<T>(
  cmd: string,
  _args?: Record<string, unknown>
): Promise<T> {
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));

  switch (cmd) {
    case "device_scan":
      return [{ name: "Lucy (Virtual Demo)", port: "VIRTUAL" }] as T;
    case "device_connect":
      mockState.connectionState = "connected";
      notifyListeners("state_update", { connectionState: "connected" });
      return { success: true } as T;
    case "device_disconnect":
      mockState.connectionState = "disconnected";
      notifyListeners("state_update", { connectionState: "disconnected" });
      return { success: true } as T;
    case "device_get_info":
      return mockState.deviceInfo as T;
    case "nfc_detect": {
      const cards = [
        { uid: "04:A3:B2:C1", type: "NTAG213", manufacturer: "NXP", rssi: -42 },
        { uid: "1A:2B:3C:4D", type: "Mifare Classic 1K", manufacturer: "NXP", rssi: -55 },
      ];
      const idx = Math.floor(Math.random() * cards.length);
      return cards[idx] as T;
    }
    case "subghz_scan": {
      const freqs = [433920000, 315000000, 868350000, 915000000];
      return {
        frequency: freqs[Math.floor(Math.random() * freqs.length)],
        rssi: -60 - Math.random() * 40,
        modulation: "OOK",
      } as T;
    }
    case "ai_send_message": {
      const msg = _args?.message as string;
      const response = generateMockAiResponse(msg);
      const chunkSize = 3;
      for (let i = 0; i < response.length; i += chunkSize) {
        await new Promise((r) => setTimeout(r, 30));
        notifyListeners("ai_token", response.slice(0, i + chunkSize));
      }
      return { content: response } as T;
    }
    case "get_app_state":
      return mockState as T;
    case "config_get":
      return {
        ai: { provider: "deepseek", apiKey: "", model: "deepseek-chat", temperature: 0.7, maxTokens: 2048 },
        appearance: { theme: "dark", fontSize: 14, crtEffect: true, scanlines: true },
        device: { autoConnect: true, screenFps: 15 },
        security: { badusbRequireConfirm: true, aiSanitizerEnabled: true, subghzLegalWarning: true },
      } as T;
    case "config_save_ai":
      return { success: true } as T;
    case "config_save_appearance":
      return { success: true } as T;
    case "config_save_device":
      return { success: true } as T;
    case "firmware_get_current":
      return { version: "1.0.0", apiLevel: 1, commitHash: "abc1234", buildDate: "2026-07-01", activePartition: "A", hardwareRev: 2 } as T;
    case "firmware_check_update":
      return { hasUpdate: false, currentVersion: "1.0.0", targetVersion: "1.0.0", changelog: "" } as T;
    case "firmware_verify_manifest":
      return { valid: true } as T;
    case "storage_list":
      return [
        { name: "nfc", path: "/ext/nfc", isDir: true, size: 0, modified: 1720000000 },
        { name: "subghz", path: "/ext/subghz", isDir: true, size: 0, modified: 1720000000 },
        { name: "ir", path: "/ext/ir", isDir: true, size: 0, modified: 1720000000 },
        { name: "config.txt", path: "/ext/config.txt", isDir: false, size: 256, modified: 1720800000 },
      ] as T;
    case "storage_info":
      return { total: 17179869184, free: 12884901888, used: 4294967296, label: "LUCY-SD" } as T;
    case "storage_read":
      return { content: "Sample file content", size: 20 } as T;
    case "storage_write":
      return { success: true } as T;
    case "storage_delete":
      return { success: true } as T;
    case "log_get_recent":
      return [
        { level: "info", message: "Lucy Desktop started", module: "app", timestamp: Date.now() / 1000 },
        { level: "info", message: "Virtual device connected", module: "device", timestamp: Date.now() / 1000 },
      ] as T;
    case "log_clear":
      return { success: true } as T;
    case "log_export":
      return "/tmp/lucy_export.log" as T;
    case "device_refresh_info":
      return mockState.deviceInfo as T;
    case "nfc_read_card":
      return { uid: "04:A3:B2:C1", type: "NTAG213", manufacturer: "NXP", blocks: 45, memorySize: 144 } as T;
    case "nfc_list_saved":
      return [
        { uid: "04:A3:B2:C1", type: "NTAG213", savedAt: 1720000000 },
        { uid: "1A:2B:3C:4D", type: "Mifare Classic 1K", savedAt: 1720100000 },
      ] as T;
    case "subghz_list_saved":
      return [
        { name: "Gate Remote", frequency: 433920000, modulation: "OOK", savedAt: 1720000000 },
      ] as T;
    case "subghz_identify":
      return { protocol: "Princeton", description: "Common gate/door remote" } as T;
    case "gpio_scan":
      return [
        { pin: 1, name: "GPIO1", mode: "input", value: 0 },
        { pin: 2, name: "GPIO2", mode: "input", value: 0 },
        { pin: 3, name: "GPIO3", mode: "output", value: 1 },
        { pin: 4, name: "GPIO4", mode: "input", value: 0 },
      ] as T;
    case "ir_list_protocols":
      return [
        { name: "NEC", description: "Most common IR protocol" },
        { name: "RC5", description: "Philips protocol" },
        { name: "RC6", description: "Extended Philips" },
        { name: "Samsung", description: "Samsung devices" },
        { name: "Sony", description: "Sony SIRC" },
      ] as T;
    case "ir_get_presets":
      return [
        { name: "TV Samsung", address: 7, keys: [{ code: 2, label: "Power" }, { code: 4, label: "Vol+" }, { code: 5, label: "Vol-" }] },
        { name: "AC LG", address: 0, keys: [{ code: 8, label: "On/Off" }, { code: 9, label: "Mode" }] },
      ] as T;
    case "ir_list_saved":
      return [{ name: "TV Power", protocol: "NEC", address: 7, command: 2 }] as T;
    case "badusb_validate":
      return { safe: true, dangers: [], warnings: [], safePatterns: [] } as T;
    case "badusb_list_scripts":
      return [
        { id: "hello", name: "Hello World", safe: true },
        { id: "open_notepad", name: "Open Notepad", safe: true },
      ] as T;
    case "badusb_get_script":
      return "STRING Hello World\nENTER\n" as T;
    case "screen_get_frame":
      return { width: 240, height: 240, format: "rgb565", data: "" } as T;
    case "ai_clear_history":
      return { success: true } as T;
    case "ai_check_sensitive":
      return { hasSensitive: false, items: {} } as T;
    case "ai_set_provider":
      return { success: true, provider: _args?.provider || "deepseek" } as T;
    // ===== Database / Library =====
    case "cmd_nfc_save": {
      const newCard = { id: `nfc-${Date.now()}`, uid: String(_args?.uid ?? ""), card_type: String(_args?.card_type ?? "Unknown"), manufacturer: String(_args?.manufacturer ?? ""), label: String(_args?.label ?? ""), tags: String(_args?.tags ?? ""), starred: false, created_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) };
      mockNfcCards.unshift(newCard);
      return { success: true, id: newCard.id } as T;
    }
    case "cmd_nfc_list":
      return mockNfcCards as T;
    case "cmd_nfc_delete": {
      const idx = mockNfcCards.findIndex(c => c.id === _args?.id);
      if (idx >= 0) mockNfcCards.splice(idx, 1);
      return { success: true } as T;
    }
    case "cmd_subghz_save": {
      const newSig = { id: `sub-${Date.now()}`, frequency: Number(_args?.frequency ?? 433920000), modulation: String(_args?.modulation ?? "OOK"), rssi: Number(_args?.rssi ?? -50), protocol: String(_args?.protocol ?? ""), label: String(_args?.label ?? ""), tags: String(_args?.tags ?? ""), starred: false, created_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) };
      mockSubghzSignals.unshift(newSig);
      return { success: true, id: newSig.id } as T;
    }
    case "cmd_subghz_list":
      return mockSubghzSignals as T;
    case "cmd_ir_save": {
      const newRemote = { id: `ir-${Date.now()}`, name: String(_args?.name ?? "Unknown"), brand: String(_args?.brand ?? ""), protocol: String(_args?.protocol ?? ""), buttons: String(_args?.buttons ?? "[]"), label: String(_args?.label ?? ""), tags: String(_args?.tags ?? ""), starred: false, created_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) };
      mockIrRemotes.unshift(newRemote);
      return { success: true, id: newRemote.id } as T;
    }
    case "cmd_ir_list":
      return mockIrRemotes as T;
    case "cmd_badusb_save": {
      const newScript = { id: `bad-${Date.now()}`, name: String(_args?.name ?? "Untitled"), content: String(_args?.content ?? ""), risk_level: String(_args?.risk_level ?? "safe"), category: String(_args?.category ?? ""), tags: String(_args?.tags ?? ""), starred: false, executed_count: 0, last_executed_at: 0, created_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) };
      mockBadusbScripts.unshift(newScript);
      return { success: true, id: newScript.id } as T;
    }
    case "cmd_badusb_list":
      return mockBadusbScripts as T;
    case "cmd_badusb_increment_exec": {
      const script = mockBadusbScripts.find(s => s.id === _args?.id);
      if (script) { script.executed_count++; script.last_executed_at = Math.floor(Date.now() / 1000); }
      return { success: true } as T;
    }
    case "cmd_audit_list":
      return mockAuditLogs as T;
    case "cmd_audit_count":
      return mockAuditLogs.length as T;
    case "cmd_audit_clear":
      mockAuditLogs.length = 0;
      return { success: true } as T;
    case "cmd_ai_conv_save":
      return { success: true, id: `conv-${Date.now()}` } as T;
    case "cmd_ai_conv_list":
      return [] as T;
    case "cmd_firmware_history_list":
      return [] as T;
    case "cmd_asset_stats":
      return { nfc_cards: mockNfcCards.length, subghz_signals: mockSubghzSignals.length, ir_remotes: mockIrRemotes.length, badusb_scripts: mockBadusbScripts.length, gpio_sessions: 0, firmware_history: 0, ai_conversations: 0, audit_logs: mockAuditLogs.length, device_profiles: 0, user_collections: 0, timeline_events: mockTimelineEvents.length } as T;
    case "cmd_timeline_save": {
      const newEvent = { id: String(_args?.id ?? `tl-${Date.now()}`), event_type: String(_args?.event_type ?? "info"), message: String(_args?.message ?? ""), detail: _args?.detail ? String(_args?.detail) : null, timestamp: Number(_args?.timestamp ?? Math.floor(Date.now() / 1000)) };
      mockTimelineEvents.unshift(newEvent);
      return { success: true, id: newEvent.id } as T;
    }
    case "cmd_timeline_list":
      return mockTimelineEvents.slice(0, Number(_args?.limit ?? 100)) as T;
    case "cmd_timeline_clear":
      mockTimelineEvents.length = 0;
      return { success: true } as T;
    case "cmd_device_behavior_diffs":
      return [
        { feature: "NFC Read", virtual_behavior: "Returns mock NTAG213 data", real_behavior: "Reads actual card via ST25R3916", notes: "Virtual always succeeds; real may fail on no card" },
        { feature: "SubGHz TX", virtual_behavior: "Simulated TX, no RF output", real_behavior: "CC1101 RF output, region-checked", notes: "Virtual bypasses region check; real enforces" },
        { feature: "BadUSB Execute", virtual_behavior: "Simulated keypress log only", real_behavior: "HID injection to target host", notes: "Both require 3-stage approval" },
        { feature: "GPIO", virtual_behavior: "Mock ADC values (random)", real_behavior: "Real ADC readings from ESP32-S3", notes: "Virtual pin config is cosmetic" },
        { feature: "Firmware OTA", virtual_behavior: "Simulated flash, instant", real_behavior: "DFU flash via USB, 30-60s", notes: "Virtual doesn't verify signature" },
        { feature: "Screen Mirror", virtual_behavior: "Generated frames (test pattern)", real_behavior: "Captured from device display", notes: "Virtual runs at 2 FPS; real at 10+ FPS" },
        { feature: "Connection Speed", virtual_behavior: "Instant (no USB)", real_behavior: "USB CDC, ~1ms latency", notes: "Virtual has 0ms jitter" },
        { feature: "Error Recovery", virtual_behavior: "Never fails", real_behavior: "USB disconnect, timeout, CRC errors", notes: "Virtual hides protocol errors" },
        { feature: "Storage", virtual_behavior: "Mock SD card (8GB free)", real_behavior: "Real SD card via SPI/FAT", notes: "Virtual storage is not persistent" },
        { feature: "Battery", virtual_behavior: "Always 100%", real_behavior: "Actual battery via ADC", notes: "Virtual temperature is 25°C fixed" },
      ] as T;
    case "cmd_command_stats":
      return { total: 0, success: 0, failed: 0, timed_out: 0, retried: 0, avg_duration_ms: 0 } as T;
    case "cmd_command_stats_reset":
      return { success: true } as T;
    case "cmd_export_diagnostics":
      return {
        generated_at: new Date().toISOString(),
        app_version: "0.7.0-rc1",
        app_info: { name: "Lucy Desktop", version: "0.7.0-rc1", rust_version: "1.75+", target_os: "macos", target_arch: "aarch64" },
        device_info: { is_virtual: true, connection_state: "connected", device_name: "Virtual Device", firmware_version: "0.99.1", api_level: 35, last_connected_at: new Date().toISOString() },
        command_stats: { total: 0, success: 0, failed: 0, timed_out: 0, retried: 0, avg_duration_ms: 0 },
        protocol_stats: { total_requests: 0, total_responses: 0, avg_latency_ms: 0, timeout_count: 0, error_count: 0 },
        security_info: { command_policy_enabled: true, privacy_mode: true, badusb_guard_enabled: true, region_check_enabled: true, developer_mode: false, audit_log_count: 3 },
        recent_errors: [],
        config_summary: { language: "zh-CN", theme: "cyberpunk", region: "CN", ai_model: "deepseek", ai_provider: "DeepSeek" },
      } as T;
    // ===== Gateway =====
    case "cmd_gateway_classify": {
      const command = String(_args?.command ?? "");
      let risk = "safe";
      if (command.includes("tx") || command.includes("write") || command.includes("execute")) risk = "caution";
      if (command.includes("flash") || command.includes("format")) risk = "dangerous";
      return { command, module: String(_args?.module ?? ""), risk, ai_allowed: risk !== "blocked", requires_confirm: risk !== "safe", description: `Risk: ${risk}` } as T;
    }
    case "cmd_gateway_check":
      return { allowed: true, risk_level: "safe", requires_approval: false, requires_region_check: false, requires_badusb_guard: false, reason: "OK" } as T;
    case "cmd_gateway_audit_write":
      return { success: true } as T;
    // ===== Release Engineering =====
    case "cmd_get_app_version":
      return {
        version: "0.7.0-rc1",
        build_date: "2026-07-14",
        git_hash: "rc1-freeze",
        target_os: "macos",
        target_arch: "aarch64",
        rust_version: "1.75+",
      } as T;
    case "cmd_check_for_updates":
      return {
        has_update: false,
        current_version: "0.7.0-rc1",
        target_version: "0.7.0-rc1",
        changelog: "You are running the latest version.",
        download_url: "",
        release_date: "",
        critical: false,
      } as T;
    case "cmd_get_changelog":
      return [
        {
          version: "0.7.0",
          date: "2026-07-14",
          phase: "Phase 7: Release Readiness",
          categories: [
            {
              kind: "new",
              title: "Hardware Reliability",
              items: [
                "Command timeout (10s) + retry with exponential backoff",
                "Heartbeat monitor with missed threshold detection",
                "Auto-reconnect (5 attempts) with virtual device fallback",
                "Device behavior diff table (10 features documented)",
              ],
            },
            {
              kind: "new",
              title: "Audit Center",
              items: [
                "Independent audit page with 3D filtering (module/risk/time)",
                "AI approval chain traceability",
                "Export desensitized audit report (JSON)",
              ],
            },
            {
              kind: "new",
              title: "Diagnostics & Release",
              items: [
                "One-click diagnostics package export (7 sub-structures)",
                "macOS DMG / Windows NSIS / Linux AppImage build config",
                "Auto-update channel with version manifest",
                "Local crash/error log persistence (~/.lucy/logs/)",
                "In-app changelog page with version history",
              ],
            },
            {
              kind: "improve",
              title: "UX Hardening",
              items: [
                "TaskFlow error/retry/resume support",
                "App Mode system (beginner/standard/developer/education/demo)",
                "Dashboard health score (0-100, 5-level colors)",
                "Virtual Lab progress persistence (localStorage)",
              ],
            },
          ],
        },
        {
          version: "0.6.0",
          date: "2026-07-13",
          phase: "Phase 6: Productization",
          categories: [
            {
              kind: "new",
              title: "Core Architecture",
              items: [
                "SQLite asset library (11 tables, WAL mode)",
                "CommandGateway 5-stage security pipeline",
                "TaskFlow engine with 5 flow templates",
              ],
            },
            {
              kind: "new",
              title: "Modules",
              items: [
                "Library page (5-tab asset library)",
                "Virtual Lab (5 courses x 13 lessons + AI Coach)",
                "Audit Center with filtering and export",
                "Timeline persistence to database",
              ],
            },
            {
              kind: "improve",
              title: "AI Copilot",
              items: [
                "Context-aware suggestions (10 view-to-mapping)",
                "Virtual device indicator in AI responses",
              ],
            },
          ],
        },
        {
          version: "0.5.0",
          date: "2026-07-12",
          phase: "Phase 5: Foundation",
          categories: [
            {
              kind: "new",
              title: "Internationalization",
              items: [
                "i18n with 676 keys (28 sections, zh-CN/en-US)",
                "Language switcher in settings",
              ],
            },
            {
              kind: "new",
              title: "UI Design System",
              items: [
                "8-bit pixel + Apple smooth design system",
                "Settings 2.0 with 4-tab layout",
                "Dashboard with device digital twin",
              ],
            },
          ],
        },
        {
          version: "0.1.0",
          date: "2026-07-10",
          phase: "Phase 1-4: Core Modules",
          categories: [
            {
              kind: "new",
              title: "Hardware Modules",
              items: [
                "NFC reader (detect/read/write/emulate)",
                "Sub-GHz scanner (region-checked TX)",
                "IR remote (learn/transmit/presets)",
                "BadUSB (validate/preview/execute, 3-stage)",
                "GPIO (scan/read/write/ADC)",
              ],
            },
            {
              kind: "new",
              title: "AI & System",
              items: [
                "AI Copilot with desensitization",
                "Firmware management (DFU/OTA)",
                "Screen mirror (virtual + real)",
                "RPC protocol (VLX variant)",
              ],
            },
          ],
        },
      ] as T;
    case "cmd_get_crash_logs":
      return [
        { timestamp: "08:12:03", level: "info", message: "Lucy Desktop started v0.7.0" },
        { timestamp: "08:12:05", level: "info", message: "SQLite opened at ~/.lucy/assets.db" },
        { timestamp: "08:12:06", level: "info", message: "Auto-connected to virtual device" },
      ] as T;
    case "cmd_clear_crash_logs":
      return { success: true } as T;
    case "cmd_log_error":
      return { success: true } as T;
    case "cmd_get_release_checklist":
      return {
        ready: false,
        items: [
          { id: "ts_check", label: "TypeScript 0 errors", category: "code_quality", required: true, status: "done" },
          { id: "rust_tests", label: "Rust tests all pass", category: "code_quality", required: true, status: "done" },
          { id: "i18n_parity", label: "i18n zh-CN/en-US parity", category: "code_quality", required: true, status: "done" },
          { id: "vite_build", label: "Vite build success", category: "build", required: true, status: "done" },
          { id: "macos_dmg", label: "macOS DMG build", category: "packaging", required: true, status: "pending" },
          { id: "windows_nsis", label: "Windows NSIS installer", category: "packaging", required: true, status: "pending" },
          { id: "linux_appimage", label: "Linux AppImage", category: "packaging", required: true, status: "pending" },
          { id: "code_signing", label: "Code signing", category: "signing", required: true, status: "pending" },
          { id: "auto_update", label: "Auto-update manifest published", category: "distribution", required: false, status: "pending" },
          { id: "crash_reporting", label: "Crash/error logging verified", category: "reliability", required: true, status: "done" },
          { id: "security_audit", label: "Security audit (Gateway + BadUSB + Region)", category: "security", required: true, status: "done" },
          { id: "privacy_check", label: "Privacy desensitization verified (7 patterns)", category: "security", required: true, status: "done" },
          { id: "release_notes", label: "Release notes written", category: "documentation", required: true, status: "done" },
          { id: "changelog_page", label: "In-app changelog page", category: "documentation", required: true, status: "done" },
        ],
      } as T;
    case "config_save_general":
    case "config_save_security":
      return { success: true } as T;
    // ===== RC1 Release Freeze =====
    case "cmd_get_freeze_snapshot":
      return {
        version: "0.7.0-rc1",
        freeze_date: "2026-07-14",
        tauri_command_count: 100,
        i18n_key_count: 1000,
        i18n_section_count: 41,
        database_table_count: 11,
        rust_test_count: 159,
        frontend_file_count: 44,
        rust_file_count: 36,
        bundle_size_kb: 447.36,
        gzip_size_kb: 130.74,
        status: "frozen",
      } as T;
    case "cmd_get_frozen_commands":
      return FROZEN_COMMANDS as T;
    case "cmd_get_high_risk_summary": {
      const dangerous = FROZEN_COMMANDS.filter(c => c.risk === "dangerous");
      const caution = FROZEN_COMMANDS.filter(c => c.risk === "caution");
      return {
        dangerous_count: dangerous.length,
        caution_count: caution.length,
        safe_count: FROZEN_COMMANDS.filter(c => c.risk === "safe").length,
        blocked_count: 0,
        ai_blocked_count: FROZEN_COMMANDS.filter(c => !c.ai_allowed).length,
        audit_logged_count: FROZEN_COMMANDS.filter(c => c.audit_logged).length,
        region_checked_count: FROZEN_COMMANDS.filter(c => c.requires_region_check).length,
        badusb_guarded_count: FROZEN_COMMANDS.filter(c => c.requires_badusb_guard).length,
        dangerous_commands: dangerous.map(c => c.name),
        caution_commands: caution.map(c => c.name),
      } as T;
    }
    case "cmd_get_known_issues":
      return KNOWN_ISSUES as T;
    case "cmd_get_mock_audit":
      return MOCK_AUDIT as T;
    case "cmd_get_mode_behaviors":
      return MODE_BEHAVIORS as T;
    case "cmd_get_database_schema_snapshot":
      return {
        version: "rc1-frozen",
        table_count: 11,
        migration_strategy: "CREATE TABLE IF NOT EXISTS (idempotent, no version table)",
        tables: [
          { name: "nfc_cards", column_count: 11, has_timestamps: true, has_foreign_keys: false },
          { name: "subghz_signals", column_count: 9, has_timestamps: true, has_foreign_keys: false },
          { name: "ir_remotes", column_count: 9, has_timestamps: true, has_foreign_keys: false },
          { name: "badusb_scripts", column_count: 10, has_timestamps: true, has_foreign_keys: false },
          { name: "gpio_sessions", column_count: 7, has_timestamps: true, has_foreign_keys: false },
          { name: "firmware_history", column_count: 8, has_timestamps: true, has_foreign_keys: false },
          { name: "ai_conversations", column_count: 6, has_timestamps: true, has_foreign_keys: false },
          { name: "audit_logs", column_count: 8, has_timestamps: true, has_foreign_keys: false },
          { name: "device_profiles", column_count: 8, has_timestamps: true, has_foreign_keys: false },
          { name: "user_collections", column_count: 7, has_timestamps: true, has_foreign_keys: false },
          { name: "timeline_events", column_count: 6, has_timestamps: true, has_foreign_keys: false },
        ],
      } as T;
    case "close_window":
    case "minimize_window":
      return undefined as T;
    default:
      console.warn("[Mock] Unknown command:", cmd);
      return { error: "not_implemented" } as T;
  }
}

function generateMockAiResponse(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("nfc") || lower.includes("card")) {
    return "I can help you read NFC cards. Click the NFC module on the left sidebar, then click the Scan button, and place the card near the device antenna.\n\n<cmds>\n[{\"mod\":\"nfc\",\"op\":\"detect\",\"data\":{}}]\n</cmds>";
  }
  if (lower.includes("subghz") || lower.includes("radio") || lower.includes("freq")) {
    return "Sub-GHz scanning can detect wireless signals in the 300-928MHz range. Note: Please comply with local regulations when transmitting signals.\n\n<cmds>\n[{\"mod\":\"subghz\",\"op\":\"scan\",\"data\":{\"start\":300000000,\"end\":348000000}}]\n</cmds>";
  }
  if (lower.includes("gpio") || lower.includes("pin")) {
    return "GPIO module provides 8 pins with TXB0108 level shifting. Note: each channel has ~4k ohm internal resistance, only suitable for logic signals, not for driving relays or high-power LEDs.";
  }
  return `Received: "${message}". I am Lucy, an AI-enhanced hardware tool assistant. Ask me about NFC, Sub-GHz, Infrared, GPIO, BadUSB, and more.`;
}

async function mockListen<T>(
  event: string,
  handler: (payload: T) => void
): Promise<(() => void) | null> {
  if (!mockHandlers[event]) {
    mockHandlers[event] = [];
  }
  mockHandlers[event].push(handler as (payload: unknown) => void);
  return () => {
    mockHandlers[event] = mockHandlers[event].filter((h) => h !== handler);
  };
}

function notifyListeners(event: string, payload: unknown): void {
  const handlers = mockHandlers[event];
  if (handlers) {
    handlers.forEach((h) => h(payload));
  }
}

// ===== 定时推送模拟屏幕帧（虚拟设备模式） =====
if (typeof window !== "undefined" && !isTauri()) {
  let frameCount = 0;
  setInterval(() => {
    if (mockState.connectionState === "connected") {
      const frame = generateMockScreenFrame(frameCount++);
      notifyListeners("screen_frame", frame);
    }
  }, 100);

  setInterval(() => {
    if (mockState.connectionState === "connected" && Math.random() > 0.7) {
      notifyListeners("subghz_signal", {
        frequency: 433920000 + Math.floor(Math.random() * 1000),
        rssi: -60 - Math.random() * 30,
        modulation: "OOK",
        timestamp: Date.now(),
      });
    }
  }, 3000);
}

function generateMockScreenFrame(count: number): Uint8Array {
  const w = 240;
  const h = 240;
  const data = new Uint8Array(w * h * 2);
  const t = count * 0.1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = w / 2;
      const cy = h / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const wave = Math.sin(dist * 0.05 - t * 2) * 0.5 + 0.5;
      const r = Math.floor(wave * 249);
      const g = Math.floor(wave * 115);
      const b = Math.floor(wave * 22);
      const rgb565 = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
      const idx = (y * w + x) * 2;
      data[idx] = (rgb565 >> 8) & 0xff;
      data[idx + 1] = rgb565 & 0xff;
    }
  }
  return data;
}
