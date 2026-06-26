use crate::counter_strafing::engine::{mouse_label, vk_label, CounterStrafingEngine};
use crate::counter_strafing::settings::{load_counter_strafing_settings, save_counter_strafing_settings};
use crate::counter_strafing::types::{
    BindingRole, CounterStrafingSettings, CounterStrafingSnapshot, HudAnchor, InputBinding,
    InputEvent, InputSource,
};
use crate::counter_strafing::win_input::{self, InputListener, ScreenRect};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

pub const HUD_WINDOW_LABEL: &str = "counter-strafing-hud";
const HUD_WIDTH: f64 = 420.0;
const HUD_HEIGHT: f64 = 180.0;
const HUD_MIN_WIDTH: f64 = 280.0;
const HUD_MIN_HEIGHT: f64 = 120.0;
const HUD_MARGIN: i32 = 12;
const SNAPSHOT_EMIT_INTERVAL: Duration = Duration::from_millis(100);
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
    settings: CounterStrafingSettings,
    engine: Option<CounterStrafingEngine>,
    input: Option<InputListener>,
    consumer: Option<JoinHandle<()>>,
    stop_flag: Option<Arc<AtomicBool>>,
    last_snapshot_emit: Option<Instant>,
    capturing_binding: Option<BindingRole>,
    capture_only_input: bool,
}

impl CounterStrafingRuntime {
    pub fn snapshot(&self) -> CounterStrafingSnapshot {
        let inner = self.inner.lock().unwrap();
        build_snapshot(&inner)
    }

    pub fn start(&self, app: AppHandle) -> Result<CounterStrafingSnapshot, String> {
        let mut inner = self.inner.lock().unwrap();
        if inner.listening {
            return Ok(build_snapshot(&inner));
        }

        let settings = load_counter_strafing_settings()?;
        inner.settings = settings.clone();
        inner.engine = Some(CounterStrafingEngine::new(settings));
        inner.stop_flag = Some(Arc::new(AtomicBool::new(false)));
        inner.capture_only_input = false;

        let input = match InputListener::start() {
            Ok(input) => input,
            Err(e) => {
                inner.engine = None;
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
        }));

        let consumer_shared = Arc::clone(&shared);
        let consumer = thread::Builder::new()
            .name("counter-strafing-consumer".into())
            .spawn(move || consumer_loop(app_handle, rx, consumer_shared))
            .map_err(|e| format!("启动消费线程失败: {e}"))?;
        inner.consumer = Some(consumer);

        inner.active = true;
        inner.listening = true;

        let snap = build_snapshot(&inner);
        drop(inner);
        let _ = app.emit("counter-strafing-status", snap.clone());
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
            let _ = window.hide();
            let _ = window.close();
        }

        let (consumer, input) = {
            let mut inner = self.inner.lock().unwrap();
            inner.hud_visible = false;
            inner.active = false;
            inner.listening = false;
            inner.capturing_binding = None;
            inner.capture_only_input = false;
            inner.engine = None;
            inner.stop_flag = None;
            inner.last_snapshot_emit = None;
            (inner.consumer.take(), inner.input.take())
        };

        spawn_background_join(consumer, input);
    }

    pub fn stop(&self, app: &AppHandle) -> CounterStrafingSnapshot {
        let stop_flag = {
            let inner = self.inner.lock().unwrap();
            inner.stop_flag.clone()
        };
        if let Some(flag) = stop_flag {
            flag.store(true, Ordering::SeqCst);
        }

        let (consumer, input) = {
            let mut inner = self.inner.lock().unwrap();
            (inner.consumer.take(), inner.input.take())
        };

        if let Some(handle) = consumer {
            let _ = handle.join();
        }
        if let Some(mut input) = input {
            input.stop();
        }

        let mut inner = self.inner.lock().unwrap();
        inner.engine = None;
        inner.active = false;
        inner.listening = false;
        inner.capturing_binding = None;
        inner.capture_only_input = false;
        inner.stop_flag = None;
        inner.last_snapshot_emit = None;

        let snap = build_snapshot(&inner);
        drop(inner);
        let _ = app.emit("counter-strafing-status", snap.clone());
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
        settings: CounterStrafingSettings,
    ) -> Result<CounterStrafingSnapshot, String> {
        save_counter_strafing_settings(&settings)?;
        let mut inner = self.inner.lock().unwrap();
        inner.settings = settings.clone();
        if let Some(engine) = inner.engine.as_mut() {
            engine.update_settings(settings.clone());
        }
        
        if let Some(window) = app.get_webview_window(HUD_WINDOW_LABEL) {
            let _ = window.set_ignore_cursor_events(settings.hud_locked);
        }

        let snap = build_snapshot(&inner);
        drop(inner);
        let _ = app.emit("counter-strafing-snapshot", snap.clone());
        Ok(snap)
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

    pub fn show_hud(&self, app: &AppHandle) -> Result<CounterStrafingSnapshot, String> {
        ensure_hud_window(app)?;

        let settings = {
            let guard = self.inner.lock().unwrap();
            guard.settings.clone()
        };

        let window = app
            .get_webview_window(HUD_WINDOW_LABEL)
            .ok_or_else(|| "HUD 窗口不存在".to_string())?;

        apply_hud_bounds(&window, &settings);
        window
            .show()
            .map_err(|e| format!("显示 HUD 失败: {e}"))?;
        let _ = window.set_ignore_cursor_events(settings.hud_locked);

        let mut inner = self.inner.lock().unwrap();
        inner.hud_visible = true;
        inner.settings.hud_visible = true;
        let _ = save_counter_strafing_settings(&inner.settings);
        let snap = build_snapshot(&inner);
        drop(inner);
        let _ = app.emit("counter-strafing-status", snap.clone());
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
        inner.settings.hud_width = Some(width.clamp(HUD_MIN_WIDTH, 960.0));
        inner.settings.hud_height = Some(height.clamp(HUD_MIN_HEIGHT, 480.0));
        save_counter_strafing_settings(&inner.settings)
    }
}

