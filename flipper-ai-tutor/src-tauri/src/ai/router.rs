// =============================================================================
// ai/router.rs - 多模型路由与对话实现
// =============================================================================
// 职责：
//   1. 多模型路由：根据 provider 与场景选择对应模型 API
//      - 通义千问 (Qwen)：阿里云 DashScope，国内友好
//      - DeepSeek：性价比高，代码能力强
//      - OpenAI：多模态能力强（GPT-4o）
//   2. 断网降级：网络不可用或 API 失败时，降级到本地 FAQ
//   3. 课程管理：返回课程列表
//
// 调用流程：
//   1. 接收用户消息列表
//   2. 脱敏处理（sanitizer::sanitize_messages）
//   3. 构建 System Prompt（prompt::build_system_prompt）
//   4. 根据 provider 路由到对应的 API
//   5. 失败时降级到本地 FAQ
// =============================================================================

use crate::ai::{
    prompt, sanitizer, AiModelConfig, AiProvider, ChatMessage, ChatResponse, ChatRole, Course,
};
use anyhow::{anyhow, bail, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;

// -------------------- 通用 API 请求/响应结构 --------------------

/// OpenAI 兼容格式的聊天请求（通义千问/DeepSeek/OpenAI 均兼容）
#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ApiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

/// API 消息结构
#[derive(Debug, Serialize)]
struct ApiMessage {
    role: String,
    content: String,
}

/// OpenAI 兼容格式的聊天响应
#[derive(Debug, Deserialize)]
struct ChatResponseApi {
    choices: Vec<Choice>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Debug, Deserialize)]
struct ResponseMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct Usage {
    total_tokens: u32,
}

// -------------------- SSE 流式响应结构 --------------------

/// SSE 流式 chunk 响应（OpenAI 兼容格式）
#[derive(Debug, Deserialize)]
struct StreamChunkResponse {
    #[serde(default)]
    choices: Vec<StreamChoice>,
    #[serde(default)]
    usage: Option<Usage>,
}

