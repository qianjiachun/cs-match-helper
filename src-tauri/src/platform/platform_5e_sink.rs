use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct P5eHttpEvent {
    pub kind: &'static str,
    pub url: String,
    pub method: String,
    pub captured_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_body: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_body: Option<Value>,
    /// gate.5eplay.com 调试采集；不参与匹配聚合
    #[serde(default, skip_serializing_if = "is_false")]
    pub gate_debug: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_error: Option<String>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

const WHITELIST: &[&str] = &[
    "/api/user/info",
    "/player/elo/info/batch",
    "/player/map-ext/batch",
    "/api/data/match/",
    "/api/match/matching/batch",
];

const MATCHING_BATCH_PATH: &str = "/api/match/matching/batch";
const GATE_DEBUG_HOST: &str = "gate.5eplay.com";

pub fn is_whitelisted_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    WHITELIST.iter().any(|p| lower.contains(p))
}

pub fn is_matching_batch_url(url: &str) -> bool {
    url.to_lowercase().contains(MATCHING_BATCH_PATH)
}

pub fn is_gate_debug_url(url: &str) -> bool {
    url.to_lowercase().contains(GATE_DEBUG_HOST)
}

pub fn should_capture_url(url: &str, gate_debug_mode: bool) -> bool {
    is_whitelisted_url(url) || (gate_debug_mode && is_gate_debug_url(url))
}

/// matching/batch 只保留补图所需请求字段，丢弃巨大响应体。
fn minimize_matching_batch_bodies(
    request_body: Option<Value>,
    _response_body: Option<Value>,
) -> (Option<Value>, Option<Value>) {
    let minimized_req = request_body.and_then(|body| {
        let obj = body.as_object()?;
        let game_map = obj.get("game_map").cloned();
        let t1 = obj.get("t1_uuids").cloned();
        let t2 = obj.get("t2_uuids").cloned();
        let mut slim = serde_json::Map::new();
        if let Some(v) = game_map {
            slim.insert("game_map".into(), v);
        }
        if let Some(v) = t1 {
            slim.insert("t1_uuids".into(), v);
        }
        if let Some(v) = t2 {
            slim.insert("t2_uuids".into(), v);
        }
        if slim.is_empty() {
            None
        } else {
            Some(Value::Object(slim))
        }
    });
    (minimized_req, None)
}

pub fn build_http_event_with_mode(
    url: String,
    method: String,
    request_body: Option<Value>,
    response_body: Option<Value>,
    gate_debug_mode: bool,
    capture_error: Option<String>,
) -> Option<P5eHttpEvent> {
    if !should_capture_url(&url, gate_debug_mode) {
        return None;
    }
    let gate_debug = gate_debug_mode && is_gate_debug_url(&url) && !is_whitelisted_url(&url);
    let (request_body, response_body) = if is_matching_batch_url(&url) {
        minimize_matching_batch_bodies(request_body, response_body)
    } else {
        (request_body, response_body)
    };
    Some(P5eHttpEvent {
        kind: "http",
        url,
        method,
        captured_at: chrono_lite_now(),
        request_body,
        response_body,
        gate_debug,
        capture_error,
    })
}

fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{ms}")
}

pub fn parse_json_body(text: &str) -> Option<Value> {
    serde_json::from_str(text).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn matching_batch_is_whitelisted() {
        let url = "https://gate.5eplay.com/cranenew/http/api/match/matching/batch";
        assert!(is_whitelisted_url(url));
        assert!(is_matching_batch_url(url));
        assert!(should_capture_url(url, false));
    }

    #[test]
    fn matching_batch_event_keeps_map_fields_and_drops_response() {
        let url = "https://gate.5eplay.com/cranenew/http/api/match/matching/batch".to_string();
        let request = json!({
            "game_map": "de_dust2",
            "t1_uuids": ["a", "b", "c", "d", "e"],
            "t2_uuids": ["f", "g", "h", "i", "j"],
            "extra": "ignore-me"
        });
        let response = json!({ "code": 0, "data": { "huge": true } });
        let event = build_http_event_with_mode(
            url,
            "POST".into(),
            Some(request),
            Some(response),
            false,
            None,
        )
        .expect("event");

        assert_eq!(event.gate_debug, false);
        assert!(event.response_body.is_none());
        let body = event.request_body.expect("request");
        assert_eq!(body.get("game_map").and_then(|v| v.as_str()), Some("de_dust2"));
        assert!(body.get("t1_uuids").is_some());
        assert!(body.get("t2_uuids").is_some());
        assert!(body.get("extra").is_none());
    }
}
