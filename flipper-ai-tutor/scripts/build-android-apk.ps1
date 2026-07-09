# 构建 Android APK（arm64，适配真机测试）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "D:\Android\Sdk" }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_NDK_HOME = Join-Path $env:ANDROID_HOME "ndk\26.1.10909125"
$env:NDK_HOME = $env:ANDROID_NDK_HOME
$env:CARGO_TARGET_DIR = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { "D:\dgt-build\target" }
$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot" }
$env:PATH = "$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

function Set-NdkToolchain {
    param([int]$Api = 24)
    $Bin = Join-Path $env:ANDROID_NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\bin"
    $Clang = Join-Path $Bin "aarch64-linux-android$Api-clang.cmd"
    if (-not (Test-Path $Clang)) { throw "NDK clang not found: $Clang" }
    $env:CC_aarch64_linux_android = $Clang
    $env:CXX_aarch64_linux_android = Join-Path $Bin "aarch64-linux-android$Api-clang++.cmd"
    $env:AR_aarch64_linux_android = Join-Path $Bin "llvm-ar.exe"
    $env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $Clang
}

$OutDir = Join-Path $env:USERPROFILE "Desktop\Dolphin-Gang-Tour-Installers"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Push-Location $Root
try {
    Write-Host "=== 1/4 Frontend ===" -ForegroundColor Cyan
    cmd /c "npm run build"

    Write-Host "=== 2/4 Rust arm64 (custom-protocol embeds UI) ===" -ForegroundColor Cyan
    Set-NdkToolchain -Api 24
    Push-Location src-tauri
    cmd /c "cargo build --lib --release --target aarch64-linux-android --features tauri/custom-protocol"
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }
    Pop-Location

    $LibSrc = Join-Path $env:CARGO_TARGET_DIR "aarch64-linux-android\release\libflipper_ai_tutor_lib.so"
    if (-not (Test-Path $LibSrc)) { throw "Native lib not found: $LibSrc" }

    $JniDir = Join-Path $Root "src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
    New-Item -ItemType Directory -Force -Path $JniDir | Out-Null
    Copy-Item $LibSrc (Join-Path $JniDir "libflipper_ai_tutor_lib.so") -Force
    Write-Host "Native lib: $([math]::Round((Get-Item $LibSrc).Length / 1MB, 2)) MB -> jniLibs/arm64-v8a" -ForegroundColor Green

    Write-Host "=== 3/4 Android SDK 36 ===" -ForegroundColor Cyan
    $SdkMgr = Join-Path $env:ANDROID_HOME "cmdline-tools\latest\bin\sdkmanager.bat"
    if (-not (Test-Path (Join-Path $env:ANDROID_HOME "platforms\android-36"))) {
        cmd /c "echo y| `"$SdkMgr`" --sdk_root=$env:ANDROID_HOME `"platforms;android-36`""
    }

    Write-Host "=== 4/4 Gradle APK ===" -ForegroundColor Cyan
    Push-Location src-tauri\gen\android
    cmd /c "gradlew.bat assembleArm64Release -PabiList=arm64-v8a -ParchList=arm64 -PtargetList=aarch64 --no-daemon"
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }
    Pop-Location

    $Apk = Get-ChildItem (Join-Path $Root "src-tauri\gen\android\app\build\outputs\apk") -Filter "*.apk" -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "release" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $Apk) { throw "APK not found" }

    Write-Host "=== 5/5 Sign APK (v1+v2, fixes packageInfo is null) ===" -ForegroundColor Cyan
    $Dest = Join-Path $OutDir "Dolphin-Gang-Tour-v2.0beta-Android-arm64.apk"
    $SignScript = Join-Path $Root "scripts\sign-android-apk.ps1"
    & $SignScript -UnsignedApk $Apk.FullName -SignedApk $Dest
    if ($LASTEXITCODE -ne 0) { throw "APK signing failed" }

    Write-Host ""
    Write-Host "Signed APK ready: $Dest" -ForegroundColor Green
    Write-Host "Size: $([math]::Round((Get-Item $Dest).Length / 1MB, 2)) MB"
} finally {
    Pop-Location
}
