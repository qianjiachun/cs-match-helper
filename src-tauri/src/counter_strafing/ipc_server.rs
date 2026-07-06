use crate::counter_strafing::ipc_port_discovery;
use crate::counter_strafing::types::{
    CounterStrafingAssessmentRecord, GameBarIpcSnapshot, ShootingErrorRecord,
};
use serde::Serialize;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::AppHandle;

const READ_BUF_SIZE: usize = 1024;
const ACCEPT_POLL: Duration = Duration::from_millis(5);
const SHUTDOWN_IO_TIMEOUT: Duration = Duration::from_millis(200);
const STREAM_KEEPALIVE: Duration = Duration::from_millis(1000);

/// Wakes `/stream` IPC clients when the Game Bar snapshot may have changed.
#[derive(Clone)]
pub struct SnapshotSignal {
    inner: Arc<(Mutex<u64>, Condvar)>,
}

impl SnapshotSignal {
    pub fn new() -> Self {
        Self {
            inner: Arc::new((Mutex::new(0), Condvar::new())),
        }
    }

    pub fn bump(&self) {
        if let Ok(mut seq) = self.inner.0.lock() {
            *seq = seq.wrapping_add(1);
            self.inner.1.notify_all();
        }
    }

    pub fn wait_timeout(&self, timeout: Duration) -> bool {
        let (lock, cvar) = &*self.inner;
        let guard = lock.lock().unwrap();
        let (_seq_guard, result) = cvar.wait_timeout(guard, timeout).unwrap();
        result.timed_out()
    }
}

impl Default for SnapshotSignal {
    fn default() -> Self {
        Self::new()
    }
}

/// NDJSON delta lines queued for `/stream` clients (Widget incremental chart updates).
#[derive(Clone, Default)]
pub struct IpcStreamQueue {
    inner: Arc<Mutex<Vec<String>>>,
}

impl IpcStreamQueue {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_shooting_record(&self, record: &ShootingErrorRecord) {
        if let Ok(json) = serde_json::to_string(&IpcStreamLine::ShootingRecord {
            record: record.clone(),
        }) {
            if let Ok(mut guard) = self.inner.lock() {
                guard.push(format!("{json}\n"));
            }
        }
    }

    pub fn push_assessment_record(&self, record: &CounterStrafingAssessmentRecord) {
        if let Ok(json) = serde_json::to_string(&IpcStreamLine::AssessmentRecord {
            record: record.clone(),
        }) {
            if let Ok(mut guard) = self.inner.lock() {
                guard.push(format!("{json}\n"));
            }
        }
    }

    pub fn drain(&self) -> Vec<String> {
        self.inner
            .lock()
            .map(|mut guard| std::mem::take(&mut *guard))
            .unwrap_or_default()
    }
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum IpcStreamLine {
    ShootingRecord { record: ShootingErrorRecord },
    AssessmentRecord { record: CounterStrafingAssessmentRecord },
}

pub struct IpcServer {
    stop_flag: Arc<AtomicBool>,
    listener: Arc<Mutex<Option<TcpListener>>>,
    handle: Option<JoinHandle<()>>,
    #[allow(dead_code)]
    port: u16,
}

impl IpcServer {
    pub fn start(
        app: AppHandle,
        get_snapshot: impl Fn() -> GameBarIpcSnapshot + Send + Sync + 'static,
        snapshot_signal: SnapshotSignal,
        ipc_stream_queue: IpcStreamQueue,
        update_widget_layout: impl Fn(f64) -> Result<(), String> + Send + Sync + 'static,
    ) -> Result<(Self, u16), String> {
        let (listener, port) = ipc_port_discovery::bind_ipc_listener()?;
        ipc_port_discovery::write_ipc_port_discovery(port)?;

        listener
            .set_nonblocking(true)
            .map_err(|e| format!("配置快照接口非阻塞模式失败: {e}"))?;

        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_for_thread = Arc::clone(&stop_flag);
        let listener_slot = Arc::new(Mutex::new(Some(listener)));
        let listener_for_thread = Arc::clone(&listener_slot);
        let get_snapshot = Arc::new(get_snapshot);
        let update_widget_layout = Arc::new(update_widget_layout);
        let ipc_stream_queue = Arc::new(ipc_stream_queue);

        let handle = thread::Builder::new()
            .name("counter-strafing-ipc".into())
            .spawn(move || {
                server_loop(
                    listener_for_thread,
                    app,
                    get_snapshot,
                    snapshot_signal,
                    ipc_stream_queue,
                    update_widget_layout,
                    stop_for_thread,
                )
            })
            .map_err(|e| format!("启动快照接口线程失败: {e}"))?;

        Ok((
            Self {
                stop_flag,
                listener: listener_slot,
                handle: Some(handle),
                port,
            },
            port,
        ))
    }

