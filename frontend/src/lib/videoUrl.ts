/**
 * Strict whitelist resolver for video URLs.
 *
 * Recognized:
 *   YouTube — youtu.be/ID, youtube.com/watch?v=ID, /playlist?list=ID,
 *             /shorts/ID, /@handle[/section], /channel/ID, /c/NAME, /user/NAME
 *   Vimeo   — vimeo.com/{numericId}[/hash], /channels/{name}[/{id}],
 *             /showcase/{id}, /album/{id}, /user{numericId}, /{username}
 *
 * Anything else → null. Strips fragments. Adds https:// when missing.
 */

export type Platform = "youtube" | "vimeo"
export type UrlKind = "video" | "playlist" | "channel" | "showcase" | "user"

export interface ResolvedUrl {
  url: string
  platform: Platform
  kind: UrlKind
}

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/
const VIMEO_NUM_RE = /^\d{1,12}$/
const VIMEO_HASH_RE = /^[a-zA-Z0-9]{6,20}$/

function kindLabel(p: Platform, k: UrlKind): string {
  const platform = p === "vimeo" ? "Vimeo" : "YouTube"
  const noun =
    k === "video" ? "video"
    : k === "playlist" ? "playlist"
    : k === "channel" ? "channel"
    : k === "showcase" ? "showcase"
    : "user"
  return `${platform} ${noun}`
}

export function describeUrl(r: ResolvedUrl | null): string | null {
  return r ? kindLabel(r.platform, r.kind) : null
}

export function resolveSupportedUrl(raw: string): ResolvedUrl | null {
  try {
    const stripped = raw.trim().split("#")[0]
    if (!stripped) return null
    const withProtocol = /^https?:\/\//i.test(stripped) ? stripped : `https://${stripped}`
    const url = new URL(withProtocol)
    const host = url.hostname.replace(/^(www\.|m\.)/, "")

    // ── YouTube ────────────────────────────────────────────────────────
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0]
      return YT_ID_RE.test(id)
        ? { url: `https://www.youtube.com/watch?v=${id}`, platform: "youtube", kind: "video" }
        : null
    }
    if (host === "youtube.com") {
      const path = url.pathname
      const videoId = url.searchParams.get("v")
      if (videoId && YT_ID_RE.test(videoId)) {
        return { url: `https://www.youtube.com/watch?v=${videoId}`, platform: "youtube", kind: "video" }
      }
      const listId = url.searchParams.get("list")
      if (listId && path === "/playlist") {
        return { url: `https://www.youtube.com/playlist?list=${listId}`, platform: "youtube", kind: "playlist" }
      }
      const shortsMatch = path.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
      if (shortsMatch) {
        return { url: `https://www.youtube.com/watch?v=${shortsMatch[1]}`, platform: "youtube", kind: "video" }
      }
      const handleMatch = path.match(/^\/@([a-zA-Z0-9_.-]+)(\/(\w+))?/)
      if (handleMatch) {
        const handle = handleMatch[1]
        const section = handleMatch[3]
        const url =
          section === "shorts"
            ? `https://www.youtube.com/@${handle}/shorts`
            : `https://www.youtube.com/@${handle}/videos`
        return { url, platform: "youtube", kind: "channel" }
      }
      const channelMatch = path.match(/^\/channel\/([a-zA-Z0-9_-]+)/)
      if (channelMatch) {
        return { url: `https://www.youtube.com/channel/${channelMatch[1]}`, platform: "youtube", kind: "channel" }
      }
      const legacyMatch = path.match(/^\/(c|user)\/([a-zA-Z0-9_.-]+)/)
      if (legacyMatch) {
        return { url: `https://www.youtube.com/${legacyMatch[1]}/${legacyMatch[2]}`, platform: "youtube", kind: "channel" }
      }
      return null
    }

    // ── Vimeo ─────────────────────────────────────────────────────────
    if (host === "vimeo.com") {
      const path = url.pathname.replace(/\/+$/, "") // strip trailing slash

      // /12345678 or /12345678/hash
      const numericVideo = path.match(/^\/(\d+)(?:\/([a-zA-Z0-9]+))?$/)
      if (numericVideo) {
        const id = numericVideo[1]
        const hash = numericVideo[2]
        if (!VIMEO_NUM_RE.test(id)) return null
        if (hash && !VIMEO_HASH_RE.test(hash)) return null
        const canonical = hash ? `https://vimeo.com/${id}/${hash}` : `https://vimeo.com/${id}`
        return { url: canonical, platform: "vimeo", kind: "video" }
      }

      // /channels/{name} or /channels/{name}/{id}
      const channelMatch = path.match(/^\/channels\/([a-zA-Z0-9_-]+)(?:\/(\d+))?$/)
      if (channelMatch) {
        if (channelMatch[2]) {
          return { url: `https://vimeo.com/${channelMatch[2]}`, platform: "vimeo", kind: "video" }
        }
        return { url: `https://vimeo.com/channels/${channelMatch[1]}`, platform: "vimeo", kind: "channel" }
      }

      // /showcase/{id} or /album/{id}
      const showcaseMatch = path.match(/^\/(?:showcase|album)\/(\d+)$/)
      if (showcaseMatch) {
        return { url: `https://vimeo.com/showcase/${showcaseMatch[1]}`, platform: "vimeo", kind: "showcase" }
      }

      // /user12345 (numeric user ID)
      const numericUser = path.match(/^\/user(\d+)$/)
      if (numericUser) {
        return { url: `https://vimeo.com/user${numericUser[1]}`, platform: "vimeo", kind: "user" }
      }

      // /username (bare). Must be a single path segment and not collide
      // with the reserved namespaces above.
      const bareUser = path.match(/^\/([a-zA-Z][a-zA-Z0-9_-]{2,})$/)
      if (bareUser) {
        return { url: `https://vimeo.com/${bareUser[1]}`, platform: "vimeo", kind: "user" }
      }

      return null
    }

    // Anything else — reject.
    return null
  } catch {
    return null
  }
}