fn spawn_background_join(consumer: Option<JoinHandle<()>>, input: Option<InputListener>) {
    if consumer.is_none() && input.is_none() {
        return;
    }
    thread::spawn(move || {
        if let Some(handle) = consumer {
            let _ = handle.join();
        }
        if let Some(mut input) = input {
            input.stop();
        }
    });
}

struct ConsumerShared {
    stop_flag: Arc<AtomicBool>,
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

                let shot = {
                    let runtime = app.state::<CounterStrafingRuntime>();
                    let mut inner = runtime.inner.lock().unwrap();
                    inner
                        .engine
                        .as_mut()
                        .and_then(|engine| engine.handle_event(event))
                };

                if let Some(record) = shot {
                    let snap = app.state::<CounterStrafingRuntime>().snapshot();
                    let _ = app.emit("counter-strafing-shot", record);
                    let _ = app.emit("counter-strafing-snapshot", snap);
                } else {
                    let runtime = app.state::<CounterStrafingRuntime>();
                    let mut inner = runtime.inner.lock().unwrap();
                    maybe_emit_snapshot(&app, &mut inner);
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                let runtime = app.state::<CounterStrafingRuntime>();
                let mut inner = runtime.inner.lock().unwrap();
                if inner.capturing_binding.is_none() {
                    let now = win_input::qpc_secs();
                    let tick_record = inner
                        .engine
                        .as_mut()
                        .and_then(|engine| engine.tick(now));
                    if let Some(record) = tick_record {
                        drop(inner);
                        let snap = app.state::<CounterStrafingRuntime>().snapshot();
                        let _ = app.emit("counter-strafing-shot", record);
                        let _ = app.emit("counter-strafing-snapshot", snap);
                        continue;
                    }
                }
                maybe_emit_snapshot(&app, &mut inner);
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

fn maybe_emit_snapshot(app: &AppHandle, inner: &mut RuntimeInner) {
    let should_emit = inner
        .last_snapshot_emit
        .map(|t| t.elapsed() >= SNAPSHOT_EMIT_INTERVAL)
        .unwrap_or(true);
    if should_emit {
        inner.last_snapshot_emit = Some(Instant::now());
        let snap = build_snapshot(inner);
        let _ = app.emit("counter-strafing-snapshot", snap);
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
    snap
}

fn ensure_hud_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(HUD_WINDOW_LABEL).is_some() {
        return Ok(());
    }
    Err("HUD 窗口未初始化，请重启应用".to_string())
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
    .visible(false)
    .focused(false)
    .inner_size(HUD_WIDTH, HUD_HEIGHT)
    .min_inner_size(HUD_MIN_WIDTH, HUD_MIN_HEIGHT)
    .build()
    .map_err(|e| format!("创建 HUD 窗口失败: {e}"))?;

    let settings = load_counter_strafing_settings().unwrap_or_default();
    let _ = window.set_ignore_cursor_events(settings.hud_locked);

    Ok(())
}

fn apply_hud_bounds(window: &tauri::WebviewWindow, settings: &CounterStrafingSettings) {
    if let (Some(x), Some(y), Some(width), Some(height)) = (
        settings.hud_x,
        settings.hud_y,
        settings.hud_width,
        settings.hud_height,
    ) {
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: width.clamp(HUD_MIN_WIDTH, 960.0),
            height: height.clamp(HUD_MIN_HEIGHT, 480.0),
        }));
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
        return;
    }

    let width = settings.hud_width.unwrap_or(HUD_WIDTH) as i32;
    let height = settings.hud_height.unwrap_or(HUD_HEIGHT) as i32;
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: settings.hud_width.unwrap_or(HUD_WIDTH),
        height: settings.hud_height.unwrap_or(HUD_HEIGHT),
    }));
    position_hud_window(window, settings.hud_anchor, width, height);
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
pub fn start_counter_strafing(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> Result<CounterStrafingSnapshot, String> {
    state.start(app)
}

#[tauri::command]
pub fn stop_counter_strafing(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> CounterStrafingSnapshot {
    state.stop(&app)
}

#[tauri::command]
pub fn show_counter_strafing_hud(
    state: State<'_, CounterStrafingRuntime>,
    app: AppHandle,
) -> Result<CounterStrafingSnapshot, String> {
    state.show_hud(&app)
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
