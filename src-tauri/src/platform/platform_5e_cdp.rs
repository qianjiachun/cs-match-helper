use super::platform_5e_launch::{
    detect_client_root, is_5e_process_running, is_cdp_port_reachable, P5E_DEFAULT_CDP_PORT,
};
use super::platform_5e_sink::{
    build_http_event_with_mode, is_whitelisted_url, parse_json_body, should_capture_url,
    P5eHttpEvent,
};
use super::platform_5e_ws::{
    build_ws_close_event, build_ws_open_event, decode_ws_frame, is_comet_ws_url,
};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use tokio_tungstenite::tungstenite::Message;

const ARENA_HOST: &str = "view-arena.5eplay.com";
const ARENA_TARGET_POLL_MS: u64 = 500;
const ARENA_TARGET_MAX_WAIT_MS: u64 = 120_000;
const RECONNECT_BASE_MS: u64 = 2000;
const RECONNECT_MAX_MS: u64 = 30_000;
const CDP_LOST_RELAUNCH_MS: u64 = 45_000;
const MAX_PENDING_REQUESTS: usize = 512;
const MAX_BODY_RETRIES: u8 = 2;
const GATE_DEBUG_BODY_CAP: usize = 64 * 1024;
const EMIT_THROTTLE_MS: u128 = 200;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct P5eCdpStatus {
    pub running: bool,
    pub port: u16,
    pub phase: String,
    pub client_root: Option<String>,
    pub target_url: Option<String>,
    pub target_title: Option<String>,
    pub events_emitted: u64,
    pub last_error: Option<String>,
    pub gate_debug_mode: bool,
    pub ws_debug_mode: bool,
    pub client_exited: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub needs_relaunch: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cdp_lost_since: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

struct RuntimeInner {
    running: bool,
    port: u16,
    phase: String,
    client_root: Option<String>,
    target_url: Option<String>,
    target_title: Option<String>,
    last_error: Option<String>,
    client_exited: bool,
    needs_relaunch: bool,
    cdp_lost_since: Option<String>,
    reason: Option<String>,
    stop_tx: Option<oneshot::Sender<()>>,
}

impl Default for RuntimeInner {
    fn default() -> Self {
        Self {
            running: false,
            port: P5E_DEFAULT_CDP_PORT,
            phase: "idle".to_string(),
            client_root: None,
            target_url: None,
            target_title: None,
            last_error: None,
            client_exited: false,
            needs_relaunch: false,
            cdp_lost_since: None,
            reason: None,
            stop_tx: None,
        }
    }
}

struct CdpShared {
    inner: Mutex<RuntimeInner>,
    events_emitted: AtomicU64,
    gate_debug_mode: AtomicBool,
    ws_debug_mode: AtomicBool,
}

#[derive(Clone)]
pub struct P5eCdpRuntime {
    shared: Arc<CdpShared>,
}

impl Default for P5eCdpRuntime {
    fn default() -> Self {
        Self {
            shared: Arc::new(CdpShared {
                inner: Mutex::new(RuntimeInner::default()),
                events_emitted: AtomicU64::new(0),
                gate_debug_mode: AtomicBool::new(true),
                ws_debug_mode: AtomicBool::new(true),
            }),
        }
    }
}

fn lock_runtime(m: &Mutex<RuntimeInner>) -> MutexGuard<'_, RuntimeInner> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn reconnect_delay_ms(attempt: u32) -> u64 {
    let exp = attempt.min(4);
    (RECONNECT_BASE_MS.saturating_mul(1u64 << exp)).min(RECONNECT_MAX_MS)
}

fn cdp_lost_elapsed_ms(since: std::time::Instant, now: std::time::Instant) -> u64 {
    now.duration_since(since).as_millis() as u64
}

pub(crate) fn should_request_cdp_relaunch(elapsed_ms: u64) -> bool {
    elapsed_ms >= CDP_LOST_RELAUNCH_MS
}

fn status_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{ms}")
}

