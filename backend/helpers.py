import yt_dlp


# Browsers whose cookie jars yt-dlp knows how to read. Anything else
# from the frontend (including the sentinel "none") is treated as
# "no cookies" and yt-dlp runs anonymously.
SUPPORTED_COOKIE_BROWSERS = frozenset({
    "chrome", "firefox", "edge", "brave", "vivaldi", "opera",
})


# Metadata extraction is light (info-only, no media bytes). The polite
# floor matters most for sustained bulk scraping; a single local user
# pulling a few batches at a time can run with no inter-request pause
# and still stay well below YouTube's per-IP envelope. The heavy-media
# capture path keeps its sleeps separately in app.py.
def _metadata_opts(cookies_browser: str | None = None) -> dict:
    """Return a fresh dict of yt-dlp options for metadata extraction.

    Returned as a fresh dict (not a module-level constant) so callers
    can mutate without bleeding into other invocations. When
    `cookies_browser` is one of the supported browsers, yt-dlp will
    transparently read the user's saved cookies and use them on every
    request — this is what unlocks members-only, age-restricted, and
    region-blocked-but-signed-in-region videos.
    """
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
    }
    if cookies_browser and cookies_browser in SUPPORTED_COOKIE_BROWSERS:
        # yt-dlp's Python API expects a tuple of (browser_name, profile,
        # keyring, container). Only the first element matters for our
        # case — pass it as a 1-tuple and yt-dlp fills the rest with
        # sensible defaults (default profile, default keyring).
        opts["cookiesfrombrowser"] = (cookies_browser,)
    return opts


def _build_video_url(video_id: str, platform: str) -> str:
    """Construct the canonical platform URL for yt-dlp from a bare video ID."""
    if platform == "vimeo":
        return f"https://vimeo.com/{video_id}"
    return f"https://www.youtube.com/watch?v={video_id}"


def _fallback_video_info(video_id: str, platform: str, reason: str) -> dict:
    """Synthesize a usable metadata dict when yt-dlp can't extract one.

    Premieres, members-only videos, and region-blocked uploads all make
    yt-dlp's extract_info raise — even though the upload itself still has
    a thumbnail available at the standard CDN URL. Returning a partial
    record (real thumbnail, placeholder title) keeps the card visible
    instead of silently dropping it from the grid.
    """
    if platform == "vimeo":
        # No direct always-on Vimeo CDN URL pattern, but our backend's
        # proxy_thumbnail endpoint handles Vimeo via the oEmbed API.
        # Route the synthetic card's thumbnail through it so the user
        # sees a real image instead of a broken-image icon. The frontend
        # wraps relative URLs through apiUrl() before rendering.
        thumbnail = f"/api/proxy_thumbnail?id={video_id}&platform=vimeo"
        embed_url = f"https://player.vimeo.com/video/{video_id}"
    else:
        # YouTube's CDN serves /maxresdefault.jpg for any video ID,
        # including unaired premieres and private/unlisted uploads.
        thumbnail = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
        embed_url = f"https://www.youtube.com/embed/{video_id}"
    return {
        # Short generic title — the specific reason renders as a badge on
        # the card so the title doesn't have to carry it.
        "title": "Unavailable video",
        "thumbnail": thumbnail,
        "embed_url": embed_url,
        "video_id": video_id,
        "platform": platform,
        "unavailable": True,
        "unavailable_reason": reason,
    }


