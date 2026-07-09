/**
 * AI 模型配置面板
 *
 * 功能：
 *   1. 选择 AI 服务商（通义千问 / DeepSeek / OpenAI / 本地降级）
 *   2. 输入 API Key（带显示/隐藏切换）
 *   3. 输入 API URL（自动填充服务商默认值，可自定义）
 *   4. 输入模型名称（自动填充服务商推荐模型）
 *   5. 保存配置（通过 IPC 写入后端，自动持久化到磁盘）
 *
 * 设计语言：80s Retro Cyberpunk / 8-bit Pixel Terminal
 * 全部使用手工 SVG 图标，不使用任何 emoji
 */
import React, { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/Icon";
import { setAiModelConfig, getAiModelConfig } from "@/lib/tauri";
import type { AiModelConfig } from "@/types";
import { useThemeStore, THEMES } from "@/stores/themeStore";

// -------------------- 服务商预设配置 --------------------

interface ProviderPreset {
  id: AiModelConfig["provider"];
  label: string;
  description: string;
  defaultApiUrl: string;
  defaultModel: string;
  isMultimodal: boolean;
  apiKeyHint: string;
  helpUrl: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "qwen",
    label: "通义千问",
    description: "阿里云出品，中文理解强，性价比高",
    defaultApiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    defaultModel: "qwen-plus",
    isMultimodal: false,
    apiKeyHint: "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
    helpUrl: "https://dashscope.console.aliyun.com/apiKey",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "深度求索，推理能力强，价格极低",
    defaultApiUrl: "https://api.deepseek.com/v1/chat/completions",
    defaultModel: "deepseek-chat",
    isMultimodal: false,
    apiKeyHint: "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
    helpUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT 系列，多模态支持，需要科学上网",
    defaultApiUrl: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    isMultimodal: true,
    apiKeyHint: "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
    helpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "local",
    label: "本地降级",
    description: "无需联网，使用内置 FAQ 知识库（功能有限）",
    defaultApiUrl: "",
    defaultModel: "local-faq",
    isMultimodal: false,
    apiKeyHint: "（本地模式无需 API Key）",
    helpUrl: "",
  },
];

function getPreset(provider: AiModelConfig["provider"]): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === provider) ?? PROVIDER_PRESETS[3];
}

// -------------------- 组件 --------------------

