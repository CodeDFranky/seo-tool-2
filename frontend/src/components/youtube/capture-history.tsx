import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, Download, GripVertical, History, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { idbClear, idbDelete, idbLoadAll, idbPut } from "./capture-idb"
import { setSolidDragImage } from "@/lib/drag-image"

const MAX_CAPTURES = 100

/** Number of frames auto-captured the first time a video's modal is opened. */
export const AUTO_PREFETCH_COUNT = 6

/** Width of the inline side panel when open. */
const PANEL_WIDTH = 440

export type CaptureOrigin = "manual" | "auto"

export interface Capture {
  id: string
  url: string
  file: File
  atTime: number
  videoId: string
  videoTitle?: string
  /** Wall-clock time of capture (Date.now()) for sorting / labeling. */
  capturedAt: number
  /** "auto" frames are background-generated; "manual" are user-captured. */
  origin: CaptureOrigin
}

/**
 * Stable actions. The functions inside this context never change identity
 * across the lifetime of the provider — callers that only need to mutate
 * the history (e.g. AppShell's `setPanelOpen`) will never re-render when
 * captures change.
 */
interface CaptureHistoryActions {
  addCapture: (c: Omit<Capture, "id" | "capturedAt">) => Capture
  removeCapture: (id: string) => void
  clearAll: () => void
  /** Has this video already had its auto-prefetch run in this session?
   *  Reads via a ref — does not re-render consumers when captures change. */
  hasCapturesFor: (videoId: string) => boolean
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
}

/** Data that changes on every mutation. Consumers re-render when used. */
interface CaptureHistoryData {
  captures: Capture[]
  max: number
  isPanelOpen: boolean
}

/** Backward-compat shape exposed by `useCaptureHistory()`. */
type CaptureHistoryAPI = CaptureHistoryActions & CaptureHistoryData

const ActionsCtx = createContext<CaptureHistoryActions | null>(null)
const DataCtx    = createContext<CaptureHistoryData | null>(null)

/** Read both. Re-renders on every capture/panel state change. */
export function useCaptureHistory(): CaptureHistoryAPI {
  const actions = useContext(ActionsCtx)
  const data    = useContext(DataCtx)
  if (!actions || !data) throw new Error("useCaptureHistory must be used inside CaptureHistoryProvider")
  return { ...actions, ...data }
}

/** Read actions only. Never re-renders from history mutations. */
export function useCaptureHistoryActions(): CaptureHistoryActions {
  const ctx = useContext(ActionsCtx)
  if (!ctx) throw new Error("useCaptureHistoryActions must be used inside CaptureHistoryProvider")
  return ctx
}

