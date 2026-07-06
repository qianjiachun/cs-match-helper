use crate::gamebar_shortcut::read_game_bar_open_shortcut;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{copy, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};
use zip::read::ZipArchive;

const WIDGET_PACKAGE_NAME: &str = "CSMatchHelper.GameBarWidget";
const WIDGET_DISPLAY_NAME: &str = "CS 匹配助手";
const LEGACY_PACKAGE_NAMES: &[&str] = &["CSMatchHelper.CounterStrafingHudWidget"];
const WIDGET_ZIP_PREFIX: &str = "CSMatchHelperGameBarWidget-";
const LUNARIS_USERNAME: &str = "qianjiachun";
const LUNARIS_WIDGET_PROJECT: &str = "cs-match-helper-widget";
const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/qianjiachun/cs-match-helper/releases/latest";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBarWidgetStatus {
    pub installed: bool,
    pub installed_version: Option<String>,
    pub package_family_name: Option<String>,
    pub loopback_configured: bool,
    pub display_name: String,
    pub game_bar_installed: bool,
    /// 打开 Xbox 游戏栏的快捷键，如 `Win+G`
    pub game_bar_open_shortcut: String,
    /// 是否从注册表读取（`false` 表示使用系统默认 `Win+G`）
    pub game_bar_open_shortcut_from_registry: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBarWidgetUpdateCheck {
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub has_update: bool,
    /// 默认安装源（CDN），与 `cdn_download_url` 相同
    pub download_url: Option<String>,
    pub cdn_download_url: Option<String>,
    pub github_download_url: Option<String>,
    pub sha256: Option<String>,
    pub zip_file_name: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBarWidgetInstallResult {
    pub success: bool,
    pub installed_version: Option<String>,
    pub message: String,
    pub install_log_path: Option<String>,
    pub install_log_excerpt: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBarWidgetProgressEvent {
    pub phase: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<f64>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

struct WidgetReleaseInfo {
    version: String,
    zip_file_name: String,
    github_download_url: String,
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

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("cs-match-helper")
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())
}

fn emit_progress(
    app: &AppHandle,
    phase: &str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    message: Option<&str>,
) {
    let percent = total_bytes.and_then(|total| {
        if total > 0 {
            Some((downloaded_bytes as f64 / total as f64) * 100.0)
        } else {
            None
        }
    });
    let _ = app.emit(
        "gamebar-widget-progress",
        GameBarWidgetProgressEvent {
            phase: phase.to_string(),
            downloaded_bytes,
            total_bytes,
            percent,
            message: message.map(str::to_string),
        },
    );
}

fn run_powershell_with_exit_code(script: &str) -> Result<(i32, String, String), String> {
    let mut command = Command::new("powershell");
    command.args([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command
        .output()
        .map_err(|e| format!("执行 PowerShell 失败: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let code = output.status.code().unwrap_or(-1);
    Ok((code, stdout, stderr))
}

fn run_powershell(script: &str) -> Result<String, String> {
    let (code, stdout, stderr) = run_powershell_with_exit_code(script)?;
    if code != 0 {
        return Err(format!(
            "PowerShell 执行失败: {}{}",
            stderr,
            if stdout.is_empty() {
                String::new()
            } else {
                format!(" | {stdout}")
            }
        ));
    }
    Ok(stdout)
}

#[cfg(windows)]
fn is_game_bar_installed() -> bool {
    let script = r#"$pkg = Get-AppxPackage -Name Microsoft.XboxGamingOverlay -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pkg) { Write-Output 'yes' } else { Write-Output 'no' }"#;
    run_powershell(script)
        .map(|value| value.eq_ignore_ascii_case("yes"))
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn is_game_bar_installed() -> bool {
    false
}

#[cfg(windows)]
fn query_installed_package() -> Option<(String, String)> {
    let names = std::iter::once(WIDGET_PACKAGE_NAME)
        .chain(LEGACY_PACKAGE_NAMES.iter().copied())
        .map(|name| format!("'{name}'"))
        .collect::<Vec<_>>()
        .join(", ");

    let script = format!(
        r#"$names = @({names})
foreach ($name in $names) {{
  $pkg = Get-AppxPackage -Name $name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pkg) {{
    Write-Output ($pkg.Version.ToString() + '|' + $pkg.PackageFamilyName)
    exit 0
  }}
}}
"#
    );

    run_powershell(&script)
        .ok()
        .and_then(|line| {
            let mut parts = line.splitn(2, '|');
            let version = parts.next()?.trim().to_string();
            let family = parts.next()?.trim().to_string();
            if version.is_empty() || family.is_empty() {
                None
            } else {
                Some((version, family))
            }
        })
}

#[cfg(not(windows))]
fn query_installed_package() -> Option<(String, String)> {
    None
}

#[cfg(windows)]
fn is_loopback_configured(family_name: &str) -> bool {
    let escaped = family_name.replace('\'', "''");
    let script = format!(
        r#"$out = CheckNetIsolation LoopbackExempt -s 2>$null
if ($LASTEXITCODE -ne 0) {{ exit 1 }}
if ($out -match '{escaped}') {{ Write-Output 'yes' }} else {{ Write-Output 'no' }}"#
    );
    run_powershell(&script)
        .map(|value| value.eq_ignore_ascii_case("yes"))
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn is_loopback_configured(_family_name: &str) -> bool {
    false
}

/// Widget 安装工作目录：与主程序 exe 同级的 `gamebar-widget-install/`
fn widget_workspace_root() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法获取程序路径: {e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "无法定位程序目录".to_string())?;
    Ok(dir.join("gamebar-widget-install"))
}

fn build_widget_zip_name(version: &str) -> String {
    let tag = version.trim().trim_start_matches('v');
    format!("{WIDGET_ZIP_PREFIX}{tag}.zip")
}

fn parse_widget_version_from_zip_name(zip_file_name: &str) -> Option<String> {
    let trimmed = zip_file_name.trim();
    let without_prefix = trimmed.strip_prefix(WIDGET_ZIP_PREFIX)?;
    let version = without_prefix.strip_suffix(".zip")?;
    if version.is_empty() {
        return None;
    }
    Some(version.to_string())
}

fn build_widget_zip_cdn_url(version: &str, zip_file_name: &str) -> String {
    let tag = version.trim().trim_start_matches('v');
    format!(
        "https://cdn.lunaris.win/{LUNARIS_USERNAME}/{LUNARIS_WIDGET_PROJECT}/{zip_file_name}?download&v={tag}"
    )
}

async fn fetch_widget_release_info(client: &reqwest::Client) -> Result<WidgetReleaseInfo, String> {
    let response = client
        .get(GITHUB_RELEASES_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("获取 Widget 版本信息失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "获取 Widget 版本信息失败: HTTP {}",
            response.status()
        ));
    }

    let release = response
        .json::<GithubRelease>()
        .await
        .map_err(|e| format!("解析 GitHub Release 失败: {e}"))?;

    let asset = release
        .assets
        .iter()
        .find(|asset| {
            asset.name.starts_with(WIDGET_ZIP_PREFIX) && asset.name.ends_with(".zip")
        })
        .ok_or_else(|| "GitHub Release 中未找到 Widget zip 附件".to_string())?;

    let version = parse_widget_version_from_zip_name(&asset.name).ok_or_else(|| {
        format!(
            "无法从 Widget zip 文件名解析版本: {}",
            asset.name
        )
    })?;

    Ok(WidgetReleaseInfo {
        version,
        zip_file_name: asset.name.clone(),
        github_download_url: asset.browser_download_url.clone(),
    })
}

#[tauri::command]
pub async fn get_gamebar_widget_status() -> Result<GameBarWidgetStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let installed = query_installed_package();
        let loopback_configured = installed
            .as_ref()
            .map(|(_, family)| is_loopback_configured(family))
            .unwrap_or(false);

        let shortcut = read_game_bar_open_shortcut();
        Ok(GameBarWidgetStatus {
            installed: installed.is_some(),
            installed_version: installed.as_ref().map(|(version, _)| version.clone()),
            package_family_name: installed.map(|(_, family)| family),
            loopback_configured,
            display_name: WIDGET_DISPLAY_NAME.to_string(),
            game_bar_installed: is_game_bar_installed(),
            game_bar_open_shortcut: shortcut.display,
            game_bar_open_shortcut_from_registry: shortcut.from_registry,
        })
    })
    .await
    .map_err(|e| format!("查询 Widget 状态失败: {e}"))?
}

#[tauri::command]
pub async fn check_gamebar_widget_update() -> Result<GameBarWidgetUpdateCheck, String> {
    let installed_version = query_installed_package().map(|(version, _)| version);
    let client = http_client()?;

    match fetch_widget_release_info(&client).await {
        Ok(release) => {
            let latest_version = release.version.clone();
            let has_update = match installed_version.as_deref() {
                Some(current) => is_newer_version(&latest_version, current),
                None => true,
            };
            let zip_file_name = if release.zip_file_name.is_empty() {
                build_widget_zip_name(&latest_version)
            } else {
                release.zip_file_name
            };
            let cdn_download_url = build_widget_zip_cdn_url(&latest_version, &zip_file_name);
            Ok(GameBarWidgetUpdateCheck {
                installed_version,
                latest_version: Some(latest_version),
                has_update,
                download_url: Some(cdn_download_url.clone()),
                cdn_download_url: Some(cdn_download_url),
                github_download_url: Some(release.github_download_url),
                sha256: None,
                zip_file_name: Some(zip_file_name),
                error: None,
            })
        }
        Err(error) => Ok(GameBarWidgetUpdateCheck {
            installed_version,
            latest_version: None,
            has_update: false,
            download_url: None,
            cdn_download_url: None,
            github_download_url: None,
            sha256: None,
            zip_file_name: None,
            error: Some(error),
        }),
    }
}

async fn download_widget_zip(
    app: &AppHandle,
    download_url: &str,
    dest_path: &Path,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    let client = http_client()?;
    emit_progress(
        app,
        "downloading",
        0,
        None,
        Some(&format!("正在下载 {WIDGET_DISPLAY_NAME} 小组件…")),
    );

    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("下载 Widget 失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("下载 Widget 失败: HTTP {}", response.status()));
    }

    let header_sha = response
        .headers()
        .get("x-checksum-sha256")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_lowercase());

    let total_bytes = response.content_length();
    let mut hasher = Sha256::new();
    let mut downloaded_bytes: u64 = 0;

    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建下载目录失败: {e}"))?;
    }

    let mut file = File::create(dest_path).map_err(|e| format!("创建 zip 文件失败: {e}"))?;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("下载数据流中断: {e}"))?;
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|e| format!("写入 zip 文件失败: {e}"))?;
        downloaded_bytes += chunk.len() as u64;
        emit_progress(app, "downloading", downloaded_bytes, total_bytes, None);
    }
    file.flush().map_err(|e| format!("保存 zip 文件失败: {e}"))?;
    drop(file);

    let computed = hex::encode(hasher.finalize());
    emit_progress(
        app,
        "verifying",
        downloaded_bytes,
        total_bytes,
        Some("正在校验安装包…"),
    );

    if let Some(expected) = expected_sha256.filter(|value| !value.is_empty()) {
        if expected.to_lowercase() != computed {
            let _ = std::fs::remove_file(dest_path);
            return Err("Widget 安装包校验失败：SHA-256 不匹配".to_string());
        }
    } else if let Some(expected) = header_sha {
        if expected != computed {
            let _ = std::fs::remove_file(dest_path);
            return Err("Widget 安装包校验失败：SHA-256 不匹配".to_string());
        }
    }

    Ok(())
}

