param(
    [string]$PayloadDir,
    [string]$ArchivePath,
    [switch]$GenerateReleaseContract
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$SigningContractPath = Join-Path $Root 'signing-contract.json'
$WidgetVersionPath = Join-Path $Root 'widget-version.json'
$temporaryPayload = $null

function Normalize-Thumbprint([string]$Value) {
    return ($Value -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
}

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Read-PackageManifest([string]$PackagePath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        $entry = $archive.Entries | Where-Object { $_.FullName -eq 'AppxManifest.xml' } | Select-Object -First 1
        if (-not $entry) { throw "AppxManifest.xml not found in $PackagePath" }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
    } finally {
        $archive.Dispose()
    }
}

function Export-PackageCatalog([string]$PackagePath, [string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        $entry = $archive.Entries | Where-Object { $_.FullName -eq 'AppxMetadata/CodeIntegrity.cat' } | Select-Object -First 1
        if (-not $entry) { throw "CodeIntegrity.cat not found in $PackagePath" }
        $inputStream = $entry.Open()
        $outputStream = [System.IO.File]::Create($Destination)
        try { $inputStream.CopyTo($outputStream) } finally {
            $outputStream.Dispose()
            $inputStream.Dispose()
        }
    } finally {
        $archive.Dispose()
    }
}

function Assert-Signature(
    [string]$Path,
    [string]$ExpectedThumbprint,
    [string]$Label,
    [switch]$RequireTimestamp
) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    $actual = if ($signature.SignerCertificate) {
        Normalize-Thumbprint $signature.SignerCertificate.Thumbprint
    } else { '' }
    if ($actual -ne $ExpectedThumbprint) {
        throw "$Label signer mismatch. Expected $ExpectedThumbprint, actual $(if ($actual) { $actual } else { '<none>' })"
    }
    if ($signature.Status -ne 'Valid') {
        throw "$Label signature is $($signature.Status): $($signature.StatusMessage)"
    }
    if ($RequireTimestamp -and -not $signature.TimeStamperCertificate) {
        throw "$Label signature has no RFC 3161 timestamp"
    }
    return $signature
}