    #[allow(dead_code)]
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn stop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        ipc_port_discovery::write_ipc_port_discovery_inactive(self.port);
        if let Ok(mut guard) = self.listener.lock() {
            *guard = None;
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        ipc_port_discovery::clear_ipc_port_discovery();
    }
}

impl Drop for IpcServer {
    fn drop(&mut self) {
        self.stop();
    }
}

struct JsonCache {
    revision: u64,
    body: String,
}

fn server_loop(
    listener_slot: Arc<Mutex<Option<TcpListener>>>,
    _app: AppHandle,
    get_snapshot: Arc<dyn Fn() -> GameBarIpcSnapshot + Send + Sync>,
    snapshot_signal: SnapshotSignal,
    ipc_stream_queue: Arc<IpcStreamQueue>,
    update_widget_layout: Arc<dyn Fn(f64) -> Result<(), String> + Send + Sync>,
    stop_flag: Arc<AtomicBool>,
) {
    let cache = Arc::new(Mutex::new(JsonCache {
        revision: 0,
        body: String::new(),
    }));
    let stream_generation = Arc::new(AtomicU64::new(0));

    while !stop_flag.load(Ordering::SeqCst) {
        let accept_result = {
            let guard = match listener_slot.lock() {
                Ok(guard) => guard,
                Err(_) => break,
            };
            let Some(listener) = guard.as_ref() else {
                break;
            };
            listener.accept()
        };

        match accept_result {
            Ok((stream, _)) => {
                if stop_flag.load(Ordering::SeqCst) {
                    break;
                }
                let get_snapshot = Arc::clone(&get_snapshot);
                let cache = Arc::clone(&cache);
                let signal = snapshot_signal.clone();
                let stream_queue = Arc::clone(&ipc_stream_queue);
                let stop = Arc::clone(&stop_flag);
                let generation = Arc::clone(&stream_generation);
                let update_layout = Arc::clone(&update_widget_layout);
                thread::Builder::new()
                    .name("counter-strafing-ipc-conn".into())
                    .spawn(move || {
                        if let Err(e) = handle_client(
                            stream,
                            get_snapshot,
                            cache,
                            signal,
                            stream_queue,
                            update_layout,
                            stop,
                            generation,
                        ) {
                            if should_log_connection_error(&e, &Arc::new(AtomicBool::new(false))) {
                                eprintln!("[counter-strafing-ipc] connection error: {e}");
                            }
                        }
                    })
                    .ok();
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                thread::sleep(ACCEPT_POLL);
            }
            Err(e) => {
                if should_log_connection_error(&e, &stop_flag) {
                    eprintln!("[counter-strafing-ipc] accept error: {e}");
                }
                thread::sleep(ACCEPT_POLL);
            }
        }
    }
}

fn handle_client(
    mut stream: TcpStream,
    get_snapshot: Arc<dyn Fn() -> GameBarIpcSnapshot + Send + Sync>,
    cache: Arc<Mutex<JsonCache>>,
    snapshot_signal: SnapshotSignal,
    ipc_stream_queue: Arc<IpcStreamQueue>,
    update_widget_layout: Arc<dyn Fn(f64) -> Result<(), String> + Send + Sync>,
    stop_flag: Arc<AtomicBool>,
    stream_generation: Arc<AtomicU64>,
) -> std::io::Result<()> {
    if stop_flag.load(Ordering::Relaxed) {
        return Ok(());
    }

    if let Err(e) = stream.set_nonblocking(false) {
        eprintln!("[counter-strafing-ipc] set blocking mode failed: {e}");
        return Err(e);
    }
    let timeout = if stop_flag.load(Ordering::Relaxed) {
        SHUTDOWN_IO_TIMEOUT
    } else {
        Duration::from_secs(2)
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));

    let mut buf = [0u8; READ_BUF_SIZE];
    let read = stream.read(&mut buf)?;
    if read == 0 {
        return Ok(());
    }

    if stop_flag.load(Ordering::Relaxed) {
        return Ok(());
    }

    let request = String::from_utf8_lossy(&buf[..read]);
    let first_line = request.lines().next().unwrap_or_default();
    let method = first_line.split_whitespace().next().unwrap_or_default();
    let path = first_line.split_whitespace().nth(1).unwrap_or_default();