async fn download_widget_zip_with_fallback(
    app: &AppHandle,
    primary_url: &str,
    fallback_url: Option<&str>,
    dest_path: &Path,
    expected_sha256: Option<&str>,
) -> Result<(), String> {
    match download_widget_zip(app, primary_url, dest_path, expected_sha256).await {
        Ok(()) => Ok(()),
        Err(primary_error) => {
            let Some(fallback) = fallback_url.filter(|url| !url.is_empty() && *url != primary_url)
            else {
                return Err(primary_error);
            };
            emit_progress(
                app,
                "downloading",
                0,
                None,
                Some("CDN 下载失败，正在尝试 GitHub Release…"),
            );
            if dest_path.exists() {
                let _ = std::fs::remove_file(dest_path);
            }
            download_widget_zip(app, fallback, dest_path, expected_sha256)
                .await
                .map_err(|fallback_error| {
                    format!(
                        "CDN 下载失败: {primary_error}；GitHub 下载失败: {fallback_error}"
                    )
                })
        }
    }
}

fn extract_widget_zip(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    if dest_dir.exists() {
        std::fs::remove_dir_all(dest_dir).map_err(|e| format!("清理旧解压目录失败: {e}"))?;
    }
    std::fs::create_dir_all(dest_dir).map_err(|e| format!("创建解压目录失败: {e}"))?;

    let file = File::open(zip_path).map_err(|e| format!("无法打开安装包: {e}"))?;
    let mut archive = ZipArchive::new(BufReader::new(file))
        .map_err(|e| format!("无法读取 zip 安装包（文件可能已损坏）: {e}"))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("读取 zip 条目失败: {e}"))?;
        let entry_path = entry
            .enclosed_name()
            .ok_or_else(|| "zip 包含不安全路径，已拒绝解压".to_string())?;
        let out_path = dest_dir.join(entry_path);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("创建目录失败: {e}"))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }

        let mut out_file = File::create(&out_path).map_err(|e| format!("写入文件失败: {e}"))?;
        copy(&mut entry, &mut out_file).map_err(|e| format!("解压文件失败: {e}"))?;
    }

    if !dest_dir.join("install.ps1").is_file() {
        return Err(
            "解压完成，但未找到 install.ps1。请确认安装包完整，或改选已解压的安装文件夹。"
                .to_string(),
        );
    }

    Ok(())
}

