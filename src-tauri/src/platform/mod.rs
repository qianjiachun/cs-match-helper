mod perfect;

pub fn log_dir() -> Option<std::path::PathBuf> {
    perfect::log_dir()
}

pub fn find_watchable_parent(target: &std::path::Path) -> std::path::PathBuf {
    perfect::find_watchable_parent(target)
}

pub fn resolve_newest_log_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    perfect::resolve_newest_log_in_dir(dir)
}
