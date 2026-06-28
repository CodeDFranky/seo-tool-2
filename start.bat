@echo off
REM Dev launcher: starts the Tauri desktop shell with hot-reload.
REM   - Vite handles frontend HMR
REM   - Tauri rebuilds Rust on save
REM   - Tauri auto-spawns the Python sidecar (uses the venv yt-dlp at dev time)
REM
REM For the legacy "Flask + Vite in two terminals" flow, run manually:
REM   venv\Scripts\python.exe backend\app.py
REM   cd frontend && npm run dev

cd /d "%~dp0frontend"
call npx tauri dev
