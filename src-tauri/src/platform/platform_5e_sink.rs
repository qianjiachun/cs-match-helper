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
}

const WHITELIST: &[&str] = &[
    "/api/user/info",
    "/player/elo/info/batch",
    "/player/map-ext/batch",
    "/api/data/match/",
];

pub fn is_whitelisted_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    WHITELIST.iter().any(|p| lower.contains(p))
}

pub fn build_http_event(
    url: String,
    method: String,
    request_body: Option<Value>,
    response_body: Option<Value>,
) -> Option<P5eHttpEvent> {
    if !is_whitelisted_url(&url) {
        return None;
    }
    Some(P5eHttpEvent {
        kind: "http",
        url,
        method,
        captured_at: chrono_lite_now(),
        request_body,
        response_body,
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
