# Catalogue historical SmartMLS OpenHouse events into Neon.
#
# Not the hourly Open houses job. That job only refreshes today → +90 days.
# This fills past showings so /open-houses Most / First / pastCount have history.
#
# From the repo root, with DATABASE_URL + RETS_* in .env.local
# (use the production Neon URL if you want tmrebuilder.com to see the rows):
#
#   .\scripts\backfill-open-houses.ps1
#   .\scripts\backfill-open-houses.ps1 -Days 365 -ChunkDays 14
#   .\scripts\backfill-open-houses.ps1 -MaxMinutes 45
#   .\scripts\backfill-open-houses.ps1 -OldestFirst
#
# Re-runs are safe. Newest-first so recent history lands even if you stop early.

[CmdletBinding()]
param(
  [int]$Days = 365,
  [int]$ChunkDays = 14,
  [int]$MaxMinutes = 0,
  [switch]$OldestFirst
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot 'package.json'))) {
  throw "Run this from the tmre-website repo (missing package.json under $RepoRoot)."
}

Set-Location $RepoRoot

$envFile = Join-Path $RepoRoot '.env.local'
if (-not (Test-Path $envFile)) {
  throw "Missing .env.local — needs DATABASE_URL, RETS_SERVER_URL, RETS_USERNAME, RETS_PASSWORD."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is not on PATH. Install Node 20+ and retry.'
}

$npmArgs = @(
  'run', 'backfill:open-houses', '--',
  "--days=$Days",
  "--chunk-days=$ChunkDays"
)
if ($MaxMinutes -gt 0) {
  $npmArgs += "--max-minutes=$MaxMinutes"
}
if ($OldestFirst) {
  $npmArgs += '--oldest-first'
}

Write-Host "Open house history backfill (not the hourly calendar job)"
Write-Host "  $RepoRoot"
Write-Host "  npm $($npmArgs -join ' ')"
Write-Host ""

& npm @npmArgs
if ($LASTEXITCODE -ne 0) {
  throw "backfill:open-houses exited $LASTEXITCODE"
}