#[derive(Clone)]
struct PendingRequest {
    url: String,
    method: String,
    post: Option<String>,
    is_whitelist: bool,
}

struct PendingBody {
    url: String,
    method: String,
    post: Option<String>,
    network_request_id: String,
    retries: u8,
}

struct PendingRequestQueue {
    map: HashMap<String, PendingRequest>,
    order: Vec<String>,
}

impl PendingRequestQueue {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
            order: Vec::new(),
        }
    }

    fn evict_one(&mut self) {
        if self.order.is_empty() {
            return;
        }
        let evict_idx = self
            .order
            .iter()
            .position(|id| self.map.get(id).is_some_and(|entry| !entry.is_whitelist))
            .unwrap_or(0);
        let id = self.order.remove(evict_idx);
        self.map.remove(&id);
    }

    fn has_non_whitelist(&self) -> bool {
        self.order
            .iter()
            .any(|id| self.map.get(id).is_some_and(|entry| !entry.is_whitelist))
    }

    fn insert(&mut self, req_id: String, entry: PendingRequest) {
        if self.map.len() >= MAX_PENDING_REQUESTS && !self.map.contains_key(&req_id) {
            if entry.is_whitelist {
                // 白名单请求不因队列满而丢弃；仅淘汰非白名单条目，必要时允许白名单溢出。
                if self.has_non_whitelist() {
                    self.evict_one();
                }
            } else {
                self.evict_one();
            }
        }
        if !self.map.contains_key(&req_id) {
            self.order.push(req_id.clone());
        }
        self.map.insert(req_id, entry);
    }

    fn remove(&mut self, req_id: &str) -> Option<PendingRequest> {
        let entry = self.map.remove(req_id)?;
        if let Some(pos) = self.order.iter().position(|id| id == req_id) {
            self.order.remove(pos);
        }
        Some(entry)
    }

    fn take(&mut self, req_id: &str) -> Option<PendingRequest> {
        let entry = self.map.remove(req_id)?;
        if let Some(pos) = self.order.iter().position(|id| id == req_id) {
            self.order.remove(pos);
        }
        Some(entry)
    }
}

fn cap_gate_debug_body(url: &str, gate_debug_mode: bool, body: Option<Value>) -> Option<Value> {
    if !gate_debug_mode || is_whitelisted_url(url) {
        return body;
    }
    let Some(value) = body else {
        return None;
    };
    let serialized = value.to_string();
    if serialized.len() <= GATE_DEBUG_BODY_CAP {
        return Some(value);
    }
    Some(Value::String(format!(
        "[truncated gate debug body: {} bytes]",
        serialized.len()
    )))
}

impl P5eCdpRuntime {
    fn status_from_guard(
        g: &RuntimeInner,
        events_emitted: u64,
        gate_debug_mode: bool,
        ws_debug_mode: bool,
    ) -> P5eCdpStatus {
        P5eCdpStatus {
            running: g.running,
            port: g.port,
            phase: g.phase.clone(),
            client_root: g.client_root.clone(),
            target_url: g.target_url.clone(),
            target_title: g.target_title.clone(),
            events_emitted,
            last_error: g.last_error.clone(),
            gate_debug_mode,
            ws_debug_mode,
            client_exited: g.client_exited,
            needs_relaunch: g.needs_relaunch,
            cdp_lost_since: g.cdp_lost_since.clone(),
            reason: g.reason.clone(),
        }
    }

    pub fn status(&self) -> P5eCdpStatus {
        let g = lock_runtime(&self.shared.inner);
        let events = self.shared.events_emitted.load(Ordering::Relaxed);
        let gate_debug_mode = self.shared.gate_debug_mode.load(Ordering::Relaxed);
        let ws_debug_mode = self.shared.ws_debug_mode.load(Ordering::Relaxed);
        Self::status_from_guard(&g, events, gate_debug_mode, ws_debug_mode)
    }

    pub fn set_gate_debug_mode(&self, enabled: bool) {
        self.shared
            .gate_debug_mode
            .store(enabled, Ordering::Relaxed);
    }

