/**
 * AI Provider 抽象层 — 多 LLM 供应商统一接口
 *
 * 支持 Provider:
 *   DeepSeek — deepseek-chat / deepseek-reasoner (OpenAI 兼容 API)
 *   OpenAI   — gpt-4o / gpt-4o-mini
 *   Qwen     — qwen-plus / qwen-turbo (阿里通义千问)
 *   Local    — 本地 Ollama (llama3.2 / qwen2.5)
 *
 * 所有 Provider 使用 OpenAI 兼容的 Chat Completions + SSE stream 格式
 * (Qwen/DeepSeek 均兼容 OpenAI API 格式)
 *
 * SSE 格式:
 *   data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n
 *   data: [DONE]\n\n
 */
use crate::error::{LucyError, LucyResult};
use serde::{Deserialize, Serialize};

/// LLM Provider 类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Deepseek,
    Openai,
    Qwen,
    Local,
}

impl Provider {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "openai" => Provider::Openai,
            "qwen" => Provider::Qwen,
            "local" => Provider::Local,
            _ => Provider::Deepseek,
        }
    }

    /// API 端点
    pub fn endpoint(&self) -> &str {
        match self {
            Provider::Deepseek => "https://api.deepseek.com/v1/chat/completions",
            Provider::Openai => "https://api.openai.com/v1/chat/completions",
            Provider::Qwen => "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
            Provider::Local => "http://localhost:11434/v1/chat/completions",
        }
    }

    /// 默认模型名
    pub fn default_model(&self) -> &str {
        match self {
            Provider::Deepseek => "deepseek-chat",
            Provider::Openai => "gpt-4o-mini",
            Provider::Qwen => "qwen-plus",
            Provider::Local => "llama3.2",
        }
    }

    /// 是否需要 API Key
    pub fn needs_api_key(&self) -> bool {
        !matches!(self, Provider::Local)
    }
}

/// Chat 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: &str) -> Self {
        Self { role: "system".to_string(), content: content.to_string() }
    }
    pub fn user(content: &str) -> Self {
        Self { role: "user".to_string(), content: content.to_string() }
    }
    #[allow(dead_code)]
    pub fn assistant(content: &str) -> Self {
        Self { role: "assistant".to_string(), content: content.to_string() }
    }
}

/// Chat Completions 请求体 (OpenAI 兼容)
#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    temperature: f32,
    max_tokens: u32,
}

/// SSE 流中的 chunk
#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    content: Option<String>,
}

/// Provider 配置
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub provider: Provider,
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>, // 自定义端点覆盖
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            provider: Provider::Deepseek,
            api_key: String::new(),
            model: "deepseek-chat".to_string(),
            base_url: None,
        }
    }
}

/// 构建 HTTP 请求 — 返回 reqwest::RequestBuilder
pub fn build_request(
    config: &ProviderConfig,
    messages: Vec<ChatMessage>,
    timeout_secs: u64,
) -> LucyResult<reqwest::RequestBuilder> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| LucyError::Ai(format!("HTTP client error: {}", e)))?;

    let endpoint = config.base_url.as_deref().unwrap_or(config.provider.endpoint());

    let request = ChatRequest {
        model: if config.model.is_empty() {
            config.provider.default_model().to_string()
        } else {
            config.model.clone()
        },
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2048,
    };

    let mut builder = client
        .post(endpoint)
        .json(&request)
        .header("Content-Type", "application/json");

    if config.provider.needs_api_key() && !config.api_key.is_empty() {
        builder = builder.bearer_auth(&config.api_key);
    }

    Ok(builder)
}

/// 解析 SSE 流中的一行 — 返回 token 或 None (表示 [DONE] 或忽略)
pub fn parse_sse_line(line: &str) -> Option<String> {
    let line = line.trim();

    // SSE 数据行以 "data: " 开头
    if !line.starts_with("data: ") {
        return None;
    }

    let data = &line[6..];

    // [DONE] 标记
    if data.trim() == "[DONE]" {
        return None;
    }

    // 解析 JSON
    let chunk: StreamChunk = serde_json::from_str(data).ok()?;
    let token = chunk.choices.first()?.delta.content.as_deref()?;
    if token.is_empty() {
        return None;
    }

    Some(token.to_string())
}

/// 从环境变量加载 API Key
pub fn load_api_key(provider: &Provider) -> String {
    match provider {
        Provider::Deepseek => std::env::var("DEEPSEEK_API_KEY").unwrap_or_default(),
        Provider::Openai => std::env::var("OPENAI_API_KEY").unwrap_or_default(),
        Provider::Qwen => std::env::var("DASHSCOPE_API_KEY").unwrap_or_default(),
        Provider::Local => String::new(),
    }
}

/// 从 Tauri 配置存储中加载 Provider 配置
/// Phase 3: 简化版 — 从环境变量加载，Phase 4 会接入持久化存储
pub fn load_config(model_str: &str) -> ProviderConfig {
    let provider = Provider::from_str(model_str);
    let api_key = load_api_key(&provider);
    let model = provider.default_model().to_string();

    ProviderConfig {
        provider,
        api_key,
        model,
        base_url: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_sse_line_token() {
        let line = r#"data: {"choices":[{"delta":{"content":"Hello"}}]}"#;
        let token = parse_sse_line(line);
        assert_eq!(token, Some("Hello".to_string()));
    }

    #[test]
    fn test_parse_sse_line_done() {
        let line = "data: [DONE]";
        let token = parse_sse_line(line);
        assert_eq!(token, None);
    }

    #[test]
    fn test_parse_sse_line_invalid() {
        let token = parse_sse_line("not a data line");
        assert_eq!(token, None);
    }

    #[test]
    fn test_provider_from_str() {
        assert_eq!(Provider::from_str("deepseek"), Provider::Deepseek);
        assert_eq!(Provider::from_str("openai"), Provider::Openai);
        assert_eq!(Provider::from_str("qwen"), Provider::Qwen);
        assert_eq!(Provider::from_str("local"), Provider::Local);
    }

    #[test]
    fn test_provider_endpoint() {
        assert!(Provider::Deepseek.endpoint().contains("deepseek.com"));
        assert!(Provider::Openai.endpoint().contains("openai.com"));
        assert!(Provider::Local.endpoint().contains("localhost"));
    }
}