/// SSE 流式选项
#[derive(Debug, Deserialize)]
struct StreamChoice {
    #[serde(default)]
    delta: Option<StreamDelta>,
    #[serde(default)]
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

/// SSE 流式 delta（增量内容）
#[derive(Debug, Deserialize)]
struct StreamDelta {
    #[serde(default)]
    content: Option<String>,
}

// -------------------- 多模态请求结构 --------------------

/// 多模态消息内容（OpenAI Vision 格式）
#[allow(dead_code)]
#[derive(Debug, Serialize)]
struct MultimodalContent {
    #[serde(rename = "type")]
    content_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    image_url: Option<ImageUrl>,
}

#[allow(dead_code)]
#[derive(Debug, Serialize)]
struct ImageUrl {
    url: String,
}

// -------------------- 主入口：文字对话 --------------------

/// AI 文字对话
///
/// 参数：
///   - config: AI 模型配置
///   - messages: 对话消息列表（已包含历史上下文）
///   - course_id: 课程 ID（可选，用于叠加课程上下文）
pub async fn chat(
    config: &AiModelConfig,
    messages: &[ChatMessage],
    course_id: Option<&str>,
) -> Result<ChatResponse> {
    log::info!(
        "AI 对话: provider={} messages={}",
        config.provider.as_str(),
        messages.len()
    );

    // 1. 脱敏处理
    let sanitized = sanitizer::sanitize_messages(messages);

    // 2. 构建 System Prompt
    let system_prompt = prompt::build_system_prompt(course_id, None);

    // 3. 转换为 API 消息格式
    let api_messages = build_api_messages(&sanitized, &system_prompt);

    // 4. 根据 provider 路由
    match config.provider {
        AiProvider::Qwen | AiProvider::Deepseek | AiProvider::Openai => {
            call_openai_compatible(config, api_messages).await
        }
        AiProvider::Local => local_faq_fallback(messages),
    }
}

/// AI 多模态对话（带图片）
pub async fn chat_with_image(
    config: &AiModelConfig,
    messages: &[ChatMessage],
    image_base64: &str,
) -> Result<ChatResponse> {
    log::info!(
        "AI 多模态对话: provider={} image_len={}",
        config.provider.as_str(),
        image_base64.len()
    );

    // 检查模型是否支持多模态
    if !config.is_multimodal {
        bail!("当前模型 {} 不支持多模态（图片）输入", config.model_name);
    }

    // 脱敏处理
    let sanitized = sanitizer::sanitize_messages(messages);
    let system_prompt = prompt::build_system_prompt(None, None);

    // 构建多模态请求
    let api_messages =
        build_multimodal_messages(&sanitized, &system_prompt, image_base64);

    match config.provider {
        AiProvider::Openai => call_openai_multimodal(config, api_messages).await,
        AiProvider::Qwen => call_qwen_multimodal(config, api_messages).await,
        AiProvider::Deepseek => {
            // DeepSeek 当前不支持多模态，降级到文字
            log::warn!("DeepSeek 不支持多模态，降级为纯文字对话");
            let text_messages = build_api_messages(&sanitized, &system_prompt);
            call_openai_compatible(config, text_messages).await
        }
        AiProvider::Local => {
            bail!("本地模式不支持多模态对话")
        }
    }
}

// -------------------- AI 流式对话 --------------------

/// AI 流式文字对话
///
/// 通过 SSE (Server-Sent Events) 逐 token 推送响应，支持前端取消。
///
/// 参数：
///   - config: AI 模型配置
///   - messages: 对话消息列表（已包含历史上下文）
///   - course_id: 课程 ID（可选，用于叠加课程上下文）
///   - message_id: 消息 ID（用于标识本次流式对话）
///   - cancel_flag: 取消标志（前端调用 cancel_ai_chat 时置为 true）
///   - on_chunk: 回调函数 (delta_text, is_done, tokens_used)
///
/// 流程：
///   1. 本地模式 → 降级到 FAQ，模拟流式输出
///   2. 云端模式 → 构建 stream=true 请求，解析 SSE 流
///   3. 每个 SSE chunk 提取 delta.content，调用 on_chunk
///   4. 收到 [DONE] 或流自然结束时，调用 on_chunk(done=true)
///   5. 用户取消时立即终止，调用 on_chunk(done=true)
pub async fn chat_stream<F>(
    config: &AiModelConfig,
    messages: &[ChatMessage],
    course_id: Option<&str>,
    message_id: &str,
    cancel_flag: &Arc<std::sync::atomic::AtomicBool>,
    on_chunk: F,
) -> Result<()>
where
    F: Fn(String, bool, Option<u32>),
{
    log::info!(
        "AI 流式对话: provider={} message_id={} messages={}",
        config.provider.as_str(),
        message_id,
        messages.len()
    );

    // 本地模式：降级到 FAQ，模拟流式输出
    if config.provider == AiProvider::Local {
        log::info!("本地模式流式对话，使用 FAQ 降级");
        let fallback = local_faq_fallback(messages)?;
        simulate_stream(&fallback.content, cancel_flag, &on_chunk).await;
        return Ok(());
    }

    // 1. 脱敏处理
    let sanitized = sanitizer::sanitize_messages(messages);

    // 2. 构建 System Prompt
    let system_prompt = prompt::build_system_prompt(course_id, None);

    // 3. 转换为 API 消息格式
    let api_messages = build_api_messages(&sanitized, &system_prompt);

    // 4. 构建流式请求
    let api_url = get_api_url(config);
    let api_key = get_api_key(config)?;

    let request = ChatRequest {
        model: config.model_name.clone(),
        messages: api_messages,
        max_tokens: Some(2048),
        temperature: Some(0.7),
        stream: Some(true),
    };

    log::debug!(
        "流式 API 请求: url={} model={}",
        api_url,
        config.model_name
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()?;

    // 5. 发送请求
    let resp = client
        .post(&api_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!(
            "AI 流式 API 调用失败: HTTP {} - {}",
            status,
            body.chars().take(500).collect::<String>()
        );
    }

    // 6. 解析 SSE 流
    log::debug!("开始接收 SSE 流...");
    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let mut total_tokens: Option<u32> = None;
    let mut full_content = String::new();
    let mut chunk_count = 0u32;

    while let Some(chunk_result) = stream.next().await {
        // 检查取消标志
        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
            log::info!(
                "AI 流式对话已被用户取消（已接收 {} 字符 {} chunk）",
                full_content.len(),
                chunk_count
            );
            on_chunk(String::new(), true, total_tokens);
            return Ok(());
        }

        let chunk = chunk_result?;
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        // 处理 SSE 行（以 \n 分隔）
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();

            // 空行或注释行，跳过
            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            // 处理 data: 行
            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();

                // [DONE] 标记流结束
                if data == "[DONE]" {
                    log::info!(
                        "SSE 流结束: {} chunk, {} 字符, tokens={:?}",
                        chunk_count,
                        full_content.len(),
                        total_tokens
                    );
                    on_chunk(String::new(), true, total_tokens);
                    return Ok(());
                }

                // 解析 JSON chunk
                match serde_json::from_str::<StreamChunkResponse>(data) {
                    Ok(chunk_resp) => {
                        chunk_count += 1;

                        // 提取 delta content
                        if let Some(choice) = chunk_resp.choices.first() {
                            if let Some(delta) = &choice.delta {
                                if let Some(content) = &delta.content {
                                    if !content.is_empty() {
                                        full_content.push_str(content);
                                        on_chunk(content.clone(), false, None);
                                    }
                                }
                            }
                        }

                        // 提取 usage（通常在最后一个 chunk）
                        if let Some(usage) = chunk_resp.usage {
                            total_tokens = Some(usage.total_tokens);
                        }
                    }
                    Err(e) => {
                        log::trace!(
                            "SSE chunk 解析失败: {e} (data={})",
                            &data[..50.min(data.len())]
                        );
                    }
                }
            }
        }
    }

    // 流自然结束（未收到 [DONE] 标记）
    log::info!(
        "SSE 流自然结束: {} chunk, {} 字符, tokens={:?}",
        chunk_count,
        full_content.len(),
        total_tokens
    );
    on_chunk(String::new(), true, total_tokens);

    Ok(())
}

