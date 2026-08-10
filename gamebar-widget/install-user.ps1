<#
.SYNOPSIS
  Install CS Match Helper Game Bar Widget (end user, pre-built package).
  Place this script next to CSMatchHelperWidget.msix and .cer, then run as Admin.
#>
param(
    [ValidateSet('auto', 'zh-CN', 'en-US')]
    [string]$Language = 'auto',
    [switch]$PreflightOnly,
    [switch]$Json
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallLocale = if ($Language -eq 'auto') {
    if ([Globalization.CultureInfo]::CurrentUICulture.Name -like 'zh-*') { 'zh-CN' } else { 'en-US' }
} else { $Language }

function L {
    param([string]$Zh, [string]$En)
    if ($InstallLocale -eq 'en-US') { return $En }
    return $Zh
}

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
$ReleaseContractPath = Join-Path $Dir 'release-contract.json'
$AppxPath = @(
    (Join-Path $Dir 'CSMatchHelperWidget.msix'),
    (Join-Path $Dir 'CSMatchHelperWidget.appx')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$PackageName = 'CSMatchHelper.GameBarWidget'
$ExpectedPublisher = 'CN=CSMatchHelperDev'
$ExpectedThumbprint = '196D5DCC495BCFF5EABCA6C9650FA8975954F8AA'
$LegacyPackageNames = @(
    'CSMatchHelper.CounterStrafingHudWidget'
)
$MarkerDir = Join-Path $env:LOCALAPPDATA 'CSMatchHelper\gamebar-widget'
$MarkerPath = Join-Path $MarkerDir 'install.ok'
$PendingMarkerPath = Join-Path $MarkerDir 'installed.pending'
$RuntimeMarkerPath = Join-Path $MarkerDir 'runtime-verified.json'
$FailPath = Join-Path $MarkerDir 'install.fail'
$IssuePath = Join-Path $MarkerDir 'install-issue.json'
$LogPath = Join-Path $MarkerDir 'install.log'
$script:InstallLogWarning = $null

function Register-InstallArtifactWarning {
    param(
        [string]$Operation,
        $ErrorRecord
    )

    $detail = if ($ErrorRecord -and $ErrorRecord.Exception) {
        [string]$ErrorRecord.Exception.Message
    } else {
        [string]$ErrorRecord
    }
    $script:InstallLogWarning = "$Operation failed: $detail; path=$MarkerDir"
    Write-Warning $script:InstallLogWarning
}

function Ensure-InstallArtifactDirectory {
    try {
        New-Item -ItemType Directory -Force -Path $MarkerDir -ErrorAction Stop | Out-Null
        return $true
    } catch {
        Register-InstallArtifactWarning -Operation 'Create install diagnostics directory' -ErrorRecord $_
        return $false
    }
}

function Write-InstallLog {
    param([string]$Message)

    try {
        if (-not (Ensure-InstallArtifactDirectory)) { return $false }
        $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -Path $LogPath -Value "[$timestamp] $Message" -Encoding utf8 -ErrorAction Stop
        if ($script:InstallLogWarning) {
            Add-Content -Path $LogPath -Value "[$timestamp] WARNING: $script:InstallLogWarning" -Encoding utf8 -ErrorAction Stop
            $script:InstallLogWarning = $null
        }
        return $true
    } catch {
        Register-InstallArtifactWarning -Operation 'Write install log' -ErrorRecord $_
        return $false
    }
}

function Show-InstallWelcome {
    try {
        $Host.UI.RawUI.WindowTitle = L 'CS 匹配助手 - 小组件安装' 'CS Match Helper - Widget Setup'
    } catch { }

    Write-Host ''
    Write-Host "  $($InstallGlyphs.Game)$(L 'CS 匹配助手 · 游戏内小组件安装' 'CS Match Helper · In-game Widget Setup')" -ForegroundColor Cyan
    Write-Host $InstallGlyphs.Divider -ForegroundColor DarkGray
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Wait)$(L '正在安装，请保持此窗口开启。' 'Installing. Keep this window open.')" -ForegroundColor White
    Write-Host (L '     通常需要 1–3 分钟，完成后窗口会自动关闭。' '     This normally takes 1–3 minutes. The window closes automatically.') -ForegroundColor DarkGray
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Tip)$(L '若中途出现系统提示（例如「资源正在使用」），属于正常现象，' 'Windows may briefly report that a resource is in use.')" -ForegroundColor DarkYellow
    Write-Host (L '     请勿关闭窗口，耐心等待即可。' '     Keep this window open while setup retries automatically.') -ForegroundColor DarkYellow
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Guide)$(L '自签前提：需要管理员权限，并会向整机 TrustedPeople 添加固定证书。' 'Self-signed requirement: administrator access is required and a fixed certificate is added to machine TrustedPeople.')" -ForegroundColor DarkGray
    Write-Host (L '     Smart App Control 使用期间必须保持关闭；安装器不会关闭安全功能或修改企业策略。' '     Smart App Control must remain off while in use. Setup never disables security controls or changes enterprise policy.') -ForegroundColor DarkGray
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

