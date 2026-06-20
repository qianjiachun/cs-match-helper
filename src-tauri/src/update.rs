use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/qianjiachun/cs-match-helper/releases/latest";

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

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
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
        let script_path = std::env::temp_dir().join(format!(
            "cs-match-helper-update-{}.ps1",
            uuid::Uuid::new_v4()
        ));

        let script = format!(
            r#"$ErrorActionPreference = 'Stop'
$targetExe = '{target}'
$newExe = '{new_exe}'
$pidToWait = {pid}
while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) {{
    Start-Sleep -Milliseconds 400
}}
Copy-Item -LiteralPath $newExe -Destination $targetExe -Force
Start-Process -FilePath $targetExe
Remove-Item -LiteralPath $newExe -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath '{script}' -Force -ErrorAction SilentlyContinue
"#,
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
}