    pub fn set_ws_debug_mode(&self, enabled: bool) {
        self.shared
            .ws_debug_mode
            .store(enabled, Ordering::Relaxed);
    }

    pub async fn start(
        &self,
        app: AppHandle,
        port: Option<u16>,
        client_root: Option<String>,
    ) -> Result<P5eCdpStatus, String> {
        let resolved_port = port.ok_or_else(|| "必须指定已验证的 CDP 端口".to_string())?;

        if !is_cdp_port_reachable(resolved_port).await {
            return Err(format!(
                "端口 {resolved_port} 上的 CDP 不可达，请确认 5E 已成功启动"
            ));
        }

        let root = detect_client_root(client_root.as_deref())?;

        {
            let mut g = lock_runtime(&self.shared.inner);
            if g.running {
                let events = self.shared.events_emitted.load(Ordering::Relaxed);
                let gate_debug_mode = self.shared.gate_debug_mode.load(Ordering::Relaxed);
                let ws_debug_mode = self.shared.ws_debug_mode.load(Ordering::Relaxed);
                return Ok(Self::status_from_guard(&g, events, gate_debug_mode, ws_debug_mode));
            }
            g.running = true;
            g.port = resolved_port;
            g.phase = "collecting".to_string();
            g.client_root = Some(root.display().to_string());
            g.last_error = None;
            g.client_exited = false;
            g.needs_relaunch = false;
            g.cdp_lost_since = None;
            g.reason = None;
            g.target_url = None;
            g.target_title = None;
        }

        let (stop_tx, stop_rx) = oneshot::channel();
        {
            let mut g = lock_runtime(&self.shared.inner);
            g.stop_tx = Some(stop_tx);
        }

        let worker = self.clone();
        let app_clone = app.clone();
        tokio::spawn(async move {
            if let Err(err) = collector_loop(app_clone, worker, resolved_port, root, stop_rx).await
            {
                eprintln!("[5e-cdp] {err}");
            }
        });

        Ok(self.status())
    }

    pub fn stop(&self) -> P5eCdpStatus {
        let (snapshot, stop_tx) = {
            let mut g = lock_runtime(&self.shared.inner);
            g.running = false;
            g.phase = "stopped".to_string();
            let events = self.shared.events_emitted.load(Ordering::Relaxed);
            let gate_debug_mode = self.shared.gate_debug_mode.load(Ordering::Relaxed);
            let ws_debug_mode = self.shared.ws_debug_mode.load(Ordering::Relaxed);
            let snapshot = Self::status_from_guard(&g, events, gate_debug_mode, ws_debug_mode);
            let stop_tx = g.stop_tx.take();
            (snapshot, stop_tx)
        };
        if let Some(tx) = stop_tx {
            let _ = tx.send(());
        }
        snapshot
    }
}

pub fn get_cdp_status(state: tauri::State<'_, P5eCdpRuntime>) -> P5eCdpStatus {
    state.status()
}

pub async fn start_cdp_collector(
    app: AppHandle,
    state: tauri::State<'_, P5eCdpRuntime>,
    port: Option<u16>,
    client_root: Option<String>,
) -> Result<P5eCdpStatus, String> {
    state.start(app, port, client_root).await
}

pub fn stop_cdp_collector(state: tauri::State<'_, P5eCdpRuntime>) -> P5eCdpStatus {
    state.stop()
}

pub fn set_cdp_gate_debug_mode(
    state: tauri::State<'_, P5eCdpRuntime>,
    enabled: bool,
) -> P5eCdpStatus {
    state.set_gate_debug_mode(enabled);
    state.status()
}

pub fn set_cdp_ws_debug_mode(
    state: tauri::State<'_, P5eCdpRuntime>,
    enabled: bool,
) -> P5eCdpStatus {
    state.set_ws_debug_mode(enabled);
    state.status()
}