function Format-WidgetDisplayVersion {
    param($Version)
    try {
        return ([version]$Version).ToString(3)
    } catch {
        return [string]$Version
    }
}

function Show-InstallSuccess {
    param([string]$Version)

    Write-Host ''
    Write-Host $InstallGlyphs.Rule -ForegroundColor DarkGray
    Write-Host "  $($InstallGlyphs.Done)" -NoNewline -ForegroundColor Green
    Write-Host (L '安装完成！' 'Setup complete!') -NoNewline -ForegroundColor Green
    if ($Version) {
        Write-Host "  v$Version" -ForegroundColor DarkGray
    } else {
        Write-Host ''
    }
    Write-Host $InstallGlyphs.Rule -ForegroundColor DarkGray
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Target)$(L '现在可以直接使用小组件：' 'The Widget is ready to use:')" -ForegroundColor White
    Write-Host "$($InstallGlyphs.Bullet)$(L '关闭此窗口，回到 CS 匹配助手' 'Close this window and return to CS Match Helper')" -ForegroundColor DarkGray
    Write-Host "$($InstallGlyphs.Bullet)$(L '游戏中按 ' 'In game, press ')" -NoNewline -ForegroundColor DarkGray
    Write-Host 'Win+G' -NoNewline -ForegroundColor Cyan
    Write-Host "$(L ' 打开游戏栏，固定小组件' ' to open Game Bar and pin the widget')$($InstallGlyphs.Party)" -ForegroundColor DarkGray
    Write-Host ''
}

function Show-InstallFailure {
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Fail)$(L '安装未能完成' 'Setup could not be completed')" -ForegroundColor Red
    Write-Host ''
    Write-Host "  $($InstallGlyphs.Guide)$(L '请关闭此窗口，回到 CS 匹配助手查看提示或重试。' 'Close this window, then review the message in CS Match Helper or retry.')" -ForegroundColor DarkGray
    Write-Host "  $($InstallGlyphs.Chat)$(L '若多次失败，可在应用内复制诊断信息以便反馈。' 'If setup keeps failing, copy diagnostics from the app when reporting the issue.')" -ForegroundColor DarkGray
    Write-Host ''
}

function Write-InstallDetail {
    param([string]$Message)
    [void](Write-InstallLog -Message $Message)
}

function Write-InstallFailure {
    param([string]$Message)
    try {
        if (-not (Ensure-InstallArtifactDirectory)) { return $false }
        Set-Content -Path $FailPath -Value $Message -Encoding utf8 -ErrorAction Stop
        return $true
    } catch {
        Register-InstallArtifactWarning -Operation 'Write install failure marker' -ErrorRecord $_
        return $false
    }
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

function Normalize-Thumbprint {
    param([string]$Value)
    return ($Value -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
}

function New-PreflightResult {
    param(
        [bool]$Success,
        [string]$IssueCode,
        [string]$RequiredAction,
        [bool]$Retryable,
        [string]$Message,
        [hashtable]$Details = @{}
    )
    return [pscustomobject]@{
        success = $Success
        issueCode = $IssueCode
        requiredAction = $RequiredAction
        retryable = $Retryable
        message = $Message
        details = [pscustomobject]$Details
    }
}

function Get-SmartAppControlState {
    if ([Environment]::OSVersion.Version.Build -lt 22000) { return 'notApplicable' }
    try {
        $value = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -Name 'VerifiedAndReputablePolicyState' -ErrorAction Stop).VerifiedAndReputablePolicyState
        switch ([int]$value) {
            0 { return 'off' }
            1 { return 'on' }
            2 { return 'evaluation' }
            default { return 'unknown' }
        }
    } catch {
        return 'unknown'
    }
}

function Get-WdacState {
    try {
        $deviceGuard = Get-CimInstance -Namespace 'root\Microsoft\Windows\DeviceGuard' -ClassName 'Win32_DeviceGuard' -ErrorAction Stop
        switch ([int]$deviceGuard.CodeIntegrityPolicyEnforcementStatus) {
            2 { return 'enforced' }
            1 { return 'audit' }
            0 { return 'off' }
            default { return 'unknown' }
        }
    } catch {
        return 'unknown'
    }
}

function Read-PackageManifest {
    param([Parameter(Mandatory = $true)][string]$PackagePath)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        $entry = $zip.Entries | Where-Object { $_.FullName -eq 'AppxManifest.xml' } | Select-Object -First 1
        if (-not $entry) { throw "AppxManifest.xml not found in $PackagePath" }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
    } finally {
        $zip.Dispose()
    }
}

