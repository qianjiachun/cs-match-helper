use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter};

const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/qianjiachun/cs-match-helper/releases/latest";
const GITHUB_RELEASES_LIST_URL: &str =
    "https://api.github.com/repos/qianjiachun/cs-match-helper/releases?per_page=50";

const LUNARIS_USERNAME: &str = "qianjiachun";
const LUNARIS_PROJECT: &str = "cs-match-helper";
const LUNARIS_FILE_NAME: &str = "cs-match-helper.exe";
const UPDATE_LOG_FILE: &str = "cs-match-helper-update.log";
const UPDATE_FAILURE_MARKER: &str = "cs-match-helper-update-failed.marker";

fn old_exe_path(current_exe: &Path) -> PathBuf {
    PathBuf::from(format!("{}.old", current_exe.to_string_lossy()))
}

fn update_log_path() -> PathBuf {
    std::env::temp_dir().join(UPDATE_LOG_FILE)
}

fn update_failure_marker_path() -> PathBuf {
    std::env::temp_dir().join(UPDATE_FAILURE_MARKER)
}

fn write_update_failure_marker() {
    let _ = std::fs::write(update_failure_marker_path(), b"1");
}

fn clear_update_failure_marker() {
    let _ = std::fs::remove_file(update_failure_marker_path());
}

fn append_update_log(message: &str) {
    let line = format!(
        "[{}] {}\n",
        chrono_like_now(),
        message
    );
    let path = update_log_path();
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let _ = file.write_all(line.as_bytes());
    }
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{secs}")
}

#[cfg(windows)]
fn unblock_motw(path: &Path) {
    let ads = format!("{}:Zone.Identifier", path.to_string_lossy());
    let _ = std::fs::remove_file(ads);
}

#[cfg(not(windows))]
fn unblock_motw(_path: &Path) {}

fn rollback_replaced_executable(current_exe: &Path, old_exe: &Path) {
    if !old_exe.is_file() {
        return;
    }

    if current_exe.is_file() {
        let _ = std::fs::remove_file(current_exe);
    }

    let _ = std::fs::rename(old_exe, current_exe);
}

fn replace_executable_in_place(current_exe: &Path, new_exe: &Path) -> Result<(), String> {
    unblock_motw(new_exe);

    let old_exe = old_exe_path(current_exe);
    if old_exe.is_file() {
        std::fs::remove_file(&old_exe)
            .map_err(|error| format!("无法清理旧备份文件: {error}"))?;
    }

    let source_size = std::fs::metadata(new_exe)
        .map_err(|error| format!("无法读取更新文件: {error}"))?
        .len();

    std::fs::rename(current_exe, &old_exe)
        .map_err(|error| format!("无法重命名当前程序（请确认程序目录可写）: {error}"))?;

    let copy_result = std::fs::copy(new_exe, current_exe).map_err(|error| {
        rollback_replaced_executable(current_exe, &old_exe);
        format!("无法写入新版本（请确认程序目录可写）: {error}")
    })?;

    if copy_result != source_size {
        rollback_replaced_executable(current_exe, &old_exe);
        return Err("复制后文件大小不一致，已恢复旧版本".to_string());
    }

    let target_size = std::fs::metadata(current_exe)
        .map_err(|error| format!("无法校验新版本: {error}"))?
        .len();

    if target_size != source_size {
        rollback_replaced_executable(current_exe, &old_exe);
        return Err("新版本校验失败，已恢复旧版本".to_string());
    }

    Ok(())
}

