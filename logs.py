"""Centralized logger for the backend.

Single-line per-event format:

    HH:MM:SS LVL [topic] key=value key=value …

Colour-coded by level for visual scan, plain key=value bodies so grep still
works without the colour codes. We DON'T emit a line per HTTP request —
proxy_thumbnail and the byte-range capture stream would drown out anything
useful. Instead the routes log at lifecycle points (capture start, capture
done, ids fetched, metadata miss, 429 fired, …).
"""

import logging
import os
import sys


# Modern Windows Terminal handles ANSI natively; this one-shot call flips
# on virtual-terminal processing for legacy cmd / older PS5 hosts.
if os.name == "nt":
    os.system("")


class _C:
    DIM     = "\033[2m"
    CYAN    = "\033[36m"
    GREEN   = "\033[32m"
    YELLOW  = "\033[33m"
    RED     = "\033[31m"
    BOLD    = "\033[1m"
    RESET   = "\033[0m"


class _Formatter(logging.Formatter):
    LEVEL_TAG = {
        logging.DEBUG:    f"{_C.DIM}DBG{_C.RESET}",
        logging.INFO:     f"{_C.CYAN}INF{_C.RESET}",
        logging.WARNING:  f"{_C.YELLOW}WRN{_C.RESET}",
        logging.ERROR:    f"{_C.RED}ERR{_C.RESET}",
        logging.CRITICAL: f"{_C.RED}{_C.BOLD}CRT{_C.RESET}",
    }

    def format(self, record: logging.LogRecord) -> str:
        ts = self.formatTime(record, "%H:%M:%S")
        tag = self.LEVEL_TAG.get(record.levelno, record.levelname[:3])
        return f"{_C.DIM}{ts}{_C.RESET} {tag} {record.getMessage()}"


def _configure(level: int = logging.INFO) -> logging.Logger:
    """Idempotent: Flask's debug reloader re-imports this module on save."""
    root = logging.getLogger("seo-tool")
    if getattr(root, "_configured", False):
        return root
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_Formatter())
    root.addHandler(handler)
    root.setLevel(level)
    root.propagate = False
    root._configured = True  # type: ignore[attr-defined]

    # Hush Werkzeug's default access log — we emit our own lifecycle lines.
    # Keep WARNING+ for genuine server errors.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    return root


log = _configure()


def fmt_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes}B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f}KB"
    return f"{num_bytes / (1024 * 1024):.1f}MB"


def fmt_dur(seconds: float) -> str:
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    if seconds < 60:
        return f"{seconds:.1f}s"
    m, s = divmod(seconds, 60)
    return f"{int(m)}m{int(s)}s"


def short_ip(ip: str) -> str:
    """Tail of an IPv4 / first chunk of IPv6 — enough to distinguish clients
    without spraying full addresses across the terminal."""
    if not ip:
        return "?"
    if ":" in ip:  # IPv6
        return ip.split(":")[0] + ":…"
    parts = ip.split(".")
    if len(parts) == 4:
        return f"…{parts[-2]}.{parts[-1]}"
    return ip
