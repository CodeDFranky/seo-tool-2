import yt_dlp


# Metadata extraction is light (info-only, no media bytes). The polite
# floor matters most for sustained bulk scraping; a single local user
# pulling a few batches at a time can run with no inter-request pause
# and still stay well below YouTube's per-IP envelope. The heavy-media
# capture path keeps its sleeps separately in app.py.
_METADATA_OPTS = {
    "quiet": True,
    "no_warnings": True,
}


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
        thumbnail = ""  # No equivalent always-on Vimeo thumbnail URL pattern.
        embed_url = f"https://player.vimeo.com/video/{video_id}"
    else:
        # YouTube's CDN serves /maxresdefault.jpg for any video ID,
        # including unaired premieres and private/unlisted uploads.
        thumbnail = f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg"
        embed_url = f"https://www.youtube.com/embed/{video_id}"
    return {
        "title": f"[Unavailable: {reason}]",
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
        **_METADATA_OPTS,
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


def get_video_info(video_id: str, platform: str = "youtube") -> dict:
    target = _build_video_url(video_id, platform)
    try:
        with yt_dlp.YoutubeDL(_METADATA_OPTS) as ydl:
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
    """Pick a short, user-readable reason out of a yt-dlp error message."""
    lowered = msg.lower()
    if "premieres in" in lowered or "premiere" in lowered:
        return "Premiere not yet aired"
    if "members-only" in lowered or "join this channel" in lowered:
        return "Members-only"
    if "private video" in lowered:
        return "Private"
    if "video unavailable" in lowered or "this video is unavailable" in lowered:
        return "Unavailable in your region"
    if "age" in lowered and "restrict" in lowered:
        return "Age-restricted"
    if "removed" in lowered or "deleted" in lowered:
        return "Removed"
    return "Couldn't load metadata"


def get_last_non_webp_thumbnail(thumbnails: list) -> str:
    non_webp = [t["url"] for t in thumbnails if not t["url"].endswith(".webp")]
    return non_webp[-1] if non_webp else thumbnails[-1]["url"]


def detect_platform(url: str) -> str:
    """Best-effort platform detection from a URL string."""
    return "vimeo" if "vimeo.com" in url else "youtube"
