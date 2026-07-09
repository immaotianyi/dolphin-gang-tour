# 使用 apksigner 为 release APK 签名（修复 Android 11+ 安装时 packageInfo is null）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/sign-android-apk.ps1 -UnsignedApk path\to\unsigned.apk -SignedApk path\to\signed.apk

param(
    [Parameter(Mandatory = $true)][string]$UnsignedApk,
    [Parameter(Mandatory = $true)][string]$SignedApk,
    [string]$KeystorePath = "",
    [string]$KeyAlias = "dgt-beta",
    [string]$StorePassword = "",
    [string]$KeyPassword = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path $UnsignedApk)) {
    throw "Unsigned APK not found: $UnsignedApk"
}

$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "D:\Android\Sdk" }
if (-not (Test-Path $env:ANDROID_HOME)) {
    throw "ANDROID_HOME not found: $($env:ANDROID_HOME)"
}

if (-not $KeystorePath) {
    $KeystorePath = if ($env:DGT_ANDROID_KEYSTORE) {
        $env:DGT_ANDROID_KEYSTORE
    } else {
        Join-Path $Root "src-tauri\android-keystore\dgt-beta.jks"
    }
}

if (-not (Test-Path $KeystorePath)) {
    Write-Host "Keystore missing, generating..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "setup-android-keystore.ps1") -KeystorePath $KeystorePath -KeyAlias $KeyAlias
}

if (-not $StorePassword) {
    $StorePassword = if ($env:DGT_ANDROID_KEYSTORE_PASSWORD) { $env:DGT_ANDROID_KEYSTORE_PASSWORD } else { "dgt-beta-2026" }
}
if (-not $KeyPassword) {
    $KeyPassword = if ($env:DGT_ANDROID_KEY_PASSWORD) { $env:DGT_ANDROID_KEY_PASSWORD } else { $StorePassword }
}

$BuildToolsRoot = Join-Path $env:ANDROID_HOME "build-tools"
$BuildTools = Get-ChildItem $BuildToolsRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1
if (-not $BuildTools) {
    throw "Android build-tools not found under $BuildToolsRoot"
}

$Apksigner = Join-Path $BuildTools.FullName "apksigner.bat"
$Zipalign = Join-Path $BuildTools.FullName "zipalign.exe"
if (-not (Test-Path $Apksigner)) { throw "apksigner not found: $Apksigner" }
if (-not (Test-Path $Zipalign)) { throw "zipalign not found: $Zipalign" }

$SignedDir = Split-Path $SignedApk -Parent
if ($SignedDir) {
    New-Item -ItemType Directory -Force -Path $SignedDir | Out-Null
}

$AlignedApk = [System.IO.Path]::ChangeExtension($UnsignedApk, ".aligned.apk")
if (Test-Path $AlignedApk) { Remove-Item $AlignedApk -Force }
if (Test-Path $SignedApk) { Remove-Item $SignedApk -Force }

Write-Host "=== zipalign ===" -ForegroundColor Cyan
cmd /c "`"$Zipalign`" -f -p 4 `"$UnsignedApk`" `"$AlignedApk`""
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Host "=== apksigner (v1 + v2) ===" -ForegroundColor Cyan
cmd /c "`"$Apksigner`" sign --ks `"$KeystorePath`" --ks-key-alias $KeyAlias --ks-pass pass:$StorePassword --key-pass pass:$KeyPassword --v1-signing-enabled true --v2-signing-enabled true --out `"$SignedApk`" `"$AlignedApk`""
if ($LASTEXITCODE -ne 0) { throw "apksigner sign failed" }

Write-Host "=== verify ===" -ForegroundColor Cyan
cmd /c "`"$Apksigner`" verify --verbose `"$SignedApk`""
if ($LASTEXITCODE -ne 0) { throw "apksigner verify failed" }

Remove-Item $AlignedApk -Force -ErrorAction SilentlyContinue

$sizeMb = [math]::Round((Get-Item $SignedApk).Length / 1MB, 2)
Write-Host "Signed APK: $SignedApk ($sizeMb MB)" -ForegroundColor Green