function Export-PackageCatalog {
    param(
        [Parameter(Mandatory = $true)][string]$PackagePath,
        [Parameter(Mandatory = $true)][string]$Destination
    )
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        $entry = $zip.Entries | Where-Object { $_.FullName -eq 'AppxMetadata/CodeIntegrity.cat' } | Select-Object -First 1
        if (-not $entry) { throw "CodeIntegrity.cat not found in $PackagePath" }
        $inputStream = $entry.Open()
        $outputStream = [System.IO.File]::Create($Destination)
        try { $inputStream.CopyTo($outputStream) } finally {
            $outputStream.Dispose()
            $inputStream.Dispose()
        }
    } finally {
        $zip.Dispose()
    }
}

function Test-WidgetReleasePreflight {
    $smartAppControl = Get-SmartAppControlState
    $wdac = Get-WdacState
    $details = @{
        expectedPublisher = $ExpectedPublisher
        expectedThumbprint = $ExpectedThumbprint
        smartAppControl = $smartAppControl
        wdac = $wdac
        trustedPeople = $false
        cerThumbprint = $null
        msixThumbprint = $null
        catalogThumbprint = $null
        msixStatus = $null
        catalogStatus = $null
    }

    if ($smartAppControl -eq 'on') {
        return New-PreflightResult $false 'smartAppControlOn' 'openSmartAppControlSettings' $true `
            (L '智能应用控制已开启。自签小组件会被阻止；请先在 Windows 安全中心关闭，然后返回应用重新检测。使用此自签小组件期间必须保持关闭。' 'Smart App Control is on and blocks self-signed Widgets. Turn it off in Windows Security, then return and detect again. It must remain off while using this Widget.') `
            $details
    }

    try {
        foreach ($required in @($AppxPath, $CerPath, $ReleaseContractPath)) {
            if (-not $required -or -not (Test-Path -LiteralPath $required -PathType Leaf)) {
                throw "Missing release file: $required"
            }
        }

        $contract = Get-Content -LiteralPath $ReleaseContractPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]$contract.publisher -ne $ExpectedPublisher) {
            throw "Contract Publisher mismatch. Expected '$ExpectedPublisher', actual '$($contract.publisher)'"
        }
        $contractThumbprint = Normalize-Thumbprint ([string]$contract.certificateThumbprint)
        if ($contractThumbprint -ne $ExpectedThumbprint) {
            throw "Contract thumbprint mismatch. Expected $ExpectedThumbprint, actual $contractThumbprint"
        }
        foreach ($file in $contract.files) {
            $relativePath = ([string]$file.path).Replace('/', '\')
            $candidate = Join-Path $Dir $relativePath
            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Contract file missing: $($file.path)" }
            $actualHash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($actualHash -ne ([string]$file.sha256).ToLowerInvariant()) {
                throw "SHA-256 mismatch for $($file.path). Expected $($file.sha256), actual $actualHash"
            }
        }

        $cer = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CerPath)
        $details.cerThumbprint = Normalize-Thumbprint $cer.Thumbprint
        $details.trustedPeople = [bool](Get-ChildItem Cert:\LocalMachine\TrustedPeople -ErrorAction SilentlyContinue | Where-Object {
            (Normalize-Thumbprint $_.Thumbprint) -eq $ExpectedThumbprint
        } | Select-Object -First 1)
        if ($details.cerThumbprint -ne $ExpectedThumbprint) {
            throw "CER thumbprint mismatch. Expected $ExpectedThumbprint, actual $($details.cerThumbprint)"
        }
        if ($cer.Subject -ne $ExpectedPublisher) {
            throw "CER subject mismatch. Expected '$ExpectedPublisher', actual '$($cer.Subject)'"
        }
        if ((Get-Date) -lt $cer.NotBefore -or (Get-Date) -gt $cer.NotAfter) {
            throw "CER is outside its validity period: $($cer.NotBefore) - $($cer.NotAfter)"
        }
        $hasCodeSigningEku = @($cer.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object {
            $_.EnhancedKeyUsages | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' }
        }).Count -gt 0
        if (-not $hasCodeSigningEku) { throw 'CER lacks the Code Signing EKU' }

        $manifest = Read-PackageManifest -PackagePath $AppxPath
        if ([string]$manifest.Package.Identity.Publisher -ne $ExpectedPublisher) {
            throw "Manifest Publisher mismatch. Expected '$ExpectedPublisher', actual '$($manifest.Package.Identity.Publisher)'"
        }
        $manifestVersion = [version]$manifest.Package.Identity.Version
        if ($manifestVersion.ToString(3) -ne [string]$contract.version) {
            throw "Manifest version mismatch. Contract $($contract.version), manifest $manifestVersion"
        }
        if ($manifest.OuterXml -match 'Microsoft\.NET\.CoreFramework\.Debug') { throw 'Debug Framework dependency is forbidden' }
        if ($manifest.OuterXml -match 'runFullTrust') { throw 'runFullTrust capability is forbidden' }

        $msixSignature = Get-AuthenticodeSignature -LiteralPath $AppxPath
        $details.msixStatus = [string]$msixSignature.Status
        $details.msixThumbprint = if ($msixSignature.SignerCertificate) { Normalize-Thumbprint $msixSignature.SignerCertificate.Thumbprint } else { $null }
        if ($details.msixThumbprint -ne $ExpectedThumbprint) {
            throw "MSIX signer mismatch. Expected $ExpectedThumbprint, actual $($details.msixThumbprint)"
        }

        $catalogPath = Join-Path $env:TEMP "csmh-widget-preflight-$([Guid]::NewGuid().ToString('N')).cat"
        try {
            Export-PackageCatalog -PackagePath $AppxPath -Destination $catalogPath
            $catalogSignature = Get-AuthenticodeSignature -LiteralPath $catalogPath
            $details.catalogStatus = [string]$catalogSignature.Status
            $details.catalogThumbprint = if ($catalogSignature.SignerCertificate) { Normalize-Thumbprint $catalogSignature.SignerCertificate.Thumbprint } else { $null }
            if ($details.catalogThumbprint -ne $ExpectedThumbprint) {
                throw "CodeIntegrity.cat signer mismatch. Expected $ExpectedThumbprint, actual $($details.catalogThumbprint)"
            }
        } finally {
            Remove-Item -LiteralPath $catalogPath -Force -ErrorAction SilentlyContinue
        }

        $dependencyFiles = @(Get-ChildItem -LiteralPath (Join-Path $Dir 'Dependencies') -Filter '*.appx' -File -Recurse -ErrorAction SilentlyContinue)
        foreach ($dependency in $dependencyFiles) {
            if ($dependency.Name -match 'Microsoft\.NET\.CoreFramework\.Debug') { throw "Debug dependency is forbidden: $($dependency.Name)" }
            $relativeDependency = $dependency.FullName.Substring($Dir.Length).TrimStart('\').Replace('\', '/')
            if (-not @($contract.files | Where-Object { [string]$_.path -eq $relativeDependency }).Count) {
                throw "Dependency is not covered by release-contract.json: $relativeDependency"
            }
            $dependencySignature = Get-AuthenticodeSignature -LiteralPath $dependency.FullName
            if ($dependencySignature.Status -ne 'Valid') {
                throw "Dependency signature is not valid: $($dependency.Name) ($($dependencySignature.Status))"
            }
        }

        if ($smartAppControl -eq 'evaluation') {
            $details.smartAppControlWarning = 'evaluation'
        }
        return New-PreflightResult $true $null 'continue' $true `
            (L '安装包、发布者和系统前提检查通过。' 'Package, publisher, and system preflight passed.') `
            $details
    } catch {
        $details.validationError = $_.Exception.Message
        return New-PreflightResult $false 'packageValidationFailed' 'downloadAgain' $true `
            (L "安装包安全校验失败：$($_.Exception.Message)" "Package security validation failed: $($_.Exception.Message)") `
            $details
    }
}

