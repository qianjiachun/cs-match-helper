use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tokio::sync::OnceCell;

const MATCH_API_BASE: &str = "https://gate.5eplay.com/crane/http/api/data/match/";

type FetchCell = Arc<OnceCell<Result<Value, String>>>;

fn inflight_store() -> &'static Mutex<HashMap<String, FetchCell>> {
    static STORE: OnceLock<Mutex<HashMap<String, FetchCell>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn fetch_match_detail_http(code: &str) -> Result<Value, String> {
    let url = format!("{MATCH_API_BASE}{code}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .header("Referer", "https://view-arena.5eplay.com/")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("请求 match 接口失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("match 接口 HTTP {}", resp.status()));
    }

    resp.json::<Value>()
        .await
        .map_err(|e| format!("解析 match 响应失败: {e}"))
}

#[tauri::command]
pub async fn fetch_5e_match_detail(match_code: String) -> Result<Value, String> {
    let code = match_code.trim().to_string();
    if code.is_empty() {
        return Err("match_code 不能为空".into());
    }
    if code.contains('/') || code.contains('\\') {
        return Err("match_code 格式无效".into());
    }

    let cell = {
        let mut map = inflight_store().lock().unwrap();
        map.entry(code.clone())
            .or_insert_with(|| Arc::new(OnceCell::new()))
            .clone()
    };

    let outcome = cell
        .get_or_init(|| async { fetch_match_detail_http(&code).await })
        .await;

    if outcome.is_err() {
        inflight_store().lock().unwrap().remove(&code);
    }

    match outcome {
        Ok(value) => Ok(value.clone()),
        Err(err) => Err(err.clone()),
    }
}
