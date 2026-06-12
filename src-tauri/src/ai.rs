use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

const SETTINGS_FILENAME: &str = "cs-match-helper-settings.json";
const AI_REQUEST_TIMEOUT_MS: u64 = 10 * 60 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    #[serde(default = "default_analysis_enabled")]
    pub analysis_enabled: bool,
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
}

fn default_analysis_enabled() -> bool {
    true
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
            api_key: String::new(),
            base_url: default_base_url(),
            model: default_model(),
            thinking_enabled: false,
            reasoning_effort: default_reasoning_effort(),
            auto_analyze: default_auto_analyze(),
            timeout_ms: default_timeout_ms(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettingsPublic {
    pub analysis_enabled: bool,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiSettingsInput {
    pub analysis_enabled: bool,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub thinking_enabled: bool,
    pub reasoning_effort: String,
    pub auto_analyze: bool,
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
    pub started_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisDeltaEvent {
    pub match_id: String,
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
    pub full_text: String,
    pub usage: Option<TokenUsage>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisErrorEvent {
    pub match_id: String,
    pub error: String,
}

pub struct AiAnalysisState {
    job_generation: AtomicU64,
    cancel_generation: AtomicU64,
}

impl Default for AiAnalysisState {
    fn default() -> Self {
        Self {
            job_generation: AtomicU64::new(0),
            cancel_generation: AtomicU64::new(0),
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
}

fn settings_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法获取程序路径: {e}"))?;
    let parent = exe
        .parent()
        .ok_or_else(|| "无法获取程序所在目录".to_string())?;
    Ok(parent.join(SETTINGS_FILENAME))
}

pub fn load_settings_file() -> Result<AiSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(AiSettings::default());
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("读取设置失败 ({path:?}): {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析设置失败: {e}"))
}

pub fn save_settings_file(settings: &AiSettings) -> Result<(), String> {
    let path = settings_path()?;
    let content =
        serde_json::to_string_pretty(settings).map_err(|e| format!("序列化设置失败: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("保存设置失败 ({path:?}): {e}"))
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

fn extract_delta_content(json: &serde_json::Value) -> Option<String> {
    json.get("choices")?
        .as_array()?
        .first()?
        .get("delta")?
        .get("content")?
        .as_str()
        .map(|s| s.to_string())
}

#[tauri::command]
pub fn get_ai_settings_path() -> Result<String, String> {
    settings_path().map(|p| p.display().to_string())
}

#[tauri::command]
pub fn load_ai_settings() -> Result<AiSettingsPublic, String> {
    let settings = load_settings_file()?;
    Ok(to_public(&settings))
}

#[tauri::command]
pub fn save_ai_settings(input: SaveAiSettingsInput) -> Result<AiSettingsPublic, String> {
    let mut settings = load_settings_file()?;
    settings.api_key = input.api_key.trim().to_string();
    settings.analysis_enabled = input.analysis_enabled;
    settings.base_url = input.base_url.trim().to_string();
    settings.model = input.model.trim().to_string();
    settings.thinking_enabled = input.thinking_enabled;
    settings.reasoning_effort = input.reasoning_effort;
    settings.auto_analyze = input.auto_analyze;
    settings.timeout_ms = AI_REQUEST_TIMEOUT_MS;
    save_settings_file(&settings)?;
    Ok(to_public(&settings))
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
        return Err("请先在设置中配置 DeepSeek API Key".to_string());
    }

    ai_state.cancel_all();
    let job_id = ai_state.start_job();
    let match_id = input.match_id.clone();

    let _ = app.emit(
        "ai-analysis-start",
        AiAnalysisStartEvent {
            match_id: match_id.clone(),
            started_at: now_ms(),
        },
    );

    let started = Instant::now();
    let result = run_streaming_analysis(&app, &ai_state, job_id, &settings, &input).await;

    if ai_state.is_cancelled(job_id) {
        return Ok(());
    }

    let elapsed_ms = started.elapsed().as_millis() as u64;

    match result {
        Ok((full_text, usage)) => {
            let _ = app.emit(
                "ai-analysis-done",
                AiAnalysisDoneEvent {
                    match_id,
                    full_text,
                    usage,
                    elapsed_ms,
                },
            );
        }
        Err(error) => {
            let _ = app.emit(
                "ai-analysis-error",
                AiAnalysisErrorEvent { match_id, error },
            );
        }
    }

    Ok(())
}

async fn run_streaming_analysis(
    app: &AppHandle,
    ai_state: &AiAnalysisState,
    job_id: u64,
    settings: &AiSettings,
    input: &StartAiAnalysisInput,
) -> Result<(String, Option<TokenUsage>), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(
            settings.timeout_ms.max(AI_REQUEST_TIMEOUT_MS),
        ))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let mut body = serde_json::json!({
        "model": settings.model,
        "messages": [
            { "role": "system", "content": input.system_prompt },
            { "role": "user", "content": input.user_prompt },
        ],
        "stream": true,
        "response_format": { "type": "json_object" },
    });

    if settings.thinking_enabled {
        body["thinking"] = serde_json::json!({ "type": "enabled" });
        body["reasoning_effort"] = serde_json::json!(settings.reasoning_effort);
    }

    let url = format!(
        "{}/chat/completions",
        settings.base_url.trim_end_matches('/')
    );

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", settings.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求 DeepSeek 失败: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("DeepSeek API 错误 ({status}): {text}"));
    }

    let mut stream = response.bytes_stream();
    let mut full_text = String::new();
    let mut usage: Option<TokenUsage> = None;
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        if ai_state.is_cancelled(job_id) {
            return Ok((full_text, usage));
        }

        let chunk = chunk_result.map_err(|e| format!("读取流式响应失败: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end_matches('\r').to_string();
            buffer = buffer[pos + 1..].to_string();

            if line.is_empty() {
                continue;
            }
            if !line.starts_with("data: ") {
                continue;
            }

            let data = line.trim_start_matches("data: ").trim();
            if data == "[DONE]" {
                continue;
            }

            let json: serde_json::Value = serde_json::from_str(data)
                .map_err(|e| format!("解析 SSE 数据失败: {e}"))?;

            if let Some(u) = parse_usage(&json) {
                usage = Some(u);
            }

            if let Some(delta) = extract_delta_content(&json) {
                if delta.is_empty() {
                    continue;
                }
                full_text.push_str(&delta);
                let _ = app.emit(
                    "ai-analysis-delta",
                    AiAnalysisDeltaEvent {
                        match_id: input.match_id.clone(),
                        delta,
                        full_text: full_text.clone(),
                    },
                );
            }
        }
    }

    if full_text.trim().is_empty() {
        return Err("AI 返回内容为空".to_string());
    }

    Ok((full_text, usage))
}