function Write-PreflightResult {
    param($Result)
    if ($Json) {
        Write-Output ($Result | ConvertTo-Json -Depth 8 -Compress)
        return
    }
    $color = if ($Result.success) { 'Green' } else { 'Red' }
    Write-Host $Result.message -ForegroundColor $color
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
        $manifest = Read-PackageManifest -PackagePath $depPath
        $identity = $manifest.Package.Identity
        $requiredName = [string]$identity.Name
        $requiredPublisher = [string]$identity.Publisher
        $requiredVersion = [version]$identity.Version
        $requiredArchitecture = ([string]$identity.ProcessorArchitecture).ToLowerInvariant()
        if (-not $requiredArchitecture) { $requiredArchitecture = 'neutral' }

        $installed = @(
            Get-AppxPackage -Name $requiredName -ErrorAction SilentlyContinue |
                Where-Object {
                    $installedArchitecture = ([string]$_.Architecture).ToLowerInvariant()
                    $architectureMatches = (
                        $requiredArchitecture -eq 'neutral' -or
                        $installedArchitecture -eq 'neutral' -or
                        $installedArchitecture -eq $requiredArchitecture
                    )
                    $publisherMatches = (-not $requiredPublisher -or [string]$_.Publisher -eq $requiredPublisher)
                    $architectureMatches -and $publisherMatches -and ([version]$_.Version -ge $requiredVersion)
                }
        )

        if ($installed.Count -gt 0) {
            $matched = $installed | Sort-Object Version -Descending | Select-Object -First 1
            Write-InstallDetail -Message "Skip satisfied dependency: $requiredName required=$requiredVersion/$requiredArchitecture installed=$($matched.Version)/$($matched.Architecture)"
        } else {
            Write-InstallDetail -Message "Install dependency: $requiredName required=$requiredVersion/$requiredArchitecture ($leaf)"
            [void]$missing.Add($depPath)
        }
    }
    return @($missing)
}