#[cfg(windows)]
struct ElevatedInstallOutcome {
    exit_code: u32,
    message: String,
    log_path: PathBuf,
    log_excerpt: String,
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
struct InstallResultJson {
    success: bool,
    exit_code: u32,
    message: String,
    #[serde(default)]
    stage: Option<String>,
}

#[cfg(windows)]
#[derive(Debug, Serialize)]
struct InstallAttemptJson {
    stage: String,
    install_script: String,
    wrapper_script: String,
}

#[cfg(windows)]
struct EndUserInstallArtifacts {
    fail_message: Option<String>,
    log_excerpt: Option<String>,
    #[allow(dead_code)]
    ok_version: Option<String>,
}

#[cfg(windows)]
fn read_log_excerpt(path: &Path) -> String {
    let content = std::fs::read_to_string(path).unwrap_or_default();
    const MAX_CHARS: usize = 2000;
    if content.chars().count() <= MAX_CHARS {
        return content;
    }
    content
        .chars()
        .rev()
        .take(MAX_CHARS)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

#[cfg(windows)]
fn end_user_widget_marker_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| dir.join("CSMatchHelper").join("gamebar-widget"))
}

#[cfg(windows)]
fn read_end_user_install_artifacts() -> EndUserInstallArtifacts {
    let Some(marker_dir) = end_user_widget_marker_dir() else {
        return EndUserInstallArtifacts {
            fail_message: None,
            log_excerpt: None,
            ok_version: None,
        };
    };

    let fail_path = marker_dir.join("install.fail");
    let log_path = marker_dir.join("install.log");
    let ok_path = marker_dir.join("install.ok");

    let fail_message = std::fs::read_to_string(&fail_path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let log_excerpt = if log_path.is_file() {
        Some(read_log_excerpt(&log_path))
    } else {
        None
    };

    let ok_version = std::fs::read_to_string(&ok_path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    EndUserInstallArtifacts {
        fail_message,
        log_excerpt,
        ok_version,
    }
}

#[cfg(windows)]
fn merge_install_log_excerpts(wrapper_log: &str, end_user: &EndUserInstallArtifacts) -> String {
    let wrapper_trimmed = wrapper_log.trim();
    let end_user_trimmed = end_user.log_excerpt.as_deref().unwrap_or("").trim();

    match (wrapper_trimmed.is_empty(), end_user_trimmed.is_empty()) {
        (true, true) => String::new(),
        (false, true) => wrapper_trimmed.to_string(),
        (true, false) => format!("--- 安装脚本日志 ---\n{end_user_trimmed}"),
        (false, false) => format!(
            "--- 安装包装日志 ---\n{wrapper_trimmed}\n\n--- 安装脚本日志 ---\n{end_user_trimmed}"
        ),
    }
}

#[cfg(windows)]
fn format_install_failure(outcome: &ElevatedInstallOutcome) -> String {
    let end_user = read_end_user_install_artifacts();
    let base = if let Some(fail_message) = end_user.fail_message.as_ref().filter(|v| !v.is_empty()) {
        fail_message.clone()
    } else if outcome.message.trim().is_empty() {
        format!(
            "安装失败（{}）",
            describe_process_exit_code(outcome.exit_code)
        )
    } else {
        outcome.message.clone()
    };

    let merged_log = merge_install_log_excerpts(&outcome.log_excerpt, &end_user);
    if merged_log.trim().is_empty() {
        base
    } else {
        format!("{base}\n\n--- 安装日志 ---\n{}", merged_log.trim())
    }
}

#[cfg(windows)]
fn write_utf8_bom_text_file(path: &Path, content: &str) -> Result<(), String> {
    use std::io::Write;
    let mut file = std::fs::File::create(path).map_err(|e| format!("写入文件失败: {e}"))?;
    file.write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|e| format!("写入文件失败: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("写入文件失败: {e}"))?;
    Ok(())
}

#[cfg(windows)]
fn write_install_wrapper(
    workspace: &Path,
    install_script: &Path,
    log_path: &Path,
    result_path: &Path,
    started_path: &Path,
) -> Result<PathBuf, String> {
    let wrapper_path = workspace.join("run-install-wrapper.ps1");
    let install_literal = install_script.to_string_lossy().replace('\'', "''");
    let log_literal = log_path.to_string_lossy().replace('\'', "''");
    let result_literal = result_path.to_string_lossy().replace('\'', "''");
    let started_literal = started_path.to_string_lossy().replace('\'', "''");
    let content = format!(
        r#"$ErrorActionPreference = 'Stop'
$logPath = '{log_literal}'
$resultPath = '{result_literal}'
$startedPath = '{started_literal}'
$installScript = '{install_literal}'
try {{ $Host.UI.RawUI.WindowTitle = 'CS 匹配助手 - 小组件安装' }} catch {{ }}
"started $(Get-Date -Format o)" | Set-Content -Path $startedPath -Encoding UTF8
"=== Widget install started $(Get-Date -Format o) ===" | Set-Content -Path $logPath -Encoding UTF8
try {{
  if (Test-Path $resultPath) {{ Remove-Item $resultPath -Force }}
  @{{
    success = $false
    exitCode = 0
    stage = 'run-install-script'
    message = 'Running install.ps1'
  }} | ConvertTo-Json | Set-Content -Path $resultPath -Encoding UTF8
  & $installScript
  $exitCode = if ($null -ne $LASTEXITCODE) {{ [int]$LASTEXITCODE }} else {{ if ($?) {{ 0 }} else {{ 1 }} }}
  if ($exitCode -ne 0) {{ throw "install.ps1 exited with code $exitCode" }}
  @{{
    success = $true
    exitCode = 0
    stage = 'complete'
    message = 'Installation complete.'
  }} | ConvertTo-Json | Set-Content -Path $resultPath -Encoding UTF8
  exit 0
}} catch {{
  $msg = $_.Exception.Message
  $msg | Out-File -FilePath $logPath -Append -Encoding UTF8
  @{{
    success = $false
    exitCode = 1
    stage = 'run-install-script'
    message = $msg
  }} | ConvertTo-Json | Set-Content -Path $resultPath -Encoding UTF8
  exit 1
}}
"#
    );
    write_utf8_bom_text_file(&wrapper_path, &content)?;
    Ok(wrapper_path)
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

#[cfg(windows)]
fn run_elevated_powershell_file(script_path: &Path, log_path: &Path) -> Result<u32, String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, GetLastError, HWND};
    use windows::Win32::System::Threading::{
        GetExitCodeProcess, WaitForSingleObject, INFINITE,
    };
    use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWDEFAULT;

    fn wide(value: &OsStr) -> Vec<u16> {
        OsStrExt::encode_wide(value)
            .chain(std::iter::once(0))
            .collect()
    }

    const ERROR_CANCELLED: u32 = 1223;

    let powershell = powershell_system_exe();
    if !powershell.is_file() {
        return Err(format!("未找到系统 PowerShell: {}", powershell.display()));
    }

    let wrapper_quoted = format!("\"{}\"", script_path.display());
    let params_str = format!(
        "-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File {wrapper_quoted}"
    );

    let verb = wide(OsStr::new("runas"));
    let file = wide(powershell.as_os_str());
    let params = wide(OsStr::new(&params_str));

    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        hwnd: HWND::default(),
        lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: PCWSTR(params.as_ptr()),
        lpDirectory: PCWSTR::null(),
        nShow: SW_SHOWDEFAULT.0,
        ..Default::default()
    };

    let shell_ok = unsafe { ShellExecuteExW(&mut info).is_ok() };
    let inst = info.hInstApp.0 as isize;
    if !shell_ok || inst <= 32 {
        let code = unsafe { GetLastError().0 };
        let detail = describe_process_exit_code(code);
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .and_then(|mut file| {
                use std::io::Write;
                writeln!(
                    file,
                    "ShellExecuteExW 启动失败：{detail}（Win32={code}，hInstApp={inst}）"
                )
            });
        if code == ERROR_CANCELLED {
            return Ok(ERROR_CANCELLED);
        }
        return Err(format!("无法启动管理员安装进程（{detail}）"));
    }

    if info.hProcess.is_invalid() {
        return Err("管理员安装进程未返回进程句柄，可能被安全软件拦截".to_string());
    }

    unsafe {
        let _ = WaitForSingleObject(info.hProcess, INFINITE);
        let mut exit_code = 0u32;
        GetExitCodeProcess(info.hProcess, &mut exit_code)
            .map_err(|e| format!("读取安装进程退出码失败: {e}"))?;
        let _ = CloseHandle(info.hProcess);
        Ok(exit_code)
    }
}

#[cfg(windows)]
fn describe_process_exit_code(code: u32) -> String {
    const ERROR_CANCELLED: u32 = 1223;
    const STILL_ACTIVE: u32 = 259;
    const STATUS_CONTROL_C_EXIT: u32 = 0xC000_013A;
    if code == 0 {
        return "成功".to_string();
    }
    if code == ERROR_CANCELLED {
        return "用户取消了 UAC 提示".to_string();
    }
    if code == STILL_ACTIVE {
        return "安装进程仍在运行".to_string();
    }
    if code == STATUS_CONTROL_C_EXIT {
        return "安装进程被中断（请勿关闭弹出的安装窗口；Add-AppxPackage 部署期间关闭窗口会导致此错误）"
            .to_string();
    }
    if code >= 0x8000_0000 {
        let win32 = code & 0xFFFF;
        return format!("Windows 错误 0x{code:08X}（Win32={win32}）");
    }
    format!("退出码 {code}")
}

#[cfg(windows)]
fn run_elevated_install(install_script: &Path) -> Result<ElevatedInstallOutcome, String> {
    let workspace = widget_workspace_root()?;
    std::fs::create_dir_all(&workspace).map_err(|e| format!("创建工作目录失败: {e}"))?;

    let log_path = workspace.join("install.log");
    let result_path = workspace.join("install-result.json");
    let started_path = workspace.join("install-started");
    let attempt_path = workspace.join("install-attempt.json");
    let wrapper_path = write_install_wrapper(
        &workspace,
        install_script,
        &log_path,
        &result_path,
        &started_path,
    )?;

    let _ = std::fs::remove_file(&started_path);
    let _ = std::fs::remove_file(&result_path);

    let attempt = InstallAttemptJson {
        stage: "request-admin".to_string(),
        install_script: install_script.to_string_lossy().into_owned(),
        wrapper_script: wrapper_path.to_string_lossy().into_owned(),
    };
    let attempt_json = serde_json::to_string_pretty(&attempt)
        .map_err(|e| format!("写入安装尝试信息失败: {e}"))?;
    std::fs::write(&attempt_path, attempt_json)
        .map_err(|e| format!("写入 install-attempt.json 失败: {e}"))?;

    let _ = std::fs::write(
        &log_path,
        "正在请求管理员权限，请在 UAC 提示中点击「是」…\n",
    );

    let exit_code = match run_elevated_powershell_file(&wrapper_path, &log_path) {
        Ok(code) => code,
        Err(error) => {
            let log_excerpt = merge_install_log_excerpts(
                &read_log_excerpt(&log_path),
                &read_end_user_install_artifacts(),
            );
            return Ok(ElevatedInstallOutcome {
                exit_code: 1,
                message: error,
                log_path,
                log_excerpt,
            });
        }
    };

    let wrapper_started = started_path.is_file();
    let wrapper_log = read_log_excerpt(&log_path);
    let end_user = read_end_user_install_artifacts();
    let log_excerpt = merge_install_log_excerpts(&wrapper_log, &end_user);

    if exit_code == 1223 {
        return Ok(ElevatedInstallOutcome {
            exit_code,
            message: "需要管理员权限才能完成安装，请确认 UAC 提示".to_string(),
            log_path,
            log_excerpt,
        });
    }

    let message = if result_path.is_file() {
        std::fs::read_to_string(&result_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<InstallResultJson>(&raw).ok())
            .map(|parsed| {
                if !parsed.message.trim().is_empty() && parsed.message != "Running install.ps1" {
                    parsed.message
                } else if parsed.success {
                    "安装完成".to_string()
                } else if let Some(stage) = parsed.stage.filter(|value| !value.is_empty()) {
                    format!(
                        "安装失败（阶段 {stage}，{}）",
                        describe_process_exit_code(parsed.exit_code)
                    )
                } else {
                    format!(
                        "安装失败（{}）",
                        describe_process_exit_code(parsed.exit_code)
                    )
                }
            })
            .unwrap_or_else(|| build_bootstrap_failure_message(exit_code, wrapper_started, &log_excerpt))
    } else if exit_code == 0 {
        "安装完成".to_string()
    } else {
        build_bootstrap_failure_message(exit_code, wrapper_started, &log_excerpt)
    };

    Ok(ElevatedInstallOutcome {
        exit_code,
        message,
        log_path,
        log_excerpt,
    })
}

#[cfg(windows)]
fn build_bootstrap_failure_message(exit_code: u32, wrapper_started: bool, log_excerpt: &str) -> String {
    if exit_code == 0 {
        return "安装完成".to_string();
    }

    let hint = describe_process_exit_code(exit_code);
    if !wrapper_started {
        if log_excerpt.contains("ShellExecuteExW 启动失败") {
            return format!("管理员安装进程没有启动（{hint}）");
        }
        return format!(
            "管理员安装进程没有真正开始执行安装脚本（{hint}）。请检查 UAC 是否允许、杀软是否拦截 PowerShell，或改用手动解压后运行 install.ps1"
        );
    }

    format!("安装失败（{hint}）")
}

#[cfg(not(windows))]
fn run_elevated_install(_install_script: &Path) -> Result<(), String> {
    Err("Game Bar Widget 安装仅支持 Windows".to_string())
}

fn is_zip_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("zip"))
        .unwrap_or(false)
}

