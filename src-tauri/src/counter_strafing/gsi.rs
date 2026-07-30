use crate::counter_strafing::types::{
    GsiConnectionState, GsiIgnoredCounts, GsiStatus, SampleContextMode,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

const CONFIG_FILENAME: &str = "gamestate_integration_cs_match_helper.cfg";
const METADATA_FILENAME: &str = "cs-match-helper-gsi.json";
const ENDPOINT_PATH: &str = "/cs-match-helper-gsi";
const PORT_START: u16 = 31980;
const PORT_END: u16 = 31989;
const MAX_BODY_SIZE: usize = 64 * 1024;
const STALE_AFTER: Duration = Duration::from_secs(3);
const AMMO_CONFIRM_WINDOW: Duration = Duration::from_millis(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GsiIgnoreReason {
    NonFirearm,
    InvalidContext,
    NotForeground,
    DeadOrSpectating,
    EmptyMagazine,
}

#[derive(Debug, Clone)]
pub struct GsiDecision {
    pub mode: SampleContextMode,
    pub allowed: bool,
    pub reason: Option<GsiIgnoreReason>,
    pub weapon_name: Option<String>,
    pub shot_confirmed: bool,
}

impl GsiDecision {
    fn basic() -> Self {
        Self {
            mode: SampleContextMode::Basic,
            allowed: true,
            reason: None,
            weapon_name: None,
            shot_confirmed: false,
        }
    }
}

#[derive(Debug, Clone, Default)]
struct ActiveWeapon {
    name: Option<String>,
    kind: Option<String>,
    ammo_clip: Option<i64>,
}

#[derive(Debug, Clone, Default)]
struct GameContext {
    provider_steam_id: Option<String>,
    player_steam_id: Option<String>,
    activity: Option<String>,
    health: Option<i64>,
    map_phase: Option<String>,
    round_phase: Option<String>,
    countdown_phase: Option<String>,
    weapon: Option<ActiveWeapon>,
}

#[derive(Default)]
struct SharedState {
    enabled: bool,
    configured: bool,
    restart_required: bool,
    port_conflict: bool,
    config_path: Option<PathBuf>,
    error: Option<String>,
    last_received: Option<Instant>,
    context: Option<GameContext>,
    last_ammo_drop: Option<(Instant, String, bool)>,
    ignored: GsiIgnoredCounts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GsiMetadata {
    port: u16,
    token: String,
    #[serde(default)]
    config_path: Option<PathBuf>,
}

struct GsiServer {
    stop: Arc<AtomicBool>,
    listener: Arc<Mutex<Option<TcpListener>>>,
    handle: Option<JoinHandle<()>>,
}

impl GsiServer {
    fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Ok(mut listener) = self.listener.lock() {
            *listener = None;
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for GsiServer {
    fn drop(&mut self) {
        self.stop();
    }
}

pub struct GsiService {
    shared: Arc<Mutex<SharedState>>,
    server: Option<GsiServer>,
}

impl Default for GsiService {
    fn default() -> Self {
        Self {
            shared: Arc::new(Mutex::new(SharedState::default())),
            server: None,
        }
    }
}

impl GsiService {
    pub fn initialize(&mut self, app: &AppHandle, enabled: bool) {
        if enabled {
            let _ = self.enable_existing(app);
        } else if let Ok(mut shared) = self.shared.lock() {
            shared.enabled = false;
        }
    }

    pub fn set_enabled(&mut self, app: &AppHandle, enabled: bool) -> Result<(), String> {
        if enabled {
            self.enable_existing(app)
        } else {
            self.stop_server();
            let remove_result = self.remove_owned_config();
            if let Ok(mut shared) = self.shared.lock() {
                *shared = SharedState::default();
            }
            emit_status(app, &self.shared);
            remove_result
        }
    }

    pub fn install_or_repair(
        &mut self,
        app: &AppHandle,
        cs2_path: Option<&str>,
    ) -> Result<GsiStatus, String> {
        let result = self.try_install_or_repair(app, cs2_path);
        if let Err(error) = &result {
            if let Ok(mut shared) = self.shared.lock() {
                shared.enabled = true;
                shared.configured = shared
                    .config_path
                    .as_ref()
                    .is_some_and(|path| path.exists());
                shared.error = Some(error.clone());
                shared.last_received = None;
                shared.context = None;
            }
            emit_status(app, &self.shared);
        }
        result
    }

    fn try_install_or_repair(
        &mut self,
        app: &AppHandle,
        cs2_path: Option<&str>,
    ) -> Result<GsiStatus, String> {
        let install_root = match cs2_path {
            Some(path) => normalize_cs2_root(Path::new(path))
                .ok_or_else(|| "所选目录不是有效的 CS2 安装目录".to_string())?,
            None => {
                discover_cs2_root().ok_or_else(|| "未找到 CS2 安装目录，请手动选择".to_string())?
            }
        };
        let cfg_dir = install_root.join("game").join("csgo").join("cfg");
        let config_path = cfg_dir.join(CONFIG_FILENAME);
        if let Ok(mut shared) = self.shared.lock() {
            shared.enabled = true;
            shared.config_path = Some(config_path.clone());
        }
        fs::create_dir_all(&cfg_dir).map_err(|e| format!("创建 CS2 GSI 配置目录失败: {e}"))?;

        self.stop_server();
        let (listener, port) = bind_first_available()?;
        let mut metadata = load_metadata().unwrap_or_else(|_| GsiMetadata {
            port,
            token: Uuid::new_v4().to_string(),
            config_path: None,
        });
        metadata.port = port;
        if metadata.token.trim().is_empty() {
            metadata.token = Uuid::new_v4().to_string();
        }
        write_gsi_config(&config_path, port, &metadata.token)?;
        metadata.config_path = Some(config_path.clone());
        save_metadata(&metadata)?;

        {
            let mut shared = self
                .shared
                .lock()
                .map_err(|_| "GSI 状态锁异常".to_string())?;
            shared.enabled = true;
            shared.configured = true;
            shared.restart_required = true;
            shared.port_conflict = false;
            shared.config_path = Some(config_path);
            shared.error = None;
            shared.last_received = None;
            shared.context = None;
        }
        self.server = Some(start_server(
            listener,
            metadata.token,
            Arc::clone(&self.shared),
            app.clone(),
        )?);
        emit_status(app, &self.shared);
        Ok(self.status())
    }

    pub fn remove_config(&mut self, app: &AppHandle) -> Result<GsiStatus, String> {
        self.remove_owned_config()?;
        if let Ok(mut shared) = self.shared.lock() {
            shared.configured = false;
            shared.restart_required = false;
        }
        emit_status(app, &self.shared);
        Ok(self.status())
    }

    pub fn shutdown(&mut self) {
        self.stop_server();
    }

    pub fn clear_ignored(&self) {
        if let Ok(mut shared) = self.shared.lock() {
            shared.ignored = GsiIgnoredCounts::default();
        }
    }

    pub fn status(&self) -> GsiStatus {
        self.shared
            .lock()
            .map(|shared| status_from_shared(&shared))
            .unwrap_or_else(|_| GsiStatus {
                enabled: true,
                connection_state: GsiConnectionState::Error,
                message: Some("GSI 状态不可用".to_string()),
                ..Default::default()
            })
    }

    pub fn decision(&self, shooting: bool) -> GsiDecision {
        let Ok(shared) = self.shared.lock() else {
            return GsiDecision::basic();
        };
        decision_from_shared(&shared, shooting, is_cs2_foreground())
    }

    pub fn record_ignored(&self, reason: GsiIgnoreReason) {
        if let Ok(mut shared) = self.shared.lock() {
            match reason {
                GsiIgnoreReason::NonFirearm => shared.ignored.non_firearm += 1,
                GsiIgnoreReason::InvalidContext => shared.ignored.invalid_context += 1,
                GsiIgnoreReason::NotForeground => shared.ignored.not_foreground += 1,
                GsiIgnoreReason::DeadOrSpectating => shared.ignored.dead_or_spectating += 1,
                GsiIgnoreReason::EmptyMagazine => shared.ignored.empty_magazine += 1,
            }
        }
    }

    pub fn claim_shot_confirmation(&self, weapon_name: &str) {
        let Ok(mut shared) = self.shared.lock() else {
            return;
        };
        if let Some((when, name, claimed)) = shared.last_ammo_drop.as_mut() {
            if !*claimed && when.elapsed() <= AMMO_CONFIRM_WINDOW && name == weapon_name {
                *claimed = true;
            }
        }
    }

    fn enable_existing(&mut self, app: &AppHandle) -> Result<(), String> {
        self.stop_server();
        let metadata = match load_metadata() {
            Ok(metadata) => metadata,
            Err(_) => {
                let mut shared = self
                    .shared
                    .lock()
                    .map_err(|_| "GSI 状态锁异常".to_string())?;
                shared.enabled = true;
                shared.configured = false;
                shared.error = None;
                drop(shared);
                emit_status(app, &self.shared);
                return Ok(());
            }
        };
        let configured = metadata
            .config_path
            .as_ref()
            .is_some_and(|path| path.exists());
        let config_path = metadata.config_path.clone();
        match TcpListener::bind(("127.0.0.1", metadata.port)) {
            Ok(listener) => {
                {
                    let mut shared = self
                        .shared
                        .lock()
                        .map_err(|_| "GSI 状态锁异常".to_string())?;
                    shared.enabled = true;
                    shared.configured = configured;
                    shared.port_conflict = false;
                    shared.config_path = config_path.clone();
                    shared.error = None;
                }
                self.server = Some(start_server(
                    listener,
                    metadata.token,
                    Arc::clone(&self.shared),
                    app.clone(),
                )?);
            }
            Err(error) => {
                let mut shared = self
                    .shared
                    .lock()
                    .map_err(|_| "GSI 状态锁异常".to_string())?;
                shared.enabled = true;
                shared.configured = configured;
                shared.port_conflict = true;
                shared.config_path = config_path;
                shared.error = Some(format!("GSI 端口 {} 被占用: {error}", metadata.port));
            }
        }
        emit_status(app, &self.shared);
        Ok(())
    }

    fn stop_server(&mut self) {
        if let Some(mut server) = self.server.take() {
            server.stop();
        }
    }

    fn remove_owned_config(&self) -> Result<(), String> {
        let Ok(metadata) = load_metadata() else {
            return Ok(());
        };
        let Some(path) = metadata.config_path else {
            return Ok(());
        };
        if path.file_name().and_then(|name| name.to_str()) != Some(CONFIG_FILENAME) {
            return Err("拒绝删除非本软件 GSI 配置".to_string());
        }
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("移除 GSI 配置失败: {e}"))?;
        }
        Ok(())
    }
}

fn decision_from_shared(
    shared: &SharedState,
    shooting: bool,
    foreground: Option<bool>,
) -> GsiDecision {
    if !shared.enabled {
        return GsiDecision::basic();
    }

    // Foreground process detection remains available when GSI has not connected yet or
    // has gone stale. It prevents desktop input from becoming training data while still
    // allowing the normal basic-mode fallback when CS2 itself is in the foreground.
    if foreground == Some(false) {
        return GsiDecision {
            mode: if is_fresh(shared.last_received) && shared.context.is_some() {
                SampleContextMode::Enhanced
            } else {
                SampleContextMode::Basic
            },
            allowed: false,
            reason: Some(GsiIgnoreReason::NotForeground),
            weapon_name: shared
                .context
                .as_ref()
                .and_then(|context| context.weapon.as_ref())
                .and_then(|weapon| weapon.name.clone()),
            shot_confirmed: false,
        };
    }

    if !is_fresh(shared.last_received) {
        if let Some(context) = shared.context.as_ref() {
            let reason = if is_dead_or_spectating(context) {
                Some(GsiIgnoreReason::DeadOrSpectating)
            } else if is_invalid_context(context) {
                Some(GsiIgnoreReason::InvalidContext)
            } else {
                None
            };
            if let Some(reason) = reason {
                return rejected_decision(SampleContextMode::Enhanced, context, reason);
            }
        } else if shared.configured && shared.error.is_none() {
            // A configured listener that has not received its first payload cannot yet
            // distinguish the lobby from live play. Wait for authoritative context.
            return GsiDecision {
                mode: SampleContextMode::Basic,
                allowed: false,
                reason: Some(GsiIgnoreReason::InvalidContext),
                weapon_name: None,
                shot_confirmed: false,
            };
        }
        return GsiDecision::basic();
    }
    let Some(context) = shared.context.as_ref() else {
        return GsiDecision::basic();
    };

    let weapon_name = context
        .weapon
        .as_ref()
        .and_then(|weapon| weapon.name.clone());
    let reject = |reason| GsiDecision {
        mode: SampleContextMode::Enhanced,
        allowed: false,
        reason: Some(reason),
        weapon_name: weapon_name.clone(),
        shot_confirmed: false,
    };

    if is_dead_or_spectating(context) {
        return reject(GsiIgnoreReason::DeadOrSpectating);
    }
    if is_invalid_context(context) {
        return reject(GsiIgnoreReason::InvalidContext);
    }
    let shot_confirmed = shooting
        && shared
            .last_ammo_drop
            .as_ref()
            .is_some_and(|(when, name, claimed)| {
                !*claimed
                    && when.elapsed() <= AMMO_CONFIRM_WINDOW
                    && weapon_name.as_deref().is_some_and(|weapon| weapon == name)
            });
    if shooting {
        if context.weapon.as_ref().is_some_and(is_non_firearm) {
            return reject(GsiIgnoreReason::NonFirearm);
        }
        if context.weapon.as_ref().and_then(|weapon| weapon.ammo_clip) == Some(0) && !shot_confirmed
        {
            return reject(GsiIgnoreReason::EmptyMagazine);
        }
    }
    GsiDecision {
        mode: SampleContextMode::Enhanced,
        allowed: true,
        reason: None,
        weapon_name,
        shot_confirmed,
    }
}

fn rejected_decision(
    mode: SampleContextMode,
    context: &GameContext,
    reason: GsiIgnoreReason,
) -> GsiDecision {
    GsiDecision {
        mode,
        allowed: false,
        reason: Some(reason),
        weapon_name: context
            .weapon
            .as_ref()
            .and_then(|weapon| weapon.name.clone()),
        shot_confirmed: false,
    }
}

fn start_server(
    listener: TcpListener,
    token: String,
    shared: Arc<Mutex<SharedState>>,
    app: AppHandle,
) -> Result<GsiServer, String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("配置 GSI 监听失败: {e}"))?;
    let listener = Arc::new(Mutex::new(Some(listener)));
    let listener_for_thread = Arc::clone(&listener);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = Arc::clone(&stop);
    let handle = thread::Builder::new()
        .name("counter-strafing-gsi".to_string())
        .spawn(move || {
            let mut last_state = GsiConnectionState::WaitingForGame;
            while !stop_for_thread.load(Ordering::SeqCst) {
                let accepted = listener_for_thread
                    .lock()
                    .ok()
                    .and_then(|guard| guard.as_ref().map(TcpListener::accept));
                match accepted {
                    Some(Ok((mut stream, _))) => {
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                        let response = match read_request_body(&mut stream) {
                            Ok(body) => match parse_payload(&body, &token) {
                                Ok(context) => {
                                    update_context(&shared, context);
                                    "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                                }
                                Err(_) => "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                            },
                            Err(_) => "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        };
                        let _ = stream.write_all(response.as_bytes());
                    }
                    Some(Err(error)) if error.kind() == ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(20));
                    }
                    Some(Err(_)) => thread::sleep(Duration::from_millis(50)),
                    None => break,
                }

                let state = shared
                    .lock()
                    .map(|guard| status_from_shared(&guard).connection_state)
                    .unwrap_or(GsiConnectionState::Error);
                if state != last_state {
                    last_state = state;
                    emit_status(&app, &shared);
                }
            }
        })
        .map_err(|e| format!("启动 GSI 监听线程失败: {e}"))?;
    Ok(GsiServer {
        stop,
        listener,
        handle: Some(handle),
    })
}

fn read_request_body(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::with_capacity(4096);
    let mut chunk = [0u8; 4096];
    let header_end = loop {
        let read = stream.read(&mut chunk).map_err(|e| e.to_string())?;
        if read == 0 {
            return Err("请求不完整".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > MAX_BODY_SIZE + 8192 {
            return Err("请求过大".to_string());
        }
        if let Some(index) = find_bytes(&buffer, b"\r\n\r\n") {
            break index + 4;
        }
    };
    let headers = String::from_utf8_lossy(&buffer[..header_end]);
    let first = headers.lines().next().unwrap_or_default();
    if !first.starts_with(&format!("POST {ENDPOINT_PATH} ")) {
        return Err("无效请求路径".to_string());
    }
    let content_length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .ok_or_else(|| "缺少 Content-Length".to_string())?;
    if content_length > MAX_BODY_SIZE {
        return Err("请求体过大".to_string());
    }
    while buffer.len() < header_end + content_length {
        let read = stream.read(&mut chunk).map_err(|e| e.to_string())?;
        if read == 0 {
            return Err("请求体不完整".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
    }
    Ok(buffer[header_end..header_end + content_length].to_vec())
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn parse_payload(body: &[u8], token: &str) -> Result<GameContext, String> {
    let value: Value = serde_json::from_slice(body).map_err(|e| e.to_string())?;
    if value.pointer("/auth/token").and_then(Value::as_str) != Some(token) {
        return Err("GSI 鉴权失败".to_string());
    }
    let weapon = value
        .pointer("/player/weapons")
        .and_then(Value::as_object)
        .and_then(|weapons| {
            weapons.values().find_map(|weapon| {
                (weapon.get("state").and_then(Value::as_str) == Some("active")).then(|| {
                    ActiveWeapon {
                        name: weapon
                            .get("name")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        kind: weapon
                            .get("type")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        ammo_clip: weapon.get("ammo_clip").and_then(Value::as_i64),
                    }
                })
            })
        });
    Ok(GameContext {
        provider_steam_id: json_string(&value, "/provider/steamid"),
        player_steam_id: json_string(&value, "/player/steamid"),
        activity: json_string(&value, "/player/activity"),
        health: value
            .pointer("/player/state/health")
            .and_then(Value::as_i64),
        map_phase: json_string(&value, "/map/phase"),
        round_phase: json_string(&value, "/round/phase"),
        countdown_phase: json_string(&value, "/phase_countdowns/phase"),
        weapon,
    })
}

fn json_string(value: &Value, pointer: &str) -> Option<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn update_context(shared: &Arc<Mutex<SharedState>>, context: GameContext) {
    let Ok(mut shared) = shared.lock() else {
        return;
    };
    if let (Some(previous), Some(current)) = (
        shared.context.as_ref().and_then(|ctx| ctx.weapon.as_ref()),
        context.weapon.as_ref(),
    ) {
        if previous.name == current.name
            && previous
                .ammo_clip
                .zip(current.ammo_clip)
                .is_some_and(|(old, new)| new < old)
        {
            if let Some(name) = current.name.clone() {
                shared.last_ammo_drop = Some((Instant::now(), name, false));
            }
        }
    }
    shared.context = Some(context);
    shared.last_received = Some(Instant::now());
    shared.restart_required = false;
    shared.error = None;
}

fn status_from_shared(shared: &SharedState) -> GsiStatus {
    let age = shared.last_received.map(|time| time.elapsed());
    let connection_state = if !shared.enabled {
        GsiConnectionState::Disabled
    } else if shared.port_conflict {
        GsiConnectionState::PortConflict
    } else if shared.error.is_some() {
        GsiConnectionState::Error
    } else if !shared.configured {
        GsiConnectionState::NotConfigured
    } else if age.is_none() {
        GsiConnectionState::WaitingForGame
    } else if age.is_some_and(|age| age > STALE_AFTER) {
        GsiConnectionState::Stale
    } else {
        GsiConnectionState::Connected
    };
    GsiStatus {
        enabled: shared.enabled,
        configured: shared.configured,
        connection_state,
        restart_required: shared.restart_required,
        config_path: shared
            .config_path
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned()),
        last_update_age_ms: age.map(|age| age.as_millis().min(u64::MAX as u128) as u64),
        active_weapon: shared
            .context
            .as_ref()
            .and_then(|context| context.weapon.as_ref())
            .and_then(|weapon| weapon.name.clone()),
        ignored: shared.ignored.clone(),
        message: shared.error.clone(),
    }
}

fn emit_status(app: &AppHandle, shared: &Arc<Mutex<SharedState>>) {
    if let Ok(shared) = shared.lock() {
        let _ = app.emit("counter-strafing-gsi-status", status_from_shared(&shared));
    }
}

fn is_fresh(last_received: Option<Instant>) -> bool {
    last_received.is_some_and(|time| time.elapsed() <= STALE_AFTER)
}

fn is_dead_or_spectating(context: &GameContext) -> bool {
    if context.health.is_some_and(|health| health <= 0) {
        return true;
    }
    matches!(
        (&context.provider_steam_id, &context.player_steam_id),
        (Some(provider), Some(player)) if provider != player
    )
}

fn is_invalid_context(context: &GameContext) -> bool {
    if context.activity.as_deref() != Some("playing") {
        return true;
    }
    context
        .round_phase
        .as_deref()
        .is_some_and(|value| matches!(value, "freezetime" | "over"))
        || context
            .map_phase
            .as_deref()
            .is_some_and(|value| matches!(value, "intermission" | "gameover"))
        || context.countdown_phase.as_deref().is_some_and(|value| {
            matches!(
                value,
                "freezetime" | "paused" | "timeout" | "timeout_t" | "timeout_ct" | "over"
            )
        })
}

fn is_non_firearm(weapon: &ActiveWeapon) -> bool {
    let name = weapon
        .name
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let kind = weapon
        .kind
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    kind.contains("knife")
        || kind.contains("grenade")
        || matches!(kind.as_str(), "c4" | "equipment" | "stackableitem")
        || name.contains("knife")
        || matches!(
            name.as_str(),
            "weapon_c4"
                | "weapon_flashbang"
                | "weapon_hegrenade"
                | "weapon_smokegrenade"
                | "weapon_molotov"
                | "weapon_incgrenade"
                | "weapon_decoy"
                | "weapon_healthshot"
                | "weapon_bumpmine"
        )
}

fn metadata_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法获取程序路径: {e}"))?;
    let parent = exe
        .parent()
        .ok_or_else(|| "无法获取程序所在目录".to_string())?;
    Ok(parent.join(METADATA_FILENAME))
}

fn load_metadata() -> Result<GsiMetadata, String> {
    let path = metadata_path()?;
    let content = fs::read_to_string(&path).map_err(|e| format!("读取 GSI 配置元数据失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析 GSI 配置元数据失败: {e}"))
}

fn save_metadata(metadata: &GsiMetadata) -> Result<(), String> {
    let path = metadata_path()?;
    let content = serde_json::to_string_pretty(metadata).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| format!("保存 GSI 配置元数据失败: {e}"))
}

fn bind_first_available() -> Result<(TcpListener, u16), String> {
    for port in PORT_START..=PORT_END {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            return Ok((listener, port));
        }
    }
    Err(format!("GSI 端口 {PORT_START}-{PORT_END} 均被占用"))
}

fn write_gsi_config(path: &Path, port: u16, token: &str) -> Result<(), String> {
    let content = format!(
        "\"CS Match Helper\"\n{{\n  \"uri\" \"http://127.0.0.1:{port}{ENDPOINT_PATH}\"\n  \"timeout\" \"5.0\"\n  \"buffer\" \"0.0\"\n  \"throttle\" \"0.05\"\n  \"heartbeat\" \"1.0\"\n  \"auth\" {{ \"token\" \"{token}\" }}\n  \"data\"\n  {{\n    \"provider\" \"1\"\n    \"map\" \"1\"\n    \"round\" \"1\"\n    \"player_id\" \"1\"\n    \"player_state\" \"1\"\n    \"player_weapons\" \"1\"\n    \"phase_countdowns\" \"1\"\n  }}\n}}\n"
    );
    fs::write(path, content).map_err(|e| format!("写入 CS2 GSI 配置失败: {e}"))
}

fn normalize_cs2_root(path: &Path) -> Option<PathBuf> {
    let mut candidates = vec![path.to_path_buf()];
    if let Some(root) = path.parent().and_then(Path::parent).and_then(Path::parent) {
        candidates.push(root.to_path_buf());
    }
    candidates
        .into_iter()
        .find(|candidate| candidate.join("game").join("csgo").join("cfg").is_dir())
}

fn discover_cs2_root() -> Option<PathBuf> {
    discover_cs2_root_from(steam_install_roots())
}

fn discover_cs2_root_from(mut steam_roots: Vec<PathBuf>) -> Option<PathBuf> {
    steam_roots.sort();
    steam_roots.dedup();
    let mut libraries = steam_roots.clone();
    for root in &steam_roots {
        let file = root.join("steamapps").join("libraryfolders.vdf");
        let Ok(content) = fs::read_to_string(file) else {
            continue;
        };
        for line in content.lines() {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 4 && parts[1].trim() == "path" {
                libraries.push(PathBuf::from(parts[3].replace("\\\\", "\\")));
            }
        }
    }
    libraries.sort();
    libraries.dedup();
    for library in libraries {
        let manifest = library.join("steamapps").join("appmanifest_730.acf");
        let Ok(content) = fs::read_to_string(manifest) else {
            continue;
        };
        let install_dir = content.lines().find_map(|line| {
            let parts: Vec<&str> = line.split('"').collect();
            (parts.len() >= 4 && parts[1].trim() == "installdir").then(|| parts[3])
        })?;
        let root = library.join("steamapps").join("common").join(install_dir);
        if normalize_cs2_root(&root).is_some() {
            return Some(root);
        }
    }
    None
}

#[cfg(windows)]
fn steam_install_roots() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    let mut roots = Vec::new();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        if let Ok(key) = RegKey::predef(hive).open_subkey("Software\\Valve\\Steam") {
            for value_name in ["SteamPath", "InstallPath"] {
                if let Ok(path) = key.get_value::<String, _>(value_name) {
                    roots.push(PathBuf::from(path));
                }
            }
        }
    }
    roots.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
    roots
}

#[cfg(not(windows))]
fn steam_install_roots() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(windows)]
fn is_cs2_foreground() -> Option<bool> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let window = GetForegroundWindow();
        if window.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(window, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buffer = [0u16; 32768];
        let mut size = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(process);
        result.ok()?;
        let path = String::from_utf16_lossy(&buffer[..size as usize]);
        Some(
            Path::new(&path)
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.eq_ignore_ascii_case("cs2.exe")),
        )
    }
}

