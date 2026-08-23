use super::{
    perfect_api::{
        clear_player_cache, extract_identity, extract_uid, fetch_overview, is_auth_invalid,
        is_network_error,
    },
    perfect_credentials::{
        PerfectCredential, PerfectCredentialStore, SystemPerfectCredentialStore,
    },
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{DynamicImage, ImageFormat, Luma};
use qrcode::QrCode;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::Cursor,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

const AUTH_EVENT: &str = "perfect-auth-state";
const STEAM_WINDOW_LABEL: &str = "perfect-steam-auth";
const QR_APPLY_URL: &str = "https://passport.pwesports.cn/qrAuth/applyToken";
const QR_CHECK_URL: &str = "https://passport.pwesports.cn/qrAuth/check";
const QR_REFERER: &str = "https://client.wmpvp.com";
// The Passport API requires a valid SteamID before the scanner identity is known.
// The confirmed check response remains the only source of the saved account UID.
const QR_NEUTRAL_STEAM_ID: &str = "76561197960265728";
const QR_EXPIRES_AFTER: Duration = Duration::from_secs(5 * 60);
const STEAM_LOGIN_URL: &str = "https://passport.pwesports.cn/steam/login";
const STEAM_CALLBACK_URL: &str = "https://pvp.wanmei.com/csgo/pwaSteam";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PerfectAuthPhase {
    Idle,
    Requesting,
    WaitingScan,
    Scanned,
    Confirming,
    Validating,
    Authenticated,
    Expired,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfectAuthStatus {
    pub phase: PerfectAuthPhase,
    pub method: Option<String>,
    pub uid: Option<String>,
    pub name: Option<String>,
    pub avatar: Option<String>,
    pub error: Option<String>,
    pub qr_image_data_url: Option<String>,
    pub expires_at: Option<u64>,
}

impl Default for PerfectAuthStatus {
    fn default() -> Self {
        Self {
            phase: PerfectAuthPhase::Idle,
            method: None,
            uid: None,
            name: None,
            avatar: None,
            error: None,
            qr_image_data_url: None,
            expires_at: None,
        }
    }
}

pub struct PerfectAuthRuntime {
    status: Mutex<PerfectAuthStatus>,
    generation: AtomicU64,
    store: SystemPerfectCredentialStore,
}

impl Default for PerfectAuthRuntime {
    fn default() -> Self {
        Self {
            status: Mutex::new(PerfectAuthStatus::default()),
            generation: AtomicU64::new(0),
            store: SystemPerfectCredentialStore,
        }
    }
}

impl PerfectAuthRuntime {
    fn snapshot(&self) -> PerfectAuthStatus {
        self.status.lock().unwrap().clone()
    }

    fn publish(&self, app: &tauri::AppHandle, next: PerfectAuthStatus) {
        *self.status.lock().unwrap() = next.clone();
        let _ = app.emit(AUTH_EVENT, next);
    }

    fn begin(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn is_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) == generation
    }

    pub fn load_credential(&self) -> Result<Option<PerfectCredential>, String> {
        self.store.load()
    }

    fn clear_credential(&self) -> Result<(), String> {
        self.store.clear()
    }
}

fn status_for_method(phase: PerfectAuthPhase, method: &str) -> PerfectAuthStatus {
    PerfectAuthStatus {
        phase,
        method: Some(method.to_string()),
        ..Default::default()
    }
}

async fn validate(
    credential: &PerfectCredential,
) -> Result<(Option<String>, Option<String>), String> {
    let overview = fetch_overview(credential, &credential.uid).await?;
    let response_uid = extract_uid(&overview).ok_or_else(|| {
        "PERFECT_COMPATIBILITY: overview response has no SteamID for login validation".to_string()
    })?;
    if response_uid != credential.uid {
        return Err("PERFECT_COMPATIBILITY: login validation SteamID mismatch".to_string());
    }
    Ok(extract_identity(&overview))
}

async fn validate_and_publish(
    app: tauri::AppHandle,
    generation: u64,
    credential: PerfectCredential,
    persist: bool,
) -> PerfectAuthStatus {
    let runtime = app.state::<PerfectAuthRuntime>();
    let method = if credential.login_method == 3 {
        "steam"
    } else {
        "qr"
    };
    if !runtime.is_current(generation) {
        return runtime.snapshot();
    }
    runtime.publish(
        &app,
        status_for_method(PerfectAuthPhase::Validating, method),
    );
    match validate(&credential).await {
        Ok((name, avatar)) => {
            if persist {
                if let Err(error) = runtime.store.save(&credential) {
                    let mut status = status_for_method(PerfectAuthPhase::Error, method);
                    status.error = Some(error);
                    runtime.publish(&app, status.clone());
                    return status;
                }
            }
            let status = PerfectAuthStatus {
                phase: PerfectAuthPhase::Authenticated,
                method: Some(method.into()),
                uid: Some(credential.uid.clone()),
                name,
                avatar,
                error: None,
                qr_image_data_url: None,
                expires_at: None,
            };
            runtime.publish(&app, status.clone());
            status
        }
        Err(error) => {
            if is_auth_invalid(&error) {
                let _ = runtime.clear_credential();
            }
            let mut status = status_for_method(PerfectAuthPhase::Error, method);
            status.uid = Some(credential.uid.clone());
            status.error = Some(error);
            runtime.publish(&app, status.clone());
            status
        }
    }
}

#[tauri::command]
pub async fn get_perfect_auth_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, PerfectAuthRuntime>,
) -> Result<PerfectAuthStatus, String> {
    let credential = match state.load_credential()? {
        Some(credential) => credential,
        None => return Ok(state.snapshot()),
    };
    let generation = state.begin();
    let previous = state.snapshot();
    let result = validate_and_publish(app.clone(), generation, credential, false).await;
    if result.phase == PerfectAuthPhase::Error
        && result.error.as_deref().is_some_and(is_network_error)
        && previous.phase == PerfectAuthPhase::Authenticated
    {
        state.publish(&app, previous.clone());
        return Ok(previous);
    }
    Ok(result)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QrApplyRequest<'a> {
    app_id: u8,
    qr_type: u8,
    steam_id: &'a str,
    website: &'a str,
    redirect: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QrCheckRequest<'a> {
    access_token: &'a str,
    app_id: u8,
}

