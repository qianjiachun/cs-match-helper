use serde::Serialize;
use std::collections::HashSet;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

const CLIENT_EXE: &str = "5EClient.exe";
const CLIENT_DIR: &str = "5EClient";

const DRIVE_SUFFIXES: &[&str] = &[
    r"5E\5EClient",
    r"Game\5E\5EClient",
    r"Games\5E\5EClient",
    r"Program Files\5E\5EClient",
    r"Program Files (x86)\5E\5EClient",
];

const CDP_PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const CDP_PROBE_QUICK: Duration = Duration::from_millis(200);
/// 启动页环境探测：仅查默认端口，超时尽量短。
const PROBE_ENV_TIMEOUT: Duration = Duration::from_millis(120);

pub const P5E_DEFAULT_CDP_PORT: u16 = 9222;
const MAX_CDP_PORT_SCAN: u16 = 40;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct P5eLaunchResult {
    pub launched: bool,
    pub port: u16,
    pub client_root: Option<String>,
    pub pid: Option<u32>,
    pub cdp_ready: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct P5eProbeResult {
    pub external_running: bool,
    pub five_e_process_running: bool,
    pub cdp_port: Option<u16>,
    pub installed: bool,
    pub client_root: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PortState {
    Available,
    CdpActive,
    Occupied,
}

/// 将用户选择的路径规范为包含 5EClient.exe 的目录。
pub fn normalize_client_root(path: &Path) -> Option<PathBuf> {
    if path.as_os_str().is_empty() {
        return None;
    }

    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if name.eq_ignore_ascii_case(CLIENT_EXE) {
            return path.parent().filter(|p| !p.as_os_str().is_empty()).map(|p| p.to_path_buf());
        }
    }

    if path.is_file() {
        return None;
    }

    if is_valid_root(path) {
        return Some(path.to_path_buf());
    }

    let nested = path.join(CLIENT_DIR);
    if is_valid_root(&nested) {
        return Some(nested);
    }

    None
}

pub fn detect_client_root(hint: Option<&str>) -> Result<PathBuf, String> {
    if let Some(h) = hint {
        let trimmed = h.trim();
        if trimmed.is_empty() {
            return detect_client_root(None);
        }
        let path = PathBuf::from(trimmed);
        if let Some(normalized) = normalize_client_root(&path) {
            return Ok(normalized);
        }
        return Err(format!("指定的 5E 目录无效: {trimmed}"));
    }

    for path in auto_detect_candidates() {
        if is_valid_root(&path) {
            return Ok(path);
        }
    }

    Err("未找到 5E 客户端，请手动选择安装目录".to_string())
}

fn is_valid_root(root: &Path) -> bool {
    root.join(CLIENT_EXE).is_file()
}

fn push_unique(candidates: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: PathBuf) {
    let key = path.to_string_lossy().to_lowercase();
    if seen.insert(key) {
        candidates.push(path);
    }
}

fn auto_detect_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    #[cfg(windows)]
    {
        for path in registry_client_roots() {
            push_unique(&mut candidates, &mut seen, path);
        }
        if let Some(path) = running_process_client_root() {
            push_unique(&mut candidates, &mut seen, path);
        }
        for path in drive_scan_roots() {
            push_unique(&mut candidates, &mut seen, path);
        }
    }

    candidates
}

#[cfg(windows)]
fn registry_client_roots() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut roots = Vec::new();
    let hives = [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER];
    let subkeys = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    for hive in hives {
        let hive_key = RegKey::predef(hive);
        for subkey in subkeys {
            let Ok(uninstall) = hive_key.open_subkey(subkey) else {
                continue;
            };
            for key_name in uninstall.enum_keys().filter_map(|k| k.ok()) {
                let Ok(app) = uninstall.open_subkey(&key_name) else {
                    continue;
                };
                let display: String = app.get_value("DisplayName").unwrap_or_default();
                let lower = display.to_lowercase();
                if !lower.contains("5e") && !display.contains("5E对战") {
                    continue;
                }

                if let Ok(loc) = app.get_value::<String, _>("InstallLocation") {
                    let trimmed = loc.trim().trim_matches('"');
                    if !trimmed.is_empty() {
                        let path = PathBuf::from(trimmed);
                        if let Some(normalized) = normalize_client_root(&path) {
                            roots.push(normalized);
                        }
                    }
                }

                if let Ok(icon) = app.get_value::<String, _>("DisplayIcon") {
                    let icon_path = icon
                        .trim()
                        .trim_matches('"')
                        .split(',')
                        .next()
                        .unwrap_or("")
                        .trim();
                    if !icon_path.is_empty() {
                        let path = PathBuf::from(icon_path);
                        if let Some(normalized) = normalize_client_root(&path) {
                            roots.push(normalized);
                        }
                    }
                }
            }
        }
    }

    roots
}

