use super::platform_5e_gate_sign::build_gate_signed_headers;
use futures_util::future::join_all;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tokio::sync::OnceCell;

const PLAYER_HOME_API: &str = "https://gate.5eplay.com/cranenew/http/api/data/v3/player/home";
const PLAYER_HOME_PATH: &str = "/cranenew/http/api/data/v3/player/home";
const BATCH_CONCURRENCY: usize = 10;

type FetchCell = Arc<OnceCell<Result<Value, String>>>;

fn inflight_store() -> &'static Mutex<HashMap<String, FetchCell>> {
    static STORE: OnceLock<Mutex<HashMap<String, FetchCell>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn batch_cache_key(uuids: &[String]) -> String {
    let mut sorted = uuids.to_vec();
    sorted.sort();
    format!("home:{}", sorted.join(","))
}

fn home_response_ok(body: &Value) -> bool {
    body.get("code")
        .and_then(|v| v.as_i64())
        .is_some_and(|c| c == 0)
        && body
            .get("data")
            .and_then(|d| d.get("season_data"))
            .is_some()
}

async fn fetch_player_home_http(uuid: &str) -> Result<Value, String> {
    let uuid = uuid.trim();
    if uuid.is_empty() {
        return Err("uuid 不能为空".into());
    }

    let mut query = BTreeMap::new();
    query.insert("uuid".to_string(), uuid.to_string());
    let signed = build_gate_signed_headers("GET", PLAYER_HOME_PATH, &query);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(PLAYER_HOME_API)
        .query(&[("uuid", uuid)])
        .header("Accept", &signed.accept)
        .header("Accept-Language", &signed.accept_language)
        .header("Authorization", &signed.authorization)
        .header("Content-MD5", &signed.content_md5)
        .header("Referer", &signed.referer)
        .header("Origin", &signed.origin)
        .header("x-ca-key", &signed.x_ca_key)
        .header("x-ca-signature-method", &signed.x_ca_signature_method)
        .header("x-ca-signature-headers", &signed.x_ca_signature_headers)
        .header("x-ca-signature", &signed.x_ca_signature)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
        )
        .send()
        .await
        .map_err(|e| format!("请求 player/home 失败: {e}"))?;

    let status = resp.status();
    let body_text = resp
        .text()
        .await
        .map_err(|e| format!("读取 player/home 响应失败: {e}"))?;

    if !status.is_success() {
        let mut detail = status.to_string();
        if let Ok(parsed) = serde_json::from_str::<Value>(&body_text) {
            if let Some(msg) = parsed.get("message").and_then(|m| m.as_str()) {
                detail = format!("{detail}: {msg}");
            }
        }
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err(format!("GATE_SIGNATURE_FAILED: player/home 签名验证失败（{detail}）"));
        }
        return Err(format!("player/home HTTP {detail}"));
    }

    let body: Value = serde_json::from_str(&body_text)
        .map_err(|e| format!("解析 player/home 响应失败: {e}"))?;

    if !home_response_ok(&body) {
        return Err(format!(
            "player/home 业务错误: {}",
            body.get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("缺少 season_data")
        ));
    }

    Ok(body)
}

#[tauri::command]
pub async fn fetch_5e_player_home(uuid: String) -> Result<Value, String> {
    let uuid = uuid.trim().to_string();
    if uuid.is_empty() {
        return Err("uuid 不能为空".into());
    }

    let key = format!("home:{uuid}");
    let cell = {
        let mut map = inflight_store().lock().unwrap();
        map.entry(key.clone())
            .or_insert_with(|| Arc::new(OnceCell::new()))
            .clone()
    };

    let outcome = cell.get_or_init(|| async move { fetch_player_home_http(&uuid).await }).await;

    if outcome.is_err() {
        inflight_store().lock().unwrap().remove(&key);
    }

    match outcome {
        Ok(value) => Ok(value.clone()),
        Err(err) => Err(err.clone()),
    }
}

#[tauri::command]
pub async fn fetch_5e_player_home_batch(uuids: Vec<String>) -> Result<Value, String> {
    let cleaned: Vec<String> = uuids
        .into_iter()
        .map(|u| u.trim().to_string())
        .filter(|u| !u.is_empty())
        .collect();
    if cleaned.is_empty() {
        return Err("uuids 不能为空".into());
    }

    let key = batch_cache_key(&cleaned);
    let cell = {
        let mut map = inflight_store().lock().unwrap();
        map.entry(key.clone())
            .or_insert_with(|| Arc::new(OnceCell::new()))
            .clone()
    };

    let outcome = cell
        .get_or_init(|| async move {
            let chunks: Vec<_> = cleaned.chunks(BATCH_CONCURRENCY).collect();
            let mut out = serde_json::Map::new();
            let mut ok_count = 0usize;

            for chunk in chunks {
                let futures = chunk.iter().map(|uuid| {
                    let uuid = uuid.clone();
                    async move {
                        let result = fetch_player_home_http(&uuid).await;
                        (uuid, result)
                    }
                });
                let results = join_all(futures).await;
                for (uuid, result) in results {
                    match result {
                        Ok(body) => {
                            out.insert(uuid, body);
                            ok_count += 1;
                        }
                        Err(err) => {
                            eprintln!("[5e player/home] {uuid}: {err}");
                        }
                    }
                }
            }

            if ok_count == 0 {
                return Err(
                    "GATE_SIGNATURE_FAILED: player/home 批量拉取失败（签名或网关异常，请反馈开发者）".into(),
                );
            }

            Ok(json!(out))
        })
        .await;

    if outcome.is_err() {
        inflight_store().lock().unwrap().remove(&key);
    }

    match outcome {
        Ok(value) => Ok(value.clone()),
        Err(err) => Err(err.clone()),
    }
}
