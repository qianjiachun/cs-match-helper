use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfectCredential {
    pub access_token: String,
    pub uid: String,
    pub login_method: u8,
    pub schema_version: u8,
}

impl PerfectCredential {
    pub fn new(access_token: String, uid: String, login_method: u8) -> Self {
        Self {
            access_token,
            uid,
            login_method,
            schema_version: 2,
        }
    }
}

pub trait PerfectCredentialStore: Send + Sync {
    fn load(&self) -> Result<Option<PerfectCredential>, String>;
    fn save(&self, credential: &PerfectCredential) -> Result<(), String>;
    fn clear(&self) -> Result<(), String>;
}

#[derive(Default)]
pub struct SystemPerfectCredentialStore;

#[cfg(windows)]
mod system {
    use super::{PerfectCredential, PerfectCredentialStore, SystemPerfectCredentialStore};
    use crate::settings_store::{read_settings_json_from, settings_path, update_settings_json_at};
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use serde::{Deserialize, Serialize};
    use std::{
        os::windows::ffi::OsStrExt,
        path::Path,
        ptr,
        sync::atomic::{compiler_fence, Ordering},
    };
    use windows::{
        core::{PCWSTR, PWSTR},
        Win32::{
            Foundation::{CloseHandle, LocalFree, HANDLE, HLOCAL},
            Security::{
                Authorization::{
                    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
                    SDDL_REVISION_1,
                },
                Cryptography::{
                    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN,
                    CRYPT_INTEGER_BLOB,
                },
                GetTokenInformation, SetFileSecurityW, TokenUser, DACL_SECURITY_INFORMATION,
                PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, TOKEN_QUERY, TOKEN_USER,
            },
            System::Threading::{GetCurrentProcess, OpenProcessToken},
        },
    };

