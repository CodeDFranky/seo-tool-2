import { lazy, Suspense, useCallback, useReducer, useRef, useState } from "react"
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
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { TooltipProvider } from "@/components/ui/tooltip"
import { VideoGrid } from "./VideoGrid"
import { CaptureHistoryButton } from "./capture-history"
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
}
type YtAction =
  | { type: "START" }
  | { type: "SET_IDS"; ids: string[]; batchSize: number; hasMoreIds: boolean }
  | { type: "APPEND_IDS"; ids: string[]; hasMoreIds: boolean }
  | { type: "LOAD_MORE"; count: number }
  | { type: "VIDEO_LOADED"; video: VideoInfo; slotIndex: number }
  | { type: "ERROR"; message: string }

const initial: YtState = {
  phase: "idle",
  allIds: [],
  videos: [],
  loadedCount: 0,
  progress: 0,
  hasMoreIds: false,
  error: null,
  initialPending: false,
}

function reducer(state: YtState, action: YtAction): YtState {
  switch (action.type) {
    case "START":
      return { ...initial, phase: "fetching-ids", progress: 10, initialPending: true }
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
    async (ids: string[], slotOffset: number, plat: Platform) => {
      if (batchInFlightRef.current) return
      batchInFlightRef.current = true
      // Capture the session at wave start. Every dispatch checks against
      // this — if the user kicks off a new Fetch, sessionIdRef bumps and
      // any of *this* wave's lingering responses are dropped on the floor.
      const session = sessionIdRef.current
      let rateLimited = false
      try {
      await runWithConcurrency(ids, METADATA_CONCURRENCY, async (id, i) => {
        try {
          const video = await fetchVideoInfo(id, plat)
          if (sessionIdRef.current !== session) return
          if (!video.error) {
            dispatch({ type: "VIDEO_LOADED", video, slotIndex: slotOffset + i })
          }
        } catch (err) {
          if (sessionIdRef.current !== session) return
          if (err instanceof RateLimitError) {
            if (!rateLimited) {
              rateLimited = true
              toast.warning("Slow down", {
                description: `Server is throttling requests. Retry in ${err.retryAfter}s.`,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const resolved = resolveSupportedUrl(urlInput)
    if (!resolved) {
      toast.error("Unsupported URL", {
        description: "Paste a YouTube or Vimeo video, playlist, channel, or user URL.",
      })
      return
    }
    // Bump the session BEFORE clearing the mutexes so any in-flight worker
    // already past its session capture will fail the next check and exit
    // without dispatching into the new state.
    sessionIdRef.current += 1
    batchInFlightRef.current = false
    loadMoreInFlightRef.current = false
    setLoadingMore(false)
    dispatch({ type: "START" })
    setSelectedIds(new Set())
    setPlatform(resolved.platform)
    sourceUrlRef.current = resolved.url
    try {
      const { ids, platform: detected, has_more, error } = await fetchIds(resolved.url, {
        offset: 0, limit: IDS_PAGE_SIZE,
      })
      if (error) { dispatch({ type: "ERROR", message: error }); return }
      // Backend's detected platform is authoritative.
      setPlatform(detected)
      dispatch({ type: "SET_IDS", ids, batchSize: BATCH_SIZE, hasMoreIds: has_more })
      await loadVideoInfoBatch(ids.slice(0, BATCH_SIZE), 0, detected)
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
  }

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
        const { ids: more, has_more } = await fetchIds(sourceUrlRef.current, {
          offset: state.allIds.length,
          limit: IDS_PAGE_SIZE,
        })
        if (more.length > 0) {
          dispatch({ type: "APPEND_IDS", ids: more, hasMoreIds: has_more })
          availableIds = [...state.allIds, ...more]
        } else {
          // Server says no more; finish.
          dispatch({ type: "APPEND_IDS", ids: [], hasMoreIds: false })
          return
        }
      }

      const nextBatch = availableIds.slice(state.loadedCount, state.loadedCount + BATCH_SIZE)
      if (nextBatch.length === 0) return
      // loadedCount === videos.length by reducer invariant — use the former
      // so we don't need state.videos in deps (it churns 12× per batch).
      const slotOffset = state.loadedCount
      dispatch({ type: "LOAD_MORE", count: nextBatch.length })
      await loadVideoInfoBatch(nextBatch, slotOffset, platform)
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast.warning("Slow down", {
          description: `Server is throttling. Retry in ${err.retryAfter}s.`,
        })
      } else {
        toast.error(String(err))
      }
    } finally {
      loadMoreInFlightRef.current = false
      setLoadingMore(false)
    }
  }, [state.allIds, state.loadedCount, state.hasMoreIds, loadVideoInfoBatch, platform])

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
    const toastId = toast.loading(`Preparing ${selected.length} thumbnail(s)`)
    try {
      const blob = await downloadThumbnails(
        selected.map((v) => ({ url: v.thumbnail, title: v.title }))
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "thumbnails.zip"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Download started", { id: toastId })
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

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full overflow-y-auto bg-page relative">
        <div className="mx-auto max-w-7xl px-8 py-10">
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
                      aria-label="Rate-limit details"
                      className="inline-flex items-center justify-center h-4 w-4 align-middle text-ink-4 hover:text-gold transition-colors"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      sideOffset={8}
                      align="start"
                      className="z-50 w-[340px] bg-jet border border-line-soft p-3.5 outline-none
                                 data-[state=open]:animate-in data-[state=closed]:animate-out
                                 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                                 data-[side=bottom]:slide-in-from-top-1"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold mb-2">
                        Rate limits
                      </p>
                      <p className="text-[12px] text-ink-on-jet/85 leading-relaxed">
                        Fetching is throttled to ~6 URLs/min, ~30 videos/min, and 4 custom
                        thumbnails/min (max 30/hr). These caps stay well under YouTube&apos;s
                        and Vimeo&apos;s guest budgets so your IP doesn&apos;t get soft-blocked.
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
              <CaptureHistoryButton />
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
              className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 h-11 px-5
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
