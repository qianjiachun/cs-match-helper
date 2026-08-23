use super::{
    perfect_api::fetch_aggregated_player,
    perfect_auth::{current_credential, invalidate_if_needed, PerfectAuthRuntime},
};
use reqwest::{
    header::{HeaderMap, HeaderValue, ACCEPT, CONNECTION, CONTENT_TYPE},
    Client, Response,
};
use serde_json::{json, Value};
use std::{
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const SEARCH_URL: &str = "https://gwapi.pwesports.cn/acty/api/v1/search";
const APP_VERSION: &str = "4.0.9.215";
const GAME_TYPE: &str = "2";
const APP_THEME: &str = "0";
const SEARCH_PLATFORM: &str = "android";

static DEVICE_ID: OnceLock<String> = OnceLock::new();

fn validate_steam_id(steam_id: &str) -> Result<&str, String> {
    let value = steam_id.trim();
    if value.len() == 17 && value.bytes().all(|byte| byte.is_ascii_digit()) {
        Ok(value)
    } else {
        Err("SteamID64 must contain exactly 17 digits".to_string())
    }
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("okhttp/4.11.0")
        .build()
        .map_err(|error| error.to_string())
}

fn device_id() -> &'static str {
    DEVICE_ID.get_or_init(|| {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let uuid = Uuid::new_v4();
        let suffix: String = uuid
            .as_bytes()
            .iter()
            .take(11)
            .enumerate()
            .map(|(index, byte)| alphabet[(*byte as usize + index * 17) % alphabet.len()] as char)
            .collect();
        format!("vGPSv{timestamp}{suffix}")
    })
}

fn mobile_headers(platform: &'static str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/json;charset=UTF-8"),
    );
    headers.insert(ACCEPT, HeaderValue::from_static("*/*"));
    headers.insert(CONNECTION, HeaderValue::from_static("Keep-Alive"));
    headers.insert("appversion", HeaderValue::from_static(APP_VERSION));
    headers.insert("gametype", HeaderValue::from_static(GAME_TYPE));
    headers.insert("gametypestr", HeaderValue::from_static(GAME_TYPE));
    headers.insert("platform", HeaderValue::from_static(platform));
    headers.insert("apptheme", HeaderValue::from_static(APP_THEME));
    headers.insert(
        "device",
        HeaderValue::from_str(device_id()).map_err(|error| error.to_string())?,
    );
    Ok(headers)
}

async fn send_with_retry(
    client: &Client,
    url: &str,
    body: &Value,
    platform: &'static str,
) -> Result<Response, String> {
    let headers = mobile_headers(platform)?;
    let mut last_error = String::new();
    for attempt in 0..2 {
        match client
            .post(url)
            .headers(headers.clone())
            .json(body)
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => return Ok(response),
            Ok(response) if response.status().is_server_error() => {
                last_error = format!("HTTP {}", response.status());
                if attempt == 1 {
                    return Err(last_error);
                }
            }
            Ok(response) => return Err(format!("HTTP {}", response.status())),
            Err(error) => {
                last_error = format!("request failed: {error}");
                if attempt == 1 {
                    return Err(last_error);
                }
            }
        }
    }
    Err(last_error)
}

async fn post_json(url: &str, body: Value, platform: &'static str) -> Result<Value, String> {
    let client = client()?;
    send_with_retry(&client, url, &body, platform)
        .await?
        .json::<Value>()
        .await
        .map_err(|error| format!("invalid JSON response: {error}"))
}

#[tauri::command]
pub async fn fetch_perfect_player_stats(
    app: tauri::AppHandle,
    steam_id: String,
    state: tauri::State<'_, PerfectAuthRuntime>,
) -> Result<Value, String> {
    let steam_id = validate_steam_id(&steam_id)?;
    let credential = current_credential(&state)?;
    match fetch_aggregated_player(&credential, steam_id).await {
        Ok(value) => Ok(value),
        Err(error) => {
            invalidate_if_needed(&app, &state, &error).await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn search_perfect_board_user(steam_id: String) -> Result<Value, String> {
    let steam_id = validate_steam_id(&steam_id)?;
    post_json(
        SEARCH_URL,
        json!({
            "text": steam_id,
            "searchType": "ALL",
            "circleId": "0",
            "page": 1,
            "pageSize": 20,
            "gameTypeStr": "2",
            "platform": "android",
            "sortType": 1
        }),
        SEARCH_PLATFORM,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::{device_id, mobile_headers, validate_steam_id, SEARCH_PLATFORM};

    #[test]
    fn validates_steam_id64_without_numeric_conversion() {
        assert_eq!(
            validate_steam_id("76561198104088654"),
            Ok("76561198104088654")
        );
        assert!(validate_steam_id("7656119810408865").is_err());
        assert!(validate_steam_id("7656119810408865x").is_err());
    }

    #[test]
    fn builds_realistic_mobile_headers_without_captured_credentials() {
        let search = mobile_headers(SEARCH_PLATFORM).expect("search headers");

        assert_eq!(search.get("platform").unwrap(), "android");
        assert!(device_id().starts_with("vGPSv"));

        for sensitive_header in ["token", "accesstoken", "tdsign", "t"] {
            assert!(search.get(sensitive_header).is_none());
        }
    }
}
