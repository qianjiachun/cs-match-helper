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
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HLOCAL, LocalFree};
    use windows::Win32::Security::Authorization::ConvertSidToStringSidW;
    use windows::Win32::Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token = Default::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return None;
        }

        let mut needed = 0u32;
        let _ = GetTokenInformation(token, TokenUser, None, 0, &mut needed);
        if needed == 0 {
            let _ = CloseHandle(token);
            return None;
        }

        let mut buffer = vec![0u8; needed as usize];
        if GetTokenInformation(
            token,
            TokenUser,
            Some(buffer.as_mut_ptr() as *mut _),
            needed,
            &mut needed,
        )
        .is_err()
        {
            let _ = CloseHandle(token);
            return None;
        }

        let token_user = &*(buffer.as_ptr() as *const TOKEN_USER);
        let mut sid_string = PWSTR::null();
        if ConvertSidToStringSidW(token_user.User.Sid, &mut sid_string).is_err() {
            let _ = CloseHandle(token);
            return None;
        }

        let sid = sid_string.to_string().ok()?;
        let _ = LocalFree(HLOCAL(sid_string.0 as _));
        let _ = CloseHandle(token);

        let trimmed = sid.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }
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