#[derive(Deserialize)]
struct QrApiResponse<T> {
    code: i64,
    #[serde(default)]
    description: String,
    result: Option<T>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QrApplyResult {
    access_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QrAccountItem {
    steam_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QrCheckResult {
    account_item: Option<QrAccountItem>,
    status: i64,
    token: Option<String>,
}

fn qr_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("CSMatchHelper/3 PerfectPassport")
        .build()
        .map_err(|error| format!("PERFECT_NETWORK: QR client initialization failed: {error}"))
}

async fn qr_post<T: for<'de> Deserialize<'de>>(
    client: &reqwest::Client,
    url: &str,
    body: &impl Serialize,
) -> Result<QrApiResponse<T>, String> {
    let response = client
        .post(url)
        .header("Referer", QR_REFERER)
        .json(body)
        .send()
        .await
        .map_err(|error| format!("PERFECT_NETWORK: QR request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "PERFECT_HTTP: QR endpoint returned {}",
            response.status().as_u16()
        ));
    }
    response
        .json::<QrApiResponse<T>>()
        .await
        .map_err(|error| format!("PERFECT_QR_PROTOCOL: invalid JSON response: {error}"))
}

fn qr_png_data_url(content: &str) -> Result<String, String> {
    let code = QrCode::new(content.as_bytes())
        .map_err(|error| format!("PERFECT_QR_PROTOCOL: invalid QR content: {error}"))?;
    let image = code
        .render::<Luma<u8>>()
        .min_dimensions(440, 440)
        .quiet_zone(true)
        .build();
    let mut output = Cursor::new(Vec::new());
    DynamicImage::ImageLuma8(image)
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|error| format!("PERFECT_QR_PROTOCOL: PNG generation failed: {error}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(output.into_inner())
    ))
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn qr_status(
    phase: PerfectAuthPhase,
    image: Option<String>,
    expires_at: Option<u64>,
) -> PerfectAuthStatus {
    PerfectAuthStatus {
        phase,
        method: Some("qr".into()),
        qr_image_data_url: image,
        expires_at,
        ..Default::default()
    }
}

async fn run_qr_login(app: tauri::AppHandle, generation: u64) -> Result<(), String> {
    let client = qr_client()?;
    let apply = qr_post::<QrApplyResult>(
        &client,
        QR_APPLY_URL,
        &QrApplyRequest {
            app_id: 7,
            qr_type: 1,
            steam_id: QR_NEUTRAL_STEAM_ID,
            website: "pvp",
            redirect: false,
        },
    )
    .await?;
    if apply.code != 0 {
        return Err(format!(
            "PERFECT_QR_API:{}: {}",
            apply.code, apply.description
        ));
    }
    let access_url = apply
        .result
        .ok_or_else(|| "PERFECT_QR_PROTOCOL: applyToken result is missing".to_string())?
        .access_url;
    let access_token = url::Url::parse(&access_url)
        .map_err(|error| format!("PERFECT_QR_PROTOCOL: invalid accessUrl: {error}"))?
        .query_pairs()
        .find_map(|(key, value)| (key == "accessToken").then(|| value.into_owned()))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "PERFECT_QR_PROTOCOL: accessUrl has no accessToken".to_string())?;
    let image = qr_png_data_url(&access_url)?;
    let expires_at = unix_millis() + QR_EXPIRES_AFTER.as_millis() as u64;
    let started_at = Instant::now();
    let runtime = app.state::<PerfectAuthRuntime>();
    if !runtime.is_current(generation) {
        return Ok(());
    }
    runtime.publish(
        &app,
        qr_status(
            PerfectAuthPhase::WaitingScan,
            Some(image.clone()),
            Some(expires_at),
        ),
    );
    let mut seen_scanned = false;

