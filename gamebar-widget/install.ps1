#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install CS Match Helper Game Bar Widget (local dev only)
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $Root 'CSMatchHelperWidget'
$SolutionPath = Join-Path $Root 'CSMatchHelperWidget.sln'

Write-Host '==> Enable Developer Mode...'
$devKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
if (-not (Test-Path $devKey)) {
    New-Item -Path $devKey -Force | Out-Null
}
Set-ItemProperty -Path $devKey -Name 'AllowDevelopmentWithoutDevLicense' -Value 1 -Type DWord

Write-Host '==> Locate MSBuild...'
$msbuild = $null
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) {
    $msbuild = & $vswhere -latest -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' |
        Select-Object -First 1
}

if (-not $msbuild) {
    $candidates = @(
        "$env:ProgramFiles\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\MSBuild.exe"
    )
    $msbuild = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $msbuild) {
    throw 'MSBuild not found. Install Visual Studio with UWP workload.'
}

$netCoreRefPath = "${env:ProgramFiles(x86)}\Reference Assemblies\Microsoft\Framework\.NETCore\v5.0"
if (-not (Test-Path $netCoreRefPath)) {
    throw @"
Missing UWP reference assemblies: $netCoreRefPath

Install Visual Studio component:
  Workload: "Universal Windows Platform development" (通用 Windows 平台开发)
"@
}

Write-Host "==> Build Widget with: $msbuild"
Write-Host '==> Sync widget icons from main app...'
& (Join-Path $Root 'sync-widget-icons.ps1')

$buildArgs = @(
    $SolutionPath,
    '/p:Configuration=Debug',
    '/p:Platform=x64',
    '/restore',
    '/v:minimal'
)
& $msbuild @buildArgs
if ($LASTEXITCODE -ne 0) {
    throw "MSBuild failed with exit code $LASTEXITCODE"
}

$builtManifest = Join-Path $ProjectDir 'bin\x64\Debug\AppxManifest.xml'
if (-not (Test-Path $builtManifest)) {
    throw "Build output not found: $builtManifest"
}

Write-Host '==> Remove previous package (if any)...'
@('CSMatchHelper.GameBarWidget', 'CSMatchHelper.CounterStrafingHudWidget') | ForEach-Object {
    Get-AppxPackage -Name $_ -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName }
}

Write-Host '==> Register widget (loose-file)...'
Add-AppxPackage -Register $builtManifest -ForceApplicationShutdown

$pkg = Get-AppxPackage -Name 'CSMatchHelper.GameBarWidget'
if (-not $pkg) {
    $pkg = Get-AppxPackage -Name 'CSMatchHelper.CounterStrafingHudWidget'
}
if (-not $pkg) {
    throw 'Registration failed: package not found'
}

$packageFamilyName = $pkg.PackageFamilyName
Write-Host "==> Add loopback exemption: $packageFamilyName"
CheckNetIsolation LoopbackExempt -a -n="$packageFamilyName"

Write-Host ''
Write-Host 'Done.'
Write-Host '1. Start CS Match Helper and begin counter-strafing recording'
Write-Host '2. In game press Win+G to open Xbox Game Bar'
Write-Host '3. Pin widget: CS 匹配助手'