/// 模拟流式输出（本地 FAQ 降级模式使用）
///
/// 将完整文本按 4 字一组逐段输出，模拟真实流式体验
async fn simulate_stream<F>(
    content: &str,
    cancel_flag: &Arc<std::sync::atomic::AtomicBool>,
    on_chunk: &F,
) where
    F: Fn(String, bool, Option<u32>),
{
    let chars: Vec<char> = content.chars().collect();
    if chars.is_empty() {
        on_chunk(String::new(), true, None);
        return;
    }

    let chunk_size = 4; // 每 4 个字符一个 chunk
    let total_chunks = (chars.len() + chunk_size - 1) / chunk_size;

    for (i, chunk) in chars.chunks(chunk_size).enumerate() {
        // 检查取消
        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
            log::info!("模拟流式输出已被取消");
            on_chunk(String::new(), true, None);
            return;
        }

        let delta: String = chunk.iter().collect();
        let is_last = i + 1 >= total_chunks;
        on_chunk(delta, is_last, None);

        // 短暂延迟模拟网络传输（30ms）
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    }
}

// -------------------- API 调用实现 --------------------

/// 调用 OpenAI 兼容 API（通义千问/DeepSeek/OpenAI 通用）
async fn call_openai_compatible(
    config: &AiModelConfig,
    messages: Vec<ApiMessage>,
) -> Result<ChatResponse> {
    let api_url = get_api_url(config);
    let api_key = get_api_key(config)?;

    let request = ChatRequest {
        model: config.model_name.clone(),
        messages,
        max_tokens: Some(2048),
        temperature: Some(0.7),
        stream: Some(false),
    };

    log::debug!("API 请求: url={} model={}", api_url, config.model_name);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()?;

    let resp = client
        .post(&api_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!(
            "AI API 调用失败: HTTP {} - {}",
            status,
            body.chars().take(500).collect::<String>()
        );
    }

    let api_resp: ChatResponseApi = resp.json().await?;
    let content = api_resp
        .choices
        .first()
        .ok_or_else(|| anyhow!("AI API 返回空响应"))?
        .message
        .content
        .clone();

    let tokens = api_resp.usage.map(|u| u.total_tokens).unwrap_or(0);

    Ok(ChatResponse {
        content,
        tokens_used: tokens,
        model: config.model_name.clone(),
        provider: config.provider.as_str().to_string(),
        is_fallback: false,
        timestamp: chrono::Local::now().timestamp_millis(),
    })
}

