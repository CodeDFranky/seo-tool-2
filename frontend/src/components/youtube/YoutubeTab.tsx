import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react"
import { toast } from "sonner"
import { AnimatePresence, motion } from "framer-motion"
import * as Popover from "@radix-ui/react-popover"
import {
  Link as LinkIcon,
  Download,
  CheckSquare,
  Square,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  RefreshCw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { VideoGrid } from "./VideoGrid"
import { CaptureHistoryButton } from "./capture-history"
import { DownloadHistoryButton } from "./download-history"
import {
  ActiveCapturesProvider,
  useActiveCapturesActions,
  useActiveCapturesModal,
} from "./active-captures"

// Code-split: the modal's video player + scrubbing logic only mounts when
// a user actually opens the frame picker on a ready capture.
const GenerateThumbnailModal = lazy(() => import("./GenerateThumbnailModal"))
import {
  fetchIds,
  fetchVideoInfo,
  downloadThumbnails,
  RateLimitError,
  type VideoInfo,
  type Platform,
} from "@/lib/api"
import { describeUrl, resolveSupportedUrl } from "@/lib/videoUrl"
import { saveBlob } from "@/lib/saveBlob"
import { getSetting } from "@/lib/settings"
import { recordDownload } from "@/lib/download-history"
import { revealInFolder } from "@/lib/reveal"
import { invalidateChannel, readChannel, writeChannel } from "@/lib/channel-cache"
import { notify } from "@/lib/notify"

/** Session-storage flag so the "Sign-in required" hint toast only fires
 *  once per app session. Without this, every video on a members-only
 *  channel would queue up its own toast and bury the user. */
const COOKIES_HINT_KEY = "dfr:cookies-hint-shown"

/**
 * Run `worker` over `items` with a fixed concurrency. Used to stay under
 * the server's per-minute cap on metadata extraction without coupling
 * the UI batch size to the server's concurrency budget.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, i: number) => Promise<void>
): Promise<void> {
  let cursor = 0
  const launch = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++
      await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, launch))
}

type Phase = "idle" | "fetching-ids" | "loading-info" | "done" | "error"
interface YtState {
  phase: Phase
  allIds: string[]
  videos: (VideoInfo | null)[]
  loadedCount: number
  progress: number
  hasMoreIds: boolean
  error: string | null
  /** True only while the FIRST batch (after START) is being fetched and
   *  populated. Goes false the moment the initial batch is fully
   *  rendered. Used to drive the input / Fetch-button disabled state and
   *  the progress banner — neither should reappear during load-more
   *  waves; the floating button has its own spinner for that. */
  initialPending: boolean
  /** Set when the current results were hydrated from the persistent
   *  channel cache rather than freshly fetched. Used to render a small
   *  "Loaded from cache (N min ago)" indicator and unlock the Refresh
   *  button. Cleared the moment a fresh fetch begins. */
  cachedAt: number | null
}
type YtAction =
  | { type: "START" }
  | { type: "SET_IDS"; ids: string[]; batchSize: number; hasMoreIds: boolean }
  | { type: "APPEND_IDS"; ids: string[]; hasMoreIds: boolean }
  | { type: "LOAD_MORE"; count: number }
  | { type: "VIDEO_LOADED"; video: VideoInfo; slotIndex: number }
  | { type: "ERROR"; message: string }
  /** Hydrate the whole initial batch synchronously from cache. Avoids
   *  the IDS → metadata → done sequence entirely. */
  | {
      type: "HYDRATE_FROM_CACHE"
      ids: string[]
      videos: (VideoInfo | null)[]
      batchSize: number
      hasMoreIds: boolean
      cachedAt: number
    }

const initial: YtState = {
  phase: "idle",
  allIds: [],
  videos: [],
  loadedCount: 0,
  progress: 0,
  hasMoreIds: false,
  error: null,
  initialPending: false,
  cachedAt: null,
}

