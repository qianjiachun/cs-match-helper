use crate::counter_strafing::assessment_engine::CounterStrafingAssessmentEngine;
use crate::counter_strafing::engine::{mouse_label, vk_label, CounterStrafingEngine};
use crate::counter_strafing::ipc_server;
use super::hud_window;
use crate::counter_strafing::settings::{load_counter_strafing_settings, save_counter_strafing_settings};
use crate::counter_strafing::types::{
    BindingRole, CounterStrafingAssessmentRecord, CounterStrafingAssessmentSnapshot,
    CounterStrafingSettings, CounterStrafingSnapshot, GameBarIpcSnapshot,
    HudAnchor, InputBinding, InputEvent, InputSource, ShootingErrorRecord, ShootingHudIpcSnapshot,
    clamp_gamebar_assessment_ratio, normalize_gamebar_layout, apply_hud_display_to_assessment_snapshot,
    apply_hud_display_to_snapshot, gamebar_layout_from_settings,
};
use crate::counter_strafing::win_input::{self, InputListener, ScreenRect};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

pub const HUD_WINDOW_LABEL: &str = "counter-strafing-hud";
pub const ASSESSMENT_HUD_WINDOW_LABEL: &str = "counter-strafing-assessment-hud";
const HUD_WIDTH: f64 = 360.0;
const HUD_HEIGHT: f64 = 116.0;
const HUD_MAX_WIDTH: f64 = 960.0;
const HUD_MAX_HEIGHT: f64 = 480.0;
const ASSESSMENT_HUD_WIDTH: f64 = HUD_WIDTH;
const ASSESSMENT_HUD_HEIGHT: f64 = HUD_HEIGHT;
const HUD_MARGIN: i32 = 12;
const HUD_STACK_GAP: i32 = 4;
const SNAPSHOT_EMIT_INTERVAL: Duration = Duration::from_millis(100);
const SNAPSHOT_STATS_COALESCE: Duration = Duration::from_millis(16);
const MAX_EVENT_BATCH: usize = 8;

fn clamp_hud_width(width: f64) -> f64 {
    width.clamp(1.0, HUD_MAX_WIDTH)
}

fn clamp_hud_height(height: f64) -> f64 {
    height.clamp(1.0, HUD_MAX_HEIGHT)
}

fn shooting_hud_bounds_complete(settings: &CounterStrafingSettings) -> bool {
    settings.hud_x.is_some()
        && settings.hud_y.is_some()
        && settings.hud_width.is_some()
        && settings.hud_height.is_some()
}

fn assessment_hud_bounds_complete(settings: &CounterStrafingSettings) -> bool {
    settings.assessment_hud_x.is_some()
        && settings.assessment_hud_y.is_some()
        && settings.assessment_hud_width.is_some()
        && settings.assessment_hud_height.is_some()
}

fn shooting_hud_bounds_layout_changed(
    old: &CounterStrafingSettings,
    new: &CounterStrafingSettings,
) -> bool {
    old.hud_anchor != new.hud_anchor
        || old.hud_x != new.hud_x
        || old.hud_y != new.hud_y
        || old.hud_width != new.hud_width
        || old.hud_height != new.hud_height
}

fn assessment_hud_bounds_layout_changed(
    old: &CounterStrafingSettings,
    new: &CounterStrafingSettings,
) -> bool {
    old.assessment_hud_anchor != new.assessment_hud_anchor
        || old.assessment_hud_x != new.assessment_hud_x
        || old.assessment_hud_y != new.assessment_hud_y
        || old.assessment_hud_width != new.assessment_hud_width
        || old.assessment_hud_height != new.assessment_hud_height
}

fn capture_shooting_hud_bounds_from_window_if_missing(
    window: &tauri::WebviewWindow,
    settings: &mut CounterStrafingSettings,
) {
    if shooting_hud_bounds_complete(settings) {
        return;
    }
    let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) else {
        return;
    };
    settings.hud_x = Some(position.x);
    settings.hud_y = Some(position.y);
    settings.hud_width = Some(clamp_hud_width(size.width as f64));
    settings.hud_height = Some(clamp_hud_height(size.height as f64));
}

fn capture_assessment_hud_bounds_from_window_if_missing(
    window: &tauri::WebviewWindow,
    settings: &mut CounterStrafingSettings,
) {
    if assessment_hud_bounds_complete(settings) {
        return;
    }
    let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) else {
        return;
    };
    settings.assessment_hud_x = Some(position.x);
    settings.assessment_hud_y = Some(position.y);
    settings.assessment_hud_width = Some(clamp_hud_width(size.width as f64));
    settings.assessment_hud_height = Some(clamp_hud_height(size.height as f64));
}

const MIN_RECV_TIMEOUT: Duration = Duration::from_millis(1);
const MAX_RECV_TIMEOUT: Duration = Duration::from_millis(50);

#[derive(Default)]
pub struct CounterStrafingRuntime {
    inner: Mutex<RuntimeInner>,
}

#[derive(Default)]
struct RuntimeInner {
    active: bool,
    listening: bool,
    hud_visible: bool,
    assessment_hud_visible: bool,
    settings: CounterStrafingSettings,
    engine: Option<CounterStrafingEngine>,
    assessment_engine: Option<CounterStrafingAssessmentEngine>,
    input: Option<InputListener>,
    consumer: Option<JoinHandle<()>>,
    stop_flag: Option<Arc<AtomicBool>>,
    last_snapshot_emit: Option<Instant>,
    last_assessment_snapshot_emit: Option<Instant>,
    capturing_binding: Option<BindingRole>,
    capture_only_input: bool,
    ipc_server: Option<ipc_server::IpcServer>,
    snapshot_signal: Option<ipc_server::SnapshotSignal>,
}

impl CounterStrafingRuntime {
    pub fn assessment_snapshot(&self) -> CounterStrafingAssessmentSnapshot {
        let inner = self.inner.lock().unwrap();
        build_assessment_snapshot(&inner)
    }

    pub fn gamebar_ipc_snapshot(&self) -> GameBarIpcSnapshot {
        let inner = self.inner.lock().unwrap();
        build_gamebar_ipc_snapshot(&inner)
    }

    pub fn snapshot(&self) -> CounterStrafingSnapshot {
        let inner = self.inner.lock().unwrap();
        build_snapshot(&inner)
    }

