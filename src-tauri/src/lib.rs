mod ai;
mod comments;
mod legacy_hud_cleanup;
mod log_watcher;
mod match_history;
mod platform;
mod settings_store;
mod shutdown;
mod update;

use ai::AiAnalysisState;
use log_watcher::WatcherState;
use platform::{
    cancel_perfect_login, clear_perfect_auth, debug_perfect_player_apis, decrypt_perfect_response,
    fetch_5e_match_detail, fetch_5e_player_home, fetch_5e_player_home_batch, fetch_http_json,
    fetch_perfect_player_stats, fetch_proxied_image, get_cdp_status, get_perfect_auth_status,
    launch_with_cdp, probe_5e_environment, relaunch_current_exe_as_admin,
    search_perfect_board_user,
    set_cdp_gate_debug_mode, set_cdp_ws_debug_mode, start_cdp_collector, start_perfect_qr_login,
    start_perfect_steam_login, stop_cdp_collector, wait_for_cdp_port, P5eCdpRuntime, P5eCdpStatus,
    P5eLaunchResult, P5eProbeResult, PerfectAuthRuntime, P5E_DEFAULT_CDP_PORT,
};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

#[tauri::command]
fn get_log_status(state: tauri::State<'_, AppState>) -> log_watcher::WatcherStatus {
    state.watcher.lock().unwrap().status()
}

#[tauri::command]
fn start_log_watch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    log_dir: String,
) -> Result<(), String> {
    let mut watcher = state.watcher.lock().unwrap();
    watcher.start(app, log_dir)
}

#[tauri::command]
fn stop_log_watch(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut watcher = state.watcher.lock().unwrap();
    watcher.stop();
    Ok(())
}

#[tauri::command]
fn read_latest_log_lines(log_dir: String) -> Result<Vec<String>, String> {
    log_watcher::read_latest_log_lines(&log_dir)
}

/// 预留：批量获取玩家扩展数据（首版未实现）
#[tauri::command]
async fn launch_5e_with_cdp(
    port: Option<u16>,
    client_root: Option<String>,
) -> Result<P5eLaunchResult, String> {
    let preferred = port.unwrap_or(P5E_DEFAULT_CDP_PORT);
    let mut result =
        tokio::task::spawn_blocking(move || launch_with_cdp(client_root.as_deref(), preferred))
            .await
            .map_err(|e| format!("启动任务失败: {e}"))??;

    if result.launched && !result.cdp_ready {
        let ready = wait_for_cdp_port(result.port, Duration::from_secs(60)).await;
        result.cdp_ready = ready;
        result.message = if ready {
            format!("5E 已启动，端口 {} 已就绪", result.port)
        } else {
            format!(
                "无法启动 5E。请右键「CS 匹配助手」→「以管理员身份运行」后重试。（端口 {} 在 60 秒内未就绪）",
                result.port
            )
        };
    }

    Ok(result)
}

#[tauri::command]
async fn start_5e_cdp_collector(
    app: tauri::AppHandle,
    state: tauri::State<'_, P5eCdpRuntime>,
    port: Option<u16>,
    client_root: Option<String>,
) -> Result<P5eCdpStatus, String> {
    start_cdp_collector(app, state, port, client_root).await
}

#[tauri::command]
async fn probe_5e_cdp_active(client_root: Option<String>) -> P5eProbeResult {
    tokio::task::spawn_blocking(move || {
        probe_5e_environment(P5E_DEFAULT_CDP_PORT, client_root.as_deref())
    })
    .await
    .unwrap_or_else(|_| P5eProbeResult {
        external_running: false,
        five_e_process_running: false,
        cdp_port: None,
        installed: false,
        client_root: None,
        message: "探测失败".to_string(),
    })
}

#[tauri::command]
fn close_app(app: tauri::AppHandle) {
    shutdown_app(&app);
    app.exit(0);
}

#[tauri::command]
fn set_app_locale(app: tauri::AppHandle, locale: String) {
    let normalized = if locale.eq_ignore_ascii_case("en-US") {
        "en-US"
    } else {
        "zh-CN"
    };
    if let Some(window) = app.get_webview_window("main") {
        let title = if normalized == "en-US" {
            format!("CS Match Helper - By 小淳 v{}", env!("CARGO_PKG_VERSION"))
        } else {
            format!("CS 匹配助手 -By 小淳 v{}", env!("CARGO_PKG_VERSION"))
        };
        let _ = window.set_title(&title);
    }
}