function reducer(state: YtState, action: YtAction): YtState {
  switch (action.type) {
    case "START":
      return { ...initial, phase: "fetching-ids", progress: 10, initialPending: true }
    case "HYDRATE_FROM_CACHE": {
      // Cache hit: jump straight to "done" with the batch fully populated.
      // No network work, no progress animation, no "loading" banner —
      // the data is right there.
      const count = Math.min(action.batchSize, action.ids.length)
      const videos = action.videos.slice(0, count)
      const everythingShown =
        count >= action.ids.length && !action.hasMoreIds
      return {
        ...state,
        phase: "done",
        allIds: action.ids,
        videos,
        loadedCount: count,
        hasMoreIds: action.hasMoreIds,
        progress: everythingShown ? 100 : 95,
        initialPending: false,
        cachedAt: action.cachedAt,
      }
    }
    case "SET_IDS": {
      const count = Math.min(action.batchSize, action.ids.length)
      return {
        ...state,
        phase: "loading-info",
        allIds: action.ids,
        videos: Array(count).fill(null),
        loadedCount: count,
        hasMoreIds: action.hasMoreIds,
        progress: 30,
      }
    }
    case "APPEND_IDS":
      return {
        ...state,
        allIds: [...state.allIds, ...action.ids],
        hasMoreIds: action.hasMoreIds,
      }
    case "LOAD_MORE":
      return {
        ...state,
        videos: [...state.videos, ...Array(action.count).fill(null)],
        loadedCount: state.loadedCount + action.count,
      }
    case "VIDEO_LOADED": {
      const videos = [...state.videos]
      videos[action.slotIndex] = action.video
      const loaded = videos.filter(Boolean).length
      const allCurrentSlotsLoaded = loaded === videos.length
      const everythingLoaded =
        allCurrentSlotsLoaded &&
        state.loadedCount >= state.allIds.length &&
        !state.hasMoreIds
      const phase = allCurrentSlotsLoaded ? "done" : "loading-info"
      return {
        ...state,
        phase,
        videos,
        progress: Math.min(
          30 + (loaded / videos.length) * 70,
          everythingLoaded ? 100 : 95,
        ),
        // Initial batch is "done" the moment its slots are full. Subsequent
        // load-more waves never re-enter the initial-pending state, so the
        // input / banner stay calm.
        initialPending: state.initialPending && !allCurrentSlotsLoaded,
      }
    }
    case "ERROR":
      return { ...state, phase: "error", error: action.message, progress: 0, initialPending: false }
    default:
      return state
  }
}

/**
 * Compact relative-time formatter for the "Loaded from cache" badge.
 * Shows "just now" / "N min ago" / "N hr ago"; anything older than a
 * day rounds to "1d+ ago" since the cache TTL caps out at an hour
 * anyway, this is just defensive.
 */
function formatRelativeTime(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 45) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return "1d+ ago"
}

const BATCH_SIZE = 12
/** How many IDs to enumerate per /api/fetch_ids call. Bigger pages mean
 *  fewer round-trips but slower first response on huge channels. 100 is
 *  the comfortable middle for everything from a single video to channels
 *  with hundreds of thousands of uploads. */
const IDS_PAGE_SIZE = 100

export function YoutubeTab() {
  return (
    <ActiveCapturesProvider>
      <YoutubeTabInner />
      <ActiveCapturesModalHost />
    </ActiveCapturesProvider>
  )
}

/** Mounted once per Vlog tab session. Watches the registry's modal slot and
 *  renders the lazy-loaded GenerateThumbnailModal when one becomes ready. */
function ActiveCapturesModalHost() {
  const slot = useActiveCapturesModal()
  const actions = useActiveCapturesActions()
  if (!slot || slot.phase !== "ready" || !slot.token) return null
  return (
    <Suspense fallback={null}>
      <GenerateThumbnailModal
        videoId={slot.videoId}
        platform={slot.platform}
        title={slot.title}
        token={slot.token}
        open={true}
        onClose={actions.closeModal}
      />
    </Suspense>
  )
}

