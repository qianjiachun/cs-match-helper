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
const GITHUB_REPO: &str = "qianjiachun/cs-match-helper";

const LUNARIS_USERNAME: &str = "qianjiachun";
const LUNARIS_PROJECT: &str = "cs-match-helper";
const LUNARIS_FILE_NAME: &str = "cs-match-helper.exe";
const LUNARIS_LATEST_JSON_URL: &str =
    "https://cdn.lunaris.win/qianjiachun/cs-match-helper/latest.json?download";
const UPDATE_CHECK_TIMEOUT_SECS: u64 = 8;
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

/// Escape a path for use inside a PowerShell single-quoted string.
fn powershell_single_quoted(path: &Path) -> String {
    path.to_string_lossy().replace('\'', "''")
}

#[cfg(windows)]
fn write_utf8_bom_text_file(path: &Path, content: &str) -> Result<(), String> {
    let mut file = std::fs::File::create(path).map_err(|e| format!("写入文件失败: {e}"))?;
    file.write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|e| format!("写入文件失败: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("写入文件失败: {e}"))?;
    Ok(())
}

#[cfg(windows)]
fn powershell_system_exe() -> PathBuf {
    std::env::var("SystemRoot")
        .map(|root| {
            PathBuf::from(root)
                .join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        })
        .unwrap_or_else(|_| {
            PathBuf::from(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
        })
}

/// Build the PowerShell restart helper script content.
/// Paths must already be escaped for PowerShell single-quoted strings.
fn build_restart_helper_script(
    pid: u32,
    log_literal: &str,
    marker_literal: &str,
    work_literal: &str,
    target_literal: &str,
    old_literal: &str,
    new_literal: &str,
) -> String {
    format!(
        r#"$ErrorActionPreference = 'Continue'
$logPath = '{log_literal}'
$markerPath = '{marker_literal}'
$workDir = '{work_literal}'
$targetExe = '{target_literal}'
$oldExe = '{old_literal}'
$newExe = '{new_literal}'
$pidToWait = {pid}

function Write-UpdateLog([string]$Message) {{
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}}

function Write-FailureMarker {{
  Set-Content -LiteralPath $markerPath -Value '1' -Encoding UTF8
}}

Write-UpdateLog "Restart helper started; waiting for PID $pidToWait"
while ($true) {{
  $proc = Get-Process -Id $pidToWait -ErrorAction SilentlyContinue
  if ($null -eq $proc) {{ break }}
  Start-Sleep -Milliseconds 500
}}

Write-UpdateLog "Process exited; starting updated exe"
try {{
  Start-Process -FilePath $targetExe -WorkingDirectory $workDir | Out-Null
}} catch {{
  Write-UpdateLog ("Failed to start updated exe: " + $_.Exception.Message)
  Write-FailureMarker
  exit 1
}}

Start-Sleep -Milliseconds 800
if (Test-Path -LiteralPath $oldExe) {{
  Remove-Item -LiteralPath $oldExe -Force -ErrorAction SilentlyContinue
}}
if (Test-Path -LiteralPath $newExe) {{
  Remove-Item -LiteralPath $newExe -Force -ErrorAction SilentlyContinue
}}
Write-UpdateLog "Update completed successfully"
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
exit 0
"#,
        log_literal = log_literal,
        marker_literal = marker_literal,
        work_literal = work_literal,
        target_literal = target_literal,
        old_literal = old_literal,
        new_literal = new_literal,
        pid = pid,
    )
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CdnReleaseEntry {
    tag: Option<String>,
    tag_name: Option<String>,
    published_at: Option<String>,
    body: Option<String>,
    html_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CdnLatestManifest {
    version: Option<String>,
    published_at: Option<String>,
    sha256: Option<String>,
    release_notes: Option<String>,
    release_url: Option<String>,
    releases: Option<Vec<CdnReleaseEntry>>,
}

#[derive(Debug, Clone)]
struct NormalizedRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    #[allow(dead_code)]
    sha256: Option<String>,
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

fn version_cmp(left: &str, right: &str) -> std::cmp::Ordering {
    if is_newer_version(left, right) {
        std::cmp::Ordering::Greater
    } else if is_newer_version(right, left) {
        std::cmp::Ordering::Less
    } else {
        std::cmp::Ordering::Equal
    }
}

fn notes_len(body: &Option<String>) -> usize {
    body.as_ref().map(|value| value.trim().len()).unwrap_or(0)
}

fn github_release_url(tag: &str) -> String {
    format!(
        "https://github.com/{GITHUB_REPO}/releases/tag/{}",
        normalize_github_tag(tag)
    )
}

fn github_release_to_normalized(release: GithubRelease) -> NormalizedRelease {
    NormalizedRelease {
        tag_name: release.tag_name,
        body: release.body,
        html_url: release.html_url,
        published_at: release.published_at,
        sha256: None,
    }
}

fn manifest_to_normalized(manifest: &CdnLatestManifest) -> Result<NormalizedRelease, String> {
    let version = manifest
        .version
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "更新清单缺少版本号".to_string())?;
    let tag_name = normalize_github_tag(version);
    let matching = manifest.releases.as_ref().and_then(|releases| {
        releases.iter().find(|entry| {
            entry
                .tag
                .as_deref()
                .or(entry.tag_name.as_deref())
                .map(|tag| normalize_github_tag(tag) == tag_name)
                .unwrap_or(false)
        })
    });
    let body = manifest
        .release_notes
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            matching
                .and_then(|entry| entry.body.clone())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        });
    Ok(NormalizedRelease {
        html_url: manifest
            .release_url
            .clone()
            .or_else(|| matching.and_then(|entry| entry.html_url.clone()))
            .unwrap_or_else(|| github_release_url(&tag_name)),
        published_at: manifest
            .published_at
            .clone()
            .or_else(|| matching.and_then(|entry| entry.published_at.clone())),
        sha256: manifest
            .sha256
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase()),
        tag_name,
        body,
    })
}

