use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/qianjiachun/cs-match-helper/releases/latest";
const GITHUB_RELEASES_LIST_URL: &str =
    "https://api.github.com/repos/qianjiachun/cs-match-helper/releases?per_page=50";

const LUNARIS_USERNAME: &str = "qianjiachun";
const LUNARIS_PROJECT: &str = "cs-match-helper";
const LUNARIS_FILE_NAME: &str = "cs-match-helper.exe";

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

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let script_path = std::env::temp_dir().join(format!(
            "cs-match-helper-update-{}.ps1",
            uuid::Uuid::new_v4()
        ));

        let log_path = std::env::temp_dir().join("cs-match-helper-update.log");

        let script = format!(
            r#"$ErrorActionPreference = 'Stop'
$logPath = '{log}'
function Write-Log([string]$Message) {{
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}}

try {{
    Write-Log 'Update started'
    $targetExe = '{target}'
    $newExe = '{new_exe}'
    $pidToWait = {pid}
    $scriptPath = '{script}'
    $oldExe = "$targetExe.old"

    Write-Log "Target: $targetExe"
    Write-Log "New: $newExe"
    Write-Log "Waiting for PID $pidToWait"

    $waitedMs = 0
    while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) {{
        Start-Sleep -Milliseconds 400
        $waitedMs += 400
        if ($waitedMs -gt 120000) {{
            throw "Timed out waiting for process $pidToWait to exit"
        }}
    }}
    Write-Log 'Process exited'

    if (Test-Path -LiteralPath $oldExe) {{
        Remove-Item -LiteralPath $oldExe -Force -ErrorAction SilentlyContinue
    }}

    $maxRetries = 60
    $retryDelayMs = 500
    $copied = $false

    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {{
        try {{
            if (Test-Path -LiteralPath $targetExe) {{
                Move-Item -LiteralPath $targetExe -Destination $oldExe -Force
                Write-Log 'Moved old exe to .old'
            }}
            Copy-Item -LiteralPath $newExe -Destination $targetExe -Force
            Write-Log "Copied new exe on attempt $attempt"
            $copied = $true
            break
        }} catch {{
            Write-Log "Copy attempt $attempt failed: $($_.Exception.Message)"
            if ((Test-Path -LiteralPath $oldExe) -and -not (Test-Path -LiteralPath $targetExe)) {{
                Move-Item -LiteralPath $oldExe -Destination $targetExe -Force -ErrorAction SilentlyContinue
                Write-Log 'Restored old exe after failed copy'
            }}
            Start-Sleep -Milliseconds $retryDelayMs
        }}
    }}

    if (-not $copied) {{
        throw 'Could not replace executable after retries'
    }}

    Start-Process -FilePath $targetExe
    Write-Log 'Started updated executable'

    Remove-Item -LiteralPath $newExe -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $oldExe -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $scriptPath -Force -ErrorAction SilentlyContinue
    Write-Log 'Update completed successfully'
}} catch {{
    Write-Log "Fatal error: $($_.Exception.Message)"
    exit 1
}}
"#,
            log = escape_ps_single_quoted(&log_path.to_string_lossy()),
            target = escape_ps_single_quoted(&current_exe.to_string_lossy()),
            new_exe = escape_ps_single_quoted(&new_exe.to_string_lossy()),
            pid = pid,
            script = escape_ps_single_quoted(&script_path.to_string_lossy()),
        );

        std::fs::write(&script_path, script)
            .map_err(|error| format!("创建更新脚本失败: {error}"))?;

        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(&script_path)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|error| format!("启动更新脚本失败: {error}"))?;

        app.exit(0);
        Ok(())
    }

    #[cfg(not(windows))]
    {
        let _ = (app, current_exe, pid);
        Err("自动更新仅支持 Windows".to_string())
    }
}

#[cfg(windows)]
fn escape_ps_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
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
}