fn cleanup_install_staging(install_root: &Path) {
    let Ok(workspace) = widget_workspace_root() else {
        return;
    };
    if !install_root.starts_with(&workspace) {
        return;
    }
    if install_root == workspace {
        return;
    }
    let _ = std::fs::remove_dir_all(install_root);
}

fn cleanup_install_workspace() {
    let Ok(workspace) = widget_workspace_root() else {
        return;
    };
    let _ = std::fs::remove_dir_all(workspace);
}

fn prepare_local_install_root(source_path: &Path) -> Result<PathBuf, String> {
    if !source_path.exists() {
        return Err(format!("路径不存在: {}", source_path.display()));
    }

    if source_path.is_file() {
        if !is_zip_path(source_path) {
            return Err(
                "仅支持 .zip 安装包或已解压的安装文件夹（内含 install.ps1）".to_string(),
            );
        }
        let workspace = widget_workspace_root()?;
        std::fs::create_dir_all(&workspace).map_err(|e| format!("创建工作目录失败: {e}"))?;
        let install_root = workspace.join("staging");
        extract_widget_zip(source_path, &install_root)?;
        return Ok(install_root);
    }

    if source_path.join("install.ps1").is_file() {
        return Ok(source_path.to_path_buf());
    }

    Err(format!(
        "未找到 install.ps1: {}",
        source_path.join("install.ps1").display()
    ))
}