    loop {
        tokio::time::sleep(Duration::from_secs(2)).await;
        let runtime = app.state::<PerfectAuthRuntime>();
        if !runtime.is_current(generation) {
            return Ok(());
        }
        if started_at.elapsed() >= QR_EXPIRES_AFTER {
            runtime.publish(
                &app,
                qr_status(PerfectAuthPhase::Expired, None, Some(expires_at)),
            );
            return Ok(());
        }

        let checked = qr_post::<QrCheckResult>(
            &client,
            QR_CHECK_URL,
            &QrCheckRequest {
                access_token: &access_token,
                app_id: 7,
            },
        )
        .await?;
        if checked.code != 0 {
            if checked.code == 1008 {
                runtime.publish(
                    &app,
                    qr_status(PerfectAuthPhase::Expired, None, Some(expires_at)),
                );
                return Ok(());
            }
            return Err(format!(
                "PERFECT_QR_API:{}: {}",
                checked.code, checked.description
            ));
        }
        let result = checked
            .result
            .ok_or_else(|| "PERFECT_QR_PROTOCOL: check result is missing".to_string())?;
        match result.status {
            0 => {}
            1 => {
                let phase = if seen_scanned {
                    PerfectAuthPhase::Confirming
                } else {
                    seen_scanned = true;
                    PerfectAuthPhase::Scanned
                };
                runtime.publish(
                    &app,
                    qr_status(phase, Some(image.clone()), Some(expires_at)),
                );
            }
            2 => {
                let token = result.token.filter(|value| {
                    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
                });
                let uid = result
                    .account_item
                    .map(|account| account.steam_id)
                    .filter(|value| {
                        value.len() == 17 && value.bytes().all(|byte| byte.is_ascii_digit())
                    });
                let credential = match (token, uid) {
                    (Some(token), Some(uid)) => PerfectCredential::new(token, uid, 1),
                    _ => {
                        return Err(
                            "PERFECT_QR_PROTOCOL: confirmed response has invalid credentials"
                                .into(),
                        )
                    }
                };
                validate_and_publish(app, generation, credential, true).await;
                return Ok(());
            }
            status => {
                return Err(format!(
                    "PERFECT_QR_PROTOCOL: unsupported check status {status}"
                ))
            }
        }
    }
}

#[tauri::command]
pub async fn start_perfect_qr_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, PerfectAuthRuntime>,
) -> Result<PerfectAuthStatus, String> {
    let generation = state.begin();
    state.publish(&app, status_for_method(PerfectAuthPhase::Requesting, "qr"));
    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_qr_login(app_for_task.clone(), generation).await {
            let runtime = app_for_task.state::<PerfectAuthRuntime>();
            if runtime.is_current(generation) {
                let mut status = status_for_method(PerfectAuthPhase::Error, "qr");
                status.error = Some(error);
                runtime.publish(&app_for_task, status);
            }
        }
    });
    Ok(state.snapshot())
}

fn new_steam_state() -> String {
    Uuid::new_v4()
        .simple()
        .to_string()
        .chars()
        .take(18)
        .collect()
}