    pub fn start(&self, app: AppHandle, show_hud: bool) -> Result<CounterStrafingSnapshot, String> {
        {
            let inner = self.inner.lock().unwrap();
            if inner.listening {
                return Ok(build_snapshot(&inner));
            }
        }

        let settings = load_counter_strafing_settings()?;
        let show_shooting_hud = show_hud && settings.hud_visible;
        let show_assessment_hud = show_hud && settings.assessment_hud_visible;
        let stop_flag = Arc::new(AtomicBool::new(false));

        let input = match InputListener::start() {
            Ok(input) => input,
            Err(e) => return Err(e),
        };
        let rx = input.receiver().clone();

        let snapshot_signal = ipc_server::SnapshotSignal::new();
        let ipc_stream_queue = ipc_server::IpcStreamQueue::new();
        let app_handle = app.clone();
        let shared = Arc::new(Mutex::new(ConsumerShared {
            stop_flag: stop_flag.clone(),
            snapshot_signal: Some(snapshot_signal.clone()),
            ipc_stream_queue: ipc_stream_queue.clone(),
            last_stats_emit: None,
        }));

        let consumer_shared = Arc::clone(&shared);
        let consumer = thread::Builder::new()
            .name("counter-strafing-consumer".into())
            .spawn(move || consumer_loop(app_handle, rx, consumer_shared))
            .map_err(|e| format!("启动消费线程失败: {e}"))?;

        let mut inner = self.inner.lock().unwrap();
        if inner.listening {
            drop(inner);
            stop_flag.store(true, Ordering::SeqCst);
            let _ = consumer.join();
            let mut input = input;
            input.stop();
            return Ok(self.snapshot());
        }

        inner.settings = settings.clone();
        inner.hud_visible = show_shooting_hud;
        inner.assessment_hud_visible = show_assessment_hud;
        inner.engine = Some(CounterStrafingEngine::new(settings.clone()));
        inner.assessment_engine = Some(CounterStrafingAssessmentEngine::new(settings.clone()));
        inner.stop_flag = Some(stop_flag);
        inner.capture_only_input = false;
        inner.input = Some(input);
        inner.consumer = Some(consumer);
        inner.active = true;
        inner.listening = true;
        inner.snapshot_signal = Some(snapshot_signal.clone());

        let show_shooting_hud = inner.hud_visible;
        let show_assessment_hud = inner.assessment_hud_visible;

        let app_for_ipc = app.clone();
        let app_for_layout = app_for_ipc.clone();
        let signal_for_layout = snapshot_signal.clone();
        match ipc_server::IpcServer::start(
            app_for_ipc.clone(),
            move || {
                app_for_ipc
                    .state::<CounterStrafingRuntime>()
                    .gamebar_ipc_snapshot()
            },
            snapshot_signal,
            ipc_stream_queue,
            move |ratio| {
                app_for_layout
                    .state::<CounterStrafingRuntime>()
                    .update_gamebar_assessment_ratio(ratio)?;
                signal_for_layout.bump();
                Ok(())
            },
        ) {
            Ok((server, port)) => {
                eprintln!("[counter-strafing] Game Bar IPC listening on 127.0.0.1:{port}");
                inner.ipc_server = Some(server);
            }
            Err(e) => {
                eprintln!("[counter-strafing] {e}");
            }
        }

        drop(inner);

        if show_shooting_hud || show_assessment_hud {
            schedule_deferred_hud_show(app.clone(), show_shooting_hud, show_assessment_hud);
        }

        let snap = self.snapshot();
        let assessment_snap = self.assessment_snapshot();
        let _ = app.emit("counter-strafing-status", snap.clone());
        let _ = app.emit("counter-strafing-assessment-snapshot", assessment_snap);
        Ok(snap)
    }

    pub fn request_shutdown(&self, app: &AppHandle) {
        let stop_flag = {
            let inner = self.inner.lock().unwrap();
            inner.stop_flag.clone()
        };
        if let Some(flag) = stop_flag {
            flag.store(true, Ordering::SeqCst);
        }

        if let Some(window) = app.get_webview_window(HUD_WINDOW_LABEL) {
            let _ = window.destroy();
        }
        if let Some(window) = app.get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL) {
            let _ = window.destroy();
        }

        let (consumer, input, ipc) = {
            let mut inner = self.inner.lock().unwrap();
            inner.hud_visible = false;
            inner.assessment_hud_visible = false;
            inner.active = false;
            inner.listening = false;
            inner.capturing_binding = None;
            inner.capture_only_input = false;
            inner.engine = None;
            inner.assessment_engine = None;
            inner.stop_flag = None;
            inner.last_snapshot_emit = None;
            inner.last_assessment_snapshot_emit = None;
            (
                inner.consumer.take(),
                inner.input.take(),
                inner.ipc_server.take(),
            )
        };

