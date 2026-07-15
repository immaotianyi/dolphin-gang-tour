/** Settings 2.0 模块 — 7 大分类 + 完整 i18n 支持 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelInput } from "@/components/ui/PixelInput";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import { showToast } from "@/components/ui/Toast";
import { invoke } from "@/lib/tauri";
import { useUiStore } from "@/stores/uiStore";
import type { AppLanguage } from "@/lib/i18n";
import type { RegionCode, IconName } from "@/types";

// ===== 静态配置 =====

const SETTINGS_TABS: { id: string; icon: IconName }[] = [
  { id: "general", icon: "settings" },
  { id: "appearance", icon: "mirror" },
  { id: "device", icon: "chip" },
  { id: "ai", icon: "robot" },
  { id: "security", icon: "shield" },
  { id: "firmware", icon: "package" },
  { id: "about", icon: "info" },
];

const AI_PROVIDERS = [
  { id: "deepseek", nameKey: "settings.deepseek", models: ["deepseek-chat", "deepseek-reasoner"], color: "cyan" },
  { id: "openai", nameKey: "settings.openai", models: ["gpt-4o", "gpt-4o-mini", "o1-mini"], color: "green" },
  { id: "claude", nameKey: "settings.claude", models: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"], color: "orange" },
  { id: "local", nameKey: "settings.local", models: ["llama3", "mistral", "qwen2"], color: "dim" },
] as const;

const THEMES = [
  { id: "vantablack", nameKey: "settings.themeVantablack", colors: ["#07090F", "#F97316", "#22D3EE"] },
  { id: "terminal", nameKey: "settings.themeTerminal", colors: ["#000000", "#00FF00", "#00FFFF"] },
  { id: "cyberpunk", nameKey: "settings.themeCyberpunk", colors: ["#1A0A2E", "#FF006E", "#00F5FF"] },
] as const;

const FONT_SIZES = [
  { size: 12, key: "settings.fontSizeSmall" },
  { size: 14, key: "settings.fontSizeMedium" },
  { size: 16, key: "settings.fontSizeLarge" },
] as const;

const REGIONS: { code: RegionCode; descKey: string }[] = [
  { code: "us", descKey: "region.us" },
  { code: "eu", descKey: "region.eu" },
  { code: "jp", descKey: "region.jp" },
  { code: "cn", descKey: "region.cn" },
  { code: "global", descKey: "region.global" },
];

const LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: "zh-CN", label: "简体中文" },
  { code: "en-US", label: "English" },
];

export const SettingsModule: React.FC = () => {
  const { t } = useTranslation();
  const { language, setLanguage } = useUiStore();

  const [activeTab, setActiveTab] = useState("general");

  // General
  const [region, setRegion] = useState<RegionCode>("global");
  const [startupBehavior, setStartupBehavior] = useState<"dashboard" | "last">("dashboard");
  const [autoConnect, setAutoConnect] = useState(true);
  const [dataDirectory, setDataDirectory] = useState("~/.lucy");

  // Appearance
  const [theme, setTheme] = useState("vantablack");
  const [crtEffect, setCrtEffect] = useState(true);
  const [scanlines, setScanlines] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fontSize, setFontSize] = useState(14);

  // Device
  const [autoScan, setAutoScan] = useState(true);
  const [protocolDebug, setProtocolDebug] = useState(false);
  const [lastPort, setLastPort] = useState("auto");

  // AI
  const [provider, setProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("deepseek-chat");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(true);
  const [allowCommandSuggestion, setAllowCommandSuggestion] = useState(true);
  const [requireApproval, setRequireApproval] = useState(true);

  // Security
  const [badusbConfirmation, setBadusbConfirmation] = useState(true);
  const [subghzRegionLock, setSubghzRegionLock] = useState(true);
  const [sensitiveDataMasking, setSensitiveDataMasking] = useState(true);
  const [auditLog, setAuditLog] = useState(true);
  const [developerMode, setDeveloperMode] = useState(false);

  // Firmware
  const [updateChannel, setUpdateChannel] = useState<"stable" | "beta">("stable");
  const [autoCheck, setAutoCheck] = useState(true);
  const [allowBeta, setAllowBeta] = useState(false);
  const [rollback, setRollback] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("1.0.0");

  // ===== 加载配置 =====
  useEffect(() => {
    invoke<Record<string, any>>("config_get")
      .then((cfg) => {
        if (cfg?.ai) {
          setProvider(cfg.ai.provider || "deepseek");
          setApiKey(cfg.ai.apiKey || "");
          setModel(cfg.ai.model || "deepseek-chat");
          setBaseUrl(cfg.ai.baseUrl || "");
        }
        if (cfg?.appearance) {
          setTheme(cfg.appearance.theme || "vantablack");
          setFontSize(cfg.appearance.fontSize || 14);
          setCrtEffect(cfg.appearance.crtEffect ?? true);
          setScanlines(cfg.appearance.scanlines ?? true);
        }
        if (cfg?.device) {
          setAutoConnect(cfg.device.autoConnect ?? true);
          setLastPort(cfg.device.lastPort || "auto");
        }
      })
      .catch(() => {});

    invoke<{ region: RegionCode }>("subghz_get_region")
      .then((r) => setRegion(r.region))
      .catch(() => {});

    invoke<{ version: string }>("firmware_get_current")
      .then((f) => setCurrentVersion(f.version || "1.0.0"))
      .catch(() => {});
  }, []);

  // ===== 保存处理 =====
  const wrap = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      showToast("success", t("settings.saved"));
    } catch {
      showToast("error", t("settings.saveFailed"));
    }
  };

  const handleSaveGeneral = () =>
    wrap(() => invoke("config_save_general", { language, region, timezone: startupBehavior }));

  const handleSaveAppearance = () =>
    wrap(() => invoke("config_save_appearance", { theme, fontSize, crtEffect, scanlines }));

  const handleSaveDevice = () =>
    wrap(() => invoke("config_save_device", { lastPort, autoConnect }));

  const handleSaveAi = () =>
    wrap(() => invoke("config_save_ai", { provider, apiKey, model }));

  const handleSetRegion = (code: RegionCode) => {
    setRegion(code);
    wrap(() => invoke("subghz_set_region", { regionCode: code }));
  };

  const handleSetLanguage = (lang: AppLanguage) => {
    setLanguage(lang); // 即时切换 i18n 并持久化到 localStorage
  };

  const handleCheckUpdate = () =>
    wrap(async () => {
      const r = await invoke<{ hasUpdate: boolean }>("firmware_check_update");
      showToast(r?.hasUpdate ? "info" : "success", r?.hasUpdate ? t("settings.checkUpdate") : t("settings.noUpdate"));
    });

  const handleRestartDevice = () => showToast("info", t("settings.restartDevice"));
  const handleFactoryReset = () => showToast("warn", t("settings.factoryReset"));

  const currentProvider = AI_PROVIDERS.find((p) => p.id === provider) ?? AI_PROVIDERS[0];

  // ===== Tab sidebar =====
  const renderTabs = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", minWidth: 160 }}>
      {SETTINGS_TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "0.6rem 0.8rem",
              background: active ? "var(--c-bg3)" : "transparent",
              border: `2px solid ${active ? "var(--c-cyan)" : "var(--c-rule)"}`,
              cursor: "pointer",
              transition: "all 0.2s var(--ease-apple)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              textAlign: "left",
            }}
          >
            <Icon name={tab.icon} size={14} style={{ color: active ? "var(--c-cyan)" : "var(--c-dim)" }} />
            <span className={`font-pixel ${active ? "text-cyan" : "text-dim"}`} style={{ fontSize: "0.7rem" }}>
              {t(`settings.${tab.id}`)}
            </span>
          </button>
        );
      })}
    </div>
  );

  // ===== General =====
  const renderGeneral = () => (
    <PixelPanel title={t("settings.general").toUpperCase()}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* 语言 */}
        <div>
          <SectionLabel icon="settings">{t("settings.language")}</SectionLabel>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {LANGUAGES.map((l) => {
              const active = language === l.code;
              return (
                <button
                  key={l.code}
                  onClick={() => handleSetLanguage(l.code)}
                  style={{
                    flex: 1,
                    padding: "0.55rem",
                    background: active ? "var(--c-bg3)" : "var(--c-bg2)",
                    border: `2px solid ${active ? "var(--c-cyan)" : "var(--c-rule)"}`,
                    cursor: "pointer",
                    transition: "all 0.2s var(--ease-apple)",
                  }}
                >
                  <span className={`font-pixel ${active ? "text-cyan" : "text-dim"}`} style={{ fontSize: "0.7rem" }}>
                    {l.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 地区 */}
        <div>
          <SectionLabel icon="signal">{t("settings.region")}</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.4rem" }}>
            {REGIONS.map((r) => {
              const active = region === r.code;
              const accent = r.code === "global" ? "var(--c-yellow)" : "var(--c-orange)";
              return (
                <button
                  key={r.code}
                  onClick={() => handleSetRegion(r.code)}
                  style={{
                    padding: "0.4rem",
                    background: active ? "var(--c-bg3)" : "var(--c-bg2)",
                    border: `2px solid ${active ? accent : "var(--c-rule)"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s var(--ease-apple)",
                  }}
                >
                  <div className="font-pixel" style={{ fontSize: "0.6rem", color: active ? accent : "var(--c-dim)" }}>
                    {r.code.toUpperCase()}
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: "0.58rem", marginTop: "0.15rem" }}>
                    {t(r.descKey)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 启动行为 */}
        <div>
          <SectionLabel>{t("settings.startupBehavior")}</SectionLabel>
          <select
            value={startupBehavior}
            onChange={(e) => setStartupBehavior(e.target.value as "dashboard" | "last")}
            style={{
              width: "100%",
              background: "var(--c-bg3)",
              color: "var(--c-ink)",
              border: "2px solid var(--c-rule)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.8rem",
              padding: "0.5rem",
              cursor: "pointer",
            }}
          >
            <option value="dashboard">{t("settings.startupDashboard")}</option>
            <option value="last">{t("settings.startupLastView")}</option>
          </select>
        </div>

        {/* 自动连接 */}
        <ToggleRow
          label={t("settings.autoConnect")}
          desc={t("settings.autoConnectDesc")}
          checked={autoConnect}
          onChange={setAutoConnect}
        />

        {/* 数据目录 */}
        <div>
          <SectionLabel icon="package">{t("settings.dataDirectory")}</SectionLabel>
          <PixelInput value={dataDirectory} readOnly onChange={() => {}} style={{ opacity: 0.7 }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <PixelButton variant="primary" icon="check" onClick={handleSaveGeneral}>
            {t("common.save")}
          </PixelButton>
        </div>
      </div>
    </PixelPanel>
  );

  // ===== Appearance =====
  const renderAppearance = () => (
    <PixelPanel title={t("settings.appearance").toUpperCase()}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* 主题 */}
        <div>
          <SectionLabel icon="mirror">{t("settings.theme")}</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.4rem" }}>
            {THEMES.map((th) => {
              const active = theme === th.id;
              return (
                <button
                  key={th.id}
                  onClick={() => setTheme(th.id)}
                  style={{
                    padding: "0.6rem",
                    background: "var(--c-bg2)",
                    border: `2px solid ${active ? "var(--c-orange)" : "var(--c-rule)"}`,
                    cursor: "pointer",
                    transition: "all 0.2s var(--ease-apple)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.3rem",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", gap: "0.2rem" }}>
                    {th.colors.map((c) => (
                      <div key={c} style={{ width: 16, height: 16, background: c, border: "1px solid var(--c-rule)" }} />
                    ))}
                  </div>
                  <span className={`font-pixel ${active ? "text-orange" : "text-dim"}`} style={{ fontSize: "0.6rem" }}>
                    {t(th.nameKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <ToggleRow
          label={t("settings.crtScanline")}
          desc={t("settings.crtScanlineDesc")}
          checked={crtEffect}
          onChange={(v) => {
            setCrtEffect(v);
            setScanlines(v);
          }}
        />
        <ToggleRow
          label={t("settings.reduceMotion")}
          desc={t("settings.reduceMotionDesc")}
          checked={reduceMotion}
          onChange={setReduceMotion}
        />

        {/* 字体大小 */}
        <div>
          <SectionLabel>{t("settings.fontSize")}</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.4rem" }}>
            {FONT_SIZES.map((f) => {
              const active = fontSize === f.size;
              return (
                <button
                  key={f.size}
                  onClick={() => setFontSize(f.size)}
                  style={{
                    padding: "0.5rem",
                    background: active ? "var(--c-bg3)" : "var(--c-bg2)",
                    border: `2px solid ${active ? "var(--c-cyan)" : "var(--c-rule)"}`,
                    cursor: "pointer",
                    transition: "all 0.2s var(--ease-apple)",
                    textAlign: "center",
                  }}
                >
                  <span className={`font-pixel ${active ? "text-cyan" : "text-dim"}`} style={{ fontSize: "0.65rem" }}>
                    {t(f.key)} ({f.size})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="callout info" style={{ fontSize: "0.7rem" }}>
          <Icon name="info" size={12} style={{ display: "inline", marginRight: "0.3rem" }} />
          {t("settings.themeRestartHint")}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <PixelButton variant="primary" icon="check" onClick={handleSaveAppearance}>
            {t("common.save")}
          </PixelButton>
        </div>
      </div>
    </PixelPanel>
  );

  // ===== Device =====
  const renderDevice = () => (
    <PixelPanel title={t("settings.device").toUpperCase()}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <ToggleRow
          label={t("settings.autoConnect")}
          desc={t("settings.autoConnectDesc")}
          checked={autoConnect}
          onChange={setAutoConnect}
        />
        <ToggleRow
          label={t("settings.virtualDeviceMode")}
          desc={t("settings.autoScanDesc")}
          checked={autoScan}
          onChange={setAutoScan}
        />
        <ToggleRow
          label={t("settings.protocolDebug")}
          desc={t("settings.protocolDebugDesc")}
          checked={protocolDebug}
          onChange={setProtocolDebug}
        />

        <div style={{ height: 1, background: "var(--c-rule)", margin: "0.4rem 0" }} />

        {/* 地区（Sub-GHz 合规） */}
        <div>
          <SectionLabel icon="signal">{t("settings.region")}</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.4rem", marginBottom: "0.5rem" }}>
            {REGIONS.map((r) => {
              const active = region === r.code;
              const accent = r.code === "global" ? "var(--c-yellow)" : "var(--c-orange)";
              return (
                <button
                  key={r.code}
                  onClick={() => handleSetRegion(r.code)}
                  style={{
                    padding: "0.4rem",
                    background: active ? "var(--c-bg3)" : "var(--c-bg2)",
                    border: `2px solid ${active ? accent : "var(--c-rule)"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s var(--ease-apple)",
                  }}
                >
                  <div className="font-pixel" style={{ fontSize: "0.6rem", color: active ? accent : "var(--c-dim)" }}>
                    {r.code.toUpperCase()}
                  </div>
                  <div className="font-mono text-muted" style={{ fontSize: "0.58rem", marginTop: "0.15rem" }}>
                    {t(r.descKey)}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="callout warn" style={{ fontSize: "0.65rem" }}>
            <Icon name="warning" size={10} style={{ display: "inline", marginRight: "0.3rem" }} />
            {t("settings.subghzLegalNotice")}
          </div>
        </div>

        <div style={{ height: 1, background: "var(--c-rule)", margin: "0.4rem 0" }} />

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <PixelButton variant="ghost" icon="refresh" onClick={handleRestartDevice}>
            {t("settings.restartDevice")}
          </PixelButton>
          <PixelButton variant="danger" icon="power" onClick={handleFactoryReset}>
            {t("settings.factoryReset")}
          </PixelButton>
        </div>
      </div>
    </PixelPanel>
  );

  // ===== AI =====
  const renderAi = () => (
    <PixelPanel title={t("settings.ai").toUpperCase()}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* 供应商 */}
        <div>
          <SectionLabel icon="robot">{t("settings.provider")}</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.4rem" }}>
            {AI_PROVIDERS.map((p) => {
              const active = provider === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setProvider(p.id);
                    setModel(p.models[0]);
                  }}
                  style={{
                    padding: "0.5rem",
                    background: active ? "var(--c-bg3)" : "var(--c-bg2)",
                    border: `2px solid ${active ? `var(--c-${p.color})` : "var(--c-rule)"}`,
                    cursor: "pointer",
                    transition: "all 0.2s var(--ease-apple)",
                    textAlign: "center",
                  }}
                >
                  <span className={`font-pixel text-${p.color}`} style={{ fontSize: "0.6rem" }}>
                    {t(p.nameKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 模型 */}
        <div>
          <SectionLabel>{t("settings.model")}</SectionLabel>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              width: "100%",
              background: "var(--c-bg3)",
              color: "var(--c-ink)",
              border: "2px solid var(--c-rule)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.8rem",
              padding: "0.5rem",
              cursor: "pointer",
            }}
          >
            {currentProvider.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div>
          <SectionLabel icon="lock">{t("settings.apiKey")}</SectionLabel>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <PixelInput
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t("settings.apiKey")}
              style={{ flex: 1 }}
            />
            <PixelButton variant="ghost" onClick={() => setShowKey(!showKey)} style={{ padding: "0.5rem 0.8rem" }}>
              <Icon name={showKey ? "unlock" : "lock"} size={14} />
            </PixelButton>
          </div>
          <div className="font-mono text-muted" style={{ fontSize: "0.6rem", marginTop: "0.3rem" }}>
            {provider === "local" ? t("settings.apiKeyHintLocal") : t("settings.apiKeyHint")}
          </div>
        </div>

        {/* Base URL */}
        <div>
          <SectionLabel>{t("settings.baseUrl")}</SectionLabel>
          <PixelInput
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </div>

        <ToggleRow
          label={t("settings.privacyMode")}
          desc={t("settings.privacyModeDesc")}
          checked={privacyMode}
          onChange={setPrivacyMode}
        />
        <ToggleRow
          label={t("settings.allowCommandSuggestion")}
          desc={t("settings.allowCommandSuggestionDesc")}
          checked={allowCommandSuggestion}
          onChange={setAllowCommandSuggestion}
        />
        <ToggleRow
          label={t("settings.requireApproval")}
          desc={t("settings.requireApprovalDesc")}
          checked={requireApproval}
          onChange={setRequireApproval}
        />

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <PixelButton variant="ghost" icon="terminal">
            {t("settings.testConnection")}
          </PixelButton>
          <PixelButton variant="primary" icon="check" onClick={handleSaveAi}>
            {t("common.save")}
          </PixelButton>
        </div>
      </div>
    </PixelPanel>
  );

  // ===== Security =====
  const renderSecurity = () => (
    <PixelPanel title={t("settings.security").toUpperCase()}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <div className="callout info" style={{ fontSize: "0.7rem" }}>
          <Icon name="shield" size={12} style={{ display: "inline", marginRight: "0.3rem" }} />
          {t("settings.fiveLayerSecurity")}
        </div>

        <ToggleRow
          label={t("settings.badusbConfirmation")}
          desc={t("settings.badusbConfirmationDesc")}
          checked={badusbConfirmation}
          onChange={setBadusbConfirmation}
        />
        <ToggleRow
          label={t("settings.subghzRegionLock")}
          desc={t("settings.subghzRegionLockDesc")}
          checked={subghzRegionLock}
          onChange={setSubghzRegionLock}
        />
        <ToggleRow
          label={t("settings.sensitiveDataMasking")}
          desc={t("settings.sensitiveDataMaskingDesc")}
          checked={sensitiveDataMasking}
          onChange={setSensitiveDataMasking}
        />
        <ToggleRow
          label={t("settings.auditLog")}
          desc={t("settings.auditLogDesc")}
          checked={auditLog}
          onChange={setAuditLog}
        />
        <ToggleRow
          label={t("settings.developerMode")}
          desc={t("settings.developerModeDesc")}
          checked={developerMode}
          onChange={setDeveloperMode}
          danger
        />

        <div style={{ height: 1, background: "var(--c-rule)", margin: "0.4rem 0" }} />

        <div>
          <SectionLabel icon="shield">{t("settings.activeSecurityPolicies")}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <PolicyItem
              status="ok"
              label={t("settings.commandRiskClassification")}
              detail={`${t("risk.safe")}/${t("risk.caution")}/${t("risk.dangerous")}/${t("risk.blocked")}`}
            />
            <PolicyItem
              status="ok"
              label={t("settings.subghzRegionEnforcement")}
              detail={region.toUpperCase()}
            />
            <PolicyItem
              status="ok"
              label={t("settings.badusbAstGuard")}
              detail={t("security.threeStageEnforced")}
            />
            <PolicyItem
              status={privacyMode ? "ok" : "warn"}
              label={t("settings.aiInputSanitizer")}
              detail={privacyMode ? t("common.enabled") : t("common.disabled")}
            />
            <PolicyItem
              status={privacyMode ? "ok" : "warn"}
              label={t("settings.logRedaction")}
              detail={privacyMode ? t("common.enabled") : t("common.disabled")}
            />
          </div>
        </div>
      </div>
    </PixelPanel>
  );

  // ===== Firmware =====
  const renderFirmware = () => (
    <PixelPanel title={t("settings.firmware").toUpperCase()}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        {/* 更新通道 */}
        <div>
          <SectionLabel icon="package">{t("settings.updateChannel")}</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
            {([
              { id: "stable", key: "settings.updateStable", color: "green" },
              { id: "beta", key: "settings.updateBeta", color: "yellow" },
            ] as const).map((ch) => {
              const active = updateChannel === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => setUpdateChannel(ch.id)}
                  style={{
                    padding: "0.5rem",
                    background: active ? "var(--c-bg3)" : "var(--c-bg2)",
                    border: `2px solid ${active ? `var(--c-${ch.color})` : "var(--c-rule)"}`,
                    cursor: "pointer",
                    transition: "all 0.2s var(--ease-apple)",
                    textAlign: "center",
                  }}
                >
                  <span className={`font-pixel text-${ch.color}`} style={{ fontSize: "0.65rem" }}>
                    {t(ch.key)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <ToggleRow
          label={t("settings.autoCheck")}
          desc={t("settings.autoCheckDesc")}
          checked={autoCheck}
          onChange={setAutoCheck}
        />
        <ToggleRow
          label={t("settings.allowBeta")}
          desc={t("settings.allowBetaDesc")}
          checked={allowBeta}
          onChange={setAllowBeta}
        />
        <ToggleRow
          label={t("settings.rollback")}
          desc={t("settings.rollbackDesc")}
          checked={rollback}
          onChange={setRollback}
        />

        <div style={{ height: 1, background: "var(--c-rule)", margin: "0.4rem 0" }} />

        <InfoRow label={t("settings.firmwareVersion")} value={currentVersion} />
        <InfoRow label={t("settings.currentVersion")} value={currentVersion} />

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <PixelButton variant="primary" icon="download" onClick={handleCheckUpdate}>
            {t("settings.checkUpdate")}
          </PixelButton>
        </div>
      </div>
    </PixelPanel>
  );

  // ===== About =====
  const renderAbout = () => (
    <PixelPanel title={t("settings.about").toUpperCase()}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: "var(--c-bg3)",
              border: "2px solid var(--c-orange)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-glow-orange)",
            }}
          >
            <span className="font-pixel text-orange" style={{ fontSize: "1.4rem" }}>
              L
            </span>
          </div>
          <div>
            <div className="font-pixel text-orange" style={{ fontSize: "1.2rem" }}>
              LUCY DESKTOP
            </div>
            <div className="font-mono text-dim" style={{ fontSize: "0.7rem" }}>
              v0.1.0-alpha
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <InfoRow label={t("settings.appVersion")} value="0.1.0-alpha" />
          <InfoRow label={t("settings.platform")} value="Tauri 2.0 + React 18" />
          <InfoRow label={t("settings.backend")} value="Rust (stable 1.75+)" />
          <InfoRow label={t("settings.protocol")} value="MessagePack over USB CDC" />
          <InfoRow label={t("settings.license")} value="MIT" />
          <InfoRow label={t("settings.github")} value="github.com/immaotianyi/lucy" />
        </div>

        <div className="callout info" style={{ fontSize: "0.7rem" }}>
          <Icon name="shield" size={12} style={{ display: "inline", marginRight: "0.3rem" }} />
          {t("settings.openSourceNotice")}
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <PixelButton variant="ghost" icon="book">
            {t("settings.docs")}
          </PixelButton>
          <PixelButton variant="ghost" icon="terminal">
            {t("settings.reportBug")}
          </PixelButton>
        </div>
      </div>
    </PixelPanel>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <PixelPanel>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0" }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "var(--c-bg3)",
              border: "2px solid var(--c-cyan)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-glow-cyan)",
            }}
          >
            <Icon name="settings" size={28} style={{ color: "var(--c-cyan)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="font-pixel text-cyan" style={{ fontSize: "1.1rem" }}>
              {t("settings.title").toUpperCase()}
            </div>
            <div className="font-term text-dim" style={{ fontSize: "0.8rem" }}>
              {t("app.subtitle")}
            </div>
          </div>
        </div>
      </PixelPanel>

      <div style={{ display: "flex", gap: "1rem" }}>
        {renderTabs()}
        <div style={{ flex: 1 }}>
          {activeTab === "general" && renderGeneral()}
          {activeTab === "appearance" && renderAppearance()}
          {activeTab === "device" && renderDevice()}
          {activeTab === "ai" && renderAi()}
          {activeTab === "security" && renderSecurity()}
          {activeTab === "firmware" && renderFirmware()}
          {activeTab === "about" && renderAbout()}
        </div>
      </div>
    </div>
  );
};

// ===== 辅助组件 =====

const SectionLabel: React.FC<{ icon?: IconName; children: React.ReactNode }> = ({ icon, children }) => (
  <label
    className="font-term text-dim"
    style={{
      fontSize: "0.75rem",
      display: "flex",
      alignItems: "center",
      gap: "0.3rem",
      marginBottom: "0.4rem",
    }}
  >
    {icon && <Icon name={icon} size={12} style={{ color: "var(--c-orange)" }} />}
    {children}
  </label>
);

const ToggleRow: React.FC<{
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}> = ({ label, desc, checked, onChange, danger }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
    <Toggle checked={checked} onChange={onChange} />
    <div style={{ flex: 1 }}>
      <div className="font-term" style={{ fontSize: "0.8rem", color: danger ? "var(--c-yellow)" : "var(--c-ink)" }}>
        {label}
      </div>
      <div className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>
        {desc}
      </div>
    </div>
  </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span className="font-term text-dim" style={{ fontSize: "0.75rem" }}>
      {label}
    </span>
    <span className="font-mono text-ink" style={{ fontSize: "0.75rem" }}>
      {value}
    </span>
  </div>
);

const PolicyItem: React.FC<{
  status: "ok" | "warn" | "err";
  label: string;
  detail: string;
}> = ({ status, label, detail }) => {
  const color = status === "ok" ? "var(--c-green)" : status === "warn" ? "var(--c-yellow)" : "var(--c-red)";
  const icon: IconName = status === "ok" ? "check" : status === "warn" ? "warning" : "cross";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.35rem 0.5rem",
        background: "var(--c-bg2)",
        border: `1px solid ${color}33`,
      }}
    >
      <Icon name={icon} size={12} style={{ color }} />
      <span className="font-term" style={{ fontSize: "0.72rem", flex: 1 }}>
        {label}
      </span>
      <span className="font-mono text-muted" style={{ fontSize: "0.65rem" }}>
        {detail}
      </span>
    </div>
  );
};
