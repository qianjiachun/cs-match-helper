use crate::platform;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};

const FALLBACK_TICK: Duration = Duration::from_secs(2);
/// 启动时回溯读取日志的上限（仅扫描尾部，避免整日志过大）
const MAX_BOOTSTRAP_READ: u64 = 4 * 1024 * 1024;
const LOG_SOURCE_LOST_MSG: &str =
    "日志文件已丢失，完美对战平台可能已停止写入。请尝试重新运行完美对战平台。";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLinePayload {
    pub raw: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatcherStatus {
    pub running: bool,
    pub log_path: String,
    pub file_exists: bool,
    pub file_size: u64,
    pub lines_received: u64,
    pub last_error: Option<String>,
    pub log_source_lost: bool,
    pub log_source_lost_message: Option<String>,
}

pub struct WatcherState {
    log_dir: PathBuf,
    active_log_path: Arc<Mutex<PathBuf>>,
    running: Arc<AtomicBool>,
    lines_received: Arc<AtomicU64>,
    last_error: Arc<Mutex<Option<String>>>,
    log_source_lost: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            log_dir: PathBuf::new(),
            active_log_path: Arc::new(Mutex::new(PathBuf::new())),
            running: Arc::new(AtomicBool::new(false)),
            lines_received: Arc::new(AtomicU64::new(0)),
            last_error: Arc::new(Mutex::new(None)),
            log_source_lost: Arc::new(AtomicBool::new(false)),
            handle: None,
        }
    }
}

/// 读取日志目录中最新日志文件的行（用于启动时恢复最近一次对局数据）
pub fn read_latest_log_lines(log_dir: &str) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(log_dir);
    let path = platform::resolve_newest_log_in_dir(&dir).ok_or_else(|| "未找到日志文件".to_string())?;

    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let file_len = meta.len();

    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    let start = file_len.saturating_sub(MAX_BOOTSTRAP_READ);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| e.to_string())?;

    let read_len = file_len - start;
    let mut buf = vec![0u8; read_len as usize];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;
    let content = String::from_utf8_lossy(&buf);

    // 从中间截断时丢弃首个不完整行
    let text = if start > 0 {
        content
            .split_once('\n')
            .map(|(_, rest)| rest)
            .unwrap_or(content.as_ref())
    } else {
        content.as_ref()
    };

    Ok(text
        .lines()
        .map(|l| l.trim_end_matches('\r').to_string())
        .filter(|l| !l.trim().is_empty())
        .collect())
}

impl WatcherState {
    pub fn status(&self) -> WatcherStatus {
        let active = self.active_log_path.lock().unwrap().clone();
        let log_source_lost = self.log_source_lost.load(Ordering::SeqCst);
        build_status(
            self.running.load(Ordering::SeqCst),
            &active,
            self.lines_received.load(Ordering::SeqCst),
            self.last_error.lock().unwrap().clone(),
            log_source_lost,
            log_source_lost.then(|| LOG_SOURCE_LOST_MSG.to_string()),
        )
    }

    fn emit_status(&self, app: &AppHandle) {
        let _ = app.emit("watcher-status", self.status());
    }

    pub fn start(&mut self, app: AppHandle, log_dir: String) -> Result<(), String> {
        if log_dir.trim().is_empty() {
            return Err("日志目录不能为空".to_string());
        }

        self.stop();
        self.log_dir = PathBuf::from(&log_dir);
        *self.active_log_path.lock().unwrap() = PathBuf::new();
        self.lines_received.store(0, Ordering::SeqCst);
        *self.last_error.lock().unwrap() = None;
        self.log_source_lost.store(false, Ordering::SeqCst);
        self.running.store(true, Ordering::SeqCst);

        let log_dir = self.log_dir.clone();
        let running = Arc::clone(&self.running);
        let lines_received = Arc::clone(&self.lines_received);
        let last_error = Arc::clone(&self.last_error);
        let log_source_lost = Arc::clone(&self.log_source_lost);
        let active_log_path = Arc::clone(&self.active_log_path);
        let app_handle = app.clone();

        let handle = thread::spawn(move || {
            run_watch_loop(
                &log_dir,
                &running,
                &lines_received,
                &last_error,
                &log_source_lost,
                &active_log_path,
                &app_handle,
            );
        });

        self.handle = Some(handle);
        self.emit_status(&app);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

struct DirWatcher {
    _watcher: RecommendedWatcher,
    rx: Receiver<()>,
}

impl DirWatcher {
    fn watch(path: &Path) -> Result<Self, String> {
        let (tx, rx) = mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if res.is_ok() {
                    let _ = tx.send(());
                }
            },
            Config::default(),
        )
        .map_err(|e| e.to_string())?;

        watcher
            .watch(path, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;

        Ok(Self {
            _watcher: watcher,
            rx,
        })
    }
}

struct TailState {
    current_path: PathBuf,
    offset: u64,
    partial: String,
    file_at_thread_start: Option<PathBuf>,
    established: bool,
    log_source_lost: bool,
    lost_path: PathBuf,
    lost_at: Option<SystemTime>,
}

impl TailState {
    fn new(log_dir: &Path) -> Self {
        Self {
            current_path: PathBuf::new(),
            offset: 0,
            partial: String::new(),
            file_at_thread_start: platform::resolve_newest_log_in_dir(log_dir),
            established: false,
            log_source_lost: false,
            lost_path: PathBuf::new(),
            lost_at: None,
        }
    }