        thread::spawn(move || {
            if let Some(mut ipc) = ipc {
                ipc.stop();
            }
            if let Some(handle) = consumer {
                let _ = handle.join();
            }
            if let Some(mut input) = input {
                input.stop();
            }
        });
    }

    pub fn stop(&self, app: &AppHandle) -> CounterStrafingSnapshot {
        let stop_flag = {
            let inner = self.inner.lock().unwrap();
            inner.stop_flag.clone()
        };
        if let Some(flag) = stop_flag {
            flag.store(true, Ordering::SeqCst);
        }

        let (consumer, input, ipc) = {
            let mut inner = self.inner.lock().unwrap();
            (inner.consumer.take(), inner.input.take(), inner.ipc_server.take())
        };

        if let Some(mut ipc) = ipc {
            ipc.stop();
        }

        if let Some(handle) = consumer {
            let _ = handle.join();
        }
        if let Some(mut input) = input {
            input.stop();
        }

        let mut inner = self.inner.lock().unwrap();
        inner.engine = None;
        inner.assessment_engine = None;
        inner.active = false;
        inner.listening = false;
        inner.capturing_binding = None;
        inner.capture_only_input = false;
        inner.stop_flag = None;
        inner.last_snapshot_emit = None;
        inner.last_assessment_snapshot_emit = None;
        inner.hud_visible = false;
        inner.assessment_hud_visible = false;

        let snap = build_snapshot(&inner);
        drop(inner);

        if let Some(window) = app.get_webview_window(HUD_WINDOW_LABEL) {
            let _ = window.hide();
        }
        if let Some(window) = app.get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL) {
            let _ = window.hide();
        }

        let assessment_snap = self.assessment_snapshot();
        let _ = app.emit("counter-strafing-status", snap.clone());
        let _ = app.emit("counter-strafing-assessment-snapshot", assessment_snap);
        snap
    }

    pub fn clear_assessment_records(&self, app: &AppHandle) -> CounterStrafingAssessmentSnapshot {
        let mut inner = self.inner.lock().unwrap();
        if let Some(engine) = inner.assessment_engine.as_mut() {
            engine.clear_records();
        }
        let snap = build_assessment_snapshot(&inner);
        drop(inner);
        let _ = app.emit("counter-strafing-assessment-snapshot", snap.clone());
        snap
    }

    pub fn clear_records(&self, app: &AppHandle) -> CounterStrafingSnapshot {
        let mut inner = self.inner.lock().unwrap();
        if let Some(engine) = inner.engine.as_mut() {
            engine.clear_records();
        }
        let snap = build_snapshot(&inner);
        drop(inner);
        let _ = app.emit("counter-strafing-snapshot", snap.clone());
        snap
    }

    pub fn update_settings(
        &self,
        app: &AppHandle,
        mut settings: CounterStrafingSettings,
    ) -> Result<CounterStrafingSnapshot, String> {
        let previous_settings = {
            let inner = self.inner.lock().unwrap();
            preserve_hud_bounds(&mut settings, &inner.settings);
            preserve_assessment_hud_bounds(&mut settings, &inner.settings);
            inner.settings.clone()
        };
        normalize_gamebar_layout(&mut settings);
        save_counter_strafing_settings(&settings)?;

        let shooting_bounds_changed =
            shooting_hud_bounds_layout_changed(&previous_settings, &settings);
        let assessment_bounds_changed =
            assessment_hud_bounds_layout_changed(&previous_settings, &settings);
        let shooting_lock_changed = previous_settings.hud_locked != settings.hud_locked;
        let assessment_lock_changed =
            previous_settings.assessment_hud_locked != settings.assessment_hud_locked;

        let (hud_visible, assessment_hud_visible, snap, snapshot_signal) = {
            let mut inner = self.inner.lock().unwrap();
            inner.settings = settings.clone();
            if let Some(engine) = inner.engine.as_mut() {
                engine.update_settings(settings.clone());
            }
            if let Some(engine) = inner.assessment_engine.as_mut() {
                engine.update_settings(settings.clone());
            }
            (
                inner.hud_visible,
                inner.assessment_hud_visible,
                build_snapshot(&inner),
                inner.snapshot_signal.clone(),
            )
        };

        if let Some(signal) = snapshot_signal {
            signal.bump();
        }

        let mut captured_shooting_bounds = false;
        let mut captured_assessment_bounds = false;

        if let Some(window) = app.get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL) {
            if assessment_hud_visible {
                if assessment_bounds_changed {
                    let had_bounds = assessment_hud_bounds_complete(&settings);
                    capture_assessment_hud_bounds_from_window_if_missing(&window, &mut settings);
                    captured_assessment_bounds =
                        !had_bounds && assessment_hud_bounds_complete(&settings);
                    sync_assessment_hud_window(&window, &settings);
                } else if assessment_lock_changed {
                    let _ = window.set_ignore_cursor_events(settings.assessment_hud_locked);
                }
            }
        }
        if let Some(window) = app.get_webview_window(HUD_WINDOW_LABEL) {
            if hud_visible {
                if shooting_bounds_changed {
                    let had_bounds = shooting_hud_bounds_complete(&settings);
                    capture_shooting_hud_bounds_from_window_if_missing(&window, &mut settings);
                    captured_shooting_bounds =
                        !had_bounds && shooting_hud_bounds_complete(&settings);
                    sync_hud_window(&window, &settings);
                } else if shooting_lock_changed {
                    let _ = window.set_ignore_cursor_events(settings.hud_locked);
                }
            }
        }

        if captured_shooting_bounds || captured_assessment_bounds {
            let mut inner = self.inner.lock().unwrap();
            if captured_shooting_bounds {
                inner.settings.hud_x = settings.hud_x;
                inner.settings.hud_y = settings.hud_y;
                inner.settings.hud_width = settings.hud_width;
                inner.settings.hud_height = settings.hud_height;
            }
            if captured_assessment_bounds {
                inner.settings.assessment_hud_x = settings.assessment_hud_x;
                inner.settings.assessment_hud_y = settings.assessment_hud_y;
                inner.settings.assessment_hud_width = settings.assessment_hud_width;
                inner.settings.assessment_hud_height = settings.assessment_hud_height;
            }
            let _ = save_counter_strafing_settings(&inner.settings);
        }

        let _ = app.emit("counter-strafing-snapshot", snap.clone());
        Ok(snap)
    }

    pub fn update_gamebar_assessment_ratio(&self, ratio: f64) -> Result<(), String> {
        let ratio = clamp_gamebar_assessment_ratio(ratio);
        let mut settings = load_counter_strafing_settings()?;
        settings.gamebar_assessment_ratio = ratio;
        normalize_gamebar_layout(&mut settings);
        save_counter_strafing_settings(&settings)?;
        let mut inner = self.inner.lock().unwrap();
        inner.settings.gamebar_assessment_ratio = ratio;
        Ok(())
    }

    pub fn start_binding_capture(
        &self,
        app: &AppHandle,
        role: BindingRole,
    ) -> Result<CounterStrafingSnapshot, String> {
        let mut inner = self.inner.lock().unwrap();
        inner.capturing_binding = Some(role);

        if inner.listening {
            let snap = build_snapshot(&inner);
            drop(inner);
            let _ = app.emit("counter-strafing-status", snap.clone());
            return Ok(snap);
        }

        inner.stop_flag = Some(Arc::new(AtomicBool::new(false)));
        inner.capture_only_input = true;

        let input = match InputListener::start() {
            Ok(input) => input,
            Err(e) => {
                inner.capturing_binding = None;
                inner.capture_only_input = false;
                inner.stop_flag = None;
                return Err(e);
            }
        };
        let rx = input.receiver().clone();
        inner.input = Some(input);

        let stop_flag = inner.stop_flag.as_ref().unwrap().clone();
        let app_handle = app.clone();
        let shared = Arc::new(Mutex::new(ConsumerShared {
            stop_flag: stop_flag.clone(),
            snapshot_signal: None,
            ipc_stream_queue: ipc_server::IpcStreamQueue::new(),
            last_stats_emit: None,
        }));
        let consumer_shared = Arc::clone(&shared);
        let consumer = thread::Builder::new()
            .name("counter-strafing-capture".into())
            .spawn(move || consumer_loop(app_handle, rx, consumer_shared))
            .map_err(|e| format!("启动按键捕获线程失败: {e}"))?;
        inner.consumer = Some(consumer);

        let snap = build_snapshot(&inner);
        drop(inner);
        let _ = app.emit("counter-strafing-status", snap.clone());
        Ok(snap)
    }

    pub fn cancel_binding_capture(&self, app: &AppHandle) -> CounterStrafingSnapshot {
        let stop_flag = {
            let inner = self.inner.lock().unwrap();
            inner.stop_flag.clone()
        };
        if let Some(flag) = stop_flag {
            flag.store(true, Ordering::SeqCst);
        }

        let (consumer, input, should_stop_input) = {
            let mut inner = self.inner.lock().unwrap();
            inner.capturing_binding = None;
            let should_stop = inner.capture_only_input;
            inner.capture_only_input = false;
            (
                inner.consumer.take(),
                inner.input.take(),
                should_stop,
            )
        };

        if should_stop_input {
            if let Some(handle) = consumer {
                let _ = handle.join();
            }
            if let Some(mut input) = input {
                input.stop();
            }
            let mut inner = self.inner.lock().unwrap();
            inner.stop_flag = None;
        }

        let snap = self.snapshot();
        let _ = app.emit("counter-strafing-status", snap.clone());
        snap
    }

    pub fn hide_assessment_hud(&self, app: &AppHandle) -> Result<CounterStrafingAssessmentSnapshot, String> {
        {
            let mut inner = self.inner.lock().unwrap();
            inner.assessment_hud_visible = false;
            inner.settings.assessment_hud_visible = false;
            let _ = save_counter_strafing_settings(&inner.settings);
        }

        if let Some(window) = app.get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL) {
            let _ = window.hide();
        }

        let inner = self.inner.lock().unwrap();
        let snap = build_assessment_snapshot(&inner);
        drop(inner);
        let _ = app.emit("counter-strafing-assessment-snapshot", snap.clone());
        Ok(snap)
    }

    pub fn hide_hud(&self, app: &AppHandle) -> Result<CounterStrafingSnapshot, String> {
        {
            let mut inner = self.inner.lock().unwrap();
            inner.hud_visible = false;
            inner.settings.hud_visible = false;
            let _ = save_counter_strafing_settings(&inner.settings);
        }

        if let Some(window) = app.get_webview_window(HUD_WINDOW_LABEL) {
            let _ = window.hide();
        }

        let inner = self.inner.lock().unwrap();
        let snap = build_snapshot(&inner);
        drop(inner);
        let _ = app.emit("counter-strafing-status", snap.clone());
        Ok(snap)
    }

    pub fn save_assessment_hud_bounds(
        &self,
        x: i32,
        y: i32,
        width: f64,
        height: f64,
    ) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap();
        inner.settings.assessment_hud_x = Some(x);
        inner.settings.assessment_hud_y = Some(y);
        inner.settings.assessment_hud_width = Some(clamp_hud_width(width));
        inner.settings.assessment_hud_height = Some(clamp_hud_height(height));
        save_counter_strafing_settings(&inner.settings)
    }

    pub fn save_hud_bounds(
        &self,
        x: i32,
        y: i32,
        width: f64,
        height: f64,
    ) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap();
        inner.settings.hud_x = Some(x);
        inner.settings.hud_y = Some(y);
        inner.settings.hud_width = Some(clamp_hud_width(width));
        inner.settings.hud_height = Some(clamp_hud_height(height));
        save_counter_strafing_settings(&inner.settings)
    }

    pub fn reset_settings(&self, app: &AppHandle) -> Result<CounterStrafingSnapshot, String> {
        let (hud_visible, assessment_hud_visible) = {
            let inner = self.inner.lock().unwrap();
            (inner.hud_visible, inner.assessment_hud_visible)
        };

        let mut defaults = CounterStrafingSettings::default();
        defaults.hud_visible = hud_visible;
        defaults.assessment_hud_visible = assessment_hud_visible;
        save_counter_strafing_settings(&defaults)?;

        let snap = {
            let mut inner = self.inner.lock().unwrap();
            inner.settings = defaults.clone();
            if let Some(engine) = inner.engine.as_mut() {
                engine.update_settings(defaults.clone());
            }
            if let Some(engine) = inner.assessment_engine.as_mut() {
                engine.update_settings(defaults.clone());
            }
            build_snapshot(&inner)
        };

        if let Some(window) = app.get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL) {
            if assessment_hud_visible {
                let _ = window.show();
                sync_assessment_hud_window(&window, &defaults);
            }
        }
        if let Some(window) = app.get_webview_window(HUD_WINDOW_LABEL) {
            if hud_visible {
                let _ = window.show();
                sync_hud_window(&window, &defaults);
            }
        }

        let assessment_snap = self.assessment_snapshot();
        let _ = app.emit("counter-strafing-snapshot", snap.clone());
        let _ = app.emit("counter-strafing-status", snap.clone());
        let _ = app.emit("counter-strafing-assessment-snapshot", assessment_snap);
        Ok(snap)
    }

    pub fn save_assessment_hud_bounds_from_window(&self, app: &AppHandle) -> Result<(), String> {
        let window = app
            .get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL)
            .ok_or_else(|| "急停评估 HUD 窗口不存在".to_string())?;
        let position = window
            .outer_position()
            .map_err(|e| format!("读取急停评估 HUD 位置失败: {e}"))?;
        let size = window
            .inner_size()
            .map_err(|e| format!("读取急停评估 HUD 尺寸失败: {e}"))?;
        self.save_assessment_hud_bounds(
            position.x,
            position.y,
            size.width as f64,
            size.height as f64,
        )
    }

    pub fn save_hud_bounds_from_window(&self, app: &AppHandle) -> Result<(), String> {
        let window = app
            .get_webview_window(HUD_WINDOW_LABEL)
            .ok_or_else(|| "HUD 窗口不存在".to_string())?;
        let position = window
            .outer_position()
            .map_err(|e| format!("读取 HUD 位置失败: {e}"))?;
        let size = window
            .inner_size()
            .map_err(|e| format!("读取 HUD 尺寸失败: {e}"))?;
        self.save_hud_bounds(
            position.x,
            position.y,
            size.width as f64,
            size.height as f64,
        )
    }
}

