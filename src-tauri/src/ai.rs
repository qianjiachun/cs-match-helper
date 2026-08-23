use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

const AI_REQUEST_TIMEOUT_MS: u64 = 10 * 60 * 1000;
const PROVIDER_DEEPSEEK: &str = "deepseek";
const PROVIDER_OPENAI_COMPATIBLE: &str = "openai_compatible";
const AI_FAST_MAX_COMPLETION_TOKENS: u64 = 2_600;
const AI_FAST_RETRY_MAX_COMPLETION_TOKENS: u64 = 3_600;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    #[serde(default = "default_analysis_enabled")]
    pub analysis_enabled: bool,
    #[serde(default = "default_provider_mode")]
    pub provider_mode: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default)]
    pub thinking_enabled: bool,
    #[serde(default = "default_reasoning_effort")]
    pub reasoning_effort: String,
    #[serde(default = "default_auto_analyze")]
    pub auto_analyze: bool,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub p5e_client_root: String,
}

fn default_analysis_enabled() -> bool {
    true
}

fn default_provider_mode() -> String {
    PROVIDER_DEEPSEEK.to_string()
}

fn is_deepseek_provider(mode: &str) -> bool {
    mode != PROVIDER_OPENAI_COMPATIBLE
}

fn default_base_url() -> String {
    "https://api.deepseek.com".to_string()
}

fn default_model() -> String {
    "deepseek-v4-flash".to_string()
}

fn default_reasoning_effort() -> String {
    "medium".to_string()
}

fn default_auto_analyze() -> bool {
    true
}

