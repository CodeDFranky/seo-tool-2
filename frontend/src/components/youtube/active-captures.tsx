/**
 * Active-captures registry.
 *
 * Decouples the video download (heavy yt-dlp SSE) from the modal. Clicking
 * Generate on a card calls `start(...)`; the download runs in the background
 * and the card button reflects its progress. The modal only opens once the
 * download is `ready`, so it loads instantly with no spinner phase.
 *
 * Implemented as an external store rather than a single React context value
 * so each card can subscribe to ITS OWN slot via useSyncExternalStore. With
 * potentially 100+ cards on screen and progress events firing every ~0.5%
 * per active download, a naive Map-in-context would re-render every card
 * on every tick. The per-key subscription avoids that.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import type { Platform } from "@/lib/api"

export type CapturePhase = "queued" | "downloading" | "ready" | "error"

/** Backstop retry interval for queued slots. The primary unblocker is the
 *  `tryDequeueOne()` call in `runDownload`'s finally block — every time any
 *  download completes, the oldest queued slot gets a chance. The timer
 *  covers degenerate races (e.g. server briefly 429s with no other download
 *  in flight) so the queue can't deadlock. */
const QUEUE_RETRY_MS = 2500

export interface CaptureSlot {
  videoId: string
  title: string
  platform: Platform
  phase: CapturePhase
  /** 0-100 download progress; 100 once `phase === "ready"`. */
  progress: number
  /** Server-side cache token. Present iff `phase === "ready"`. */
  token?: string
  /** Human-readable error. Present iff `phase === "error"`. */
  error?: string
}

interface CaptureStartInput {
  videoId: string
  title: string
  platform: Platform
}

class CaptureStore {
  private slots = new Map<string, CaptureSlot>()
  private subs = new Map<string, Set<() => void>>()
  /** Global subscribers (e.g. the modal coordinator that needs to know
   *  about modalSlot changes when the underlying slot data updates). */
  private globalSubs = new Set<() => void>()
  private aborts = new Map<string, AbortController>()
  private modalVideoId: string | null = null
  private queueTimer: ReturnType<typeof setTimeout> | null = null

  get(videoId: string): CaptureSlot | undefined {
    return this.slots.get(videoId)
  }

  getModalVideoId(): string | null {
    return this.modalVideoId
  }

  subscribe(videoId: string, cb: () => void): () => void {
    let set = this.subs.get(videoId)
    if (!set) { set = new Set(); this.subs.set(videoId, set) }
    set.add(cb)
    return () => {
      set!.delete(cb)
      if (set!.size === 0) this.subs.delete(videoId)
    }
  }

  subscribeGlobal(cb: () => void): () => void {
    this.globalSubs.add(cb)
    return () => { this.globalSubs.delete(cb) }
  }

  private notify(videoId: string) {
    this.subs.get(videoId)?.forEach((cb) => cb())
    // If the modal is showing this video, the modal coordinator needs to
    // re-render so the dialog sees the new slot data (e.g. token arrival).
    if (this.modalVideoId === videoId) {
      this.globalSubs.forEach((cb) => cb())
    }
  }

  private notifyGlobal() {
    this.globalSubs.forEach((cb) => cb())
  }

  private setSlot(videoId: string, slot: CaptureSlot) {
    this.slots.set(videoId, slot)
    this.notify(videoId)
  }

  private deleteSlot(videoId: string) {
    this.slots.delete(videoId)
    this.notify(videoId)
  }

  start(input: CaptureStartInput): void {
    const existing = this.slots.get(input.videoId)
    // Re-entry is a no-op when something is already happening for this
    // video. Ready slots are already done, downloading/queued are in
    // motion. Only error/missing slots make sense to (re)start.
    if (
      existing &&
      (existing.phase === "downloading" ||
        existing.phase === "ready" ||
        existing.phase === "queued")
    ) {
      return
    }

    this.setSlot(input.videoId, {
      videoId: input.videoId,
      title: input.title,
      platform: input.platform,
      phase: "downloading",
      progress: 0,
    })
    this.beginFetch(input.videoId)
  }