async fn collector_loop(
    app: AppHandle,
    runtime: P5eCdpRuntime,
    port: u16,
    _root: PathBuf,
    mut stop_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    let mut reconnect_attempt: u32 = 0;
    let mut cdp_lost_since: Option<std::time::Instant> = None;

    loop {
        {
            let mut g = lock_runtime(&runtime.shared.inner);
            if !g.running {
                break;
            }
            if !g.needs_relaunch {
                g.phase = "reconnecting".to_string();
            }
        }
        let should_emit_status = {
            let g = lock_runtime(&runtime.shared.inner);
            !g.needs_relaunch
        };
        if should_emit_status {
            emit_status(&app, &runtime);
        }

        if !is_cdp_port_reachable(port).await {
            if !is_5e_process_running() {
                {
                    let mut g = lock_runtime(&runtime.shared.inner);
                    g.last_error = Some("5E 进程已退出".to_string());
                    g.client_exited = true;
                    g.phase = "stopped".to_string();
                    g.running = false;
                }
                emit_status(&app, &runtime);
                break;
            }

            let now = std::time::Instant::now();
            if cdp_lost_since.is_none() {
                cdp_lost_since = Some(now);
                {
                    let mut g = lock_runtime(&runtime.shared.inner);
                    g.cdp_lost_since = Some(status_now_iso());
                    g.reason = Some("cdp_lost_process_alive".to_string());
                }
                emit_status(&app, &runtime);
            }

            let elapsed = cdp_lost_since
                .map(|since| cdp_lost_elapsed_ms(since, now))
                .unwrap_or(0);
            if should_request_cdp_relaunch(elapsed) {
                {
                    let mut g = lock_runtime(&runtime.shared.inner);
                    g.needs_relaunch = true;
                    g.phase = "needsRelaunch".to_string();
                    g.last_error =
                        Some("5E 可能在更新后重启，CDP 连接已断开".to_string());
                    g.running = false;
                }
                emit_status(&app, &runtime);
                break;
            }

            let delay = reconnect_delay_ms(reconnect_attempt);
            reconnect_attempt = reconnect_attempt.saturating_add(1);
            tokio::select! {
                _ = &mut stop_rx => break,
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(delay)) => continue,
            }
        }

        if cdp_lost_since.is_some() {
            cdp_lost_since = None;
            {
                let mut g = lock_runtime(&runtime.shared.inner);
                g.cdp_lost_since = None;
                g.reason = None;
                g.needs_relaunch = false;
            }
            emit_status(&app, &runtime);
        }

        reconnect_attempt = 0;

        {
            let mut g = lock_runtime(&runtime.shared.inner);
            g.phase = "cdpReady".to_string();
        }
        emit_status(&app, &runtime);

        let target = match wait_for_arena_target(&app, port, &runtime, &mut stop_rx).await {
            Ok(t) => t,
            Err(SessionEnd::Stopped) => break,
            Err(SessionEnd::Reconnect) => {
                let delay = reconnect_delay_ms(reconnect_attempt);
                reconnect_attempt = reconnect_attempt.saturating_add(1);
                tokio::select! {
                    _ = &mut stop_rx => break,
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(delay)) => continue,
                }
            }
        };

        {
            let mut g = lock_runtime(&runtime.shared.inner);
            g.phase = "collecting".to_string();
            g.target_url = Some(target.url.clone());
            g.target_title = Some(target.title.clone());
        }
        emit_status(&app, &runtime);

        if run_cdp_session(&app, &runtime, &target.ws_url, &mut stop_rx).await
            == SessionEnd::Stopped
        {
            break;
        }
    }

    {
        let mut g = lock_runtime(&runtime.shared.inner);
        if g.running {
            g.running = false;
            g.phase = "stopped".to_string();
        }
    }
    emit_status(&app, &runtime);
    Ok(())
}

#[derive(PartialEq)]
enum SessionEnd {
    Reconnect,
    Stopped,
}

struct CdpTarget {
    title: String,
    url: String,
    ws_url: String,
}

