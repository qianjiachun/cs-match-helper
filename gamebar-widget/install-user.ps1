#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install CS Match Helper Game Bar Widget (end user, pre-built package).
  Place this script next to CSMatchHelperWidget.msix and .cer, then run as Admin.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

function Test-InstallConsoleEmojiSupport {
    # 应用内提权安装通常弹出经典 powershell.exe + conhost，中文系统多为 GBK，emoji 易乱码。
    # 仅在较新终端（Windows Terminal / PS 7+ / UTF-8 控制台）下启用 emoji。
    try {
        if ($env:WT_SESSION) { return $true }
        if ($PSVersionTable.PSEdition -eq 'Core') { return $true }
        if ([Console]::OutputEncoding.CodePage -eq 65001) {
            $build = [Environment]::OSVersion.Version.Build
            if ($build -ge 19041) { return $true }
        }
    } catch { }
    return $false
}

function New-InstallGlyphSet {
    if (Test-InstallConsoleEmojiSupport) {
        return [pscustomobject]@{
            Game     = '🎮 '
            Wait     = '⏳ '
            Retry    = '🔄 '
            Done     = '✅ '
            Tip      = '💡 '
            Fail     = '❌ '
            Guide    = '📋 '
            Chat     = '💬 '
            Target   = '🎯 '
            Party    = ' 🎉'
            Step     = '▸ '
            StepDone = '✅ '
            Divider  = '  ─────────────────────────────────'
            Rule     = '  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            Bullet   = '     · '
        }
    }

    return [pscustomobject]@{
        Game     = '>> '
        Wait     = '[~] '
        Retry    = '[!] '
        Done     = '[OK] '
        Tip      = '[*] '
        Fail     = '[X] '
        Guide    = '    '
        Chat     = '    '
        Target   = '>> '
        Party    = ''
        Step     = '> '
        StepDone = '[OK] '
        Divider  = '  ---------------------------------'
        Rule     = '  ================================='
        Bullet   = '     - '
    }
}

$InstallGlyphs = New-InstallGlyphSet

$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CerPath = Join-Path $Dir 'CSMatchHelperWidget.cer'
$AppxPath = @(
    (Join-Path $Dir 'CSMatchHelperWidget.msix'),
    (Join-Path $Dir 'CSMatchHelperWidget.appx')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$PackageName = 'CSMatchHelper.GameBarWidget'
$LegacyPackageNames = @(
    'CSMatchHelper.CounterStrafingHudWidget'
)
$MarkerDir = Join-Path $env:LOCALAPPDATA 'CSMatchHelper\gamebar-widget'
$MarkerPath = Join-Path $MarkerDir 'install.ok'
$FailPath = Join-Path $MarkerDir 'install.fail'
$LogPath = Join-Path $MarkerDir 'install.log'

function Write-InstallLog {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $LogPath -Value "[$timestamp] $Message" -Encoding utf8
}

function Show-InstallWelcome {
    try {
        $Host.UI.RawUI.WindowTitle = 'CS 匹配助手 - 小组件安装'
    } catch { }

    Write-Host ''
    Write-Host "  $($InstallGlyphs.Game)CS 匹配助手 · 游戏内小组件安装" -ForegroundColor Cyan
    Write-Host $InstallGlyphs.Divider -ForegroundColor DarkGray
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Wait)正在安装，请保持此窗口开启。" -ForegroundColor White
    Write-Host '     通常需要 1–3 分钟，完成后窗口会自动关闭。' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Tip)若中途出现系统提示（例如「资源正在使用」），属于正常现象，" -ForegroundColor DarkYellow
    Write-Host '     请勿关闭窗口，耐心等待即可。' -ForegroundColor DarkYellow
    Write-Host ''
}

function Write-InstallStep {
    param(
        [string]$Message,
        [ValidateSet('default', 'wait', 'retry', 'done')]
        [string]$Kind = 'default'
    )

    $icon = switch ($Kind) {
        'wait'  { $InstallGlyphs.Wait }
        'retry' { $InstallGlyphs.Retry }
        'done'  { $InstallGlyphs.StepDone }
        default { $InstallGlyphs.Step }
    }
    $color = switch ($Kind) {
        'wait'  { 'Yellow' }
        'retry' { 'DarkYellow' }
        'done'  { 'Green' }
        default { 'Cyan' }
    }
    Write-Host "  $icon $Message" -ForegroundColor $color
}