fn find_dev_dist_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let mut push_if_valid = |path: PathBuf| {
        if path.join("install.ps1").is_file() {
            candidates.push(path);
        }
    };

    if let Ok(cwd) = std::env::current_dir() {
        push_if_valid(cwd.join("gamebar-widget").join("dist"));
        if let Some(parent) = cwd.parent() {
            push_if_valid(parent.join("gamebar-widget").join("dist"));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(Path::to_path_buf);
        for _ in 0..8 {
            let Some(current) = dir else { break };
            push_if_valid(current.join("gamebar-widget").join("dist"));
            dir = current.parent().map(Path::to_path_buf);
        }
    }

    candidates.sort();
    candidates.dedup();
    candidates
}

async fn install_from_prepared_root(
    app: &AppHandle,
    install_root: &Path,
) -> Result<GameBarWidgetInstallResult, String> {
    let install_script = install_root.join("install.ps1");
    if !install_script.is_file() {
        return Err("安装包不完整：缺少 install.ps1".to_string());
    }

    let staging_dir = install_root.to_path_buf();
    let should_cleanup_staging = staging_dir
        .parent()
        .and_then(|parent| parent.file_name())
        .is_some_and(|name| name == "gamebar-widget-install");

    emit_progress(
        app,
        "installing",
        0,
        None,
        Some("请在 UAC 中点「是」。随后会弹出安装窗口，请保持开启，通常 1–3 分钟即可完成。"),
    );

    #[cfg(windows)]
    {
        let script_path = install_script.clone();
        let app_for_heartbeat = app.clone();
        let installing = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
        let installing_flag = installing.clone();

        let heartbeat = tauri::async_runtime::spawn(async move {
            let start = std::time::Instant::now();
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                if !installing_flag.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }
                let elapsed = start.elapsed().as_secs();
                let mins = elapsed / 60;
                let secs = elapsed % 60;
                emit_progress(
                    &app_for_heartbeat,
                    "installing",
                    0,
                    None,
                    Some(&format!(
                        "正在安装小组件，请保持安装窗口开启（已等待 {mins} 分 {secs} 秒）。若出现系统提示也请耐心等待，通常几分钟内可完成。"
                    )),
                );
            }
        });

        let outcome = tauri::async_runtime::spawn_blocking(move || run_elevated_install(&script_path))
            .await
            .map_err(|e| format!("安装任务失败: {e}"))??;

        installing.store(false, std::sync::atomic::Ordering::Relaxed);
        heartbeat.abort();

        let result = if outcome.exit_code != 0 {
            let message = format_install_failure(&outcome);
            Ok(GameBarWidgetInstallResult {
                success: false,
                installed_version: None,
                message,
                install_log_path: Some(outcome.log_path.to_string_lossy().into_owned()),
                install_log_excerpt: Some(outcome.log_excerpt),
            })
        } else if let Some(version) = query_installed_package().map(|(version, _)| version) {
            emit_progress(app, "complete", 0, None, Some("安装完成"));
            let shortcut = read_game_bar_open_shortcut().display;
            let message = format!(
                "{WIDGET_DISPLAY_NAME} 小组件安装成功。请在游戏中按 {shortcut} 打开游戏栏并固定小组件。"
            );
            Ok(GameBarWidgetInstallResult {
                success: true,
                installed_version: Some(version),
                message,
                install_log_path: None,
                install_log_excerpt: None,
            })
        } else {
            let message = format_install_failure(&ElevatedInstallOutcome {
                exit_code: outcome.exit_code,
                message: "安装脚本已结束，但未检测到 Widget 包。请检查安装日志。".to_string(),
                log_path: outcome.log_path.clone(),
                log_excerpt: outcome.log_excerpt.clone(),
            });
            Ok(GameBarWidgetInstallResult {
                success: false,
                installed_version: None,
                message,
                install_log_path: Some(outcome.log_path.to_string_lossy().into_owned()),
                install_log_excerpt: Some(outcome.log_excerpt),
            })
        };

        if should_cleanup_staging {
            if matches!(result.as_ref(), Ok(r) if r.success) {
                cleanup_install_workspace();
            } else {
                cleanup_install_staging(&staging_dir);
            }
        }

        return result;
    }

    #[cfg(not(windows))]
    {
        let _ = install_root;
        Err("Game Bar Widget 安装仅支持 Windows".to_string())
    }
}