async fn wait_for_arena_target(
    app: &AppHandle,
    port: u16,
    runtime: &P5eCdpRuntime,
    stop_rx: &mut oneshot::Receiver<()>,
) -> Result<CdpTarget, SessionEnd> {
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_millis(ARENA_TARGET_MAX_WAIT_MS);

    loop {
        match pick_arena_target(port).await {
            Ok(target) => return Ok(target),
            Err(err) => {
                if std::time::Instant::now() >= deadline {
                    let mut g = lock_runtime(&runtime.shared.inner);
                    g.last_error = Some(err);
                    g.phase = "error".to_string();
                    emit_status(app, runtime);
                    return Err(SessionEnd::Reconnect);
                }
            }
        }

        tokio::select! {
            _ = &mut *stop_rx => return Err(SessionEnd::Stopped),
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(ARENA_TARGET_POLL_MS)) => {},
        }
    }
}

async fn pick_arena_target(port: u16) -> Result<CdpTarget, String> {
    let url = format!("http://127.0.0.1:{port}/json/list");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("无法连接 CDP: {e}"))?;
    let list: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| format!("CDP 列表解析失败: {e}"))?;

    for item in list {
        let page_url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
        if !page_url.contains(ARENA_HOST) {
            continue;
        }
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let ws = item
            .get("webSocketDebuggerUrl")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if ws.is_empty() {
            continue;
        }
        return Ok(CdpTarget {
            title,
            url: page_url.to_string(),
            ws_url: ws.to_string(),
        });
    }

    Err(format!("等待 {ARENA_HOST} 页面出现"))
}

async fn request_response_body(
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    msg_id: &mut i64,
    pending_bodies: &mut HashMap<i64, PendingBody>,
    network_request_id: &str,
    url: String,
    method: String,
    post: Option<String>,
    retries: u8,
) {
    let body_id = *msg_id;
    *msg_id += 1;
    pending_bodies.insert(
        body_id,
        PendingBody {
            url,
            method,
            post,
            network_request_id: network_request_id.to_string(),
            retries,
        },
    );
    let cmd = serde_json::json!({
        "id": body_id,
        "method": "Network.getResponseBody",
        "params": { "requestId": network_request_id }
    });
    let _ = write.send(Message::Text(cmd.to_string().into())).await;
}

async fn handle_body_response(
    app: &AppHandle,
    runtime: &P5eCdpRuntime,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    msg_id: &mut i64,
    pending_bodies: &mut HashMap<i64, PendingBody>,
    id: i64,
    value: &Value,
) {
    let Some(pending) = pending_bodies.remove(&id) else {
        return;
    };

    let cdp_error = value.get("error").is_some();
    let body = value
        .get("result")
        .and_then(|r| r.get("body"))
        .and_then(|b| b.as_str())
        .unwrap_or("");
    let body_missing = body.is_empty();

    if (cdp_error || body_missing) && pending.retries < MAX_BODY_RETRIES {
        let next_retry = pending.retries + 1;
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        request_response_body(
            write,
            msg_id,
            pending_bodies,
            &pending.network_request_id,
            pending.url,
            pending.method,
            pending.post,
            next_retry,
        )
        .await;
        return;
    }

    let capture_error = if cdp_error || body_missing {
        let err_msg = value
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("empty body");
        Some(format!("getResponseBody failed: {err_msg}"))
    } else {
        None
    };

    let req_json = pending.post.as_deref().and_then(parse_json_body);
    let resp_json = parse_json_body(body);
    let gate_debug_mode = runtime.shared.gate_debug_mode.load(Ordering::Relaxed);
    let resp_json = cap_gate_debug_body(&pending.url, gate_debug_mode, resp_json);
    if let Some(event) = build_http_event_with_mode(
        pending.url,
        pending.method,
        req_json,
        resp_json,
        gate_debug_mode,
        capture_error,
    ) {
        emit_event(app, runtime, event);
    }
}