function Get-AppxPackageVersionFromPath {
    param([Parameter(Mandatory = $true)][string]$PackagePath)
    $manifest = Read-PackageManifest -PackagePath $PackagePath
    return [version]$manifest.Package.Identity.Version
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
    $attempt.ErrorAction = 'Stop'

    $runner = [PowerShell]::Create()
    $null = $runner.AddScript(@'
param([hashtable]$InstallParams)
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
Add-AppxPackage @InstallParams
'@).AddArgument($attempt)

    $spinner = @('|', '/', '-', '\')
    $messages = @(
        (L '正在交给 Windows 部署服务处理' 'Windows deployment service is working'),
        (L '正在验证并写入小组件文件' 'Validating and writing widget files'),
        (L '正在完成系统注册，请保持窗口开启' 'Completing system registration; keep this window open')
    )
    $startedAt = Get-Date
    $lastWidth = 0
    $animationVisible = $false
    $async = $null
    $invocationError = $null

    try {
        $async = $runner.BeginInvoke()
        $frame = 0
        while (-not $async.IsCompleted) {
            $elapsed = [int]((Get-Date) - $startedAt).TotalSeconds
            $minutes = [math]::Floor($elapsed / 60)
            $seconds = $elapsed % 60
            $messageIndex = [math]::Floor($elapsed / 8) % $messages.Count
            $line = "  $($spinner[$frame % $spinner.Count]) $($messages[$messageIndex])  [{0:00}:{1:00}]" -f $minutes, $seconds
            $padding = if ($lastWidth -gt $line.Length) { ' ' * ($lastWidth - $line.Length) } else { '' }
            Write-Host "`r$line$padding" -NoNewline -ForegroundColor Cyan
            $lastWidth = $line.Length
            $animationVisible = $true
            $frame++
            Start-Sleep -Milliseconds 140
        }
        $null = $runner.EndInvoke($async)
        if ($runner.Streams.Error.Count -gt 0) {
            $invocationError = $runner.Streams.Error[0]
        }
    } catch {
        $invocationError = $_
    } finally {
        if ($animationVisible) {
            Write-Host "`r$(' ' * $lastWidth)`r" -NoNewline
        }
        $runner.Dispose()
    }

    if ($invocationError) {
        throw $invocationError
    }
}

function Test-AppxPackageInUseError {
    param($ErrorRecord)

    $parts = @(
        [string]$ErrorRecord.Exception.Message
        [string]$ErrorRecord.FullyQualifiedErrorId
    )
    if ($ErrorRecord.Exception.HResult) {
        $parts += ('0x{0:X8}' -f ($ErrorRecord.Exception.HResult -band 0xFFFFFFFF))
    }
    return (($parts -join ' ') -match '(?i)0x80073D02')
}

function Get-BlockingPackagesFromMessage {
    param([string]$Message)

    if (-not $Message) { return @() }
    $packagePattern = '(?i)[A-Za-z0-9][A-Za-z0-9.-]*_[0-9][A-Za-z0-9.-]*_(?:x64|x86|arm64|arm|neutral)__[A-Za-z0-9]+'
    return @(
        [regex]::Matches($Message, $packagePattern) |
            ForEach-Object { $_.Value } |
            Select-Object -Unique
    )
}

function Install-WidgetAppxPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string[]]$DependencyPaths = @(),
        [switch]$SkipSameVersionRemoval
    )

    Write-InstallDetail -Message "Package path: $Path"
    Write-InstallStep -Message (L '正在写入小组件文件，请稍候…' 'Writing widget files…') -Kind wait

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
        $firstError = $_
        if (-not $SkipSameVersionRemoval -and (Test-SamePackageReinstallError $firstError)) {
            Write-InstallStep -Message (L '检测到旧版本，正在清理后重新安装…' 'Removing an older version before reinstalling…') -Kind retry
            Write-InstallDetail -Message "Same-version reinstall: $($firstError.Exception.Message)"
            Remove-InstalledWidgetPackages -Names @($PackageName) + $LegacyPackageNames
            Install-WidgetAppxPackage -Path $Path -DependencyPaths $DependencyPaths -SkipSameVersionRemoval
            return
        }

        if (-not (Test-AppxPackageInUseError $firstError)) {
            throw $firstError
        }

        Write-InstallDetail -Message "Package resources are in use (0x80073D02), retrying once with ForceApplicationShutdown: $($firstError.Exception.Message)"
        Write-InstallStep -Message (L '正在等待系统释放资源，稍后自动重试（约 1–3 分钟）…' 'Waiting for Windows to release resources; setup will retry automatically…') -Kind retry
    }

    try {
        Invoke-AddAppxPackageAttempt -Params $params -ForceApplicationShutdown
    } catch {
        $retryError = $_
        if (-not $SkipSameVersionRemoval -and (Test-SamePackageReinstallError $retryError)) {
            Write-InstallStep -Message (L '检测到旧版本，正在清理后重新安装…' 'Removing an older version before reinstalling…') -Kind retry
            Write-InstallDetail -Message "Same-version reinstall: $($retryError.Exception.Message)"
            Remove-InstalledWidgetPackages -Names @($PackageName) + $LegacyPackageNames
            Install-WidgetAppxPackage -Path $Path -DependencyPaths $DependencyPaths -SkipSameVersionRemoval
            return
        }
        if (Test-AppxPackageInUseError $retryError) {
            $blockingPackages = @(Get-BlockingPackagesFromMessage -Message ([string]$retryError.Exception.Message))
            Write-InstallDetail -Message "Package resources are still in use after ForceApplicationShutdown. Blocking packages: $($blockingPackages -join ', ')"
        }
        throw $retryError
    }
}