function Show-InstallSuccess {
    param([string]$Version)

    Write-Host ''
    Write-Host $InstallGlyphs.Rule -ForegroundColor DarkGray
    Write-Host "  $($InstallGlyphs.Done)" -NoNewline -ForegroundColor Green
    Write-Host '安装完成！' -NoNewline -ForegroundColor Green
    if ($Version) {
        Write-Host "  v$Version" -ForegroundColor DarkGray
    } else {
        Write-Host ''
    }
    Write-Host $InstallGlyphs.Rule -ForegroundColor DarkGray
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Target)接下来你可以：" -ForegroundColor White
    Write-Host "$($InstallGlyphs.Bullet)关闭此窗口，回到 CS 匹配助手" -ForegroundColor DarkGray
    Write-Host "$($InstallGlyphs.Bullet)游戏中按 " -NoNewline -ForegroundColor DarkGray
    Write-Host 'Win+G' -NoNewline -ForegroundColor Cyan
    Write-Host " 打开游戏栏，固定小组件$($InstallGlyphs.Party)" -ForegroundColor DarkGray
    Write-Host ''
}

function Show-InstallFailure {
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Fail)安装未能完成" -ForegroundColor Red
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Guide)请关闭此窗口，回到 CS 匹配助手查看提示或重试。" -ForegroundColor DarkGray
    Write-Host "  $($InstallGlyphs.Chat)若多次失败，可在应用内复制诊断信息以便反馈。" -ForegroundColor DarkGray
    Write-Host ''
}

function Write-InstallDetail {
    param([string]$Message)
    Write-InstallLog -Message $Message
}

function Write-InstallFailure {
    param([string]$Message)
    New-Item -ItemType Directory -Force -Path $MarkerDir | Out-Null
    Set-Content -Path $FailPath -Value $Message -Encoding utf8
}

function Format-InstallError {
    param($ErrorRecord)
    $msg = [string]$ErrorRecord.Exception.Message
    if ($ErrorRecord.FullyQualifiedErrorId) {
        $msg = "$msg [$($ErrorRecord.FullyQualifiedErrorId)]"
    }
    if ($ErrorRecord.Exception.HResult) {
        $hr = '0x{0:X8}' -f ($ErrorRecord.Exception.HResult -band 0xFFFFFFFF)
        if ($msg -notmatch $hr) {
            $msg = "$msg (HRESULT $hr)"
        }
    }
    if ($ErrorRecord.Exception.Data -and $ErrorRecord.Exception.Data['ActivityId']) {
        $activityId = [guid]$ErrorRecord.Exception.Data['ActivityId']
        $appxLog = Get-AppPackageLog -ActivityID $activityId -ErrorAction SilentlyContinue |
            Select-Object -Last 1
        if ($appxLog -and $appxLog.FullMessage) {
            $tail = ($appxLog.FullMessage -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 3) -join ' | '
            if ($tail) {
                $msg = "$msg`nAppX: $tail"
            }
        }
    }
    return $msg
}

function Test-CertificateTrusted {
    param([string]$CerFilePath)
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CerFilePath)
    $trusted = Get-ChildItem Cert:\LocalMachine\TrustedPeople -ErrorAction SilentlyContinue |
        Where-Object { $_.Thumbprint -eq $cert.Thumbprint } |
        Select-Object -First 1
    return [bool]$trusted
}

function Get-MissingDependencyPaths {
    param([string[]]$Paths)
    $missing = New-Object System.Collections.Generic.List[string]
    foreach ($depPath in $Paths) {
        $leaf = [System.IO.Path]::GetFileNameWithoutExtension($depPath)
        $alreadyInstalled = $false
        if ($leaf -like 'Microsoft.VCLibs*') {
            $alreadyInstalled = [bool](
                Get-AppxPackage -Name 'Microsoft.VCLibs' -ErrorAction SilentlyContinue | Select-Object -First 1
            )
        } elseif ($leaf -like 'Microsoft.NET.CoreRuntime*') {
            $alreadyInstalled = [bool](
                Get-AppxPackage -Name 'Microsoft.NET.CoreRuntime' -ErrorAction SilentlyContinue | Select-Object -First 1
            )
        } elseif ($leaf -like 'Microsoft.NET.CoreFramework*') {
            $alreadyInstalled = [bool](
                Get-AppxPackage -Name 'Microsoft.NET.CoreFramework' -ErrorAction SilentlyContinue | Select-Object -First 1
            )
        }
        if ($alreadyInstalled) {
            Write-InstallDetail -Message "Skip installed dependency: $leaf"
        } else {
            [void]$missing.Add($depPath)
        }
    }
    return @($missing)
}

