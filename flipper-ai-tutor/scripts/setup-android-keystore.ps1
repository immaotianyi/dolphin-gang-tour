# 生成 Android 发布签名 keystore（beta 测试用）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/setup-android-keystore.ps1

param(
    [string]$KeystorePath = "",
    [string]$KeyAlias = "dgt-beta",
    [string]$StorePassword = "",
    [int]$ValidityDays = 10000
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

if (-not $KeystorePath) {
    $KeystorePath = Join-Path $Root "src-tauri\android-keystore\dgt-beta.jks"
}

if (-not $StorePassword) {
    $StorePassword = if ($env:DGT_ANDROID_KEYSTORE_PASSWORD) { $env:DGT_ANDROID_KEYSTORE_PASSWORD } else { "dgt-beta-2026" }
}

$KeyPassword = if ($env:DGT_ANDROID_KEY_PASSWORD) { $env:DGT_ANDROID_KEY_PASSWORD } else { $StorePassword }

if (Test-Path $KeystorePath) {
    Write-Host "Keystore already exists: $KeystorePath" -ForegroundColor Green
    exit 0
}

$JavaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot" }
$Keytool = Join-Path $JavaHome "bin\keytool.exe"
if (-not (Test-Path $Keytool)) {
    throw "keytool not found. Set JAVA_HOME or install JDK 21."
}

$KeystoreDir = Split-Path $KeystorePath -Parent
New-Item -ItemType Directory -Force -Path $KeystoreDir | Out-Null

Write-Host "Creating Android keystore: $KeystorePath" -ForegroundColor Cyan
Write-Host "Alias: $KeyAlias"

$dname = "CN=Dolphin Gang Tour Beta, OU=Mobile, O=naante845, L=Unknown, ST=Unknown, C=CN"
$args = @(
    "-genkeypair",
    "-v",
    "-keystore", $KeystorePath,
    "-alias", $KeyAlias,
    "-keyalg", "RSA",
    "-keysize", "2048",
    "-validity", "$ValidityDays",
    "-storepass", $StorePassword,
    "-keypass", $KeyPassword,
    "-dname", $dname
)

& $Keytool @args
if ($LASTEXITCODE -ne 0) { throw "keytool failed" }

Write-Host "Keystore created." -ForegroundColor Green
Write-Host "Set DGT_ANDROID_KEYSTORE_PASSWORD for CI if you use a custom password."
