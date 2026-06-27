# DFR Toolkit

Personal workbench for real-estate marketing: SEO title generator + a YouTube/Vimeo vlog library with custom-thumbnail capture. Ships as a single Windows installer.

## Stack

- **Frontend** — React 19 + Vite + Tailwind 4 (`frontend/`)
- **Backend** — Flask + yt-dlp + waitress (`app.py`, served bundled as `seo-backend.exe`)
- **Desktop shell** — Tauri 2 (Rust + system WebView2) (`frontend/src-tauri/`)
- **Auto-updates** — Tauri updater plugin, signed manifest on GitHub Releases

## Develop

Prerequisites: Python 3.12+ with `venv`, Node 20+, Rust toolchain (rustup), Visual Studio Build Tools (Windows C++ workload).

```powershell
# One-time setup
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
cd frontend ; npm install
```

```powershell
# Run the desktop app with hot-reload (Vite HMR + Tauri rebuild on Rust change)
.\start.bat tauri

# Or run the old two-window dev flow (Flask + Vite separately, no Tauri shell)
.\start.bat web
```

## Build the installer

```powershell
# 1. Bundle the Python backend into seo-backend.exe
.\venv\Scripts\python.exe -m PyInstaller --noconfirm --clean seo-backend.spec
Copy-Item .\dist\seo-backend.exe .\frontend\src-tauri\binaries\seo-backend-x86_64-pc-windows-msvc.exe -Force

# 2. Build the signed desktop bundle
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .\updater-keys\dfr-toolkit -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "dfr-toolkit-dev"
cd frontend ; npx tauri build
```

Outputs land in `frontend/src-tauri/target/release/bundle/{nsis,msi}/`.

## Distribute

See [DISTRIBUTING.md](./DISTRIBUTING.md) for how to publish a new version so users get auto-updates.

## Layout

```
.
├── app.py                  # Flask routes
├── helpers.py              # yt-dlp metadata helpers
├── rate_limit.py           # per-IP sliding-window + global semaphores
├── cache.py                # in-memory caches
├── logs.py                 # structured single-line logger
├── desktop.py              # entry point that picks a port and serves via waitress
├── seo-backend.spec        # PyInstaller spec
├── requirements.txt
├── frontend/
│   ├── src/                # React UI
│   └── src-tauri/          # Rust shell + Cargo + tauri.conf.json
├── updater-keys/           # gitignored — minisign keypair for signed updates
├── RELEASING.md            # release/sign reference
└── DISTRIBUTING.md         # how friends actually install it
```
