# 发布 GitHub Release 并上传安装包（参考 cc-switch Releases 风格）
# 前置: gh auth login  或  $env:GH_TOKEN = "ghp_..."
# 用法: powershell -ExecutionPolicy Bypass -File scripts/publish-github-release.ps1

param(
    [string]$Tag = "v2.0.0-beta.0",
    [string]$Repo = "immaotianyi/dolphin-gang-tour",
    [string]$InstallersDir = "",
    [switch]$Draft
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$RepoRoot = Split-Path $Root -Parent

if (-not $InstallersDir) {
    $InstallersDir = Join-Path $env:USERPROFILE "Desktop\Dolphin-Gang-Tour-Installers"
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    throw "GitHub CLI (gh) not found. Install: winget install GitHub.cli"
}

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0 -and -not $env:GH_TOKEN) {
    Write-Host "请先登录 GitHub:" -ForegroundColor Yellow
    Write-Host "  gh auth login" -ForegroundColor Cyan
    Write-Host "或设置环境变量 GH_TOKEN（Personal Access Token，需 repo 权限）"
    exit 1
}

Set-Location $RepoRoot
Write-Host "Repository: $Repo" -ForegroundColor Cyan
Write-Host "Tag:        $Tag" -ForegroundColor Cyan
Write-Host "Installers: $InstallersDir" -ForegroundColor Cyan

$Ver = $Tag -replace '^v', ''
$NotesFile = Join-Path $RepoRoot ".github\release-notes\$Ver.md"
if (-not (Test-Path $NotesFile)) {
    $NotesFile = Join-Path $Root "CHANGELOG.md"
}

$AssetPatterns = @(
    "Dolphin-Gang-Tour-v2.0beta-Windows-x64-Setup.exe",
    "Dolphin-Gang-Tour-v2.0beta-macOS-arm64.dmg",
    "Dolphin-Gang-Tour-v2.0beta-macOS-x64.dmg",
    "Dolphin-Gang-Tour-v2.0beta-Android-arm64.apk"
)

$Assets = @()
foreach ($pat in $AssetPatterns) {
    $p = Join-Path $InstallersDir $pat
    if (Test-Path $p) {
        $Assets += $p
        Write-Host "  + $pat ($([math]::Round((Get-Item $p).Length / 1MB, 2)) MB)" -ForegroundColor Green
    } else {
        Write-Host "  - $pat (skip, not found)" -ForegroundColor DarkYellow
    }
}

if ($Assets.Count -eq 0) {
    throw "No installer files found in $InstallersDir"
}

$draftFlag = if ($Draft) { "--draft" } else { "" }
$releaseExists = $false
gh release view $Tag -R $Repo 2>$null
if ($LASTEXITCODE -eq 0) { $releaseExists = $true }

if (-not $releaseExists) {
    Write-Host "`nCreating release $Tag ..." -ForegroundColor Cyan
    if ($draftFlag) {
        gh release create $Tag -R $Repo --title "Dolphin Gang Tour $Ver" --notes-file $NotesFile --draft
    } else {
        gh release create $Tag -R $Repo --title "Dolphin Gang Tour $Ver" --notes-file $NotesFile --latest
    }
    if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }
} else {
    Write-Host "`nRelease $Tag exists, uploading assets ..." -ForegroundColor Cyan
}

foreach ($asset in $Assets) {
    Write-Host "Uploading $(Split-Path $asset -Leaf) ..." -ForegroundColor Cyan
    gh release upload $Tag $asset -R $Repo --clobber
    if ($LASTEXITCODE -ne 0) { throw "Upload failed: $asset" }
}

$url = "https://github.com/$Repo/releases/tag/$Tag"
Write-Host "`n=== Release published ===" -ForegroundColor Green
Write-Host $url