fn steam_login_url(state: &str) -> Result<url::Url, String> {
    let mut url = url::Url::parse(STEAM_LOGIN_URL).map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("appId", "1")
        .append_pair("callback", STEAM_CALLBACK_URL)
        .append_pair("state", state);
    Ok(url)
}

fn is_steam_callback(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("pvp.wanmei.com")
        && url.path() == "/csgo/pwaSteam"
}

fn is_allowed_steam_navigation(url: &url::Url) -> bool {
    if is_steam_callback(url) {
        return true;
    }
    url.scheme() == "https"
        && matches!(
            url.host_str(),
            Some("pvp.wanmei.com")
                | Some("passport.pwesports.cn")
                | Some("steamcommunity.com")
                | Some("store.steampowered.com")
                | Some("login.steampowered.com")
                | Some("help.steampowered.com")
                | Some("checkout.steampowered.com")
                | Some("steam.tv")
        )
}

enum SteamCallbackOutcome {
    Incomplete,
    Rejected(String),
    Authenticated(PerfectCredential),
}

fn steam_callback_requires_phone_binding(fields: &HashMap<String, String>) -> bool {
    if fields
        .get("phoneToken")
        .is_some_and(|token| !token.trim().is_empty())
    {
        return true;
    }

    let description = fields
        .get("description")
        .map(|value| value.trim().to_lowercase())
        .unwrap_or_default();
    (description.contains("绑定") && description.contains("手机"))
        || ((description.contains("bind")
            || description.contains("bound")
            || description.contains("binding"))
            && (description.contains("phone") || description.contains("mobile")))
}

fn parse_steam_callback(url: &url::Url, expected_state: &str) -> SteamCallbackOutcome {
    let mut fields: HashMap<String, String> = url.query_pairs().into_owned().collect();
    let is_terminal = fields.contains_key("token")
        || fields.contains_key("steamId")
        || fields.contains_key("phoneToken")
        || fields.contains_key("code");

    // Passport can visit the callback page before it has an OAuth result. Such a
    // navigation must not consume the active login or be reported as a CSRF failure.
    if !is_terminal {
        return SteamCallbackOutcome::Incomplete;
    }

    if steam_callback_requires_phone_binding(&fields) {
        return SteamCallbackOutcome::Rejected(
            "PERFECT_STEAM_PHONE_REQUIRED: bind a mobile number before signing in".into(),
        );
    }

    if fields.get("state").map(String::as_str) != Some(expected_state) {
        return SteamCallbackOutcome::Rejected(
            "PERFECT_STEAM_STATE_MISMATCH: callback state validation failed".into(),
        );
    }

    if fields
        .get("code")
        .is_some_and(|code| !code.is_empty() && code != "0")
    {
        return SteamCallbackOutcome::Rejected(
            "PERFECT_STEAM_CALLBACK_FAILED: Steam login was rejected".into(),
        );
    }

    match (fields.remove("token"), fields.remove("steamId")) {
        (Some(token), Some(uid))
            if token.len() == 40
                && token.bytes().all(|byte| byte.is_ascii_alphanumeric())
                && uid.len() == 17
                && uid.bytes().all(|byte| byte.is_ascii_digit()) =>
        {
            SteamCallbackOutcome::Authenticated(PerfectCredential::new(token, uid, 3))
        }
        _ => SteamCallbackOutcome::Rejected(
            "PERFECT_STEAM_CALLBACK_FAILED: callback credentials are missing or invalid".into(),
        ),
    }
}

