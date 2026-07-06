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
];

const GATE_DEBUG_HOST: &str = "gate.5eplay.com";

pub fn is_whitelisted_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    WHITELIST.iter().any(|p| lower.contains(p))
}

pub fn is_gate_debug_url(url: &str) -> bool {
    url.to_lowercase().contains(GATE_DEBUG_HOST)
}

pub fn should_capture_url(url: &str, gate_debug_mode: bool) -> bool {
    is_whitelisted_url(url) || (gate_debug_mode && is_gate_debug_url(url))
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
