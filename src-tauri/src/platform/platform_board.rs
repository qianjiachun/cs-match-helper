use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

const DEFAULT_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())
}

fn apply_headers(
    builder: reqwest::RequestBuilder,
    headers: Option<HashMap<String, String>>,
) -> reqwest::RequestBuilder {
    let mut request = builder.header("User-Agent", DEFAULT_USER_AGENT);
    if let Some(map) = headers {
        for (key, value) in map {
            if !key.trim().is_empty() && !value.trim().is_empty() {
                request = request.header(key, value);
            }
        }
    }
    request
}

#[tauri::command]
pub async fn fetch_http_json(
    url: String,
    headers: Option<HashMap<String, String>>,
) -> Result<Value, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url 不能为空".into());
    }
    if !trimmed.starts_with("https://") {
        return Err("仅支持 HTTPS 请求".into());
    }

    let client = http_client()?;
    let resp = apply_headers(client.get(trimmed), headers)
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.json::<Value>()
        .await
        .map_err(|e| format!("解析 JSON 失败: {e}"))
}

#[tauri::command]
pub async fn fetch_proxied_image(
    url: String,
    referer: Option<String>,
) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url 不能为空".into());
    }
    if !trimmed.starts_with("https://") {
        return Err("仅支持 HTTPS 图片".into());
    }

    let client = http_client()?;
    let mut headers = HashMap::new();
    if let Some(value) = referer {
        let referer = value.trim();
        if !referer.is_empty() {
            headers.insert("Referer".to_string(), referer.to_string());
        }
    }

    let resp = apply_headers(client.get(trimmed), Some(headers))
        .send()
        .await
        .map_err(|e| format!("图片请求失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("图片 HTTP {}", resp.status()));
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/jpeg")
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .trim()
        .to_string();

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取图片失败: {e}"))?;

    if bytes.is_empty() {
        return Err("图片内容为空".into());
    }

    Ok(format!("data:{content_type};base64,{}", STANDARD.encode(bytes)))
}