    fn mark_log_source_lost(&mut self) -> bool {
        if self.log_source_lost {
            return false;
        }
        self.log_source_lost = true;
        self.lost_path = self.current_path.clone();
        self.lost_at = Some(SystemTime::now());
        true
    }

    fn try_recover_log_source(&mut self, target: &Path) -> bool {
        if !self.log_source_lost || !target.exists() {
            return false;
        }

        let recovered = if target == self.lost_path {
            true
        } else {
            std::fs::metadata(target)
                .ok()
                .and_then(|meta| meta.modified().ok())
                .and_then(|mtime| self.lost_at.map(|lost_at| mtime > lost_at))
                .unwrap_or(false)
        };

        if recovered {
            self.log_source_lost = false;
            self.lost_path.clear();
            self.lost_at = None;
        }

        recovered
    }
}

struct WatchContext {
    log_dir: PathBuf,
    tail: TailState,
    dir_watcher: Option<DirWatcher>,
    watching_path: PathBuf,
}

impl WatchContext {
    fn new(log_dir: PathBuf) -> Self {
        let tail = TailState::new(&log_dir);
        Self {
            log_dir,
            tail,
            dir_watcher: None,
            watching_path: PathBuf::new(),
        }
    }

    fn init(&mut self) -> Result<(), String> {
        self.remount_watcher()
    }

    fn desired_watch_path(&self) -> PathBuf {
        if self.log_dir.is_dir() {
            self.log_dir.clone()
        } else {
            platform::find_watchable_parent(&self.log_dir)
        }
    }

    fn remount_watcher(&mut self) -> Result<(), String> {
        let desired = self.desired_watch_path();
        if self.watching_path == desired && self.dir_watcher.is_some() {
            return Ok(());
        }

        self.dir_watcher = Some(DirWatcher::watch(&desired)?);
        self.watching_path = desired;
        Ok(())
    }

