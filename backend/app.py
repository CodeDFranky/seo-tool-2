from helpers import detect_platform, get_video_ids, get_video_info
from cache import URL_IDS_CACHE, VIDEO_INFO_CACHE
from logs import fmt_dur, fmt_size, log
from rate_limit import (
    CAPTURE_SEMAPHORE,
    acquire_capture,
    acquire_metadata,
    rate_limit,
)
from flask import Flask, Response, request, jsonify, send_file, stream_with_context
from urllib.parse import urlparse
import hashlib
import io
import json
import os
import re
import requests
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile

app = Flask(__name__)


@app.after_request
def _cors(resp):
    """Allow the Tauri webview (tauri://localhost / http://tauri.localhost)
    to call the sidecar across origins. Backend binds 127.0.0.1 only, so
    a wildcard origin is safe — there is no network-reachable surface.
    Includes the headers needed for canvas.drawImage() on the captured
    video element without tainting the canvas."""
    resp.headers.setdefault("Access-Control-Allow-Origin", "*")
    resp.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    resp.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Range")
    resp.headers.setdefault("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset")
    return resp


@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def _cors_preflight(path):  # noqa: ARG001
    return ("", 204)


def _bundle_dir() -> str:
    """Where to look for bundled binaries (yt-dlp.exe) at runtime.

    When frozen by PyInstaller, datafiles/binaries live under sys._MEIPASS
    (one-file mode) or beside sys.executable (one-dir). Falls back to the
    project root in dev so the venv-installed yt-dlp keeps working.
    """
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(__file__)

YOUTUBE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,20}$")
VIMEO_ID_RE   = re.compile(r"^\d{1,12}$")
VIMEO_CDN_RE  = re.compile(r"^https://i\.vimeocdn\.com/")
TOKEN_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

# Host whitelist used to guard /api/fetch_ids against arbitrary URLs.
ALLOWED_HOSTS = {
    "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
    "vimeo.com", "www.vimeo.com",
}


