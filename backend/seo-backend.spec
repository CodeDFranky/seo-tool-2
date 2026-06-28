# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Tauri sidecar backend.

Produces a single-file `seo-backend.exe` that embeds:
  - the Flask app (app.py + helpers / logs / cache / rate_limit)
  - the waitress WSGI server
  - the venv's yt-dlp.exe (placed beside the main script at runtime via _MEIPASS)

Build (from project root):
    python -m PyInstaller --noconfirm backend/seo-backend.spec

Output (relative to invocation CWD, i.e. project root):
    dist/seo-backend.exe
"""

import os
from PyInstaller.utils.hooks import collect_submodules


HERE = os.path.dirname(os.path.abspath(SPEC))  # noqa: F821 (SPEC injected by PyInstaller)
PROJECT_ROOT = os.path.normpath(os.path.join(HERE, ".."))
YTDLP_EXE = os.path.join(PROJECT_ROOT, "venv", "Scripts", "yt-dlp.exe")
if not os.path.isfile(YTDLP_EXE):
    raise SystemExit(
        f"yt-dlp.exe not found at {YTDLP_EXE!r}. "
        "Activate the venv and `pip install yt-dlp` first."
    )


a = Analysis(
    ["desktop.py"],
    pathex=[HERE],
    binaries=[
        # Placed at the root of the extraction dir so _bundle_dir() finds it.
        (YTDLP_EXE, "."),
    ],
    datas=[],
    # yt_dlp dynamically imports its extractor modules — PyInstaller's
    # default analysis misses most of them, so force-collect the package.
    hiddenimports=collect_submodules("yt_dlp"),
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # Big optional deps that ship with Python but we never touch.
        "tkinter",
        "test",
        "unittest",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="seo-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,           # UPX shrinks size but triggers AV false-positives.
    runtime_tmpdir=None,
    console=True,        # We READ stdout for the port handshake — must be console.
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