function Get-LoopbackProbe {
    param([string]$PackageFamilyName)

    $escaped = [regex]::Escape($PackageFamilyName)
    $output = @(CheckNetIsolation.exe LoopbackExempt -s 2>&1)
    $exitCode = $LASTEXITCODE
    $text = ($output -join ' ').Trim()

    if ($exitCode -ne 0) {
        return [pscustomobject]@{ state = 'unknown'; error = "CheckNetIsolation query exited with code $exitCode"; output = $text }
    }
    if ($text -match $escaped) {
        return [pscustomobject]@{ state = 'configured'; error = $null; output = $text }
    }
    if (-not $text -or $text -match '(?i)Unable to load string message') {
        return [pscustomobject]@{ state = 'unknown'; error = 'CheckNetIsolation returned unreadable output'; output = $text }
    }
    return [pscustomobject]@{ state = 'missing'; error = $null; output = $text }
}

function Test-LoopbackConfigured {
    param([string]$PackageFamilyName)
    $probe = Get-LoopbackProbe -PackageFamilyName $PackageFamilyName
    return $probe.state -eq 'configured'
}

function Ensure-LoopbackConfigured {
    param([Parameter(Mandatory = $true)][string]$PackageFamilyName)

    $initialProbe = Get-LoopbackProbe -PackageFamilyName $PackageFamilyName
    if ($initialProbe.state -eq 'configured') {
        Write-InstallDetail -Message "Loopback already configured: $PackageFamilyName"
        return
    }

    Write-InstallStep -Message (L '正在配置本机连接…' 'Configuring the local connection…') -Kind default
    $addSucceeded = $false
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        $output = CheckNetIsolation.exe LoopbackExempt -a -n="$PackageFamilyName" 2>&1
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) { $addSucceeded = $true }
        Write-InstallDetail -Message "Loopback add attempt $attempt exit=$exitCode output=$($output -join ' ')"

        $lastProbe = $null
        for ($probe = 0; $probe -lt 10; $probe++) {
            $lastProbe = Get-LoopbackProbe -PackageFamilyName $PackageFamilyName
            if ($lastProbe.state -eq 'configured') {
                Write-InstallDetail -Message "Loopback verified after attempt $attempt, probe $($probe + 1): $PackageFamilyName"
                return
            }
            if ($lastProbe.state -eq 'unknown') { break }
            Start-Sleep -Milliseconds 300
        }

        if ($exitCode -eq 0 -and $lastProbe.state -eq 'unknown') {
            Write-InstallDetail -Message "Loopback add succeeded, but verification is unavailable: $($lastProbe.error); output=$($lastProbe.output)"
            return
        }
    }

    if ($addSucceeded) {
        Write-InstallDetail -Message 'Loopback add returned success, but a readable verification result was not available.'
    }
    throw "loopbackRepairFailed: CheckNetIsolation could not verify the exemption for $PackageFamilyName after two attempts"
}

