#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install CS Match Helper Game Bar Widget (local dev only)
#>
param(
    [ValidateSet('auto', 'zh-CN', 'en-US')]
    [string]$Language = 'auto'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallLocale = if ($Language -eq 'auto') {
    if ([Globalization.CultureInfo]::CurrentUICulture.Name -like 'zh-*') { 'zh-CN' } else { 'en-US' }
} else { $Language }
function L { param([string]$Zh, [string]$En) if ($InstallLocale -eq 'en-US') { $En } else { $Zh } }

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $Root 'CSMatchHelperWidget'
$SolutionPath = Join-Path $Root 'CSMatchHelperWidget.sln'

Write-Host (L '==> 正在启用开发者模式…' '==> Enabling Developer Mode…')
$devKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock'
if (-not (Test-Path $devKey)) {
    New-Item -Path $devKey -Force | Out-Null
}
Set-ItemProperty -Path $devKey -Name 'AllowDevelopmentWithoutDevLicense' -Value 1 -Type DWord

Write-Host (L '==> 正在查找 MSBuild…' '==> Locating MSBuild…')
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
    throw (L '未找到 MSBuild。请安装 Visual Studio 的 UWP 工作负载。' 'MSBuild not found. Install Visual Studio with the UWP workload.')
}

$netCoreRefPath = "${env:ProgramFiles(x86)}\Reference Assemblies\Microsoft\Framework\.NETCore\v5.0"
if (-not (Test-Path $netCoreRefPath)) {
    throw (L "缺少 UWP 引用程序集：$netCoreRefPath`n`n请安装 Visual Studio 组件：`n  工作负载：通用 Windows 平台开发" "Missing UWP reference assemblies: $netCoreRefPath`n`nInstall the Visual Studio component:`n  Workload: Universal Windows Platform development")
}

Write-Host (L "==> 正在使用以下 MSBuild 构建 Widget：$msbuild" "==> Building the Widget with: $msbuild")
Write-Host (L '==> 正在从主程序同步 Widget 图标…' '==> Syncing Widget icons from the main app…')
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
    throw (L "MSBuild 失败，退出码 $LASTEXITCODE" "MSBuild failed with exit code $LASTEXITCODE")
}

$builtManifest = Join-Path $ProjectDir 'bin\x64\Debug\AppxManifest.xml'
if (-not (Test-Path $builtManifest)) {
    throw (L "未找到构建产物：$builtManifest" "Build output not found: $builtManifest")
}

Write-Host (L '==> 正在移除旧包（如有）…' '==> Removing the previous package, if present…')
@('CSMatchHelper.GameBarWidget', 'CSMatchHelper.CounterStrafingHudWidget') | ForEach-Object {
    Get-AppxPackage -Name $_ -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName }
}

Write-Host (L '==> 正在注册 Widget（散装文件）…' '==> Registering the Widget from loose files…')
Add-AppxPackage -Register $builtManifest -ForceApplicationShutdown

$pkg = Get-AppxPackage -Name 'CSMatchHelper.GameBarWidget'
if (-not $pkg) {
    $pkg = Get-AppxPackage -Name 'CSMatchHelper.CounterStrafingHudWidget'
}
if (-not $pkg) {
    throw (L '注册失败：未找到 Widget 包' 'Registration failed: Widget package not found')
}

$packageFamilyName = $pkg.PackageFamilyName
Write-Host (L "==> 正在添加本地回环豁免：$packageFamilyName" "==> Adding loopback exemption: $packageFamilyName")
CheckNetIsolation LoopbackExempt -a -n="$packageFamilyName"

Write-Host ''
Write-Host (L '完成。' 'Done.')
Write-Host (L '1. 启动 CS 匹配助手并开始急停记录' '1. Start CS Match Helper and begin counter-strafing recording')
Write-Host (L '2. 在游戏中按 Win+G 打开 Xbox 游戏栏' '2. In game, press Win+G to open Xbox Game Bar')
Write-Host (L '3. 固定小组件：CS 匹配助手' '3. Pin the CS Match Helper widget')