    fn wait_for_wake(&self, running: &Arc<AtomicBool>) -> bool {
        let Some(watcher) = self.dir_watcher.as_ref() else {
            thread::sleep(FALLBACK_TICK);
            return running.load(Ordering::SeqCst);
        };

        match watcher.rx.recv_timeout(FALLBACK_TICK) {
            Ok(()) => {
                while watcher.rx.try_recv().is_ok() {}
                running.load(Ordering::SeqCst)
            }
            Err(RecvTimeoutError::Timeout) => running.load(Ordering::SeqCst),
            Err(RecvTimeoutError::Disconnected) => false,
        }
    }
}

fn run_watch_loop(
    log_dir: &Path,
    running: &Arc<AtomicBool>,
    lines_received: &Arc<AtomicU64>,
    last_error: &Arc<Mutex<Option<String>>>,
    log_source_lost_flag: &Arc<AtomicBool>,
    active_log_path: &Arc<Mutex<PathBuf>>,
    app: &AppHandle,
) {
    let mut ctx = WatchContext::new(log_dir.to_path_buf());

    if let Err(err) = ctx.init() {
        *last_error.lock().unwrap() = Some(err);
        emit_status_from_parts(
            running,
            active_log_path,
            lines_received,
            last_error,
            log_source_lost_flag,
            app,
        );
    }

    while running.load(Ordering::SeqCst) {
        if let Err(err) = ctx.remount_watcher() {
            *last_error.lock().unwrap() = Some(err);
        }

        let status_changed = sync_log_state(
            &ctx.log_dir,
            &mut ctx.tail,
            active_log_path,
            lines_received,
            last_error,
            app,
        );

        log_source_lost_flag.store(ctx.tail.log_source_lost, Ordering::SeqCst);

        if status_changed {
            emit_status_from_parts(
                running,
                active_log_path,
                lines_received,
                last_error,
                log_source_lost_flag,
                app,
            );
        }

        if !ctx.wait_for_wake(running) {
            break;
        }
    }
}

fn sync_log_state(
    log_dir: &Path,
    tail: &mut TailState,
    active_log_path: &Arc<Mutex<PathBuf>>,
    lines_received: &Arc<AtomicU64>,
    last_error: &Arc<Mutex<Option<String>>>,
    app: &AppHandle,
) -> bool {
    if !log_dir.is_dir() {
        return false;
    }

    let mut status_changed = false;

    if !tail.current_path.as_os_str().is_empty()
        && tail.established
        && !tail.current_path.exists()
    {
        if tail.mark_log_source_lost() {
            status_changed = true;
        }
        return status_changed;
    }

    let Some(target) = platform::resolve_newest_log_in_dir(log_dir) else {
        if tail.established && tail.log_source_lost {
            return status_changed;
        }
        return false;
    };

    if tail.log_source_lost {
        if !tail.try_recover_log_source(&target) {
            return status_changed;
        }
        status_changed = true;
    }

    if target != tail.current_path {
        let switched = !tail.current_path.as_os_str().is_empty();
        tail.current_path = target.clone();
        *active_log_path.lock().unwrap() = tail.current_path.clone();
        tail.offset = initial_offset(
            &tail.current_path,
            switched,
            tail.file_at_thread_start.as_ref(),
        );
        tail.partial.clear();
        tail.established = true;
        status_changed = true;
    }

    if !tail.current_path.exists() {
        return status_changed;
    }

    if !tail.established {
        tail.established = true;
    }

    loop {
        let meta = match std::fs::metadata(&tail.current_path) {
            Ok(m) => m,
            Err(err) => {
                *last_error.lock().unwrap() = Some(err.to_string());
                break;
            }
        };

        if meta.len() < tail.offset {
            tail.offset = 0;
            tail.partial.clear();
            status_changed = true;
        }

        if meta.len() <= tail.offset {
            break;
        }

        let read_len = meta.len() - tail.offset;
        match read_chunk(&tail.current_path, tail.offset, read_len) {
            Ok(chunk) => {
                tail.offset = meta.len();
                emit_lines(&chunk, &mut tail.partial, app, lines_received);
            }
            Err(err) => {
                *last_error.lock().unwrap() = Some(err);
                break;
            }
        }
    }

    status_changed
}

fn initial_offset(
    target: &Path,
    switched_from_another: bool,
    file_at_thread_start: Option<&PathBuf>,
) -> u64 {
    if !target.exists() {
        return 0;
    }

    let len = std::fs::metadata(target).map(|m| m.len()).unwrap_or(0);

    if switched_from_another {
        return 0;
    }

    if file_at_thread_start == Some(&target.to_path_buf()) {
        return len;
    }

    0
}

fn build_status(
    running: bool,
    active: &Path,
    lines_received: u64,
    last_error: Option<String>,
    log_source_lost: bool,
    log_source_lost_message: Option<String>,
) -> WatcherStatus {
    let file_exists = active.exists();
    let file_size = if file_exists {
        std::fs::metadata(active).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    WatcherStatus {
        running,
        log_path: active.display().to_string(),
        file_exists,
        file_size,
        lines_received,
        last_error,
        log_source_lost,
        log_source_lost_message,
    }
}

fn emit_status_from_parts(
    running: &Arc<AtomicBool>,
    active_log_path: &Arc<Mutex<PathBuf>>,
    lines_received: &Arc<AtomicU64>,
    last_error: &Arc<Mutex<Option<String>>>,
    log_source_lost_flag: &Arc<AtomicBool>,
    app: &AppHandle,
) {
    let active = active_log_path.lock().unwrap().clone();
    let lost = log_source_lost_flag.load(Ordering::SeqCst);
    let lost_message = lost.then(|| LOG_SOURCE_LOST_MSG.to_string());
    let _ = app.emit(
        "watcher-status",
        build_status(
            running.load(Ordering::SeqCst),
            &active,
            lines_received.load(Ordering::SeqCst),
            last_error.lock().unwrap().clone(),
            lost,
            lost_message,
        ),
    );
}

fn read_chunk(path: &Path, offset: u64, len: u64) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;

    let mut buf = vec![0u8; len as usize];
    file.read_exact(&mut buf).map_err(|e| e.to_string())?;
    String::from_utf8(buf).map_err(|e| e.to_string())
}

fn emit_lines(
    text: &str,
    partial: &mut String,
    app: &AppHandle,
    lines_received: &Arc<AtomicU64>,
) {
    let combined = format!("{partial}{text}");
    let mut parts = combined.split('\n').collect::<Vec<_>>();

    *partial = if combined.ends_with('\n') {
        String::new()
    } else {
        parts.pop().unwrap_or("").to_string()
    };

    for line in parts {
        let line = line.trim_end_matches('\r');
        if line.trim().is_empty() {
            continue;
        }

        lines_received.fetch_add(1, Ordering::SeqCst);
        let _ = app.emit("log-line", LogLinePayload { raw: line.to_string() });
    }
}