async fn run_cdp_session(
    app: &AppHandle,
    runtime: &P5eCdpRuntime,
    ws_url: &str,
    stop_rx: &mut oneshot::Receiver<()>,
) -> SessionEnd {
    let (ws_stream, _) = match tokio_tungstenite::connect_async(ws_url).await {
        Ok(v) => v,
        Err(err) => {
            {
                let mut g = lock_runtime(&runtime.shared.inner);
                g.last_error = Some(format!("CDP WebSocket 连接失败: {err}"));
                g.phase = "error".to_string();
            }
            emit_status(app, runtime);
            return SessionEnd::Reconnect;
        }
    };

    let (mut write, mut read) = ws_stream.split();
    let mut msg_id: i64 = 1;

    let auto_attach_cmd = serde_json::json!({
        "id": msg_id,
        "method": "Target.setAutoAttach",
        "params": {
            "autoAttach": true,
            "waitForDebuggerOnStart": false,
            "flatten": true
        }
    });
    msg_id += 1;
    if write
        .send(Message::Text(auto_attach_cmd.to_string().into()))
        .await
        .is_err()
    {
        return SessionEnd::Reconnect;
    }

    let enable_cmd = serde_json::json!({
        "id": msg_id,
        "method": "Network.enable",
        "params": {
            "maxTotalBufferSize": 5242880,
            "maxResourceBufferSize": 524288,
            "maxPostDataSize": 65536
        }
    });
    msg_id += 1;
    if write
        .send(Message::Text(enable_cmd.to_string().into()))
        .await
        .is_err()
    {
        return SessionEnd::Reconnect;
    }

    let mut pending_requests = PendingRequestQueue::new();
    let mut pending_bodies: HashMap<i64, PendingBody> = HashMap::new();
    let mut ws_urls: HashMap<String, String> = HashMap::new();

    loop {
        tokio::select! {
            _ = &mut *stop_rx => return SessionEnd::Stopped,
            msg = read.next() => {
                let Some(msg) = msg else {
                    if !is_5e_process_running() {
                        let mut g = lock_runtime(&runtime.shared.inner);
                        g.last_error = Some("5E 进程已退出".to_string());
                        g.client_exited = true;
                        g.phase = "stopped".to_string();
                        g.running = false;
                        emit_status(app, runtime);
                        return SessionEnd::Stopped;
                    }
                    return SessionEnd::Reconnect;
                };
                let Ok(Message::Text(text)) = msg else { continue; };
                let Ok(value) = serde_json::from_str::<Value>(&text) else { continue; };

                if let Some(method) = value.get("method").and_then(|m| m.as_str()) {
                    match method {
                        "Network.requestWillBeSent" => {
                            if let Some(params) = value.get("params") {
                                let req_id = params.get("requestId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let req = params.get("request");
                                let url = req.and_then(|r| r.get("url")).and_then(|u| u.as_str()).unwrap_or("").to_string();
                                let method = req.and_then(|r| r.get("method")).and_then(|m| m.as_str()).unwrap_or("GET").to_string();
                                let post = req
                                    .and_then(|r| r.get("postData"))
                                    .and_then(|p| p.as_str())
                                    .map(|s| s.to_string());
                                let gate_debug_mode =
                                    runtime.shared.gate_debug_mode.load(Ordering::Relaxed);
                                if should_capture_url(&url, gate_debug_mode) {
                                    let is_whitelist = is_whitelisted_url(&url);
                                    pending_requests.insert(
                                        req_id,
                                        PendingRequest {
                                            url,
                                            method,
                                            post,
                                            is_whitelist,
                                        },
                                    );
                                }
                            }
                        }
                        "Network.loadingFinished" => {
                            if let Some(params) = value.get("params") {
                                let req_id = params.get("requestId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                if let Some(PendingRequest { url, method, post, .. }) =
                                    pending_requests.take(&req_id)
                                {
                                    request_response_body(
                                        &mut write,
                                        &mut msg_id,
                                        &mut pending_bodies,
                                        &req_id,
                                        url,
                                        method,
                                        post,
                                        0,
                                    ).await;
                                }
                            }
                        }
                        "Network.loadingFailed" => {
                            if let Some(params) = value.get("params") {
                                let req_id = params.get("requestId").and_then(|v| v.as_str()).unwrap_or("");
                                if pending_requests.remove(req_id).is_some() {
                                    // loadingFailed — pending entry dropped
                                }
                            }
                        }
                        "Network.webSocketCreated" => {
                            if let Some(params) = value.get("params") {
                                let req_id = params
                                    .get("requestId")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let url = params
                                    .get("url")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if req_id.is_empty() || url.is_empty() {
                                    continue;
                                }
                                ws_urls.insert(req_id.clone(), url.clone());
                                let ws_debug_mode =
                                    runtime.shared.ws_debug_mode.load(Ordering::Relaxed);
                                if ws_debug_mode && is_comet_ws_url(&url) {
                                    emit_cdp_event(
                                        app,
                                        runtime,
                                        build_ws_open_event(req_id, url),
                                    );
                                }
                            }
                        }
                        "Network.webSocketFrameReceived" => {
                            let ws_debug_mode =
                                runtime.shared.ws_debug_mode.load(Ordering::Relaxed);
                            if ws_debug_mode {
                                if let Some(params) = value.get("params") {
                                    let req_id = params
                                        .get("requestId")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    if let Some(url) = ws_urls.get(&req_id).cloned() {
                                        if is_comet_ws_url(&url) {
                                            let response = params.get("response");
                                            let opcode = response
                                                .and_then(|r| r.get("opcode"))
                                                .and_then(|v| v.as_u64())
                                                .unwrap_or(0) as u8;
                                            let payload = response
                                                .and_then(|r| r.get("payloadData"))
                                                .and_then(|v| v.as_str())
                                                .unwrap_or("");
                                            if !payload.is_empty() {
                                                let event =
                                                    decode_ws_frame(req_id, url, opcode, payload);
                                                emit_cdp_event(app, runtime, event);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        "Network.webSocketClosed" => {
                            let ws_debug_mode =
                                runtime.shared.ws_debug_mode.load(Ordering::Relaxed);
                            if let Some(params) = value.get("params") {
                                let req_id = params
                                    .get("requestId")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if let Some(url) = ws_urls.remove(&req_id) {
                                    if ws_debug_mode && is_comet_ws_url(&url) {
                                        emit_cdp_event(
                                            app,
                                            runtime,
                                            build_ws_close_event(req_id, url),
                                        );
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }

                if let Some(id) = value.get("id").and_then(|v| v.as_i64()) {
                    handle_body_response(
                        app,
                        runtime,
                        &mut write,
                        &mut msg_id,
                        &mut pending_bodies,
                        id,
                        &value,
                    ).await;
                }
            }
        }
    }
}

fn emit_event(app: &AppHandle, runtime: &P5eCdpRuntime, event: P5eHttpEvent) {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    use std::time::Instant;

    static EMIT_LAST: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    let throttle = EMIT_LAST.get_or_init(|| Mutex::new(HashMap::new()));

    if !is_whitelisted_url(&event.url) {
        let key = event.url.to_lowercase();
        let now = Instant::now();
        let mut guard = throttle.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(last) = guard.get(&key) {
            if now.duration_since(*last).as_millis() < EMIT_THROTTLE_MS {
                return;
            }
        }
        guard.insert(key, now);
    }

    emit_cdp_event(app, runtime, event);
}

fn emit_cdp_event(app: &AppHandle, runtime: &P5eCdpRuntime, event: impl Serialize) {
    runtime
        .shared
        .events_emitted
        .fetch_add(1, Ordering::Relaxed);

    let _ = app.emit("5e-cdp-event", &event);
}

fn emit_status(app: &AppHandle, runtime: &P5eCdpRuntime) {
    let _ = app.emit("5e-cdp-status", &runtime.status());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cdp_lost_relaunch_threshold() {
        assert!(!should_request_cdp_relaunch(44_999));
        assert!(should_request_cdp_relaunch(45_000));
        assert!(should_request_cdp_relaunch(60_000));
    }
}
