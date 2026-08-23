use super::{
    perfect_credentials::PerfectCredential,
    perfect_crypto::{decrypt_envelope, PerfectDecryptErrorKind},
};
use reqwest::Client;
use serde_json::{json, Map, Value};
use std::{collections::HashMap, sync::OnceLock, time::Duration};
use tokio::sync::Mutex;

const OVERVIEW_URL: &str = "https://pwaweblogin.wmpvp.com/user-info/overview";
const SEASON_STATS_URL: &str = "https://pwaweblogin.wmpvp.com/user-info/season-stats";
const SEASON_LIST_URL: &str = "https://pwaweblogin.wmpvp.com/user-info/season-ladder-score-list";
const CLIENT_REFERER: &str = "https://client.wmpvp.com";
const CACHE_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Clone)]
struct CacheEntry {
    inserted_at: std::time::Instant,
    value: Value,
}

static PLAYER_CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    PLAYER_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("CSMatchHelper/3 PerfectWebLogin")
        .build()
        .map_err(|error| format!("PERFECT_NETWORK: client initialization failed: {error}"))
}

pub fn redact_sensitive(input: &str) -> String {
    let mut output = input.to_string();
    for field in ["access_token", "token", "phoneToken"] {
        for marker in [format!("{field}="), format!("\"{field}\":\"")] {
            let mut offset = 0;
            while let Some(found) = output[offset..].find(&marker) {
                let start = offset + found + marker.len();
                let end = output[start..]
                    .find(|character: char| {
                        matches!(character, '&' | ' ' | '\"' | '\'' | '}' | ',')
                    })
                    .map(|index| start + index)
                    .unwrap_or(output.len());
                output.replace_range(start..end, "[REDACTED]");
                offset = start + "[REDACTED]".len();
            }
        }
    }

    let chars: Vec<char> = output.chars().collect();
    let mut rebuilt = String::with_capacity(output.len());
    let mut index = 0;
    while index < chars.len() {
        if index + 40 <= chars.len()
            && chars[index..index + 40]
                .iter()
                .all(|character| character.is_ascii_alphanumeric())
        {
            rebuilt.push_str("[REDACTED_TOKEN]");
            index += 40;
        } else {
            rebuilt.push(chars[index]);
            index += 1;
        }
    }
    rebuilt
}

fn scoped_partial_error(stage: &str, error: &str) -> String {
    if is_auth_invalid(error) {
        error.to_string()
    } else {
        format!("PERFECT_PARTIAL:{stage}: {}", redact_sensitive(error))
    }
}

async fn decode_response(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    if !status.is_success() {
        return Err(format!("PERFECT_HTTP: {}", status.as_u16()));
    }
    let envelope = response
        .json::<Value>()
        .await
        .map_err(|error| format!("PERFECT_PROTOCOL: invalid JSON response: {error}"))?;
    decode_api_envelope(envelope)
}

fn decode_api_envelope(envelope: Value) -> Result<Value, String> {
    if let Some(code) = envelope.get("code").and_then(Value::as_i64) {
        if code != 0 {
            let message = envelope.get("msg").and_then(Value::as_str).unwrap_or("");
            let prefix = if matches!(code, 1002 | 1033) {
                "PERFECT_AUTH_INVALID"
            } else {
                "PERFECT_API"
            };
            return Err(format!("{prefix}:{code}: {message}"));
        }
    }

    let encrypted = envelope
        .get("data")
        .and_then(Value::as_object)
        .or_else(|| envelope.as_object())
        .is_some_and(|data| data.contains_key("e"));
    if !encrypted {
        return envelope
            .get("data")
            .cloned()
            .ok_or_else(|| "PERFECT_PROTOCOL: successful response has no data field".to_string());
    }

    decrypt_envelope(&envelope).map_err(|error| {
        let category = match error.kind {
            PerfectDecryptErrorKind::Envelope => "envelope",
            PerfectDecryptErrorKind::Base64 => "base64",
            PerfectDecryptErrorKind::KeyLength => "key_length",
            PerfectDecryptErrorKind::Padding => "padding",
            PerfectDecryptErrorKind::Utf8 => "utf8",
            PerfectDecryptErrorKind::Json => "json",
        };
        format!("PERFECT_COMPATIBILITY:{category}: {}", error.message)
    })
}

pub async fn fetch_overview(credential: &PerfectCredential, uid: &str) -> Result<Value, String> {
    let response = client()?
        .get(OVERVIEW_URL)
        .header("Referer", CLIENT_REFERER)
        .header("PwaSteamId", credential.uid.as_str())
        .query(&[
            ("access_token", credential.access_token.as_str()),
            ("recent_ladder_match", "1"),
            ("uid", uid),
        ])
        .send()
        .await
        .map_err(|error| format!("PERFECT_NETWORK: {}", redact_sensitive(&error.to_string())))?;
    decode_response(response).await
}