/// 调用 OpenAI 多模态 API（GPT-4o Vision）
async fn call_openai_multimodal(
    config: &AiModelConfig,
    messages: Vec<serde_json::Value>,
) -> Result<ChatResponse> {
    let api_url = if config.api_url.is_empty() {
        "https://api.openai.com/v1/chat/completions".to_string()
    } else {
        config.api_url.clone()
    };
    let api_key = get_api_key(config)?;

    let request = serde_json::json!({
        "model": config.model_name,
        "messages": messages,
        "max_tokens": 2048,
    });

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()?;

    let resp = client
        .post(&api_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&request)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        bail!("OpenAI 多模态调用失败: HTTP {} - {}", status, body);
    }

    let api_resp: ChatResponseApi = resp.json().await?;
    let content = api_resp
        .choices
        .first()
        .ok_or_else(|| anyhow!("API 返回空响应"))?
        .message
        .content
        .clone();

    Ok(ChatResponse {
        content,
        tokens_used: api_resp.usage.map(|u| u.total_tokens).unwrap_or(0),
        model: config.model_name.clone(),
        provider: config.provider.as_str().to_string(),
        is_fallback: false,
        timestamp: chrono::Local::now().timestamp_millis(),
    })
}

/// 调用通义千问多模态 API（qwen-vl-plus）
async fn call_qwen_multimodal(
    config: &AiModelConfig,
    messages: Vec<serde_json::Value>,
) -> Result<ChatResponse> {
    // 通义千问兼容 OpenAI 格式，使用 DashScope 兼容模式
    call_openai_multimodal(config, messages).await
}

// -------------------- 消息构建 --------------------

/// 构建标准 API 消息列表（OpenAI 兼容格式）
fn build_api_messages(messages: &[ChatMessage], system_prompt: &str) -> Vec<ApiMessage> {
    let mut api_msgs = Vec::with_capacity(messages.len() + 1);

    // System Prompt 放最前
    api_msgs.push(ApiMessage {
        role: "system".to_string(),
        content: system_prompt.to_string(),
    });

    // 用户与助手消息
    for msg in messages {
        let role = match msg.role {
            ChatRole::User => "user",
            ChatRole::Assistant => "assistant",
            ChatRole::System => "system",
        };
        api_msgs.push(ApiMessage {
            role: role.to_string(),
            content: msg.content.clone(),
        });
    }

    api_msgs
}

/// 构建多模态消息列表（OpenAI Vision 格式）
fn build_multimodal_messages(
    messages: &[ChatMessage],
    system_prompt: &str,
    image_base64: &str,
) -> Vec<serde_json::Value> {
    let mut api_msgs = Vec::with_capacity(messages.len() + 2);

    // System Prompt
    api_msgs.push(serde_json::json!({
        "role": "system",
        "content": system_prompt,
    }));

    // 历史消息（纯文本）
    for msg in messages {
        let role = match msg.role {
            ChatRole::User => "user",
            ChatRole::Assistant => "assistant",
            ChatRole::System => "system",
        };
        api_msgs.push(serde_json::json!({
            "role": role,
            "content": msg.content,
        }));
    }

    // 最后追加图片消息（data URL 格式）
    let image_data_url = if image_base64.starts_with("data:") {
        image_base64.to_string()
    } else {
        format!("data:image/png;base64,{}", image_base64)
    };

    api_msgs.push(serde_json::json!({
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": "请查看这张图片并回答我的问题。",
            },
            {
                "type": "image_url",
                "image_url": { "url": image_data_url },
            }
        ]
    }));

    api_msgs
}

// -------------------- API 配置辅助 --------------------

/// 获取 API URL
fn get_api_url(config: &AiModelConfig) -> String {
    if !config.api_url.is_empty() {
        return config.api_url.clone();
    }
    match config.provider {
        AiProvider::Qwen => {
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions".to_string()
        }
        AiProvider::Deepseek => "https://api.deepseek.com/v1/chat/completions".to_string(),
        AiProvider::Openai => "https://api.openai.com/v1/chat/completions".to_string(),
        AiProvider::Local => String::new(),
    }
}

