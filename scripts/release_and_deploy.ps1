<#
Release & Deploy helper (PowerShell)

Usage (in repo root):
  $env:VERCEL_TOKEN = '<your_vercel_token>'
  .\scripts\release_and_deploy.ps1 -Message "Release message"

This script will:
- git add, commit (if there are changes), create a date-based tag, push
- run `npx vercel --prod` to deploy (requires `VERCEL_TOKEN` env var or you can be logged in via `vercel login`)

Note: This script runs locally — CI deployments still require Vercel project settings to have `BDAG_RPC` set.
#>

param(
    [string]$Message = "Release: auto",
    [switch]$Force
)

function AbortIf($cond, $msg) {
    if ($cond) { Write-Error $msg; exit 1 }
}

Write-Host "Starting release+deploy helper"

$pwdPath = (Get-Location).Path
Write-Host "Repo root: $pwdPath"

# Ensure git is available
AbortIf(-not (Get-Command git -ErrorAction SilentlyContinue), "git is not available in PATH")

# Ensure Vercel CLI or npx is available
AbortIf(-not (Get-Command npx -ErrorAction SilentlyContinue), "npx is not available in PATH")

# Show status
git status --porcelain

if (-not $Force) {
    $ok = Read-Host "Proceed with commit/tag/push and deploy? (y/N)"
    if ($ok.ToLower() -ne 'y') { Write-Host "Aborted by user"; exit 0 }
}

# Commit any changes
$changes = (git status --porcelain)
if ($changes) {
    git add -A
    git commit -m "$Message"
    Write-Host "Committed changes"
} else {
    Write-Host "No working-tree changes to commit"
}

# Create tag
$tag = "v$(Get-Date -Format 'yyyyMMdd-HHmmss')"
git tag -a $tag -m "$Message"
Write-Host "Created tag: $tag"

# Push branch and tags
git push origin HEAD
git push origin $tag

# Deploy via Vercel
if (-not $env:VERCEL_TOKEN) {
    Write-Warning "VERCEL_TOKEN not set. Attempting interactive vercel deploy (may prompt)."
    npx vercel --prod
} else {
    Write-Host "Using VERCEL_TOKEN for non-interactive deploy"
    npx vercel --prod --token $env:VERCEL_TOKEN
}

Write-Host "Done. Check Vercel dashboard for deployment status."
