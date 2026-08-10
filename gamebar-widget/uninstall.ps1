#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Uninstall CS Match Helper Game Bar Widget.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PackageNames = @(
    'CSMatchHelper.GameBarWidget',
    'CSMatchHelper.CounterStrafingHudWidget'
)
$ExpectedThumbprint = '196D5DCC495BCFF5EABCA6C9650FA8975954F8AA'

Write-Host '==> Remove loopback exemption...'
foreach ($name in $PackageNames) {
    Get-AppxPackage -Name $name -ErrorAction SilentlyContinue |
        ForEach-Object {
            CheckNetIsolation LoopbackExempt -d -n="$($_.PackageFamilyName)" 2>$null
        }
}

Write-Host '==> Uninstall widget package...'
foreach ($name in $PackageNames) {
    Get-AppxPackage -Name $name -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-AppxPackage -Package $_.PackageFullName }
}

Write-Host '==> Remove the fixed TrustedPeople certificate...'
Get-ChildItem Cert:\LocalMachine\TrustedPeople -ErrorAction SilentlyContinue |
    Where-Object { (($_.Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()) -eq $ExpectedThumbprint } |
    Remove-Item -Force -ErrorAction Stop

$markerDir = Join-Path $env:LOCALAPPDATA 'CSMatchHelper\gamebar-widget'
if (Test-Path -LiteralPath $markerDir) {
    Remove-Item -LiteralPath (Join-Path $markerDir 'runtime-verified.json') -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $markerDir 'installed.pending') -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $markerDir 'install.ok') -Force -ErrorAction SilentlyContinue
}

Write-Host 'Uninstall complete.'
