/**
 * AI 模块 — 多 Provider LLM 管道
 *
 * 子模块:
 *   sanitizer.rs — 输入脱敏 (7 种敏感数据模式)
 *   provider.rs  — 多 Provider 抽象 (DeepSeek/OpenAI/Qwen/Local)
 *   pipeline.rs  — AI 管道 (SSE stream + 命令解析 + 设备上下文注入)
 *
 * 数据流:
 *   用户输入 → sanitizer 脱敏 → 构建上下文 → provider SSE stream
 *   → 逐 token emit 到前端 → 解析 <cmds> 标签 → 返回完整回复
 */
pub mod sanitizer;
pub mod provider;
pub mod pipeline;
