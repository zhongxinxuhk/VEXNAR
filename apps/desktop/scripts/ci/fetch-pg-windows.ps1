# Builds a trimmed portable PostgreSQL for Windows x64.
#
# EnterpriseDB publishes the official Windows binaries as a zip. The workflow
# downloads that zip, keeps only the server/client pieces used by the desktop
# app, and packages it as pg/ so electron-builder can copy it into resources.
param(
  [string]$Version = $(if ($env:PG_VERSION) { $env:PG_VERSION } else { "16.16" }),
  [string]$Out = ""
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$work = Join-Path $root ".pg-build-windows"
$dest = Join-Path $work "pg"
$zip = Join-Path $work "postgresql-$Version-windows-x64-binaries.zip"
$url = "https://get.enterprisedb.com/postgresql/postgresql-$Version-1-windows-x64-binaries.zip"
if (-not $Out) { $Out = Join-Path $root "dist/pg-windows-x64.zip" }

New-Item -ItemType Directory -Force -Path $work, (Split-Path $Out) | Out-Null

if (-not (Test-Path $zip)) {
  Write-Host "[pg-win] downloading PostgreSQL $Version..."
  Invoke-WebRequest -Uri $url -OutFile $zip
}

$extract = Join-Path $work "extract"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extract

$source = Join-Path $extract "pgsql"
if (-not (Test-Path (Join-Path $source "bin/initdb.exe"))) {
  throw "downloaded archive does not contain pgsql/bin/initdb.exe"
}

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $source "*") $dest -Recurse -Force

$keepBins = @(
  "postgres.exe", "initdb.exe", "pg_ctl.exe", "psql.exe",
  "createdb.exe", "pg_dump.exe", "pg_restore.exe", "pg_isready.exe"
)
Get-ChildItem (Join-Path $dest "bin") -File | Where-Object {
  $keepBins -notcontains $_.Name -and $_.Extension -eq ".exe"
} | Remove-Item -Force

foreach ($dir in @("include", "doc", "pgAdmin 4", "StackBuilder", "symbols")) {
  $path = Join-Path $dest $dir
  if (Test-Path $path) { Remove-Item $path -Recurse -Force }
}
Get-ChildItem (Join-Path $dest "lib") -File -Filter "*.lib" -ErrorAction SilentlyContinue |
  Remove-Item -Force
Get-ChildItem (Join-Path $dest "lib") -File -Filter "*.a" -ErrorAction SilentlyContinue |
  Remove-Item -Force

@{
  version = $Version
  os = "windows"
  arch = "x64"
  static = $false
  relocatable = $true
  built_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json | Set-Content (Join-Path $dest "pg.version.json")

if (Test-Path $Out) { Remove-Item $Out -Force }
Compress-Archive -Path $dest -DestinationPath $Out -CompressionLevel Optimal
$size = "{0:N1} MB" -f ((Get-Item $Out).Length / 1MB)
Write-Host "[pg-win] wrote $Out ($size)"
