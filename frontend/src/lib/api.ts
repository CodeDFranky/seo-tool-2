import type { Platform } from "./videoUrl"
import { apiUrl } from "./backend"

export type { Platform }

/**
 * Surfaces a 429 from the server as a structured error so the UI can
 * display a friendly "slow down" message and back off.
 */
export class RateLimitError extends Error {
  readonly retryAfter: number
  readonly resetAt?: number
  constructor(message: string, retryAfter: number, resetAt?: number) {
    super(message)
    this.name = "RateLimitError"
    this.retryAfter = retryAfter
    this.resetAt = resetAt
  }
}

async function handleResponse<T>(res: Response, label: string): Promise<T> {
  if (res.status === 429) {
    const data = await res.json().catch(() => ({} as { error?: string; retry_after?: number; reset_at?: number }))
    const retry = Number(res.headers.get("Retry-After")) || data.retry_after || 30
    throw new RateLimitError(
      data.error || `${label}: rate limit exceeded`,
      retry,
      data.reset_at
    )
  }
  if (!res.ok) throw new Error(`${label}: ${res.status}`)
  return res.json() as Promise<T>
}

export interface VideoInfo {
  title: string
  thumbnail: string
  embed_url: string
  video_id: string
  platform: Platform
}

export interface FetchVideoInfoResponse extends VideoInfo {
  error?: string
}

export interface DownloadItem {
  url: string
  title: string
}

export interface FetchIdsResponse {
  ids: string[]
  platform: Platform
  offset: number
  has_more: boolean
  error?: string
}

export async function fetchIds(
  url: string,
  options: { offset?: number; limit?: number } = {}
): Promise<FetchIdsResponse> {
  const { offset = 0, limit = 100 } = options
  const res = await fetch(apiUrl("/api/fetch_ids"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, offset, limit }),
  })
  return handleResponse<FetchIdsResponse>(res, "Failed to fetch IDs")
}

export async function fetchVideoInfo(
  video_id: string,
  platform: Platform
): Promise<FetchVideoInfoResponse> {
  const res = await fetch(apiUrl("/api/fetch_video_info"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_id, platform }),
  })
  return handleResponse(res, "Failed to fetch video info")
}

export async function downloadThumbnails(items: DownloadItem[]): Promise<Blob> {
  const res = await fetch(apiUrl("/download-thumbnails"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) throw new Error(`Failed to download thumbnails: ${res.status}`)
  return res.blob()
}

export function proxyThumbnailUrl(videoId: string, platform: Platform): string {
  return apiUrl(`/api/proxy_thumbnail?id=${encodeURIComponent(videoId)}&platform=${platform}`)
}

export async function fetchThumbnailFile(
  videoId: string,
  platform: Platform,
  filename: string,
  timeoutMs: number = 12000
): Promise<File> {
  // Use an AbortController so a hung request doesn't leave the caller
  // (a card waiting on its thumbnail) parked indefinitely.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(proxyThumbnailUrl(videoId, platform), { signal: controller.signal })
    if (!res.ok) throw new Error(`Thumbnail fetch failed: ${res.status}`)
    const blob = await res.blob()
    return new File([blob], filename, { type: blob.type || "image/jpeg" })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Thumbnail fetch timed out")
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
