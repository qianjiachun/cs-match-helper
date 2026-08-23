use aes::{
    cipher::{generic_array::GenericArray, BlockDecrypt, KeyInit},
    Aes256,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;

const PERFECT_KEY_PREFIX: &str = "G#r%*VCDYj6P5$mny0838MhH8d";
const AES_BLOCK_SIZE: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PerfectDecryptErrorKind {
    Envelope,
    Base64,
    KeyLength,
    Padding,
    Utf8,
    Json,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PerfectDecryptError {
    pub kind: PerfectDecryptErrorKind,
    pub message: String,
}

impl PerfectDecryptError {
    fn new(kind: PerfectDecryptErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn public_message(&self) -> String {
        format!(
            "PERFECT_DECRYPT_{}: {}",
            format!("{:?}", self.kind).to_uppercase(),
            self.message
        )
    }
}

impl fmt::Display for PerfectDecryptError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.public_message())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfectDecryptInput {
    pub response: Option<String>,
    pub e: Option<String>,
    pub t: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfectDecryptOutput {
    pub value: Value,
    pub formatted_json: String,
}

fn timestamp_text(value: &Value) -> Result<String, PerfectDecryptError> {
    match value {
        Value::String(value) if !value.is_empty() => Ok(value.clone()),
        Value::Number(value) => Ok(value.to_string()),
        _ => Err(PerfectDecryptError::new(
            PerfectDecryptErrorKind::Envelope,
            "data.t must be a string or number",
        )),
    }
}

pub fn decrypt_fields(encrypted: &str, timestamp: &Value) -> Result<Value, PerfectDecryptError> {
    let timestamp = timestamp_text(timestamp)?;
    let key = format!("{PERFECT_KEY_PREFIX}{timestamp}");
    if key.len() != 32 {
        return Err(PerfectDecryptError::new(
            PerfectDecryptErrorKind::KeyLength,
            format!("derived AES-256 key is {} bytes, expected 32", key.len()),
        ));
    }

    let mut ciphertext = STANDARD.decode(encrypted.trim()).map_err(|error| {
        PerfectDecryptError::new(
            PerfectDecryptErrorKind::Base64,
            format!("data.e is not valid Base64: {error}"),
        )
    })?;
    if ciphertext.is_empty() || ciphertext.len() % AES_BLOCK_SIZE != 0 {
        return Err(PerfectDecryptError::new(
            PerfectDecryptErrorKind::Base64,
            "decoded ciphertext length must be a non-zero multiple of 16",
        ));
    }

    let cipher = Aes256::new_from_slice(key.as_bytes()).map_err(|_| {
        PerfectDecryptError::new(PerfectDecryptErrorKind::KeyLength, "invalid AES-256 key")
    })?;
    for block in ciphertext.chunks_exact_mut(AES_BLOCK_SIZE) {
        cipher.decrypt_block(GenericArray::from_mut_slice(block));
    }

    let padding = *ciphertext.last().unwrap() as usize;
    if padding == 0
        || padding > AES_BLOCK_SIZE
        || ciphertext.len() < padding
        || !ciphertext[ciphertext.len() - padding..]
            .iter()
            .all(|byte| *byte as usize == padding)
    {
        return Err(PerfectDecryptError::new(
            PerfectDecryptErrorKind::Padding,
            "invalid PKCS#7 padding",
        ));
    }
    ciphertext.truncate(ciphertext.len() - padding);

    let plaintext = String::from_utf8(ciphertext).map_err(|error| {
        PerfectDecryptError::new(
            PerfectDecryptErrorKind::Utf8,
            format!("plaintext is not UTF-8: {error}"),
        )
    })?;
    serde_json::from_str(&plaintext).map_err(|error| {
        PerfectDecryptError::new(
            PerfectDecryptErrorKind::Json,
            format!("plaintext is not JSON: {error}"),
        )
    })
}

pub fn decrypt_envelope(value: &Value) -> Result<Value, PerfectDecryptError> {
    let object = value.as_object().ok_or_else(|| {
        PerfectDecryptError::new(
            PerfectDecryptErrorKind::Envelope,
            "response must be a JSON object",
        )
    })?;

    // Error responses are intentionally left intact: they are not encrypted.
    if object
        .get("code")
        .and_then(Value::as_i64)
        .is_some_and(|code| code != 0)
    {
        return Ok(value.clone());
    }

    let data = object
        .get("data")
        .and_then(Value::as_object)
        .unwrap_or(object);
    let encrypted = data.get("e").and_then(Value::as_str).ok_or_else(|| {
        PerfectDecryptError::new(PerfectDecryptErrorKind::Envelope, "missing data.e")
    })?;
    let timestamp = data.get("t").ok_or_else(|| {
        PerfectDecryptError::new(PerfectDecryptErrorKind::Envelope, "missing data.t")
    })?;
    decrypt_fields(encrypted, timestamp)
}

#[tauri::command]
pub fn decrypt_perfect_response(
    input: PerfectDecryptInput,
) -> Result<PerfectDecryptOutput, String> {
    let value = if let Some(response) = input.response.filter(|value| !value.trim().is_empty()) {
        let envelope: Value = serde_json::from_str(&response).map_err(|error| {
            PerfectDecryptError::new(
                PerfectDecryptErrorKind::Envelope,
                format!("response is not valid JSON: {error}"),
            )
            .public_message()
        })?;
        decrypt_envelope(&envelope).map_err(|error| error.public_message())?
    } else {
        let encrypted = input
            .e
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                PerfectDecryptError::new(PerfectDecryptErrorKind::Envelope, "missing e")
                    .public_message()
            })?;
        let timestamp = input.t.ok_or_else(|| {
            PerfectDecryptError::new(PerfectDecryptErrorKind::Envelope, "missing t")
                .public_message()
        })?;
        decrypt_fields(&encrypted, &timestamp).map_err(|error| error.public_message())?
    };
    let formatted_json = serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?;
    Ok(PerfectDecryptOutput {
        value,
        formatted_json,
    })
}

#[cfg(test)]
mod tests {
    use super::{decrypt_envelope, decrypt_fields, PerfectDecryptErrorKind};
    use aes::{
        cipher::{generic_array::GenericArray, BlockEncrypt, KeyInit},
        Aes256,
    };
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use serde_json::json;

    fn encrypt_fixture(value: &serde_json::Value, timestamp: i64) -> String {
        let key = format!("G#r%*VCDYj6P5$mny0838MhH8d{timestamp}");
        let cipher = Aes256::new_from_slice(key.as_bytes()).unwrap();
        let mut bytes = serde_json::to_vec(value).unwrap();
        let padding = 16 - bytes.len() % 16;
        bytes.extend(std::iter::repeat_n(padding as u8, padding));
        for block in bytes.chunks_exact_mut(16) {
            cipher.encrypt_block(GenericArray::from_mut_slice(block));
        }
        STANDARD.encode(bytes)
    }

    #[test]
    fn decrypts_aes_256_ecb_json_envelope() {
        let expected = json!({"uid":"76561199667272550","season":"S23"});
        let encrypted = encrypt_fixture(&expected, 569525);
        let actual = decrypt_envelope(&json!({"code":0,"data":{"e":encrypted,"t":569525}}))
            .expect("decrypt fixture");
        assert_eq!(actual, expected);
    }

    #[test]
    fn rejects_bad_base64_and_key_length() {
        assert_eq!(
            decrypt_fields("%%%", &json!(569525)).unwrap_err().kind,
            PerfectDecryptErrorKind::Base64
        );
        assert_eq!(
            decrypt_fields("AAAA", &json!(1)).unwrap_err().kind,
            PerfectDecryptErrorKind::KeyLength
        );
    }

    #[test]
    fn rejects_bad_padding_utf8_and_json() {
        let encrypted = encrypt_fixture(&json!({"ok":true}), 569525);
        let mut bytes = STANDARD.decode(encrypted).unwrap();
        *bytes.last_mut().unwrap() ^= 1;
        let bad = STANDARD.encode(bytes);
        assert_eq!(
            decrypt_fields(&bad, &json!(569525)).unwrap_err().kind,
            PerfectDecryptErrorKind::Padding
        );

        let utf8 = encrypt_bytes(&[0xff, 0xfe], 569525);
        assert_eq!(
            decrypt_fields(&utf8, &json!(569525)).unwrap_err().kind,
            PerfectDecryptErrorKind::Utf8
        );
        let json_text = encrypt_bytes(b"not json", 569525);
        assert_eq!(
            decrypt_fields(&json_text, &json!(569525)).unwrap_err().kind,
            PerfectDecryptErrorKind::Json
        );
    }

    #[test]
    fn returns_unencrypted_api_errors_unchanged() {
        let error = json!({"code":1033,"data":null,"msg":"expired"});
        assert_eq!(decrypt_envelope(&error).unwrap(), error);
    }

    fn encrypt_bytes(value: &[u8], timestamp: i64) -> String {
        let key = format!("G#r%*VCDYj6P5$mny0838MhH8d{timestamp}");
        let cipher = Aes256::new_from_slice(key.as_bytes()).unwrap();
        let mut bytes = value.to_vec();
        let padding = 16 - bytes.len() % 16;
        bytes.extend(std::iter::repeat_n(padding as u8, padding));
        for block in bytes.chunks_exact_mut(16) {
            cipher.encrypt_block(GenericArray::from_mut_slice(block));
        }
        STANDARD.encode(bytes)
    }
}
