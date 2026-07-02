<#
.SYNOPSIS
  Sync UWP tile assets from main app icons (src-tauri/icons).
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$IconDir = Join-Path (Split-Path -Parent $Root) 'src-tauri\icons'
$AssetsDir = Join-Path $Root 'CSMatchHelperWidget\Assets'

if (-not (Test-Path $IconDir)) {
    throw "App icon folder not found: $IconDir"
}

New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null

function Copy-Icon($name) {
    $src = Join-Path $IconDir $name
    if (-not (Test-Path $src)) {
        throw "Missing icon: $src"
    }
    Copy-Item -Path $src -Destination (Join-Path $AssetsDir $name) -Force
}

function Save-Png($bitmap, $path) {
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-CenteredTile($sourcePath, $width, $height, $logoSize) {
    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $icon = [System.Drawing.Image]::FromFile($sourcePath)
    try {
        $x = [int](($width - $logoSize) / 2)
        $y = [int](($height - $logoSize) / 2)
        $graphics.DrawImage($icon, $x, $y, $logoSize, $logoSize)
    }
    finally {
        $icon.Dispose()
        $graphics.Dispose()
    }

    return $bitmap
}

function New-ResizedIcon($sourcePath, $size) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $icon = [System.Drawing.Image]::FromFile($sourcePath)
    try {
        $graphics.DrawImage($icon, 0, 0, $size, $size)
    }
    finally {
        $icon.Dispose()
        $graphics.Dispose()
    }
    return $bitmap
}

$logo150 = Join-Path $IconDir 'Square150x150Logo.png'

Copy-Icon 'Square150x150Logo.png'
Copy-Icon 'Square44x44Logo.png'
Copy-Icon 'StoreLogo.png'

$wide = New-CenteredTile $logo150 310 150 150
Save-Png $wide (Join-Path $AssetsDir 'Wide310x150Logo.png')
$wide.Dispose()

$splash = New-CenteredTile $logo150 620 300 180
Save-Png $splash (Join-Path $AssetsDir 'SplashScreen.png')
$splash.Dispose()

$lock = New-ResizedIcon (Join-Path $IconDir 'Square44x44Logo.png') 24
Save-Png $lock (Join-Path $AssetsDir 'LockScreenLogo.png')
$lock.Dispose()

Write-Host "Widget icons synced to $AssetsDir"