#[tauri::command]
pub async fn start_perfect_steam_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, PerfectAuthRuntime>,
) -> Result<PerfectAuthStatus, String> {
    if let Some(window) = app.get_webview_window(STEAM_WINDOW_LABEL) {
        let _ = window.close();
    }
    let generation = state.begin();
    let csrf_state = new_steam_state();
    state.publish(
        &app,
        status_for_method(PerfectAuthPhase::Requesting, "steam"),
    );

    let profile_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join(format!("perfect-steam-auth-{}", Uuid::new_v4()));
    let app_for_navigation = app.clone();
    let callback_state = csrf_state.clone();
    let window = WebviewWindowBuilder::new(
        &app,
        STEAM_WINDOW_LABEL,
        WebviewUrl::External(steam_login_url(&csrf_state)?),
    )
    .title("Steam 登录 - CS 匹配助手")
    .inner_size(920.0, 720.0)
    .min_inner_size(720.0, 560.0)
    .center()
    .data_directory(profile_dir.clone())
    .on_navigation(move |url| {
        if !is_allowed_steam_navigation(url) {
            return false;
        }
        if is_steam_callback(url) {
            let runtime = app_for_navigation.state::<PerfectAuthRuntime>();
            let outcome = parse_steam_callback(url, &callback_state);
            if matches!(&outcome, SteamCallbackOutcome::Incomplete) {
                return false;
            }
            if runtime.is_current(generation)
                && runtime.snapshot().phase == PerfectAuthPhase::Requesting
            {
                if let SteamCallbackOutcome::Rejected(error) = outcome {
                    let mut status = status_for_method(PerfectAuthPhase::Error, "steam");
                    status.error = Some(error);
                    runtime.publish(&app_for_navigation, status);
                } else if let SteamCallbackOutcome::Authenticated(credential) = outcome {
                    runtime.publish(
                        &app_for_navigation,
                        status_for_method(PerfectAuthPhase::Confirming, "steam"),
                    );
                    let app_for_validation = app_for_navigation.clone();
                    tauri::async_runtime::spawn(async move {
                        validate_and_publish(app_for_validation, generation, credential, true)
                            .await;
                    });
                }
            }
            if let Some(window) = app_for_navigation.get_webview_window(STEAM_WINDOW_LABEL) {
                let _ = window.close();
            }
            return false;
        }
        true
    })
    .build()
    .map_err(|error| error.to_string())?;

    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            let runtime = app_for_close.state::<PerfectAuthRuntime>();
            if runtime.is_current(generation)
                && runtime.snapshot().phase == PerfectAuthPhase::Requesting
            {
                let mut status = status_for_method(PerfectAuthPhase::Cancelled, "steam");
                status.error = Some("Steam login window was closed".into());
                runtime.publish(&app_for_close, status);
            }
            let _ = std::fs::remove_dir_all(&profile_dir);
        }
    });
    Ok(state.snapshot())
}

#[tauri::command]
pub async fn cancel_perfect_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, PerfectAuthRuntime>,
) -> Result<PerfectAuthStatus, String> {
    let method = state.snapshot().method.unwrap_or_else(|| "qr".into());
    state.begin();
    if let Some(window) = app.get_webview_window(STEAM_WINDOW_LABEL) {
        let _ = window.close();
    }
    let status = status_for_method(PerfectAuthPhase::Cancelled, &method);
    state.publish(&app, status.clone());
    Ok(status)
}

#[tauri::command]
pub async fn clear_perfect_auth(
    app: tauri::AppHandle,
    state: tauri::State<'_, PerfectAuthRuntime>,
) -> Result<PerfectAuthStatus, String> {
    state.begin();
    state.clear_credential()?;
    clear_player_cache().await;
    if let Some(window) = app.get_webview_window(STEAM_WINDOW_LABEL) {
        let _ = window.close();
    }
    let status = PerfectAuthStatus::default();
    state.publish(&app, status.clone());
    Ok(status)
}

pub fn current_credential(runtime: &PerfectAuthRuntime) -> Result<PerfectCredential, String> {
    runtime
        .load_credential()?
        .ok_or_else(|| "PERFECT_AUTH_REQUIRED: sign in before requesting player data".to_string())
}

