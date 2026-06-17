@echo off
set ROOT=%~dp0

start "Flask Backend" cmd /k "cd /d "%ROOT%" && "%ROOT%venv\Scripts\activate.bat" && python app.py"
start "Vite Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"