  /** Internal: actually fires the SSE fetch for whatever slot is registered
   *  under `videoId`. Caller is responsible for putting the slot in the
   *  `downloading` phase first. */
  private beginFetch(videoId: string): void {
    const slot = this.slots.get(videoId)
    if (!slot) return
    const controller = new AbortController()
    this.aborts.set(videoId, controller)
    void this.runDownload(
      { videoId, title: slot.title, platform: slot.platform },
      controller,
    )
  }

  private async runDownload(input: CaptureStartInput, controller: AbortController): Promise<void> {
    // When the server is at capacity (HTTP 429 from the capture endpoint),
    // we DON'T mark the slot as error; we park it as `queued` and let the
    // finally-block of any running download dequeue it. Distinguishing
    // 429-because-busy from 429-because-rate-limit-hour-cap is fuzzy, but
    // both paths are recovered the same way (wait, retry).
    let parkedAsQueued = false
    try {
      const res = await fetch("/api/capture_thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: input.videoId, platform: input.platform }),
        signal: controller.signal,
      })
      if (res.status === 429) {
        parkedAsQueued = true
        // Drain the body so the connection can close cleanly.
        res.body?.cancel().catch(() => {})
        this.updateSlot(input.videoId, { phase: "queued", progress: 0 })
        this.scheduleQueueRetry()
        return
      }
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Download failed")
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const events = buf.split("\n\n")
        buf = events.pop() ?? ""
        for (const event of events) {
          const lines = event.split("\n")
          const evtType = lines.find((l) => l.startsWith("event:"))?.slice(6).trim()
          const dataLine = lines.find((l) => l.startsWith("data:"))?.slice(5).trim()
          if (!dataLine) continue
          if (evtType === "done") {
            const { token } = JSON.parse(dataLine) as { token: string }
            this.updateSlot(input.videoId, { phase: "ready", token, progress: 100 })
            break outer
          } else if (evtType === "error") {
            const { error } = JSON.parse(dataLine) as { error: string }
            this.updateSlot(input.videoId, { phase: "error", error })
            break outer
          } else {
            const { progress } = JSON.parse(dataLine) as { progress: number }
            this.updateSlot(input.videoId, { progress })
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // User cancelled — clear the slot entirely so the button reverts
        // to its idle state.
        this.deleteSlot(input.videoId)
        return
      }
      const message = err instanceof Error ? err.message : "Download failed"
      this.updateSlot(input.videoId, { phase: "error", error: message })
    } finally {
      this.aborts.delete(input.videoId)
      // Any time a slot's fetch terminates — success, error, or our own
      // parking — try to promote the oldest queued slot. The 429 case is
      // the interesting one: parking ourselves doesn't free a server slot,
      // but a sibling download finishing does, so we still want to retry
      // on the same chain.
      if (!parkedAsQueued) {
        this.tryDequeueOne()
      }
    }
  }

  /** Backstop timer for queued slots. Fires only when no other download is
   *  running (the primary unblocker is `runDownload`'s finally). */
  private scheduleQueueRetry(): void {
    if (this.queueTimer) return
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null
      this.tryDequeueOne()
      // If a slot is still queued after this run, schedule another sweep.
      for (const slot of this.slots.values()) {
        if (slot.phase === "queued") {
          this.scheduleQueueRetry()
          return
        }
      }
    }, QUEUE_RETRY_MS)
  }

  /** Promote the oldest queued slot to downloading. Insertion order on
   *  `Map` gives us FIFO for free. */
  private tryDequeueOne(): void {
    for (const [vid, slot] of this.slots) {
      if (slot.phase === "queued") {
        this.updateSlot(vid, { phase: "downloading", progress: 0 })
        this.beginFetch(vid)
        return
      }
    }
  }

  private updateSlot(videoId: string, patch: Partial<CaptureSlot>): void {
    const existing = this.slots.get(videoId)
    if (!existing) return
    this.setSlot(videoId, { ...existing, ...patch })
  }

  cancel(videoId: string): void {
    const slot = this.slots.get(videoId)
    if (!slot) return
    if (slot.phase === "downloading") {
      // The AbortController's abort triggers the catch block above which
      // calls deleteSlot AND dequeues the next queued slot in its finally.
      this.aborts.get(videoId)?.abort()
      return
    }
    // queued / ready / error → drop the slot. Button reverts to idle.
    if (this.modalVideoId === videoId) {
      this.modalVideoId = null
      this.notifyGlobal()
    }
    this.deleteSlot(videoId)
    // Cancelling a queued slot doesn't free a server slot, but cancelling
    // a ready/error slot might be the user signalling they want a fresh
    // batch — either way, harmless to try.
    this.tryDequeueOne()
  }

  openModal(videoId: string): boolean {
    const slot = this.slots.get(videoId)
    if (!slot || slot.phase !== "ready") return false
    this.modalVideoId = videoId
    this.notifyGlobal()
    return true
  }

  closeModal(): void {
    this.modalVideoId = null
    this.notifyGlobal()
  }
}