struct ConsumerShared {
    stop_flag: Arc<AtomicBool>,
    snapshot_signal: Option<ipc_server::SnapshotSignal>,
    ipc_stream_queue: ipc_server::IpcStreamQueue,
    last_stats_emit: Option<Instant>,
}

fn emit_shooting_record_now(
    app: &AppHandle,
    shared: &Arc<Mutex<ConsumerShared>>,
    record: ShootingErrorRecord,
) {
    let _ = app.emit("counter-strafing-shot", &record);
    if let Ok(guard) = shared.lock() {
        guard.ipc_stream_queue.push_shooting_record(&record);
        if let Some(signal) = guard.snapshot_signal.as_ref() {
            signal.bump();
        }
    }
}

fn emit_assessment_record_now(
    app: &AppHandle,
    shared: &Arc<Mutex<ConsumerShared>>,
    record: CounterStrafingAssessmentRecord,
) {
    let _ = app.emit("counter-strafing-assessment-record", &record);
    if let Ok(guard) = shared.lock() {
        guard.ipc_stream_queue.push_assessment_record(&record);
        if let Some(signal) = guard.snapshot_signal.as_ref() {
            signal.bump();
        }
    }
}

fn emit_stats_snapshots_coalesced(app: &AppHandle, shared: &Arc<Mutex<ConsumerShared>>) {
    let should_emit = {
        let mut guard = match shared.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let now = Instant::now();
        if guard
            .last_stats_emit
            .is_some_and(|t| now.duration_since(t) < SNAPSHOT_STATS_COALESCE)
        {
            false
        } else {
            guard.last_stats_emit = Some(now);
            true
        }
    };
    if !should_emit {
        return;
    }

    let (shooting_snap, assessment_snap) = {
        let runtime = app.state::<CounterStrafingRuntime>();
        let inner = runtime.inner.lock().unwrap();
        (
            build_snapshot(&inner),
            build_assessment_snapshot(&inner),
        )
    };
    let _ = app.emit("counter-strafing-snapshot", shooting_snap);
    let _ = app.emit("counter-strafing-assessment-snapshot", assessment_snap);
}

fn compute_recv_timeout(engine: Option<&CounterStrafingEngine>) -> Duration {
    let now = win_input::qpc_secs();
    if let Some(engine) = engine {
        if let Some(due) = engine.next_sample_due_time() {
            let wait_secs = (due - now).max(MIN_RECV_TIMEOUT.as_secs_f64());
            let wait_secs = wait_secs.min(MAX_RECV_TIMEOUT.as_secs_f64());
            return Duration::from_secs_f64(wait_secs);
        }
    }
    MAX_RECV_TIMEOUT
}

fn process_single_event_locked(
    inner: &mut RuntimeInner,
    event: &InputEvent,
) -> (
    Option<ShootingErrorRecord>,
    Option<CounterStrafingAssessmentRecord>,
) {
    let binding = event_to_binding(event);
    let role = inner.settings.key_map.role_for_binding(&binding);
    let mut assessment_record = None;
    if let Some(role) = role {
        if matches!(
            role,
            BindingRole::Left | BindingRole::Right | BindingRole::Forward | BindingRole::Back
        ) {
            assessment_record = inner.assessment_engine.as_mut().and_then(|engine| {
                engine.handle_movement(role, event.is_down, event.time_secs)
            });
        }
    }
    let shot_record = inner
        .engine
        .as_mut()
        .and_then(|engine| engine.handle_event(*event));
    (shot_record, assessment_record)
}

fn drain_engine_shots_locked(
    inner: &mut RuntimeInner,
    now: f64,
    out: &mut Vec<ShootingErrorRecord>,
) {
    if let Some(engine) = inner.engine.as_mut() {
        engine.drain_due_samples(now, out);
    }
}

fn event_triggers_intermediate_drain(event: &InputEvent, inner: &RuntimeInner) -> bool {
    let binding = event_to_binding(event);
    inner
        .settings
        .key_map
        .role_for_binding(&binding)
        .is_some_and(|role| role == BindingRole::Fire)
}

