<#
.SYNOPSIS
  Build signed MSIX for distribution (developer machine only).
  Output: gamebar-widget/dist/ (msix + cer + install.ps1 + dependencies)
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $Root 'CSMatchHelperWidget'
$CsprojPath = Join-Path $ProjectDir 'CSMatchHelperWidget.csproj'
$CertsDir = Join-Path $Root 'certs'
$DistDir = Join-Path $Root 'dist'
$PfxPath = Join-Path $CertsDir 'CSMatchHelperWidget.pfx'
$CerPath = Join-Path $CertsDir 'CSMatchHelperWidget.cer'
$SigningContractPath = Join-Path $Root 'signing-contract.json'
$SigningContract = Get-Content -LiteralPath $SigningContractPath -Raw -Encoding UTF8 | ConvertFrom-Json
$CertPassword = if ($env:WIDGET_SIGNING_CERT_PASSWORD) { $env:WIDGET_SIGNING_CERT_PASSWORD } else { 'csmatchhelper' }
$CertSubject = [string]$SigningContract.publisher
$CertThumbprint = ([string]$SigningContract.certificateThumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
$TimestampUrl = [string]$SigningContract.timestampUrl
$TimestampDigestAlgorithm = [string]$SigningContract.timestampDigestAlgorithm

function Find-MsBuild {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path $vswhere) {
        $found = & $vswhere -latest -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' |
            Select-Object -First 1
        if ($found) { return $found }
    }
    $candidates = @(
        "$env:ProgramFiles\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\MSBuild.exe"
    )
    return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Assert-SigningCertificate {
    foreach ($required in @($PfxPath, $CerPath)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "Missing fixed signing material: $required`nRestore the backed-up 196D...F8AA certificate. This build never generates a replacement."
        }
    }

    $securePassword = ConvertTo-SecureString -String $CertPassword -Force -AsPlainText
    $pfx = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
        $PfxPath,
        $securePassword,
        [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
    )
    $cer = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CerPath)
    foreach ($item in @($pfx, $cer)) {
        $thumbprint = ($item.Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
        if ($thumbprint -ne $CertThumbprint) {
            throw "Signing certificate thumbprint changed. Expected $CertThumbprint, actual $thumbprint"
        }
        if ($item.Subject -ne $CertSubject) {
            throw "Signing certificate subject changed. Expected '$CertSubject', actual '$($item.Subject)'"
        }
        if ((Get-Date) -lt $item.NotBefore -or (Get-Date) -gt $item.NotAfter) {
            throw "Signing certificate is outside its validity period: $($item.NotBefore) - $($item.NotAfter)"
        }
        $hasCodeSigningEku = @($item.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object {
            $_.EnhancedKeyUsages | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' }
        }).Count -gt 0
        if (-not $hasCodeSigningEku) { throw 'Signing certificate lacks the Code Signing EKU' }
    }
    if (-not $pfx.HasPrivateKey) { throw 'The fixed PFX does not contain its private key' }
    if (-not $TimestampUrl -or $TimestampDigestAlgorithm -ne 'SHA256') {
        throw 'signing-contract.json must configure an RFC 3161 timestamp URL and SHA256 digest'
    }
    Write-Host "==> Fixed signing certificate verified: $CertThumbprint"
}

$netCoreRefPath = "${env:ProgramFiles(x86)}\Reference Assemblies\Microsoft\Framework\.NETCore\v5.0"
if (-not (Test-Path $netCoreRefPath)) {
    throw @"
Missing UWP reference assemblies: $netCoreRefPath
Install Visual Studio workload: Universal Windows Platform development
"@
}

$msbuild = Find-MsBuild
if (-not $msbuild) {
    throw 'MSBuild not found. Install Visual Studio with UWP workload.'
}

Assert-SigningCertificate

Write-Host '==> Sync widget version to Package.appxmanifest...'
$RepoRoot = Split-Path -Parent $Root
& node (Join-Path $RepoRoot 'scripts/widget-version.mjs') sync
if ($LASTEXITCODE -ne 0) {
    throw "widget-version sync failed with exit code $LASTEXITCODE"
}