fn pick_better_release(
    github: Option<NormalizedRelease>,
    cdn: Option<NormalizedRelease>,
) -> Result<NormalizedRelease, String> {
    match (github, cdn) {
        (Some(github_release), Some(cdn_release)) => {
            let cmp = version_cmp(&github_release.tag_name, &cdn_release.tag_name);
            Ok(match cmp {
                std::cmp::Ordering::Greater => github_release,
                std::cmp::Ordering::Less => cdn_release,
                std::cmp::Ordering::Equal => {
                    if notes_len(&cdn_release.body) > notes_len(&github_release.body) {
                        cdn_release
                    } else {
                        github_release
                    }
                }
            })
        }
        (Some(github_release), None) => Ok(github_release),
        (None, Some(cdn_release)) => Ok(cdn_release),
        (None, None) => Err("检查更新失败：GitHub 与更新通道均不可用".to_string()),
    }
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

fn probe_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("cs-match-helper")
        .timeout(std::time::Duration::from_secs(UPDATE_CHECK_TIMEOUT_SECS))
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

async fn fetch_github_latest_release() -> Result<NormalizedRelease, String> {
    let client = probe_client()?;
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
    if !is_public_release(&release) {
        return Err("最新 GitHub 发布不可用".to_string());
    }
    Ok(github_release_to_normalized(release))
}

async fn fetch_cdn_latest_manifest() -> Result<CdnLatestManifest, String> {
    let client = probe_client()?;
    let response = client
        .get(LUNARIS_LATEST_JSON_URL)
        .send()
        .await
        .map_err(|error| format!("读取更新通道失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("读取更新通道失败: HTTP {}", response.status()));
    }

    response
        .json::<CdnLatestManifest>()
        .await
        .map_err(|error| format!("解析更新通道失败: {error}"))
}

async fn fetch_github_release_list() -> Result<Vec<GithubRelease>, String> {
    let client = probe_client()?;
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

    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{normalized}");
    let client = probe_client()?;
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

fn changelog_from_github(release: &GithubRelease) -> ChangelogReleaseSummary {
    ChangelogReleaseSummary {
        tag_name: release.tag_name.clone(),
        published_at: release.published_at.clone(),
        html_url: release.html_url.clone(),
    }
}

fn changelog_from_cdn_entry(entry: &CdnReleaseEntry) -> Option<ChangelogReleaseSummary> {
    let tag = entry
        .tag
        .as_deref()
        .or(entry.tag_name.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    Some(ChangelogReleaseSummary {
        html_url: entry
            .html_url
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| github_release_url(tag)),
        published_at: entry.published_at.clone(),
        tag_name: normalize_github_tag(tag),
    })
}

fn merge_changelog_lists(
    github: Result<Vec<GithubRelease>, String>,
    cdn: Result<CdnLatestManifest, String>,
) -> Result<Vec<ChangelogReleaseSummary>, String> {
    let github_releases = github.ok();
    let cdn_manifest = cdn.ok();
    if github_releases.is_none() && cdn_manifest.is_none() {
        return Err("无法加载更新日志".to_string());
    }

    let mut by_tag: std::collections::BTreeMap<String, ChangelogReleaseSummary> =
        std::collections::BTreeMap::new();

    if let Some(manifest) = cdn_manifest {
        if let Some(releases) = manifest.releases {
            for entry in releases {
                if let Some(summary) = changelog_from_cdn_entry(&entry) {
                    by_tag.insert(normalize_github_tag(&summary.tag_name), summary);
                }
            }
        }
        if let Some(version) = manifest.version.as_deref() {
            let tag = normalize_github_tag(version);
            by_tag.entry(tag.clone()).or_insert(ChangelogReleaseSummary {
                html_url: manifest
                    .release_url
                    .unwrap_or_else(|| github_release_url(&tag)),
                published_at: manifest.published_at,
                tag_name: tag,
            });
        }
    }

    if let Some(releases) = github_releases {
        for release in releases.into_iter().filter(is_public_release) {
            by_tag.insert(
                normalize_github_tag(&release.tag_name),
                changelog_from_github(&release),
            );
        }
    }

    let mut releases: Vec<ChangelogReleaseSummary> = by_tag.into_values().collect();
    releases.sort_by(|left, right| version_cmp(&right.tag_name, &left.tag_name));
    Ok(releases)
}

fn find_cdn_release_detail(manifest: &CdnLatestManifest, tag: &str) -> Option<ChangelogReleaseDetail> {
    let wanted = normalize_github_tag(tag);
    if let Some(releases) = &manifest.releases {
        for entry in releases {
            let Some(entry_tag) = entry.tag.as_deref().or(entry.tag_name.as_deref()) else {
                continue;
            };
            if normalize_github_tag(entry_tag) != wanted {
                continue;
            }
            return Some(ChangelogReleaseDetail {
                tag_name: wanted,
                published_at: entry
                    .published_at
                    .clone()
                    .or_else(|| manifest.published_at.clone()),
                html_url: entry
                    .html_url
                    .clone()
                    .or_else(|| manifest.release_url.clone())
                    .unwrap_or_else(|| github_release_url(tag)),
                body: entry.body.clone().or_else(|| manifest.release_notes.clone()),
            });
        }
    }
    if manifest
        .version
        .as_deref()
        .map(normalize_github_tag)
        .is_some_and(|version| version == wanted)
    {
        return Some(ChangelogReleaseDetail {
            tag_name: wanted,
            published_at: manifest.published_at.clone(),
            html_url: manifest
                .release_url
                .clone()
                .unwrap_or_else(|| github_release_url(tag)),
            body: manifest.release_notes.clone(),
        });
    }
    None
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn check_for_update() -> Result<UpdateCheckResult, String> {
    let current_version = get_app_version();
    let (github, cdn) = tokio::join!(fetch_github_latest_release(), fetch_cdn_latest_manifest());
    if github.is_err() && cdn.is_err() {
        return Err(format!(
            "{}；{}",
            github.as_ref().err().unwrap(),
            cdn.as_ref().err().unwrap()
        ));
    }
    let github_release = github.ok();
    let cdn_release = cdn
        .ok()
        .and_then(|manifest| manifest_to_normalized(&manifest).ok());
    let release = pick_better_release(github_release, cdn_release)?;
    let has_update = is_newer_version(&release.tag_name, &current_version);

    Ok(UpdateCheckResult {
        current_version,
        has_update,
        latest_version: if has_update {
            Some(release.tag_name.clone())
        } else {
            None
        },
        release_notes: if has_update { release.body } else { None },
        release_url: if has_update {
            Some(release.html_url)
        } else {
            None
        },
        published_at: if has_update { release.published_at } else { None },
        download_url: if has_update {
            Some(build_lunaris_download_url(&release.tag_name))
        } else {
            None
        },
    })
}

#[tauri::command]
pub async fn list_changelog_releases() -> Result<Vec<ChangelogReleaseSummary>, String> {
    let (github, cdn) = tokio::join!(fetch_github_release_list(), fetch_cdn_latest_manifest());
    merge_changelog_lists(github, cdn)
}

#[tauri::command]
pub async fn get_changelog_release(tag: String) -> Result<ChangelogReleaseDetail, String> {
    let (github, cdn) = tokio::join!(fetch_github_release_by_tag(&tag), fetch_cdn_latest_manifest());
    if let Ok(release) = github {
        if is_public_release(&release) {
            return Ok(ChangelogReleaseDetail {
                tag_name: release.tag_name,
                published_at: release.published_at,
                html_url: release.html_url,
                body: release.body,
            });
        }
    }
    if let Ok(manifest) = cdn {
        if let Some(detail) = find_cdn_release_detail(&manifest, &tag) {
            return Ok(detail);
        }
    }
    Err(format!("未找到版本 {} 的发布说明", normalize_github_tag(&tag)))
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
    let manifest_sha256 = fetch_cdn_latest_manifest()
        .await
        .ok()
        .and_then(|manifest| {
            let remote_version = manifest.version.as_deref().unwrap_or_default();
            if normalize_version_tag(remote_version) == normalize_version_tag(&version) {
                manifest
                    .sha256
                    .map(|value| value.trim().to_ascii_lowercase())
                    .filter(|value| !value.is_empty())
            } else {
                None
            }
        });

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

    if let Some(expected) = expected_sha256.or(manifest_sha256) {
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
            "cs-match-helper-restart-{}.ps1",
            uuid::Uuid::new_v4()
        ));
        let log_path = update_log_path();
        let marker_path = update_failure_marker_path();

        // Wait for this process to fully exit before starting the new binary,
        // so WebView2/app data locks are released.
        // Use UTF-8 BOM PowerShell (not .cmd) so Chinese paths decode correctly.
        let script = build_restart_helper_script(
            pid,
            &powershell_single_quoted(&log_path),
            &powershell_single_quoted(&marker_path),
            &powershell_single_quoted(&work_dir),
            &powershell_single_quoted(&current_exe),
            &powershell_single_quoted(&old_exe),
            &powershell_single_quoted(&new_exe),
        );

        write_utf8_bom_text_file(&script_path, &script)
            .map_err(|error| format!("创建重启脚本失败: {error}"))?;

        let powershell = powershell_system_exe();
        if !powershell.is_file() {
            let _ = std::fs::remove_file(&script_path);
            rollback_replaced_executable(&current_exe, &old_exe);
            write_update_failure_marker();
            return Err(format!("未找到系统 PowerShell: {}", powershell.display()));
        }

        let spawn_flags_primary =
            CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW;
        let spawn_flags_fallback = CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW;

        let spawn_helper = |flags: u32| {
            std::process::Command::new(&powershell)
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-WindowStyle",
                    "Hidden",
                    "-File",
                ])
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
    fn parses_cdn_manifest_camel_case() {
        let manifest: CdnLatestManifest = serde_json::from_str(
            r#"{
                "schemaVersion": 1,
                "version": "3.4.1",
                "publishedAt": "2026-08-19T02:00:00.000Z",
                "sha256": "abc",
                "releaseNotes": "修复自动更新",
                "releaseUrl": "https://github.com/qianjiachun/cs-match-helper/releases/tag/v3.4.1",
                "releases": [
                    {
                        "tag": "v3.4.1",
                        "publishedAt": "2026-08-19T02:00:00.000Z",
                        "body": "修复自动更新",
                        "htmlUrl": "https://github.com/qianjiachun/cs-match-helper/releases/tag/v3.4.1"
                    }
                ]
            }"#,
        )
        .expect("parse manifest");
        let release = manifest_to_normalized(&manifest).expect("normalize");
        assert_eq!(release.tag_name, "v3.4.1");
        assert_eq!(release.body.as_deref(), Some("修复自动更新"));
        assert_eq!(release.sha256.as_deref(), Some("abc"));
    }

    #[test]
    fn pick_better_release_prefers_newer_version() {
        let github = NormalizedRelease {
            tag_name: "v3.4.0".into(),
            body: Some("github".into()),
            html_url: "https://github.example/v3.4.0".into(),
            published_at: None,
            sha256: None,
        };
        let cdn = NormalizedRelease {
            tag_name: "v3.4.1".into(),
            body: None,
            html_url: "https://cdn.example".into(),
            published_at: None,
            sha256: None,
        };
        let picked = pick_better_release(Some(github), Some(cdn)).expect("pick");
        assert_eq!(picked.tag_name, "v3.4.1");
    }

    #[test]
    fn pick_better_release_same_version_prefers_notes() {
        let github = NormalizedRelease {
            tag_name: "v3.4.1".into(),
            body: None,
            html_url: "https://github.example/v3.4.1".into(),
            published_at: None,
            sha256: None,
        };
        let cdn = NormalizedRelease {
            tag_name: "v3.4.1".into(),
            body: Some("cdn notes".into()),
            html_url: "https://cdn.example".into(),
            published_at: None,
            sha256: None,
        };
        let picked = pick_better_release(Some(github), Some(cdn)).expect("pick");
        assert_eq!(picked.body.as_deref(), Some("cdn notes"));
    }

    #[test]
    fn pick_better_release_uses_single_source() {
        let cdn = NormalizedRelease {
            tag_name: "v3.5.0".into(),
            body: Some("only cdn".into()),
            html_url: "https://cdn.example".into(),
            published_at: None,
            sha256: None,
        };
        let picked = pick_better_release(None, Some(cdn)).expect("pick");
        assert_eq!(picked.tag_name, "v3.5.0");
        assert!(pick_better_release(None, None).is_err());
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

    #[test]
    fn powershell_single_quoted_escapes_apostrophe() {
        let path = PathBuf::from(r"C:\User's Apps\cs-match-helper.exe");
        assert_eq!(
            powershell_single_quoted(&path),
            r"C:\User''s Apps\cs-match-helper.exe"
        );
    }

    #[test]
    fn restart_helper_script_preserves_chinese_and_space_paths() {
        let work = PathBuf::from(r"C:\Users\Administrator\Desktop\CS 匹配助手");
        let target = work.join("cs-match-helper.exe");
        let old = old_exe_path(&target);
        let new_exe = PathBuf::from(r"C:\Users\Admin Name\AppData\Local\Temp\update.exe");
        let log = PathBuf::from(r"C:\Users\Admin Name\AppData\Local\Temp\cs-match-helper-update.log");
        let marker =
            PathBuf::from(r"C:\Users\Admin Name\AppData\Local\Temp\cs-match-helper-update-failed.marker");

        let script = build_restart_helper_script(
            12345,
            &powershell_single_quoted(&log),
            &powershell_single_quoted(&marker),
            &powershell_single_quoted(&work),
            &powershell_single_quoted(&target),
            &powershell_single_quoted(&old),
            &powershell_single_quoted(&new_exe),
        );

        assert!(script.contains(r"$workDir = 'C:\Users\Administrator\Desktop\CS 匹配助手'"));
        assert!(script.contains(
            r"$targetExe = 'C:\Users\Administrator\Desktop\CS 匹配助手\cs-match-helper.exe'"
        ));
        assert!(script.contains(r"$newExe = 'C:\Users\Admin Name\AppData\Local\Temp\update.exe'"));
        assert!(script.contains("$pidToWait = 12345"));
        assert!(script.contains("Start-Process -FilePath $targetExe -WorkingDirectory $workDir"));
        assert!(script.contains("Write-FailureMarker"));
    }

    #[test]
    fn restart_helper_script_escapes_single_quotes_in_paths() {
        let work = PathBuf::from(r"C:\O'Brien\CS Match Helper");
        let target = work.join("cs-match-helper.exe");
        let script = build_restart_helper_script(
            1,
            &powershell_single_quoted(Path::new(r"C:\Temp\log.txt")),
            &powershell_single_quoted(Path::new(r"C:\Temp\marker.txt")),
            &powershell_single_quoted(&work),
            &powershell_single_quoted(&target),
            &powershell_single_quoted(&old_exe_path(&target)),
            &powershell_single_quoted(Path::new(r"C:\Temp\new.exe")),
        );

        assert!(script.contains(r"$workDir = 'C:\O''Brien\CS Match Helper'"));
        assert!(script.contains(
            r"$targetExe = 'C:\O''Brien\CS Match Helper\cs-match-helper.exe'"
        ));
    }

    #[cfg(windows)]
    #[test]
    fn write_utf8_bom_text_file_writes_bom_prefix() {
        let temp = std::env::temp_dir().join(format!(
            "cs-match-helper-bom-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp).expect("create temp dir");
        let path = temp.join("restart.ps1");
        write_utf8_bom_text_file(&path, "Write-Host 'CS 匹配助手'").expect("write bom file");

        let bytes = std::fs::read(&path).expect("read bom file");
        assert_eq!(&bytes[..3], &[0xEF, 0xBB, 0xBF]);
        let body = String::from_utf8(bytes[3..].to_vec()).expect("utf8 body");
        assert!(body.contains("CS 匹配助手"));

        let _ = std::fs::remove_dir_all(&temp);
    }
}