export function CaptureHistoryProvider({ children }: { children: ReactNode }) {
  const [captures, setCaptures] = useState<Capture[]>([])
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const urlsRef = useRef<string[]>([])
  const hydratedRef = useRef(false)
  // Mirror of `captures` so action functions can read the latest value
  // without including it in their deps (which would defeat the split).
  const capturesRef = useRef<Capture[]>([])
  useEffect(() => { capturesRef.current = captures }, [captures])

  // ── Hydrate from IndexedDB on mount ──────────────────────────────────
  useEffect(() => {
    let cancelled = false
    idbLoadAll().then((stored) => {
      if (cancelled || hydratedRef.current) return
      const restored: Capture[] = stored.slice(0, MAX_CAPTURES).map((s) => {
        const url = URL.createObjectURL(s.blob)
        const file = new File([s.blob], s.filename, { type: s.blob.type || "image/jpeg" })
        return {
          id: s.id,
          url,
          file,
          atTime: s.atTime,
          videoId: s.videoId,
          videoTitle: s.videoTitle,
          capturedAt: s.capturedAt,
          origin: s.origin ?? "manual",
        }
      })
      urlsRef.current = restored.map((c) => c.url)
      hydratedRef.current = true
      setCaptures(restored)
    }).catch((err) => {
      console.warn("Capture history hydrate failed:", err)
      hydratedRef.current = true
    })
    return () => { cancelled = true }
  }, [])

  const addCapture = useCallback<CaptureHistoryAPI["addCapture"]>((input) => {
    const next: Capture = {
      ...input,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      capturedAt: Date.now(),
    }
    // Persist newest entry. Filename + blob are reconstructed from the File.
    idbPut({
      id: next.id,
      blob: next.file,
      filename: next.file.name,
      atTime: next.atTime,
      videoId: next.videoId,
      videoTitle: next.videoTitle,
      capturedAt: next.capturedAt,
      origin: next.origin,
    }).catch((err) => console.warn("Capture persist failed:", err))

    setCaptures((prev) => {
      const combined = [next, ...prev]
      if (combined.length > MAX_CAPTURES) {
        for (const old of combined.slice(MAX_CAPTURES)) {
          URL.revokeObjectURL(old.url)
          idbDelete(old.id).catch(() => {})
        }
      }
      const trimmed = combined.slice(0, MAX_CAPTURES)
      urlsRef.current = trimmed.map((c) => c.url)
      return trimmed
    })
    return next
  }, [])

  const removeCapture = useCallback((id: string) => {
    setCaptures((prev) => {
      const target = prev.find((c) => c.id === id)
      if (target) URL.revokeObjectURL(target.url)
      idbDelete(id).catch(() => {})
      const filtered = prev.filter((c) => c.id !== id)
      urlsRef.current = filtered.map((c) => c.url)
      return filtered
    })
  }, [])

  const clearAll = useCallback(() => {
    for (const u of urlsRef.current) URL.revokeObjectURL(u)
    urlsRef.current = []
    idbClear().catch(() => {})
    setCaptures([])
  }, [])

  const togglePanel = useCallback(() => setIsPanelOpen((o) => !o), [])
  const setPanelOpen = useCallback((o: boolean) => setIsPanelOpen(o), [])

  const hasCapturesFor = useCallback(
    (videoId: string) => capturesRef.current.some((c) => c.videoId === videoId),
    []
  )

  useEffect(() => {
    return () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u)
      urlsRef.current = []
    }
  }, [])

  // Actions never change identity after first render — the surrounding
  // useCallback hooks all use [] deps. We memoize the object once so the
  // ActionsCtx value is referentially stable for the lifetime of the
  // provider, and consumers like AppShell don't re-render on history mutations.
  const actionsValue = useMemo<CaptureHistoryActions>(
    () => ({ addCapture, removeCapture, clearAll, hasCapturesFor, setPanelOpen, togglePanel }),
    [addCapture, removeCapture, clearAll, hasCapturesFor, setPanelOpen, togglePanel]
  )
  // Data does change on every mutation — only consumers that actually
  // need to read captures / max / isPanelOpen subscribe.
  const dataValue = useMemo<CaptureHistoryData>(
    () => ({ captures, max: MAX_CAPTURES, isPanelOpen }),
    [captures, isPanelOpen]
  )

  return (
    <ActionsCtx.Provider value={actionsValue}>
      <DataCtx.Provider value={dataValue}>
        {children}
      </DataCtx.Provider>
    </ActionsCtx.Provider>
  )
}

/* ───────────────────────────── helpers ──────────────────────────────── */

function handleCaptureDrag(e: React.DragEvent<HTMLDivElement>, c: Capture) {
  try { e.dataTransfer.items.add(c.file) } catch { /* Safari */ }
  e.dataTransfer.effectAllowed = "copy"
  const img = e.currentTarget.querySelector<HTMLImageElement>("img")
  setSolidDragImage(e, img)
}