#[tauri::command]
async fn relaunch_as_admin(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(relaunch_current_exe_as_admin)
        .await
        .map_err(|e| format!("重启任务失败: {e}"))??;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn stop_5e_cdp_collector(state: tauri::State<'_, P5eCdpRuntime>) -> P5eCdpStatus {
    stop_cdp_collector(state)
}

#[tauri::command]
fn get_5e_cdp_status(state: tauri::State<'_, P5eCdpRuntime>) -> P5eCdpStatus {
    get_cdp_status(state)
}

#[tauri::command]
fn set_5e_cdp_gate_debug_mode(
    state: tauri::State<'_, P5eCdpRuntime>,
    enabled: bool,
) -> P5eCdpStatus {
    set_cdp_gate_debug_mode(state, enabled)
}

#[tauri::command]
fn set_5e_cdp_ws_debug_mode(state: tauri::State<'_, P5eCdpRuntime>, enabled: bool) -> P5eCdpStatus {
    set_cdp_ws_debug_mode(state, enabled)
}

#[tauri::command]
fn open_app_devtools(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    window.open_devtools();
    Ok(())
}

#[tauri::command]
fn close_app_devtools(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    window.close_devtools();
    Ok(())
}

struct AppState {
    watcher: Mutex<WatcherState>,
}

pub(crate) fn shutdown_app(app: &tauri::AppHandle) {
    if !shutdown::begin_app_shutdown() {
        return;
    }

    app.state::<P5eCdpRuntime>().stop();

    let app_state = app.state::<AppState>();
    let watcher_handle = {
        let mut watcher = app_state.watcher.lock().unwrap();
        watcher.signal_stop();
        watcher.take_handle()
    };

    if let Some(handle) = watcher_handle {
        thread::spawn(move || {
            let _ = handle.join();
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            watcher: Mutex::new(WatcherState::default()),
        })
        .manage(AiAnalysisState::default())
        .manage(P5eCdpRuntime::default())
        .manage(PerfectAuthRuntime::default())
        .setup(|app| {
            let version = env!("CARGO_PKG_VERSION");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&format!("CS 匹配助手 -By 小淳 v{version}"));
            }

            update::startup_update_maintenance(app.handle());
            legacy_hud_cleanup::start();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_log_status,
            start_log_watch,
            stop_log_watch,
            read_latest_log_lines,
            fetch_perfect_player_stats,
            debug_perfect_player_apis,
            search_perfect_board_user,
            get_perfect_auth_status,
            start_perfect_qr_login,
            start_perfect_steam_login,
            cancel_perfect_login,
            clear_perfect_auth,
            decrypt_perfect_response,
            launch_5e_with_cdp,
            start_5e_cdp_collector,
            stop_5e_cdp_collector,
            get_5e_cdp_status,
            set_5e_cdp_gate_debug_mode,
            set_5e_cdp_ws_debug_mode,
            probe_5e_cdp_active,
            fetch_5e_match_detail,
            fetch_5e_player_home,
            fetch_5e_player_home_batch,
            fetch_http_json,
            fetch_proxied_image,
            open_app_devtools,
            close_app_devtools,
            ai::get_ai_settings_path,
            ai::load_ai_settings,
            ai::save_ai_settings,
            ai::load_p5e_client_root,
            ai::save_p5e_client_root,
            ai::start_ai_analysis,
            ai::cancel_ai_analysis,
            update::get_app_version,
            update::check_for_update,
            update::list_changelog_releases,
            update::get_changelog_release,
            update::download_update,
            update::apply_update_and_restart,
            comments::get_comment_client_key,
            match_history::list_match_history,
            match_history::list_match_history_documents,
            match_history::get_match_history_entry,
            match_history::upsert_match_history_entry,
            match_history::patch_match_history_section,
            match_history::delete_match_history_entry,
            match_history::clear_match_history,
            relaunch_as_admin,
            close_app,
            set_app_locale,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            RunEvent::ExitRequested { .. } => {
                shutdown_app(app_handle);
            }
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } if label == "main" => {
                if shutdown::is_app_shutting_down() {
                    shutdown_app(app_handle);
                } else {
                    api.prevent_close();
                    let _ = app_handle.emit("app-close-requested", ());
                }
            }
            _ => {}
        });
}
