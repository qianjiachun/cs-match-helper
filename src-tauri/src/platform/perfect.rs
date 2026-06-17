use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// 从目标路径向上查找最近存在的目录，日志目录尚未创建时用于监听父目录
pub fn find_watchable_parent(target: &Path) -> PathBuf {
    let mut current = target.to_path_buf();
    while !current.exists() {
        if !current.pop() {
            return target.to_path_buf();
        }
    }
    current
}

/// 在日志目录中选取修改时间最新的 pvpClient*.log
pub fn resolve_newest_log_in_dir(dir: &Path) -> Option<PathBuf> {
    if !dir.is_dir() {
        return None;
    }

    let entries = std::fs::read_dir(dir).ok()?;
    let mut best: Option<(PathBuf, SystemTime)> = None;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !name.starts_with("pvpClient") || !name.ends_with(".log") {
            continue;
        }
        let modified = entry
            .metadata()
            .ok()
            .and_then(|meta| meta.modified().ok())?;
        let replace = best
            .as_ref()
            .map(|(_, current)| modified > *current)
            .unwrap_or(true);
        if replace {
            best = Some((path, modified));
        }
    }

    best.map(|(path, _)| path)
}
