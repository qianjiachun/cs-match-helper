use super::platform_5e_launch::{
    detect_client_root, is_cdp_port_reachable, P5E_DEFAULT_CDP_PORT,
};
use super::platform_5e_sink::{
    build_http_event, is_whitelisted_url, parse_json_body, P5eHttpEvent,
};
use std::collections::HashMap;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use tokio_tungstenite::tungstenite::Message;

const ARENA_HOST: &str = "view-arena.5eplay.com";
const RECONNECT_DELAY_MS: u64 = 2000;
const MAX_PENDING_REQUESTS: usize = 256;

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
}

struct RuntimeInner {
    running: bool,
    port: u16,
    phase: String,
    client_root: Option<String>,
    target_url: Option<String>,
    target_title: Option<String>,
    last_error: Option<String>,
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
            stop_tx: None,
        }
    }
}

struct CdpShared {
    inner: Mutex<RuntimeInner>,
    events_emitted: AtomicU64,
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
            }),
        }
    }
}

impl P5eCdpRuntime {
    fn status_from_guard(g: &RuntimeInner, events_emitted: u64) -> P5eCdpStatus {
        P5eCdpStatus {
            running: g.running,
            port: g.port,
            phase: g.phase.clone(),
            client_root: g.client_root.clone(),
            target_url: g.target_url.clone(),
            target_title: g.target_title.clone(),
            events_emitted,
            last_error: g.last_error.clone(),
        }
    }

    pub fn status(&self) -> P5eCdpStatus {
        let g = self.shared.inner.lock().unwrap();
        let events = self.shared.events_emitted.load(Ordering::Relaxed);
        Self::status_from_guard(&g, events)
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
            let mut g = self.shared.inner.lock().unwrap();
            if g.running {
                let events = self.shared.events_emitted.load(Ordering::Relaxed);
                return Ok(Self::status_from_guard(&g, events));
            }
            g.running = true;
            g.port = resolved_port;
            g.phase = "collecting".to_string();
            g.client_root = Some(root.display().to_string());
            g.last_error = None;
            g.target_url = None;
            g.target_title = None;
        }

        let (stop_tx, stop_rx) = oneshot::channel();
        {
            let mut g = self.shared.inner.lock().unwrap();
            g.stop_tx = Some(stop_tx);
        }

        let worker = self.clone();
        let app_clone = app.clone();
        tokio::spawn(async move {
            if let Err(err) = collector_loop(app_clone, worker, resolved_port, root, stop_rx).await {
                eprintln!("[5e-cdp] {err}");
            }
        });

