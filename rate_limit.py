"""
In-memory sliding-window rate limiter + concurrency semaphores.

Two layers:
  - Per-IP request budgets per endpoint (sliding window).
  - Global semaphores around yt-dlp invocations so per-IP limits can't
    be bypassed by spoofed X-Forwarded-For headers.

Returns 429 with `Retry-After` (integer seconds) and a JSON body
{ error, retry_after, reset_at }. X-RateLimit-* headers are set on
all responses including successes so the UI can self-throttle.
"""

import threading
import time
from collections import defaultdict, deque
from functools import wraps
from typing import Optional

from flask import jsonify, request


class _SlidingWindowLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(
        self, key: str, max_requests: int, window_seconds: int
    ) -> tuple[bool, int, int, int]:
        """Returns (allowed, retry_after, remaining, reset_at_epoch)."""
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._buckets[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= max_requests:
                retry_after = max(1, int(bucket[0] + window_seconds - now) + 1)
                reset_at = int(bucket[0] + window_seconds)
                return False, retry_after, 0, reset_at
            bucket.append(now)
            remaining = max_requests - len(bucket)
            reset_at = int(now + window_seconds)
            return True, 0, remaining, reset_at


_limiter = _SlidingWindowLimiter()


def _client_ip() -> str:
    """Best-effort IP. Falls back gracefully when behind proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # First entry is the original client per convention.
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def rate_limit(
    *,
    per_minute: Optional[int] = None,
    per_hour: Optional[int] = None,
    name: Optional[str] = None,
):
    """Decorator. Apply per-minute and/or per-hour caps per IP.

    Usage:
        @rate_limit(per_minute=6)
        def fetch_ids(): ...
    """
    windows: list[tuple[int, int, str]] = []
    if per_minute is not None:
        windows.append((per_minute, 60, "minute"))
    if per_hour is not None:
        windows.append((per_hour, 3600, "hour"))

    def decorator(fn):
        bucket_name = name or fn.__name__

        @wraps(fn)
        def wrapped(*args, **kwargs):
            ip = _client_ip()
            tightest_remaining: Optional[int] = None
            tightest_reset: Optional[int] = None
            tightest_limit: Optional[int] = None

            for max_req, window, _label in windows:
                key = f"{bucket_name}:{window}:{ip}"
                allowed, retry_after, remaining, reset_at = _limiter.check(
                    key, max_req, window
                )
                if not allowed:
                    resp = jsonify(
                        {
                            "error": "Rate limit exceeded. Please slow down.",
                            "retry_after": retry_after,
                            "reset_at": reset_at,
                        }
                    )
                    resp.status_code = 429
                    resp.headers["Retry-After"] = str(retry_after)
                    resp.headers["X-RateLimit-Limit"] = str(max_req)
                    resp.headers["X-RateLimit-Remaining"] = "0"
                    resp.headers["X-RateLimit-Reset"] = str(reset_at)
                    return resp
                if tightest_remaining is None or remaining < tightest_remaining:
                    tightest_remaining = remaining
                    tightest_reset = reset_at
                    tightest_limit = max_req

            result = fn(*args, **kwargs)
            # Attach headers to non-streaming responses where possible.
            if tightest_remaining is not None:
                try:
                    if hasattr(result, "headers"):
                        result.headers["X-RateLimit-Limit"] = str(tightest_limit)
                        result.headers["X-RateLimit-Remaining"] = str(tightest_remaining)
                        result.headers["X-RateLimit-Reset"] = str(tightest_reset)
                except Exception:
                    pass
            return result

        return wrapped

    return decorator


class _SemaphoreGuard:
    """Context manager that surfaces failure rather than blocking forever.

    Used by capture_thumbnail to refuse a new yt-dlp invocation when
    another one is already running, instead of queuing requests.
    """

    def __init__(self, sem: threading.Semaphore, timeout: float = 0.0) -> None:
        self._sem = sem
        self._timeout = timeout
        self.acquired = False

    def __enter__(self):
        if self._timeout > 0:
            self.acquired = self._sem.acquire(timeout=self._timeout)
        else:
            self.acquired = self._sem.acquire(blocking=False)
        return self

    def __exit__(self, *_args):
        if self.acquired:
            self._sem.release()


# yt-dlp serialization. The research target: at most 1 concurrent
# heavy download, and 3 concurrent metadata extractions.
CAPTURE_SEMAPHORE = threading.Semaphore(1)
METADATA_SEMAPHORE = threading.Semaphore(3)


def acquire_capture(timeout: float = 0.0) -> _SemaphoreGuard:
    return _SemaphoreGuard(CAPTURE_SEMAPHORE, timeout=timeout)


def acquire_metadata(timeout: float = 0.0) -> _SemaphoreGuard:
    return _SemaphoreGuard(METADATA_SEMAPHORE, timeout=timeout)