    const SETTINGS_KEY: &str = "perfectAuth";
    const STORAGE_SCHEMA_VERSION: u8 = 1;
    const DPAPI_ENTROPY: &[u8] = b"com.csmatchhelper.desktop/perfect-auth/settings-v1";

    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct StoredPerfectAuth {
        schema_version: u8,
        ciphertext: String,
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn wide_path(path: &Path) -> Vec<u16> {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    fn secure_zero(value: &mut [u8]) {
        for byte in value {
            unsafe { ptr::write_volatile(byte, 0) };
        }
        compiler_fence(Ordering::SeqCst);
    }

    fn blob(value: &mut [u8]) -> Result<CRYPT_INTEGER_BLOB, String> {
        let length = u32::try_from(value.len())
            .map_err(|_| "login credential payload is too large".to_string())?;
        Ok(CRYPT_INTEGER_BLOB {
            cbData: length,
            pbData: value.as_mut_ptr(),
        })
    }

    fn protect_data(plaintext: &mut [u8]) -> Result<Vec<u8>, String> {
        let input = blob(plaintext)?;
        let mut entropy_bytes = DPAPI_ENTROPY.to_vec();
        let entropy = blob(&mut entropy_bytes)?;
        let description = wide("CS Match Helper login credential");
        let mut output = CRYPT_INTEGER_BLOB::default();
        let result = unsafe {
            CryptProtectData(
                &input,
                PCWSTR(description.as_ptr()),
                Some(&entropy),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        secure_zero(&mut entropy_bytes);
        result.map_err(|error| format!("Windows DPAPI encryption failed: {error}"))?;
        let encrypted =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
        unsafe { LocalFree(HLOCAL(output.pbData.cast())) };
        Ok(encrypted)
    }

    fn unprotect_data(ciphertext: &mut [u8]) -> Result<Vec<u8>, String> {
        let input = blob(ciphertext)?;
        let mut entropy_bytes = DPAPI_ENTROPY.to_vec();
        let entropy = blob(&mut entropy_bytes)?;
        let mut output = CRYPT_INTEGER_BLOB::default();
        let result = unsafe {
            CryptUnprotectData(
                &input,
                None,
                Some(&entropy),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        secure_zero(&mut entropy_bytes);
        result.map_err(|error| format!("Windows DPAPI decryption failed: {error}"))?;
        let plaintext =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
        unsafe { LocalFree(HLOCAL(output.pbData.cast())) };
        Ok(plaintext)
    }

    fn current_user_sid() -> Result<String, String> {
        let mut token = HANDLE::default();
        unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) }
            .map_err(|error| format!("cannot open the current Windows user token: {error}"))?;

        let result = (|| {
            let mut length = 0;
            let _ = unsafe { GetTokenInformation(token, TokenUser, None, 0, &mut length) };
            if length == 0 {
                return Err("cannot determine the current Windows user SID size".to_string());
            }
            let word_size = std::mem::size_of::<usize>();
            let mut buffer = vec![0usize; (length as usize).div_ceil(word_size)];
            unsafe {
                GetTokenInformation(
                    token,
                    TokenUser,
                    Some(buffer.as_mut_ptr().cast()),
                    length,
                    &mut length,
                )
            }
            .map_err(|error| format!("cannot read the current Windows user SID: {error}"))?;
            let token_user = unsafe { &*buffer.as_ptr().cast::<TOKEN_USER>() };
            let mut sid = PWSTR::null();
            unsafe { ConvertSidToStringSidW(token_user.User.Sid, &mut sid) }
                .map_err(|error| format!("cannot format the current Windows user SID: {error}"))?;
            let sid_text = unsafe { sid.to_string() }
                .map_err(|error| format!("current Windows user SID is invalid: {error}"));
            unsafe { LocalFree(HLOCAL(sid.0.cast())) };
            sid_text
        })();
        let _ = unsafe { CloseHandle(token) };
        result
    }

    fn restrict_file_to_current_user(path: &Path) -> Result<(), String> {
        let sid = current_user_sid()?;
        let sddl = wide(&format!("D:P(A;;FA;;;{sid})(A;;FA;;;SY)"));
        let mut descriptor = PSECURITY_DESCRIPTOR::default();
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                PCWSTR(sddl.as_ptr()),
                SDDL_REVISION_1,
                &mut descriptor,
                None,
            )
        }
        .map_err(|error| format!("cannot create login credential file ACL: {error}"))?;
        let path_wide = wide_path(path);
        let result = unsafe {
            SetFileSecurityW(
                PCWSTR(path_wide.as_ptr()),
                DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                descriptor,
            )
            .ok()
        }
        .map_err(|error| format!("cannot restrict login credential file ACL: {error}"));
        unsafe { LocalFree(HLOCAL(descriptor.0)) };
        result
    }

    fn load_from_settings(path: &Path) -> Result<Option<PerfectCredential>, String> {
        let root = read_settings_json_from(path)?;
        let root = root
            .as_object()
            .ok_or_else(|| "settings root is not an object".to_string())?;
        let Some(stored_value) = root.get(SETTINGS_KEY) else {
            return Ok(None);
        };
        let stored = serde_json::from_value::<StoredPerfectAuth>(stored_value.clone())
            .map_err(|error| format!("encrypted login credential metadata is invalid: {error}"))?;
        if stored.schema_version != STORAGE_SCHEMA_VERSION {
            return Err(format!(
                "unsupported encrypted login credential schema {}",
                stored.schema_version
            ));
        }
        let mut ciphertext = STANDARD
            .decode(stored.ciphertext)
            .map_err(|error| format!("encrypted login credential is not valid Base64: {error}"))?;
        if ciphertext.is_empty() {
            return Err("encrypted login credential is empty".to_string());
        }
        let plaintext_result = unprotect_data(&mut ciphertext);
        secure_zero(&mut ciphertext);
        let mut plaintext = plaintext_result?;
        let parsed = serde_json::from_slice::<PerfectCredential>(&plaintext)
            .map(Some)
            .map_err(|error| format!("decrypted login credential is invalid: {error}"));
        secure_zero(&mut plaintext);
        parsed
    }

    fn save_to_settings(path: &Path, credential: &PerfectCredential) -> Result<(), String> {
        let mut plaintext = serde_json::to_vec(credential)
            .map_err(|error| format!("login credential serialization failed: {error}"))?;
        let encrypted_result = protect_data(&mut plaintext);
        secure_zero(&mut plaintext);
        let mut encrypted = encrypted_result?;
        let stored = StoredPerfectAuth {
            schema_version: STORAGE_SCHEMA_VERSION,
            ciphertext: STANDARD.encode(&encrypted),
        };
        secure_zero(&mut encrypted);
        let stored_value = serde_json::to_value(stored)
            .map_err(|error| format!("login credential metadata serialization failed: {error}"))?;
        update_settings_json_at(path, |root| {
            root.insert(SETTINGS_KEY.to_string(), stored_value);
            Ok(true)
        })?;
        if let Err(error) = restrict_file_to_current_user(path) {
            let _ = clear_from_settings(path);
            return Err(error);
        }
        Ok(())
    }

    fn clear_from_settings(path: &Path) -> Result<(), String> {
        update_settings_json_at(path, |root| Ok(root.remove(SETTINGS_KEY).is_some()))
    }

    impl PerfectCredentialStore for SystemPerfectCredentialStore {
        fn load(&self) -> Result<Option<PerfectCredential>, String> {
            load_from_settings(&settings_path()?)
        }

        fn save(&self, credential: &PerfectCredential) -> Result<(), String> {
            save_to_settings(&settings_path()?, credential)
        }

        fn clear(&self) -> Result<(), String> {
            clear_from_settings(&settings_path()?)
        }
    }

    #[cfg(test)]
    mod windows_tests {
        use super::{
            clear_from_settings, load_from_settings, protect_data, save_to_settings, secure_zero,
            unprotect_data,
        };
        use crate::platform::perfect_credentials::PerfectCredential;

        #[test]
        fn dpapi_round_trip_does_not_expose_plaintext() {
            let mut plaintext = br#"{"accessToken":"sensitive-steam-token"}"#.to_vec();
            let encrypted = protect_data(&mut plaintext).expect("DPAPI encryption");
            assert!(!encrypted
                .windows(b"sensitive-steam-token".len())
                .any(|window| window == b"sensitive-steam-token"));
            let mut ciphertext = encrypted;
            let mut decrypted = unprotect_data(&mut ciphertext).expect("DPAPI decryption");
            assert_eq!(decrypted, plaintext);
            secure_zero(&mut plaintext);
            secure_zero(&mut decrypted);
        }

        #[test]
        fn encrypted_settings_round_trip_preserves_unrelated_fields() {
            let directory = std::env::temp_dir().join(format!(
                "cs-match-helper-auth-test-{}",
                uuid::Uuid::new_v4()
            ));
            std::fs::create_dir_all(&directory).expect("create test directory");
            let path = directory.join("cs-match-helper-settings.json");
            std::fs::write(&path, r#"{"p5eClientRoot":"C:\\5E"}"#)
                .expect("seed unrelated settings");
            let expected = PerfectCredential::new(
                "fake-sensitive-steam-token".into(),
                "76561199667272550".into(),
                3,
            );

            save_to_settings(&path, &expected).expect("save encrypted credential");
            let bytes = std::fs::read(&path).expect("read encrypted credential");
            assert!(!bytes
                .windows(expected.access_token.len())
                .any(|window| window == expected.access_token.as_bytes()));
            let root: serde_json::Value =
                serde_json::from_slice(&bytes).expect("parse settings file");
            assert_eq!(
                root.get("p5eClientRoot")
                    .and_then(serde_json::Value::as_str),
                Some(r"C:\5E")
            );
            assert!(root.get("perfectAuth").is_some());
            assert_eq!(
                load_from_settings(&path).expect("load encrypted credential"),
                Some(expected.clone())
            );

            clear_from_settings(&path).expect("clear encrypted credential");
            assert_eq!(load_from_settings(&path).unwrap(), None);
            let cleared: serde_json::Value =
                serde_json::from_slice(&std::fs::read(&path).expect("read settings after clear"))
                    .expect("parse settings after clear");
            assert_eq!(
                cleared
                    .get("p5eClientRoot")
                    .and_then(serde_json::Value::as_str),
                Some(r"C:\5E")
            );
            assert!(cleared.get("perfectAuth").is_none());

            std::fs::remove_dir_all(&directory).expect("remove test directory");
        }
    }
}

#[cfg(not(windows))]
impl PerfectCredentialStore for SystemPerfectCredentialStore {
    fn load(&self) -> Result<Option<PerfectCredential>, String> {
        Ok(None)
    }

    fn save(&self, _credential: &PerfectCredential) -> Result<(), String> {
        Err("Perfect credential storage is only supported on Windows".to_string())
    }

    fn clear(&self) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
pub mod tests {
    use super::{PerfectCredential, PerfectCredentialStore};
    use std::sync::Mutex;

    #[derive(Default)]
    pub struct MemoryCredentialStore(pub Mutex<Option<PerfectCredential>>);

    impl PerfectCredentialStore for MemoryCredentialStore {
        fn load(&self) -> Result<Option<PerfectCredential>, String> {
            Ok(self.0.lock().unwrap().clone())
        }

        fn save(&self, credential: &PerfectCredential) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(credential.clone());
            Ok(())
        }

        fn clear(&self) -> Result<(), String> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }

    #[test]
    fn memory_store_round_trips_without_using_real_credentials() {
        let store = MemoryCredentialStore::default();
        let expected = PerfectCredential::new("secret".into(), "76561199667272550".into(), 1);
        store.save(&expected).unwrap();
        assert_eq!(store.load().unwrap(), Some(expected));
        store.clear().unwrap();
        assert_eq!(store.load().unwrap(), None);
    }
}