def get_video_ids(url: str, start: int = 1, end: int | None = None) -> list[str]:
    """Enumerate video IDs from a playlist/channel/user URL.

    `start` is 1-based, `end` is inclusive. Internally uses yt-dlp's
    `playlist_items` slice syntax `"START:STOP"` so we never enumerate
    more of the source than necessary — critical for channels with
    100k+ videos.
    """
    spec = f"{start}:{end}" if end is not None else f"{start}:"
    opts = {
        **_metadata_opts(),
        "extract_flat": True,
        "playlist_items": spec,
        # Stream entries lazily; together with playlist_items it stops
        # the extractor at the cap instead of walking the whole channel.
        "lazy_playlist": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        result = ydl.extract_info(url, download=False)
        if not result:
            return []
        if "entries" in result:
            return [e["id"] for e in result["entries"] if e and e.get("id")]
        return [result["id"]] if result.get("id") else []


def get_video_info(
    video_id: str,
    platform: str = "youtube",
    cookies_browser: str | None = None,
) -> dict:
    target = _build_video_url(video_id, platform)
    try:
        with yt_dlp.YoutubeDL(_metadata_opts(cookies_browser)) as ydl:
            info = ydl.extract_info(target, download=False)
    except yt_dlp.utils.DownloadError as e:
        # Premieres, members-only videos, age-gated content, region-blocked
        # uploads, and deleted-but-still-listed videos all raise here. The
        # thumbnail typically still resolves via the standard CDN URL, so we
        # fall back to a synthetic info dict and let the card render with
        # a "[Unavailable: ...]" title rather than disappearing from the grid.
        reason = _summarize_yt_dlp_error(str(e))
        return _fallback_video_info(video_id, platform, reason)

    if not info:
        return _fallback_video_info(video_id, platform, "no metadata returned")

    embed_url = (
        f"https://player.vimeo.com/video/{info.get('id')}"
        if platform == "vimeo"
        else f"https://www.youtube.com/embed/{info.get('id')}"
    )

    return {
        "title": info.get("title"),
        "thumbnail": get_last_non_webp_thumbnail(info.get("thumbnails", [])),
        "embed_url": embed_url,
        "video_id": info.get("id"),
        "platform": platform,
    }


def _summarize_yt_dlp_error(msg: str) -> str:
    """Pick a short, user-readable reason out of a yt-dlp error message.

    Order matters: more specific patterns first so a generic "video
    unavailable" doesn't swallow cases that actually meant "premiere"
    or "removed". The labels are intentionally short — they appear as
    a placeholder card title in the grid.
    """
    lowered = msg.lower()

    # Time-shifted content (premieres + live streams). Specific phrases
    # before the generic "premiere" / "live" catches.
    if "premieres in" in lowered or "premiere" in lowered:
        return "Premiere not yet aired"
    if "live event will begin" in lowered or "live stream will begin" in lowered:
        return "Live not yet started"
    if "live event has ended" in lowered or "live stream has ended" in lowered:
        return "Live ended"

    # Access gates.
    if "members-only" in lowered or "join this channel" in lowered:
        return "Members-only"
    if "private video" in lowered:
        return "Private"
    if "age" in lowered and ("restrict" in lowered or "sign in to confirm your age" in lowered):
        return "Age-restricted"
    if "requires payment" in lowered or "rent" in lowered or "purchase" in lowered:
        return "Paid content"
    if "drm" in lowered:
        return "DRM-protected"

    # Account / channel state.
    if "account has been terminated" in lowered or "channel has been terminated" in lowered:
        return "Channel terminated"

    # Vimeo-specific gates.
    if "password" in lowered and ("protect" in lowered or "video-password" in lowered):
        return "Password-protected"
    if "embed-only" in lowered or "embedding page" in lowered:
        return "Embed-only"
    # Sign-in / cookies hint. The frontend turns this into a one-time
    # toast prompting the user to configure browser cookies in Settings.
    if "sign in" in lowered or "cookies" in lowered:
        return "Sign-in required"
    if "login" in lowered:
        return "Login required"

    # Client / app restrictions (YouTube's "Made for Kids" type blocks).
    if "not available on this app" in lowered or "not available in this app" in lowered:
        return "Restricted content"

    # Permanent gone-vs-temporary-block. Check "removed" / "deleted" before
    # the generic "video unavailable" so we get the more accurate label.
    if "removed" in lowered or "deleted" in lowered or "has been taken down" in lowered:
        return "Removed"
    if "copyright" in lowered:
        return "Removed (copyright)"

    # Generic catch-all. "Video unavailable" used to be labeled as
    # "Unavailable in your region" but YouTube uses that phrase for many
    # different conditions (geo-block, channel takedown, unlisted-gone,
    # etc.) so claiming the cause is misleading.
    if "video unavailable" in lowered or "this video is unavailable" in lowered or "not available" in lowered:
        return "Unavailable"

    return "Couldn't load metadata"


def get_last_non_webp_thumbnail(thumbnails: list) -> str:
    non_webp = [t["url"] for t in thumbnails if not t["url"].endswith(".webp")]
    return non_webp[-1] if non_webp else thumbnails[-1]["url"]


def detect_platform(url: str) -> str:
    """Best-effort platform detection from a URL string."""
    return "vimeo" if "vimeo.com" in url else "youtube"
