#Requires -RunAsAdministrator
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
$CertPassword = 'csmatchhelper'
$CertSubject = 'CN=CSMatchHelperDev'

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

function Ensure-SigningCertificate {
    if ((Test-Path $PfxPath) -and (Test-Path $CerPath)) {
        Write-Host "==> Using existing signing cert: $PfxPath"
        return
    }

    Write-Host '==> Create self-signed code signing certificate...'
    New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null

    $securePassword = ConvertTo-SecureString -String $CertPassword -Force -AsPlainText
    $cert = New-SelfSignedCertificate `
        -Subject $CertSubject `
        -Type CodeSigningCert `
        -KeyUsage DigitalSignature `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -CertStoreLocation 'Cert:\CurrentUser\My' `
        -NotAfter (Get-Date).AddYears(5)

    Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $securePassword | Out-Null
    Export-Certificate -Cert $cert -FilePath $CerPath | Out-Null
    Write-Host "    PFX: $PfxPath"
    Write-Host "    CER: $CerPath"
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

Ensure-SigningCertificate

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

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
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
Write-Host '    - CSMatchHelperGameBarWidget-*.zip'
