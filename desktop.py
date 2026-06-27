"""Desktop entry point for the bundled Flask backend.

Picks an ephemeral localhost port, prints `BACKEND_PORT=<n>` on the first
line of stdout, then serves the Flask app via waitress. Tauri's sidecar
launcher reads that line to discover where the backend is listening.

Run directly during development:
    python desktop.py

PyInstaller builds this into seo-backend.exe (see seo-backend.spec).
"""

import os
import socket
import sys

from waitress import serve

from app import app
from logs import log


def _pick_free_port() -> int:
    """Ask the kernel for an unused localhost port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> int:
    # Allow override via env so Tauri can pin a port for debugging.
    forced = os.environ.get("BACKEND_PORT")
    port = int(forced) if forced and forced.isdigit() else _pick_free_port()

    # FIRST line must be the port handshake. Tauri reads stdout until
    # it sees this prefix, then assumes the server is starting.
    sys.stdout.write(f"BACKEND_PORT={port}\n")
    sys.stdout.flush()

    log.info("[desktop] serving on 127.0.0.1:%d", port)
    # threads=8 mirrors what the dev Flask debug server gave us under
    # parallel SSE captures + metadata fans-outs. _expose_tracebacks is
    # off so 500s don't leak file paths into the WebView.
    serve(app, host="127.0.0.1", port=port, threads=8, _quiet=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