fn dispatch_consumer_events(
    app: &AppHandle,
    shared: &Arc<Mutex<ConsumerShared>>,
    events: Vec<InputEvent>,
) {
    if events.is_empty() {
        return;
    }

    let now = win_input::qpc_secs();
    let mut had_any_record = false;

    for (idx, event) in events.iter().enumerate() {
        let mut drained_shots = Vec::new();
        let (shot, assessment) = {
            let runtime = app.state::<CounterStrafingRuntime>();
            let mut inner = runtime.inner.lock().unwrap();
            let result = process_single_event_locked(&mut inner, event);
            let should_drain = event_triggers_intermediate_drain(event, &inner)
                || (idx + 1) % MAX_EVENT_BATCH == 0;
            if should_drain {
                let sample_now = event.time_secs.max(now);
                drain_engine_shots_locked(&mut inner, sample_now, &mut drained_shots);
            }
            result
        };

        if let Some(record) = shot {
            emit_shooting_record_now(app, shared, record);
            had_any_record = true;
        }
        if let Some(record) = assessment {
            emit_assessment_record_now(app, shared, record);
            had_any_record = true;
        }
        for record in drained_shots {
            emit_shooting_record_now(app, shared, record);
            had_any_record = true;
        }
    }

    let mut final_shots = Vec::new();
    {
        let runtime = app.state::<CounterStrafingRuntime>();
        let mut inner = runtime.inner.lock().unwrap();
        let logical_now = events
            .iter()
            .map(|event| event.time_secs)
            .fold(now, f64::max);
        drain_engine_shots_locked(&mut inner, logical_now, &mut final_shots);
    }
    for record in final_shots {
        emit_shooting_record_now(app, shared, record);
        had_any_record = true;
    }

    if had_any_record {
        emit_stats_snapshots_coalesced(app, shared);
    } else {
        let runtime = app.state::<CounterStrafingRuntime>();
        let pending = {
            let mut inner = runtime.inner.lock().unwrap();
            collect_periodic_emissions(&mut inner)
        };
        flush_periodic_emissions(app, pending);
    }
}

fn reconcile_stuck_inputs(app: &AppHandle, shared: &Arc<Mutex<ConsumerShared>>, now: f64) {
    let stuck_events = {
        let runtime = app.state::<CounterStrafingRuntime>();
        let inner = runtime.inner.lock().unwrap();
        inner
            .engine
            .as_ref()
            .map(|engine| {
                let mut events = engine.collect_stuck_presses(
                    &inner.settings.key_map,
                    win_input::is_binding_physically_pressed,
                    now,
                );
                events.extend(engine.collect_stuck_releases(
                    &inner.settings.key_map,
                    win_input::is_binding_physically_pressed,
                    now,
                ));
                events
            })
            .unwrap_or_default()
    };

    if !stuck_events.is_empty() {
        dispatch_consumer_events(app, shared, stuck_events);
    }

    let assessment_records = {
        let runtime = app.state::<CounterStrafingRuntime>();
        let mut inner = runtime.inner.lock().unwrap();
        let key_map = inner.settings.key_map.clone();
        let Some(assessment) = inner.assessment_engine.as_mut() else {
            return;
        };
        let mut records = Vec::new();
        for role in [
            BindingRole::Left,
            BindingRole::Right,
            BindingRole::Forward,
            BindingRole::Back,
        ] {
            if assessment.is_movement_pressed(role)
                && !win_input::is_binding_physically_pressed(key_map.binding_for_role(role))
            {
                if let Some(record) = assessment.handle_movement(role, false, now) {
                    records.push(record);
                }
            }
        }
        records
    };

    let mut had_assessment = false;
    for record in assessment_records {
        emit_assessment_record_now(app, shared, record);
        had_assessment = true;
    }
    if had_assessment {
        emit_stats_snapshots_coalesced(app, shared);
    }
}

