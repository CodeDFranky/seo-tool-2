/**
 * Persistent per-channel metadata cache for the Vlog tab.
 *
 * Stores the ID list AND the per-video metadata for a given
 * `{url, offset, limit}` window in localStorage so re-fetching a
 * recently-viewed channel skips both `/api/fetch_ids` and the wave of
 * `/api/fetch_video_info` calls. With a hot cache the whole pipeline
 * collapses from "enumerate + ~100 metadata fetches" down to a single
 * synchronous JSON.parse.
 *
 * Design notes:
 *   - localStorage (not IndexedDB) because the payload is small JSON and
 *     the project standardized on localStorage for everything else of
 *     this shape (settings, tabs, download-history). IDB would be
 *     overkill.
 *   - Key encodes the canonical resolved URL + page window so a fresh
 *     pagination request lands on the right entry without needing the
 *     URL stored in the value itself.
 *   - Default TTL is 1 hour: long enough to make repeated fetches snappy
 *     within a working session, short enough that stale titles / new
 *     uploads get picked up on the next day's first fetch.
 *   - Capped at MAX_ENTRIES total entries; oldest get evicted on
 *     overflow so the ~5MB localStorage quota never bites us.
 *   - Thumbnail fetching is unaffected — the URL is just a string here.
 *     The per-session in-memory blob cache in VideoGrid handles those.
 */

import type { VideoInfo, Platform } from "./api"

const STORAGE_PREFIX = "dfr:channel-cache:"
/** 1 hour. Metadata can go stale (new uploads, edited titles); short
 *  default makes the freshness vs. speed trade-off feel right. */
const DEFAULT_TTL_MS = 60 * 60 * 1000
/** Bounds localStorage growth. 50 entries × ~100 videos × ~500 bytes
 *  metadata each ≈ 2.5MB — comfortably under the ~5MB browser quota. */
const MAX_ENTRIES = 50

/** Shape stored in localStorage. URL/offset/limit live in the *key*; the
 *  value holds only what the consumer needs after a key match. */
export interface ChannelCacheEntry {
  platform: Platform
  ids: string[]
  videos: Record<string, VideoInfo>
  hasMore: boolean
  cachedAt: number
}

function key(url: string, offset: number, limit: number): string {
  return `${STORAGE_PREFIX}${url}|${offset}|${limit}`
}

/**
 * Returns the cached entry if present and not expired, else null.
 * Side-effect: prunes the entry if it's past its TTL.
 */
export function readChannel(
  url: string,
  offset: number,
  limit: number,
  maxAgeMs: number = DEFAULT_TTL_MS,
): ChannelCacheEntry | null {
  try {
    const k = key(url, offset, limit)
    const raw = localStorage.getItem(k)
    if (!raw) return null
    const entry = JSON.parse(raw) as ChannelCacheEntry
    if (!entry || typeof entry !== "object" || typeof entry.cachedAt !== "number") {
      localStorage.removeItem(k)
      return null
    }
    if (Date.now() - entry.cachedAt > maxAgeMs) {
      localStorage.removeItem(k)
      return null
    }
    return entry
  } catch {
    return null
  }
}

/**
 * Persists an entry. Overwrites any existing entry at the same key and
 * runs the LRU-style cap so we don't unbounded-grow.
 */
export function writeChannel(
  url: string,
  offset: number,
  limit: number,
  entry: Omit<ChannelCacheEntry, "cachedAt">,
): void {
  try {
    const full: ChannelCacheEntry = { ...entry, cachedAt: Date.now() }
    localStorage.setItem(key(url, offset, limit), JSON.stringify(full))
    enforceCap()
  } catch {
    /* localStorage full or unavailable — caching is best-effort */
  }
}

/**
 * Drops every cached entry for a given canonical URL across all
 * offset/limit windows. Used by the Refresh button to force a clean
 * re-fetch of the current channel.
 */
export function invalidateChannel(url: string): void {
  try {
    const prefix = `${STORAGE_PREFIX}${url}|`
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  } catch {
    /* nothing to do */
  }
}

/**
 * Wipes every channel-cache entry. Wired to a Settings button so users
 * have a "nuclear option" when something looks off.
 */
export function clearChannelCache(): void {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  } catch {
    /* nothing to do */
  }
}

/**
 * Returns the total number of cached entries. Handy for the Settings
 * dialog's "Clear (N entries)" label.
 */
export function channelCacheSize(): number {
  try {
    let count = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX)) count++
    }
    return count
  } catch {
    return 0
  }
}

/**
 * Walks the cache namespace and evicts the oldest entries if we've gone
 * past MAX_ENTRIES. Called after every write; cheap because the prefix
 * scan only touches our own keys.
 */
function enforceCap(): void {
  try {
    const entries: { key: string; cachedAt: number }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(STORAGE_PREFIX)) continue
      try {
        const raw = localStorage.getItem(k)
        if (!raw) continue
        const parsed = JSON.parse(raw) as ChannelCacheEntry
        // Entries without a parseable cachedAt are corrupt — sort them
        // first so they're evicted first.
        const cachedAt = typeof parsed?.cachedAt === "number" ? parsed.cachedAt : 0
        entries.push({ key: k, cachedAt })
      } catch {
        // Corrupt JSON — schedule for eviction by treating it as oldest.
        entries.push({ key: k, cachedAt: 0 })
      }
    }
    if (entries.length <= MAX_ENTRIES) return
    entries.sort((a, b) => a.cachedAt - b.cachedAt)
    const overflow = entries.length - MAX_ENTRIES
    for (let i = 0; i < overflow; i++) {
      localStorage.removeItem(entries[i].key)
    }
  } catch {
    /* nothing to do */
  }
}