/// 获取 API Key（非本地模式必须配置）
fn get_api_key(config: &AiModelConfig) -> Result<String> {
    if config.provider == AiProvider::Local {
        return Ok(String::new());
    }
    if config.api_key.is_empty() {
        bail!(
            "未配置 {} 的 API Key，请在设置中填写",
            config.provider.as_str()
        );
    }
    Ok(config.api_key.clone())
}

// -------------------- 本地 FAQ 降级 --------------------

/// 本地 FAQ 降级（断网或 API 失败时使用）
///
/// 基于关键词匹配的简易 FAQ，覆盖常见问题
pub fn local_faq_fallback(messages: &[ChatMessage]) -> Result<ChatResponse> {
    log::warn!("降级到本地 FAQ 模式");

    // 获取最后一条用户消息
    let last_user_msg = messages
        .iter()
        .rev()
        .find(|m| m.role == ChatRole::User)
        .map(|m| m.content.as_str())
        .unwrap_or("");

    let content = match_faq(last_user_msg);

    Ok(ChatResponse {
        content,
        tokens_used: 0,
        model: "local-faq".to_string(),
        provider: "local".to_string(),
        is_fallback: true,
        timestamp: chrono::Local::now().timestamp_millis(),
    })
}

/// 关键词匹配 FAQ
fn match_faq(query: &str) -> String {
    let q = query.to_lowercase();

    // 连接设备相关
    if q.contains("连接") && (q.contains("设备") || q.contains("flipper")) {
        return "🐬 连接 FlipperZero 的步骤：\n\n1. 用 USB-C 数据线连接 FlipperZero 到电脑\n2. 打开设备的 USB 通信功能（设置 → 连接 → USB）\n3. 点击左侧「设备」标签\n4. 等待自动识别并连接\n\n⚠️ 如果连接失败，可能是串口被其他程序占用（如 qFlipper），请在「诊断」中检查。\n\n（当前为离线模式，更多帮助请连接网络后重试）".to_string();
    }

    // 刷固件相关
    if q.contains("刷") && (q.contains("固件") || q.contains("momentum")) {
        return "🐬 刷写固件的步骤：\n\n1. **准备**：确保 SD 卡已格式化为 FAT32\n2. **备份**：导出重要数据\n3. **选择固件**：推荐 Momentum 固件（功能丰富）\n4. **刷写**：点击「刷写」按钮，等待完成\n5. **验证**：刷写后设备自动重启\n\n⚠️ 刷写有变砖风险，但可通过 DFU 模式恢复。\n\n（当前为离线模式）".to_string();
    }

    // NFC 相关
    if q.contains("nfc") || q.contains("门禁") || q.contains("卡片") {
        return "🐬 NFC 基础知识：\n\n- **NFC** 频率 13.56MHz，常见于门禁卡、公交卡\n- **RFID** 频率 125kHz，老式门禁卡常用\n- FlipperZero 可读取卡片 UID 与扇区数据\n\n⚠️ **合法使用提醒**：仅读取自己的卡片，复制他人门禁卡可能违法。\n\n（当前为离线模式）".to_string();
    }

    // 红外相关
    if q.contains("红外") || q.contains("遥控") || q.contains("电视") {
        return "🐬 红外遥控使用：\n\n1. 进入「红外」应用\n2. 选择「学习新遥控」或从「通用遥控」中选择\n3. 对准原遥控器按键学习\n4. 保存后即可用 FlipperZero 控制\n\n✅ 红外是最安全的入门功能，放心尝试！\n\n（当前为离线模式）".to_string();
    }

    // 默认回复
    format!("🐬 抱歉，当前处于离线模式，无法连接 AI 服务。\n\n您的问题我暂时无法详细解答，建议：\n\n1. 检查网络连接后重试\n2. 在「设置」中配置 AI 模型（通义千问/DeepSeek）\n3. 查看内置课程学习基础操作\n\n常见问题关键词：连接设备 / 刷固件 / NFC / 红外遥控\n\n您的问题关键词：{}", truncate(&q, 50))
}

