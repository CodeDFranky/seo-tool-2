<#
.SYNOPSIS
    Cut and publish a DFR Toolkit release end-to-end.

.DESCRIPTION
    One command that:
      1. Validates and bumps the version across tauri.conf.json, Cargo.toml,
         and frontend/package.json.
      2. Rebuilds the Python backend exe with PyInstaller.
      3. Rebuilds the signed Tauri installer.
      4. Stages release files with URL-safe dot-style names.
      5. Generates latest.json with the freshly-minted signature.
      6. Commits, tags, and pushes.
      7. Creates the GitHub Release with installer + sig + latest.json
         attached, marked as latest.

    Installed clients pick the new version up on their next launch via the
    updater plugin.

.PARAMETER Version
    The new semver version, e.g. "0.1.1". Must be strictly greater than the
    current installed version or the updater will ignore it.

.PARAMETER DryRun
    Run all checks and builds, but skip the commit / tag / push / release
    publish. Useful for testing the pipeline without spending a tag.

.EXAMPLE
    .\scripts\release.ps1 0.1.1

.EXAMPLE
    .\scripts\release.ps1 0.2.0 -DryRun
#>

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Info($msg) { Write-Host "  $msg" -ForegroundColor Gray }
function Ok($msg)   { Write-Host "  [ok] $msg" -ForegroundColor Green }
function Die($msg)  { Write-Host "  [x] $msg" -ForegroundColor Red; exit 1 }

# -- 1. Pre-flight checks ------------------------------------------------------
Step "Pre-flight"

$status = git status --porcelain
if ($status -and -not $DryRun) {
    Die "Working tree is dirty. Commit or stash before releasing.`n$status"
}
Ok "Working tree clean"

$existingTag = git tag --list "v$Version"
if ($existingTag) { Die "Tag v$Version already exists. Pick a higher version." }
Ok "Tag v$Version is free"

$currentTag = git describe --tags --abbrev=0 2>$null
if ($currentTag) {
    $current = $currentTag.TrimStart('v')
    if ([version]$Version -le [version]$current) {
        Die "Version $Version is not higher than current $current. Updater ignores non-monotonic bumps."
    }
    Info "Bumping $current ->$Version"
} else {
    Info "First release: $Version"
}

# -- 2. Bump version in three files --------------------------------------------
Step "Bump version files"

$tauriConf = Join-Path $ProjectRoot "frontend\src-tauri\tauri.conf.json"
$cargoToml = Join-Path $ProjectRoot "frontend\src-tauri\Cargo.toml"
$pkgJson   = Join-Path $ProjectRoot "frontend\package.json"

