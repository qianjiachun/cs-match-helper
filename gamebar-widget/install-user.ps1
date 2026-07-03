#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install CS Match Helper Game Bar Widget (end user, pre-built package).
  Place this script next to CSMatchHelperWidget.msix and .cer, then run as Admin.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

function Write-InstallPatienceHint {
    Write-Host ''
    Write-Host '  提示：若安装过程中出现错误（例如「资源正在使用」），请勿关闭此窗口，等待几分钟后通常即可安装成功。' -ForegroundColor Yellow
    Write-Host ''
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
            Write-Host "  Skip installed dependency: $leaf"
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
            Write-Host "  Removing: $($pkg.PackageFullName)"
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
                Write-Host "  Removing provisioned: $($_.PackageName)"
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

    Write-Host "  Package path: $Path"
    Write-Host '  Deploying... (keep this window open until it closes automatically)'
    Write-Host '  若出现错误提示请勿关闭，脚本会自动重试。' -ForegroundColor Yellow

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
            Write-Host '  检测到同版本已安装但内容不同，先卸载再重装…' -ForegroundColor Yellow
            Remove-InstalledWidgetPackages -Names @($PackageName) + $LegacyPackageNames
            Install-WidgetAppxPackage -Path $Path -DependencyPaths $DependencyPaths -SkipSameVersionRemoval
            return
        }

        Write-Host "  Fast install failed, retrying with ForceApplicationShutdown: $($_.Exception.Message)"
        Write-Host '  正在关闭占用资源的应用并重试，请勿关闭此窗口，通常等待 1–3 分钟即可完成。' -ForegroundColor Yellow
    }

    try {
        Invoke-AddAppxPackageAttempt -Params $params -ForceApplicationShutdown
    } catch {
        if (-not $SkipSameVersionRemoval -and (Test-SamePackageReinstallError $_)) {
            Write-Host '  检测到同版本已安装但内容不同，先卸载再重装…' -ForegroundColor Yellow
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

$transcriptStarted = $false
try {
    Start-Transcript -Path $LogPath -Force | Out-Null
    $transcriptStarted = $true

    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
    if (-not $isAdmin) {
        throw 'Administrator privileges are required to install the widget.'
    }

    Write-Host "==> Environment"
    Write-Host "  Windows: $([Environment]::OSVersion.VersionString)"
    Write-Host "  PowerShell: $($PSVersionTable.PSVersion)"
    Write-Host "  Install dir: $Dir"
    Write-Host "  Package: $(if ($AppxPath) { Split-Path -Leaf $AppxPath } else { 'missing' })"

    if (-not $AppxPath) {
        throw "Missing package in $Dir`nExpected CSMatchHelperWidget.msix or CSMatchHelperWidget.appx next to install.ps1"
    }
    if (-not (Test-Path $CerPath)) {
        throw "Missing certificate: $CerPath`nEnsure CSMatchHelperWidget.cer is in the same folder"
    }

    $depDir = Join-Path $Dir 'Dependencies\x64'
    $dependencyPaths = @()
    if (Test-Path $depDir) {
        $allDeps = Get-ChildItem -Path $depDir -Filter '*.appx' | ForEach-Object { $_.FullName }
        $dependencyPaths = Get-MissingDependencyPaths -Paths $allDeps
    }
    Write-Host "  Dependencies to install: $($dependencyPaths.Count)"
    Write-InstallPatienceHint

    if (Test-CertificateTrusted -CerFilePath $CerPath) {
        Write-Host '==> Signing certificate already trusted, skip import'
    } else {
        Write-Host '==> Trust signing certificate...'
        Import-Certificate -FilePath $CerPath -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
    }

    Write-Host '==> Remove legacy package names (if any)...'
    foreach ($legacyName in $LegacyPackageNames) {
        Get-AppxPackage -Name $legacyName -ErrorAction SilentlyContinue |
            ForEach-Object {
                CheckNetIsolation LoopbackExempt -d -n="$($_.PackageFamilyName)" 2>$null
                Remove-AppxPackage -Package $_.PackageFullName
            }
    }

    $incomingVersion = Get-AppxPackageVersionFromPath -PackagePath $AppxPath
    Write-Host "  Incoming package version: $incomingVersion"

    $existingPkg = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingPkg -and $existingPkg.Version -eq $incomingVersion) {
        Write-Host "==> Same version v$incomingVersion already installed; uninstalling before reinstall..."
        Remove-InstalledWidgetPackages -Names @($PackageName)
    } elseif ($existingPkg -and (Test-LoopbackConfigured -PackageFamilyName $existingPkg.PackageFamilyName)) {
        Write-Host "==> Widget already installed v$($existingPkg.Version) with loopback, upgrading package..."
    }

    Write-Host '==> Install widget package...'
    Install-WidgetAppxPackage -Path $AppxPath -DependencyPaths $dependencyPaths

    $pkg = Get-AppxPackage -Name $PackageName
    if (-not $pkg) {
        throw 'Installation failed: package not found after Add-AppxPackage'
    }

    if (-not (Test-LoopbackConfigured -PackageFamilyName $pkg.PackageFamilyName)) {
        Write-Host "==> Allow localhost access: $($pkg.PackageFamilyName)"
        CheckNetIsolation LoopbackExempt -a -n="$($pkg.PackageFamilyName)"
    } else {
        Write-Host "==> Loopback already configured: $($pkg.PackageFamilyName)"
    }

    Set-Content -Path $MarkerPath -Value $pkg.Version.ToString() -Encoding ascii -NoNewline

    Write-Host ''
    Write-Host 'Installation complete.'
}
catch {
    $message = Format-InstallError -ErrorRecord $_
    Write-InstallFailure -Message $message
    Write-Host "ERROR: $message" -ForegroundColor Red
    exit 1
}
finally {
    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
    }
}