function Get-AppxPackageVersionFromPath {
    param([Parameter(Mandatory = $true)][string]$PackagePath)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        $entry = $zip.Entries | Where-Object { $_.Name -eq 'AppxManifest.xml' } | Select-Object -First 1
        if (-not $entry) {
            throw "AppxManifest.xml not found in package: $PackagePath"
        }
        $stream = $entry.Open()
        try {
            $reader = New-Object System.IO.StreamReader($stream)
            try {
                $xml = [xml]$reader.ReadToEnd()
            } finally {
                $reader.Dispose()
            }
        } finally {
            $stream.Dispose()
        }
        return [version]$xml.Package.Identity.Version
    } finally {
        $zip.Dispose()
    }
}

function Test-SamePackageReinstallError {
    param($ErrorRecord)

    if ($ErrorRecord.Exception.HResult) {
        $hr = $ErrorRecord.Exception.HResult -band 0xFFFFFFFF
        if ($hr -eq 0x80073CFB) {
            return $true
        }
    }
    $msg = [string]$ErrorRecord.Exception.Message
    return (
        $msg -match '0x80073CFB' -or
        $msg -match '禁止重新安装该程序包' -or
        $msg -match '内容不相同'
    )
}

function Remove-InstalledWidgetPackages {
    param(
        [string[]]$Names = @($PackageName)
    )

    foreach ($name in $Names) {
        $packages = @(
            Get-AppxPackage -Name $name -AllUsers -ErrorAction SilentlyContinue
            Get-AppxPackage -Name $name -ErrorAction SilentlyContinue
        ) | Sort-Object PackageFullName -Unique

        foreach ($pkg in $packages) {
            Write-InstallDetail -Message "Removing: $($pkg.PackageFullName)"
            CheckNetIsolation LoopbackExempt -d -n="$($pkg.PackageFamilyName)" 2>$null
            try {
                Remove-AppxPackage -Package $pkg.PackageFullName -AllUsers -ErrorAction Stop
            } catch {
                Remove-AppxPackage -Package $pkg.PackageFullName
            }
        }

        Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq $name } |
            ForEach-Object {
                Write-InstallDetail -Message "Removing provisioned: $($_.PackageName)"
                Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue
            }
    }
}

function Invoke-AddAppxPackageAttempt {
    param(
        [hashtable]$Params,
        [switch]$ForceApplicationShutdown
    )

    $attempt = $Params.Clone()
    if ($ForceApplicationShutdown) {
        $attempt.ForceApplicationShutdown = $true
    }
    Add-AppxPackage @attempt
}

function Install-WidgetAppxPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string[]]$DependencyPaths = @(),
        [switch]$SkipSameVersionRemoval
    )

    Write-InstallDetail -Message "Package path: $Path"
    Write-InstallStep -Message '正在写入小组件文件，请稍候…' -Kind wait

    $params = @{
        Path                      = $Path
        ForceUpdateFromAnyVersion = $true
    }
    if ($DependencyPaths.Count -gt 0) {
        $params.DependencyPath = $DependencyPaths
    }

    # Faster path first: avoid ForceApplicationShutdown unless the package is in use.
    try {
        Invoke-AddAppxPackageAttempt -Params $params
        return
    } catch {
        if (-not $SkipSameVersionRemoval -and (Test-SamePackageReinstallError $_)) {
            Write-InstallStep -Message '检测到旧版本，正在清理后重新安装…' -Kind retry
            Write-InstallDetail -Message "Same-version reinstall: $($_.Exception.Message)"
            Remove-InstalledWidgetPackages -Names @($PackageName) + $LegacyPackageNames
            Install-WidgetAppxPackage -Path $Path -DependencyPaths $DependencyPaths -SkipSameVersionRemoval
            return
        }

        Write-InstallDetail -Message "Fast install failed, retrying with ForceApplicationShutdown: $($_.Exception.Message)"
        Write-InstallStep -Message '正在等待系统释放资源，稍后自动重试（约 1–3 分钟）…' -Kind retry
    }

    try {
        Invoke-AddAppxPackageAttempt -Params $params -ForceApplicationShutdown
    } catch {
        if (-not $SkipSameVersionRemoval -and (Test-SamePackageReinstallError $_)) {
            Write-InstallStep -Message '检测到旧版本，正在清理后重新安装…' -Kind retry
            Write-InstallDetail -Message "Same-version reinstall: $($_.Exception.Message)"
            Remove-InstalledWidgetPackages -Names @($PackageName) + $LegacyPackageNames
            Install-WidgetAppxPackage -Path $Path -DependencyPaths $DependencyPaths -SkipSameVersionRemoval
            return
        }
        throw
    }
}

function Test-LoopbackConfigured {
    param([string]$PackageFamilyName)
    $escaped = [regex]::Escape($PackageFamilyName)
    $out = CheckNetIsolation LoopbackExempt -s 2>$null
    return [bool]($out -match $escaped)
}

