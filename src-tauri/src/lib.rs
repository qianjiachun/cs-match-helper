mod ai;
mod log_watcher;
mod platform;
mod update;

use ai::AiAnalysisState;
use log_watcher::WatcherState;
use std::sync::Mutex;
use tauri::Manager;

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
fn fetch_player_enrichment(_steam_ids: Vec<String>) -> Result<(), String> {
    Err("player enrichment not implemented".to_string())
}

struct AppState {
    watcher: Mutex<WatcherState>,
}

fn default_log_dir() -> Option<std::path::PathBuf> {
    platform::log_dir()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            watcher: Mutex::new(WatcherState::default()),
        })
        .manage(AiAnalysisState::default())
        .setup(|app| {
            let version = env!("CARGO_PKG_VERSION");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&format!("CS 匹配助手 -By 小淳 v{version}"));
            }

            if let Some(log_dir) = default_log_dir() {
                let state = app.state::<AppState>();
                let mut watcher = state.watcher.lock().unwrap();
                let _ = watcher.start(app.handle().clone(), log_dir.display().to_string());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_log_status,
            start_log_watch,
            stop_log_watch,
            read_latest_log_lines,
            fetch_player_enrichment,
            ai::get_ai_settings_path,
            ai::load_ai_settings,
            ai::save_ai_settings,
            ai::start_ai_analysis,
            ai::cancel_ai_analysis,
            update::get_app_version,
            update::check_for_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
