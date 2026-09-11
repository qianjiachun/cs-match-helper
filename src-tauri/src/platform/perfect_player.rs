use super::{
    perfect_api::{
        build_aggregated_player_value, extract_season, fetch_aggregated_player, fetch_overview,
        fetch_season_list, fetch_season_stats, latest_season, redact_sensitive,
        scoped_partial_error, CLIENT_REFERER, OVERVIEW_URL, SEASON_LIST_URL, SEASON_STATS_URL,
    },
    perfect_auth::{current_credential, invalidate_if_needed, PerfectAuthRuntime},
};
use reqwest::{
    header::{HeaderMap, HeaderValue, ACCEPT, CONNECTION, CONTENT_TYPE},
    Client, Response,
};
use serde_json::{json, Value};
use std::{
    future::Future,
    sync::OnceLock,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
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

async fn fetch_board_search(steam_id: &str) -> Result<Value, String> {
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

async fn timed<F>(future: F) -> (Result<Value, String>, u64)
where
    F: Future<Output = Result<Value, String>>,
{
    let started = Instant::now();
    let result = future.await;
    (result, started.elapsed().as_millis() as u64)
}

fn debug_endpoint(
    id: &str,
    method: &str,
    url: &str,
    request: Value,
    result: &Result<Value, String>,
    duration_ms: u64,
) -> Value {
    match result {
        Ok(response) => json!({
            "id": id,
            "method": method,
            "url": url,
            "status": "success",
            "durationMs": duration_ms,
            "request": request,
            "response": response,
        }),
        Err(error) => json!({
            "id": id,
            "method": method,
            "url": url,
            "status": "error",
            "durationMs": duration_ms,
            "request": request,
            "error": redact_sensitive(error),
        }),
    }
}

fn skipped_debug_endpoint(
    id: &str,
    method: &str,
    url: &str,
    request: Value,
    reason: &str,
) -> Value {
    json!({
        "id": id,
        "method": method,
        "url": url,
        "status": "skipped",
        "durationMs": 0,
        "request": request,
        "error": reason,
    })
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
pub async fn debug_perfect_player_apis(
    steam_id: Option<String>,
    state: tauri::State<'_, PerfectAuthRuntime>,
) -> Result<Value, String> {
    let credential = current_credential(&state)?;
    let requested = steam_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(credential.uid.as_str());
    let target = validate_steam_id(requested)?.to_string();

    let common_headers = json!({
        "Referer": CLIENT_REFERER,
        "PwaSteamId": credential.uid,
    });
    let overview_request = json!({
        "headers": common_headers,
        "query": {
            "access_token": "[REDACTED]",
            "uid": target,
            "recent_ladder_match": "1"
        },
    });
    let season_list_request = json!({
        "headers": common_headers,
        "query": {
            "access_token": "[REDACTED]",
            "uid": target,
            "ignore_season": ""
        },
    });
    let board_request = json!({
        "body": {
            "text": target,
            "searchType": "ALL",
            "circleId": "0",
            "page": 1,
            "pageSize": 20,
            "gameTypeStr": "2",
            "platform": "android",
            "sortType": 1
        },
        "authenticated": false,
    });

    let (overview, overview_ms) = timed(fetch_overview(&credential, &target)).await;
    let (season_list, season_list_ms) = timed(fetch_season_list(&credential, &target)).await;

    let overview_season = overview
        .as_ref()
        .ok()
        .and_then(extract_season)
        .map(str::to_string);
    let list_season = season_list.as_ref().ok().and_then(latest_season);
    let (season, season_source) = if let Some(season) = overview_season {
        (Some(season), Some("overview"))
    } else if let Some(season) = list_season {
        (Some(season), Some("season-list"))
    } else {
        (None, None)
    };

    let season_stats_request = json!({
        "headers": common_headers,
        "form": {
            "access_token": "[REDACTED]",
            "uid": target,
            "current_season": season,
            "need_max_score": "1",
            "season": season,
            "stats_list": "ladder,map,weapon,individual_peak",
        },
    });
    let season_stats = if let Some(season) = season.as_deref() {
        Some(timed(fetch_season_stats(&credential, &target, season)).await)
    } else {
        None
    };
    let (board, board_ms) = timed(fetch_board_search(&target)).await;

    let mut endpoints = vec![
        debug_endpoint(
            "overview",
            "GET",
            OVERVIEW_URL,
            overview_request,
            &overview,
            overview_ms,
        ),
        debug_endpoint(
            "season-list",
            "GET",
            SEASON_LIST_URL,
            season_list_request,
            &season_list,
            season_list_ms,
        ),
    ];
    endpoints.push(match season_stats.as_ref() {
        Some((result, duration_ms)) => debug_endpoint(
            "season-stats",
            "POST",
            SEASON_STATS_URL,
            season_stats_request,
            result,
            *duration_ms,
        ),
        None => skipped_debug_endpoint(
            "season-stats",
            "POST",
            SEASON_STATS_URL,
            season_stats_request,
            "No season identifier was available",
        ),
    });
    endpoints.push(debug_endpoint(
        "board-search",
        "POST",
        SEARCH_URL,
        board_request,
        &board,
        board_ms,
    ));

    let partial_failure = if season.is_none() {
        let detail = season_list
            .as_ref()
            .err()
            .map(String::as_str)
            .unwrap_or("no current season in overview or season-list response");
        Some(scoped_partial_error("season-resolution", detail))
    } else {
        season_stats
            .as_ref()
            .and_then(|(result, _)| result.as_ref().err())
            .map(|error| scoped_partial_error("season-stats", error))
    };
    let aggregate = overview.as_ref().ok().map(|value| {
        build_aggregated_player_value(
            &target,
            value.clone(),
            season.as_deref(),
            season_stats
                .as_ref()
                .and_then(|(result, _)| result.as_ref().ok())
                .cloned(),
            partial_failure,
        )
    });

    let generated_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    Ok(json!({
        "generatedAtMs": generated_at_ms,
        "credentialUid": credential.uid,
        "targetSteamId": target,
        "season": season,
        "seasonSource": season_source,
        "seasonCandidates": {
            "overview": overview.as_ref().ok().and_then(extract_season),
            "seasonList": season_list.as_ref().ok().and_then(latest_season),
        },
        "cacheBypassed": true,
        "endpoints": endpoints,
        "aggregate": aggregate,
    }))
}

#[tauri::command]
pub async fn search_perfect_board_user(steam_id: String) -> Result<Value, String> {
    let steam_id = validate_steam_id(&steam_id)?;
    fetch_board_search(steam_id).await
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