    if method == "POST" && path == "/widget-layout" {
        return handle_widget_layout_post(&mut stream, &request, update_widget_layout.as_ref());
    }

    if path == "/stream" {
        let _ = stream.set_read_timeout(None);
        let _ = stream.set_write_timeout(None);
        let my_generation = stream_generation.fetch_add(1, Ordering::SeqCst) + 1;
        handle_stream_connection(
            &mut stream,
            get_snapshot.as_ref(),
            snapshot_signal,
            ipc_stream_queue.as_ref(),
            &stop_flag,
            &stream_generation,
            my_generation,
        )
    } else if path == "/snapshot" || path == "/" {
        handle_snapshot_connection(&mut stream, get_snapshot.as_ref(), &cache)
    } else {
        let body = error_json("not found");
        let response = format!(
            "HTTP/1.1 404 Not Found\r\n\
             Content-Type: application/json; charset=utf-8\r\n\
             Access-Control-Allow-Origin: *\r\n\
             Connection: close\r\n\
             Content-Length: {}\r\n\
             \r\n\
             {body}",
            body.len()
        );
        stream.write_all(response.as_bytes())?;
        stream.flush()?;
        Ok(())
    }
}

fn handle_snapshot_connection(
    stream: &mut TcpStream,
    get_snapshot: &(dyn Fn() -> GameBarIpcSnapshot + Send + Sync),
    cache: &Arc<Mutex<JsonCache>>,
) -> std::io::Result<()> {
    let (status, body) = match cached_snapshot_json(get_snapshot, cache) {
        Ok(json) => ("200 OK", json),
        Err(e) => ("500 Internal Server Error", error_json(&e)),
    };

    let response = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: application/json; charset=utf-8\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\
         Content-Length: {}\r\n\
         \r\n\
         {body}",
        body.len()
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn handle_stream_connection(
    stream: &mut TcpStream,
    get_snapshot: &(dyn Fn() -> GameBarIpcSnapshot + Send + Sync),
    snapshot_signal: SnapshotSignal,
    ipc_stream_queue: &IpcStreamQueue,
    stop_flag: &Arc<AtomicBool>,
    stream_generation: &Arc<AtomicU64>,
    my_generation: u64,
) -> std::io::Result<()> {
    let headers = "HTTP/1.1 200 OK\r\n\
         Content-Type: application/x-ndjson\r\n\
         Transfer-Encoding: chunked\r\n\
         Connection: keep-alive\r\n\
         Access-Control-Allow-Origin: *\r\n\
         \r\n";
    stream.write_all(headers.as_bytes())?;
    stream.flush()?;

    let initial_snapshot = get_snapshot();
    let mut last_revision = snapshot_revision(&initial_snapshot);
    let initial_json = match serde_json::to_string(&initial_snapshot) {
        Ok(json) => format!("{json}\n"),
        Err(e) => {
            let body = error_json(&e.to_string());
            write_chunk(stream, body.as_bytes())?;
            return Ok(());
        }
    };
    write_chunk(stream, initial_json.as_bytes())?;

    while !stop_flag.load(Ordering::Relaxed) {
        if stream_generation.load(Ordering::Relaxed) != my_generation {
            break;
        }

        let timed_out = snapshot_signal.wait_timeout(STREAM_KEEPALIVE);
        if stop_flag.load(Ordering::Relaxed) {
            break;
        }
        if stream_generation.load(Ordering::Relaxed) != my_generation {
            break;
        }

        for line in ipc_stream_queue.drain() {
            if write_chunk(stream, line.as_bytes()).is_err() {
                return Ok(());
            }
        }

        let snapshot = get_snapshot();
        let revision = snapshot_revision(&snapshot);
        if revision != last_revision {
            let json = match serde_json::to_string(&snapshot) {
                Ok(json) => format!("{json}\n"),
                Err(e) => {
                    let body = error_json(&e.to_string());
                    if write_chunk(stream, body.as_bytes()).is_err() {
                        break;
                    }
                    continue;
                }
            };
            if write_chunk(stream, json.as_bytes()).is_err() {
                break;
            }
            last_revision = revision;
        } else if timed_out && write_chunk(stream, b"\n").is_err() {
            break;
        }
    }

    Ok(())
}

fn write_chunk(stream: &mut TcpStream, data: &[u8]) -> std::io::Result<()> {
    write!(stream, "{:x}\r\n", data.len())?;
    stream.write_all(data)?;
    stream.write_all(b"\r\n")?;
    stream.flush()?;
    Ok(())
}

fn should_log_connection_error(error: &std::io::Error, stop_flag: &Arc<AtomicBool>) -> bool {
    if stop_flag.load(Ordering::Relaxed) {
        return false;
    }
    !matches!(
        error.kind(),
        ErrorKind::WouldBlock
            | ErrorKind::TimedOut
            | ErrorKind::ConnectionReset
            | ErrorKind::ConnectionAborted
            | ErrorKind::BrokenPipe
            | ErrorKind::UnexpectedEof
    )
}

fn cached_snapshot_json(
    get_snapshot: &(dyn Fn() -> GameBarIpcSnapshot + Send + Sync),
    cache: &Arc<Mutex<JsonCache>>,
) -> Result<String, String> {
    let snapshot = get_snapshot();
    let revision = snapshot_revision(&snapshot);
    let mut guard = cache.lock().map_err(|_| "cache lock poisoned".to_string())?;
    if revision == guard.revision && !guard.body.is_empty() {
        return Ok(guard.body.clone());
    }
    let body = serde_json::to_string(&snapshot).map_err(|e| e.to_string())?;
    guard.revision = revision;
    guard.body = body.clone();
    Ok(body)
}

fn fold_u64(mut hash: u64, value: u64) -> u64 {
    hash = hash.wrapping_mul(31).wrapping_add(value);
    hash
}

fn snapshot_revision(snapshot: &GameBarIpcSnapshot) -> u64 {
    let assessment = &snapshot.assessment;
    let mut hash = fold_u64(0, assessment.active as u8 as u64);
    hash = fold_u64(hash, assessment.listening as u8 as u64);
    hash = fold_u64(hash, assessment.records.len() as u64);
    if let Some(record) = assessment.records.last() {
        hash = fold_u64(hash, record.timestamp_ms);
    }
    hash = fold_u64(hash, assessment.avg_diff_ms.to_bits());
    hash = fold_u64(hash, assessment.success_rate.to_bits());
    hash = fold_u64(hash, assessment.std_dev_ms.to_bits());
    if let Some(record) = &assessment.last_record {
        hash = fold_u64(hash, record.timestamp_ms);
    }
    if let Some(shooting) = &snapshot.shooting {
        hash = fold_u64(hash, shooting.shot_records.len() as u64);
        if let Some(record) = shooting.shot_records.last() {
            hash = fold_u64(hash, record.timestamp_ms);
        }
        hash = fold_u64(hash, shooting.avg_error.to_bits());
        hash = fold_u64(hash, shooting.stable_rate.to_bits());
        hash = fold_u64(hash, shooting.hud_show_stable_bars as u8 as u64);
        hash = fold_u64(hash, shooting.hud_show_tap_markers as u8 as u64);
    }
    let layout = &snapshot.layout;
    hash = fold_u64(hash, layout.show_assessment_chart as u8 as u64);
    hash = fold_u64(hash, layout.show_shooting_chart as u8 as u64);
    hash = fold_u64(hash, layout.assessment_ratio.to_bits());
    hash = fold_u64(hash, layout.assessment_on_top as u8 as u64);
    hash = fold_u64(hash, layout.stat_text_scale.to_bits());
    hash = fold_u64(hash, layout.line_stroke_width.to_bits());
    hash = fold_u64(hash, layout.assessment_chart_opacity.to_bits());
    hash = fold_u64(hash, layout.shooting_chart_opacity.to_bits());
    hash
}

fn parse_request_body(request: &str) -> Option<String> {
    let header_end = request.find("\r\n\r\n")?;
    let body_start = header_end + 4;
    let headers = &request[..header_end];
    let mut content_length = None;
    for line in headers.lines().skip(1) {
        if let Some(value) = line
            .strip_prefix("Content-Length:")
            .or_else(|| line.strip_prefix("content-length:"))
        {
            content_length = value.trim().parse::<usize>().ok();
        }
    }
    let body = &request[body_start..];
    if let Some(len) = content_length {
        if body.len() >= len {
            return Some(body[..len].to_string());
        }
    } else if !body.is_empty() {
        return Some(body.to_string());
    }
    None
}

fn handle_widget_layout_post(
    stream: &mut TcpStream,
    request: &str,
    update_widget_layout: &(dyn Fn(f64) -> Result<(), String> + Send + Sync),
) -> std::io::Result<()> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WidgetLayoutBody {
        gamebar_assessment_ratio: Option<f64>,
    }

    let (status, body) = match parse_request_body(request) {
        Some(body_text) => match serde_json::from_str::<WidgetLayoutBody>(&body_text) {
            Ok(payload) => match payload.gamebar_assessment_ratio {
                Some(ratio) => match update_widget_layout(ratio) {
                    Ok(()) => ("200 OK", ok_json()),
                    Err(e) => ("400 Bad Request", error_json(&e)),
                },
                None => ("400 Bad Request", error_json("missing gamebarAssessmentRatio")),
            },
            Err(e) => ("400 Bad Request", error_json(&e.to_string())),
        },
        None => ("400 Bad Request", error_json("missing request body")),
    };

    let response = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: application/json; charset=utf-8\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\
         Content-Length: {}\r\n\
         \r\n\
         {body}",
        body.len()
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn ok_json() -> String {
    #[derive(Serialize)]
    struct OkBody {
        ok: bool,
    }
    serde_json::to_string(&OkBody { ok: true }).unwrap_or_else(|_| r#"{"ok":true}"#.to_string())
}

fn error_json(message: &str) -> String {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ErrorBody<'a> {
        error: &'a str,
    }
    serde_json::to_string(&ErrorBody { error: message }).unwrap_or_else(|_| {
        r#"{"error":"internal"}"#.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_path_returns_json() {
        let snapshot = GameBarIpcSnapshot {
            assessment: Default::default(),
            shooting: None,
            layout: Default::default(),
        };
        let body = serde_json::to_string(&snapshot).unwrap();
        assert!(body.contains("\"active\":false"));
    }

    #[test]
    fn revision_changes_when_records_change() {
        use crate::counter_strafing::types::{
            AssessmentAxis, AssessmentTiming, CounterStrafingAssessmentRecord,
        };

        let mut snapshot = GameBarIpcSnapshot {
            assessment: Default::default(),
            shooting: None,
            layout: Default::default(),
        };
        let base = snapshot_revision(&snapshot);
        snapshot.assessment.records.push(CounterStrafingAssessmentRecord {
            axis: AssessmentAxis::Horizontal,
            from_key: "A".to_string(),
            to_key: "D".to_string(),
            diff_ms: 1.0,
            timing: AssessmentTiming::Late,
            timing_label: "偏晚".to_string(),
            is_perfect: false,
            is_success: false,
            timestamp_ms: 42,
        });
        assert_ne!(base, snapshot_revision(&snapshot));
    }

    #[test]
    fn snapshot_signal_notifies_waiters() {
        let signal = SnapshotSignal::new();
        let signal_for_thread = signal.clone();
        let handle = thread::spawn(move || {
            assert!(!signal_for_thread.wait_timeout(Duration::from_millis(500)));
        });
        thread::sleep(Duration::from_millis(20));
        signal.bump();
        handle.join().unwrap();
    }

    #[test]
    fn ipc_stream_queue_emits_ndjson_delta_lines() {
        use crate::counter_strafing::types::{
            AssessmentAxis, AssessmentTiming, CounterStrafingAssessmentRecord, FireSampleKind,
            ShootingErrorReason,
        };

        let queue = IpcStreamQueue::new();
        queue.push_shooting_record(&ShootingErrorRecord {
            error: 0.5,
            score_label: "test".to_string(),
            reason: ShootingErrorReason::MultipleDirectionsHeld,
            movement_keys_down: 1,
            crouching: false,
            last_stop_age_ms: 0.0,
            timing_diff_ms: 0.0,
            fire_held: true,
            sample_kind: FireSampleKind::FireDown,
            is_stable: false,
            timestamp_ms: 100,
            estimated_speed: 0.0,
            accuracy_threshold: 0.0,
            speed_ratio: 0.0,
            stop_success_age_ms: 0.0,
            counter_strafe_active: false,
            axis_conflict: false,
            fire_sample_delayed: false,
            shot_sequence_index: 1,
            crouch_grace_active: false,
        });
        queue.push_assessment_record(&CounterStrafingAssessmentRecord {
            axis: AssessmentAxis::Horizontal,
            from_key: "A".to_string(),
            to_key: "D".to_string(),
            diff_ms: 2.0,
            timing: AssessmentTiming::Late,
            timing_label: "偏晚".to_string(),
            is_perfect: false,
            is_success: false,
            timestamp_ms: 200,
        });

        let lines = queue.drain();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("\"type\":\"shootingRecord\""));
        assert!(lines[0].ends_with('\n'));
        assert!(lines[1].contains("\"type\":\"assessmentRecord\""));
        assert!(queue.drain().is_empty());
    }
}