function downloadCapture(c: Capture) {
  const a = document.createElement("a")
  a.href = c.url; a.download = c.file.name
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

function formatClock(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00.00"
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toFixed(2).padStart(5, "0")}`
}

/* ───────────────────────────── Tile ─────────────────────────────────── */

export type CaptureTileSize = "default" | "compact"

export function CaptureTile({
  c, onRemove, size = "default",
}: {
  c: Capture
  onRemove: (id: string) => void
  size?: CaptureTileSize
}) {
  const compact = size === "compact"
  return (
    <div
      draggable
      onDragStart={(e) => handleCaptureDrag(e, c)}
      className={cn(
        "group/cap relative w-full aspect-video overflow-hidden",
        "bg-surface-2 cursor-grab active:cursor-grabbing"
      )}
      title={c.videoTitle}
    >
      <img
        src={c.url}
        alt={`Frame at ${formatClock(c.atTime)}`}
        className="w-full h-full object-cover select-none"
        draggable={false}
      />

      {/* Timestamp pill. */}
      <span
        className={cn(
          "absolute left-1 bottom-1 inline-flex items-center px-1 bg-black/65 text-white/90 border border-white/10 font-mono tabular-nums",
          compact ? "h-[12px] text-[8.5px]" : "h-[14px] text-[9px]"
        )}
      >
        {formatClock(c.atTime)}
      </span>

      {/* Top-right hover actions. */}
      <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover/cap:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); downloadCapture(c) }}
          className={cn(
            "inline-flex items-center justify-center bg-jet text-ink-on-jet hover:bg-jet-2 border border-white/15",
            compact ? "h-4 w-4" : "h-5 w-5"
          )}
          aria-label="Download capture"
        >
          <Download className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(c.id) }}
          className={cn(
            "inline-flex items-center justify-center bg-jet text-ink-on-jet hover:bg-jet-2 border border-white/15",
            compact ? "h-4 w-4" : "h-5 w-5"
          )}
          aria-label="Remove capture"
        >
          <X className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
        </button>
      </div>

      {/* Centered Drag hint. */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cap:opacity-100 transition-opacity pointer-events-none">
        <div
          className={cn(
            "flex items-center bg-jet/85 text-ink-on-jet border border-white/15",
            compact ? "gap-0.5 px-1 py-0.5" : "gap-1 px-1.5 py-0.5"
          )}
        >
          <GripVertical className={compact ? "h-2 w-2" : "h-2.5 w-2.5"} />
          <span
            className={cn(
              "font-semibold uppercase tracking-[0.10em]",
              compact ? "text-[8px]" : "text-[9px]"
            )}
          >
            Drag
          </span>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── History toggle button ────────────────────── */

export function CaptureHistoryButton() {
  const { captures, max, isPanelOpen, togglePanel } = useCaptureHistory()
  const hasAny = captures.length > 0

  return (
    <button
      type="button"
      onClick={togglePanel}
      aria-label={`Capture history (${captures.length} of ${max})`}
      aria-expanded={isPanelOpen}
      className={cn(
        "relative inline-flex items-center justify-center h-8 w-8 border transition-colors",
        isPanelOpen
          ? "border-gold bg-gold/15 text-gold"
          : hasAny
            ? "border-line bg-surface-2 text-ink-2 hover:text-ink hover:bg-surface-3"
            : "border-line bg-surface-2 text-ink-4 hover:text-ink-2"
      )}
    >
      <History className="h-3.5 w-3.5" />
      <AnimatePresence>
        {hasAny && (
          <motion.span
            key={captures.length}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 24 }}
            className="absolute -top-1 -right-1 min-w-[14px] h-[14px] inline-flex items-center justify-center px-1
                       bg-gold text-gold-ink text-[9px] font-mono font-bold tabular-nums border border-jet"
          >
            {captures.length}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

/* ───────────────────────── Side panel ───────────────────────────────── */

interface CaptureGroup {
  videoId: string
  videoTitle?: string
  items: Capture[]
  latest: number
}

function groupByVideo(captures: Capture[]): CaptureGroup[] {
  const map = new Map<string, CaptureGroup>()
  for (const c of captures) {
    const existing = map.get(c.videoId)
    if (existing) {
      existing.items.push(c)
      if (c.capturedAt > existing.latest) existing.latest = c.capturedAt
      if (c.videoTitle && !existing.videoTitle) existing.videoTitle = c.videoTitle
    } else {
      map.set(c.videoId, {
        videoId: c.videoId,
        videoTitle: c.videoTitle,
        items: [c],
        latest: c.capturedAt,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.latest - a.latest)
}

export function CaptureHistoryPanel() {
  const { captures, max, isPanelOpen, setPanelOpen, removeCapture, clearAll } =
    useCaptureHistory()
  const hasAny = captures.length > 0
  const groups = useMemo(() => groupByVideo(captures), [captures])

  // Track which video groups are expanded. By default only the most
  // recent one (top of the list) is open so the panel stays uncluttered.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev }
      for (const g of groups) {
        if (!(g.videoId in next)) next[g.videoId] = false
      }
      // Always make sure the most recent group is open by default.
      if (groups.length > 0 && next[groups[0].videoId] !== true) {
        // Only auto-open if it hasn't been explicitly closed.
        if (!(groups[0].videoId in prev)) next[groups[0].videoId] = true
      }
      return next
    })
  }, [groups])
  const toggleGroup = (id: string) =>
    setOpenMap((m) => ({ ...m, [id]: !m[id] }))

  // Close on Escape for keyboard parity with sheets/dialogs.
  useEffect(() => {
    if (!isPanelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isPanelOpen, setPanelOpen])

  return (
    <AnimatePresence initial={false}>
      {isPanelOpen && (
        <motion.aside
          key="capture-panel"
          initial={{ width: 0 }}
          animate={{ width: PANEL_WIDTH }}
          exit={{ width: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            // No splitter border — the bg-surface step against the main
            // area's bg-page (4% step on near-black) is the boundary.
            "shrink-0 overflow-hidden bg-surface",
            "flex"
          )}
          aria-label="Capture history"
        >
          <div
            style={{ width: PANEL_WIDTH }}
            className="h-full flex flex-col shrink-0"
          >
          {/* Header */}
          <header className="flex items-center justify-between gap-3 px-4 h-11 bg-jet shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold whitespace-nowrap">
                Captures
              </p>
              <span className="text-[12px] tabular-nums font-mono text-ink-4 whitespace-nowrap">
                {captures.length} / {max}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              {hasAny && (
                <button
                  onClick={clearAll}
                  aria-label="Clear all captures"
                  className="inline-flex items-center justify-center h-7 w-7 text-ink-4 hover:text-bad transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="Close history"
                className="inline-flex items-center justify-center h-7 w-7 text-ink-3 hover:text-ink transition-colors"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          {/* Body */}
          {hasAny ? (
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {groups.map((g) => {
                    const open = openMap[g.videoId] ?? false
                    const sorted = [...g.items].sort((a, b) => b.capturedAt - a.capturedAt)
                    const manual = sorted.filter((c) => c.origin === "manual")
                    const auto = sorted.filter((c) => c.origin === "auto")
                    return (
                      <motion.section
                        key={g.videoId}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="bg-surface-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.videoId)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-3 transition-colors"
                          aria-expanded={open}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <motion.span
                              animate={{ rotate: open ? 0 : -90 }}
                              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                              className="text-ink-4 shrink-0"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </motion.span>
                            <span
                              className="text-[13px] font-medium text-ink truncate"
                              title={g.videoTitle ?? g.videoId}
                            >
                              {g.videoTitle ?? g.videoId}
                            </span>
                          </div>
                          <span className="text-[11.5px] tabular-nums font-mono text-ink-3 shrink-0">
                            {g.items.length}
                          </span>
                        </button>
                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.div
                              key="content"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="flex flex-col gap-3 p-2 bg-surface">
                                {manual.length > 0 && (
                                  <div className="flex flex-col gap-1.5">
                                    {auto.length > 0 && (
                                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gold/90 px-0.5">
                                        Captured · <span className="font-mono tabular-nums text-ink-4">{manual.length}</span>
                                      </p>
                                    )}
                                    <div className="grid grid-cols-3 gap-2">
                                      <AnimatePresence initial={false}>
                                        {manual.map((c) => (
                                          <motion.div
                                            key={c.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.94 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.94 }}
                                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                          >
                                            <CaptureTile c={c} onRemove={removeCapture} />
                                          </motion.div>
                                        ))}
                                      </AnimatePresence>
                                    </div>
                                  </div>
                                )}
                                {auto.length > 0 && (
                                  <div className="flex flex-col gap-1.5">
                                    <p className="text-[10.5px] font-medium uppercase tracking-[0.10em] text-ink-3 px-0.5">
                                      Auto-generated · <span className="font-mono tabular-nums text-ink-4">{auto.length}</span>
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                      <AnimatePresence initial={false}>
                                        {auto.map((c) => (
                                          <motion.div
                                            key={c.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.94 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.94 }}
                                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                          >
                                            <CaptureTile c={c} onRemove={removeCapture} />
                                          </motion.div>
                                        ))}
                                      </AnimatePresence>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.section>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center px-6 text-center">
              <p className="text-[13px] text-ink-2 leading-relaxed">
                No captures yet.
                <br />
                <span className="text-ink-4">
                  Open a video, click <span className="text-ink-2 font-semibold">Generate</span>, then
                  <span className="text-ink-2 font-semibold"> Capture frame</span>.
                </span>
              </p>
            </div>
          )}

          {/* Footer */}
          {hasAny && (
            <footer className="px-4 py-2 bg-jet/60 text-[11.5px] text-ink-4 text-center shrink-0">
              Drag any frame anywhere · oldest replaced after {max}
            </footer>
          )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
