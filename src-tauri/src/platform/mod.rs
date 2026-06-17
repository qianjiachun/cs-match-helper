mod perfect;
mod platform_5e_cdp;
mod platform_5e_launch;
mod platform_5e_match;
mod platform_5e_sink;

pub use platform_5e_cdp::{get_cdp_status, start_cdp_collector, stop_cdp_collector, P5eCdpRuntime, P5eCdpStatus};
pub use platform_5e_launch::{
    launch_with_cdp, probe_5e_environment, wait_for_cdp_port, P5E_DEFAULT_CDP_PORT,
    P5eLaunchResult, P5eProbeResult,
};
pub use platform_5e_match::fetch_5e_match_detail;

pub fn find_watchable_parent(target: &std::path::Path) -> std::path::PathBuf {
    perfect::find_watchable_parent(target)
}

pub fn resolve_newest_log_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    perfect::resolve_newest_log_in_dir(dir)
}