interface ActiveCapturesActions {
  start: (input: CaptureStartInput) => void
  cancel: (videoId: string) => void
  openModal: (videoId: string) => void
  closeModal: () => void
  /** Sync read for non-rendering callers. */
  get: (videoId: string) => CaptureSlot | undefined
}

const StoreCtx = createContext<CaptureStore | null>(null)
const ActionsCtx = createContext<ActiveCapturesActions | null>(null)

export function ActiveCapturesProvider({ children }: { children: ReactNode }) {
  // The store is a single instance for the provider's lifetime.
  const [store] = useState(() => new CaptureStore())

  const actions = useMemo<ActiveCapturesActions>(() => ({
    start: (input) => {
      // Surface backend-side failures via toast since the card UI only has
      // a tiny progress bar — a full error message wouldn't fit.
      store.start(input)
    },
    cancel: (videoId) => store.cancel(videoId),
    openModal: (videoId) => {
      const opened = store.openModal(videoId)
      if (!opened) {
        const slot = store.get(videoId)
        if (slot?.phase === "queued") {
          toast.info("Waiting in queue", {
            description: "Will start as soon as a slot frees up.",
            duration: 2000,
          })
        } else if (slot?.phase === "downloading") {
          toast.info("Still downloading", { duration: 1500 })
        } else if (slot?.phase === "error") {
          toast.error("Download failed", { description: slot.error, duration: 3000 })
        }
      }
    },
    closeModal: () => store.closeModal(),
    get: (videoId) => store.get(videoId),
  }), [store])

  return (
    <StoreCtx.Provider value={store}>
      <ActionsCtx.Provider value={actions}>
        {children}
      </ActionsCtx.Provider>
    </StoreCtx.Provider>
  )
}

/** Subscribe to a single video's capture slot. Returns undefined when no
 *  active or completed download exists. Cards consume this directly. */
export function useActiveCapture(videoId: string): CaptureSlot | undefined {
  const store = useContext(StoreCtx)
  if (!store) throw new Error("useActiveCapture must be used inside ActiveCapturesProvider")
  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(videoId, cb),
    [store, videoId],
  )
  const getSnapshot = useCallback(() => store.get(videoId), [store, videoId])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Stable identity. Safe to depend on or destructure. */
export function useActiveCapturesActions(): ActiveCapturesActions {
  const ctx = useContext(ActionsCtx)
  if (!ctx) throw new Error("useActiveCapturesActions must be used inside ActiveCapturesProvider")
  return ctx
}

/** Returns the currently-open modal slot, or null. Used at app level to
 *  decide whether to mount the GenerateThumbnailModal. */
export function useActiveCapturesModal(): CaptureSlot | null {
  const store = useContext(StoreCtx)
  if (!store) throw new Error("useActiveCapturesModal must be used inside ActiveCapturesProvider")
  const [, setTick] = useState(0)
  useEffect(() => {
    return store.subscribeGlobal(() => setTick((t) => t + 1))
  }, [store])
  const id = store.getModalVideoId()
  return id ? store.get(id) ?? null : null
}