try {
    if ($ArchivePath) {
        if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
            throw "Archive not found: $ArchivePath"
        }
        $temporaryPayload = Join-Path $env:TEMP "csmh-widget-verify-$([Guid]::NewGuid().ToString('N'))"
        New-Item -ItemType Directory -Force -Path $temporaryPayload | Out-Null
        Expand-Archive -LiteralPath $ArchivePath -DestinationPath $temporaryPayload -Force
        $PayloadDir = $temporaryPayload
    }
    if (-not $PayloadDir) { $PayloadDir = Join-Path $Root 'dist' }
    if (-not (Test-Path -LiteralPath $PayloadDir -PathType Container)) {
        throw "Payload folder not found: $PayloadDir"
    }

    $signing = Get-Content -LiteralPath $SigningContractPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $expectedThumbprint = Normalize-Thumbprint ([string]$signing.certificateThumbprint)
    $expectedPublisher = [string]$signing.publisher
    $widgetVersion = Get-Content -LiteralPath $WidgetVersionPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $expectedVersion = "$($widgetVersion.version).0"

    $package = @(Get-ChildItem -LiteralPath $PayloadDir -File | Where-Object { $_.Extension -in @('.msix', '.appx') })
    if ($package.Count -ne 1) { throw "Expected exactly one MSIX/AppX in $PayloadDir; found $($package.Count)" }
    $package = $package[0]
    $cerPath = Join-Path $PayloadDir 'CSMatchHelperWidget.cer'
    $installPath = Join-Path $PayloadDir 'install.ps1'
    foreach ($required in @($cerPath, $installPath)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing release file: $required" }
    }

    $cer = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($cerPath)
    $cerThumbprint = Normalize-Thumbprint $cer.Thumbprint
    if ($cerThumbprint -ne $expectedThumbprint) {
        throw "CER thumbprint mismatch. Expected $expectedThumbprint, actual $cerThumbprint"
    }
    if ($cer.Subject -ne $expectedPublisher) {
        throw "CER subject mismatch. Expected '$expectedPublisher', actual '$($cer.Subject)'"
    }
    if ((Get-Date) -lt $cer.NotBefore -or (Get-Date) -gt $cer.NotAfter) {
        throw "Signing certificate is outside its validity period: $($cer.NotBefore) - $($cer.NotAfter)"
    }
    $codeSigningEku = @($cer.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object {
        $_.EnhancedKeyUsages | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' }
    }).Count -gt 0
    if (-not $codeSigningEku) { throw 'Signing certificate lacks the Code Signing EKU' }

    $manifest = Read-PackageManifest $package.FullName
    $identity = $manifest.Package.Identity
    if ([string]$identity.Publisher -ne $expectedPublisher) {
        throw "Manifest Publisher mismatch. Expected '$expectedPublisher', actual '$($identity.Publisher)'"
    }
    if ([string]$identity.Version -ne $expectedVersion) {
        throw "Manifest version mismatch. Expected '$expectedVersion', actual '$($identity.Version)'"
    }
    if ($manifest.OuterXml -match 'Microsoft\.NET\.CoreFramework\.Debug') {
        throw 'Release manifest contains Microsoft.NET.CoreFramework.Debug.*'
    }
    if ($manifest.OuterXml -match 'runFullTrust') {
        throw 'Release manifest contains the forbidden runFullTrust capability'
    }

    $packageSignature = Assert-Signature $package.FullName $expectedThumbprint 'MSIX' -RequireTimestamp
    $catalogPath = Join-Path $env:TEMP "csmh-widget-catalog-$([Guid]::NewGuid().ToString('N')).cat"
    try {
        Export-PackageCatalog $package.FullName $catalogPath
        $catalogSignature = Assert-Signature $catalogPath $expectedThumbprint 'CodeIntegrity.cat' -RequireTimestamp
    } finally {
        Remove-Item -LiteralPath $catalogPath -Force -ErrorAction SilentlyContinue
    }

    $dependencyFiles = @(Get-ChildItem -LiteralPath (Join-Path $PayloadDir 'Dependencies') -Filter '*.appx' -File -Recurse -ErrorAction SilentlyContinue)
    foreach ($dependency in $dependencyFiles) {
        if ($dependency.Name -match 'Microsoft\.NET\.CoreFramework\.Debug') {
            throw "Debug runtime dependency is forbidden: $($dependency.Name)"
        }
        $dependencySignature = Get-AuthenticodeSignature -LiteralPath $dependency.FullName
        if ($dependencySignature.Status -ne 'Valid') {
            throw "Dependency signature is not valid: $($dependency.Name) ($($dependencySignature.Status))"
        }
    }

    $releaseContractPath = Join-Path $PayloadDir 'release-contract.json'
    if ($GenerateReleaseContract) {
        $files = @(
            [ordered]@{ path = $package.Name; sha256 = Get-Sha256 $package.FullName },
            [ordered]@{ path = 'CSMatchHelperWidget.cer'; sha256 = Get-Sha256 $cerPath },
            [ordered]@{ path = 'install.ps1'; sha256 = Get-Sha256 $installPath }
        )
        foreach ($dependency in $dependencyFiles | Sort-Object FullName) {
            $relative = $dependency.FullName.Substring($PayloadDir.Length).TrimStart('\').Replace('\', '/')
            $files += [ordered]@{ path = $relative; sha256 = Get-Sha256 $dependency.FullName }
        }
        $releaseContract = [ordered]@{
            schemaVersion = 1
            version = [string]$widgetVersion.version
            publisher = $expectedPublisher
            certificateThumbprint = $expectedThumbprint
            signatures = [ordered]@{
                msix = 'Valid'
                catalog = 'Valid'
                timestamped = $true
                timestampDigestAlgorithm = [string]$signing.timestampDigestAlgorithm
            }
            files = $files
        }
        $releaseContract | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $releaseContractPath -Encoding UTF8
    }

    if (-not (Test-Path -LiteralPath $releaseContractPath -PathType Leaf)) {
        throw "Missing release-contract.json in $PayloadDir"
    }
    $releaseContract = Get-Content -LiteralPath $releaseContractPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([string]$releaseContract.version -ne [string]$widgetVersion.version -or
        [string]$releaseContract.publisher -ne $expectedPublisher -or
        (Normalize-Thumbprint ([string]$releaseContract.certificateThumbprint)) -ne $expectedThumbprint) {
        throw 'release-contract.json does not match the tracked signing/version contract'
    }
    foreach ($file in $releaseContract.files) {
        $candidate = Join-Path $PayloadDir ([string]$file.path).Replace('/', '\')
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Contract file missing: $($file.path)" }
        $actualHash = Get-Sha256 $candidate
        if ($actualHash -ne ([string]$file.sha256).ToLowerInvariant()) {
            throw "SHA-256 mismatch for $($file.path). Expected $($file.sha256), actual $actualHash"
        }
    }

    Write-Host "Widget release verified: v$($widgetVersion.version), $expectedThumbprint"
} finally {
    if ($temporaryPayload -and (Test-Path -LiteralPath $temporaryPayload)) {
        Remove-Item -LiteralPath $temporaryPayload -Recurse -Force -ErrorAction SilentlyContinue
    }
}