Write-Host '==> Sync widget icons from main app...'
& (Join-Path $Root 'sync-widget-icons.ps1')

Write-Host "==> Build Release appx: $msbuild"
$buildArgs = @(
    $CsprojPath,
    '/restore',
    '/t:Rebuild',
    '/p:Configuration=Release',
    '/p:Platform=x64',
    '/p:AppxPackageSigningEnabled=true',
    "/p:PackageCertificateKeyFile=$PfxPath",
    "/p:PackageCertificatePassword=$CertPassword",
    "/p:AppxPackageSigningTimestampServerUrl=$TimestampUrl",
    "/p:AppxPackageSigningTimestampDigestAlgorithm=$TimestampDigestAlgorithm",
    '/p:AppxBundle=Never',
    '/p:GenerateAppInstallerFile=false',
    '/v:minimal'
)
& $msbuild @buildArgs
if ($LASTEXITCODE -ne 0) {
    throw "MSBuild failed with exit code $LASTEXITCODE"
}

$appxSearchRoots = @(
    (Join-Path $ProjectDir 'bin\x64\Release\AppPackages'),
    (Join-Path $ProjectDir 'AppPackages')
)
$appx = $null
foreach ($searchRoot in $appxSearchRoots) {
    if (-not (Test-Path $searchRoot)) { continue }
    $appx = Get-ChildItem -Path $searchRoot -Include '*.appx', '*.msix' -Recurse -File |
        Where-Object { $_.Name -notmatch '\.(appxsym|appxupload)$' } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($appx) { break }
}

if (-not $appx) {
    throw 'No .appx or .msix found under AppPackages'
}

Write-Host "==> Package found: $($appx.FullName)"

if (Test-Path -LiteralPath $DistDir) {
    Get-ChildItem -LiteralPath $DistDir -Force | Remove-Item -Recurse -Force
} else {
    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
}
$distPackageName = "CSMatchHelperWidget$($appx.Extension)"
$distAppx = Join-Path $DistDir $distPackageName
$distCer = Join-Path $DistDir 'CSMatchHelperWidget.cer'
$distInstall = Join-Path $DistDir 'install.ps1'

Copy-Item -Path $appx.FullName -Destination $distAppx -Force
Copy-Item -Path $CerPath -Destination $distCer -Force

$depSource = Join-Path (Split-Path $appx.FullName -Parent) 'Dependencies\x64'
$depDest = Join-Path $DistDir 'Dependencies\x64'
if (Test-Path $depSource) {
    New-Item -ItemType Directory -Force -Path $depDest | Out-Null
    Get-ChildItem -Path $depSource -Filter '*.appx' | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination (Join-Path $depDest $_.Name) -Force
    }
}

Copy-Item -Path (Join-Path $Root 'install-user.ps1') -Destination $distInstall -Force
$installContent = Get-Content -LiteralPath $distInstall -Raw -Encoding UTF8
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($distInstall, $installContent, $utf8Bom)

Write-Host '==> Verify signatures and generate release-contract.json...'
& (Join-Path $Root 'verify-release.ps1') -PayloadDir $DistDir -GenerateReleaseContract
if ($LASTEXITCODE -ne 0) {
    throw "release verification failed with exit code $LASTEXITCODE"
}

Write-Host '==> Package release zip...'
& (Join-Path $Root 'package-release.ps1')

Write-Host ''
Write-Host 'Release build complete.'
Write-Host "  Dist folder: $DistDir"
Write-Host '  Files:'
Write-Host "    - $distPackageName"
Write-Host '    - CSMatchHelperWidget.cer'
Write-Host '    - Dependencies\x64\*.appx'
Write-Host '    - install.ps1'
Write-Host '    - release-contract.json'
Write-Host '    - CSMatchHelperGameBarWidget-*.zip'
