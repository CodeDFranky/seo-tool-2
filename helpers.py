import yt_dlp


# Polite defaults applied to every metadata extraction call.
# Per the yt-dlp Extractors wiki: sleep between data extraction requests
# is the single biggest factor in avoiding 429s from YouTube. 1–2s is the
# community floor; we use 2s.
_METADATA_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "sleep_interval_requests": 2,
}


def _build_video_url(video_id: str, platform: str) -> str:
    """Construct the canonical platform URL for yt-dlp from a bare video ID."""
    if platform == "vimeo":
        return f"https://vimeo.com/{video_id}"
    return f"https://www.youtube.com/watch?v={video_id}"


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
    with yt_dlp.YoutubeDL(_METADATA_OPTS) as ydl:
        info = ydl.extract_info(target, download=False)
        if not info:
            raise ValueError("Failed to get video info")

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


def get_last_non_webp_thumbnail(thumbnails: list) -> str:
    non_webp = [t["url"] for t in thumbnails if not t["url"].endswith(".webp")]
    return non_webp[-1] if non_webp else thumbnails[-1]["url"]


def detect_platform(url: str) -> str:
    """Best-effort platform detection from a URL string."""
    return "vimeo" if "vimeo.com" in url else "youtube"