fn consumer_loop(
    app: AppHandle,
    rx: crossbeam_channel::Receiver<InputEvent>,
    shared: Arc<Mutex<ConsumerShared>>,
) {
    while !shared.lock().unwrap().stop_flag.load(Ordering::SeqCst) {
        let timeout = {
            let runtime = app.state::<CounterStrafingRuntime>();
            let inner = runtime.inner.lock().unwrap();
            compute_recv_timeout(inner.engine.as_ref())
        };
        match rx.recv_timeout(timeout) {
            Ok(event) => {
                let runtime = app.state::<CounterStrafingRuntime>();
                let handled_capture = {
                    let mut inner = runtime.inner.lock().unwrap();
                    if let Some(role) = inner.capturing_binding {
                        if !event.is_down {
                            continue;
                        }
                        let binding = event_to_binding(&event);
                        inner.settings.key_map.set_binding(role, binding);
                        let _ = save_counter_strafing_settings(&inner.settings);
                            let settings_clone = inner.settings.clone();
                            if let Some(engine) = inner.engine.as_mut() {
                                engine.update_settings(settings_clone.clone());
                            }
                            if let Some(engine) = inner.assessment_engine.as_mut() {
                                engine.update_settings(settings_clone);
                            }
                        inner.capturing_binding = None;
                        let snap = build_snapshot(&inner);
                        let capture_only = inner.capture_only_input;
                        if capture_only {
                            inner.stop_flag.as_ref().map(|f| f.store(true, Ordering::SeqCst));
                            inner.capture_only_input = false;
                            inner.stop_flag = None;
                            let input = inner.input.take();
                            inner.consumer = None;
                            drop(inner);
                            if let Some(mut input) = input {
                                thread::spawn(move || input.stop());
                            }
                            let _ = app.emit("counter-strafing-snapshot", snap.clone());
                            let _ = app.emit("counter-strafing-status", snap);
                            break;
                        }
                        drop(inner);
                        let _ = app.emit("counter-strafing-snapshot", snap.clone());
                        let _ = app.emit("counter-strafing-status", snap);
                        true
                    } else {
                        false
                    }
                };

                if handled_capture {
                    continue;
                }

                let mut batch = vec![event];
                while batch.len() < MAX_EVENT_BATCH {
                    if let Ok(next) = rx.try_recv() {
                        batch.push(next);
                    } else {
                        break;
                    }
                }
                dispatch_consumer_events(&app, &shared, batch);
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                let now = win_input::qpc_secs();
                reconcile_stuck_inputs(&app, &shared, now);

                let mut tick_shots = Vec::new();
                {
                    let runtime = app.state::<CounterStrafingRuntime>();
                    let mut inner = runtime.inner.lock().unwrap();
                    if inner.capturing_binding.is_none() {
                        drain_engine_shots_locked(&mut inner, now, &mut tick_shots);
                    }
                }

                let had_tick_shots = !tick_shots.is_empty();
                for record in tick_shots {
                    emit_shooting_record_now(&app, &shared, record);
                }

                if had_tick_shots {
                    emit_stats_snapshots_coalesced(&app, &shared);
                } else {
                    let runtime = app.state::<CounterStrafingRuntime>();
                    let pending = {
                        let mut inner = runtime.inner.lock().unwrap();
                        collect_periodic_emissions(&mut inner)
                    };
                    flush_periodic_emissions(&app, pending);
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
        }
    }
}

fn event_to_binding(event: &InputEvent) -> InputBinding {
    match event.source {
        InputSource::Keyboard(vk) => InputBinding::keyboard(vk, vk_label(vk)),
        InputSource::Mouse(button) => InputBinding::mouse(button, mouse_label(button)),
    }
}

#[derive(Default)]
struct PeriodicEmissions {
    snapshot: Option<CounterStrafingSnapshot>,
    assessment_snapshot: Option<CounterStrafingAssessmentSnapshot>,
    snapshot_signal: Option<ipc_server::SnapshotSignal>,
}

fn collect_periodic_emissions(inner: &mut RuntimeInner) -> PeriodicEmissions {
    let mut pending = PeriodicEmissions::default();
    let should_emit_snapshot = inner
        .last_snapshot_emit
        .map(|t| t.elapsed() >= SNAPSHOT_EMIT_INTERVAL)
        .unwrap_or(true);
    if should_emit_snapshot {
        inner.last_snapshot_emit = Some(Instant::now());
        pending.snapshot = Some(build_snapshot(inner));
    }

    let should_emit_assessment = inner
        .last_assessment_snapshot_emit
        .map(|t| t.elapsed() >= SNAPSHOT_EMIT_INTERVAL)
        .unwrap_or(true);
    if should_emit_assessment {
        inner.last_assessment_snapshot_emit = Some(Instant::now());
        pending.assessment_snapshot = Some(build_assessment_snapshot(inner));
    }

    if pending.snapshot.is_some() || pending.assessment_snapshot.is_some() {
        pending.snapshot_signal = inner.snapshot_signal.clone();
    }
    pending
}

fn flush_periodic_emissions(app: &AppHandle, pending: PeriodicEmissions) {
    let should_bump = pending.snapshot.is_some() || pending.assessment_snapshot.is_some();
    if let Some(snap) = pending.snapshot {
        let _ = app.emit("counter-strafing-snapshot", snap);
    }
    if let Some(snap) = pending.assessment_snapshot {
        let _ = app.emit("counter-strafing-assessment-snapshot", snap);
    }
    if should_bump {
        if let Some(signal) = pending.snapshot_signal {
            signal.bump();
        }
    }
}

fn build_snapshot(inner: &RuntimeInner) -> CounterStrafingSnapshot {
    let mut snap = if let Some(engine) = &inner.engine {
        engine.snapshot(
            inner.active,
            inner.listening,
            inner.hud_visible,
            inner.capturing_binding,
        )
    } else {
        CounterStrafingSnapshot {
            active: inner.active,
            listening: inner.listening,
            hud_visible: inner.hud_visible,
            capturing_binding: inner.capturing_binding,
            ..Default::default()
        }
    };
    snap.hud_locked = inner.settings.hud_locked;
    snap.hud_show_stable_bars = inner.settings.hud_show_stable_bars;
    snap.hud_show_tap_markers = inner.settings.hud_show_tap_markers;
    snap.assessment_hud_visible = inner.assessment_hud_visible;
    snap.assessment_hud_locked = inner.settings.assessment_hud_locked;
    apply_hud_display_to_snapshot(&mut snap, &inner.settings);
    snap
}

fn build_assessment_snapshot(inner: &RuntimeInner) -> CounterStrafingAssessmentSnapshot {
    let mut snap = if let Some(engine) = &inner.assessment_engine {
        engine.snapshot(
            inner.active,
            inner.listening,
            inner.assessment_hud_visible,
        )
    } else {
        CounterStrafingAssessmentSnapshot {
            active: inner.active,
            listening: inner.listening,
            hud_visible: inner.assessment_hud_visible,
            ..Default::default()
        }
    };
    snap.hud_locked = inner.settings.assessment_hud_locked;
    apply_hud_display_to_assessment_snapshot(&mut snap, &inner.settings);
    snap
}

const WIDGET_IPC_TAIL: usize = 32;

fn tail_records<T: Clone>(records: Vec<T>, limit: usize) -> Vec<T> {
    if records.len() <= limit {
        records
    } else {
        records[records.len() - limit..].to_vec()
    }
}

fn build_gamebar_ipc_snapshot(inner: &RuntimeInner) -> GameBarIpcSnapshot {
    let mut assessment = build_assessment_snapshot(inner);
    assessment.records = tail_records(assessment.records, WIDGET_IPC_TAIL);

    let shooting_snap = build_snapshot(inner);
    let shooting = ShootingHudIpcSnapshot {
        shot_records: tail_records(shooting_snap.shot_records, WIDGET_IPC_TAIL),
        avg_error: shooting_snap.avg_error,
        stable_rate: shooting_snap.stable_rate,
        hud_show_stable_bars: shooting_snap.hud_show_stable_bars,
        hud_show_tap_markers: shooting_snap.hud_show_tap_markers,
        last_shot: shooting_snap.last_shot,
    };
    let layout = gamebar_layout_from_settings(&inner.settings);
    GameBarIpcSnapshot {
        assessment,
        shooting: Some(shooting),
        layout,
    }
}

fn schedule_deferred_hud_show(app: AppHandle, show_shooting: bool, show_assessment: bool) {
    if !show_shooting && !show_assessment {
        return;
    }

    std::thread::Builder::new()
        .name("counter-strafing-hud-show".into())
        .spawn(move || {
            for _ in 0..50 {
                let app_for_main = app.clone();
                let show_shooting = show_shooting;
                let show_assessment = show_assessment;
                let result = app.run_on_main_thread(move || {
                    if show_assessment {
                        let _ = show_assessment_hud_inner(&app_for_main);
                    }
                    if show_shooting {
                        let _ = show_hud_inner(&app_for_main);
                    }
                });
                if result.is_ok() {
                    let shooting_ready =
                        !show_shooting || app.get_webview_window(HUD_WINDOW_LABEL).is_some();
                    let assessment_ready = !show_assessment
                        || app
                            .get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL)
                            .is_some();
                    if shooting_ready && assessment_ready {
                        break;
                    }
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        })
        .ok();
}

fn show_hud_inner(app: &AppHandle) -> Result<CounterStrafingSnapshot, String> {
    if app.get_webview_window(HUD_WINDOW_LABEL).is_none() {
        init_hud_window(app)?;
    }

    let mut settings = load_counter_strafing_settings()?;

    let window = app
        .get_webview_window(HUD_WINDOW_LABEL)
        .ok_or_else(|| "HUD 窗口不存在".to_string())?;

    capture_shooting_hud_bounds_from_window_if_missing(&window, &mut settings);
    apply_hud_bounds(&window, &settings);
    window
        .show()
        .map_err(|e| format!("显示 HUD 失败: {e}"))?;
    sync_hud_window(&window, &settings);

    let snap = {
        let runtime = app.state::<CounterStrafingRuntime>();
        let mut inner = runtime.inner.lock().unwrap();
        inner.hud_visible = true;
        settings.hud_visible = true;
        inner.settings = settings;
        let _ = save_counter_strafing_settings(&inner.settings);
        build_snapshot(&inner)
    };
    let _ = app.emit("counter-strafing-status", snap.clone());
    Ok(snap)
}

fn show_assessment_hud_inner(app: &AppHandle) -> Result<CounterStrafingAssessmentSnapshot, String> {
    if app.get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL).is_none() {
        init_assessment_hud_window(app)?;
    }

    let mut settings = load_counter_strafing_settings()?;

    let window = app
        .get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL)
        .ok_or_else(|| "急停评估 HUD 窗口不存在".to_string())?;

    capture_assessment_hud_bounds_from_window_if_missing(&window, &mut settings);
    apply_assessment_hud_bounds(&window, &settings);
    window
        .show()
        .map_err(|e| format!("显示急停评估 HUD 失败: {e}"))?;
    settings.assessment_hud_visible = true;
    sync_assessment_hud_window(&window, &settings);

    let shooting_visible = {
        let runtime = app.state::<CounterStrafingRuntime>();
        let inner = runtime.inner.lock().unwrap();
        inner.hud_visible
    };
    if shooting_visible && !shooting_hud_bounds_complete(&settings) {
        if let Some(shooting) = app.get_webview_window(HUD_WINDOW_LABEL) {
            capture_shooting_hud_bounds_from_window_if_missing(&shooting, &mut settings);
            if !shooting_hud_bounds_complete(&settings) {
                sync_hud_window(&shooting, &settings);
            }
        }
    }

    let snap = {
        let runtime = app.state::<CounterStrafingRuntime>();
        let mut inner = runtime.inner.lock().unwrap();
        inner.assessment_hud_visible = true;
        settings.assessment_hud_visible = true;
        inner.settings = settings;
        let _ = save_counter_strafing_settings(&inner.settings);
        build_assessment_snapshot(&inner)
    };
    let _ = app.emit("counter-strafing-assessment-snapshot", snap.clone());
    Ok(snap)
}

fn run_hud_command_on_main_thread<T, F>(app: &AppHandle, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&AppHandle) -> Result<T, String> + Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::sync_channel::<Result<T, String>>(1);
    let app_for_main = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(f(&app_for_main));
    })
    .map_err(|e| format!("调度 HUD 主线程任务失败: {e}"))?;
    rx.recv()
        .map_err(|e| format!("HUD 主线程任务未返回: {e}"))?
}

