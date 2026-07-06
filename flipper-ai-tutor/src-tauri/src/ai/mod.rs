// =============================================================================
// ai/mod.rs - AI 模块入口
// =============================================================================
// 职责：聚合 AI 相关子模块，定义对话数据结构与模型配置
// 子模块：
//   - router:    多模型路由（通义千问 / DeepSeek / OpenAI），断网降级本地 FAQ
//   - prompt:    System Prompt 管理（海豚老师角色设定）
//   - sanitizer: 数据脱敏（正则过滤门禁 UID / NFC 密钥 / WiFi 密码 / 坐标）
//
// 设计理念：
//   - 海豚老师：友好的 AI 助手角色，用通俗语言引导小白用户
//   - 多模型路由：根据场景（文字/图片/代码）选择最合适的模型
//   - 隐私优先：所有发给云端的数据先经过脱敏处理
//   - 断网可用：网络不可用时降级到本地 FAQ 知识库
// =============================================================================

pub mod prompt;
pub mod router;
pub mod sanitizer;

use serde::{Deserialize, Serialize};

// -------------------- AI 模型配置 --------------------

/// AI 模型 Provider，与前端 AiModelConfig.provider 对应
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    /// 通义千问
    Qwen,
    /// DeepSeek
    Deepseek,
    /// OpenAI
    Openai,
    /// 本地模型（降级模式）
    Local,
}

impl AiProvider {
    /// 从字符串解析
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "qwen" => Self::Qwen,
            "deepseek" => Self::Deepseek,
            "openai" => Self::Openai,
            _ => Self::Local,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Qwen => "qwen",
            Self::Deepseek => "deepseek",
            Self::Openai => "openai",
            Self::Local => "local",
        }
    }
}

/// AI 模型配置，与前端 AiModelConfig 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModelConfig {
    pub provider: AiProvider,
    #[serde(skip_serializing_if = "String::is_empty", default)]
    pub api_key: String,
    #[serde(skip_serializing_if = "String::is_empty", default)]
    pub api_url: String,
    pub model_name: String,
    pub is_multimodal: bool,
}

impl AiModelConfig {
    /// 创建默认的本地配置（降级模式）
    pub fn default_local() -> Self {
        Self {
            provider: AiProvider::Local,
            api_key: String::new(),
            api_url: String::new(),
            model_name: "local-faq".to_string(),
            is_multimodal: false,
        }
    }

    /// 创建默认的通义千问配置
    pub fn default_qwen() -> Self {
        Self {
            provider: AiProvider::Qwen,
            api_key: String::new(),
            api_url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
                .to_string(),
            model_name: "qwen-plus".to_string(),
            is_multimodal: false,
        }
    }
}

// -------------------- 对话消息 --------------------

/// 对话消息，与前端 ChatMessage 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: ChatRole,
    pub content: String,
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_streaming: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_used: Option<u32>,
}

/// 消息角色
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    User,
    Assistant,
    System,
}

/// AI 回复
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub content: String,
    pub tokens_used: u32,
    pub model: String,
    pub provider: String,
    /// 是否来自本地降级
    pub is_fallback: bool,
    pub timestamp: i64,
}

// -------------------- 课程 --------------------

/// 课程 ID，与前端 AiCourseId 对应
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CourseId {
    Course00,
    Course01,
    Course02,
    Course03,
    Course04,
    Course05,
    Course06,
}

/// 课程，与前端 Course 对应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub id: String,
    pub title: String,
    pub description: String,
    pub duration_min: u32,
    pub icon: String,
    pub steps: Vec<String>,
}