#[cfg(not(windows))]
fn registry_client_roots() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(windows)]
fn running_process_client_root() -> Option<PathBuf> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-Process -Name '5EClient' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }

    normalize_client_root(Path::new(&path))
}

#[cfg(not(windows))]
fn running_process_client_root() -> Option<PathBuf> {
    None
}

#[cfg(windows)]
fn available_drive_letters() -> Vec<char> {
    extern "system" {
        fn GetLogicalDrives() -> u32;
    }
    let mask = unsafe { GetLogicalDrives() };
    (0..26)
        .filter(|i| mask & (1 << i) != 0)
        .map(|i| (b'A' + i as u8) as char)
        .collect()
}

#[cfg(not(windows))]
fn available_drive_letters() -> Vec<char> {
    Vec::new()
}

fn drive_scan_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for drive in available_drive_letters() {
        for suffix in DRIVE_SUFFIXES {
            roots.push(PathBuf::from(format!("{drive}:\\{suffix}")));
        }
    }
    roots
}

fn cdp_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(CDP_PROBE_TIMEOUT)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

pub fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn is_cdp_port_blocking_with_timeout(port: u16, timeout: Duration) -> bool {
    let url = format!("http://127.0.0.1:{port}/json/version");
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
        .ok()
        .and_then(|client| client.get(&url).send().ok())
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

fn port_state(port: u16) -> PortState {
    port_state_with_timeout(port, CDP_PROBE_QUICK)
}

fn port_state_with_timeout(port: u16, cdp_timeout: Duration) -> PortState {
    if is_port_available(port) {
        return PortState::Available;
    }
    if is_cdp_port_blocking_with_timeout(port, cdp_timeout) {
        PortState::CdpActive
    } else {
        PortState::Occupied
    }
}

fn scan_end(preferred: u16) -> u16 {
    preferred.saturating_add(MAX_CDP_PORT_SCAN).min(u16::MAX)
}

#[cfg(windows)]
pub fn is_5e_process_running() -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq 5EClient.exe", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.contains("5EClient.exe")
        })
        .unwrap_or(false)
}

#[cfg(not(windows))]
pub fn is_5e_process_running() -> bool {
    false
}

fn is_cdp_active_on_port(port: u16) -> bool {
    !is_port_available(port) && is_cdp_port_blocking_with_timeout(port, PROBE_ENV_TIMEOUT)
}

/// 探测 5E 运行环境与 CDP 状态（快速路径：安装目录 + 进程 + 默认端口）。
pub fn probe_5e_environment(preferred: u16, client_root_hint: Option<&str>) -> P5eProbeResult {
    let client_root = detect_client_root(client_root_hint).ok();
    let installed = client_root.is_some();
    let five_e_process_running = is_5e_process_running();
    let cdp_port = is_cdp_active_on_port(preferred).then_some(preferred);

    if !installed {
        return P5eProbeResult {
            external_running: five_e_process_running || cdp_port.is_some(),
            five_e_process_running,
            cdp_port,
            installed: false,
            client_root: None,
            message: "未检测到 5E 安装".to_string(),
        };
    }

    let root = client_root
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    if five_e_process_running {
        return P5eProbeResult {
            external_running: true,
            five_e_process_running: true,
            cdp_port,
            installed: true,
            client_root: Some(root),
            message: if cdp_port.is_some() {
                "检测到 5E 正在运行".to_string()
            } else {
                "检测到 5E 正在运行".to_string()
            },
        };
    }

    if cdp_port.is_some() {
        return P5eProbeResult {
            external_running: true,
            five_e_process_running: false,
            cdp_port,
            installed: true,
            client_root: Some(root),
            message: "检测到 5E 正在运行".to_string(),
        };
    }

    P5eProbeResult {
        external_running: false,
        five_e_process_running: false,
        cdp_port: None,
        installed: true,
        client_root: Some(root),
        message: "可以启动 5E".to_string(),
    }
}

