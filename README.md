# DFR Toolkit

Personal workbench for real-estate marketing: SEO title generator + a YouTube/Vimeo vlog library with custom-thumbnail capture. Ships as a single Windows installer.

## Stack

- **Frontend** — React 19 + Vite + Tailwind 4 (`frontend/`)
- **Backend** — Flask + yt-dlp + waitress (`backend/`, bundled as `seo-backend.exe`)
- **Desktop shell** — Tauri 2 (Rust + system WebView2) (`frontend/src-tauri/`)
- **Auto-updates** — Tauri updater plugin, signed manifest on GitHub Releases

## Develop

Prerequisites: Python 3.12+ with `venv`, Node 20+, Rust toolchain (rustup), Visual Studio Build Tools (Windows C++ workload).

```powershell
# One-time setup
python -m venv venv
.\venv\Scripts\pip install -r backend\requirements.txt
cd frontend ; npm install
```

```powershell
# Run the desktop app with hot-reload (Vite HMR + Tauri rebuild on Rust change)
.\start.bat
```

## Release

Don't run the build commands by hand — use the script:

```powershell
.\scripts\release.ps1 0.1.1            # cuts and publishes
.\scripts\release.ps1 0.2.0 -DryRun    # validates + builds, skips push/publish
```

See [CLAUDE.md](./CLAUDE.md) for what the script does and the conventions it enforces, and [DISTRIBUTING.md](./DISTRIBUTING.md) for how end-users actually install.

## Layout

```
.
├── backend/                # Python Flask app + PyInstaller spec
│   ├── app.py              # routes
│   ├── helpers.py          # yt-dlp metadata helpers
│   ├── rate_limit.py       # per-IP sliding-window + global semaphores
│   ├── cache.py            # in-memory caches
│   ├── logs.py             # structured single-line logger
│   ├── desktop.py          # entry point that picks a port and serves via waitress
│   ├── seo-backend.spec    # PyInstaller spec
│   └── requirements.txt
├── frontend/
│   ├── src/                # React UI
│   └── src-tauri/          # Rust shell + Cargo + tauri.conf.json
├── scripts/                # release.ps1 + pre-commit checks
├── updater-keys/           # gitignored — minisign keypair for signed updates
├── CLAUDE.md               # release + hook conventions
├── RELEASING.md            # release/sign reference (manual fallback)
└── DISTRIBUTING.md         # how friends actually install it
```
