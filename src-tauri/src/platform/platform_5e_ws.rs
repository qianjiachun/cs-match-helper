use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use serde_json::Value;

pub const COMET_ARENA_HOST: &str = "comet-client-arena.5eplay.com";
pub const COMET_TEST_HOST: &str = "comet-client.win-testing.5eplaycdn.com";
pub const MAX_WS_DISPLAY_BYTES: usize = 64 * 1024;

const CTX_KEYWORDS: &[&str] = &[
    "game_ctx",
    "room_ctx",
    "game_ctx_update",
    "room_ctx_update",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct P5eWsOpenEvent {
    pub kind: &'static str,
    pub request_id: String,
    pub url: String,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct P5eWsCloseEvent {
    pub kind: &'static str,
    pub request_id: String,
    pub url: String,
    pub captured_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct P5eWsFrameEvent {
    pub kind: &'static str,
    pub request_id: String,
    pub url: String,
    pub captured_at: String,
    pub opcode: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload_raw: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decoded_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decoded_json: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inner_base64_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inner_json: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_error: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub truncated: bool,
}

fn is_false(value: &bool) -> bool {
    !*value
}

pub fn is_comet_ws_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains(COMET_ARENA_HOST) || lower.contains(COMET_TEST_HOST)
}

pub fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{ms}")
}

pub fn build_ws_open_event(request_id: String, url: String) -> P5eWsOpenEvent {
    P5eWsOpenEvent {
        kind: "ws_open",
        request_id,
        url,
        captured_at: chrono_lite_now(),
    }
}

pub fn build_ws_close_event(request_id: String, url: String) -> P5eWsCloseEvent {
    P5eWsCloseEvent {
        kind: "ws_close",
        request_id,
        url,
        captured_at: chrono_lite_now(),
    }
}

pub fn decode_ws_frame(
    request_id: String,
    url: String,
    opcode: u8,
    payload_data: &str,
) -> P5eWsFrameEvent {
    let mut parse_error: Option<String> = None;
    let mut truncated = false;

    let payload_raw = if payload_data.len() > MAX_WS_DISPLAY_BYTES {
        truncated = true;
        Some(format!(
            "{}...[truncated raw {}B]",
            &payload_data[..MAX_WS_DISPLAY_BYTES.min(payload_data.len())],
            payload_data.len()
        ))
    } else {
        Some(payload_data.to_string())
    };

    let bytes = match decode_payload_bytes(opcode, payload_data) {
        Ok(b) => b,
        Err(err) => {
            parse_error = Some(err);
            return P5eWsFrameEvent {
                kind: "ws_frame",
                request_id,
                url,
                captured_at: chrono_lite_now(),
                opcode,
                payload_raw,
                decoded_text: None,
                decoded_json: None,
                inner_base64_text: None,
                inner_json: None,
                event_hint: None,
                parse_error,
                truncated,
            };
        }
    };

    let (decoded_text, decoded_json, inner_base64_text, inner_json, event_hint) =
        analyze_decoded_bytes(&bytes, &mut truncated);

    P5eWsFrameEvent {
        kind: "ws_frame",
        request_id,
        url,
        captured_at: chrono_lite_now(),
        opcode,
        payload_raw,
        decoded_text,
        decoded_json,
        inner_base64_text,
        inner_json,
        event_hint,
        parse_error,
        truncated,
    }
}

fn decode_payload_bytes(opcode: u8, payload_data: &str) -> Result<Vec<u8>, String> {
    match opcode {
        1 => Ok(payload_data.as_bytes().to_vec()),
        2 => BASE64
            .decode(payload_data.trim())
            .map_err(|e| format!("base64 decode failed: {e}")),
        8 | 9 => Err(format!("control frame opcode={opcode}")),
        _ => Err(format!("unsupported opcode={opcode}")),
    }
}

/// Locate the first balanced JSON object/array in a byte slice (Comet frames often have a binary header).
pub fn find_json_slice(bytes: &[u8]) -> Option<&[u8]> {
    let start = bytes.iter().position(|b| *b == b'{' || *b == b'[')?;
    let slice = &bytes[start..];
    let open = slice[0];
    let close = if open == b'{' { b'}' } else { b']' };
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;

    for (i, &byte) in slice.iter().enumerate() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if byte == b'\\' {
                escape = true;
                continue;
            }
            if byte == b'"' {
                in_string = false;
            }
            continue;
        }

        match byte {
            b'"' => in_string = true,
            b if b == open => depth += 1,
            b if b == close => {
                depth -= 1;
                if depth == 0 {
                    return Some(&slice[..=i]);
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_comet_json(bytes: &[u8]) -> Option<Value> {
    let json_slice = find_json_slice(bytes)?;
    serde_json::from_slice(json_slice).ok()
}

fn analyze_decoded_bytes(
    bytes: &[u8],
    truncated: &mut bool,
) -> (
    Option<String>,
    Option<Value>,
    Option<String>,
    Option<Value>,
    Option<String>,
) {
    let raw_text = String::from_utf8_lossy(bytes);
    let mut decoded_json = parse_comet_json(bytes);
    let mut json_text = decoded_json
        .as_ref()
        .map(|v| v.to_string())
        .or_else(|| {
            find_json_slice(bytes).map(|s| String::from_utf8_lossy(s).into_owned())
        });

    let mut inner_from_outer: Option<String> = None;
    let mut inner_json_from_outer: Option<Value> = None;

    if decoded_json.is_none() {
        let trimmed = raw_text.trim();
        if looks_like_base64(trimmed) {
            if let Ok(inner_bytes) = BASE64.decode(trimmed) {
                let inner_text = String::from_utf8_lossy(&inner_bytes);
                inner_from_outer = cap_display_string(inner_text.as_ref(), truncated);
                decoded_json = parse_comet_json(&inner_bytes);
                inner_json_from_outer = decoded_json.clone();
                json_text = decoded_json
                    .as_ref()
                    .map(|v| v.to_string())
                    .or_else(|| {
                        find_json_slice(&inner_bytes)
                            .map(|s| String::from_utf8_lossy(s).into_owned())
                    });
            }
        }
    }

    let display_source = json_text.as_deref().unwrap_or(raw_text.as_ref());
    let display_text = cap_display_string(display_source, truncated);

    let mut event_hint = detect_event_hint(
        json_text.as_deref().unwrap_or(raw_text.as_ref()),
        decoded_json.as_ref(),
    );

    let second_layer_source = if json_text.is_some() {
        json_text.as_deref().unwrap_or("")
    } else {
        raw_text.as_ref()
    };
    let (mut inner_base64_text, mut inner_json) = try_second_layer_base64(second_layer_source, truncated);
    if inner_base64_text.is_none() {
        inner_base64_text = inner_from_outer;
    }
    if inner_json.is_none() {
        inner_json = inner_json_from_outer;
    }

    if event_hint.is_none() {
        if let Some(ref inner) = inner_json {
            event_hint = detect_event_hint("", Some(inner));
        } else if let Some(ref inner_text) = inner_base64_text {
            event_hint = detect_event_hint(inner_text, None);
        }
    }

    (display_text, decoded_json, inner_base64_text, inner_json, event_hint)
}

fn cap_display_string(text: &str, truncated: &mut bool) -> Option<String> {
    if text.is_empty() {
        return None;
    }
    if text.len() > MAX_WS_DISPLAY_BYTES {
        *truncated = true;
        Some(format!(
            "{}...[truncated text {}B]",
            &text[..MAX_WS_DISPLAY_BYTES],
            text.len()
        ))
    } else {
        Some(text.to_string())
    }
}

fn detect_event_hint(text: &str, json: Option<&Value>) -> Option<String> {
    if let Some(value) = json {
        if let Some(hint) = hint_from_json(value) {
            return Some(hint);
        }
    }
    for key in CTX_KEYWORDS {
        if text.contains(key) {
            return Some((*key).to_string());
        }
    }
    None
}

fn hint_from_json(value: &Value) -> Option<String> {
    if let Some(obj) = value.as_object() {
        for key in CTX_KEYWORDS {
            if obj.contains_key(*key) {
                return Some((*key).to_string());
            }
        }
    }
    None
}

fn try_second_layer_base64(text: &str, truncated: &mut bool) -> (Option<String>, Option<Value>) {
    let trimmed = text.trim();
    if !looks_like_base64(trimmed) {
        return (None, None);
    }
    let Ok(bytes) = BASE64.decode(trimmed) else {
        return (None, None);
    };
    let inner = String::from_utf8_lossy(&bytes).into_owned();
    if inner.is_empty() {
        return (None, None);
    }
    let inner_display = cap_display_string(&inner, truncated);
    let inner_json = serde_json::from_str::<Value>(&inner).ok();
    (inner_display, inner_json)
}

fn looks_like_base64(text: &str) -> bool {
    if text.len() < 8 || text.len() % 4 != 0 {
        return false;
    }
    text.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comet_url_filter() {
        assert!(is_comet_ws_url("wss://comet-client-arena.5eplay.com/"));
        assert!(is_comet_ws_url("wss://comet-client.win-testing.5eplaycdn.com/"));
        assert!(!is_comet_ws_url("wss://comet-playground.5eplay.com/"));
    }

    #[test]
    fn text_frame_json() {
        let payload = r#"{"game_ctx":{"match_code":"abc","map":"de_dust2"}}"#;
        let event = decode_ws_frame("1.2".into(), "wss://comet-client-arena.5eplay.com/".into(), 1, payload);
        assert_eq!(event.event_hint.as_deref(), Some("game_ctx"));
        assert!(event.decoded_json.is_some());
        assert!(event.parse_error.is_none());
    }

    #[test]
    fn binary_frame_base64() {
        let raw = r#"{"game_ctx":{"map":"de_mirage"}}"#;
        let encoded = BASE64.encode(raw.as_bytes());
        let event = decode_ws_frame("1.3".into(), "wss://comet-client-arena.5eplay.com/".into(), 2, &encoded);
        assert_eq!(event.event_hint.as_deref(), Some("game_ctx"));
        assert!(event.decoded_text.as_ref().unwrap().contains("de_mirage"));
    }

    #[test]
    fn nested_base64_layer() {
        let inner = r#"{"room_ctx":{"members":[]}}"#;
        let outer = BASE64.encode(inner.as_bytes());
        let event = decode_ws_frame("1.4".into(), "wss://comet-client-arena.5eplay.com/".into(), 1, &outer);
        assert_eq!(event.event_hint.as_deref(), Some("room_ctx"));
        assert!(event.inner_base64_text.is_some());
        assert!(event.inner_json.is_some());
    }

    #[test]
    fn invalid_base64_reports_error() {
        let event = decode_ws_frame("1.5".into(), "wss://x".into(), 2, "not!!!base64");
        assert!(event.parse_error.is_some());
    }

    #[test]
    fn control_opcode_skipped_with_error() {
        let event = decode_ws_frame("1.6".into(), "wss://x".into(), 9, "");
        assert!(event.parse_error.as_ref().unwrap().contains("opcode=9"));
    }

    #[test]
    fn binary_frame_with_header_parses_game_ctx() {
        let json = r#"{"game_ctx":{"id":"g161-n-test","gmi":{"t1":{"rooms":[{"members":["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]}]},"t2":{"rooms":[{"members":["11111111-2222-3333-4444-555555555555"]}]}}}}"#;
        let mut payload = vec![0x12, 0x34, 0x00, 0x00, 0x02, 0x00, 0x05];
        payload.extend_from_slice(json.as_bytes());
        let encoded = BASE64.encode(&payload);
        let event = decode_ws_frame(
            "hdr.1".into(),
            "wss://comet-client-arena.5eplay.com/".into(),
            2,
            &encoded,
        );
        assert_eq!(event.event_hint.as_deref(), Some("game_ctx"));
        assert!(event.decoded_json.is_some());
        assert!(event.parse_error.is_none());
        let id = event
            .decoded_json
            .as_ref()
            .and_then(|v| v.get("game_ctx"))
            .and_then(|v| v.get("id"))
            .and_then(|v| v.as_str());
        assert_eq!(id, Some("g161-n-test"));
    }

    #[test]
    fn find_json_slice_skips_binary_prefix() {
        let bytes = b"\x12\x34\x00\x00{\"room_ctx\":{\"id\":\"r1\"}}";
        let slice = find_json_slice(bytes).expect("json slice");
        let parsed: Value = serde_json::from_slice(slice).unwrap();
        assert_eq!(parsed.get("room_ctx").and_then(|v| v.get("id")).and_then(|v| v.as_str()), Some("r1"));
    }
}