pub async fn invalidate_if_needed(
    app: &tauri::AppHandle,
    runtime: &PerfectAuthRuntime,
    error: &str,
) {
    if is_auth_invalid(error) {
        let method = runtime
            .snapshot()
            .method
            .unwrap_or_else(|| "qr".to_string());
        let _ = runtime.clear_credential();
        clear_player_cache().await;
        runtime.begin();
        let mut status = status_for_method(PerfectAuthPhase::Expired, &method);
        status.error = Some("PERFECT_AUTH_INVALID: saved session expired".into());
        runtime.publish(app, status);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        is_allowed_steam_navigation, is_steam_callback, new_steam_state,
        parse_steam_callback, qr_png_data_url, steam_login_url, QrApplyRequest, QrCheckRequest,
        PerfectAuthStatus, SteamCallbackOutcome, QR_NEUTRAL_STEAM_ID,
    };
    use std::collections::HashMap;

    #[test]
    fn steam_entry_skips_the_visible_pvp_intermediate_page() {
        let state = new_steam_state();
        assert_eq!(state.len(), 18);
        let url = steam_login_url(&state).unwrap();
        let query: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(url.host_str(), Some("passport.pwesports.cn"));
        assert_eq!(query.get("appId").map(String::as_str), Some("1"));
        assert_eq!(query.get("state"), Some(&state));
        assert_eq!(
            query.get("callback").map(String::as_str),
            Some("https://pvp.wanmei.com/csgo/pwaSteam")
        );
    }

    #[test]
    fn navigation_rejects_untrusted_domains() {
        assert!(is_allowed_steam_navigation(
            &url::Url::parse("https://steamcommunity.com/openid/login").unwrap()
        ));
        assert!(is_steam_callback(&url::Url::parse(
            "https://pvp.wanmei.com/csgo/pwaSteam?state=redacted&token=redacted&steamId=76561198104088654"
        ).unwrap()));
        assert!(!is_steam_callback(
            &url::Url::parse("https://pvp.wanmei.com.evil.example/csgo/pwaSteam?token=redacted")
                .unwrap()
        ));
        assert!(!is_allowed_steam_navigation(
            &url::Url::parse("https://example.com/callback").unwrap()
        ));
    }

    #[test]
    fn empty_official_callback_does_not_consume_the_login_attempt() {
        let callback = url::Url::parse("https://pvp.wanmei.com/csgo/pwaSteam").unwrap();
        assert!(matches!(
            parse_steam_callback(&callback, "expected-state"),
            SteamCallbackOutcome::Incomplete
        ));
    }

    #[test]
    fn captured_steam_callback_accepts_the_matching_state_and_final_token() {
        let token = "a".repeat(40);
        let callback = url::Url::parse(&format!(
            "https://pvp.wanmei.com/csgo/pwaSteam?state=expected-state&token={token}&steamId=76561198104088654"
        ))
        .unwrap();
        match parse_steam_callback(&callback, "expected-state") {
            SteamCallbackOutcome::Authenticated(credential) => {
                assert_eq!(credential.access_token, token);
                assert_eq!(credential.uid, "76561198104088654");
                assert_eq!(credential.login_method, 3);
            }
            _ => panic!("matching terminal callback should authenticate"),
        }
    }

    #[test]
    fn terminal_steam_callback_still_requires_the_exact_state() {
        let token = "a".repeat(40);
        let callback = url::Url::parse(&format!(
            "https://pvp.wanmei.com/csgo/pwaSteam?state=wrong-state&token={token}&steamId=76561198104088654"
        ))
        .unwrap();
        assert!(matches!(
            parse_steam_callback(&callback, "expected-state"),
            SteamCallbackOutcome::Rejected(error)
                if error.starts_with("PERFECT_STEAM_STATE_MISMATCH:")
        ));
    }

    #[test]
    fn phone_binding_callback_is_classified_before_state_validation() {
        let callback = url::Url::parse(
            "https://pvp.wanmei.com/csgo/pwaSteam?code=&phoneToken=redacted&steamId=76561198104088654&description=bind%20mobile",
        )
        .unwrap();
        assert!(matches!(
            parse_steam_callback(&callback, "expected-state"),
            SteamCallbackOutcome::Rejected(error)
                if error.starts_with("PERFECT_STEAM_PHONE_REQUIRED:")
        ));
    }

    #[test]
    fn qr_requests_match_the_captured_protocol_and_render_png() {
        let apply = serde_json::to_string(&QrApplyRequest {
            app_id: 7,
            qr_type: 1,
            steam_id: QR_NEUTRAL_STEAM_ID,
            website: "pvp",
            redirect: false,
        })
        .unwrap();
        assert_eq!(apply.len(), 85);
        assert_eq!(
            serde_json::to_string(&QrCheckRequest {
                access_token: "00000000000000000000000000000000",
                app_id: 7,
            })
            .unwrap()
            .len(),
            60
        );
        assert!(
            qr_png_data_url("https://news.wmpvp.com?type=upgrade&accessToken=test")
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
    }

    #[test]
    fn public_status_serializes_the_full_uid() {
        let status = PerfectAuthStatus {
            uid: Some("76561199667272550".into()),
            ..Default::default()
        };
        let value = serde_json::to_value(status).unwrap();
        assert_eq!(value["uid"], "76561199667272550");
        assert!(value.get("maskedUid").is_none());
    }
}
