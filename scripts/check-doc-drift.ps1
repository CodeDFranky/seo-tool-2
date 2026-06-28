<#
DocDrift: soft warnings when staged source changes likely invalidate docs
that weren't touched in the same commit. Non-blocking: prints a list of
suspect files and exits 0 either way. The point is to nag, not gate.

Coupling rules (source pattern → docs that probably need a look):

  app.py | helpers.py | desktop.py | seo-backend.spec
      → RELEASING.md (build steps, sidecar bundling)

  frontend/src-tauri/**
      → RELEASING.md, DISTRIBUTING.md (installer, updater config)

  package.json | Cargo.toml | requirements.txt
      → README.md (stack list)

  scripts/release.ps1
      → CLAUDE.md, DISTRIBUTING.md (release flow docs)

  frontend/src/components/youtube/** | frontend/src/components/seo/**
      → frontend/PRODUCT.md (surface descriptions)

Add new rules to $rules below as the project grows.
#>

$staged = git diff --cached --name-only
if (-not $staged) { exit 0 }

# Helper: did any staged file match the regex?
function HasStaged($pattern) {
    return ($staged | Where-Object { $_ -match $pattern }).Count -gt 0
}

# Coupling rules: source-glob regex → array of docs that should also move
$rules = @(
    @{ src = '^backend/(app|helpers|desktop|cache|logs|rate_limit)\.py$|^backend/seo-backend\.spec$'; docs = @('RELEASING.md') }
    @{ src = '^frontend/src-tauri/';                                              docs = @('RELEASING.md', 'DISTRIBUTING.md') }
    @{ src = '^frontend/package\.json$|^frontend/src-tauri/Cargo\.toml$|^backend/requirements\.txt$'; docs = @('README.md') }
    @{ src = '^scripts/release\.ps1$';                                            docs = @('CLAUDE.md', 'DISTRIBUTING.md') }
    @{ src = '^frontend/src/components/(youtube|seo)/';                           docs = @('frontend/PRODUCT.md') }
)

$warnings = @()
foreach ($rule in $rules) {
    if (HasStaged $rule.src) {
        foreach ($doc in $rule.docs) {
            if (-not (HasStaged ([regex]::Escape($doc) + '$'))) {
                $warnings += "  $doc may be stale (source matching '$($rule.src)' changed)"
            }
        }
    }
}

if ($warnings.Count -gt 0) {
    Write-Host "`n⚠ DocDrift: docs may have drifted from this commit" -ForegroundColor Yellow
    $warnings | Sort-Object -Unique | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    Write-Host "  (soft warning, commit proceeds)" -ForegroundColor Gray
    Write-Host ""
}

exit 0
