# 对最近一次 Gradle 构建的 unsigned release APK 签名并输出到桌面安装包目录
# 用法: powershell -ExecutionPolicy Bypass -File scripts/sign-latest-android-apk.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$OutDir = Join-Path $env:USERPROFILE "Desktop\Dolphin-Gang-Tour-Installers"
$Dest = Join-Path $OutDir "Dolphin-Gang-Tour-v2.0beta-Android-arm64.apk"

$Unsigned = Get-ChildItem (Join-Path $Root "src-tauri\gen\android\app\build\outputs\apk") -Filter "*unsigned*.apk" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $Unsigned) {
    throw "No unsigned release APK found. Run npm run tauri:android:build first."
}

Write-Host "Signing: $($Unsigned.FullName)" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "sign-android-apk.ps1") -UnsignedApk $Unsigned.FullName -SignedApk $Dest