#[tauri::command]
pub fn find_gamebar_widget_dev_dist() -> Option<String> {
    find_dev_dist_candidates()
        .into_iter()
        .next()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn install_or_update_gamebar_widget(
    app: AppHandle,
    download_url: Option<String>,
) -> Result<GameBarWidgetInstallResult, String> {
    let update = check_gamebar_widget_update().await?;
    let latest_version = update
        .latest_version
        .clone()
        .ok_or_else(|| update.error.unwrap_or_else(|| "无法获取 Widget 最新版本".to_string()))?;
    let resolved_download_url = download_url
        .or(update.cdn_download_url)
        .or(update.download_url)
        .ok_or_else(|| "缺少 Widget 下载地址".to_string())?;
    let fallback_download_url = update.github_download_url;

    let workspace = widget_workspace_root()?;
    let download_dir = workspace.join("downloads");
    let zip_name = update
        .zip_file_name
        .unwrap_or_else(|| format!("CSMatchHelperGameBarWidget-{latest_version}.zip"));
    let zip_path = download_dir.join(&zip_name);
    let extract_dir = workspace.join(format!("staging-{latest_version}"));

    download_widget_zip_with_fallback(
        &app,
        &resolved_download_url,
        fallback_download_url.as_deref(),
        &zip_path,
        update.sha256.as_deref(),
    )
    .await?;

    emit_progress(
        &app,
        "extracting",
        0,
        None,
        Some("正在解压安装包…"),
    );
    extract_widget_zip(&zip_path, &extract_dir)?;

    install_from_prepared_root(&app, &extract_dir).await
}

#[tauri::command]
pub async fn install_gamebar_widget_from_local(
    app: AppHandle,
    source_path: String,
) -> Result<GameBarWidgetInstallResult, String> {
    let source = PathBuf::from(source_path.trim());
    emit_progress(
        &app,
        "extracting",
        0,
        None,
        Some("正在准备本地安装包…"),
    );
    let install_root = prepare_local_install_root(&source)?;
    install_from_prepared_root(&app, &install_root).await
}

#[tauri::command]
pub fn uninstall_gamebar_widget() -> Result<(), String> {
    #[cfg(windows)]
    {
        let names = std::iter::once(WIDGET_PACKAGE_NAME)
            .chain(LEGACY_PACKAGE_NAMES.iter().copied())
            .map(|name| format!("'{name}'"))
            .collect::<Vec<_>>()
            .join(", ");
        let script = format!(
            r#"$names = @({names})
foreach ($name in $names) {{
  Get-AppxPackage -Name $name -ErrorAction SilentlyContinue | ForEach-Object {{
    CheckNetIsolation LoopbackExempt -d -n="$($_.PackageFamilyName)" 2>$null
    Remove-AppxPackage -Package $_.PackageFullName
  }}
}}"#
        );
        run_powershell(&script)?;
        Ok(())
    }

    #[cfg(not(windows))]
    {
        Err("Game Bar Widget 卸载仅支持 Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_bootstrap_failure_message, describe_process_exit_code, is_newer_version,
        merge_install_log_excerpts, parse_version_parts, parse_widget_version_from_zip_name,
        EndUserInstallArtifacts,
    };

    #[test]
    fn parse_widget_version_from_zip_name_extracts_semver() {
        assert_eq!(
            parse_widget_version_from_zip_name("CSMatchHelperGameBarWidget-1.0.2.zip").as_deref(),
            Some("1.0.2")
        );
        assert_eq!(parse_widget_version_from_zip_name("invalid.zip"), None);
    }

    #[test]
    fn parse_version_parts_handles_prefix_and_suffix() {
        assert_eq!(parse_version_parts("v2.2.0"), vec![2, 2, 0]);
        assert_eq!(parse_version_parts("1.0.1.0"), vec![1, 0, 1, 0]);
    }

    #[test]
    fn is_newer_version_compares_semver_like_parts() {
        assert!(is_newer_version("2.3.0", "2.2.0"));
        assert!(!is_newer_version("2.2.0", "2.2.0"));
        assert!(is_newer_version("2.2.1", "2.2.0"));
        assert!(!is_newer_version("1.0.1.0", "2.2.0"));
    }

    #[test]
    fn merge_install_log_excerpts_combines_wrapper_and_end_user_logs() {
        let end_user = EndUserInstallArtifacts {
            fail_message: None,
            log_excerpt: Some("end-user log".to_string()),
            ok_version: None,
        };
        let merged = merge_install_log_excerpts("wrapper log", &end_user);
        assert!(merged.contains("wrapper log"));
        assert!(merged.contains("end-user log"));
    }

    #[test]
    fn build_bootstrap_failure_message_detects_missing_sentinel() {
        let message = build_bootstrap_failure_message(1, false, "正在请求管理员权限");
        assert!(message.contains("没有真正开始执行安装脚本"));
    }

    #[test]
    fn describe_process_exit_code_maps_control_c_exit() {
        assert!(describe_process_exit_code(0xC000_013A).contains("被中断"));
    }
}
