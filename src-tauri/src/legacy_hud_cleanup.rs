use serde_json::json;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

const CLEANUP_VERSION: u32 = 1;
const CLEANUP_MARKER_FILENAME: &str = "legacy-hud-cleanup-v1.json";
const CLEANUP_LOG_FILENAME: &str = "legacy-hud-cleanup.log";
const LEGACY_GSI_FILENAME: &str = "gamestate_integration_cs_match_helper.cfg";
const LEGACY_GSI_ENDPOINT: &str = "/cs-match-helper-gsi";
const LEGACY_WIDGET_PACKAGES: &[&str] = &[
    "CSMatchHelper.GameBarWidget",
    "CSMatchHelper.CounterStrafingHudWidget",
];
const LEGACY_WIDGET_MARKERS: &[&str] = &[
    "install.ok",
    "installed.pending",
    "runtime-verified.json",
    "install.fail",
    "install-issue.json",
    "ipc-port.json",
];

pub fn start() {
    std::thread::spawn(|| {
        if let Err(error) = run() {
            append_log(&format!("cleanup failed: {error}"));
        }
    });
}

fn run() -> Result<(), String> {
    let local_root = dirs::data_local_dir()
        .map(|path| path.join("CSMatchHelper"))
        .ok_or_else(|| "LOCALAPPDATA is unavailable".to_string())?;
    let marker_path = local_root.join(CLEANUP_MARKER_FILENAME);
    if marker_path.is_file() {
        return Ok(());
    }

    remove_legacy_widget_packages()?;
    let removed_gsi_configs = remove_legacy_gsi_configs()?;
    let removed_markers = remove_legacy_widget_markers(&local_root)?;

    fs::create_dir_all(&local_root)
        .map_err(|error| format!("create cleanup marker directory: {error}"))?;
    let marker = json!({
        "schemaVersion": CLEANUP_VERSION,
        "completed": true,
        "removedGsiConfigs": removed_gsi_configs,
        "removedWidgetMarkers": removed_markers,
    });
    fs::write(
        &marker_path,
        serde_json::to_vec_pretty(&marker).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("write cleanup marker: {error}"))?;
    append_log("cleanup completed");
    Ok(())
}

