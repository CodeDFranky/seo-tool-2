<#
Verify the three version sources match. Run as a pre-commit guard so a
bumped version in one file never ships without the others matching.

Exits 0 if versions agree, 1 with a diff report if they don't.
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$tauriConf = Get-Content "$root\frontend\src-tauri\tauri.conf.json" -Raw
$cargoToml = Get-Content "$root\frontend\src-tauri\Cargo.toml" -Raw
$pkgJson   = Get-Content "$root\frontend\package.json" -Raw

$tauriV = if ($tauriConf -match '"version"\s*:\s*"([^"]+)"')             { $matches[1] }
$cargoV = if ($cargoToml -match '(?ms)\[package\].*?^version\s*=\s*"([^"]+)"') { $matches[1] }
$pkgV   = if ($pkgJson   -match '"version"\s*:\s*"([^"]+)"')             { $matches[1] }

$found = [ordered]@{
    "tauri.conf.json"           = $tauriV
    "src-tauri\Cargo.toml"      = $cargoV
    "frontend\package.json"     = $pkgV
}

$unique = $found.Values | Sort-Object -Unique
if ($unique.Count -eq 1) { exit 0 }

Write-Host "✗ Version skew across files:" -ForegroundColor Red
foreach ($entry in $found.GetEnumerator()) {
    Write-Host ("  {0,-26} {1}" -f $entry.Key, $entry.Value) -ForegroundColor Yellow
}
Write-Host "`n  Fix with: .\scripts\release.ps1 <version>  (canonical bump path)" -ForegroundColor Gray
Write-Host "  Or edit all three by hand to match." -ForegroundColor Gray
exit 1
