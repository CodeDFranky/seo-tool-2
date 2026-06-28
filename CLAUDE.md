# Claude conventions for DFR Toolkit

Loaded automatically on every session. Keep entries short and pointed.

## Releasing

**Never release by hand.** All releases go through `scripts\release.ps1` so we
don't forget a step (we have, twice).

```powershell
.\scripts\release.ps1 0.1.1            # cuts and publishes
.\scripts\release.ps1 0.2.0 -DryRun    # validates + builds, skips push/publish
```

The script:
1. Validates the version (semver, must be > current, tag must be free).
2. Bumps the version in `tauri.conf.json`, `Cargo.toml`, `package.json`.
3. Rebuilds the Python backend exe via PyInstaller.
4. Rebuilds the signed Tauri installer.
5. Generates a fresh `latest.json` with the new minisign signature.
6. Commits, tags, pushes.
7. Creates the GitHub Release with installer + sig + manifest, marked latest.

If it fails partway through, fix the root cause and re-run. The script is
idempotent through step 5 (re-running just overwrites the build output).

**Signing key**: lives at `updater-keys\dfr-toolkit` (gitignored). The
placeholder password is `dfr-toolkit-dev`. To override, set
`$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD` before invoking.

For the manual steps (or if the script breaks), see `RELEASING.md` and
`DISTRIBUTING.md`.

## Pre-commit hooks

Canonical source lives in `scripts\hooks\`. Git's `.git\hooks\` is local-only,
so anyone cloning fresh needs to install once:

```powershell
Copy-Item scripts\hooks\pre-commit .git\hooks\pre-commit -Force
```

Current hooks:
- **`check-version-sync.ps1`** — HARD fail if the three version files
  disagree. Catches half-finished version bumps before they hit the repo.
- **`check-doc-drift.ps1`** — SOFT warning when source files change in
  patterns we know affect docs (e.g. `app.py` → `RELEASING.md`,
  `frontend/src-tauri/**` → `DISTRIBUTING.md`). Doesn't block, just nags.
  Coupling rules live in `scripts\check-doc-drift.ps1`; add new rules
  as the project grows.

## Where things live

- **Python backend**: `backend/` — `app.py` + `helpers.py` + `logs.py` +
  `rate_limit.py` + `cache.py`. Entry point for the bundled exe is
  `backend/desktop.py` (picks port, serves via waitress). PyInstaller
  spec is `backend/seo-backend.spec`.
- **Tauri shell**: `frontend/src-tauri/` — Rust glue that spawns the
  backend as a sidecar and exposes `get_backend_port` + the auto-updater.
- **React frontend**: `frontend/src/` — Vite + Tailwind + Radix. API base
  URL resolution in `lib/backend.ts`; native Save-As in `lib/saveBlob.ts`.
- **Updater keypair**: `updater-keys/` (gitignored — public key is baked
  into `tauri.conf.json`).
- **Release artifacts** (transient): `dist/` and
  `frontend/src-tauri/target/release/bundle/`.

## Things to remember

- Backend ships *inside* the installer. There's no separate API server. A
  "backend bug fix" = a new release.
- Auto-updater hits `releases/latest/download/latest.json` on every app
  launch. Public repo + public release assets = updater works for everyone.
  If we ever flip the repo private again, the updater breaks.
- Versions only go up. The updater ignores anything ≤ the installed
  version, so a bad release is fixed by shipping a higher one (even if
  the binary inside is a rollback).
- yt-dlp lives bundled in `seo-backend.exe`. Updating yt-dlp = bump
  `backend/requirements.txt`, `pip install`, rebuild via the release script.