def _host_allowed(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
        return host in ALLOWED_HOSTS
    except Exception:
        return False


def _vimeo_thumbnail(video_id: str):
    """Fetch a Vimeo thumbnail via its oEmbed endpoint. Returns (bytes, error, status)."""
    try:
        oembed = requests.get(
            "https://vimeo.com/api/oembed.json",
            params={"url": f"https://vimeo.com/{video_id}", "width": 1280},
            timeout=10,
        )
        if not oembed.ok:
            return None, "Video not found", 404
        data = oembed.json()
        thumb_url = data.get("thumbnail_url")
        if not thumb_url or not VIMEO_CDN_RE.match(thumb_url):
            return None, "Thumbnail unavailable", 502
        r = requests.get(thumb_url, timeout=10)
        if not r.ok:
            return None, "Thumbnail unavailable", 502
        return r.content, None, 200
    except Exception as e:
        return None, str(e), 502

# Temp directory for captured-video sessions
CAPTURE_CACHE_BASE = os.path.join(tempfile.gettempdir(), "seo-tool-2-capture")
os.makedirs(CAPTURE_CACHE_BASE, exist_ok=True)

# yt-dlp binary lives in the PyInstaller bundle when frozen, otherwise
# the project venv on dev machines.
def _find_ytdlp():
    base = _bundle_dir()
    candidates = [
        os.path.join(base, "yt-dlp.exe"),
        os.path.join(base, "yt-dlp"),
        os.path.join(os.path.dirname(__file__), "venv", "Scripts", "yt-dlp.exe"),
        os.path.join(os.path.dirname(__file__), "venv", "Scripts", "yt-dlp"),
        os.path.join(os.path.dirname(__file__), "venv", "bin", "yt-dlp"),
        "yt-dlp",
    ]
    for c in candidates:
        if os.path.isabs(c) and os.path.isfile(c):
            return c
    return "yt-dlp"

YTDLP_BIN = _find_ytdlp()


def _resolve_token_dir(token: str):
    """Return the safe absolute path for a token's cache directory, or None."""
    if not TOKEN_RE.match(token):
        return None
    base = os.path.realpath(CAPTURE_CACHE_BASE)
    target = os.path.realpath(os.path.join(base, token))
    if not (target == base or target.startswith(base + os.sep)):
        return None
    return target


def _sweep_old_capture_dirs(max_age_seconds: int = 3600):
    """Delete capture directories older than max_age_seconds."""
    try:
        now = time.time()
        for entry in os.listdir(CAPTURE_CACHE_BASE):
            if not TOKEN_RE.match(entry):
                continue
            path = os.path.join(CAPTURE_CACHE_BASE, entry)
            try:
                if now - os.path.getmtime(path) > max_age_seconds:
                    shutil.rmtree(path, ignore_errors=True)
            except OSError:
                pass
    except OSError:
        pass


@app.route("/api/fetch_ids", methods=["POST"])
@rate_limit(per_minute=6)
def fetch_ids():
    body = request.get_json(silent=True) or {}
    # Accept either the new `url` or the legacy `youtube_url` field.
    url = body.get("url") or body.get("youtube_url")
    if not url:
        return jsonify({"error": "URL required"}), 400
    if not _host_allowed(url):
        return jsonify({"error": "Only YouTube and Vimeo URLs are supported"}), 400

    # Pagination: zero-based offset + page limit. Capped server-side so a
    # single request can never enumerate more than 500 entries.
    try:
        offset = max(0, int(body.get("offset", 0) or 0))
        limit  = max(1, min(500, int(body.get("limit", 100) or 100)))
    except (TypeError, ValueError):
        return jsonify({"error": "offset and limit must be integers"}), 400

    platform = detect_platform(url)
    start = offset + 1
    end = offset + limit
    cache_key = f"{hashlib.md5(url.encode()).hexdigest()}:{start}:{end}"
    cached = cache_key in URL_IDS_CACHE

    if not cached:
        # Serialize playlist/channel expansion across the whole server.
        t0 = time.time()
        with acquire_metadata(timeout=10.0) as lock:
            if not lock.acquired:
                log.warning("[ids] busy url=%s offset=%d limit=%d", url, offset, limit)
                resp = jsonify({"error": "Server is busy. Try again in a few seconds."})
                resp.status_code = 429
                resp.headers["Retry-After"] = "5"
                return resp
            try:
                URL_IDS_CACHE[cache_key] = get_video_ids(url, start=start, end=end)
            except Exception as e:
                log.error("[ids] fail url=%s offset=%d err=%s", url, offset, e)
                return jsonify({"error": str(e)}), 400
        log.info(
            "[ids] fetched url=%s platform=%s offset=%d limit=%d returned=%d dur=%s",
            url, platform, offset, limit, len(URL_IDS_CACHE[cache_key]), fmt_dur(time.time() - t0),
        )

    ids = URL_IDS_CACHE[cache_key]
    if cached:
        log.debug("[ids] hit url=%s offset=%d returned=%d", url, offset, len(ids))
    # If yt-dlp returned a full page, assume there's more to fetch.
    has_more = len(ids) >= limit
    return jsonify({
        "ids": ids,
        "platform": platform,
        "offset": offset,
        "has_more": has_more,
    })


@app.route("/api/fetch_video_info", methods=["POST"])
@rate_limit(per_minute=120)
def fetch_video_info():
    body = request.get_json(silent=True) or {}
    video_id = body.get("video_id")
    platform = body.get("platform", "youtube")
    if platform not in ("youtube", "vimeo"):
        return jsonify({"error": "Unsupported platform"}), 400
    if platform == "youtube" and not YOUTUBE_ID_RE.match(video_id or ""):
        return jsonify({"error": "Invalid YouTube ID"}), 400
    if platform == "vimeo" and not VIMEO_ID_RE.match(video_id or ""):
        return jsonify({"error": "Invalid Vimeo ID"}), 400

    cache_key = f"{platform}:{video_id}"
    if cache_key in VIDEO_INFO_CACHE:
        return jsonify(VIDEO_INFO_CACHE[cache_key])

    # Cap concurrent metadata extractions to 3 server-wide.
    t0 = time.time()
    with acquire_metadata(timeout=8.0) as lock:
        if not lock.acquired:
            log.warning("[meta] busy id=%s platform=%s", video_id, platform)
            resp = jsonify({"error": "Server is busy. Try again."})
            resp.status_code = 429
            resp.headers["Retry-After"] = "3"
            return resp
        try:
            video_data = get_video_info(video_id, platform)
            VIDEO_INFO_CACHE[cache_key] = video_data
            log.info("[meta] miss id=%s platform=%s dur=%s", video_id, platform, fmt_dur(time.time() - t0))
            return jsonify(video_data)
        except Exception as e:
            log.error("[meta] fail id=%s platform=%s err=%s", video_id, platform, e)
            return jsonify({"error": str(e)}), 400


@app.route("/download-thumbnails", methods=["POST"])
def download_thumbnails():
    items = request.get_json().get("items", [])

    if not items:
        return jsonify({"error": "No items provided"}), 400

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zip_file:
        for item in items:
            url = item.get("url")
            title = item.get("title", "thumbnail")
            if not url:
                continue
            ext = url.split("/")[-1].split(".")[-1].split("?")[0]
            try:
                r = requests.get(url, timeout=10)
                r.raise_for_status()
                zip_file.writestr(f"{title}.{ext}", r.content)
            except Exception as e:
                print(f"Failed to fetch {url}: {e}")

    zip_buffer.seek(0)
    return send_file(zip_buffer, mimetype="application/zip", download_name="thumbnails.zip", as_attachment=True)


@app.route("/api/proxy_thumbnail", methods=["GET"])
@rate_limit(per_minute=120)
def proxy_thumbnail():
    """Fetch a thumbnail server-side and stream it back as a same-origin blob.
    Supports both YouTube and Vimeo."""
    video_id = request.args.get("id", "")
    platform = request.args.get("platform", "youtube")

    if platform == "vimeo":
        if not VIMEO_ID_RE.match(video_id):
            return jsonify({"error": "Invalid Vimeo ID"}), 400
        content, error, status = _vimeo_thumbnail(video_id)
        if error:
            return jsonify({"error": error}), status
        return Response(
            content,
            mimetype="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    # YouTube
    if not YOUTUBE_ID_RE.match(video_id):
        return jsonify({"error": "Invalid video ID"}), 400

    try:
        r = requests.get(f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg", timeout=10)
        # YouTube returns a tiny placeholder when maxres isn't available; fall back
        if not r.ok or len(r.content) < 8000:
            r = requests.get(f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg", timeout=10)
        if not r.ok:
            return jsonify({"error": "Thumbnail not available"}), 404
        return Response(
            r.content,
            mimetype="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/capture_thumbnail", methods=["POST"])
@rate_limit(per_minute=10, per_hour=60)
def capture_thumbnail_start():
    """Download a video with yt-dlp, streaming progress via SSE.
    Returns a token at the end that can be used to stream the cached video."""
    body = request.get_json(silent=True) or {}
    video_id = body.get("id", "")
    platform = body.get("platform", "youtube")

    if platform not in ("youtube", "vimeo"):
        return jsonify({"error": "Only YouTube and Vimeo are supported"}), 400
    if platform == "youtube" and not YOUTUBE_ID_RE.match(video_id):
        return jsonify({"error": "Invalid YouTube ID"}), 400
    if platform == "vimeo" and not VIMEO_ID_RE.match(video_id):
        return jsonify({"error": "Invalid Vimeo ID"}), 400

    # Fast pre-check (racy by design): if every capture slot is taken,
    # return 429 without even setting up the SSE response. Real safety
    # comes from the acquire inside the generator below.
    if CAPTURE_SEMAPHORE._value <= 0:
        log.warning("[capture] busy id=%s platform=%s (all slots taken)", video_id, platform)
        resp = jsonify({
            "error": "All capture slots are busy. Try again in a moment.",
        })
        resp.status_code = 429
        resp.headers["Retry-After"] = "30"
        return resp

    _sweep_old_capture_dirs()

    token = str(uuid.uuid4())
    token_dir = os.path.join(CAPTURE_CACHE_BASE, token)
    os.makedirs(token_dir, exist_ok=True)

    output_template = os.path.join(token_dir, "video.%(ext)s")
    video_url = (
        f"https://vimeo.com/{video_id}"
        if platform == "vimeo"
        else f"https://www.youtube.com/watch?v={video_id}"
    )

    def generate():
        # Acquire the semaphore *inside* the generator so the try/finally
        # below is guaranteed to release it. The previous version held the
        # lock from the route handler, which leaked the slot if anything
        # threw before the generator started iterating (Popen failing, the
        # client aborting the request mid-handshake, dev-reload mid-flight).
        capture_lock = acquire_capture(timeout=0.0)
        capture_lock.__enter__()
        if not capture_lock.acquired:
            log.warning("[capture] busy id=%s (slot acquire failed)", video_id)
            shutil.rmtree(token_dir, ignore_errors=True)
            yield f"event: error\ndata: {json.dumps({'error': 'Server busy. Try again.'})}\n\n"
            return

        t0 = time.time()
        last_progress = -1.0
        last_logged_milestone = -1
        log.info(
            "[capture] start id=%s platform=%s token=%s slots_left=%d",
            video_id, platform, token[:8], CAPTURE_SEMAPHORE._value,
        )

        proc = None
        try:
            try:
                proc = subprocess.Popen(
                    [
                        YTDLP_BIN,
                        "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720][ext=mp4]/best[height<=720]/best",
                        "--merge-output-format", "mp4",
                        "--no-playlist",
                        "--newline",
                        # Tuned for a single-user desktop rather than a cloud deploy, while keeping polite-use floors that protect the user's residential IP from YouTube/Vimeo automation detection.
                        "--sleep-requests", "1",
                        "--sleep-interval", "5",
                        "--max-sleep-interval", "10",
                        "--concurrent-fragments", "4",
                        "-o", output_template,
                        video_url,
                    ],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
                )

                progress_re = re.compile(r"\[download\]\s+([\d.]+)%")

                for raw in proc.stdout:
                    line = raw.rstrip()
                    m = progress_re.search(line)
                    if m:
                        pct = float(m.group(1))
                        if pct - last_progress >= 0.5 or pct >= 100.0:
                            last_progress = pct
                            yield f"data: {json.dumps({'progress': pct})}\n\n"
                        # Log milestone progress (25/50/75/100) without
                        # spamming — useful for spotting hangs vs slow links.
                        milestone = int(pct) // 25
                        if milestone > last_logged_milestone and milestone >= 1:
                            last_logged_milestone = milestone
                            log.debug(
                                "[capture] progress id=%s %.0f%% elapsed=%s",
                                video_id, pct, fmt_dur(time.time() - t0),
                            )
                ret = proc.wait()

                if ret == 0:
                    files = [f for f in os.listdir(token_dir) if f.startswith("video.")]
                    if files:
                        size = os.path.getsize(os.path.join(token_dir, files[0]))
                        log.info(
                            "[capture] done id=%s token=%s dur=%s size=%s",
                            video_id, token[:8], fmt_dur(time.time() - t0), fmt_size(size),
                        )
                        yield f"event: done\ndata: {json.dumps({'token': token})}\n\n"
                        return
                    log.error("[capture] fail id=%s no_output_file dur=%s", video_id, fmt_dur(time.time() - t0))
                    shutil.rmtree(token_dir, ignore_errors=True)
                    yield f"event: error\ndata: {json.dumps({'error': 'Video file not found after download'})}\n\n"
                else:
                    log.error(
                        "[capture] fail id=%s exit_code=%d dur=%s at=%.0f%%",
                        video_id, ret, fmt_dur(time.time() - t0), max(0.0, last_progress),
                    )
                    shutil.rmtree(token_dir, ignore_errors=True)
                    yield f"event: error\ndata: {json.dumps({'error': f'yt-dlp exited with code {ret}'})}\n\n"
            except GeneratorExit:
                # Client disconnected — kill the download and clean up
                log.info(
                    "[capture] cancel id=%s at=%.0f%% dur=%s (client disconnect)",
                    video_id, max(0.0, last_progress), fmt_dur(time.time() - t0),
                )
                if proc is not None:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                shutil.rmtree(token_dir, ignore_errors=True)
                raise
            except Exception as e:
                log.exception("[capture] crash id=%s err=%s", video_id, e)
                shutil.rmtree(token_dir, ignore_errors=True)
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        finally:
            # Always release the capture slot, no matter how the generator exits.
            capture_lock.__exit__(None, None, None)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        # NOTE: don't set Connection: keep-alive here. It's a hop-by-hop
        # header (PEP 3333) and waitress refuses to forward it from a WSGI
        # app, returning 500 on every SSE stream. Servers handle keep-alive
        # themselves; the client gets it anyway over HTTP/1.1.
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/capture_thumbnail", methods=["GET"])
def capture_thumbnail_stream():
    """Stream the cached video file for a token, supporting Range requests."""
    token = request.args.get("token", "")
    token_dir = _resolve_token_dir(token)
    if not token_dir or not os.path.isdir(token_dir):
        return jsonify({"error": "Invalid or expired token"}), 404

    files = [f for f in os.listdir(token_dir) if f.startswith("video.")]
    if not files:
        return jsonify({"error": "Video not found"}), 404

    video_path = os.path.join(token_dir, files[0])
    file_size = os.path.getsize(video_path)
    range_header = request.headers.get("Range")

    if range_header:
        match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not match:
            return Response(status=416)
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else file_size - 1
        end = min(end, file_size - 1)
        chunk_size = end - start + 1

        def gen():
            with open(video_path, "rb") as f:
                f.seek(start)
                remaining = chunk_size
                while remaining > 0:
                    buf = f.read(min(64 * 1024, remaining))
                    if not buf:
                        break
                    remaining -= len(buf)
                    yield buf

        return Response(
            stream_with_context(gen()),
            status=206,
            mimetype="video/mp4",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_size),
                "Cache-Control": "no-store",
            },
        )

    def gen_full():
        with open(video_path, "rb") as f:
            while True:
                buf = f.read(64 * 1024)
                if not buf:
                    break
                yield buf

    return Response(
        stream_with_context(gen_full()),
        mimetype="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Cache-Control": "no-store",
        },
    )


@app.route("/api/capture_thumbnail", methods=["DELETE"])
def capture_thumbnail_cleanup():
    token = request.args.get("token", "")
    token_dir = _resolve_token_dir(token)
    if not token_dir:
        return jsonify({"error": "Invalid token"}), 400
    if os.path.isdir(token_dir):
        shutil.rmtree(token_dir, ignore_errors=True)
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True)