#[cfg(not(windows))]
fn is_cs2_foreground() -> Option<bool> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(token: &str, weapon_type: &str, weapon_name: &str, ammo: i64) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "auth": { "token": token },
            "provider": { "steamid": "1" },
            "player": {
                "steamid": "1",
                "activity": "playing",
                "state": { "health": 100 },
                "weapons": {
                    "weapon_0": {
                        "name": weapon_name,
                        "type": weapon_type,
                        "state": "active",
                        "ammo_clip": ammo
                    }
                }
            },
            "round": { "phase": "live" }
        }))
        .unwrap()
    }

    fn shared_with(context: GameContext) -> SharedState {
        SharedState {
            enabled: true,
            configured: true,
            last_received: Some(Instant::now()),
            context: Some(context),
            ..Default::default()
        }
    }

    #[test]
    fn parses_active_weapon_and_auth() {
        let context =
            parse_payload(&payload("secret", "Rifle", "weapon_ak47", 29), "secret").unwrap();
        let weapon = context.weapon.unwrap();
        assert_eq!(weapon.name.as_deref(), Some("weapon_ak47"));
        assert_eq!(weapon.ammo_clip, Some(29));
    }

    #[test]
    fn rejects_wrong_auth() {
        assert!(parse_payload(&payload("wrong", "Rifle", "weapon_ak47", 29), "secret").is_err());
    }

    #[test]
    fn accepts_missing_and_unknown_fields() {
        let missing = serde_json::to_vec(&serde_json::json!({ "auth": { "token": "x" } })).unwrap();
        let context = parse_payload(&missing, "x").unwrap();
        assert!(context.weapon.is_none());

        let context =
            parse_payload(&payload("x", "FutureWeapon", "weapon_future", 7), "x").unwrap();
        let decision = decision_from_shared(&shared_with(context), true, Some(true));
        assert!(decision.allowed);
        assert_eq!(decision.mode, SampleContextMode::Enhanced);
    }

    #[test]
    fn classifies_non_firearms() {
        for (name, kind) in [
            ("weapon_knife", "Knife"),
            ("weapon_flashbang", "Grenade"),
            ("weapon_c4", "C4"),
        ] {
            assert!(is_non_firearm(&ActiveWeapon {
                name: Some(name.to_string()),
                kind: Some(kind.to_string()),
                ammo_clip: None,
            }));
        }
        assert!(!is_non_firearm(&ActiveWeapon {
            name: Some("weapon_awp".to_string()),
            kind: Some("SniperRifle".to_string()),
            ammo_clip: Some(10),
        }));
    }

    #[test]
    fn warmup_is_allowed_but_freezetime_is_not() {
        let mut context = parse_payload(&payload("x", "Rifle", "weapon_ak47", 30), "x").unwrap();
        context.map_phase = Some("warmup".to_string());
        assert!(!is_invalid_context(&context));
        context.round_phase = Some("freezetime".to_string());
        assert!(is_invalid_context(&context));
        context.round_phase = Some("live".to_string());
        context.activity = Some("menu".to_string());
        assert!(is_invalid_context(&context));
        context.activity = Some("playing".to_string());
        context.countdown_phase = Some("timeout_ct".to_string());
        assert!(is_invalid_context(&context));
    }

    #[test]
    fn filters_non_firearm_dead_spectator_and_invalid_phase() {
        let knife = parse_payload(&payload("x", "Knife", "weapon_knife", 0), "x").unwrap();
        assert_eq!(
            decision_from_shared(&shared_with(knife), true, Some(true)).reason,
            Some(GsiIgnoreReason::NonFirearm)
        );

        let mut dead = parse_payload(&payload("x", "Rifle", "weapon_ak47", 30), "x").unwrap();
        dead.health = Some(0);
        assert_eq!(
            decision_from_shared(&shared_with(dead), true, Some(true)).reason,
            Some(GsiIgnoreReason::DeadOrSpectating)
        );

        let mut spectating = parse_payload(&payload("x", "Rifle", "weapon_ak47", 30), "x").unwrap();
        spectating.player_steam_id = Some("2".to_string());
        assert_eq!(
            decision_from_shared(&shared_with(spectating), true, Some(true)).reason,
            Some(GsiIgnoreReason::DeadOrSpectating)
        );

        let mut frozen = parse_payload(&payload("x", "Rifle", "weapon_ak47", 30), "x").unwrap();
        frozen.round_phase = Some("freezetime".to_string());
        assert_eq!(
            decision_from_shared(&shared_with(frozen), true, Some(true)).reason,
            Some(GsiIgnoreReason::InvalidContext)
        );
    }

    #[test]
    fn empty_magazine_is_filtered_but_confirmed_last_shot_is_kept() {
        let context = parse_payload(&payload("x", "Rifle", "weapon_ak47", 0), "x").unwrap();
        let mut shared = shared_with(context);
        assert_eq!(
            decision_from_shared(&shared, true, Some(true)).reason,
            Some(GsiIgnoreReason::EmptyMagazine)
        );

        shared.last_ammo_drop = Some((Instant::now(), "weapon_ak47".to_string(), false));
        let decision = decision_from_shared(&shared, true, Some(true));
        assert!(decision.allowed);
        assert!(decision.shot_confirmed);

        if let Some((_, _, claimed)) = shared.last_ammo_drop.as_mut() {
            *claimed = true;
        }
        assert_eq!(
            decision_from_shared(&shared, true, Some(true)).reason,
            Some(GsiIgnoreReason::EmptyMagazine)
        );
    }

    #[test]
    fn stale_valid_state_falls_back_without_weapon_filtering() {
        let context = parse_payload(&payload("x", "Knife", "weapon_knife", 0), "x").unwrap();
        let mut shared = shared_with(context);
        shared.last_received = Instant::now().checked_sub(Duration::from_secs(4));
        let decision = decision_from_shared(&shared, true, Some(true));
        assert!(decision.allowed);
        assert_eq!(decision.mode, SampleContextMode::Basic);
    }

    #[test]
    fn configured_listener_waits_for_first_payload() {
        let shared = SharedState {
            enabled: true,
            configured: true,
            ..Default::default()
        };
        let decision = decision_from_shared(&shared, true, Some(true));
        assert!(!decision.allowed);
        assert_eq!(decision.reason, Some(GsiIgnoreReason::InvalidContext));
    }

    #[test]
    fn stale_lobby_state_remains_filtered() {
        let mut context = parse_payload(&payload("x", "Rifle", "weapon_ak47", 30), "x").unwrap();
        context.activity = Some("menu".to_string());
        let mut shared = shared_with(context);
        shared.last_received = Instant::now().checked_sub(Duration::from_secs(4));

        let decision = decision_from_shared(&shared, true, Some(true));
        assert!(!decision.allowed);
        assert_eq!(decision.mode, SampleContextMode::Enhanced);
        assert_eq!(decision.reason, Some(GsiIgnoreReason::InvalidContext));
    }

    #[test]
    fn stale_or_missing_state_still_filters_when_cs2_is_not_foreground() {
        let context = parse_payload(&payload("x", "Rifle", "weapon_ak47", 30), "x").unwrap();
        let mut stale = shared_with(context);
        stale.last_received = Instant::now().checked_sub(Duration::from_secs(4));

        for shared in [
            stale,
            SharedState {
                enabled: true,
                ..Default::default()
            },
        ] {
            let decision = decision_from_shared(&shared, true, Some(false));
            assert!(!decision.allowed);
            assert_eq!(decision.mode, SampleContextMode::Basic);
            assert_eq!(decision.reason, Some(GsiIgnoreReason::NotForeground));
        }
    }

    #[test]
    fn failed_setup_exposes_target_path_and_uses_basic_fallback() {
        let config_path = PathBuf::from(
            r"D:\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg",
        )
        .join(CONFIG_FILENAME);
        let shared = SharedState {
            enabled: true,
            config_path: Some(config_path.clone()),
            error: Some("写入配置失败".to_string()),
            ..Default::default()
        };

        let status = status_from_shared(&shared);
        assert_eq!(status.connection_state, GsiConnectionState::Error);
        assert_eq!(
            status.config_path.as_deref(),
            Some(config_path.to_string_lossy().as_ref())
        );
        let decision = decision_from_shared(&shared, true, Some(true));
        assert!(decision.allowed);
        assert_eq!(decision.mode, SampleContextMode::Basic);
    }

    #[test]
    fn fresh_payload_restores_filtering_after_stale_fallback() {
        let context = parse_payload(&payload("x", "Knife", "weapon_knife", 0), "x").unwrap();
        let shared = Arc::new(Mutex::new(shared_with(context.clone())));
        shared.lock().unwrap().last_received = Instant::now().checked_sub(Duration::from_secs(4));
        assert_eq!(
            decision_from_shared(&shared.lock().unwrap(), true, Some(true)).mode,
            SampleContextMode::Basic
        );

        update_context(&shared, context);
        let decision = decision_from_shared(&shared.lock().unwrap(), true, Some(true));
        assert_eq!(decision.mode, SampleContextMode::Enhanced);
        assert_eq!(decision.reason, Some(GsiIgnoreReason::NonFirearm));
    }

    #[test]
    fn rejects_oversized_http_body_before_reading_payload() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        let mut client = TcpStream::connect(address).unwrap();
        let (mut server, _) = listener.accept().unwrap();
        let request = format!(
            "POST {ENDPOINT_PATH} HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            MAX_BODY_SIZE + 1
        );
        client.write_all(request.as_bytes()).unwrap();
        assert!(read_request_body(&mut server).is_err());
    }

    #[test]
    fn reports_when_all_reserved_ports_are_occupied() {
        let listeners: Vec<_> = (PORT_START..=PORT_END)
            .filter_map(|port| TcpListener::bind(("127.0.0.1", port)).ok())
            .collect();
        assert!(bind_first_available().is_err());
        drop(listeners);
    }

    #[test]
    fn generated_config_has_only_required_subscriptions() {
        let path = std::env::temp_dir().join(format!("gsi-config-{}.cfg", Uuid::new_v4()));
        write_gsi_config(&path, PORT_START, "secret").unwrap();
        write_gsi_config(&path, PORT_START, "secret").unwrap();
        let content = fs::read_to_string(&path).unwrap();
        for key in [
            "provider",
            "map",
            "round",
            "player_id",
            "player_state",
            "player_weapons",
            "phase_countdowns",
        ] {
            assert!(content.contains(&format!("\"{key}\" \"1\"")));
        }
        assert!(content.contains("\"buffer\" \"0.0\""));
        assert!(content.contains("\"throttle\" \"0.05\""));
        assert!(content.contains("\"heartbeat\" \"1.0\""));
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn discovers_cs2_in_a_secondary_steam_library() {
        let temp = std::env::temp_dir().join(format!("gsi-steam-{}", Uuid::new_v4()));
        let steam_root = temp.join("steam");
        let library = temp.join("library");
        let cs2_root = library
            .join("steamapps")
            .join("common")
            .join("Counter-Strike Global Offensive");
        fs::create_dir_all(steam_root.join("steamapps")).unwrap();
        fs::create_dir_all(cs2_root.join("game").join("csgo").join("cfg")).unwrap();
        let vdf_path = library.to_string_lossy().replace('\\', "\\\\");
        fs::write(
            steam_root.join("steamapps").join("libraryfolders.vdf"),
            format!("\"libraryfolders\"\n{{\n  \"1\"\n  {{\n    \"path\" \"{vdf_path}\"\n  }}\n}}"),
        )
        .unwrap();
        fs::create_dir_all(library.join("steamapps")).unwrap();
        fs::write(
            library.join("steamapps").join("appmanifest_730.acf"),
            "\"AppState\"\n{\n  \"installdir\" \"Counter-Strike Global Offensive\"\n}",
        )
        .unwrap();

        assert_eq!(discover_cs2_root_from(vec![steam_root]), Some(cs2_root));
        fs::remove_dir_all(temp).unwrap();
    }

    #[test]
    fn normalizes_a_manually_selected_cfg_directory() {
        let temp = std::env::temp_dir().join(format!("gsi-manual-{}", Uuid::new_v4()));
        let cfg = temp.join("game").join("csgo").join("cfg");
        fs::create_dir_all(&cfg).unwrap();
        assert_eq!(normalize_cs2_root(&cfg), Some(temp.clone()));
        fs::remove_dir_all(temp).unwrap();
    }
}