function YoutubeTabInner() {
  const [state, dispatch] = useReducer(reducer, initial)
  const [urlInput, setUrlInput] = useState("")
  const [platform, setPlatform] = useState<Platform>("youtube")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loadingMore, setLoadingMore] = useState(false)
  // The canonical source URL is held in a ref so the pagination loop can
  // re-call fetchIds without coupling to React state timing.
  const sourceUrlRef = useRef<string | null>(null)

  // In-flight metadata concurrency. The server caps at 8 — matching here
  // means no requests need to retry on the client side.
  const METADATA_CONCURRENCY = 8
  // Synchronous mutex around the metadata fetch wave itself. Prevents
  // overlapping fetch passes from pushing more than 8 requests onto the
  // server in parallel.
  const batchInFlightRef = useRef(false)
  // Separate synchronous mutex around handleLoadMore's *setup* phase
  // (page-fetch + dispatch + slot reservation). Has to be distinct from
  // batchInFlightRef so we can hand off cleanly to loadVideoInfoBatch
  // without a moment of "no one holds the lock."
  const loadMoreInFlightRef = useRef(false)
  // Monotonic session ID bumped on every new Fetch submit. In-flight
  // metadata workers capture the session at start and discard any
  // `VIDEO_LOADED` dispatch whose session no longer matches — otherwise
  // a stale load-more wave from the previous URL would write its videos
  // into the new URL's empty slots and produce a corrupted grid.
  const sessionIdRef = useRef(0)

  const loadVideoInfoBatch = useCallback(
    async (
      ids: string[],
      slotOffset: number,
      plat: Platform,
      /** Optional sink for successfully-fetched videos. The Fetch flow
       *  uses this to collect a snapshot for the persistent cache. */
      onVideo?: (video: VideoInfo) => void,
    ) => {
      if (batchInFlightRef.current) return
      batchInFlightRef.current = true
      // Capture the session at wave start. Every dispatch checks against
      // this — if the user kicks off a new Fetch, sessionIdRef bumps and
      // any of *this* wave's lingering responses are dropped on the floor.
      const session = sessionIdRef.current
      // Read the cookies-browser setting ONCE per wave. Changing it
      // mid-wave is a power-user edge case; consistent-within-wave wins
      // over rare freshness. The "none" sentinel maps to null in api.ts.
      const cookiesBrowser = getSetting("cookiesBrowser")
      let rateLimited = false
      // Latch so a wave on a members-only channel only fires one hint
      // toast even if every video comes back "Sign-in required".
      let signInHintFired = false
      try {
      await runWithConcurrency(ids, METADATA_CONCURRENCY, async (id, i) => {
        try {
          const video = await fetchVideoInfo(id, plat, cookiesBrowser)
          if (sessionIdRef.current !== session) return
          if (!video.error) {
            dispatch({ type: "VIDEO_LOADED", video, slotIndex: slotOffset + i })
            onVideo?.(video)
            // Sign-in hint: the backend classifies cookies/sign-in errors
            // as "Sign-in required". If the user hasn't already configured
            // a browser, point them at Settings — one toast per session,
            // one per wave (whichever is stricter).
            if (
              video.unavailable_reason === "Sign-in required" &&
              cookiesBrowser === "none" &&
              !signInHintFired &&
              !sessionStorage.getItem(COOKIES_HINT_KEY)
            ) {
              signInHintFired = true
              sessionStorage.setItem(COOKIES_HINT_KEY, "1")
              toast.info("This video needs sign-in", {
                description: "Configure browser cookies in Settings to access it.",
                action: {
                  label: "Settings",
                  onClick: () => window.dispatchEvent(new Event("dfr:open-settings")),
                },
                duration: 8000,
              })
            }
          }
        } catch (err) {
          if (sessionIdRef.current !== session) return
          if (err instanceof RateLimitError) {
            if (!rateLimited) {
              rateLimited = true
              toast.warning("Slow down", {
                description: `Hit a throttle limit. Retry in ${err.retryAfter}s.`,
                duration: 4000,
              })
            }
          } else {
            console.warn(`Failed to load info for ${id}`, err)
          }
        }
      })
      } finally {
        batchInFlightRef.current = false
      }
    },
    []
  )

  /**
   * Shared fetch flow used by both the form submit and the Refresh
   * button. Resets session bookkeeping, then either hydrates from the
   * persistent cache (zero network) or runs the normal enumerate +
   * metadata wave and writes the result to the cache for next time.
   */
  const runFetch = useCallback(
    async (resolvedUrl: string, resolvedPlatform: Platform, opts: { useCache: boolean }) => {
      // Bump the session BEFORE clearing the mutexes so any in-flight worker
      // already past its session capture will fail the next check and exit
      // without dispatching into the new state.
      sessionIdRef.current += 1
      batchInFlightRef.current = false
      loadMoreInFlightRef.current = false
      setLoadingMore(false)
      setSelectedIds(new Set())
      setPlatform(resolvedPlatform)
      sourceUrlRef.current = resolvedUrl

      // ── Cache fast-path ───────────────────────────────────────────
      // A hit short-circuits the entire pipeline: no fetch_ids call, no
      // metadata wave, no progress animation. The user sees their grid
      // populated within a render tick.
      if (opts.useCache) {
        const cached = readChannel(resolvedUrl, 0, IDS_PAGE_SIZE)
        if (cached && cached.ids.length > 0) {
          setPlatform(cached.platform)
          const batchIds = cached.ids.slice(0, BATCH_SIZE)
          const batchVideos: (VideoInfo | null)[] = batchIds.map(
            (id) => cached.videos[id] ?? null,
          )
          dispatch({
            type: "HYDRATE_FROM_CACHE",
            ids: cached.ids,
            videos: batchVideos,
            batchSize: BATCH_SIZE,
            hasMoreIds: cached.hasMore,
            cachedAt: cached.cachedAt,
          })
          toast.info("Loaded from cache", {
            description: "Click Refresh to re-fetch from source.",
            duration: 2400,
          })
          return
        }
      }

      // ── Normal fetch path ─────────────────────────────────────────
      dispatch({ type: "START" })
      try {
        const { ids, platform: detected, has_more, error } = await fetchIds(resolvedUrl, {
          offset: 0, limit: IDS_PAGE_SIZE,
        })
        if (error) { dispatch({ type: "ERROR", message: error }); return }
        // Backend's detected platform is authoritative.
        setPlatform(detected)
        dispatch({ type: "SET_IDS", ids, batchSize: BATCH_SIZE, hasMoreIds: has_more })

        // Capture this wave's session so we don't accidentally write a
        // cache entry from a request the user already abandoned.
        const session = sessionIdRef.current
        const collected: Record<string, VideoInfo> = {}
        const batch = ids.slice(0, BATCH_SIZE)
        await loadVideoInfoBatch(batch, 0, detected, (v) => { collected[v.video_id] = v })

        // Only persist if this is still the active session.
        if (sessionIdRef.current === session && ids.length > 0) {
          writeChannel(resolvedUrl, 0, IDS_PAGE_SIZE, {
            platform: detected,
            ids,
            videos: collected,
            hasMore: has_more,
          })
        }
      } catch (err) {
        if (err instanceof RateLimitError) {
          dispatch({
            type: "ERROR",
            message: `Rate limit hit. Try again in ${err.retryAfter}s.`,
          })
        } else {
          dispatch({ type: "ERROR", message: String(err) })
        }
      }
    },
    [loadVideoInfoBatch],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const resolved = resolveSupportedUrl(urlInput)
    if (!resolved) {
      toast.error("Unsupported URL", {
        description: "Paste a YouTube or Vimeo video, playlist, channel, or user URL.",
      })
      return
    }
    await runFetch(resolved.url, resolved.platform, { useCache: true })
  }

  /**
   * Drops every cache window for the current URL, then re-runs the
   * fetch pipeline against the live source. Invalidation runs BEFORE
   * the fetch dispatches so the in-flight wave's eventual `writeChannel`
   * lands on an empty slot rather than racing the removal.
   */
  const handleRefresh = useCallback(async () => {
    const url = sourceUrlRef.current
    if (!url) return
    invalidateChannel(url)
    await runFetch(url, platform, { useCache: false })
  }, [platform, runFetch])

  const handleLoadMore = useCallback(async () => {
    // SYNCHRONOUS mutex against double-click / rapid presses. State guard
    // alone isn't enough because `loadingMore` only commits on the next
    // render; two clicks in the same tick would both pass.
    if (loadMoreInFlightRef.current) return
    if (state.loadedCount >= state.allIds.length && !state.hasMoreIds) return
    loadMoreInFlightRef.current = true
    setLoadingMore(true)
    try {
      let availableIds = state.allIds
      // Cache exhausted? Fetch the next page of IDs first.
      if (state.loadedCount >= state.allIds.length && state.hasMoreIds && sourceUrlRef.current) {
        // Check the persistent cache for THIS offset window first. The
        // ID list and any already-fetched metadata for the page can be
        // restored without hitting the server.
        const url = sourceUrlRef.current
        const offset = state.allIds.length
        const cachedPage = readChannel(url, offset, IDS_PAGE_SIZE)
        if (cachedPage && cachedPage.ids.length > 0) {
          dispatch({ type: "APPEND_IDS", ids: cachedPage.ids, hasMoreIds: cachedPage.hasMore })
          availableIds = [...state.allIds, ...cachedPage.ids]
        } else {
          const { ids: more, has_more } = await fetchIds(url, {
            offset,
            limit: IDS_PAGE_SIZE,
          })
          if (more.length > 0) {
            dispatch({ type: "APPEND_IDS", ids: more, hasMoreIds: has_more })
            availableIds = [...state.allIds, ...more]
            // Seed the cache entry for this page with the IDs. Metadata
            // gets filled in by the wave below; we write again on the
            // way out.
            writeChannel(url, offset, IDS_PAGE_SIZE, {
              platform,
              ids: more,
              videos: {},
              hasMore: has_more,
            })
          } else {
            // Server says no more; finish.
            dispatch({ type: "APPEND_IDS", ids: [], hasMoreIds: false })
            return
          }
        }
      }

      const nextBatch = availableIds.slice(state.loadedCount, state.loadedCount + BATCH_SIZE)
      if (nextBatch.length === 0) return
      // loadedCount === videos.length by reducer invariant — use the former
      // so we don't need state.videos in deps (it churns 12× per batch).
      const slotOffset = state.loadedCount

      // If this batch corresponds to a cache window we have warm, hand
      // the cached metadata to the reducer directly. Anything missing
      // falls through to the network wave.
      //
      // Slot mapping is the tricky bit: the reducer's `slotIndex` is
      // global (slotOffset + localIndex). loadVideoInfoBatch indexes
      // into the array it's given starting from slotOffset, so we can't
      // just hand it the "misses" list — that would collapse the gaps.
      // Instead, we keep nextBatch contiguous and dispatch cache hits
      // immediately by their *original* localIndex; misses get fetched
      // individually with their original slot indices.
      const url = sourceUrlRef.current
      const offset = slotOffset - (slotOffset % IDS_PAGE_SIZE)
      const pageCache = url ? readChannel(url, offset, IDS_PAGE_SIZE) : null

      dispatch({ type: "LOAD_MORE", count: nextBatch.length })
      // Replay cached metadata into the reducer first (synchronous).
      const missLocalIndices: number[] = []
      for (let i = 0; i < nextBatch.length; i++) {
        const v = pageCache?.videos[nextBatch[i]]
        if (v) dispatch({ type: "VIDEO_LOADED", video: v, slotIndex: slotOffset + i })
        else missLocalIndices.push(i)
      }
      if (missLocalIndices.length === 0) return

      // Fetch only the misses, with explicit per-id slot routing so the
      // dispatches land in the correct grid cells regardless of gaps.
      const newlyFetched: Record<string, VideoInfo> = {}
      const session = sessionIdRef.current
      let rateLimited = false
      batchInFlightRef.current = true
      try {
        await runWithConcurrency(missLocalIndices, METADATA_CONCURRENCY, async (localIndex) => {
          const id = nextBatch[localIndex]
          try {
            const video = await fetchVideoInfo(id, platform)
            if (sessionIdRef.current !== session) return
            if (!video.error) {
              dispatch({ type: "VIDEO_LOADED", video, slotIndex: slotOffset + localIndex })
              newlyFetched[video.video_id] = video
            }
          } catch (err) {
            if (sessionIdRef.current !== session) return
            if (err instanceof RateLimitError) {
              if (!rateLimited) {
                rateLimited = true
                toast.warning("Slow down", {
                  description: `Hit a throttle limit. Retry in ${err.retryAfter}s.`,
                  duration: 4000,
                })
              }
            } else {
              console.warn(`Failed to load info for ${id}`, err)
            }
          }
        })
      } finally {
        batchInFlightRef.current = false
      }

      // Patch the cache for this offset window with the misses we just
      // resolved. Existing hits are preserved.
      if (url && Object.keys(newlyFetched).length > 0) {
        const existing = readChannel(url, offset, IDS_PAGE_SIZE)
        if (existing) {
          writeChannel(url, offset, IDS_PAGE_SIZE, {
            platform: existing.platform,
            ids: existing.ids,
            videos: { ...existing.videos, ...newlyFetched },
            hasMore: existing.hasMore,
          })
        }
      }
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast.warning("Slow down", {
          description: `Hit a throttle limit. Retry in ${err.retryAfter}s.`,
        })
      } else {
        toast.error(String(err))
      }
    } finally {
      loadMoreInFlightRef.current = false
      setLoadingMore(false)
    }
  }, [state.allIds, state.loadedCount, state.hasMoreIds, platform])

  // Stable identity so React.memo on VideoCard isn't defeated.
  const handleSelectChange = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  function handleSelectAll() {
    const loaded = state.videos.filter(Boolean) as VideoInfo[]
    if (selectedIds.size === loaded.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(loaded.map((v) => v.video_id)))
  }
  async function handleBatchDownload() {
    const selected = (state.videos.filter(Boolean) as VideoInfo[]).filter((v) =>
      selectedIds.has(v.video_id)
    )
    if (selected.length === 0) return
    const filename = "thumbnails.zip"
    const toastId = toast.loading(`Preparing ${selected.length} thumbnail(s)`)
    try {
      const blob = await downloadThumbnails(
        selected.map((v) => ({ url: v.thumbnail, title: v.title }))
      )
      const result = await saveBlob(
        blob,
        filename,
        [{ name: "ZIP archive", extensions: ["zip"] }],
        getSetting("defaultDownloadDir"),
      )
      if (result.status === "cancelled") {
        toast.dismiss(toastId)
        return
      }
      recordDownload({ filename, path: result.path, kind: "batch-zip", size: blob.size })
      toast.success(`Saved ${filename}`, {
        id: toastId,
        description: result.path,
        action: { label: "Reveal", onClick: () => revealInFolder(result.path) },
        duration: 4000,
      })
      // OS-level notification for the user who walked away while we ZIP'd.
      // Gated by the user's preference; defaults on. notify() is a no-op
      // outside the Tauri shell and when permission is denied.
      if (getSetting("notifications").onBatchDone) {
        void notify("Thumbnails saved", `${selected.length} thumbnails`)
      }
    } catch (err) {
      toast.error("Download failed", { id: toastId, description: String(err) })
    }
  }

  const loadedVideos = state.videos.filter(Boolean) as VideoInfo[]
  const allLoaded = loadedVideos.length
  const allSelected = allLoaded > 0 && selectedIds.size === allLoaded
  // "Has more" now spans both unfetched IDs we already know about AND
  // additional pages we haven't asked the backend for yet.
  const hasMore = state.loadedCount < state.allIds.length || state.hasMoreIds
  // `isWorking` drives the input lock, the Fetch-button spinner, and the
  // progress banner. Tied to `initialPending` (not `phase === "loading-info"`)
  // so it goes false the instant the first batch's slots are filled —
  // load-more waves don't re-lock the input.
  const isWorking = state.phase === "fetching-ids" || state.initialPending
  const resolved = urlInput.trim() ? resolveSupportedUrl(urlInput) : null
  const resolvedUrl = resolved?.url ?? null
  const urlIsInvalid = urlInput.trim().length > 0 && resolved === null

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const next = resolveSupportedUrl(raw)
    setUrlInput(next?.url ?? raw)
  }

  const urlKindLabel = describeUrl(resolved)

  // Re-render once a minute so the "Loaded from cache (N min ago)"
  // badge stays roughly current without the user having to touch
  // anything. The cache lifetime is bounded (1h default) so this loop
  // is short-lived in practice.
  const [, setNowTick] = useState(0)
  useEffect(() => {
    if (state.cachedAt === null) return
    const t = setInterval(() => setNowTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [state.cachedAt])

  // "Refresh" is only meaningful when there's data showing and we're
  // not mid-fetch. Always disabled while a fetch is in flight.
  const canRefresh =
    sourceUrlRef.current !== null &&
    state.phase === "done" &&
    state.videos.length > 0

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full overflow-y-auto bg-page relative">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 pb-28">
          {/* Title row */}
          <header className="flex items-end justify-between mb-9">
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.022em] text-ink leading-[1.2]">
                Vlog library
              </h1>
              <p className="text-[14px] text-ink-2 mt-1.5 tracking-[-0.005em] inline-flex items-center gap-1.5">
                <span>
                  YouTube and Vimeo — fetch metadata, preview videos, capture custom thumbnails, drag images anywhere.
                </span>
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      aria-label="About downloads"
                      className="inline-flex items-center justify-center h-4 w-4 align-middle text-ink-4 hover:text-gold transition-colors"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      sideOffset={8}
                      align="start"
                      collisionPadding={12}
                      className="z-50 w-[min(340px,calc(100vw-24px))] bg-jet border border-line-soft p-3.5 outline-none
                                 data-[state=open]:animate-in data-[state=closed]:animate-out
                                 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                                 data-[side=bottom]:slide-in-from-top-1"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold mb-2">
                        About downloads
                      </p>
                      <p className="text-[12px] text-ink-on-jet/85 leading-relaxed">
                        Up to 3 video captures download in parallel. Each one includes
                        short polite-use pauses (a few seconds between requests) so your
                        IP doesn&apos;t trip YouTube or Vimeo&apos;s automation defenses on
                        bulk runs.
                      </p>
                      <Popover.Arrow className="fill-jet stroke-line" />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </p>
            </div>
            <div className="flex items-center gap-4">
              {state.videos.length > 0 && (
                <div className="text-[12.5px] text-ink-3 tabular-nums font-mono">
                  <span className="text-ink font-semibold">{allLoaded}</span>
                  {state.hasMoreIds ? (
                    <span className="ml-1 font-sans">loaded · more available</span>
                  ) : (
                    <>
                      <span className="text-ink-4"> / </span>
                      <span>{state.allIds.length}</span>
                      <span className="ml-1 font-sans">loaded</span>
                    </>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <DownloadHistoryButton />
                <CaptureHistoryButton />
              </div>
            </div>
          </header>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="bg-surface p-5 flex flex-col gap-3"
          >
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Label htmlFor="yt-url" className="sr-only">YouTube URL</Label>
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-4" />
                <Input
                  id="yt-url"
                  value={urlInput}
                  onChange={handleUrlChange}
                  placeholder="Paste a YouTube or Vimeo URL"
                  className="pl-9 pr-9 h-10"
                  disabled={isWorking}
                />
                <AnimatePresence mode="wait">
                  {!isWorking && resolvedUrl && (
                    <motion.div
                      key="ok"
                      initial={{ scale: 0.3, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.3, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 22 }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    >
                      <CheckCircle2 className="h-4 w-4 text-good" strokeWidth={2.25} />
                    </motion.div>
                  )}
                  {!isWorking && urlIsInvalid && (
                    <motion.div
                      key="bad"
                      initial={{ scale: 0.3, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.3, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 22 }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    >
                      <XCircle className="h-4 w-4 text-bad" strokeWidth={2.25} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Button type="submit" disabled={isWorking || !resolvedUrl} size="lg">
                {isWorking ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading</>
                ) : (
                  "Fetch"
                )}
              </Button>
              <AnimatePresence>
                {canRefresh && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.button
                        key="refresh"
                        type="button"
                        initial={{ opacity: 0, scale: 0.92, width: 0 }}
                        animate={{ opacity: 1, scale: 1, width: "auto" }}
                        exit={{ opacity: 0, scale: 0.92, width: 0 }}
                        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                        onClick={handleRefresh}
                        disabled={isWorking}
                        aria-label="Refresh from source"
                        className="shrink-0 inline-flex items-center justify-center h-10 w-10 bg-surface-2 text-ink-2 border border-line-soft hover:bg-surface-3 hover:text-ink hover:border-gold/60 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent>Bypass cache and re-fetch from source</TooltipContent>
                  </Tooltip>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence>
              {urlKindLabel && (
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  className="text-[12.5px] font-medium text-ink-3 px-1"
                >
                  Detected: <span className="text-good">{urlKindLabel}</span>
                </motion.div>
              )}
              {urlIsInvalid && (
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  className="text-[12.5px] font-medium text-bad px-1"
                >
                  Unsupported URL format.
                </motion.div>
              )}
              {state.cachedAt !== null && state.phase === "done" && (
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -2 }}
                  className="text-[12.5px] font-medium text-ink-3 px-1 inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3 w-3 text-ink-4" />
                  <span>Loaded from cache <span className="text-ink-2">({formatRelativeTime(state.cachedAt)})</span></span>
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          <AnimatePresence>
            {isWorking && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="mt-3 bg-surface-2 p-3 flex flex-col gap-2"
              >
                <Progress value={state.progress} className="h-1" />
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-ink-2 font-medium">
                    {state.phase === "fetching-ids" && "Fetching video list…"}
                    {state.phase === "loading-info" && "Loading metadata…"}
                  </span>
                  {state.phase === "loading-info" && (
                    <span className="font-mono tabular-nums text-ink-3">
                      {allLoaded} / {state.videos.length}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
            {state.phase === "error" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="mt-3 bg-bad/15 px-3 py-2.5 flex items-start gap-2 text-[12.5px] text-bad"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{state.error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {allLoaded > 0 && (
            <div className="mt-8 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[13px] text-ink-3">
                <span className="tabular-nums font-mono text-ink font-medium">{allLoaded}</span>
                {state.hasMoreIds ? (
                  <span>loaded · more available</span>
                ) : (
                  <>
                    <span>of</span>
                    <span className="tabular-nums font-mono text-ink-2">{state.allIds.length}</span>
                    <span>loaded</span>
                  </>
                )}
                {selectedIds.size > 0 && (
                  <>
                    <span className="text-ink-4 mx-1">·</span>
                    <span className="text-gold-deep font-medium">{selectedIds.size} selected</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="h-8 px-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
                >
                  {allSelected ? (
                    <CheckSquare className="h-3.5 w-3.5 text-gold-deep" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
                <AnimatePresence>
                  {selectedIds.size > 0 && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.93, x: -4 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.93, x: -4 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      onClick={handleBatchDownload}
                      className="h-8 px-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white btn-gold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download {selectedIds.size}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          <div className="mt-6">
            {state.phase === "idle" && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto max-w-md text-center pt-12 pb-16 text-[14px] text-ink-2 leading-relaxed"
              >
                Paste a YouTube URL above to fetch its videos. Drag any thumbnail out of the page to save it. Click <span className="text-ink-2 font-semibold">Generate</span> on a card to capture a custom frame.
              </motion.div>
            )}

            {state.videos.length > 0 && (
              <VideoGrid
                videos={state.videos}
                selectedIds={selectedIds}
                onSelectChange={handleSelectChange}
                recentCount={BATCH_SIZE}
              />
            )}

            {!hasMore && state.videos.length > 0 && state.phase === "done" && (
              <p className="text-center mt-7 mb-2 text-[12.5px] text-ink-4">
                · End of list ·
              </p>
            )}
          </div>
        </div>

        {/* Floating Load more button — pinned to the viewport bottom-right
            so the user doesn't have to scroll to the bottom of the grid
            to advance. Shows only when there's more to fetch; the disabled
            spinning state covers the in-flight phase. */}
        <AnimatePresence>
          {hasMore && state.videos.length > 0 && (
            <motion.button
              key="load-more"
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.94 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={handleLoadMore}
              disabled={loadingMore}
              aria-label={loadingMore ? "Loading more videos" : "Load more videos"}
              className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 inline-flex items-center gap-2 h-11 px-4 sm:px-5
                         text-[14px] font-semibold text-white btn-gold
                         shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]
                         disabled:opacity-85 disabled:cursor-wait"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading
                </>
              ) : (
                <>
                  Load more
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  )
}