pub fn startup_update_maintenance(app: &AppHandle) {
    if let Ok(current_exe) = std::env::current_exe() {
        let old_exe = old_exe_path(&current_exe);
        if old_exe.is_file() {
            let _ = std::fs::remove_file(old_exe);
        }
    }

    if update_failure_marker_path().is_file() {
        let _ = std::fs::remove_file(update_failure_marker_path());
        let _ = app.emit("update-previous-failed", ());
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub has_update: bool,
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
    pub release_url: Option<String>,
    pub published_at: Option<String>,
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadUpdateResult {
    pub file_path: String,
    pub sha256: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressEvent {
    pub phase: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangelogReleaseSummary {
    pub tag_name: String,
    pub published_at: Option<String>,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangelogReleaseDetail {
    pub tag_name: String,
    pub published_at: Option<String>,
    pub html_url: String,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    draft: Option<bool>,
    prerelease: Option<bool>,
}

fn normalize_version_tag(version: &str) -> String {
    version.trim().trim_start_matches('v').to_string()
}

fn build_lunaris_download_url(version: &str) -> String {
    let tag = normalize_version_tag(version);
    format!(
        "https://cdn.lunaris.win/{LUNARIS_USERNAME}/{LUNARIS_PROJECT}/{LUNARIS_FILE_NAME}?download&v={tag}"
    )
}

fn parse_version_parts(version: &str) -> Vec<u32> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
        })
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect()
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let latest_parts = parse_version_parts(latest);
    let current_parts = parse_version_parts(current);

    if latest_parts.is_empty() || current_parts.is_empty() {
        return false;
    }

    let max_len = latest_parts.len().max(current_parts.len());
    for index in 0..max_len {
        let latest_value = latest_parts.get(index).copied().unwrap_or(0);
        let current_value = current_parts.get(index).copied().unwrap_or(0);

        if latest_value > current_value {
            return true;
        }
        if latest_value < current_value {
            return false;
        }
    }

    false
}

fn emit_progress(
    app: &AppHandle,
    phase: &str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
) {
    let percent = total_bytes.and_then(|total| {
        if total > 0 {
            Some((downloaded_bytes as f64 / total as f64) * 100.0)
        } else {
            None
        }
    });

    let _ = app.emit(
        "update-progress",
        UpdateProgressEvent {
            phase: phase.to_string(),
            downloaded_bytes,
            total_bytes,
            percent,
        },
    );
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("cs-match-helper")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("cs-match-helper")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())
}

fn normalize_github_tag(tag: &str) -> String {
    let trimmed = tag.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with('v') || trimmed.starts_with('V') {
        trimmed.to_string()
    } else {
        format!("v{trimmed}")
    }
}

fn is_public_release(release: &GithubRelease) -> bool {
    !release.draft.unwrap_or(false) && !release.prerelease.unwrap_or(false)
}

async fn fetch_github_release_list() -> Result<Vec<GithubRelease>, String> {
    let client = github_client()?;
    let response = client
        .get(GITHUB_RELEASES_LIST_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("获取发布列表失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("获取发布列表失败: HTTP {}", response.status()));
    }

    response
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|error| format!("解析发布列表失败: {error}"))
}

async fn fetch_github_release_by_tag(tag: &str) -> Result<GithubRelease, String> {
    let normalized = normalize_github_tag(tag);
    if normalized.is_empty() {
        return Err("版本号无效".to_string());
    }

    let url = format!(
        "https://api.github.com/repos/qianjiachun/cs-match-helper/releases/tags/{normalized}"
    );
    let client = github_client()?;
    let response = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("获取更新详情失败: {error}"))?;

    if response.status().as_u16() == 404 {
        return Err(format!("未找到版本 {normalized} 的发布说明"));
    }

    if !response.status().is_success() {
        return Err(format!("获取更新详情失败: HTTP {}", response.status()));
    }

    response
        .json::<GithubRelease>()
        .await
        .map_err(|error| format!("解析更新详情失败: {error}"))
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn check_for_update() -> Result<UpdateCheckResult, String> {
    let current_version = get_app_version();
    let client = http_client()?;

    let response = client
        .get(GITHUB_RELEASES_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("检查更新失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("检查更新失败: HTTP {}", response.status()));
    }

    let release = response
        .json::<GithubRelease>()
        .await
        .map_err(|error| format!("解析更新信息失败: {error}"))?;

    let has_update = is_newer_version(&release.tag_name, &current_version);

    Ok(UpdateCheckResult {
        current_version,
        has_update,
        latest_version: if has_update {
            Some(release.tag_name.clone())
        } else {
            None
        },
        release_notes: if has_update {
            release.body
        } else {
            None
        },
        release_url: if has_update {
            Some(release.html_url)
        } else {
            None
        },
        published_at: if has_update {
            release.published_at
        } else {
            None
        },
        download_url: if has_update {
            Some(build_lunaris_download_url(&release.tag_name))
        } else {
            None
        },
    })
}

#[tauri::command]
pub async fn list_changelog_releases() -> Result<Vec<ChangelogReleaseSummary>, String> {
    let releases = fetch_github_release_list().await?;
    Ok(releases
        .into_iter()
        .filter(|release| is_public_release(release))
        .map(|release| ChangelogReleaseSummary {
            tag_name: release.tag_name,
            published_at: release.published_at,
            html_url: release.html_url,
        })
        .collect())
}

#[tauri::command]
pub async fn get_changelog_release(tag: String) -> Result<ChangelogReleaseDetail, String> {
    let release = fetch_github_release_by_tag(&tag).await?;
    if !is_public_release(&release) {
        return Err("该版本不可用".to_string());
    }

    Ok(ChangelogReleaseDetail {
        tag_name: release.tag_name,
        published_at: release.published_at,
        html_url: release.html_url,
        body: release.body,
    })
}

#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    version: String,
) -> Result<DownloadUpdateResult, String> {
    let download_url = build_lunaris_download_url(&version);
    let client = http_client()?;

    emit_progress(&app, "downloading", 0, None);

    let response = client
        .get(&download_url)
        .send()
        .await
        .map_err(|error| format!("下载更新失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "下载更新失败: HTTP {}（文件可能尚未就绪，请稍后重试或使用 GitHub 下载）",
            response.status()
        ));
    }

    let expected_sha256 = response
        .headers()
        .get("x-checksum-sha256")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_lowercase());

    let total_bytes = response.content_length();

    let temp_dir = std::env::temp_dir();
    let file_name = format!(
        "cs-match-helper-update-{}.exe",
        uuid::Uuid::new_v4()
    );
    let file_path = temp_dir.join(file_name);

    let mut hasher = Sha256::new();
    let mut downloaded_bytes: u64 = 0;
    let mut file = File::create(&file_path).map_err(|error| format!("创建临时文件失败: {error}"))?;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("下载数据流中断: {error}"))?;
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|error| format!("写入临时文件失败: {error}"))?;
        downloaded_bytes += chunk.len() as u64;
        emit_progress(&app, "downloading", downloaded_bytes, total_bytes);
    }

    file.flush()
        .map_err(|error| format!("保存临时文件失败: {error}"))?;
    drop(file);

    let computed_sha256 = hex::encode(hasher.finalize());

    emit_progress(&app, "verifying", downloaded_bytes, total_bytes);

    if let Some(expected) = expected_sha256 {
        if expected != computed_sha256 {
            let _ = std::fs::remove_file(&file_path);
            return Err("文件校验失败：SHA-256 不匹配".to_string());
        }
    }

    emit_progress(&app, "complete", downloaded_bytes, total_bytes);

    Ok(DownloadUpdateResult {
        file_path: file_path.to_string_lossy().into_owned(),
        sha256: computed_sha256,
        size_bytes: downloaded_bytes,
    })
}

