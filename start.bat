@echo off
REM Dev launcher.
REM   start.bat tauri   → run the desktop shell (Tauri + auto-rebuilt Vite + Flask sidecar)
REM   start.bat web     → run Flask + Vite separately (original two-window flow, no Tauri)
REM Defaults to tauri.

set ROOT=%~dp0
set MODE=%1
if "%MODE%"=="" set MODE=tauri

if /i "%MODE%"=="tauri" (
  cd /d "%ROOT%frontend"
  call npx tauri dev
  goto :eof
)

if /i "%MODE%"=="web" (
  start "Flask Backend" cmd /k "cd /d "%ROOT%" && "%ROOT%venv\Scripts\activate.bat" && python app.py"
  start "Vite Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"
  goto :eof
)

echo Unknown mode: %MODE%
echo Usage: start.bat [tauri^|web]
exit /b 1