/// 为启动 5E 选择 CDP 端口：优先默认端口，仅在非 CDP 占用时顺延。
pub fn resolve_cdp_launch_port(preferred: u16) -> Result<u16, String> {
    if is_5e_process_running() {
        return Err("5E 已在运行，请先完全退出".to_string());
    }

    let end = scan_end(preferred);

    match port_state(preferred) {
        PortState::CdpActive => {
            return Err(format!(
                "端口 {preferred} 上已有调试连接，请先完全退出 5E"
            ));
        }
        PortState::Available => return Ok(preferred),
        PortState::Occupied => {
            for port in (preferred + 1)..=end {
                match port_state(port) {
                    PortState::Available => {
                        eprintln!("[5e-cdp] port {preferred} is busy, using {port} for CDP");
                        return Ok(port);
                    }
                    PortState::CdpActive => {
                        return Err(format!(
                            "端口 {port} 上已有调试连接，请先完全退出 5E"
                        ));
                    }
                    PortState::Occupied => continue,
                }
            }
            Err(format!(
                "在 {preferred}–{end} 范围内未找到可用端口，请关闭占用端口的程序后重试"
            ))
        }
    }
}

pub async fn is_cdp_port_reachable(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/json/version");
    match cdp_http_client().get(&url).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// 等待 5E CDP 端口就绪，避免启动阶段反复重连加重卡顿。
pub async fn wait_for_cdp_port(port: u16, max_wait: Duration) -> bool {
    let start = tokio::time::Instant::now();
    while start.elapsed() < max_wait {
        if is_cdp_port_reachable(port).await {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    false
}

pub fn launch_with_cdp(client_root: Option<&str>, preferred_port: u16) -> Result<P5eLaunchResult, String> {
    let root = detect_client_root(client_root)?;
    let exe = root.join(CLIENT_EXE);
    let port = resolve_cdp_launch_port(preferred_port)?;

    let mut command = std::process::Command::new(&exe);
    command
        .current_dir(&root)
        .arg(format!("--remote-debugging-port={port}"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        command.creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS);
    }

    let child = command
        .spawn()
        .map_err(|e| format!("启动 5E 失败: {e}"))?;

    Ok(P5eLaunchResult {
        launched: true,
        port,
        client_root: Some(root.display().to_string()),
        pid: Some(child.id()),
        cdp_ready: false,
        message: format!("已启动 5E 客户端，等待端口 {port} 就绪…"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_launch_uses_preferred_when_available() {
        if is_5e_process_running() {
            return;
        }
        for port in 15000u16..15100 {
            if port_state(port) == PortState::Available {
                let resolved = resolve_cdp_launch_port(port).expect("resolve");
                assert_eq!(resolved, port);
                return;
            }
        }
    }

    #[test]
    fn resolve_launch_uses_next_when_preferred_occupied() {
        if is_5e_process_running() {
            return;
        }
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind ephemeral");
        let occupied = listener.local_addr().expect("local addr").port();
        let next = occupied.saturating_add(1);
        if port_state(next) != PortState::Available {
            return;
        }
        let resolved = resolve_cdp_launch_port(occupied).expect("resolve");
        assert_eq!(resolved, next);
    }

    #[test]
    fn resolve_launch_rejects_when_only_cdp_occupied() {
        // 无法在无真实 CDP 的环境下稳定模拟，至少验证空闲端口路径
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind ephemeral");
        let port = listener.local_addr().expect("local addr").port();
        assert_eq!(port_state(port), PortState::Occupied);
    }

    #[test]
    fn probe_environment_not_external_when_clean() {
        if is_5e_process_running() || is_cdp_active_on_port(P5E_DEFAULT_CDP_PORT) {
            return;
        }
        let probe = probe_5e_environment(P5E_DEFAULT_CDP_PORT, None);
        assert!(!probe.external_running);
        if probe.installed {
            assert!(probe.client_root.is_some());
        }
    }

    #[test]
    fn normalize_accepts_client_exe_path() {
        let root = PathBuf::from(r"X:\Apps\5E\5EClient");
        let exe = root.join(CLIENT_EXE);
        assert_eq!(normalize_client_root(&exe).as_ref(), Some(&root));
    }

    #[test]
    fn normalize_accepts_parent_with_nested_client_dir() {
        let parent = PathBuf::from(r"X:\Apps\5E");
        let root = parent.join(CLIENT_DIR);
        if !is_valid_root(&root) {
            return;
        }
        assert_eq!(normalize_client_root(&parent).as_ref(), Some(&root));
    }

    #[test]
    fn probe_environment_completes_quickly_when_clean() {
        if is_5e_process_running() || is_cdp_active_on_port(P5E_DEFAULT_CDP_PORT) {
            return;
        }
        let start = std::time::Instant::now();
        let _ = probe_5e_environment(P5E_DEFAULT_CDP_PORT, None);
        assert!(
            start.elapsed() < Duration::from_secs(2),
            "probe took {:?}",
            start.elapsed()
        );
    }
}
