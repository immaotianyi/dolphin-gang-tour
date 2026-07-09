# 从 Git Credential Manager 读取 GitHub 凭据并完成 push + Release 上传
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

function Get-GitHubTokenFromCredentialManager {
    $credInput = "protocol=https`nhost=github.com`n`n"
    $credOutput = ($credInput | git -c credential.helper=manager credential fill 2>&1) -join "`n"
    if ($credOutput -match 'password=(.+)') { return $Matches[1].Trim() }
    return $null
}

$token = if ($env:GH_TOKEN) { $env:GH_TOKEN } else { Get-GitHubTokenFromCredentialManager }
if (-not $token) { throw "No GitHub credentials. Login via GitHub Desktop or set GH_TOKEN." }

$env:GH_TOKEN = $token
gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { $token | gh auth login --with-token | Out-Null }

Set-Location $RepoRoot
$branch = "release/v2.0.0-beta.0-downloads"
git checkout -B $branch 2>$null

Write-Host "=== git push origin $branch ===" -ForegroundColor Cyan
git -c credential.helper=manager push -u origin $branch --force-with-lease
if ($LASTEXITCODE -ne 0) { throw "git push branch failed" }

Write-Host "`n=== GitHub Releases (all versions) ===" -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot "flipper-ai-tutor")
& (Join-Path $PSScriptRoot "publish-github-release.ps1") -AllVersions
Pop-Location

Write-Host "`nDone: https://github.com/immaotianyi/dolphin-gang-tour/releases" -ForegroundColor Green