fn default_timeout_ms() -> u64 {
    AI_REQUEST_TIMEOUT_MS
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            analysis_enabled: default_analysis_enabled(),
            provider_mode: default_provider_mode(),
            api_key: String::new(),
            base_url: default_base_url(),
            model: default_model(),
            thinking_enabled: false,
            reasoning_effort: default_reasoning_effort(),
            auto_analyze: default_auto_analyze(),
            timeout_ms: default_timeout_ms(),
            p5e_client_root: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettingsPublic {
    pub analysis_enabled: bool,
    pub provider_mode: String,
    pub has_api_key: bool,
    /// 完整 Key，仅用于本机设置面板回显（请求仍由 Rust 侧发起）
    pub api_key: String,
    pub api_key_masked: String,
    pub base_url: String,
    pub model: String,
    pub thinking_enabled: bool,
    pub reasoning_effort: String,
    pub auto_analyze: bool,
    pub timeout_ms: u64,
}

/// 局部补丁：仅更新前端明确提交的字段，未提交字段保留本地已有值。
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiSettingsInput {
    pub analysis_enabled: Option<bool>,
    pub provider_mode: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub thinking_enabled: Option<bool>,
    pub reasoning_effort: Option<String>,
    pub auto_analyze: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartAiAnalysisInput {
    pub match_id: String,
    pub system_prompt: String,
    pub user_prompt: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisStartEvent {
    pub match_id: String,
    pub job_id: u64,
    pub started_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisDeltaEvent {
    pub match_id: String,
    pub job_id: u64,
    pub delta: String,
    pub full_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisDoneEvent {
    pub match_id: String,
    pub job_id: u64,
    pub full_text: String,
    pub usage: Option<TokenUsage>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisErrorEvent {
    pub match_id: String,
    pub job_id: u64,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisCancelledEvent {
    pub match_id: String,
    pub job_id: u64,
    pub elapsed_ms: u64,
}

pub struct AiAnalysisState {
    job_generation: AtomicU64,
    cancel_generation: AtomicU64,
    client: reqwest::Client,
    active_request: Mutex<Option<(u64, u64)>>,
}

impl Default for AiAnalysisState {
    fn default() -> Self {
        Self {
            job_generation: AtomicU64::new(0),
            cancel_generation: AtomicU64::new(0),
            client: reqwest::Client::new(),
            active_request: Mutex::new(None),
        }
    }
}

impl AiAnalysisState {
    fn start_job(&self) -> u64 {
        self.job_generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn cancel_all(&self) {
        let current = self.job_generation.load(Ordering::SeqCst);
        self.cancel_generation.store(current, Ordering::SeqCst);
    }

    fn is_cancelled(&self, job_id: u64) -> bool {
        self.cancel_generation.load(Ordering::SeqCst) >= job_id
    }

    fn request_key(input: &StartAiAnalysisInput) -> u64 {
        let mut hasher = DefaultHasher::new();
        input.match_id.hash(&mut hasher);
        input.system_prompt.hash(&mut hasher);
        input.user_prompt.hash(&mut hasher);
        hasher.finish()
    }

    fn is_duplicate_active_request(&self, key: u64) -> bool {
        let Ok(active) = self.active_request.lock() else {
            return false;
        };
        active
            .as_ref()
            .is_some_and(|(job_id, active_key)| *active_key == key && !self.is_cancelled(*job_id))
    }

    fn set_active_request(&self, job_id: u64, key: u64) {
        if let Ok(mut active) = self.active_request.lock() {
            *active = Some((job_id, key));
        }
    }

    fn clear_active_request(&self, job_id: u64) {
        if let Ok(mut active) = self.active_request.lock() {
            if active.as_ref().is_some_and(|(active_job, _)| *active_job == job_id) {
                *active = None;
            }
        }
    }
}

pub fn load_settings_file() -> Result<AiSettings, String> {
    let root = crate::settings_store::read_settings_json()?;
    serde_json::from_value(root).map_err(|e| format!("解析设置失败: {e}"))
}

/// 将保存补丁合并到已有设置，未出现在补丁中的字段保持不变。
pub fn apply_settings_patch(settings: &mut AiSettings, input: &SaveAiSettingsInput) {
    if let Some(v) = input.analysis_enabled {
        settings.analysis_enabled = v;
    }
    if let Some(ref v) = input.provider_mode {
        let trimmed = v.trim();
        settings.provider_mode = if trimmed == PROVIDER_OPENAI_COMPATIBLE {
            PROVIDER_OPENAI_COMPATIBLE.to_string()
        } else {
            PROVIDER_DEEPSEEK.to_string()
        };
    }
    if let Some(ref v) = input.api_key {
        settings.api_key = v.trim().to_string();
    }
    if let Some(ref v) = input.base_url {
        let trimmed = v.trim();
        settings.base_url = if trimmed.is_empty() {
            if is_deepseek_provider(&settings.provider_mode) {
                default_base_url()
            } else {
                String::new()
            }
        } else {
            trimmed.to_string()
        };
    }
    if let Some(ref v) = input.model {
        let trimmed = v.trim();
        settings.model = if trimmed.is_empty() {
            if is_deepseek_provider(&settings.provider_mode) {
                default_model()
            } else {
                String::new()
            }
        } else {
            trimmed.to_string()
        };
    }
    if let Some(v) = input.thinking_enabled {
        settings.thinking_enabled = v;
    }
    if let Some(ref v) = input.reasoning_effort {
        let trimmed = v.trim();
        settings.reasoning_effort = if trimmed.is_empty() {
            default_reasoning_effort()
        } else {
            trimmed.to_string()
        };
    }
    if let Some(v) = input.auto_analyze {
        settings.auto_analyze = v;
    }
}

pub fn save_settings_file(settings: &AiSettings) -> Result<(), String> {
    let ai_value = serde_json::to_value(settings).map_err(|e| format!("序列化设置失败: {e}"))?;
    let Some(ai_obj) = ai_value.as_object() else {
        return Err("序列化设置失败: 期望对象".to_string());
    };
    crate::settings_store::update_settings_json(|root| {
        for (key, value) in ai_obj {
            root.insert(key.clone(), value.clone());
        }
        Ok(true)
    })
}

fn mask_api_key(key: &str) -> String {
    if key.is_empty() {
        return String::new();
    }
    if key.len() <= 8 {
        return "*".repeat(key.len());
    }
    format!("{}...{}", &key[..4], &key[key.len() - 4..])
}

fn to_public(settings: &AiSettings) -> AiSettingsPublic {
    AiSettingsPublic {
        analysis_enabled: settings.analysis_enabled,
        provider_mode: settings.provider_mode.clone(),
        has_api_key: !settings.api_key.is_empty(),
        api_key: settings.api_key.clone(),
        api_key_masked: mask_api_key(&settings.api_key),
        base_url: settings.base_url.clone(),
        model: settings.model.clone(),
        thinking_enabled: settings.thinking_enabled,
        reasoning_effort: settings.reasoning_effort.clone(),
        auto_analyze: settings.auto_analyze,
        timeout_ms: settings.timeout_ms,
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn parse_usage(value: &serde_json::Value) -> Option<TokenUsage> {
    let usage = value.get("usage")?;
    Some(TokenUsage {
        prompt_tokens: usage.get("prompt_tokens")?.as_u64()?,
        completion_tokens: usage.get("completion_tokens")?.as_u64()?,
        total_tokens: usage.get("total_tokens")?.as_u64()?,
    })
}

fn content_value_to_string(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    let items = value.as_array()?;
    let mut output = String::new();
    for item in items {
        if let Some(text) = item.as_str() {
            output.push_str(text);
        } else if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
            output.push_str(text);
        } else if let Some(text) = item.get("content").and_then(|v| v.as_str()) {
            output.push_str(text);
        }
    }
    Some(output)
}

fn extract_content(json: &serde_json::Value) -> Option<String> {
    let choice = json.get("choices")?.as_array()?.first()?;
    for parent in [choice.get("delta"), choice.get("message"), Some(choice)] {
        if let Some(content) = parent.and_then(|value| value.get("content")) {
            if let Some(text) = content_value_to_string(content) {
                return Some(text);
            }
        }
    }
    choice.get("text").and_then(content_value_to_string)
}

fn extract_finish_reason(json: &serde_json::Value) -> Option<String> {
    json.get("choices")
        .and_then(|v| v.as_array())
        .and_then(|v| v.first())
        .and_then(|v| v.get("finish_reason"))
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned)
}

fn extract_provider_error(json: &serde_json::Value) -> Option<String> {
    let error = json.get("error")?;
    if let Some(message) = error.get("message").and_then(|v| v.as_str()) {
        return Some(message.to_string());
    }
    error.as_str().map(ToOwned::to_owned)
}

#[tauri::command]
pub fn get_ai_settings_path() -> Result<String, String> {
    crate::settings_store::settings_path().map(|path| path.display().to_string())
}

#[tauri::command]
pub fn load_ai_settings() -> Result<AiSettingsPublic, String> {
    let settings = load_settings_file()?;
    Ok(to_public(&settings))
}

#[tauri::command]
pub fn save_ai_settings(input: SaveAiSettingsInput) -> Result<AiSettingsPublic, String> {
    let mut settings = load_settings_file()?;
    apply_settings_patch(&mut settings, &input);
    save_settings_file(&settings)?;
    Ok(to_public(&settings))
}

pub fn load_p5e_client_root_from_settings() -> Result<Option<String>, String> {
    let settings = load_settings_file()?;
    let trimmed = settings.p5e_client_root.trim();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

pub fn save_p5e_client_root_to_settings(root: Option<&str>) -> Result<(), String> {
    let mut settings = load_settings_file()?;
    settings.p5e_client_root = root.unwrap_or("").trim().to_string();
    save_settings_file(&settings)
}

#[tauri::command]
pub fn load_p5e_client_root() -> Result<Option<String>, String> {
    load_p5e_client_root_from_settings()
}

#[tauri::command]
pub fn save_p5e_client_root(client_root: Option<String>) -> Result<(), String> {
    save_p5e_client_root_to_settings(client_root.as_deref())
}

#[tauri::command]
pub fn cancel_ai_analysis(ai_state: State<'_, AiAnalysisState>) -> Result<(), String> {
    ai_state.cancel_all();
    Ok(())
}

#[tauri::command]
pub async fn start_ai_analysis(
    app: AppHandle,
    ai_state: State<'_, AiAnalysisState>,
    input: StartAiAnalysisInput,
) -> Result<(), String> {
    let settings = load_settings_file()?;
    if !settings.analysis_enabled {
        return Err("AI 分析已在设置中关闭".to_string());
    }
    if settings.api_key.trim().is_empty() {
        return Err("请先在设置中配置 API Key".to_string());
    }
    if settings.base_url.trim().is_empty() {
        return Err("请先在设置中配置 API Base URL".to_string());
    }
    if settings.model.trim().is_empty() {
        return Err("请先在设置中配置模型名称".to_string());
    }

    let request_key = AiAnalysisState::request_key(&input);
    if ai_state.is_duplicate_active_request(request_key) {
        return Ok(());
    }

    ai_state.cancel_all();
    let job_id = ai_state.start_job();
    ai_state.set_active_request(job_id, request_key);
    let match_id = input.match_id.clone();

    let _ = app.emit(
        "ai-analysis-start",
        AiAnalysisStartEvent {
            match_id: match_id.clone(),
            job_id,
            started_at: now_ms(),
        },
    );

    let started = Instant::now();
    let result = run_streaming_analysis(&app, &ai_state, job_id, &settings, &input).await;

    if ai_state.is_cancelled(job_id) {
        let _ = app.emit(
            "ai-analysis-cancelled",
            AiAnalysisCancelledEvent {
                match_id,
                job_id,
                elapsed_ms: started.elapsed().as_millis() as u64,
            },
        );
        ai_state.clear_active_request(job_id);
        return Ok(());
    }

    let elapsed_ms = started.elapsed().as_millis() as u64;

    match result {
        Ok((full_text, usage)) => {
            let _ = app.emit(
                "ai-analysis-done",
                AiAnalysisDoneEvent {
                    match_id,
                    job_id,
                    full_text,
                    usage,
                    elapsed_ms,
                },
            );
        }
        Err(error) => {
            let _ = app.emit(
                "ai-analysis-error",
                AiAnalysisErrorEvent { match_id, job_id, error },
            );
        }
    }

    ai_state.clear_active_request(job_id);

    Ok(())
}

async fn run_streaming_analysis(
    app: &AppHandle,
    ai_state: &AiAnalysisState,
    job_id: u64,
    settings: &AiSettings,
    input: &StartAiAnalysisInput,
) -> Result<(String, Option<TokenUsage>), String> {
    let first = run_streaming_analysis_once(
        app,
        ai_state,
        job_id,
        settings,
        input,
        if settings.thinking_enabled {
            None
        } else {
            Some(AI_FAST_MAX_COMPLETION_TOKENS)
        },
    )
    .await?;

    if ai_state.is_cancelled(job_id) {
        return Ok((first.full_text, first.usage));
    }

    let needs_retry = first.full_text.trim().is_empty() || first.finish_reason.as_deref() == Some("length");
    if needs_retry {
        let mut retry_settings = settings.clone();
        if settings.thinking_enabled && first.full_text.trim().is_empty() {
            retry_settings.thinking_enabled = false;
        }
        let retry = run_streaming_analysis_once(
            app,
            ai_state,
            job_id,
            &retry_settings,
            input,
            if retry_settings.thinking_enabled {
                None
            } else {
                Some(AI_FAST_RETRY_MAX_COMPLETION_TOKENS)
            },
        )
        .await?;
        if retry.full_text.trim().is_empty() {
            return Err("AI 返回内容为空".to_string());
        }
        if retry.finish_reason.as_deref() == Some("length") {
            return Err("AI 输出达到长度上限，请减少上下文后重试".to_string());
        }
        return Ok((retry.full_text, retry.usage));
    }

    if first.full_text.trim().is_empty() {
        return Err("AI 返回内容为空".to_string());
    }

    Ok((first.full_text, first.usage))
}

struct AnalysisAttempt {
    full_text: String,
    usage: Option<TokenUsage>,
    finish_reason: Option<String>,
}

async fn run_streaming_analysis_once(
    app: &AppHandle,
    ai_state: &AiAnalysisState,
    job_id: u64,
    settings: &AiSettings,
    input: &StartAiAnalysisInput,
    max_tokens: Option<u64>,
) -> Result<AnalysisAttempt, String> {
    let body = build_analysis_body(settings, input, max_tokens);

    let url = format!(
        "{}/chat/completions",
        settings.base_url.trim_end_matches('/')
    );

    let response = ai_state
        .client
        .post(&url)
        .timeout(Duration::from_millis(
            settings.timeout_ms.max(AI_REQUEST_TIMEOUT_MS),
        ))
        .header("Authorization", format!("Bearer {}", settings.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求 AI 服务失败: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("AI API 错误 ({status}): {text}"));
    }

    let is_event_stream = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_ascii_lowercase().contains("text/event-stream"))
        .unwrap_or(false);

    if !is_event_stream {
        let bytes = response.bytes().await.map_err(|e| format!("读取 AI 响应失败: {e}"))?;
        let json: serde_json::Value = serde_json::from_slice(&bytes)
            .map_err(|e| format!("解析 AI 响应失败: {e}"))?;
        if let Some(error) = extract_provider_error(&json) {
            return Err(format!("AI 服务返回错误: {error}"));
        }
        let text = extract_content(&json).unwrap_or_default();
        if !text.is_empty() {
            let _ = app.emit(
                "ai-analysis-delta",
                AiAnalysisDeltaEvent {
                    match_id: input.match_id.clone(),
                    job_id,
                    delta: text.clone(),
                    full_text: text.clone(),
                },
            );
        }
        return Ok(AnalysisAttempt {
            full_text: text,
            usage: parse_usage(&json),
            finish_reason: extract_finish_reason(&json),
        });
    }

    let mut stream = response.bytes_stream();
    let mut full_text = String::new();
    let mut usage: Option<TokenUsage> = None;
    let mut finish_reason: Option<String> = None;
    let mut buffer = String::new();
    let mut saw_sse = false;
    let mut raw_response = String::new();

    let mut handle_data = |data: &str| -> Result<(), String> {
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            return Ok(());
        }
        let json: serde_json::Value = serde_json::from_str(data)
            .map_err(|e| format!("解析 SSE 数据失败: {e}"))?;
        if let Some(error) = extract_provider_error(&json) {
            return Err(format!("AI 服务返回错误: {error}"));
        }
        if let Some(u) = parse_usage(&json) {
            usage = Some(u);
        }
        if let Some(reason) = extract_finish_reason(&json) {
            finish_reason = Some(reason);
        }
        if let Some(delta) = extract_content(&json) {
            if !delta.is_empty() {
                full_text.push_str(&delta);
                let _ = app.emit(
                    "ai-analysis-delta",
                    AiAnalysisDeltaEvent {
                        match_id: input.match_id.clone(),
                        job_id,
                        delta,
                        full_text: full_text.clone(),
                    },
                );
            }
        }
        Ok(())
    };

    while let Some(chunk_result) = stream.next().await {
        if ai_state.is_cancelled(job_id) {
            return Ok(AnalysisAttempt {
                full_text,
                usage,
                finish_reason,
            });
        }

        let chunk = chunk_result.map_err(|e| format!("读取流式响应失败: {e}"))?;
        let chunk_text = String::from_utf8_lossy(&chunk);
        raw_response.push_str(&chunk_text);
        buffer.push_str(&chunk_text);

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end_matches('\r').to_string();
            buffer = buffer[pos + 1..].to_string();

            if line.is_empty() {
                continue;
            }
            if let Some(data) = line.strip_prefix("data:") {
                saw_sse = true;
                handle_data(data)?;
            } else if saw_sse {
                continue;
            }
        }
    }

    if !buffer.trim().is_empty() {
        let line = buffer.trim().trim_end_matches('\r');
        if let Some(data) = line.strip_prefix("data:") {
            saw_sse = true;
            handle_data(data)?;
        }
    }

    if !saw_sse && full_text.trim().is_empty() && !raw_response.trim().is_empty() {
        let json: serde_json::Value = serde_json::from_str(raw_response.trim())
            .map_err(|e| format!("解析 AI 响应失败: {e}"))?;
        if let Some(error) = extract_provider_error(&json) {
            return Err(format!("AI 服务返回错误: {error}"));
        }
        if let Some(u) = parse_usage(&json) {
            usage = Some(u);
        }
        finish_reason = extract_finish_reason(&json);
        if let Some(text) = extract_content(&json) {
            if !text.is_empty() {
                let _ = app.emit(
                    "ai-analysis-delta",
                    AiAnalysisDeltaEvent {
                        match_id: input.match_id.clone(),
                        job_id,
                        delta: text.clone(),
                        full_text: text.clone(),
                    },
                );
                full_text = text;
            }
        }
    }

    Ok(AnalysisAttempt { full_text, usage, finish_reason })
}

fn build_analysis_body(
    settings: &AiSettings,
    input: &StartAiAnalysisInput,
    max_tokens: Option<u64>,
) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": settings.model,
        "messages": [
            { "role": "system", "content": input.system_prompt },
            { "role": "user", "content": input.user_prompt },
        ],
        "stream": true,
        "response_format": { "type": "json_object" },
    });

    if is_deepseek_provider(&settings.provider_mode) {
        // V4 默认开启思考；关闭时必须显式 disabled，否则 CoT 会吃掉 max_tokens 导致 content 为空
        if settings.thinking_enabled {
            body["thinking"] = serde_json::json!({ "type": "enabled" });
            body["reasoning_effort"] = serde_json::json!(settings.reasoning_effort);
        } else {
            body["thinking"] = serde_json::json!({ "type": "disabled" });
            if let Some(max_tokens) = max_tokens {
                body["max_tokens"] = serde_json::json!(max_tokens);
            }
        }
    } else if let Some(max_tokens) = max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }
    body
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_legacy_json_fills_missing_fields_with_defaults() {
        let legacy = r#"{
            "analysisEnabled": false,
            "apiKey": "sk-test-key",
            "baseUrl": "https://api.example.com",
            "model": "deepseek-v4-pro",
            "thinkingEnabled": true
        }"#;

        let settings: AiSettings = serde_json::from_str(legacy).expect("legacy json should parse");

        assert!(!settings.analysis_enabled);
        assert_eq!(settings.provider_mode, PROVIDER_DEEPSEEK);
        assert_eq!(settings.api_key, "sk-test-key");
        assert_eq!(settings.base_url, "https://api.example.com");
        assert_eq!(settings.model, "deepseek-v4-pro");
        assert!(settings.thinking_enabled);
        assert_eq!(settings.reasoning_effort, "medium");
        assert!(settings.auto_analyze);
        assert_eq!(settings.timeout_ms, AI_REQUEST_TIMEOUT_MS);
        assert!(settings.p5e_client_root.is_empty());
    }

    #[test]
    fn partial_patch_preserves_unmentioned_fields() {
        let mut settings = AiSettings {
            analysis_enabled: true,
            provider_mode: PROVIDER_OPENAI_COMPATIBLE.to_string(),
            api_key: "sk-keep-me".to_string(),
            base_url: "https://custom.example.com".to_string(),
            model: "deepseek-v4-pro".to_string(),
            thinking_enabled: true,
            reasoning_effort: "high".to_string(),
            auto_analyze: false,
            timeout_ms: 123_456,
            p5e_client_root: r"X:\Apps\5E\5EClient".to_string(),
        };

        apply_settings_patch(
            &mut settings,
            &SaveAiSettingsInput {
                base_url: Some("https://api.deepseek.com".to_string()),
                model: Some("deepseek-v4-flash".to_string()),
                ..Default::default()
            },
        );

        assert_eq!(settings.api_key, "sk-keep-me");
        assert_eq!(settings.base_url, "https://api.deepseek.com");
        assert_eq!(settings.model, "deepseek-v4-flash");
        assert!(settings.analysis_enabled);
        assert!(settings.thinking_enabled);
        assert_eq!(settings.reasoning_effort, "high");
        assert!(!settings.auto_analyze);
        assert_eq!(settings.timeout_ms, 123_456);
        assert_eq!(settings.p5e_client_root, r"X:\Apps\5E\5EClient");
    }

    #[test]
    fn patch_can_clear_api_key_with_empty_string() {
        let mut settings = AiSettings {
            api_key: "sk-clear-me".to_string(),
            ..AiSettings::default()
        };

        apply_settings_patch(
            &mut settings,
            &SaveAiSettingsInput {
                api_key: Some(String::new()),
                ..Default::default()
            },
        );

        assert!(settings.api_key.is_empty());
    }

    #[test]
    fn patch_trims_api_key_and_string_fields() {
        let mut settings = AiSettings::default();

        apply_settings_patch(
            &mut settings,
            &SaveAiSettingsInput {
                api_key: Some("  sk-trimmed  ".to_string()),
                base_url: Some("  https://api.deepseek.com  ".to_string()),
                model: Some("  deepseek-v4-flash  ".to_string()),
                reasoning_effort: Some("  high  ".to_string()),
                ..Default::default()
            },
        );

        assert_eq!(settings.api_key, "sk-trimmed");
        assert_eq!(settings.base_url, "https://api.deepseek.com");
        assert_eq!(settings.model, "deepseek-v4-flash");
        assert_eq!(settings.reasoning_effort, "high");
    }

    #[test]
    fn patch_empty_base_url_and_model_fall_back_to_defaults() {
        let mut settings = AiSettings {
            base_url: "https://custom.example.com".to_string(),
            model: "deepseek-v4-pro".to_string(),
            ..AiSettings::default()
        };

        apply_settings_patch(
            &mut settings,
            &SaveAiSettingsInput {
                base_url: Some("   ".to_string()),
                model: Some("".to_string()),
                ..Default::default()
            },
        );

        assert_eq!(settings.base_url, default_base_url());
        assert_eq!(settings.model, default_model());
    }

    #[test]
    fn openai_compatible_empty_base_url_and_model_stay_empty() {
        let mut settings = AiSettings {
            provider_mode: PROVIDER_OPENAI_COMPATIBLE.to_string(),
            base_url: "https://custom.example.com".to_string(),
            model: "gpt-4o-mini".to_string(),
            ..AiSettings::default()
        };

        apply_settings_patch(
            &mut settings,
            &SaveAiSettingsInput {
                base_url: Some("   ".to_string()),
                model: Some("".to_string()),
                ..Default::default()
            },
        );

        assert!(settings.base_url.is_empty());
        assert!(settings.model.is_empty());
    }

    #[test]
    fn provider_mode_patch_accepts_openai_compatible() {
        let mut settings = AiSettings::default();

        apply_settings_patch(
            &mut settings,
            &SaveAiSettingsInput {
                provider_mode: Some(PROVIDER_OPENAI_COMPATIBLE.to_string()),
                ..Default::default()
            },
        );

        assert_eq!(settings.provider_mode, PROVIDER_OPENAI_COMPATIBLE);
    }

    #[test]
    fn deserialize_patch_input_ignores_missing_fields() {
        let input: SaveAiSettingsInput =
            serde_json::from_str(r#"{"model":"deepseek-v4-pro"}"#).expect("patch json");

        assert!(input.analysis_enabled.is_none());
        assert!(input.provider_mode.is_none());
        assert!(input.api_key.is_none());
        assert!(input.base_url.is_none());
        assert_eq!(input.model.as_deref(), Some("deepseek-v4-pro"));
        assert!(input.thinking_enabled.is_none());
        assert!(input.reasoning_effort.is_none());
        assert!(input.auto_analyze.is_none());
    }

    #[test]
    fn fast_request_caps_completion_tokens_but_thinking_requests_do_not() {
        let input = StartAiAnalysisInput {
            match_id: "test-match".to_string(),
            system_prompt: "system".to_string(),
            user_prompt: "user".to_string(),
        };
        let fast = build_analysis_body(&AiSettings::default(), &input, Some(AI_FAST_MAX_COMPLETION_TOKENS));
        assert_eq!(fast["max_tokens"], AI_FAST_MAX_COMPLETION_TOKENS);
        assert_eq!(fast["thinking"]["type"], "disabled");

        let deepseek_thinking = build_analysis_body(
            &AiSettings {
                thinking_enabled: true,
                ..AiSettings::default()
            },
            &input,
            None,
        );
        assert!(deepseek_thinking.get("max_tokens").is_none());
        assert_eq!(deepseek_thinking["thinking"]["type"], "enabled");

        let compatible_thinking = build_analysis_body(
            &AiSettings {
                provider_mode: PROVIDER_OPENAI_COMPATIBLE.to_string(),
                thinking_enabled: true,
                ..AiSettings::default()
            },
            &input,
            None,
        );
        assert!(compatible_thinking.get("max_tokens").is_none());
        assert!(compatible_thinking.get("thinking").is_none());

        let compatible_fast = build_analysis_body(
            &AiSettings {
                provider_mode: PROVIDER_OPENAI_COMPATIBLE.to_string(),
                ..AiSettings::default()
            },
            &input,
            Some(AI_FAST_MAX_COMPLETION_TOKENS),
        );
        assert_eq!(compatible_fast["max_tokens"], AI_FAST_MAX_COMPLETION_TOKENS);
        assert!(compatible_fast.get("thinking").is_none());
    }

    #[test]
    fn extract_content_reads_delta_and_ignores_empty_reasoning_only_chunks() {
        let delta = serde_json::json!({
            "choices": [{ "delta": { "content": "{\"headline\":\"ok\"}" } }]
        });
        assert_eq!(extract_content(&delta).as_deref(), Some("{\"headline\":\"ok\"}"));

        let reasoning_only = serde_json::json!({
            "choices": [{ "delta": { "content": null, "reasoning_content": "thinking..." } }]
        });
        assert!(extract_content(&reasoning_only).is_none());
    }
}