function Assert-TrustedWidgetSignatures {
    $trusted = Get-ChildItem Cert:\LocalMachine\TrustedPeople -ErrorAction SilentlyContinue |
        Where-Object { (Normalize-Thumbprint $_.Thumbprint) -eq $ExpectedThumbprint } |
        Select-Object -First 1
    if (-not $trusted) {
        throw "certificateTrustFailed: certificate $ExpectedThumbprint was not found in Cert:\LocalMachine\TrustedPeople after import (0x800B010A)"
    }

    $msixSignature = Get-AuthenticodeSignature -LiteralPath $AppxPath
    $msixThumbprint = if ($msixSignature.SignerCertificate) { Normalize-Thumbprint $msixSignature.SignerCertificate.Thumbprint } else { '<none>' }
    if ($msixThumbprint -ne $ExpectedThumbprint -or $msixSignature.Status -ne 'Valid') {
        throw "certificateTrustFailed: MSIX status=$($msixSignature.Status), expected=$ExpectedThumbprint, actual=$msixThumbprint, store=LocalMachine\TrustedPeople (0x800B010A)"
    }

    $catalogPath = Join-Path $env:TEMP "csmh-widget-trust-$([Guid]::NewGuid().ToString('N')).cat"
    try {
        Export-PackageCatalog -PackagePath $AppxPath -Destination $catalogPath
        $catalogSignature = Get-AuthenticodeSignature -LiteralPath $catalogPath
        $catalogThumbprint = if ($catalogSignature.SignerCertificate) { Normalize-Thumbprint $catalogSignature.SignerCertificate.Thumbprint } else { '<none>' }
        if ($catalogThumbprint -ne $ExpectedThumbprint -or $catalogSignature.Status -ne 'Valid') {
            throw "certificateTrustFailed: catalog status=$($catalogSignature.Status), expected=$ExpectedThumbprint, actual=$catalogThumbprint, store=LocalMachine\TrustedPeople (0x800B010A)"
        }
    } finally {
        Remove-Item -LiteralPath $catalogPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-InstallIssue {
    param([string]$Message)
    if ($Message -match '(?i)0x80073D02') {
        return [pscustomobject]@{
            issueCode = 'dependencyInUse'
            requiredAction = 'closeBlockingAppsAndRetry'
            retryable = $true
            blockingPackages = @(Get-BlockingPackagesFromMessage -Message $Message)
        }
    }
    if ($Message -match 'certificateTrustFailed|0x800B010A') {
        return [pscustomobject]@{ issueCode = 'certificateTrustFailed'; requiredAction = 'checkCertificatePolicy'; retryable = $true; blockingPackages = @() }
    }
    if ($Message -match 'loopbackRepairFailed') {
        return [pscustomobject]@{ issueCode = 'loopbackRepairFailed'; requiredAction = 'retryOrReinstall'; retryable = $true; blockingPackages = @() }
    }
    if ($Message -match '0x80073D01|policy|策略|WDAC|Code Integrity') {
        return [pscustomobject]@{ issueCode = 'enterprisePolicyBlocked'; requiredAction = 'contactAdministrator'; retryable = $false; blockingPackages = @() }
    }
    return [pscustomobject]@{ issueCode = 'installFailed'; requiredAction = 'retry'; retryable = $true; blockingPackages = @() }
}

function Write-InstallIssue {
    param($Issue, [string]$Message)
    try {
        if (-not (Ensure-InstallArtifactDirectory)) { return $false }
        [ordered]@{
            issueCode = $Issue.issueCode
            requiredAction = $Issue.requiredAction
            retryable = $Issue.retryable
            blockingPackages = @($Issue.blockingPackages)
            message = $Message
            expectedThumbprint = $ExpectedThumbprint
            certificateStore = 'LocalMachine\TrustedPeople'
            smartAppControl = Get-SmartAppControlState
            wdac = Get-WdacState
            diagnosticsWarning = $script:InstallLogWarning
        } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $IssuePath -Encoding UTF8 -ErrorAction Stop
        return $true
    } catch {
        Register-InstallArtifactWarning -Operation 'Write structured install issue' -ErrorRecord $_
        return $false
    }
}

$preflight = Test-WidgetReleasePreflight
if ($PreflightOnly) {
    Write-PreflightResult -Result $preflight
    if ($preflight.success) { exit 0 } else { exit 2 }
}
if (-not $preflight.success) {
    Write-PreflightResult -Result $preflight
    exit 2
}
[void](Ensure-InstallArtifactDirectory)
if ($preflight.details.smartAppControl -eq 'evaluation') {
    Write-Host (L '警告：Smart App Control 处于评估模式，Windows 后续仍可能阻止自签小组件。' 'Warning: Smart App Control is in evaluation mode and may still block the self-signed Widget later.') -ForegroundColor DarkYellow
}

$certificateWasTrusted = Test-CertificateTrusted -CerFilePath $CerPath
$widgetWasInstalled = [bool](Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Select-Object -First 1)
$certificateImportedThisRun = $false

try {
    Remove-Item -Path $MarkerPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $FailPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $IssuePath -Force -ErrorAction SilentlyContinue
    try {
        "=== Widget install started $(Get-Date -Format o) ===" | Set-Content -Path $LogPath -Encoding utf8 -ErrorAction Stop
    } catch {
        Register-InstallArtifactWarning -Operation 'Initialize install log' -ErrorRecord $_
    }

    Show-InstallWelcome

    Write-InstallDetail -Message "Console emoji support: $(Test-InstallConsoleEmojiSupport)"

    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
    if (-not $isAdmin) {
        throw (L '安装 Widget 需要管理员权限。' 'Administrator privileges are required to install the Widget.')
    }

    Write-InstallDetail -Message "Windows: $([Environment]::OSVersion.VersionString)"
    Write-InstallDetail -Message "PowerShell: $($PSVersionTable.PSVersion)"
    Write-InstallDetail -Message "Install dir: $Dir"
    Write-InstallDetail -Message "Package: $(if ($AppxPath) { Split-Path -Leaf $AppxPath } else { 'missing' })"

    Write-InstallStep -Message (L '正在检查运行环境…' 'Checking system requirements…') -Kind default
    Write-InstallDetail -Message "Preflight: $($preflight | ConvertTo-Json -Depth 8 -Compress)"

    $depDir = Join-Path $Dir 'Dependencies\x64'
    $dependencyPaths = @()
    if (Test-Path $depDir) {
        $allDeps = @(Get-ChildItem -Path $depDir -Filter '*.appx' | ForEach-Object { $_.FullName })
        $dependencyPaths = @(Get-MissingDependencyPaths -Paths $allDeps)
    }
    Write-InstallDetail -Message "Dependencies to install: $($dependencyPaths.Count)"

    if (Test-CertificateTrusted -CerFilePath $CerPath) {
        Write-InstallDetail -Message 'Signing certificate already trusted, skip import'
    } else {
        Write-InstallStep -Message (L '正在配置安装证书…' 'Configuring the signing certificate…') -Kind default
        Import-Certificate -FilePath $CerPath -CertStoreLocation 'Cert:\LocalMachine\TrustedPeople' | Out-Null
        $certificateImportedThisRun = $true
    }

    Write-InstallStep -Message (L '正在验证证书信任…' 'Verifying certificate trust…') -Kind default
    Assert-TrustedWidgetSignatures

    Write-InstallStep -Message (L '正在清理旧版本（如有）…' 'Removing older versions, if present…') -Kind default
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
        $incomingDisplayVersion = Format-WidgetDisplayVersion $incomingVersion
        Write-InstallStep -Message (L "正在更新 v$incomingDisplayVersion…" "Updating to v$incomingDisplayVersion…") -Kind wait
        Remove-InstalledWidgetPackages -Names @($PackageName)
    } elseif ($existingPkg -and (Test-LoopbackConfigured -PackageFamilyName $existingPkg.PackageFamilyName)) {
        $existingDisplayVersion = Format-WidgetDisplayVersion $existingPkg.Version
        Write-InstallStep -Message (L "正在从 v$existingDisplayVersion 升级…" "Upgrading from v$existingDisplayVersion…") -Kind wait
        Write-InstallDetail -Message "Widget already installed v$($existingPkg.Version) with loopback, upgrading package"
    }

    Write-InstallStep -Message (L '正在安装小组件…' 'Installing the widget…') -Kind wait
    Install-WidgetAppxPackage -Path $AppxPath -DependencyPaths $dependencyPaths

    $pkg = Get-AppxPackage -Name $PackageName
    if (-not $pkg) {
        throw (L '安装失败：Add-AppxPackage 完成后未找到 Widget 包' 'Installation failed: package not found after Add-AppxPackage')
    }

    Ensure-LoopbackConfigured -PackageFamilyName $pkg.PackageFamilyName

    Remove-Item -Path $RuntimeMarkerPath -Force -ErrorAction SilentlyContinue
    try {
        Set-Content -Path $PendingMarkerPath -Value $pkg.Version.ToString() -Encoding ascii -NoNewline -ErrorAction Stop
    } catch {
        Register-InstallArtifactWarning -Operation 'Write installed marker' -ErrorRecord $_
    }

    Show-InstallSuccess -Version (Format-WidgetDisplayVersion $pkg.Version)
}
catch {
    $originalError = $_
    $message = Format-InstallError -ErrorRecord $originalError
    $widgetIsStillInstalled = [bool](Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($certificateImportedThisRun -and -not $certificateWasTrusted -and -not $widgetWasInstalled -and -not $widgetIsStillInstalled) {
        Get-ChildItem Cert:\LocalMachine\TrustedPeople -ErrorAction SilentlyContinue |
            Where-Object { (Normalize-Thumbprint $_.Thumbprint) -eq $ExpectedThumbprint } |
            Remove-Item -Force -ErrorAction SilentlyContinue
        $message = "$message`nNewly imported certificate was rolled back."
    }
    $issue = Get-InstallIssue -Message $message
    [void](Write-InstallLog -Message "ERROR: $message")
    [void](Write-InstallFailure -Message $message)
    [void](Write-InstallIssue -Issue $issue -Message $message)
    Show-InstallFailure
    exit 1
}
