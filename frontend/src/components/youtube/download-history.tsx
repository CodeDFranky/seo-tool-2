import {
  useEffect, useMemo, useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import { AnimatePresence, motion } from "framer-motion"
import {
  Copy, ExternalLink, FileArchive, FileImage, FolderDown, Trash2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  clearDownloads, MAX_DOWNLOADS, removeDownload, useDownloadHistory,
  type DownloadKind, type DownloadRecord,
} from "@/lib/download-history"
import { copyPath, revealInFolder } from "@/lib/reveal"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useRightPanel } from "./right-panel"

/* ───────────────────────── provider (passthrough) ───────────────────── */

/**
 * The downloads list itself lives in `@/lib/download-history` (a module-level
 * store with its own `useDownloadHistory` hook), and panel open/close
 * state moved to `RightPanelProvider`. This provider is now a stable
 * passthrough mount point so the existing `<DownloadHistoryProvider>`
 * wrapper at app root keeps working without a rename — and so future
 * per-panel state has a home if we need one.
 */
export function DownloadHistoryProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

/* ───────────────────────── helpers ──────────────────────────────────── */

function kindIcon(kind: DownloadKind, className?: string) {
  switch (kind) {
    case "batch-zip":
      return <FileArchive className={className} />
    case "thumbnail":
    case "frame":
    default:
      return <FileImage className={className} />
  }
}

function isBrowserSentinel(path: string): boolean {
  return path.startsWith("(browser download:")
}

function parentDir(path: string): string {
  if (isBrowserSentinel(path)) return "(browser-managed)"
  const stripped = path.replace(/[\\/][^\\/]+$/, "")
  return stripped || path
}