# Helper: write a file as UTF-8 WITHOUT a BOM. Windows PowerShell 5.1's
# Set-Content -Encoding utf8 writes a BOM, which breaks JSON loaders
# (Vite, jq, etc.) -- they don't tolerate the 0xEF 0xBB 0xBF prefix.
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
function Write-Utf8NoBom($path, $content) {
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

$tauriRaw = [System.IO.File]::ReadAllText($tauriConf)
Write-Utf8NoBom $tauriConf ($tauriRaw -replace '("version"\s*:\s*)"[^"]+"', "`$1`"$Version`"")
Ok "tauri.conf.json -> $Version"

# Cargo.toml: only the [package] section's version, first match
$cargoRaw = [System.IO.File]::ReadAllText($cargoToml)
$cargoNew = [regex]::Replace($cargoRaw, '(?ms)(\[package\].*?^version\s*=\s*)"[^"]+"', "`$1`"$Version`"", 1)
Write-Utf8NoBom $cargoToml $cargoNew
Ok "Cargo.toml -> $Version"

$pkgRaw = [System.IO.File]::ReadAllText($pkgJson)
Write-Utf8NoBom $pkgJson ($pkgRaw -replace '("version"\s*:\s*)"[^"]+"', "`$1`"$Version`"")
Ok "package.json -> $Version"

# -- 3. Build backend exe ------------------------------------------------------
Step "Build Python backend"

Get-Process seo-backend -ErrorAction SilentlyContinue | Stop-Process -Force
# Start-Process (rather than `&` + `*>`) avoids the Windows-PowerShell
# foot-gun where stderr lines from a native exe get wrapped as
# ErrorRecord objects and trip $ErrorActionPreference = "Stop" -- even
# though PyInstaller's INFO lines go to stderr and the exit code is 0.
$proc = Start-Process -FilePath "$ProjectRoot\venv\Scripts\python.exe" `
    -ArgumentList "-m", "PyInstaller", "--noconfirm", "--clean", "$ProjectRoot\backend\seo-backend.spec" `
    -RedirectStandardOutput "$ProjectRoot\dist\pyinstaller-release.log" `
    -RedirectStandardError  "$ProjectRoot\dist\pyinstaller-release.err" `
    -NoNewWindow -Wait -PassThru
if ($proc.ExitCode -ne 0) { Die "PyInstaller failed (exit $($proc.ExitCode)). See dist\pyinstaller-release.{log,err}." }
Ok "seo-backend.exe rebuilt"

$sidecarTarget = "$ProjectRoot\frontend\src-tauri\binaries\seo-backend-x86_64-pc-windows-msvc.exe"
Copy-Item "$ProjectRoot\dist\seo-backend.exe" $sidecarTarget -Force
Ok "Copied to Tauri sidecar path"

# -- 4. Build signed Tauri installer -------------------------------------------
Step "Build Tauri installer"

if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "dfr-toolkit-dev"
    Info "Using placeholder signing password (override via TAURI_SIGNING_PRIVATE_KEY_PASSWORD env var)"
}
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$ProjectRoot\updater-keys\dfr-toolkit" -Raw

$proc = Start-Process -FilePath "npx" `
    -ArgumentList "tauri", "build" `
    -WorkingDirectory "$ProjectRoot\frontend" `
    -RedirectStandardOutput "$ProjectRoot\dist\tauri-release.log" `
    -RedirectStandardError  "$ProjectRoot\dist\tauri-release.err" `
    -NoNewWindow -Wait -PassThru
if ($proc.ExitCode -ne 0) { Die "tauri build failed (exit $($proc.ExitCode)). See dist\tauri-release.{log,err}." }
Ok "Installer + signature built"

# -- 5. Stage release files (URL-safe names) -----------------------------------
Step "Stage release files"

$bundleDir   = "$ProjectRoot\frontend\src-tauri\target\release\bundle\nsis"
$bundleExe   = Join-Path $bundleDir "DFR Toolkit_${Version}_x64-setup.exe"
$bundleSig   = "$bundleExe.sig"
if (-not (Test-Path $bundleExe)) { Die "Installer not found at $bundleExe" }
if (-not (Test-Path $bundleSig)) { Die "Signature not found at $bundleSig" }

$stageDir    = "$ProjectRoot\dist\release-v$Version"
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
$stagedExe   = "$stageDir\DFR.Toolkit_${Version}_x64-setup.exe"
$stagedSig   = "$stagedExe.sig"
$stagedJson  = "$stageDir\latest.json"
Copy-Item $bundleExe $stagedExe -Force
Copy-Item $bundleSig $stagedSig -Force
Ok "Staged in dist\release-v$Version\"

$sig = (Get-Content $stagedSig -Raw).Trim()
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$manifest = [ordered]@{
    version    = $Version
    notes      = "DFR Toolkit v$Version. See https://github.com/CodeDFranky/seo-tool-2/releases/tag/v$Version for details."
    pub_date   = $pubDate
    platforms  = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $sig
            url       = "https://github.com/CodeDFranky/seo-tool-2/releases/download/v$Version/DFR.Toolkit_${Version}_x64-setup.exe"
        }
    }
}
Write-Utf8NoBom $stagedJson ($manifest | ConvertTo-Json -Depth 10)
Ok "latest.json generated"

if ($DryRun) {
    Step "Dry run complete"
    Info "Files staged at: $stageDir"
    Info "Skipped: commit, tag, push, gh release create"
    exit 0
}

# -- 6. Commit, tag, push ------------------------------------------------------
Step "Commit + tag + push"

git add frontend/src-tauri/tauri.conf.json frontend/src-tauri/Cargo.toml frontend/package.json frontend/src-tauri/Cargo.lock 2>$null
git commit -m "Release: v$Version" | Out-Null
Ok "Commit created"

git tag "v$Version"
Ok "Tag v$Version created"

git push origin master --tags
Ok "Pushed to origin"

# -- 7. Publish GitHub Release -------------------------------------------------
Step "Publish GitHub Release"

gh release create "v$Version" `
    --title "v$Version" `
    --notes "DFR Toolkit v$Version.`n`nDownload and double-click the installer below. Windows SmartScreen will warn; click ""More info"" then ""Run anyway"" (unsigned binary; harmless).`n`nThe app will auto-update on its next launch for anyone already on an older version." `
    --latest `
    $stagedExe $stagedJson

# Note: .sig is intentionally NOT uploaded as a release asset. The
# minisign signature is already embedded inline in latest.json (the
# updater reads it from there). Uploading a separate .sig file would be
# redundant clutter on the GitHub Releases UI.

if ($LASTEXITCODE -ne 0) { Die "gh release create failed." }

Write-Host "`n[ok] Released v$Version" -ForegroundColor Green
Write-Host "   https://github.com/CodeDFranky/seo-tool-2/releases/tag/v$Version" -ForegroundColor Green
Write-Host "   Installed clients will pick this up on next launch.`n"
