<#
.SYNOPSIS
  Package gamebar-widget/dist install payload into a versioned zip for CDN/GitHub Release.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistDir = Join-Path $Root 'dist'
$ReleaseDir = Join-Path (Split-Path -Parent $Root) 'release'
$WidgetReleaseDir = Join-Path $ReleaseDir 'gamebar-widget'
$WidgetVersionPath = Join-Path $Root 'widget-version.json'

if (-not (Test-Path $DistDir)) {
    throw "Missing dist folder: $DistDir`nRun build-release.ps1 first."
}

$msix = Get-ChildItem -Path $DistDir -Filter '*.msix' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $msix) {
    $msix = Get-ChildItem -Path $DistDir -Filter '*.appx' -File -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (-not $msix) {
    throw "No CSMatchHelperWidget.msix/.appx in $DistDir"
}

$cerPath = Join-Path $DistDir 'CSMatchHelperWidget.cer'
$installPath = Join-Path $DistDir 'install.ps1'
if (-not (Test-Path $cerPath)) {
    throw "Missing certificate: $cerPath"
}
if (-not (Test-Path $installPath)) {
    throw "Missing install.ps1: $installPath"
}

$version = '1.0.0'
if (Test-Path $WidgetVersionPath) {
    $widgetVersion = Get-Content $WidgetVersionPath -Raw | ConvertFrom-Json
    if ($widgetVersion.version) { $version = [string]$widgetVersion.version }
}

$zipName = "CSMatchHelperGameBarWidget-$version.zip"
$zipPath = Join-Path $DistDir $zipName
$releaseZipPath = Join-Path $WidgetReleaseDir $zipName

Get-ChildItem -Path $DistDir -Filter 'CSMatchHelperGameBarWidget-*.zip' -File -ErrorAction SilentlyContinue |
    Remove-Item -Force
Get-ChildItem -Path $DistDir -Filter 'latest.json' -File -ErrorAction SilentlyContinue |
    Remove-Item -Force
Get-ChildItem -Path $DistDir -Filter '*.sha256.txt' -File -ErrorAction SilentlyContinue |
    Remove-Item -Force

New-Item -ItemType Directory -Force -Path $WidgetReleaseDir | Out-Null
Get-ChildItem -Path $WidgetReleaseDir -Filter 'latest.json' -File -ErrorAction SilentlyContinue |
    Remove-Item -Force
Get-ChildItem -Path $WidgetReleaseDir -Filter '*.sha256.txt' -File -ErrorAction SilentlyContinue |
    Remove-Item -Force
Get-ChildItem -Path $WidgetReleaseDir -Filter 'CSMatchHelperGameBarWidget-*.zip' -File -ErrorAction SilentlyContinue |
    Remove-Item -Force

$staging = Join-Path $env:TEMP "csmh-widget-pack-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $staging | Out-Null
try {
    Copy-Item -Path $msix.FullName -Destination (Join-Path $staging $msix.Name) -Force
    Copy-Item -Path $cerPath -Destination (Join-Path $staging 'CSMatchHelperWidget.cer') -Force
    Copy-Item -Path $installPath -Destination (Join-Path $staging 'install.ps1') -Force
    $depSource = Join-Path $DistDir 'Dependencies'
    if (Test-Path $depSource) {
        Copy-Item -Path $depSource -Destination (Join-Path $staging 'Dependencies') -Recurse -Force
    }
    Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
    Copy-Item -Path $zipPath -Destination $releaseZipPath -Force
}
finally {
    Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue
}

$hashHex = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Widget zip: $zipPath"
Write-Host "Release copy: $releaseZipPath"
Write-Host "SHA256 (CDN header only): $hashHex"
