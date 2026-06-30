use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

const APP_NAMESPACE: &str = "com.csmatchhelper.comments.v1";
const FALLBACK_FILENAME: &str = "comment-client-id";

static COMMENT_CLIENT_KEY: OnceLock<Result<String, String>> = OnceLock::new();

#[tauri::command]
pub fn get_comment_client_key() -> Result<String, String> {
    COMMENT_CLIENT_KEY
        .get_or_init(resolve_client_key)
        .clone()
}

fn resolve_client_key() -> Result<String, String> {
    let client_id = resolve_client_id()?;
    Ok(sha256_hex(&client_id))
}

fn resolve_client_id() -> Result<String, String> {
    if let Some(seed) = try_stable_client_seed() {
        return Ok(sha256_hex(&format!("{APP_NAMESPACE}:{seed}")));
    }
    load_or_create_fallback_uuid()
}

fn try_stable_client_seed() -> Option<String> {
    let machine = read_machine_guid()?;
    let user = read_user_sid()?;
    Some(format!("{machine}:{user}"))
}

#[cfg(windows)]
fn read_machine_guid() -> Option<String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm
        .open_subkey("SOFTWARE\\Microsoft\\Cryptography")
        .ok()?;
    let guid: String = key.get_value("MachineGuid").ok()?;
    let trimmed = guid.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

#[cfg(not(windows))]
fn read_machine_guid() -> Option<String> {
    None
}

#[cfg(windows)]
fn read_user_sid() -> Option<String> {
    use std::process::Command;

    let output = Command::new("whoami").arg("/user").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        for token in line.split_whitespace() {
            if token.starts_with("S-1-") {
                return Some(token.to_string());
            }
        }
    }
    None
}

#[cfg(not(windows))]
fn read_user_sid() -> Option<String> {
    None
}

fn fallback_path() -> Result<PathBuf, String> {
    let dir = dirs::config_dir().ok_or_else(|| "无法获取配置目录".to_string())?;
    Ok(dir.join("cs-match-helper").join(FALLBACK_FILENAME))
}

fn load_or_create_fallback_uuid() -> Result<String, String> {
    let path = fallback_path()?;
    if path.exists() {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("读取 client id 失败: {e}"))?;
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    fs::write(&path, &id).map_err(|e| format!("保存 client id 失败: {e}"))?;
    Ok(id)
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::sha256_hex;

    #[test]
    fn sha256_hex_is_lowercase_64_chars() {
        let out = sha256_hex("test-client-id");
        assert_eq!(out.len(), 64);
        assert!(out.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }
}