export const SettingsModal: React.FC = () => {
  const [config, setConfig] = useState<AiModelConfig>({
    provider: "local",
    apiKey: "",
    apiUrl: "",
    modelName: "local-faq",
    isMultimodal: false,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 主题切换
  const { theme, setTheme } = useThemeStore();

  // 打开时从后端加载当前配置
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await getAiModelConfig();
      if (cancelled) return;
      if (result.success && result.data) {
        setConfig(result.data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 切换服务商时自动填充默认 URL 和模型名
  const handleProviderChange = useCallback(
    (provider: AiModelConfig["provider"]) => {
      const preset = getPreset(provider);
      setConfig((prev) => ({
        ...prev,
        provider,
        apiUrl: preset.defaultApiUrl,
        modelName: preset.defaultModel,
        isMultimodal: preset.isMultimodal,
      }));
      setSaved(false);
      setError(null);
    },
    [],
  );

  // 保存配置
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    // 本地模式不需要校验 API Key
    if (config.provider !== "local") {
      if (!config.apiKey.trim()) {
        setError("请输入 API Key");
        setSaving(false);
        return;
      }
      if (!config.apiUrl.trim()) {
        setError("请输入 API URL");
        setSaving(false);
        return;
      }
      if (!config.modelName.trim()) {
        setError("请输入模型名称");
        setSaving(false);
        return;
      }
    }

    const result = await setAiModelConfig(config);
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError(result.error ?? "保存失败");
    }
    setSaving(false);
  }, [config]);

  const preset = getPreset(config.provider);
  const isLocal = config.provider === "local";

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
        <div className="font-mono text-dim" style={{ fontSize: 13 }}>
          LOADING CONFIG...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ---------- 服务商选择 ---------- */}
      <div>
        <div
          className="font-pixel text-orange"
          style={{ fontSize: 9, marginBottom: 8 }}
        >
          MODEL PROVIDER
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          {PROVIDER_PRESETS.map((p) => {
            const active = config.provider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleProviderChange(p.id)}
                style={{
                  background: active ? "var(--c-dark3)" : "var(--c-dark2)",
                  border: active
                    ? "2px solid var(--c-orange)"
                    : "1.5px solid var(--c-gray)",
                  padding: "8px 10px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {active && (
                    <Icon
                      name="check"
                      size={12}
                      style={{ color: "var(--c-green)" }}
                    />
                  )}
                  <span
                    className="font-pixel"
                    style={{
                      fontSize: 8,
                      color: active ? "var(--c-orange)" : "var(--c-white)",
                    }}
                  >
                    {p.label.toUpperCase()}
                  </span>
                </div>
                <div
                  className="font-term text-dim"
                  style={{ fontSize: 14, marginTop: 4 }}
                >
                  {p.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- API Key ---------- */}
      {!isLocal && (
        <div>
          <div
            className="font-pixel text-orange"
            style={{ fontSize: 9, marginBottom: 6 }}
          >
            API KEY
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type={showApiKey ? "text" : "password"}
              value={config.apiKey}
              onChange={(e) => {
                setConfig({ ...config, apiKey: e.target.value });
                setSaved(false);
              }}
              placeholder={preset.apiKeyHint}
              className="font-mono"
              style={{
                flex: 1,
                background: "var(--c-dark2)",
                border: "1.5px solid var(--c-gray)",
                color: "var(--c-green)",
                padding: "6px 10px",
                fontSize: 13,
                outline: "none",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--c-orange)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--c-gray)")
              }
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              style={{
                background: "var(--c-dark2)",
                border: "1.5px solid var(--c-gray)",
                color: "var(--c-white)",
                cursor: "pointer",
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title={showApiKey ? "隐藏" : "显示"}
            >
              <Icon name={showApiKey ? "lock" : "unlock"} size={16} />
            </button>
          </div>
          {preset.helpUrl && (
            <div
              className="font-term text-dim"
              style={{ fontSize: 13, marginTop: 4 }}
            >
              <Icon name="key" size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
              获取 Key: {preset.helpUrl}
            </div>
          )}
        </div>
      )}

      {/* ---------- API URL ---------- */}
      {!isLocal && (
        <div>
          <div
            className="font-pixel text-orange"
            style={{ fontSize: 9, marginBottom: 6 }}
          >
            API URL
          </div>
          <input
            type="text"
            value={config.apiUrl}
            onChange={(e) => {
              setConfig({ ...config, apiUrl: e.target.value });
              setSaved(false);
            }}
            placeholder={preset.defaultApiUrl}
            className="font-mono"
            style={{
              width: "100%",
              background: "var(--c-dark2)",
              border: "1.5px solid var(--c-gray)",
              color: "var(--c-green)",
              padding: "6px 10px",
              fontSize: 12,
              outline: "none",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--c-orange)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--c-gray)")
            }
          />
        </div>
      )}

      {/* ---------- 模型名称 ---------- */}
      {!isLocal && (
        <div>
          <div
            className="font-pixel text-orange"
            style={{ fontSize: 9, marginBottom: 6 }}
          >
            MODEL NAME
          </div>
          <input
            type="text"
            value={config.modelName}
            onChange={(e) => {
              setConfig({ ...config, modelName: e.target.value });
              setSaved(false);
            }}
            placeholder={preset.defaultModel}
            className="font-mono"
            style={{
              width: "100%",
              background: "var(--c-dark2)",
              border: "1.5px solid var(--c-gray)",
              color: "var(--c-green)",
              padding: "6px 10px",
              fontSize: 13,
              outline: "none",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--c-orange)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--c-gray)")
            }
          />
          <div
            className="font-term text-dim"
            style={{ fontSize: 13, marginTop: 4 }}
          >
            推荐: {preset.defaultModel}
          </div>
        </div>
      )}

      {/* ---------- 本地模式提示 ---------- */}
      {isLocal && (
        <div
          style={{
            background: "var(--c-dark2)",
            border: "1px solid var(--c-gray)",
            padding: "10px 12px",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
          >
            <Icon name="brain" size={18} style={{ color: "var(--c-orange)" }} />
            <span className="font-pixel text-orange" style={{ fontSize: 9 }}>
              LOCAL FAQ MODE
            </span>
          </div>
          <div className="font-term text-dim" style={{ fontSize: 14 }}>
            本地降级模式无需联网和 API Key，使用内置 FAQ 知识库回答常见问题。
            功能有限，建议配置在线服务商以获得完整对话体验。
          </div>
        </div>
      )}

      {/* ---------- 隐私提示 ---------- */}
      {!isLocal && (
        <div
          style={{
            background: "var(--c-dark2)",
            border: "1px solid var(--c-gray)",
            padding: "8px 12px",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <Icon
            name="shield"
            size={16}
            style={{ color: "var(--c-green)", flexShrink: 0, marginTop: 2 }}
          />
          <div className="font-term text-dim" style={{ fontSize: 13 }}>
            所有发送给云端的数据会先经过脱敏处理（过滤门禁 UID / NFC 密钥 / WiFi 密码 / 坐标等敏感信息）。
            API Key 使用系统钥匙串（macOS Keychain / Windows Credential Manager）加密存储，永不外传。
          </div>
        </div>
      )}

      {/* ---------- 错误提示 ---------- */}
      {error && (
        <div
          style={{
            background: "rgba(255,51,51,0.15)",
            border: "1px solid var(--c-red)",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="warning" size={16} style={{ color: "var(--c-red)" }} />
          <span className="font-term" style={{ color: "var(--c-red)", fontSize: 14 }}>
            {error}
          </span>
        </div>
      )}

      {/* ---------- 保存成功提示 ---------- */}
      {saved && (
        <div
          style={{
            background: "rgba(0,255,65,0.12)",
            border: "1px solid var(--c-green)",
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="check" size={16} style={{ color: "var(--c-green)" }} />
          <span className="font-term" style={{ color: "var(--c-green)", fontSize: 14 }}>
            配置已保存，将在下次对话时生效
          </span>
        </div>
      )}

      {/* ---------- 保存按钮 ---------- */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: saving ? 0.6 : 1,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          <Icon name="save" size={14} />
          {saving ? "SAVING..." : "SAVE CONFIG"}
        </button>
      </div>

      {/* ---------- 主题切换 ---------- */}
      <div style={{ marginBottom: 16 }}>
        <div
          className="font-pixel text-orange"
          style={{ fontSize: 9, marginBottom: 8 }}
        >
          THEME
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                cursor: "pointer",
                background: theme === t.id ? "var(--c-dark2)" : "transparent",
                border:
                  theme === t.id
                    ? `1.5px solid ${t.color}`
                    : "1px solid var(--c-gray)",
                borderRadius: 4,
                transition: "all 0.2s",
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: t.color,
                  boxShadow: `0 0 4px ${t.color}`,
                }}
              />
              <div style={{ textAlign: "left" }}>
                <div
                  className="font-term"
                  style={{ fontSize: 13, color: t.color }}
                >
                  {t.name}
                </div>
                <div className="font-term text-dim" style={{ fontSize: 11 }}>
                  {t.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* About 区域：非官方声明 / 开源许可证 / 隐私政策 / 版本信息 */}
      <div style={{ borderTop: "1px solid var(--c-gray)", marginTop: 12, paddingTop: 12 }}>
        <div className="font-pixel text-orange" style={{ fontSize: 9, marginBottom: 8 }}>ABOUT</div>
        <div className="font-term text-dim" style={{ fontSize: 12, lineHeight: 1.8 }}>
          Dolphin Gang Tour v1.0.0<br/>
          非官方产品，与 Flipper Devices Inc. 无关联<br/>
          "Flipper Zero" 是 Flipper Devices Inc. 的注册商标<br/>
          本产品含 GPL v2 许可的 dfu-util（独立组件）<br/>
          © 2026 Dolphin Gang Tour. Licensed under the MIT License.
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
