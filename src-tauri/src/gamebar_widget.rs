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
const WIDGET_PUBLISHER: &str = "CN=CSMatchHelperDev";
const WIDGET_CERT_THUMBPRINT: &str = "196D5DCC495BCFF5EABCA6C9650FA8975954F8AA";
const LEGACY_PACKAGE_NAMES: &[&str] = &["CSMatchHelper.CounterStrafingHudWidget"];
const WIDGET_ZIP_PREFIX: &str = "CSMatchHelperGameBarWidget-";
const LUNARIS_USERNAME: &str = "qianjiachun";
const LUNARIS_WIDGET_PROJECT: &str = "cs-match-helper-widget";
const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/qianjiachun/cs-match-helper/releases/latest";
const LUNARIS_WIDGET_STABLE_URL: &str =
    "https://cdn.lunaris.win/qianjiachun/cs-match-helper-widget/CSMatchHelperGameBarWidget.zip?download";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBarWidgetStatus {
    pub installed: bool,
    pub installed_version: Option<String>,
    pub package_family_name: Option<String>,
    pub loopback_configured: bool,
    pub loopback_state: String,
    pub loopback_error: Option<String>,
    pub display_name: String,
    pub game_bar_installed: bool,
    /// 打开 Xbox 游戏栏的快捷键，如 `Win+G`
    pub game_bar_open_shortcut: String,
    /// 是否从注册表读取（`false` 表示使用系统默认 `Win+G`）
    pub game_bar_open_shortcut_from_registry: bool,
    pub trust: GameBarWidgetTrustStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeIntegrityBlockEvent {
    pub event_id: u32,
    pub time_created: String,
    pub target_file: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBarWidgetTrustStatus {
    pub publisher: String,
    pub signature_thumbprint: String,
    pub signature_kind: Option<String>,
    pub trusted_people: bool,
    pub msix_status: String,
    pub catalog_status: String,
    pub smart_app_control_state: String,
    pub wdac_state: String,
    pub recent_code_integrity_event: Option<CodeIntegrityBlockEvent>,
    pub runtime_state: String,
    pub runtime_verified: bool,
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
    pub issue_code: Option<String>,
    pub required_action: Option<String>,
    pub retryable: bool,
    pub blocking_packages: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBarWidgetRuntimeVerificationResult {
    pub success: bool,
    pub runtime_state: String,
    pub issue_code: Option<String>,
    pub required_action: Option<String>,
    pub retryable: bool,
    pub message: String,
    pub code_integrity_event: Option<CodeIntegrityBlockEvent>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBarWidgetConnectionRepairResult {
    pub success: bool,
    pub loopback_state: String,
    pub issue_code: Option<String>,
    pub required_action: Option<String>,
    pub retryable: bool,
    pub message: String,
    pub error: Option<String>,
}

struct LoopbackProbe {
    state: &'static str,
    error: Option<String>,
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
    github_download_url: Option<String>,
    sha256: Option<String>,
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

fn display_widget_version(version: &str) -> String {
    let trimmed = version.trim().trim_start_matches(['v', 'V']);
    let parts = trimmed.split('.').collect::<Vec<_>>();
    if parts.len() == 4
        && parts.iter().all(|part| {
            !part.is_empty() && part.chars().all(|character| character.is_ascii_digit())
        })
        && parts[3] == "0"
    {
        return parts[..3].join(".");
    }
    trimmed.to_string()
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

fn parse_json_allow_bom<T: serde::de::DeserializeOwned>(raw: &str) -> Result<T, serde_json::Error> {
    serde_json::from_str(raw.trim_start_matches('\u{feff}'))
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

    run_powershell(&script).ok().and_then(|line| {
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
fn query_loopback_status(family_name: &str) -> LoopbackProbe {
    let escaped = family_name.replace('\'', "''");
    let script = format!(
        r#"$out = @(& CheckNetIsolation.exe LoopbackExempt -s 2>&1)
$exitCode = $LASTEXITCODE
$text = ($out -join ' ').Trim()
if ($exitCode -ne 0) {{ Write-Output "unknown|CheckNetIsolation query exited with code $exitCode"; exit 0 }}
if ($text -match [regex]::Escape('{escaped}')) {{ Write-Output 'configured'; exit 0 }}
if (-not $text -or $text -match '(?i)Unable to load string message') {{
  Write-Output ("unknown|CheckNetIsolation returned unreadable output: " + $text)
  exit 0
}}
Write-Output 'missing'"#
    );
    match run_powershell(&script) {
        Ok(value) => parse_loopback_probe_output(&value),
        Err(error) => LoopbackProbe {
            state: "unknown",
            error: Some(error),
        },
    }
}

fn parse_loopback_probe_output(value: &str) -> LoopbackProbe {
    let trimmed = value.trim();
    if trimmed.eq_ignore_ascii_case("configured") {
        return LoopbackProbe {
            state: "configured",
            error: None,
        };
    }
    if trimmed.eq_ignore_ascii_case("missing") {
        return LoopbackProbe {
            state: "missing",
            error: None,
        };
    }
    let detail = trimmed
        .strip_prefix("unknown|")
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .unwrap_or("Unexpected CheckNetIsolation output");
    LoopbackProbe {
        state: "unknown",
        error: Some(detail.to_string()),
    }
}

#[cfg(not(windows))]
fn query_loopback_status(_family_name: &str) -> LoopbackProbe {
    LoopbackProbe {
        state: "unknown",
        error: Some("Loopback detection is only supported on Windows".to_string()),
    }
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrustProbeJson {
    publisher: Option<String>,
    signature_thumbprint: Option<String>,
    signature_kind: Option<String>,
    trusted_people: bool,
    msix_status: String,
    catalog_status: String,
    smart_app_control_state: String,
    wdac_state: String,
    recent_code_integrity_event: Option<CodeIntegrityBlockEvent>,
    process_running: bool,
    runtime_marker_matches: bool,
}

fn resolve_runtime_state(
    installed: bool,
    smart_app_control_state: &str,
    has_code_integrity_block: bool,
    process_running: bool,
    runtime_marker_matches: bool,
) -> (&'static str, bool) {
    if !installed {
        ("notInstalled", false)
    } else if smart_app_control_state == "on" {
        ("blockedBySmartAppControl", false)
    } else if process_running {
        ("running", true)
    } else if has_code_integrity_block {
        ("blockedByCodeIntegrity", false)
    } else if runtime_marker_matches {
        ("running", true)
    } else {
        ("installedUnverified", false)
    }
}

#[cfg(windows)]
fn query_widget_trust_status(installed_version: Option<&str>) -> GameBarWidgetTrustStatus {
    let version = installed_version.unwrap_or("").replace('\'', "''");
    let script = format!(
        r#"$ErrorActionPreference = 'SilentlyContinue'
$expectedThumbprint = '{WIDGET_CERT_THUMBPRINT}'
$expectedVersion = '{version}'
$pkg = Get-AppxPackage -Name '{WIDGET_PACKAGE_NAME}' | Select-Object -First 1
$publisher = $null
$signatureKind = $null
$catalogStatus = 'NotInstalled'
$signatureThumbprint = $null
if ($pkg) {{
  $signatureKind = [string]$pkg.SignatureKind
  try {{ $publisher = [string](Get-AppxPackageManifest -Package $pkg).Package.Identity.Publisher }} catch {{}}
  $catalog = Join-Path $pkg.InstallLocation 'AppxMetadata\CodeIntegrity.cat'
  if (Test-Path -LiteralPath $catalog) {{
    $sig = Get-AuthenticodeSignature -LiteralPath $catalog
    $catalogStatus = [string]$sig.Status
    if ($sig.SignerCertificate) {{ $signatureThumbprint = ($sig.SignerCertificate.Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant() }}
  }} else {{ $catalogStatus = 'Missing' }}
}}
$trustedPeople = [bool](Get-ChildItem Cert:\LocalMachine\TrustedPeople | Where-Object {{ (($_.Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()) -eq $expectedThumbprint }} | Select-Object -First 1)
$msixStatus = if (-not $pkg) {{ 'NotInstalled' }} elseif ($catalogStatus -eq 'Valid' -and $trustedPeople) {{ 'Valid' }} else {{ [string]$pkg.Status }}
$sac = 'unknown'
if ([Environment]::OSVersion.Version.Build -lt 22000) {{ $sac = 'notApplicable' }} else {{
  try {{
    $sacValue = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -Name VerifiedAndReputablePolicyState -ErrorAction Stop).VerifiedAndReputablePolicyState
    $sac = switch ([int]$sacValue) {{ 0 {{ 'off' }} 1 {{ 'on' }} 2 {{ 'evaluation' }} default {{ 'unknown' }} }}
  }} catch {{}}
}}
$wdac = 'unknown'
try {{
  $dg = Get-CimInstance -Namespace 'root\Microsoft\Windows\DeviceGuard' -ClassName Win32_DeviceGuard -ErrorAction Stop
  $wdac = switch ([int]$dg.CodeIntegrityPolicyEnforcementStatus) {{ 0 {{ 'off' }} 1 {{ 'audit' }} 2 {{ 'enforced' }} default {{ 'unknown' }} }}
}} catch {{}}
$markerMatches = $false
$markerVerifiedAt = $null
$markerPath = Join-Path $env:LOCALAPPDATA 'CSMatchHelper\gamebar-widget\runtime-verified.json'
if ($pkg -and (Test-Path -LiteralPath $markerPath)) {{
  try {{
    $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    $markerMatches = ([string]$marker.version -eq $expectedVersion -and ([string]$marker.thumbprint).ToUpperInvariant() -eq $expectedThumbprint)
    if ($markerMatches -and $marker.verifiedAt) {{ $markerVerifiedAt = [datetime]$marker.verifiedAt }}
  }} catch {{}}
}}
$widgetProcess = $null
if ($pkg) {{
  try {{
    $packageRoot = [IO.Path]::GetFullPath([string]$pkg.InstallLocation).TrimEnd('\') + '\'
    foreach ($candidate in @(Get-Process -Name 'CSMatchHelperWidget' -ErrorAction SilentlyContinue)) {{
      try {{
        $candidatePath = [IO.Path]::GetFullPath([string]$candidate.Path)
        if ($candidatePath.StartsWith($packageRoot, [StringComparison]::OrdinalIgnoreCase)) {{
          $widgetProcess = $candidate
          break
        }}
      }} catch {{}}
    }}
  }} catch {{}}
}}
$processRunning = [bool]$widgetProcess
if ($pkg -and $processRunning -and $publisher -eq '{WIDGET_PUBLISHER}' -and $signatureThumbprint -eq $expectedThumbprint -and $catalogStatus -eq 'Valid' -and $trustedPeople) {{
  try {{
    $markerDir = Split-Path -Parent $markerPath
    New-Item -ItemType Directory -Force -Path $markerDir | Out-Null
    [ordered]@{{ version=$expectedVersion; thumbprint=$expectedThumbprint; verifiedAt=(Get-Date).ToUniversalTime().ToString('o') }} | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8
    Remove-Item -LiteralPath (Join-Path $markerDir 'installed.pending') -Force -ErrorAction SilentlyContinue
    $markerMatches = $true
    $markerVerifiedAt = Get-Date
  }} catch {{}}
}}
$eventData = $null
if (-not $processRunning) {{
  try {{
    $eventStart = (Get-Date).AddDays(-7)
    $pendingPath = Join-Path $env:LOCALAPPDATA 'CSMatchHelper\gamebar-widget\installed.pending'
    if (Test-Path -LiteralPath $pendingPath) {{
      $pendingAt = (Get-Item -LiteralPath $pendingPath).LastWriteTime
      if ($pendingAt -gt $eventStart) {{ $eventStart = $pendingAt }}
    }}
    if ($markerVerifiedAt -and $markerVerifiedAt -gt $eventStart) {{ $eventStart = $markerVerifiedAt }}
    $event = Get-WinEvent -FilterHashtable @{{ LogName='Microsoft-Windows-CodeIntegrity/Operational'; Id=3033,3077; StartTime=$eventStart }} -MaxEvents 100 |
      Where-Object {{ $_.Message -match 'CSMatchHelperWidget|CSMatchHelper\.GameBarWidget' }} | Select-Object -First 1
    if ($event) {{
      $message = ([string]$event.Message -replace '\s+', ' ').Trim()
      if ($message.Length -gt 800) {{ $message = $message.Substring(0, 800) }}
      $target = [regex]::Match($message, '[A-Za-z]:\\[^\"\r\n]+?\.(exe|dll)').Value
      $eventData = [ordered]@{{ eventId=[int]$event.Id; timeCreated=$event.TimeCreated.ToUniversalTime().ToString('o'); targetFile=$(if ($target) {{ $target }} else {{ $null }}); message=$message }}
    }}
  }} catch {{}}
}}
[ordered]@{{
  publisher=$publisher
  signatureThumbprint=$signatureThumbprint
  signatureKind=$signatureKind
  trustedPeople=$trustedPeople
  msixStatus=$msixStatus
  catalogStatus=$catalogStatus
  smartAppControlState=$sac
  wdacState=$wdac
  recentCodeIntegrityEvent=$eventData
  processRunning=$processRunning
  runtimeMarkerMatches=$markerMatches
}} | ConvertTo-Json -Depth 6 -Compress"#
    );

    let fallback = || GameBarWidgetTrustStatus {
        publisher: WIDGET_PUBLISHER.to_string(),
        signature_thumbprint: WIDGET_CERT_THUMBPRINT.to_string(),
        signature_kind: None,
        trusted_people: false,
        msix_status: if installed_version.is_some() {
            "Unknown"
        } else {
            "NotInstalled"
        }
        .to_string(),
        catalog_status: if installed_version.is_some() {
            "Unknown"
        } else {
            "NotInstalled"
        }
        .to_string(),
        smart_app_control_state: "unknown".to_string(),
        wdac_state: "unknown".to_string(),
        recent_code_integrity_event: None,
        runtime_state: if installed_version.is_some() {
            "installedUnverified"
        } else {
            "notInstalled"
        }
        .to_string(),
        runtime_verified: false,
    };

    let Ok(output) = run_powershell(&script) else {
        return fallback();
    };
    let Ok(probe) = parse_json_allow_bom::<TrustProbeJson>(&output) else {
        return fallback();
    };
    let (runtime_state, runtime_verified) = resolve_runtime_state(
        installed_version.is_some(),
        &probe.smart_app_control_state,
        probe.recent_code_integrity_event.is_some(),
        probe.process_running,
        probe.runtime_marker_matches,
    );

    GameBarWidgetTrustStatus {
        publisher: probe
            .publisher
            .unwrap_or_else(|| WIDGET_PUBLISHER.to_string()),
        signature_thumbprint: probe
            .signature_thumbprint
            .unwrap_or_else(|| WIDGET_CERT_THUMBPRINT.to_string()),
        signature_kind: probe.signature_kind,
        trusted_people: probe.trusted_people,
        msix_status: probe.msix_status,
        catalog_status: probe.catalog_status,
        smart_app_control_state: probe.smart_app_control_state,
        wdac_state: probe.wdac_state,
        recent_code_integrity_event: probe.recent_code_integrity_event,
        runtime_state: runtime_state.to_string(),
        runtime_verified,
    }
}

#[cfg(not(windows))]
fn query_widget_trust_status(installed_version: Option<&str>) -> GameBarWidgetTrustStatus {
    GameBarWidgetTrustStatus {
        publisher: WIDGET_PUBLISHER.to_string(),
        signature_thumbprint: WIDGET_CERT_THUMBPRINT.to_string(),
        signature_kind: None,
        trusted_people: false,
        msix_status: "NotApplicable".to_string(),
        catalog_status: "NotApplicable".to_string(),
        smart_app_control_state: "notApplicable".to_string(),
        wdac_state: "notApplicable".to_string(),
        recent_code_integrity_event: None,
        runtime_state: if installed_version.is_some() {
            "installedUnverified"
        } else {
            "notInstalled"
        }
        .to_string(),
        runtime_verified: false,
    }
}

/// Widget 安装工作目录：与主程序 exe 同级的 `gamebar-widget-install/`
fn widget_workspace_root() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法获取程序路径: {e}"))?;
    let dir = exe.parent().ok_or_else(|| "无法定位程序目录".to_string())?;
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

fn find_widget_zip_name(value: &str) -> Option<String> {
    let start = value.find(WIDGET_ZIP_PREFIX)?;
    let remainder = &value[start..];
    let end = remainder.find(".zip")? + ".zip".len();
    let candidate = &remainder[..end];
    parse_widget_version_from_zip_name(candidate)?;
    Some(candidate.to_string())
}

fn parse_widget_version_from_cdn_hint(message: &str) -> Option<String> {
    let lower = message.to_ascii_lowercase();
    let marker = "not found in version";
    let start = lower.find(marker)? + marker.len();
    let candidate = message[start..]
        .trim_start()
        .trim_start_matches(['v', 'V'])
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect::<String>();
    let parts = candidate.split('.').collect::<Vec<_>>();
    if !(2..=4).contains(&parts.len())
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.chars().all(|c| c.is_ascii_digit()))
    {
        return None;
    }
    Some(candidate)
}

fn normalize_sha256(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.len() == 64 && normalized.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(normalized)
    } else {
        None
    }
}

fn build_widget_zip_cdn_url(version: &str, zip_file_name: &str, sha256: Option<&str>) -> String {
    let tag = version.trim().trim_start_matches('v');
    let mut url = format!(
        "https://cdn.lunaris.win/{LUNARIS_USERNAME}/{LUNARIS_WIDGET_PROJECT}/{zip_file_name}?download&v={tag}"
    );
    if let Some(hash) = sha256.and_then(normalize_sha256) {
        url.push_str("&sha=");
        url.push_str(&hash[..12]);
    }
    url
}

async fn fetch_github_widget_release_info(
    client: &reqwest::Client,
) -> Result<WidgetReleaseInfo, String> {
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
        .find(|asset| asset.name.starts_with(WIDGET_ZIP_PREFIX) && asset.name.ends_with(".zip"))
        .ok_or_else(|| "GitHub Release 中未找到 Widget zip 附件".to_string())?;

    let version = parse_widget_version_from_zip_name(&asset.name)
        .ok_or_else(|| format!("无法从 Widget zip 文件名解析版本: {}", asset.name))?;

    Ok(WidgetReleaseInfo {
        version,
        zip_file_name: asset.name.clone(),
        github_download_url: Some(asset.browser_download_url.clone()),
        sha256: None,
    })
}

async fn fetch_cdn_widget_release_info(
    client: &reqwest::Client,
) -> Result<WidgetReleaseInfo, String> {
    let response = client
        .get(LUNARIS_WIDGET_STABLE_URL)
        .send()
        .await
        .map_err(|e| format!("备用 CDN 版本探测失败: {e}"))?;
    let status = response.status();
    let response_url = response.url().as_str().to_string();
    let content_disposition = response
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let sha256 = response
        .headers()
        .get("x-checksum-sha256")
        .and_then(|value| value.to_str().ok())
        .and_then(normalize_sha256);

    if let Some(zip_file_name) =
        find_widget_zip_name(&content_disposition).or_else(|| find_widget_zip_name(&response_url))
    {
        let version = parse_widget_version_from_zip_name(&zip_file_name)
            .ok_or_else(|| "备用 CDN 返回了无法识别的 Widget 文件名".to_string())?;
        return Ok(WidgetReleaseInfo {
            version,
            zip_file_name,
            github_download_url: None,
            sha256,
        });
    }

    if status.is_success() {
        return Err("备用 CDN 可访问，但响应中没有版本信息".to_string());
    }

    let message = response
        .text()
        .await
        .map_err(|e| format!("读取备用 CDN 版本提示失败: {e}"))?;
    let version = parse_widget_version_from_cdn_hint(&message)
        .ok_or_else(|| format!("备用 CDN 未返回可识别的版本提示: HTTP {status}"))?;
    Ok(WidgetReleaseInfo {
        zip_file_name: build_widget_zip_name(&version),
        version,
        github_download_url: None,
        sha256,
    })
}

async fn fetch_widget_release_info(client: &reqwest::Client) -> Result<WidgetReleaseInfo, String> {
    match fetch_github_widget_release_info(client).await {
        Ok(mut release) => {
            if let Ok(cdn_release) = fetch_cdn_widget_release_info(client).await {
                if cdn_release.version == release.version {
                    release.sha256 = cdn_release.sha256;
                }
            }
            Ok(release)
        }
        Err(github_error) => fetch_cdn_widget_release_info(client)
            .await
            .map_err(|cdn_error| format!("{github_error}；{cdn_error}")),
    }
}

#[tauri::command]
pub async fn get_gamebar_widget_status() -> Result<GameBarWidgetStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let installed = query_installed_package();
        let loopback = installed
            .as_ref()
            .map(|(_, family)| query_loopback_status(family))
            .unwrap_or(LoopbackProbe {
                state: "missing",
                error: None,
            });
        let trust =
            query_widget_trust_status(installed.as_ref().map(|(version, _)| version.as_str()));

        let shortcut = read_game_bar_open_shortcut();
        Ok(GameBarWidgetStatus {
            installed: installed.is_some(),
            installed_version: installed
                .as_ref()
                .map(|(version, _)| display_widget_version(version)),
            package_family_name: installed.map(|(_, family)| family),
            loopback_configured: loopback.state == "configured",
            loopback_state: loopback.state.to_string(),
            loopback_error: loopback.error,
            display_name: WIDGET_DISPLAY_NAME.to_string(),
            game_bar_installed: is_game_bar_installed(),
            game_bar_open_shortcut: shortcut.display,
            game_bar_open_shortcut_from_registry: shortcut.from_registry,
            trust,
        })
    })
    .await
    .map_err(|e| format!("查询 Widget 状态失败: {e}"))?
}

#[tauri::command]
pub async fn check_gamebar_widget_update() -> Result<GameBarWidgetUpdateCheck, String> {
    let installed_version_raw = query_installed_package().map(|(version, _)| version);
    let installed_version = installed_version_raw.as_deref().map(display_widget_version);
    let client = http_client()?;

    match fetch_widget_release_info(&client).await {
        Ok(release) => {
            let latest_version = release.version.clone();
            let has_update = match installed_version_raw.as_deref() {
                Some(current) => is_newer_version(&latest_version, current),
                None => true,
            };
            let zip_file_name = if release.zip_file_name.is_empty() {
                build_widget_zip_name(&latest_version)
            } else {
                release.zip_file_name
            };
            let cdn_download_url = build_widget_zip_cdn_url(
                &latest_version,
                &zip_file_name,
                release.sha256.as_deref(),
            );
            Ok(GameBarWidgetUpdateCheck {
                installed_version,
                latest_version: Some(latest_version),
                has_update,
                download_url: Some(cdn_download_url.clone()),
                cdn_download_url: Some(cdn_download_url),
                github_download_url: release.github_download_url,
                sha256: release.sha256,
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
    locale: &str,
) -> Result<(), String> {
    let client = http_client()?;
    emit_progress(
        app,
        "downloading",
        0,
        None,
        Some(if locale == "en-US" {
            "Downloading the CS Match Helper Widget…"
        } else {
            "正在下载 CS 匹配助手小组件…"
        }),
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
    file.flush()
        .map_err(|e| format!("保存 zip 文件失败: {e}"))?;
    drop(file);

    let computed = hex::encode(hasher.finalize());
    emit_progress(
        app,
        "verifying",
        downloaded_bytes,
        total_bytes,
        Some(if locale == "en-US" {
            "Verifying the package…"
        } else {
            "正在校验安装包…"
        }),
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
    locale: &str,
) -> Result<(), String> {
    match download_widget_zip(app, primary_url, dest_path, expected_sha256, locale).await {
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
                Some(if locale == "en-US" {
                    "CDN download failed. Trying GitHub Releases…"
                } else {
                    "CDN 下载失败，正在尝试 GitHub Release…"
                }),
            );
            if dest_path.exists() {
                let _ = std::fs::remove_file(dest_path);
            }
            download_widget_zip(app, fallback, dest_path, expected_sha256, locale)
                .await
                .map_err(|fallback_error| {
                    format!("CDN 下载失败: {primary_error}；GitHub 下载失败: {fallback_error}")
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
    diagnostics_warning: Option<String>,
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
    issue_code: Option<String>,
    required_action: Option<String>,
    retryable: Option<bool>,
    blocking_packages: Vec<String>,
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallIssueJson {
    issue_code: Option<String>,
    required_action: Option<String>,
    retryable: Option<bool>,
    #[serde(default)]
    blocking_packages: Vec<String>,
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallPreflightJson {
    success: bool,
    issue_code: Option<String>,
    required_action: Option<String>,
    retryable: bool,
    message: String,
}

#[cfg(windows)]
fn read_log_excerpt(path: &Path) -> String {
    let content = std::fs::read_to_string(path)
        .unwrap_or_default()
        .trim_start_matches('\u{feff}')
        .to_string();
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
fn ensure_end_user_widget_marker_dir() -> Result<PathBuf, String> {
    let marker_dir = end_user_widget_marker_dir()
        .ok_or_else(|| "无法定位当前用户的 LocalAppData 目录".to_string())?;
    std::fs::create_dir_all(&marker_dir).map_err(|error| {
        format!(
            "无法创建 Widget 安装诊断目录 {}: {error}",
            marker_dir.display()
        )
    })?;
    Ok(marker_dir)
}

#[cfg(windows)]
fn read_end_user_install_artifacts() -> EndUserInstallArtifacts {
    let Some(marker_dir) = end_user_widget_marker_dir() else {
        return EndUserInstallArtifacts {
            fail_message: None,
            log_excerpt: None,
            ok_version: None,
            issue_code: None,
            required_action: None,
            retryable: None,
            blocking_packages: Vec::new(),
        };
    };

    let fail_path = marker_dir.join("install.fail");
    let log_path = marker_dir.join("install.log");
    let ok_path = marker_dir.join("install.ok");
    let issue_path = marker_dir.join("install-issue.json");

    let fail_message = std::fs::read_to_string(&fail_path)
        .ok()
        .map(|value| value.trim_start_matches('\u{feff}').trim().to_string())
        .filter(|value| !value.is_empty());

    let log_excerpt = if log_path.is_file() {
        Some(read_log_excerpt(&log_path))
    } else {
        None
    };

    let ok_version = std::fs::read_to_string(&ok_path)
        .ok()
        .map(|value| value.trim_start_matches('\u{feff}').trim().to_string())
        .filter(|value| !value.is_empty());

    let issue = std::fs::read_to_string(&issue_path)
        .ok()
        .and_then(|value| parse_json_allow_bom::<InstallIssueJson>(&value).ok());

    let issue_code = issue.as_ref().and_then(|value| value.issue_code.clone());
    let required_action = issue
        .as_ref()
        .and_then(|value| value.required_action.clone());
    let retryable = issue.as_ref().and_then(|value| value.retryable);
    let blocking_packages = issue
        .as_ref()
        .map(|value| value.blocking_packages.clone())
        .unwrap_or_default();

    EndUserInstallArtifacts {
        fail_message,
        log_excerpt,
        ok_version,
        issue_code,
        required_action,
        retryable,
        blocking_packages,
    }
}

#[cfg(windows)]
fn clear_end_user_install_artifacts() {
    let Ok(marker_dir) = ensure_end_user_widget_marker_dir() else {
        return;
    };
    for name in [
        "install.fail",
        "install.log",
        "install.ok",
        "install-issue.json",
    ] {
        let _ = std::fs::remove_file(marker_dir.join(name));
    }
}

#[cfg(windows)]
fn run_install_preflight(
    install_script: &Path,
    locale: &str,
) -> Result<InstallPreflightJson, String> {
    let path = install_script.to_string_lossy().replace('\'', "''");
    let locale = locale.replace('\'', "''");
    let script = format!("& '{path}' -Language '{locale}' -PreflightOnly -Json");
    let (_code, stdout, stderr) = run_powershell_with_exit_code(&script)?;
    let json_line = stdout
        .lines()
        .rev()
        .find(|line| line.trim_start().starts_with('{'))
        .ok_or_else(|| {
            format!(
                "安装包预检未返回结构化结果{}",
                if stderr.is_empty() {
                    String::new()
                } else {
                    format!(": {stderr}")
                }
            )
        })?;
    parse_json_allow_bom::<InstallPreflightJson>(json_line)
        .map_err(|e| format!("解析安装包预检结果失败: {e}"))
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
fn format_install_failure(outcome: &ElevatedInstallOutcome, locale: &str) -> String {
    let end_user = read_end_user_install_artifacts();
    let base = if let Some(fail_message) = end_user.fail_message.as_ref().filter(|v| !v.is_empty())
    {
        fail_message.clone()
    } else if outcome.message.trim().is_empty() {
        if locale == "en-US" {
            format!("Installation failed (exit code {})", outcome.exit_code)
        } else {
            format!(
                "安装失败（{}）",
                describe_process_exit_code(outcome.exit_code)
            )
        }
    } else {
        outcome.message.clone()
    };

    base
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
    locale: &str,
) -> Result<PathBuf, String> {
    let wrapper_path = workspace.join("run-install-wrapper.ps1");
    let install_literal = install_script.to_string_lossy().replace('\'', "''");
    let log_literal = log_path.to_string_lossy().replace('\'', "''");
    let result_literal = result_path.to_string_lossy().replace('\'', "''");
    let started_literal = started_path.to_string_lossy().replace('\'', "''");
    let locale_literal = locale.replace('\'', "''");
    let content = format!(
        r#"$ErrorActionPreference = 'Stop'
$logPath = '{log_literal}'
$resultPath = '{result_literal}'
$startedPath = '{started_literal}'
$installScript = '{install_literal}'
$locale = '{locale_literal}'
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
  & $installScript -Language $locale
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
    use windows::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject, INFINITE};
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
    let params_str =
        format!("-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File {wrapper_quoted}");

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
fn run_elevated_install(
    install_script: &Path,
    locale: &str,
) -> Result<ElevatedInstallOutcome, String> {
    let workspace = widget_workspace_root()?;
    std::fs::create_dir_all(&workspace).map_err(|e| format!("创建工作目录失败: {e}"))?;
    let diagnostics_warning = ensure_end_user_widget_marker_dir().err();
    clear_end_user_install_artifacts();

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
        locale,
    )?;

    let _ = std::fs::remove_file(&started_path);
    let _ = std::fs::remove_file(&result_path);

    let attempt = InstallAttemptJson {
        stage: "request-admin".to_string(),
        install_script: install_script.to_string_lossy().into_owned(),
        wrapper_script: wrapper_path.to_string_lossy().into_owned(),
    };
    let attempt_json =
        serde_json::to_string_pretty(&attempt).map_err(|e| format!("写入安装尝试信息失败: {e}"))?;
    std::fs::write(&attempt_path, attempt_json)
        .map_err(|e| format!("写入 install-attempt.json 失败: {e}"))?;

    let _ = std::fs::write(
        &log_path,
        "正在请求管理员权限，请在 UAC 提示中点击「是」…\n",
    );
    if let Some(warning) = diagnostics_warning.as_ref() {
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .and_then(|mut file| {
                use std::io::Write;
                writeln!(file, "安装诊断警告：{warning}")
            });
    }

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
                diagnostics_warning,
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
            diagnostics_warning,
        });
    }

    let message = if result_path.is_file() {
        std::fs::read_to_string(&result_path)
            .ok()
            .and_then(|raw| parse_json_allow_bom::<InstallResultJson>(&raw).ok())
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
            .unwrap_or_else(|| {
                build_bootstrap_failure_message(exit_code, wrapper_started, &log_excerpt)
            })
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
        diagnostics_warning,
    })
}

#[cfg(windows)]
fn build_bootstrap_failure_message(
    exit_code: u32,
    wrapper_started: bool,
    log_excerpt: &str,
) -> String {
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
fn run_elevated_install(_install_script: &Path, _locale: &str) -> Result<(), String> {
    Err("Game Bar Widget 安装仅支持 Windows".to_string())
}

fn normalize_app_locale(locale: Option<&str>) -> &'static str {
    match locale {
        Some(value)
            if value.eq_ignore_ascii_case("zh-CN")
                || value.to_ascii_lowercase().starts_with("zh-") =>
        {
            "zh-CN"
        }
        _ => "en-US",
    }
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
            return Err("仅支持 .zip 安装包或已解压的安装文件夹（内含 install.ps1）".to_string());
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
    locale: &str,
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

    #[cfg(windows)]
    {
        let preflight = run_install_preflight(&install_script, locale)?;
        if !preflight.success {
            if should_cleanup_staging {
                cleanup_install_staging(&staging_dir);
            }
            return Ok(GameBarWidgetInstallResult {
                success: false,
                installed_version: query_installed_package()
                    .map(|(version, _)| display_widget_version(&version)),
                message: preflight.message,
                install_log_path: None,
                install_log_excerpt: None,
                issue_code: preflight.issue_code,
                required_action: preflight.required_action,
                retryable: preflight.retryable,
                blocking_packages: Vec::new(),
            });
        }
    }

    emit_progress(
        app,
        "installing",
        0,
        None,
        Some(if locale == "en-US" {
            "Approve the UAC prompt, then keep the setup window open. Installation normally takes 1–3 minutes."
        } else {
            "请在 UAC 中点「是」。随后会弹出安装窗口，请保持开启，通常 1–3 分钟即可完成。"
        }),
    );

    #[cfg(windows)]
    {
        let script_path = install_script.clone();
        let install_locale = locale.to_string();
        let heartbeat_locale = install_locale.clone();
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
                let message = if heartbeat_locale == "en-US" {
                    format!("Installing the Widget. Keep the setup window open ({mins}m {secs}s elapsed).")
                } else {
                    format!("正在安装小组件，请保持安装窗口开启（已等待 {mins} 分 {secs} 秒）。若出现系统提示也请耐心等待，通常几分钟内可完成。")
                };
                emit_progress(&app_for_heartbeat, "installing", 0, None, Some(&message));
            }
        });

        let outcome = tauri::async_runtime::spawn_blocking(move || {
            run_elevated_install(&script_path, &install_locale)
        })
        .await
        .map_err(|e| format!("安装任务失败: {e}"))??;

        installing.store(false, std::sync::atomic::Ordering::Relaxed);
        heartbeat.abort();

        let result = if outcome.exit_code != 0 {
            let message = format_install_failure(&outcome, locale);
            let artifacts = read_end_user_install_artifacts();
            let issue_code = artifacts.issue_code.or_else(|| {
                outcome
                    .diagnostics_warning
                    .as_ref()
                    .map(|_| "installDiagnosticsUnavailable".to_string())
            });
            let required_action = artifacts.required_action.or_else(|| {
                outcome
                    .diagnostics_warning
                    .as_ref()
                    .map(|_| "checkInstallLogAndRetry".to_string())
            });
            Ok(GameBarWidgetInstallResult {
                success: false,
                installed_version: None,
                message,
                install_log_path: Some(outcome.log_path.to_string_lossy().into_owned()),
                install_log_excerpt: Some(outcome.log_excerpt),
                issue_code,
                required_action,
                retryable: artifacts.retryable.unwrap_or(true),
                blocking_packages: artifacts.blocking_packages,
            })
        } else if let Some(version) = query_installed_package().map(|(version, _)| version) {
            emit_progress(
                app,
                "complete",
                0,
                None,
                Some(if locale == "en-US" {
                    "Widget installed and ready"
                } else {
                    "小组件已安装并就绪"
                }),
            );
            let shortcut = read_game_bar_open_shortcut().display;
            let message = if locale == "en-US" {
                format!("CS Match Helper Widget installed. Press {shortcut} to open and pin it.")
            } else {
                format!("{WIDGET_DISPLAY_NAME} 小组件已安装。请按 {shortcut} 打开并固定小组件即可使用。")
            };
            Ok(GameBarWidgetInstallResult {
                success: true,
                installed_version: Some(display_widget_version(&version)),
                message,
                install_log_path: None,
                install_log_excerpt: None,
                issue_code: None,
                required_action: Some("none".to_string()),
                retryable: true,
                blocking_packages: Vec::new(),
            })
        } else {
            let message = format_install_failure(
                &ElevatedInstallOutcome {
                    exit_code: outcome.exit_code,
                    message: "安装脚本已结束，但未检测到 Widget 包。请检查安装日志。".to_string(),
                    log_path: outcome.log_path.clone(),
                    log_excerpt: outcome.log_excerpt.clone(),
                    diagnostics_warning: outcome.diagnostics_warning.clone(),
                },
                locale,
            );
            Ok(GameBarWidgetInstallResult {
                success: false,
                installed_version: None,
                message,
                install_log_path: Some(outcome.log_path.to_string_lossy().into_owned()),
                install_log_excerpt: Some(outcome.log_excerpt),
                issue_code: Some("installStateUnknown".to_string()),
                required_action: Some("retry".to_string()),
                retryable: true,
                blocking_packages: Vec::new(),
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

async fn smart_app_control_install_block(
    locale: &str,
) -> Result<Option<GameBarWidgetInstallResult>, String> {
    let state = tauri::async_runtime::spawn_blocking(|| {
        let installed_version = query_installed_package().map(|(version, _)| version);
        query_widget_trust_status(installed_version.as_deref()).smart_app_control_state
    })
    .await
    .map_err(|e| format!("检查 Smart App Control 状态失败: {e}"))?;

    if state != "on" {
        return Ok(None);
    }

    Ok(Some(GameBarWidgetInstallResult {
        success: false,
        installed_version: None,
        message: if locale == "en-US" {
            "Smart App Control is on. Setup stopped before downloading or changing the system. Turn it off manually in Windows Security, then detect again."
                .to_string()
        } else {
            "智能应用控制已开启。安装已在下载或修改系统前停止；请在 Windows 安全中心手动关闭后重新检测。"
                .to_string()
        },
        install_log_path: None,
        install_log_excerpt: None,
        issue_code: Some("smartAppControlOn".to_string()),
        required_action: Some("openSmartAppControlSettings".to_string()),
        retryable: true,
        blocking_packages: Vec::new(),
    }))
}

#[tauri::command]
pub async fn install_or_update_gamebar_widget(
    app: AppHandle,
    download_url: Option<String>,
    locale: Option<String>,
) -> Result<GameBarWidgetInstallResult, String> {
    let locale = normalize_app_locale(locale.as_deref());
    if let Some(blocked) = smart_app_control_install_block(locale).await? {
        return Ok(blocked);
    }
    let update = check_gamebar_widget_update().await?;
    let latest_version = update.latest_version.clone().ok_or_else(|| {
        update
            .error
            .unwrap_or_else(|| "无法获取 Widget 最新版本".to_string())
    })?;
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
        locale,
    )
    .await?;

    emit_progress(
        &app,
        "extracting",
        0,
        None,
        Some(if locale == "en-US" {
            "Extracting the package…"
        } else {
            "正在解压安装包…"
        }),
    );
    extract_widget_zip(&zip_path, &extract_dir)?;

    install_from_prepared_root(&app, &extract_dir, locale).await
}

#[tauri::command]
pub async fn install_gamebar_widget_from_local(
    app: AppHandle,
    source_path: String,
    locale: Option<String>,
) -> Result<GameBarWidgetInstallResult, String> {
    let locale = normalize_app_locale(locale.as_deref());
    if let Some(blocked) = smart_app_control_install_block(locale).await? {
        return Ok(blocked);
    }
    let source = PathBuf::from(source_path.trim());
    emit_progress(
        &app,
        "extracting",
        0,
        None,
        Some(if locale == "en-US" {
            "Preparing the local package…"
        } else {
            "正在准备本地安装包…"
        }),
    );
    let install_root = prepare_local_install_root(&source)?;
    install_from_prepared_root(&app, &install_root, locale).await
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeVerificationJson {
    success: bool,
    runtime_state: String,
    issue_code: Option<String>,
    required_action: Option<String>,
    retryable: bool,
    message: String,
    code_integrity_event: Option<CodeIntegrityBlockEvent>,
}

#[tauri::command]
pub async fn repair_gamebar_widget_connection(
) -> Result<GameBarWidgetConnectionRepairResult, String> {
    #[cfg(windows)]
    {
        let Some((_, family_name)) = query_installed_package() else {
            return Ok(GameBarWidgetConnectionRepairResult {
                success: false,
                loopback_state: "missing".to_string(),
                issue_code: Some("notInstalled".to_string()),
                required_action: Some("installWidget".to_string()),
                retryable: true,
                message: "尚未安装 Widget".to_string(),
                error: None,
            });
        };

        let initial = query_loopback_status(&family_name);
        if initial.state == "configured" {
            return Ok(GameBarWidgetConnectionRepairResult {
                success: true,
                loopback_state: "configured".to_string(),
                issue_code: None,
                required_action: Some("none".to_string()),
                retryable: true,
                message: "小组件本机连接已配置".to_string(),
                error: None,
            });
        }

        let workspace = widget_workspace_root()?;
        std::fs::create_dir_all(&workspace)
            .map_err(|error| format!("创建 Widget 连接修复目录失败: {error}"))?;
        let script_path = workspace.join("repair-loopback.ps1");
        let log_path = workspace.join("repair-loopback.log");
        let escaped_family = family_name.replace('\'', "''");
        let escaped_log = log_path.to_string_lossy().replace('\'', "''");
        let script = format!(
            r#"$ErrorActionPreference = 'Continue'
$family = '{escaped_family}'
$logPath = '{escaped_log}'
function Write-RepairLog([string]$Message) {{
  Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8 -ErrorAction SilentlyContinue
}}
function Get-LoopbackState {{
  $out = @(& CheckNetIsolation.exe LoopbackExempt -s 2>&1)
  $exitCode = $LASTEXITCODE
  $text = ($out -join ' ').Trim()
  if ($exitCode -ne 0) {{ return 'unknown' }}
  if ($text -match [regex]::Escape($family)) {{ return 'configured' }}
  if (-not $text -or $text -match '(?i)Unable to load string message') {{ return 'unknown' }}
  return 'missing'
}}
Write-RepairLog "Repair started for $family"
for ($attempt = 1; $attempt -le 2; $attempt++) {{
  $output = & CheckNetIsolation.exe LoopbackExempt -a -n="$family" 2>&1
  $exitCode = $LASTEXITCODE
  Write-RepairLog "Add attempt $attempt exit=$exitCode output=$($output -join ' ')"
  for ($probe = 0; $probe -lt 10; $probe++) {{
    $state = Get-LoopbackState
    if ($state -eq 'configured') {{
      Write-RepairLog 'Loopback exemption verified'
      exit 0
    }}
    if ($state -eq 'unknown' -and $exitCode -eq 0) {{
      Write-RepairLog 'Loopback add succeeded, but verification output is unavailable'
      exit 2
    }}
    Start-Sleep -Milliseconds 300
  }}
}}
Write-RepairLog 'Loopback exemption could not be verified'
exit 1
"#
        );
        write_utf8_bom_text_file(&script_path, &script)?;

        let exit_code = tauri::async_runtime::spawn_blocking({
            let script_path = script_path.clone();
            let log_path = log_path.clone();
            move || run_elevated_powershell_file(&script_path, &log_path)
        })
        .await
        .map_err(|error| format!("Widget 连接修复任务失败: {error}"))??;

        if exit_code == 1223 {
            return Ok(GameBarWidgetConnectionRepairResult {
                success: false,
                loopback_state: initial.state.to_string(),
                issue_code: Some("uacCancelled".to_string()),
                required_action: Some("retry".to_string()),
                retryable: true,
                message: "已取消管理员授权，记录仍会继续；需要时可重新尝试连接修复。".to_string(),
                error: None,
            });
        }

        let verified = query_loopback_status(&family_name);
        if exit_code == 0 && verified.state == "configured" {
            return Ok(GameBarWidgetConnectionRepairResult {
                success: true,
                loopback_state: "configured".to_string(),
                issue_code: None,
                required_action: Some("none".to_string()),
                retryable: true,
                message: "小组件本机连接已自动修复".to_string(),
                error: None,
            });
        }

        if exit_code == 2 && verified.state == "unknown" {
            return Ok(GameBarWidgetConnectionRepairResult {
                success: true,
                loopback_state: "unknown".to_string(),
                issue_code: None,
                required_action: Some("none".to_string()),
                retryable: true,
                message: "本机连接配置命令已成功执行，但 Windows 无法返回可读取的验证结果。"
                    .to_string(),
                error: verified.error,
            });
        }

        let error = verified.error.or_else(|| {
            Some(format!(
                "CheckNetIsolation repair exited with code {exit_code}; log={}",
                log_path.display()
            ))
        });
        Ok(GameBarWidgetConnectionRepairResult {
            success: false,
            loopback_state: verified.state.to_string(),
            issue_code: Some("loopbackRepairFailed".to_string()),
            required_action: Some("retryOrReinstall".to_string()),
            retryable: true,
            message: "自动修复小组件本机连接失败，请稍后重试；持续失败时再重新安装小组件。"
                .to_string(),
            error,
        })
    }
    #[cfg(not(windows))]
    {
        Err("Widget 本机连接修复仅支持 Windows".to_string())
    }
}

#[tauri::command]
pub fn open_smart_app_control_settings() -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("explorer.exe")
            .arg("windowsdefender://AppBrowser")
            .spawn()
            .map_err(|e| format!("无法打开 Windows 安全中心: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("Smart App Control 设置仅适用于 Windows".to_string())
    }
}

#[tauri::command]
pub async fn verify_gamebar_widget_runtime(
) -> Result<GameBarWidgetRuntimeVerificationResult, String> {
    #[cfg(windows)]
    {
        let Some((version, _)) = query_installed_package() else {
            return Ok(GameBarWidgetRuntimeVerificationResult {
                success: false,
                runtime_state: "notInstalled".to_string(),
                issue_code: Some("notInstalled".to_string()),
                required_action: Some("installWidget".to_string()),
                retryable: true,
                message: "尚未安装 Widget".to_string(),
                code_integrity_event: None,
            });
        };
        let escaped_version = version.replace('\'', "''");
        let script = format!(
            r#"$ErrorActionPreference = 'SilentlyContinue'
$started = Get-Date
$version = '{escaped_version}'
$thumbprint = '{WIDGET_CERT_THUMBPRINT}'
$sac = 'unknown'
if ([Environment]::OSVersion.Version.Build -lt 22000) {{ $sac = 'notApplicable' }} else {{
  try {{
    $sacValue = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -Name VerifiedAndReputablePolicyState -ErrorAction Stop).VerifiedAndReputablePolicyState
    $sac = switch ([int]$sacValue) {{ 0 {{ 'off' }} 1 {{ 'on' }} 2 {{ 'evaluation' }} default {{ 'unknown' }} }}
  }} catch {{}}
}}
if ($sac -eq 'on') {{
  [ordered]@{{ success=$false; runtimeState='blockedBySmartAppControl'; issueCode='smartAppControlOn'; requiredAction='openSmartAppControlSettings'; retryable=$true; message='Smart App Control is on and blocks this self-signed Widget.'; codeIntegrityEvent=$null }} | ConvertTo-Json -Depth 6 -Compress
  exit 0
}}
$wdac = 'unknown'
try {{
  $dg = Get-CimInstance -Namespace 'root\Microsoft\Windows\DeviceGuard' -ClassName Win32_DeviceGuard -ErrorAction Stop
  $wdac = switch ([int]$dg.CodeIntegrityPolicyEnforcementStatus) {{ 0 {{ 'off' }} 1 {{ 'audit' }} 2 {{ 'enforced' }} default {{ 'unknown' }} }}
}} catch {{}}
$pkg = Get-AppxPackage -Name '{WIDGET_PACKAGE_NAME}' | Select-Object -First 1
function Get-CurrentWidgetProcess {{
  param($Package)
  if (-not $Package) {{ return $null }}
  try {{ $packageRoot = [IO.Path]::GetFullPath([string]$Package.InstallLocation).TrimEnd('\') + '\' }} catch {{ return $null }}
  foreach ($candidate in @(Get-Process -Name 'CSMatchHelperWidget' -ErrorAction SilentlyContinue)) {{
    try {{
      $candidatePath = [IO.Path]::GetFullPath([string]$candidate.Path)
      if ($candidatePath.StartsWith($packageRoot, [StringComparison]::OrdinalIgnoreCase)) {{ return $candidate }}
    }} catch {{}}
  }}
  return $null
}}
for ($attempt = 0; $attempt -lt 20; $attempt++) {{
  if (Get-CurrentWidgetProcess -Package $pkg) {{
    $markerDir = Join-Path $env:LOCALAPPDATA 'CSMatchHelper\gamebar-widget'
    New-Item -ItemType Directory -Force -Path $markerDir | Out-Null
    [ordered]@{{ version=$version; thumbprint=$thumbprint; verifiedAt=(Get-Date).ToUniversalTime().ToString('o') }} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $markerDir 'runtime-verified.json') -Encoding UTF8
    Remove-Item -LiteralPath (Join-Path $markerDir 'installed.pending') -Force -ErrorAction SilentlyContinue
    [ordered]@{{ success=$true; runtimeState='running'; issueCode=$null; requiredAction='none'; retryable=$true; message='Widget process detected. Runtime verification passed.'; codeIntegrityEvent=$null }} | ConvertTo-Json -Depth 6 -Compress
    exit 0
  }}
  $event = Get-WinEvent -FilterHashtable @{{ LogName='Microsoft-Windows-CodeIntegrity/Operational'; Id=3033,3077; StartTime=$started }} -MaxEvents 100 |
    Where-Object {{ $_.Message -match 'CSMatchHelperWidget|CSMatchHelper\.GameBarWidget' }} | Select-Object -First 1
  if ($event) {{
    $message = ([string]$event.Message -replace '\s+', ' ').Trim()
    if ($message.Length -gt 800) {{ $message = $message.Substring(0, 800) }}
    $target = [regex]::Match($message, '[A-Za-z]:\\[^\"\r\n]+?\.(exe|dll)').Value
    $eventData = [ordered]@{{ eventId=[int]$event.Id; timeCreated=$event.TimeCreated.ToUniversalTime().ToString('o'); targetFile=$(if ($target) {{ $target }} else {{ $null }}); message=$message }}
    $action = if ($wdac -eq 'enforced') {{ 'contactAdministrator' }} else {{ 'reviewCodeIntegrityPolicy' }}
    [ordered]@{{ success=$false; runtimeState='blockedByCodeIntegrity'; issueCode='codeIntegrityBlocked'; requiredAction=$action; retryable=($wdac -ne 'enforced'); message='Windows Code Integrity blocked the Widget process.'; codeIntegrityEvent=$eventData }} | ConvertTo-Json -Depth 6 -Compress
    exit 0
  }}
  Start-Sleep -Seconds 1
}}
[ordered]@{{ success=$false; runtimeState='installedUnverified'; issueCode='runtimeNotDetected'; requiredAction='openGameBarAndRetry'; retryable=$true; message='Widget process was not detected within 20 seconds.'; codeIntegrityEvent=$null }} | ConvertTo-Json -Depth 6 -Compress"#
        );
        let raw = tauri::async_runtime::spawn_blocking(move || run_powershell(&script))
            .await
            .map_err(|e| format!("运行验证任务失败: {e}"))??;
        let parsed: RuntimeVerificationJson =
            parse_json_allow_bom(raw.lines().last().unwrap_or(&raw))
                .map_err(|e| format!("解析运行验证结果失败: {e}"))?;
        Ok(GameBarWidgetRuntimeVerificationResult {
            success: parsed.success,
            runtime_state: parsed.runtime_state,
            issue_code: parsed.issue_code,
            required_action: parsed.required_action,
            retryable: parsed.retryable,
            message: parsed.message,
            code_integrity_event: parsed.code_integrity_event,
        })
    }
    #[cfg(not(windows))]
    {
        Err("Game Bar Widget 运行验证仅支持 Windows".to_string())
    }
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
            r#"$ErrorActionPreference = 'Stop'
$names = @({names})
foreach ($name in $names) {{
  Get-AppxPackage -Name $name -ErrorAction SilentlyContinue | ForEach-Object {{
    CheckNetIsolation LoopbackExempt -d -n="$($_.PackageFamilyName)" 2>$null
    Remove-AppxPackage -Package $_.PackageFullName -ErrorAction Stop
  }}
}}
Get-ChildItem Cert:\LocalMachine\TrustedPeople -ErrorAction SilentlyContinue |
  Where-Object {{ (($_.Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()) -eq '{WIDGET_CERT_THUMBPRINT}' }} |
  Remove-Item -Force -ErrorAction Stop
$markerDir = Join-Path $env:LOCALAPPDATA 'CSMatchHelper\gamebar-widget'
if (Test-Path -LiteralPath $markerDir) {{
  Remove-Item -LiteralPath (Join-Path $markerDir 'runtime-verified.json') -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $markerDir 'installed.pending') -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $markerDir 'install.ok') -Force -ErrorAction SilentlyContinue
}}"#
        );
        let workspace = widget_workspace_root()?;
        std::fs::create_dir_all(&workspace).map_err(|e| format!("创建卸载工作目录失败: {e}"))?;
        let uninstall_path = workspace.join("run-uninstall.ps1");
        let log_path = workspace.join("uninstall.log");
        write_utf8_bom_text_file(&uninstall_path, &script)?;
        let exit_code = run_elevated_powershell_file(&uninstall_path, &log_path)?;
        if exit_code != 0 {
            return Err(format!(
                "Widget 卸载失败（{}）",
                describe_process_exit_code(exit_code)
            ));
        }
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
        build_bootstrap_failure_message, build_widget_zip_cdn_url, describe_process_exit_code,
        display_widget_version, is_newer_version, merge_install_log_excerpts, parse_json_allow_bom,
        parse_loopback_probe_output, parse_version_parts, parse_widget_version_from_cdn_hint,
        parse_widget_version_from_zip_name, resolve_runtime_state, EndUserInstallArtifacts,
        InstallIssueJson,
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
    fn parse_widget_version_from_cdn_hint_matches_website_fallback() {
        assert_eq!(
            parse_widget_version_from_cdn_hint(
                "The requested file was not found in version v1.3.1"
            )
            .as_deref(),
            Some("1.3.1")
        );
        assert_eq!(
            parse_widget_version_from_cdn_hint("not found in version 2.0"),
            Some("2.0".to_string())
        );
        assert_eq!(
            parse_widget_version_from_cdn_hint("HTTP 404 Not Found"),
            None
        );
    }

    #[test]
    fn parse_version_parts_handles_prefix_and_suffix() {
        assert_eq!(parse_version_parts("v2.2.0"), vec![2, 2, 0]);
        assert_eq!(parse_version_parts("1.0.1.0"), vec![1, 0, 1, 0]);
    }

    #[test]
    fn display_version_hides_the_msix_revision_segment() {
        assert_eq!(display_widget_version("1.3.0.0"), "1.3.0");
        assert_eq!(display_widget_version("v1.3.0"), "1.3.0");
        assert_eq!(display_widget_version("1.3.0.7"), "1.3.0.7");
    }

    #[test]
    fn is_newer_version_compares_semver_like_parts() {
        assert!(is_newer_version("2.3.0", "2.2.0"));
        assert!(!is_newer_version("2.2.0", "2.2.0"));
        assert!(is_newer_version("2.2.1", "2.2.0"));
        assert!(!is_newer_version("1.0.1.0", "2.2.0"));
    }

    #[test]
    fn loopback_probe_keeps_unreadable_system_output_unknown() {
        let configured = parse_loopback_probe_output("configured");
        assert_eq!(configured.state, "configured");
        assert!(configured.error.is_none());

        let missing = parse_loopback_probe_output("missing");
        assert_eq!(missing.state, "missing");

        let unknown = parse_loopback_probe_output(
            "unknown|CheckNetIsolation returned unreadable output: Unable to load string message",
        );
        assert_eq!(unknown.state, "unknown");
        assert!(unknown
            .error
            .as_deref()
            .is_some_and(|message| message.contains("Unable to load string message")));
    }

    #[test]
    fn runtime_state_uses_current_process_before_historical_code_integrity_events() {
        assert_eq!(
            resolve_runtime_state(true, "on", false, false, true),
            ("blockedBySmartAppControl", false)
        );
        assert_eq!(
            resolve_runtime_state(true, "off", true, true, true),
            ("running", true)
        );
        assert_eq!(
            resolve_runtime_state(true, "off", true, false, true),
            ("blockedByCodeIntegrity", false)
        );
    }

    #[test]
    fn runtime_state_requires_install_and_runtime_evidence() {
        assert_eq!(
            resolve_runtime_state(false, "off", false, true, true),
            ("notInstalled", false)
        );
        assert_eq!(
            resolve_runtime_state(true, "off", false, false, false),
            ("installedUnverified", false)
        );
        assert_eq!(
            resolve_runtime_state(true, "off", false, true, false),
            ("running", true)
        );
    }

    #[test]
    fn structured_install_artifacts_accept_powershell_utf8_bom() {
        let parsed: InstallIssueJson = parse_json_allow_bom(
            "\u{feff}{\"issueCode\":\"dependencyInUse\",\"blockingPackages\":[\"Microsoft.ScreenSketch_1.0.0.0_x64__8wekyb3d8bbwe\"]}",
        )
        .expect("PowerShell JSON with BOM should parse");
        assert_eq!(parsed.issue_code.as_deref(), Some("dependencyInUse"));
        assert_eq!(parsed.blocking_packages.len(), 1);
    }

    #[test]
    fn cdn_url_uses_release_hash_as_cache_key() {
        let hash = "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";
        let url =
            build_widget_zip_cdn_url("1.3.0", "CSMatchHelperGameBarWidget-1.3.0.zip", Some(hash));
        assert!(url.ends_with("&sha=abcdef012345"));
    }

    #[test]
    fn merge_install_log_excerpts_combines_wrapper_and_end_user_logs() {
        let end_user = EndUserInstallArtifacts {
            fail_message: None,
            log_excerpt: Some("end-user log".to_string()),
            ok_version: None,
            issue_code: None,
            required_action: None,
            retryable: None,
            blocking_packages: Vec::new(),
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
