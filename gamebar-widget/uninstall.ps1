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

Write-Host 'Uninstall complete.'