pub fn init_hud_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(HUD_WINDOW_LABEL).is_some() {
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app,
        HUD_WINDOW_LABEL,
        WebviewUrl::App("counter-strafing-hud.html".into()),
    )
    .title("")
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .closable(false)
    .minimizable(false)
    .maximizable(false)
    .visible(false)
    .focused(false)
    .inner_size(HUD_WIDTH, HUD_HEIGHT)
    .build()
    .map_err(|e| format!("创建 HUD 窗口失败: {e}"))?;

    hud_window::harden_hud_window(&window);

    let settings = load_counter_strafing_settings().unwrap_or_default();
    sync_hud_window(&window, &settings);

    Ok(())
}

pub fn init_assessment_hud_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL).is_some() {
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app,
        ASSESSMENT_HUD_WINDOW_LABEL,
        WebviewUrl::App("counter-strafing-assessment-hud.html".into()),
    )
    .title("")
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(true)
    .closable(false)
    .minimizable(false)
    .maximizable(false)
    .visible(false)
    .focused(false)
    .inner_size(ASSESSMENT_HUD_WIDTH, ASSESSMENT_HUD_HEIGHT)
    .build()
    .map_err(|e| format!("创建急停评估 HUD 窗口失败: {e}"))?;

    hud_window::harden_hud_window(&window);

    let settings = load_counter_strafing_settings().unwrap_or_default();
    sync_assessment_hud_window(&window, &settings);

    Ok(())
}

fn sync_assessment_hud_window(window: &tauri::WebviewWindow, settings: &CounterStrafingSettings) {
    hud_window::harden_hud_window(window);
    apply_assessment_hud_bounds(window, settings);
    let _ = window.set_ignore_cursor_events(settings.assessment_hud_locked);
}

fn apply_assessment_hud_bounds(window: &tauri::WebviewWindow, settings: &CounterStrafingSettings) {
    if let (Some(x), Some(y), Some(width), Some(height)) = (
        settings.assessment_hud_x,
        settings.assessment_hud_y,
        settings.assessment_hud_width,
        settings.assessment_hud_height,
    ) {
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: clamp_hud_width(width).round() as u32,
            height: clamp_hud_height(height).round() as u32,
        }));
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
        return;
    }

    let logical_w = settings.assessment_hud_width.unwrap_or(ASSESSMENT_HUD_WIDTH);
    let logical_h = settings.assessment_hud_height.unwrap_or(ASSESSMENT_HUD_HEIGHT);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: logical_w,
        height: logical_h,
    }));
    let (width, height) = window
        .inner_size()
        .map(|size| (size.width as i32, size.height as i32))
        .unwrap_or((logical_w.round() as i32, logical_h.round() as i32));
    position_hud_window(window, settings.assessment_hud_anchor, width, height);
}

fn preserve_assessment_hud_bounds(
    target: &mut CounterStrafingSettings,
    source: &CounterStrafingSettings,
) {
    let disk = load_counter_strafing_settings().unwrap_or_default();
    let saved_x = source.assessment_hud_x.or(disk.assessment_hud_x);
    let saved_y = source.assessment_hud_y.or(disk.assessment_hud_y);
    let saved_w = source.assessment_hud_width.or(disk.assessment_hud_width);
    let saved_h = source.assessment_hud_height.or(disk.assessment_hud_height);

    if target.assessment_hud_x.is_none() {
        target.assessment_hud_x = saved_x;
    }
    if target.assessment_hud_y.is_none() {
        target.assessment_hud_y = saved_y;
    }
    if target.assessment_hud_width.is_none() {
        target.assessment_hud_width = saved_w;
    }
    if target.assessment_hud_height.is_none() {
        target.assessment_hud_height = saved_h;
    }
}

fn sync_hud_window(window: &tauri::WebviewWindow, settings: &CounterStrafingSettings) {
    hud_window::harden_hud_window(window);
    apply_hud_bounds(window, settings);
    let _ = window.set_ignore_cursor_events(settings.hud_locked);
}

fn apply_hud_bounds(window: &tauri::WebviewWindow, settings: &CounterStrafingSettings) {
    if let (Some(x), Some(y), Some(width), Some(height)) = (
        settings.hud_x,
        settings.hud_y,
        settings.hud_width,
        settings.hud_height,
    ) {
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: clamp_hud_width(width).round() as u32,
            height: clamp_hud_height(height).round() as u32,
        }));
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
        return;
    }

    let logical_w = settings.hud_width.unwrap_or(HUD_WIDTH);
    let logical_h = settings.hud_height.unwrap_or(HUD_HEIGHT);
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: logical_w,
        height: logical_h,
    }));
    let (width, height) = window
        .inner_size()
        .map(|size| (size.width as i32, size.height as i32))
        .unwrap_or((logical_w.round() as i32, logical_h.round() as i32));
    let (x, y) = if settings.assessment_hud_visible
        && settings.assessment_hud_x.is_none()
        && settings.assessment_hud_y.is_none()
    {
        shooting_hud_position_below_assessment(window.app_handle(), settings, width, height)
    } else {
        let rect = win_input::resolve_hud_target_rect();
        hud_position(&rect, settings.hud_anchor, width, height)
    };
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
}

fn preserve_hud_bounds(target: &mut CounterStrafingSettings, source: &CounterStrafingSettings) {
    let disk = load_counter_strafing_settings().unwrap_or_default();
    let saved_x = source.hud_x.or(disk.hud_x);
    let saved_y = source.hud_y.or(disk.hud_y);
    let saved_w = source.hud_width.or(disk.hud_width);
    let saved_h = source.hud_height.or(disk.hud_height);

    if target.hud_x.is_none() {
        target.hud_x = saved_x;
    }
    if target.hud_y.is_none() {
        target.hud_y = saved_y;
    }
    if target.hud_width.is_none() {
        target.hud_width = saved_w;
    }
    if target.hud_height.is_none() {
        target.hud_height = saved_h;
    }
}