#[cfg(windows)]
fn remove_legacy_widget_packages() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let package_names = LEGACY_WIDGET_PACKAGES
        .iter()
        .map(|name| format!("'{name}'"))
        .collect::<Vec<_>>()
        .join(",");
    let script = format!(
        "$ErrorActionPreference='Stop'; $names=@({package_names}); foreach($name in $names) {{ $packages=@(Get-AppxPackage -AllUsers -Name $name -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -eq $name }}); foreach($package in $packages) {{ Remove-AppxPackage -Package $package.PackageFullName -AllUsers -ErrorAction Stop }}; $current=@(Get-AppxPackage -Name $name -ErrorAction SilentlyContinue | Where-Object {{ $_.Name -eq $name }}); foreach($package in $current) {{ Remove-AppxPackage -Package $package.PackageFullName -ErrorAction Stop }} }}"
    );
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("start legacy Widget cleanup: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "legacy Widget cleanup exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn remove_legacy_widget_packages() -> Result<(), String> {
    Ok(())
}

fn remove_legacy_widget_markers(local_root: &Path) -> Result<Vec<String>, String> {
    let marker_dir = local_root.join("gamebar-widget");
    let mut removed = Vec::new();
    for name in LEGACY_WIDGET_MARKERS {
        let path = marker_dir.join(name);
        if !path.exists() {
            continue;
        }
        fs::remove_file(&path)
            .map_err(|error| format!("remove legacy Widget marker {}: {error}", path.display()))?;
        removed.push((*name).to_string());
    }
    Ok(removed)
}

fn remove_legacy_gsi_configs() -> Result<Vec<String>, String> {
    let mut candidates = BTreeSet::new();
    if let Some(path) = configured_gsi_path() {
        candidates.insert(path);
    }
    for path in discovered_gsi_paths() {
        candidates.insert(path);
    }

    let mut removed = Vec::new();
    for path in candidates {
        if remove_verified_gsi_config(&path)? {
            removed.push(path.to_string_lossy().into_owned());
        }
    }
    Ok(removed)
}

fn remove_verified_gsi_config(path: &Path) -> Result<bool, String> {
    if path.file_name().and_then(|name| name.to_str()) != Some(LEGACY_GSI_FILENAME) {
        return Ok(false);
    }
    if !path.is_file() {
        return Ok(false);
    }
    let content = fs::read_to_string(path)
        .map_err(|error| format!("read legacy GSI config {}: {error}", path.display()))?;
    if !content.contains(LEGACY_GSI_ENDPOINT) {
        return Ok(false);
    }
    fs::remove_file(path)
        .map_err(|error| format!("remove legacy GSI config {}: {error}", path.display()))?;
    Ok(true)
}

fn configured_gsi_path() -> Option<PathBuf> {
    let settings_path = std::env::current_exe()
        .ok()?
        .parent()?
        .join("cs-match-helper-settings.json");
    let root: serde_json::Value = serde_json::from_slice(&fs::read(settings_path).ok()?).ok()?;
    root.get("gsi")?
        .get("configPath")?
        .as_str()
        .map(PathBuf::from)
}

fn discovered_gsi_paths() -> Vec<PathBuf> {
    let mut libraries = steam_install_roots();
    for root in libraries.clone() {
        let file = root.join("steamapps").join("libraryfolders.vdf");
        let Ok(content) = fs::read_to_string(file) else {
            continue;
        };
        for line in content.lines() {
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 4 && parts[1].trim() == "path" {
                libraries.push(PathBuf::from(parts[3].replace("\\\\", "\\")));
            }
        }
    }
    libraries.sort();
    libraries.dedup();

    let mut paths = Vec::new();
    for library in libraries {
        let manifest = library.join("steamapps").join("appmanifest_730.acf");
        let Ok(content) = fs::read_to_string(manifest) else {
            continue;
        };
        let Some(install_dir) = parse_install_dir(&content) else {
            continue;
        };
        paths.push(
            library
                .join("steamapps")
                .join("common")
                .join(install_dir)
                .join("game")
                .join("csgo")
                .join("cfg")
                .join(LEGACY_GSI_FILENAME),
        );
    }
    paths
}

fn parse_install_dir(content: &str) -> Option<&str> {
    content.lines().find_map(|line| {
        let mut quoted = line.split('"');
        let _prefix = quoted.next()?;
        let key = quoted.next()?.trim();
        let _separator = quoted.next()?;
        let value = quoted.next()?;
        (key == "installdir" && !value.trim().is_empty()).then_some(value)
    })
}

#[cfg(windows)]
fn steam_install_roots() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut roots = Vec::new();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        if let Ok(key) = RegKey::predef(hive).open_subkey("Software\\Valve\\Steam") {
            for value_name in ["SteamPath", "InstallPath"] {
                if let Ok(path) = key.get_value::<String, _>(value_name) {
                    roots.push(PathBuf::from(path));
                }
            }
        }
    }
    roots.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
    roots
}

#[cfg(not(windows))]
fn steam_install_roots() -> Vec<PathBuf> {
    Vec::new()
}

fn append_log(message: &str) {
    let Some(path) = dirs::data_local_dir()
        .map(|path| path.join("CSMatchHelper").join(CLEANUP_LOG_FILENAME))
    else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    use std::io::Write;
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{message}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_removes_verified_legacy_gsi_config() {
        let root = std::env::temp_dir().join(format!("csmh-cleanup-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let legacy = root.join(LEGACY_GSI_FILENAME);
        fs::write(
            &legacy,
            format!("uri http://127.0.0.1:31980{LEGACY_GSI_ENDPOINT}"),
        )
        .unwrap();
        assert!(remove_verified_gsi_config(&legacy).unwrap());
        assert!(!legacy.exists());

        let unrelated = root.join(LEGACY_GSI_FILENAME);
        fs::write(&unrelated, "uri http://127.0.0.1:31990/another-product-gsi").unwrap();
        assert!(!remove_verified_gsi_config(&unrelated).unwrap());
        assert!(unrelated.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn package_cleanup_allowlist_contains_only_legacy_helper_packages() {
        assert_eq!(LEGACY_WIDGET_PACKAGES.len(), 2);
        assert!(LEGACY_WIDGET_PACKAGES
            .iter()
            .all(|name| name.starts_with("CSMatchHelper.")));
    }

    #[test]
    fn install_dir_parser_ignores_malformed_manifest_lines() {
        let manifest = "\n// comment\n\"AppState\" \"4\"\n\"installdir\"\n\"installdir\" \"Counter-Strike Global Offensive\"\n";
        assert_eq!(
            parse_install_dir(manifest),
            Some("Counter-Strike Global Offensive")
        );
        assert_eq!(parse_install_dir("\n\"installdir\" \"\"\n"), None);
    }
}
