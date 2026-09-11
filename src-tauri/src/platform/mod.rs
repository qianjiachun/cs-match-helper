mod admin_relaunch;
mod perfect;
mod perfect_api;
mod perfect_auth;
mod perfect_credentials;
mod perfect_crypto;
mod perfect_player;
mod platform_5e_cdp;
mod platform_5e_gate_sign;
mod platform_5e_launch;
mod platform_5e_match;
mod platform_5e_player_home;
mod platform_5e_sink;
mod platform_5e_ws;
mod platform_board;

pub use admin_relaunch::relaunch_current_exe_as_admin;
pub use perfect_auth::{
    cancel_perfect_login, clear_perfect_auth, get_perfect_auth_status, start_perfect_qr_login,
    start_perfect_steam_login, PerfectAuthRuntime,
};
pub use perfect_crypto::decrypt_perfect_response;
pub use perfect_player::{
    debug_perfect_player_apis, fetch_perfect_player_stats, search_perfect_board_user,
};
pub use platform_5e_cdp::{
    get_cdp_status, set_cdp_gate_debug_mode, set_cdp_ws_debug_mode, start_cdp_collector,
    stop_cdp_collector, P5eCdpRuntime, P5eCdpStatus,
};
pub use platform_5e_launch::{
    launch_with_cdp, probe_5e_environment, wait_for_cdp_port, P5eLaunchResult, P5eProbeResult,
    P5E_DEFAULT_CDP_PORT,
};
pub use platform_5e_match::fetch_5e_match_detail;
pub use platform_5e_player_home::{fetch_5e_player_home, fetch_5e_player_home_batch};
pub use platform_board::{fetch_http_json, fetch_proxied_image};

pub fn find_watchable_parent(target: &std::path::Path) -> std::path::PathBuf {
    perfect::find_watchable_parent(target)
}

pub fn resolve_newest_log_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    perfect::resolve_newest_log_in_dir(dir)
}