fn position_hud_window(window: &tauri::WebviewWindow, anchor: HudAnchor, width: i32, height: i32) {
    let rect = win_input::resolve_hud_target_rect();
    let (x, y) = hud_position(&rect, anchor, width, height);
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
}

fn hud_position(rect: &ScreenRect, anchor: HudAnchor, width: i32, height: i32) -> (i32, i32) {
    let x = match anchor {
        HudAnchor::TopLeft | HudAnchor::BottomLeft => rect.x + HUD_MARGIN,
        HudAnchor::TopCenter | HudAnchor::BottomCenter => rect.x + (rect.width - width) / 2,
        HudAnchor::TopRight | HudAnchor::BottomRight => rect.x + rect.width - width - HUD_MARGIN,
    };
    let y = match anchor {
        HudAnchor::TopLeft | HudAnchor::TopCenter | HudAnchor::TopRight => rect.y + HUD_MARGIN,
        HudAnchor::BottomLeft | HudAnchor::BottomCenter | HudAnchor::BottomRight => {
            rect.y + rect.height - height - HUD_MARGIN
        }
    };
    (x, y)
}

fn assessment_hud_rect(settings: &CounterStrafingSettings) -> (i32, i32, i32, i32) {
    if let (Some(x), Some(y), Some(width), Some(height)) = (
        settings.assessment_hud_x,
        settings.assessment_hud_y,
        settings.assessment_hud_width,
        settings.assessment_hud_height,
    ) {
        return (
            x,
            y,
            clamp_hud_width(width).round() as i32,
            clamp_hud_height(height).round() as i32,
        );
    }

    let logical_w = settings.assessment_hud_width.unwrap_or(ASSESSMENT_HUD_WIDTH);
    let logical_h = settings.assessment_hud_height.unwrap_or(ASSESSMENT_HUD_HEIGHT);
    let width = logical_w.round() as i32;
    let height = logical_h.round() as i32;
    let rect = win_input::resolve_hud_target_rect();
    let (x, y) = hud_position(&rect, settings.assessment_hud_anchor, width, height);
    (x, y, width, height)
}

fn shooting_hud_position_below_assessment(
    app: &AppHandle,
    settings: &CounterStrafingSettings,
    shooting_width: i32,
    _shooting_height: i32,
) -> (i32, i32) {
    if let Some(assessment) = app.get_webview_window(ASSESSMENT_HUD_WINDOW_LABEL) {
        if let (Ok(pos), Ok(size)) = (assessment.outer_position(), assessment.inner_size()) {
            let center_x = pos.x + size.width as i32 / 2;
            let x = center_x - shooting_width / 2;
            let y = pos.y + size.height as i32 + HUD_STACK_GAP;
            return (x, y);
        }
    }

    let (assessment_x, assessment_y, assessment_w, assessment_h) = assessment_hud_rect(settings);
    let center_x = assessment_x + assessment_w / 2;
    let x = center_x - shooting_width / 2;
    let y = assessment_y + assessment_h + HUD_STACK_GAP;
    (x, y)
}

#[tauri::command]
pub fn load_counter_strafing_settings_cmd() -> Result<CounterStrafingSettings, String> {
    load_counter_strafing_settings()
}

#[tauri::command]
pub fn save_counter_strafing_settings_cmd(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
    settings: CounterStrafingSettings,
) -> Result<CounterStrafingSnapshot, String> {
    state.update_settings(&app, settings)
}

#[tauri::command]
pub fn reset_counter_strafing_settings_cmd(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> Result<CounterStrafingSnapshot, String> {
    state.reset_settings(&app)
}

#[tauri::command]
pub fn get_counter_strafing_snapshot(state: State<'_, CounterStrafingRuntime>) -> CounterStrafingSnapshot {
    state.snapshot()
}

#[tauri::command]
pub fn clear_counter_strafing_records(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> CounterStrafingSnapshot {
    state.clear_records(&app)
}

#[tauri::command]
pub async fn start_counter_strafing(
    app: AppHandle,
    show_hud: Option<bool>,
) -> Result<CounterStrafingSnapshot, String> {
    let show_hud = show_hud.unwrap_or(true);
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<CounterStrafingRuntime>()
            .start(app.clone(), show_hud)
    })
    .await
    .map_err(|e| format!("启动急停记录失败: {e}"))?
}

#[tauri::command]
pub async fn stop_counter_strafing(
    app: AppHandle,
) -> Result<CounterStrafingSnapshot, String> {
    Ok(tauri::async_runtime::spawn_blocking(move || {
        app.state::<CounterStrafingRuntime>().stop(&app)
    })
    .await
    .map_err(|e| format!("停止急停记录失败: {e}"))?)
}

#[tauri::command]
pub async fn show_counter_strafing_hud(
    app: AppHandle,
) -> Result<CounterStrafingSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_hud_command_on_main_thread(&app, show_hud_inner)
    })
    .await
    .map_err(|e| format!("显示 HUD 失败: {e}"))?
}

#[tauri::command]
pub fn hide_counter_strafing_hud(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> Result<CounterStrafingSnapshot, String> {
    state.hide_hud(&app)
}

#[tauri::command]
pub fn save_hud_bounds(
    state: State<'_, CounterStrafingRuntime>,
    x: i32,
    y: i32,
    width: f64,
    height: f64,
) -> Result<(), String> {
    state.save_hud_bounds(x, y, width, height)
}

#[tauri::command]
pub fn start_binding_capture(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
    role: BindingRole,
) -> Result<CounterStrafingSnapshot, String> {
    state.start_binding_capture(&app, role)
}

#[tauri::command]
pub fn cancel_binding_capture(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> CounterStrafingSnapshot {
    state.cancel_binding_capture(&app)
}

#[tauri::command]
pub fn reset_key_map(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> Result<CounterStrafingSnapshot, String> {
    let mut settings = load_counter_strafing_settings()?;
    settings.key_map = crate::counter_strafing::types::CounterStrafingKeyMap::default();
    state.update_settings(&app, settings)
}

#[tauri::command]
pub fn get_counter_strafing_assessment_snapshot(
    state: State<'_, CounterStrafingRuntime>,
) -> CounterStrafingAssessmentSnapshot {
    state.assessment_snapshot()
}

#[tauri::command]
pub fn clear_counter_strafing_assessment_records(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> CounterStrafingAssessmentSnapshot {
    state.clear_assessment_records(&app)
}

#[tauri::command]
pub async fn show_counter_strafing_assessment_hud(
    app: AppHandle,
) -> Result<CounterStrafingAssessmentSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_hud_command_on_main_thread(&app, show_assessment_hud_inner)
    })
    .await
    .map_err(|e| format!("显示急停评估 HUD 失败: {e}"))?
}

#[tauri::command]
pub fn hide_counter_strafing_assessment_hud(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> Result<CounterStrafingAssessmentSnapshot, String> {
    state.hide_assessment_hud(&app)
}

#[tauri::command]
pub fn save_counter_strafing_assessment_hud_bounds(
    state: State<'_, CounterStrafingRuntime>,
    x: i32,
    y: i32,
    width: f64,
    height: f64,
) -> Result<(), String> {
    state.save_assessment_hud_bounds(x, y, width, height)
}