#[tauri::command]
pub async fn apply_update_and_restart(
    app: AppHandle,
    new_exe_path: String,
) -> Result<(), String> {
    let new_exe = PathBuf::from(&new_exe_path);
    if !new_exe.is_file() {
        return Err("更新文件不存在，请重新下载".to_string());
    }

    let current_exe = std::env::current_exe().map_err(|error| format!("定位当前程序失败: {error}"))?;
    let pid = std::process::id();

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        // Break away from parent job so the helper survives app.exit().
        // Do NOT combine DETACHED_PROCESS with CREATE_NO_WINDOW for console helpers
        // (that combo can make PowerShell/cmd exit before doing any work).
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        append_update_log(&format!(
            "Apply update started; pid={pid}; target={}",
            current_exe.display()
        ));

        if let Err(error) = replace_executable_in_place(&current_exe, &new_exe) {
            append_update_log(&format!("Replace failed: {error}"));
            write_update_failure_marker();
            return Err(error);
        }
        append_update_log("Executable replaced in place");

        let work_dir = current_exe
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));
        let old_exe = old_exe_path(&current_exe);
        let script_path = std::env::temp_dir().join(format!(
            "cs-match-helper-restart-{}.cmd",
            uuid::Uuid::new_v4()
        ));
        let log_path = update_log_path();

        // Wait for this process to fully exit before starting the new binary,
        // so WebView2/app data locks are released.
        let script = format!(
            "@echo off\r\n\
setlocal\r\n\
set \"LOG={log}\"\r\n\
echo [%date% %time%] Restart helper started>>\"%LOG%\"\r\n\
echo [%date% %time%] Waiting for PID {pid}>>\"%LOG%\"\r\n\
:wait_loop\r\n\
tasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul\r\n\
if not errorlevel 1 (\r\n\
  ping 127.0.0.1 -n 2 >nul\r\n\
  goto wait_loop\r\n\
)\r\n\
echo [%date% %time%] Process exited; starting updated exe>>\"%LOG%\"\r\n\
start \"\" /D \"{work}\" \"{target}\"\r\n\
if errorlevel 1 (\r\n\
  echo [%date% %time%] Failed to start updated exe>>\"%LOG%\"\r\n\
  exit /b 1\r\n\
)\r\n\
ping 127.0.0.1 -n 2 >nul\r\n\
del /f /q \"{old}\" >nul 2>nul\r\n\
del /f /q \"{new}\" >nul 2>nul\r\n\
echo [%date% %time%] Update completed successfully>>\"%LOG%\"\r\n\
del /f /q \"%~f0\" >nul 2>nul\r\n\
",
            log = log_path.to_string_lossy().replace('"', ""),
            pid = pid,
            work = work_dir.to_string_lossy().replace('"', ""),
            target = current_exe.to_string_lossy().replace('"', ""),
            old = old_exe.to_string_lossy().replace('"', ""),
            new = new_exe.to_string_lossy().replace('"', ""),
        );

        std::fs::write(&script_path, script)
            .map_err(|error| format!("创建重启脚本失败: {error}"))?;

        let spawn_flags_primary =
            CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW;
        let spawn_flags_fallback = CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW;

        let spawn_helper = |flags: u32| {
            std::process::Command::new("cmd")
                .args(["/d", "/c"])
                .arg(&script_path)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(flags)
                .spawn()
        };

        if let Err(primary_error) = spawn_helper(spawn_flags_primary) {
            append_update_log(&format!(
                "Restart helper with BREAKAWAY failed: {primary_error}; retrying"
            ));
            if let Err(error) = spawn_helper(spawn_flags_fallback) {
                append_update_log(&format!("Restart helper failed: {error}; rolling back"));
                rollback_replaced_executable(&current_exe, &old_exe);
                write_update_failure_marker();
                let _ = std::fs::remove_file(&script_path);
                return Err(format!("启动重启脚本失败: {error}"));
            }
        }

        append_update_log(&format!(
            "Restart helper spawned: {}",
            script_path.display()
        ));
        clear_update_failure_marker();
        crate::shutdown_app(&app);
        app.exit(0);
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = (app, current_exe, pid);
        Err("自动更新仅支持 Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_lunaris_url_without_v_prefix() {
        assert_eq!(
            build_lunaris_download_url("v2.1.0"),
            "https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download&v=2.1.0"
        );
    }

    #[test]
    fn compares_semver_parts() {
        assert!(is_newer_version("2.1.0", "2.0.0"));
        assert!(!is_newer_version("2.0.0", "2.0.0"));
    }

    #[test]
    fn normalizes_github_tag() {
        assert_eq!(normalize_github_tag("3.0.0"), "v3.0.0");
        assert_eq!(normalize_github_tag("v2.1.0"), "v2.1.0");
    }

    #[test]
    fn builds_old_exe_path() {
        let current = PathBuf::from(r"C:\Apps\cs-match-helper.exe");
        assert_eq!(
            old_exe_path(&current),
            PathBuf::from(r"C:\Apps\cs-match-helper.exe.old")
        );
    }

    #[test]
    fn replace_executable_swaps_files_and_keeps_backup() {
        let temp = std::env::temp_dir().join(format!(
            "cs-match-helper-update-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp).expect("create temp dir");

        let current = temp.join("cs-match-helper.exe");
        let new_exe = temp.join("cs-match-helper-update.exe");
        std::fs::write(&current, b"old-binary").expect("write current");
        std::fs::write(&new_exe, b"new-binary-v2").expect("write new");

        replace_executable_in_place(&current, &new_exe).expect("replace should succeed");
        assert_eq!(
            std::fs::read(&current).expect("read replaced"),
            b"new-binary-v2"
        );
        assert_eq!(
            std::fs::read(old_exe_path(&current)).expect("read backup"),
            b"old-binary"
        );

        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn replace_executable_fails_when_new_exe_missing() {
        let temp = std::env::temp_dir().join(format!(
            "cs-match-helper-update-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp).expect("create temp dir");

        let current = temp.join("cs-match-helper.exe");
        let missing = temp.join("missing.exe");
        std::fs::write(&current, b"old-binary").expect("write current");

        let result = replace_executable_in_place(&current, &missing);
        assert!(result.is_err());
        assert_eq!(
            std::fs::read(&current).expect("read current"),
            b"old-binary"
        );

        let _ = std::fs::remove_dir_all(&temp);
    }
}