/** Day bucket key: today / yesterday / "MMM D". */
function bucketLabel(ts: number, now: number): string {
  const d = new Date(ts)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const dayStart = new Date(d)
  dayStart.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - dayStart.getTime()) / 86_400_000)
  if (diffDays <= 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function relativeTime(ts: number, now: number): string {
  const diffSec = Math.max(1, Math.floor((now - ts) / 1000))
  if (diffSec < 60) return diffSec < 5 ? "just now" : `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(ts).toLocaleDateString()
}

interface DateGroup {
  label: string
  records: DownloadRecord[]
}

function groupByDate(records: DownloadRecord[], now: number): DateGroup[] {
  // records arrive newest-first (recordDownload prepends), preserve that order.
  const map = new Map<string, DownloadRecord[]>()
  for (const r of records) {
    const label = bucketLabel(r.savedAt, now)
    const bucket = map.get(label)
    if (bucket) bucket.push(r)
    else map.set(label, [r])
  }
  return Array.from(map.entries()).map(([label, recs]) => ({ label, records: recs }))
}

/* ───────────────────────── Toggle button ────────────────────────────── */

export function DownloadHistoryButton() {
  const { openTab, toggle } = useRightPanel()
  const isPanelOpen = openTab === "downloads"
  const records = useDownloadHistory()
  const hasAny = records.length > 0

  return (
    <button
      type="button"
      onClick={() => toggle("downloads")}
      aria-label={`Download history (${records.length} of ${MAX_DOWNLOADS})`}
      aria-expanded={isPanelOpen}
      className={cn(
        "relative inline-flex items-center justify-center h-8 w-8 border transition-colors",
        isPanelOpen
          ? "border-gold bg-gold/15 text-gold"
          : hasAny
            ? "border-line bg-surface-2 text-ink-2 hover:text-ink hover:bg-surface-3"
            : "border-line bg-surface-2 text-ink-4 hover:text-ink-2",
      )}
    >
      <FolderDown className="h-3.5 w-3.5" />
      <AnimatePresence>
        {hasAny && (
          <motion.span
            key={records.length}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 24 }}
            className="absolute -top-1 -right-1 min-w-[14px] h-[14px] inline-flex items-center justify-center px-1
                       bg-gold text-gold-ink text-[9px] font-mono font-bold tabular-nums border border-jet"
          >
            {records.length}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

/* ───────────────────────── Item row ─────────────────────────────────── */

interface DownloadRowProps {
  rec: DownloadRecord
  now: number
}

function DownloadRow({ rec, now }: DownloadRowProps) {
  const dir = parentDir(rec.path)
  const browser = isBrowserSentinel(rec.path)

  return (
    <div className="group/row flex items-start gap-2.5 px-2.5 py-2 bg-surface-2 hover:bg-surface-3 transition-colors">
      <span className="shrink-0 inline-flex items-center justify-center h-7 w-7 bg-jet text-gold border border-line">
        {kindIcon(rec.kind, "h-3.5 w-3.5")}
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <p
          className="text-[12.5px] font-medium text-ink truncate"
          title={rec.filename}
        >
          {rec.filename}
        </p>
        <p
          className="text-[11px] text-ink-3 font-mono truncate"
          title={rec.path}
        >
          {dir}
        </p>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-[10.5px] text-ink-4 tabular-nums">
            {relativeTime(rec.savedAt, now)}
          </span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
            {!browser && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => revealInFolder(rec.path).catch((err) =>
                      toast.error("Couldn't reveal in folder", { description: String(err) }),
                    )}
                    aria-label="Reveal in folder"
                    className="inline-flex items-center justify-center h-6 w-6 text-ink-3 hover:text-ink hover:bg-jet transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Reveal in folder</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    void copyPath(rec.path)
                    toast.success("Path copied", { duration: 1200 })
                  }}
                  aria-label="Copy path"
                  className="inline-flex items-center justify-center h-6 w-6 text-ink-3 hover:text-ink hover:bg-jet transition-colors"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Copy path</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => removeDownload(rec.id)}
                  aria-label="Remove from list"
                  className="inline-flex items-center justify-center h-6 w-6 text-ink-3 hover:text-bad hover:bg-jet transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Remove from list</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── Drawer body ──────────────────────────────── */

/**
 * The Downloads tab body. Sub-header (count + clear-all) + scroll list +
 * footer. NO outer aside / backdrop / close — those belong to the
 * unified `RightPanel` shell.
 */
export function DownloadHistoryBody() {
  const { openTab } = useRightPanel()
  const isVisible = openTab === "downloads"
  const records = useDownloadHistory()
  const hasAny = records.length > 0

  // Tick `now` once a minute so the "x minutes ago" labels stay fresh
  // without thrashing on every render. Only runs while this tab is
  // actually mounted/visible — when the user switches to Captures the
  // body unmounts (cross-fade is mode="wait") and the interval clears.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isVisible) return
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [isVisible])

  const groups = useMemo(() => groupByDate(records, now), [records, now])

  return (
    <>
      {/* Sub-header: count + clear-all. The drawer's tab strip is above. */}
      <div className="flex items-center justify-between gap-3 px-4 h-9 bg-jet/40 shrink-0 border-b border-line-soft/40">
        <span className="text-[12px] tabular-nums font-mono text-ink-3 whitespace-nowrap">
          {records.length} / {MAX_DOWNLOADS}
        </span>
        {hasAny && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={clearDownloads}
                aria-label="Clear all downloads"
                className="inline-flex items-center justify-center h-7 w-7 text-ink-4 hover:text-bad transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear all</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Body */}
      {hasAny ? (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <section key={g.label} className="flex flex-col gap-1.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gold px-0.5">
                  {g.label}
                </p>
                <div className="flex flex-col gap-1">
                  <AnimatePresence initial={false}>
                    {g.records.map((r) => (
                      <motion.div
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <DownloadRow rec={r} now={now} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <p className="text-[13px] text-ink-2 leading-relaxed">
            No downloads yet.
            <br />
            <span className="text-ink-4">
              Save a thumbnail or batch ZIP from the Vlog grid.
            </span>
          </p>
        </div>
      )}

      {/* Footer — important: this list is just a sidebar log;
          the actual files on disk are yours and never touched
          by the app. */}
      {hasAny && (
        <footer className="px-4 py-2 bg-jet/60 text-[11.5px] text-ink-4 text-center shrink-0">
          Files on disk are permanent · this list keeps the last {MAX_DOWNLOADS.toLocaleString()}
        </footer>
      )}
    </>
  )
}