/// 截断字符串
fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}

// -------------------- 课程列表 --------------------

/// 获取课程列表
pub fn get_courses() -> Vec<Course> {
    log::info!("获取课程列表");
    vec![
        Course {
            id: "course-00".to_string(),
            title: "FlipperZero 初相识".to_string(),
            description: "认识 FlipperZero 的硬件结构与基本功能，完成第一次开机设置".to_string(),
            duration_min: 15,
            icon: "rocket".to_string(),
            steps: vec![
                "认识正面按键：方向键与返回键的作用".to_string(),
                "认识侧面接口：GPIO / USB-C / SD卡槽".to_string(),
                "开机并完成初始设置向导".to_string(),
                "浏览主界面的五大应用区域".to_string(),
            ],
        },
        Course {
            id: "course-01".to_string(),
            title: "NFC 与 RFID 入门".to_string(),
            description: "理解 NFC 与 RFID 的区别，学会读取卡片信息".to_string(),
            duration_min: 25,
            icon: "card".to_string(),
            steps: vec![
                "理解 NFC（13.56MHz）与 RFID（125kHz）的频段区别".to_string(),
                "用 FlipperZero 读取一张 NFC 卡片".to_string(),
                "理解 UID 与扇区数据的概念".to_string(),
                "合法使用边界：仅读取自己的卡片".to_string(),
            ],
        },
        Course {
            id: "course-02".to_string(),
            title: "SubGHz 无线电入门".to_string(),
            description: "理解无线电频段，学会抓取与分析遥控信号".to_string(),
            duration_min: 30,
            icon: "radio".to_string(),
            steps: vec![
                "理解 SubGHz（433/868/915MHz）频段应用".to_string(),
                "抓取一个遥控器信号（Raw Record）".to_string(),
                "理解滚动码与固定码的区别".to_string(),
                "合法使用：不干扰他人设备".to_string(),
            ],
        },
        Course {
            id: "course-03".to_string(),
            title: "红外遥控入门".to_string(),
            description: "学会用 FlipperZero 控制电视、空调等家电".to_string(),
            duration_min: 20,
            icon: "remote".to_string(),
            steps: vec![
                "理解红外通信原理（38kHz 载波）".to_string(),
                "学习一个电视遥控器".to_string(),
                "从红外库中选择已有遥控码".to_string(),
                "实践：用 FlipperZero 当电视遥控器".to_string(),
            ],
        },
        Course {
            id: "course-04".to_string(),
            title: "BadUSB 基础与防御".to_string(),
            description: "理解 BadUSB 原理，建立安全防御思维（仅测试自己的设备）".to_string(),
            duration_min: 35,
            icon: "usb".to_string(),
            steps: vec![
                "理解 BadUSB 原理：伪装键盘执行脚本".to_string(),
                "学习 DuckyScript 基础语法".to_string(),
                "在**自己的设备**上测试示例脚本".to_string(),
                "防御视角：如何检测与防范 BadUSB 攻击".to_string(),
            ],
        },
        Course {
            id: "course-05".to_string(),
            title: "固件刷写指南".to_string(),
            description: "学会安全刷写第三方固件，掌握救砖技巧".to_string(),
            duration_min: 30,
            icon: "download".to_string(),
            steps: vec![
                "了解官方固件 vs 社区固件的区别".to_string(),
                "刷写前准备：备份 / 驱动 / SD卡".to_string(),
                "RPC 协议刷写（正常模式升级）".to_string(),
                "DFU 模式刷写（救砖恢复）".to_string(),
            ],
        },
        Course {
            id: "course-06".to_string(),
            title: "安全与合规".to_string(),
            description: "建立正确的硬件安全伦理观，做负责任的安全爱好者".to_string(),
            duration_min: 20,
            icon: "shield".to_string(),
            steps: vec![
                "了解 FlipperZero 的能力边界与法律红线".to_string(),
                "合法行为：学习 / 研究 / 测试自己的设备".to_string(),
                "违法行为：破解他人设备 / 绕过授权 / 干扰通信".to_string(),
                "培养负责任的安全研究者素养".to_string(),
            ],
        },
    ]
}
