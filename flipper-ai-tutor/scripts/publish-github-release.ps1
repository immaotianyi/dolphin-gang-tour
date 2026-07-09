# 发布 GitHub Release 并上传安装包（参考 cc-switch Releases 风格）
# 前置: gh auth login  或  $env:GH_TOKEN = "ghp_..."
# 用法:
#   单版本:  ... -Tag v2.0.0-beta.0
#   全部版本: ... -AllVersions

param(
    [string]$Tag = "v2.0.0-beta.0",
    [string]$Repo = "immaotianyi/dolphin-gang-tour",
    [string]$InstallersDir = "",
    [switch]$AllVersions,
    [switch]$Draft
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$RepoRoot = Split-Path $Root -Parent

if (-not $InstallersDir) {
    $InstallersDir = Join-Path $env:USERPROFILE "Desktop\Dolphin-Gang-Tour-Installers"
}

$ManifestPath = Join-Path $RepoRoot ".github\downloads-manifest.json"
if (-not (Test-Path $ManifestPath)) {
    throw "Manifest not found: $ManifestPath"
}
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) { throw "GitHub CLI (gh) not found. Install: winget install GitHub.cli" }

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0 -and -not $env:GH_TOKEN) {
    Write-Host "请先登录 GitHub: gh auth login" -ForegroundColor Yellow
    exit 1
}

function Publish-OneRelease {
    param([object]$Release)

    $tag = $Release.tag
    $ver = $Release.version
    Write-Host "`n========== $tag ==========" -ForegroundColor Cyan

    $NotesFile = Join-Path $RepoRoot ".github\release-notes\$ver.md"
    if (-not (Test-Path $NotesFile)) {
        $NotesFile = Join-Path $Root "CHANGELOG.md"
    }

    $Assets = @()
    foreach ($asset in $Release.assets) {
        $p = Join-Path $InstallersDir $asset.filename
        if (Test-Path $p) {
            $Assets += $p
            Write-Host "  + $($asset.filename)" -ForegroundColor Green
        } else {
            Write-Host "  - $($asset.filename) (skip)" -ForegroundColor DarkYellow
        }
    }
    if ($Assets.Count -eq 0) {
        Write-Host "No assets for $tag, skip." -ForegroundColor Yellow
        return
    }

    gh release view $tag -R $Repo 2>$null
    $exists = ($LASTEXITCODE -eq 0)
    $latestFlag = if ($Release.latest) { "--latest" } else { "" }

    if (-not $exists) {
        $args = @("release", "create", $tag, "-R", $Repo, "--title", "Dolphin Gang Tour $ver", "--notes-file", $NotesFile)
        if ($Draft) { $args += "--draft" }
        elseif ($Release.latest) { $args += "--latest" }
        gh @args
        if ($LASTEXITCODE -ne 0) { throw "gh release create failed: $tag" }
    }

    foreach ($asset in $Assets) {
        gh release upload $tag $asset -R $Repo --clobber
        if ($LASTEXITCODE -ne 0) { throw "Upload failed: $asset" }
    }

    Write-Host "OK: https://github.com/$Repo/releases/tag/$tag" -ForegroundColor Green
}

Set-Location $RepoRoot
Write-Host "Repository: $Repo" -ForegroundColor Cyan
Write-Host "Installers: $InstallersDir" -ForegroundColor Cyan

if ($AllVersions) {
    foreach ($rel in $Manifest.releases) {
        Publish-OneRelease -Release $rel
    }
} else {
    $match = $Manifest.releases | Where-Object { $_.tag -eq $Tag } | Select-Object -First 1
    if (-not $match) { throw "Tag not in manifest: $Tag" }
    Publish-OneRelease -Release $match
}

Write-Host "`n=== All requested releases published ===" -ForegroundColor Green
