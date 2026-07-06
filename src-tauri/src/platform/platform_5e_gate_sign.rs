use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::BTreeMap;

type HmacSha256 = Hmac<Sha256>;

/// 5E Arena production HMAC secret（view-arena chunk 43711 production.HMAC_SECRET）
const GATE_HMAC_SECRET: &str = "28137ed61f21705e2cddf498e22fae8f";

const GATE_SIGN_HEADERS: &[(&str, &str)] = &[
    ("Accept-Language", "zh-cn"),
    ("Authorization", ""),
];

#[derive(Debug, Clone)]
pub struct GateSignedHeaders {
    pub accept: String,
    pub accept_language: String,
    pub authorization: String,
    pub content_md5: String,
    pub referer: String,
    pub origin: String,
    pub x_ca_key: String,
    pub x_ca_signature_method: String,
    pub x_ca_signature_headers: String,
    pub x_ca_signature: String,
}

fn build_headers_block(extra: &[(&str, &str)]) -> (String, Vec<String>) {
    let mut keys: Vec<String> = extra
        .iter()
        .filter(|(k, _)| !["accept", "content-type"].contains(&k.to_ascii_lowercase().as_str()))
        .map(|(k, _)| k.to_string())
        .collect();

    keys.sort_by(|a, b| a.to_ascii_lowercase().cmp(&b.to_ascii_lowercase()));

    let mut lines = Vec::new();
    let mut signed_names = Vec::new();
    for key in &keys {
        let value = extra
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(key))
            .map(|(_, v)| v.trim())
            .unwrap_or("");
        lines.push(format!("{}:{}", key.to_ascii_lowercase(), value));
        signed_names.push(key.clone());
    }

    let block = lines.join("\n");
    (block, signed_names)
}

fn build_path_and_parameters(path: &str, query: &BTreeMap<String, String>) -> String {
    if query.is_empty() {
        return path.to_string();
    }
    let qs = query
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&");
    format!("{path}?{qs}")
}

fn sign_canonical(secret: &str, canonical: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(canonical.as_bytes());
    BASE64.encode(mac.finalize().into_bytes())
}

/// 构建阿里云 API 网关 HMAC 签名请求头（对齐 5E vendors 模块 267）。
pub fn build_gate_signed_headers(
    method: &str,
    path: &str,
    query: &BTreeMap<String, String>,
) -> GateSignedHeaders {
    let method = method.to_uppercase();
    let path_and_params = build_path_and_parameters(path, query);

    let (headers_block, signed_header_names) = build_headers_block(GATE_SIGN_HEADERS);
    let x_ca_signature_headers = signed_header_names.join(",");

    let mut parts = vec![
        method.clone(),
        "*/*".to_string(),
        String::new(),
        String::new(),
        String::new(),
    ];
    if !headers_block.is_empty() {
        parts.push(headers_block);
    }
    parts.push(path_and_params.clone());

    let canonical = parts.join("\n");
    let signature = sign_canonical(GATE_HMAC_SECRET, &canonical);

    GateSignedHeaders {
        accept: "*/*".to_string(),
        accept_language: "zh-cn".to_string(),
        authorization: String::new(),
        content_md5: String::new(),
        referer: "https://view-arena.5eplay.com/".to_string(),
        origin: "https://view-arena.5eplay.com".to_string(),
        x_ca_key: "5eplay".to_string(),
        x_ca_signature_method: "HmacSHA256".to_string(),
        x_ca_signature_headers,
        x_ca_signature: signature,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gate_sign_matches_user_curl_sample() {
        let mut query = BTreeMap::new();
        query.insert(
            "uuid".to_string(),
            "ed954be0-7222-11ee-9ce2-ec0d9a495494".to_string(),
        );

        let headers = build_gate_signed_headers(
            "GET",
            "/cranenew/http/api/data/v3/player/home",
            &query,
        );

        assert_eq!(
            headers.x_ca_signature,
            "V+81D/A51CzX6Azk0HbElYwxZfLiquWykkaT6k+Z8Io="
        );
        assert_eq!(headers.x_ca_signature_headers, "Accept-Language,Authorization");
    }
}