New-Item -ItemType Directory -Force -Path $MarkerDir | Out-Null
Remove-Item -Path $MarkerPath -Force -ErrorAction SilentlyContinue
Remove-Item -Path $FailPath -Force -ErrorAction SilentlyContinue
"=== Widget install started $(Get-Date -Format o) ===" | Set-Content -Path $LogPath -Encoding utf8

try {
    Show-InstallWelcome

    Write-InstallDetail -Message "Console emoji support: $(Test-InstallConsoleEmojiSupport)"

    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
    if (-not $isAdmin) {
        throw 'Administrator privileges are required to install the widget.'
    }

    Write-InstallDetail -Message "Windows: $([Environment]::OSVersion.VersionString)"
    Write-InstallDetail -Message "PowerShell: $($PSVersionTable.PSVersion)"
    Write-InstallDetail -Message "Install dir: $Dir"
    Write-InstallDetail -Message "Package: $(if ($AppxPath) { Split-Path -Leaf $AppxPath } else { 'missing' })"

    if (-not $AppxPath) {
        throw "Missing package in $Dir`nExpected CSMatchHelperWidget.msix or CSMatchHelperWidget.appx next to install.ps1"
    }
    if (-not (Test-Path $CerPath)) {
        throw "Missing certificate: $CerPath`nEnsure CSMatchHelperWidget.cer is in the same folder"
    }

    Write-InstallStep -Message '正在检查运行环境…' -Kind default

    $depDir = Join-Path $Dir 'Dependencies\x64'
    $dependencyPaths = @()
    if (Test-Path $depDir) {
        $allDeps = Get-ChildItem -Path $depDir -Filter '*.appx' | ForEach-Object { $_.FullName }
        $dependencyPaths = Get-MissingDependencyPaths -Paths $allDeps
    }
    Write-InstallDetail -Message "Dependencies to install: $($dependencyPaths.Count)"

    if (Test-CertificateTrusted -CerFilePath $CerPath) {
        Write-InstallDetail -Message 'Signing certificate already trusted, skip import'
    } else {
        Write-InstallStep -Message '正在配置安装证书…' -Kind default
        Import-Certificate -FilePath $CerPath -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
    }

    Write-InstallStep -Message '正在清理旧版本（如有）…' -Kind default
    foreach ($legacyName in $LegacyPackageNames) {
        Get-AppxPackage -Name $legacyName -ErrorAction SilentlyContinue |
            ForEach-Object {
                CheckNetIsolation LoopbackExempt -d -n="$($_.PackageFamilyName)" 2>$null
                Remove-AppxPackage -Package $_.PackageFullName
            }
    }

    $incomingVersion = Get-AppxPackageVersionFromPath -PackagePath $AppxPath
    Write-InstallDetail -Message "Incoming package version: $incomingVersion"

    $existingPkg = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingPkg -and $existingPkg.Version -eq $incomingVersion) {
        Write-InstallStep -Message "正在更新 v$incomingVersion…" -Kind wait
        Remove-InstalledWidgetPackages -Names @($PackageName)
    } elseif ($existingPkg -and (Test-LoopbackConfigured -PackageFamilyName $existingPkg.PackageFamilyName)) {
        Write-InstallStep -Message "正在从 v$($existingPkg.Version) 升级…" -Kind wait
        Write-InstallDetail -Message "Widget already installed v$($existingPkg.Version) with loopback, upgrading package"
    }

    Write-InstallStep -Message '正在安装小组件…' -Kind wait
    Install-WidgetAppxPackage -Path $AppxPath -DependencyPaths $dependencyPaths

    $pkg = Get-AppxPackage -Name $PackageName
    if (-not $pkg) {
        throw 'Installation failed: package not found after Add-AppxPackage'
    }

    if (-not (Test-LoopbackConfigured -PackageFamilyName $pkg.PackageFamilyName)) {
        Write-InstallStep -Message '正在配置本机连接…' -Kind default
        Write-InstallDetail -Message "Allow localhost access: $($pkg.PackageFamilyName)"
        CheckNetIsolation LoopbackExempt -a -n="$($pkg.PackageFamilyName)"
    } else {
        Write-InstallDetail -Message "Loopback already configured: $($pkg.PackageFamilyName)"
    }

    Set-Content -Path $MarkerPath -Value $pkg.Version.ToString() -Encoding ascii -NoNewline

    Show-InstallSuccess -Version $pkg.Version.ToString()
}
catch {
    $message = Format-InstallError -ErrorRecord $_
    Write-InstallLog -Message "ERROR: $message"
    Write-InstallFailure -Message $message
    Show-InstallFailure
    exit 1
}