        Ok(self.status())
    }

    pub fn stop(&self) -> P5eCdpStatus {
        let (snapshot, stop_tx) = {
            let mut g = self.shared.inner.lock().unwrap();
            g.running = false;
            g.phase = "stopped".to_string();
            let events = self.shared.events_emitted.load(Ordering::Relaxed);
            let snapshot = Self::status_from_guard(&g, events);
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

async fn collector_loop(
    app: AppHandle,
    runtime: P5eCdpRuntime,
    port: u16,
    _root: PathBuf,
    mut stop_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    loop {
        {
            let mut g = runtime.shared.inner.lock().unwrap();
            if !g.running {
                break;
            }
            g.phase = "reconnecting".to_string();
        }
        emit_status(&app, &runtime);

        if !is_cdp_port_reachable(port).await {
            tokio::select! {
                _ = &mut stop_rx => break,
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(RECONNECT_DELAY_MS)) => continue,
            }
        }

        {
            let mut g = runtime.shared.inner.lock().unwrap();
            g.phase = "cdpReady".to_string();
        }
        emit_status(&app, &runtime);

        let target = match pick_target(port).await {
            Ok(t) => t,
            Err(err) => {
                {
                    let mut g = runtime.shared.inner.lock().unwrap();
                    g.last_error = Some(err);
                    g.phase = "error".to_string();
                }
                emit_status(&app, &runtime);
                tokio::select! {
                    _ = &mut stop_rx => break,
                    _ = tokio::time::sleep(tokio::time::Duration::from_millis(RECONNECT_DELAY_MS)) => continue,
                }
            }
        };

        {
            let mut g = runtime.shared.inner.lock().unwrap();
            g.phase = "collecting".to_string();
            g.target_url = Some(target.url.clone());
            g.target_title = Some(target.title.clone());
        }
        emit_status(&app, &runtime);

        if run_cdp_session(&app, &runtime, &target.ws_url, &mut stop_rx).await == SessionEnd::Stopped {
            break;
        }
    }

    {
        let mut g = runtime.shared.inner.lock().unwrap();
        g.running = false;
        g.phase = "stopped".to_string();
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

async fn pick_target(port: u16) -> Result<CdpTarget, String> {
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

    let mut best: Option<CdpTarget> = None;
    for item in list {
        let page_url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
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
        let target = CdpTarget {
            title,
            url: page_url.to_string(),
            ws_url: ws.to_string(),
        };
        if page_url.contains(ARENA_HOST) {
            return Ok(target);
        }
        if best.is_none() {
            best = Some(target);
        }
    }

    best.ok_or_else(|| "未找到可监听的 5E 页面目标".to_string())
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
                let mut g = runtime.shared.inner.lock().unwrap();
                g.last_error = Some(format!("CDP WebSocket 连接失败: {err}"));
                g.phase = "error".to_string();
            }
            emit_status(app, runtime);
            return SessionEnd::Reconnect;
        }
    };

    let (mut write, mut read) = ws_stream.split();
    let mut msg_id: i64 = 1;
    let enable_cmd = serde_json::json!({
        "id": msg_id,
        "method": "Network.enable",
        "params": {}
    });
    msg_id += 1;
    if write
        .send(Message::Text(enable_cmd.to_string().into()))
        .await
        .is_err()
    {
        return SessionEnd::Reconnect;
    }

    let mut pending_requests: HashMap<String, (String, String, Option<String>)> = HashMap::new();
    let mut pending_bodies: HashMap<i64, (String, String, Option<String>)> = HashMap::new();

    loop {
        tokio::select! {
            _ = &mut *stop_rx => return SessionEnd::Stopped,
            msg = read.next() => {
                let Some(msg) = msg else { return SessionEnd::Reconnect; };
                let Ok(Message::Text(text)) = msg else { continue; };
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else { continue; };

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
                                if is_whitelisted_url(&url) {
                                    if pending_requests.len() >= MAX_PENDING_REQUESTS {
                                        pending_requests.clear();
                                    }
                                    pending_requests.insert(req_id, (url, method, post));
                                }
                            }
                        }
                        "Network.loadingFinished" => {
                            if let Some(params) = value.get("params") {
                                let req_id = params.get("requestId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                if let Some((url, method, post)) = pending_requests.remove(&req_id)
                                {
                                    let body_id = msg_id;
                                    msg_id += 1;
                                    pending_bodies.insert(body_id, (url, method, post));
                                    let cmd = serde_json::json!({
                                        "id": body_id,
                                        "method": "Network.getResponseBody",
                                        "params": { "requestId": req_id }
                                    });
                                    let _ = write.send(Message::Text(cmd.to_string().into())).await;
                                }
                            }
                        }
                        _ => {}
                    }
                }

                if let Some(id) = value.get("id").and_then(|v| v.as_i64()) {
                    if let Some((url, method, post)) = pending_bodies.remove(&id) {
                        let body = value
                            .get("result")
                            .and_then(|r| r.get("body"))
                            .and_then(|b| b.as_str())
                            .unwrap_or("");
                        let req_json = post.as_deref().and_then(parse_json_body);
                        let resp_json = parse_json_body(body);
                        if let Some(event) = build_http_event(url, method, req_json, resp_json) {
                            emit_event(app, runtime, event);
                        }
                    }
                }
            }
        }
    }
}

fn emit_event(app: &AppHandle, runtime: &P5eCdpRuntime, event: P5eHttpEvent) {
    runtime
        .shared
        .events_emitted
        .fetch_add(1, Ordering::Relaxed);

    let _ = app.emit("5e-cdp-event", &event);
}

fn emit_status(app: &AppHandle, runtime: &P5eCdpRuntime) {
    let _ = app.emit("5e-cdp-status", &runtime.status());
}
