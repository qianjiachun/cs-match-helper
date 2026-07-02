use crate::counter_strafing::ipc_port_discovery;
use crate::counter_strafing::types::GameBarIpcSnapshot;
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

        let handle = thread::Builder::new()
            .name("counter-strafing-ipc".into())
            .spawn(move || {
                server_loop(
                    listener_for_thread,
                    app,
                    get_snapshot,
                    snapshot_signal,
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
                let stop = Arc::clone(&stop_flag);
                let generation = Arc::clone(&stream_generation);
                thread::Builder::new()
                    .name("counter-strafing-ipc-conn".into())
                    .spawn(move || {
                        if let Err(e) =
                            handle_client(stream, get_snapshot, cache, signal, stop, generation)
                        {
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
    let path = first_line.split_whitespace().nth(1).unwrap_or_default();

    if path == "/stream" {
        let _ = stream.set_read_timeout(None);
        let _ = stream.set_write_timeout(None);
        let my_generation = stream_generation.fetch_add(1, Ordering::SeqCst) + 1;
        handle_stream_connection(
            &mut stream,
            get_snapshot.as_ref(),
            snapshot_signal,
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
        } else if timed_out {
            if write_chunk(stream, b"\n").is_err() {
                break;
            }
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
    }
    hash
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
}