pub async fn fetch_season_stats(
    credential: &PerfectCredential,
    uid: &str,
    season: &str,
) -> Result<Value, String> {
    let response = client()?
        .post(SEASON_STATS_URL)
        .header("Referer", CLIENT_REFERER)
        .header("PwaSteamId", credential.uid.as_str())
        .form(&[
            ("access_token", credential.access_token.as_str()),
            ("current_season", season),
            ("need_max_score", "1"),
            ("season", season),
            ("stats_list", "ladder,map,weapon,individual_peak"),
            ("uid", uid),
        ])
        .send()
        .await
        .map_err(|error| format!("PERFECT_NETWORK: {}", redact_sensitive(&error.to_string())))?;
    decode_response(response).await
}

async fn fetch_season_list(credential: &PerfectCredential, uid: &str) -> Result<Value, String> {
    let response = client()?
        .get(SEASON_LIST_URL)
        .header("Referer", CLIENT_REFERER)
        .header("PwaSteamId", credential.uid.as_str())
        .query(&[
            ("access_token", credential.access_token.as_str()),
            ("ignore_season", ""),
            ("uid", uid),
        ])
        .send()
        .await
        .map_err(|error| format!("PERFECT_NETWORK: {}", redact_sensitive(&error.to_string())))?;
    decode_response(response).await
}

fn find_string_by_keys<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    match value {
        Value::Object(object) => {
            for key in keys {
                if let Some(value) = object.get(*key).and_then(Value::as_str) {
                    if !value.is_empty() {
                        return Some(value);
                    }
                }
            }
            object
                .values()
                .find_map(|value| find_string_by_keys(value, keys))
        }
        Value::Array(values) => values
            .iter()
            .find_map(|value| find_string_by_keys(value, keys)),
        _ => None,
    }
}

pub fn extract_uid(value: &Value) -> Option<&str> {
    find_string_by_keys(
        value,
        &["uid", "steamId", "steam_id", "steamId64", "steam_id_64"],
    )
}

pub fn extract_season(value: &Value) -> Option<&str> {
    find_string_by_keys(
        value,
        &[
            "current_season",
            "currentSeason",
            "season",
            "seasonId",
            "season_id",
        ],
    )
}

fn latest_season(value: &Value) -> Option<String> {
    fn visit(value: &Value, latest: &mut Option<(u32, String)>) {
        match value {
            Value::String(value) => {
                let Some(number) = value
                    .strip_prefix('S')
                    .or_else(|| value.strip_prefix('s'))
                    .and_then(|value| value.parse::<u32>().ok())
                else {
                    return;
                };
                if latest
                    .as_ref()
                    .is_none_or(|(current, _)| number > *current)
                {
                    *latest = Some((number, format!("S{number}")));
                }
            }
            Value::Array(values) => {
                for value in values {
                    visit(value, latest);
                }
            }
            Value::Object(values) => {
                for value in values.values() {
                    visit(value, latest);
                }
            }
            _ => {}
        }
    }

    let mut latest = None;
    visit(value, &mut latest);
    latest.map(|(_, season)| season)
}

pub fn extract_identity(value: &Value) -> (Option<String>, Option<String>) {
    let identity = value
        .get("user")
        .or_else(|| value.pointer("/data/user"))
        .unwrap_or(value);
    (
        ["name", "nickname", "nickName", "defaultNickname"]
            .iter()
            .find_map(|key| identity.get(*key).and_then(Value::as_str))
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        [
            "avatar",
            "avatar_origin",
            "avatarUrl",
            "avatar_url",
            "defaultAvatar",
        ]
        .iter()
        .find_map(|key| identity.get(*key).and_then(Value::as_str))
        .filter(|value| !value.is_empty())
        .map(str::to_string),
    )
}

fn payload_object(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(mut object) => match object.remove("data") {
            Some(Value::Object(data)) => data,
            _ => object,
        },
        other => Map::from_iter([("overview".to_string(), other)]),
    }
}

