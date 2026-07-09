# Dolphin Gang Tour — Android 开发环境配置
# 用法: powershell -ExecutionPolicy Bypass -File scripts/setup-android.ps1

$ErrorActionPreference = "Stop"

$SdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$CmdlineTools = Join-Path $SdkRoot "cmdline-tools\latest\bin"

Write-Host "=== Dolphin Gang Tour Android Setup ===" -ForegroundColor Cyan
Write-Host "SDK root: $SdkRoot"

if (-not (Test-Path $SdkRoot)) {
    New-Item -ItemType Directory -Force -Path $SdkRoot | Out-Null
    Write-Host "Created SDK directory" -ForegroundColor Yellow
}

if (-not (Test-Path (Join-Path $CmdlineTools "sdkmanager.bat"))) {
    Write-Host ""
    Write-Host "Android command-line tools not found." -ForegroundColor Yellow
    Write-Host "Install Android Studio, or download command-line tools from:"
    Write-Host "  https://developer.android.com/studio#command-line-tools-only"
    Write-Host ""
    Write-Host "Then set ANDROID_HOME=$SdkRoot and re-run this script."
    exit 1
}

$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:PATH = "$CmdlineTools;$SdkRoot\platform-tools;$env:PATH"

Write-Host "Installing SDK components (NDK, platform-tools, build-tools)..." -ForegroundColor Cyan
& sdkmanager.bat --sdk_root=$SdkRoot `
    "platform-tools" `
    "platforms;android-34" `
    "build-tools;34.0.0" `
    "ndk;26.1.10909125"

Write-Host "Accepting licenses..." -ForegroundColor Cyan
cmd /c "echo y | sdkmanager.bat --sdk_root=$SdkRoot --licenses" | Out-Null

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    if (-not (Test-Path "src-tauri\gen\android")) {
        Write-Host "Running tauri android init..." -ForegroundColor Cyan
        npm run tauri:android:init
    } else {
        Write-Host "Android project already initialized (src-tauri/gen/android)" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "Creating Android signing keystore (required for installable release APK)..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "setup-android-keystore.ps1")

    Write-Host "Setup complete. Next steps:" -ForegroundColor Green
    Write-Host "  1. Set user env: ANDROID_HOME=$SdkRoot"
    Write-Host "  2. Dev on device/emulator: npm run tauri:android:dev"
    Write-Host "  3. Build signed APK:     npm run tauri:android:build"
} finally {
    Pop-Location
}