pub async fn fetch_aggregated_player(
    credential: &PerfectCredential,
    uid: &str,
) -> Result<Value, String> {
    let cached = {
        let cache = cache().lock().await;
        cache
            .get(uid)
            .filter(|entry| entry.inserted_at.elapsed() < CACHE_TTL)
            .cloned()
    };
    if let Some(entry) = cached {
        return Ok(entry.value);
    }

    let overview = fetch_overview(credential, uid).await?;
    let season = if let Some(season) = extract_season(&overview) {
        Ok(season.to_string())
    } else {
        fetch_season_list(credential, uid)
            .await
            .map_err(|error| scoped_partial_error("season-list", &error))
            .and_then(|value| {
                latest_season(&value).ok_or_else(|| {
                    "PERFECT_PARTIAL:season-list: no current season in response".to_string()
                })
            })
    };
    let mut merged = payload_object(overview);
    merged
        .entry("steamId")
        .or_insert_with(|| Value::String(uid.to_string()));

    let mut partial_failure = None;
    match season {
        Ok(season) => {
            merged
                .entry("seasonId")
                .or_insert_with(|| Value::String(season.clone()));
            match fetch_season_stats(credential, uid, &season).await {
                Ok(stats) => {
                    for (key, value) in payload_object(stats) {
                        merged.insert(key, value);
                    }
                }
                Err(error) if error.starts_with("PERFECT_AUTH_INVALID") => return Err(error),
                Err(error) => partial_failure = Some(scoped_partial_error("season-stats", &error)),
            }
        }
        Err(error) if error.starts_with("PERFECT_AUTH_INVALID") => return Err(error),
        Err(error) => partial_failure = Some(redact_sensitive(&error)),
    }
    let cacheable = partial_failure.is_none();
    if let Some(error) = partial_failure {
        merged.insert("partialFailure".into(), Value::String(error));
    }
    let result = json!({"statusCode":0,"data":merged});
    if cacheable {
        cache().lock().await.insert(
            uid.to_string(),
            CacheEntry {
                inserted_at: std::time::Instant::now(),
                value: result.clone(),
            },
        );
    }
    Ok(result)
}

pub async fn clear_player_cache() {
    cache().lock().await.clear();
}

pub fn is_network_error(error: &str) -> bool {
    error.starts_with("PERFECT_NETWORK") || error.starts_with("PERFECT_HTTP: 5")
}

pub fn is_auth_invalid(error: &str) -> bool {
    error.starts_with("PERFECT_AUTH_INVALID")
}

#[cfg(test)]
mod tests {
    use super::{
        decode_api_envelope, extract_identity, extract_season, extract_uid, latest_season,
        redact_sensitive, scoped_partial_error,
    };
    use serde_json::json;

    #[test]
    fn extracts_nested_identity_and_season() {
        let value =
            json!({"user":{"steamId":"76561199667272550"},"ladder":{"current_season":"S23"}});
        assert_eq!(extract_uid(&value), Some("76561199667272550"));
        assert_eq!(extract_season(&value), Some("S23"));
    }

    #[test]
    fn chooses_the_highest_captured_season_identifier() {
        let value = json!({
            "current": { "season": "S24" },
            "history": [{ "season": "S22" }, { "season": "s23" }],
            "unrelated": "2026S2-heatwave"
        });
        assert_eq!(latest_season(&value).as_deref(), Some("S24"));
    }

    #[test]
    fn accepts_plain_success_data_from_the_season_list_endpoint() {
        let value = decode_api_envelope(json!({
            "code": 0,
            "data": {
                "list": [
                    { "season": "S22" },
                    { "season": "S24" }
                ]
            },
            "msg": ""
        }))
        .expect("plain season list");

        assert_eq!(latest_season(&value).as_deref(), Some("S24"));
    }

    #[test]
    fn plain_api_errors_keep_the_existing_auth_classification() {
        assert_eq!(
            decode_api_envelope(json!({ "code": 1033, "data": null, "msg": "expired" }))
                .unwrap_err(),
            "PERFECT_AUTH_INVALID:1033: expired"
        );
    }

    #[test]
    fn identity_comes_from_user_instead_of_guild_or_team() {
        let value = json!({
            "guild": { "name": "guild name" },
            "team": { "name": "team name" },
            "user": {
                "name": "actual user",
                "avatar": "https://img.wmpvp.com/avatar.png"
            }
        });
        assert_eq!(
            extract_identity(&value),
            (
                Some("actual user".to_string()),
                Some("https://img.wmpvp.com/avatar.png".to_string())
            )
        );
    }

    #[test]
    fn redacts_query_callback_and_bare_tokens() {
        let token = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let raw = format!("?access_token={token}&uid=1 token={token} phoneToken=abc");
        let redacted = redact_sensitive(&raw);
        assert!(!redacted.contains(token));
        assert!(!redacted.contains("phoneToken=abc"));
    }

    #[test]
    fn partial_errors_identify_the_failed_stage_without_hiding_auth_expiry() {
        assert_eq!(
            scoped_partial_error("season-list", "PERFECT_NETWORK: timeout"),
            "PERFECT_PARTIAL:season-list: PERFECT_NETWORK: timeout"
        );
        assert_eq!(
            scoped_partial_error("season-stats", "PERFECT_AUTH_INVALID:1033: expired"),
            "PERFECT_AUTH_INVALID:1033: expired"
        );
    }
}
