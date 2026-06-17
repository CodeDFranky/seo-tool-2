import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Copy, Download, Play, ExternalLink, Check, GripVertical, Wand2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchThumbnailFile, proxyThumbnailUrl, type VideoInfo } from "@/lib/api"
import { setSolidDragImage } from "@/lib/drag-image"
import { cn } from "@/lib/utils"
// Code-split the heavy thumbnail-generator (video player + capture logic).
// Only loads when a user actually clicks Generate on a card.
const GenerateThumbnailModal = lazy(() => import("./GenerateThumbnailModal"))

export const VideoCardSkeleton = memo(function VideoCardSkeleton() {
  return (
    <div className="relative bg-surface overflow-hidden">
      {/* Thumbnail block — flat plate with a single subtle sweep across it. */}
      <div className="relative aspect-video w-full overflow-hidden bg-surface-2">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-2/5
                     bg-gradient-to-r from-transparent via-white/[0.06] to-transparent
                     animate-[shimmer-sweep_2.6s_linear_infinite] will-change-transform"
        />
      </div>
      <div className="p-3 flex flex-col gap-2.5">
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/5" />
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-7 flex-1" />
          <Skeleton className="h-7 flex-1" />
        </div>
      </div>
    </div>
  )
})

type BlobCache = Map<string, File>
type TokenCache = Map<string, string>

interface VideoCardProps {
  video: VideoInfo
  index: number
  isSelected: boolean
  onSelectChange: (id: string, checked: boolean) => void
  isRecent?: boolean
  blobCache: BlobCache
  tokenCache: TokenCache
}

function VideoCardImpl({
  video, index, isSelected, onSelectChange, isRecent = false, blobCache, tokenCache,
}: VideoCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [copiedTitle, setCopiedTitle] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)
  const [thumbReady, setThumbReady] = useState(blobCache.has(video.video_id))
  const [thumbFailed, setThumbFailed] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const filename = `v${index + 1}_${video.video_id}.jpg`

  useEffect(() => {
    if (blobCache.has(video.video_id)) { setThumbReady(true); return }
    let cancelled = false
    fetchThumbnailFile(video.video_id, video.platform, filename)
      .then((file) => {
        if (cancelled) return
        blobCache.set(video.video_id, file)
        setThumbReady(true)
      })
      .catch(() => { if (!cancelled) setThumbFailed(true) })
    return () => { cancelled = true }
  }, [video.video_id, video.platform, filename, blobCache])

  function copyTitle() {
    navigator.clipboard.writeText(video.title)
    setCopiedTitle(true)
    setTimeout(() => setCopiedTitle(false), 1100)
    toast.success("Title copied", { duration: 1200 })
  }
  function copyEmbed() {
    navigator.clipboard.writeText(`${video.embed_url}?autoplay=1`)
    setCopiedEmbed(true)
    setTimeout(() => setCopiedEmbed(false), 1100)
    toast.success("Embed URL copied", { duration: 1200 })
  }
  function downloadThumbnail() {
    const cached = blobCache.get(video.video_id)
    const a = document.createElement("a")
    if (cached) {
      const url = URL.createObjectURL(cached)
      a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 0)
      return
    }
    a.href = proxyThumbnailUrl(video.video_id, video.platform)
    a.download = filename; a.target = "_blank"; a.rel = "noopener noreferrer"
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    if (thumbFailed) { e.preventDefault(); return }
    const cached = blobCache.get(video.video_id)
    if (!cached) {
      e.dataTransfer.effectAllowed = "none"
      fetchThumbnailFile(video.video_id, video.platform, filename)
        .then((file) => { blobCache.set(video.video_id, file); setThumbReady(true) })
        .catch(() => setThumbFailed(true))
      toast.info("Thumbnail loading", { description: "Drag again in a moment.", duration: 1400 })
      e.preventDefault()
      return
    }
    try { e.dataTransfer.items.add(cached) } catch { /* Safari */ }
    const proxyUrl = `${window.location.origin}${proxyThumbnailUrl(video.video_id, video.platform)}`
    e.dataTransfer.setData("DownloadURL", `image/jpeg:${filename}:${proxyUrl}`)
    e.dataTransfer.setData("text/uri-list", proxyUrl)
    e.dataTransfer.setData("text/plain", proxyUrl)
    e.dataTransfer.effectAllowed = "copy"
    const img = cardRef.current?.querySelector<HTMLImageElement>("img") ?? null
    setSolidDragImage(e, img)
  }

  return (
    <>
      <motion.article
        ref={cardRef}
        initial={isRecent ? { opacity: 0, y: 14 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          // Resting card has no border — bg-surface against the page is the boundary.
          // Selected keeps a gold border because gold IS identity; this is the one
          // case where a border earns its keep on a card.
          "group relative bg-surface overflow-hidden transition-[background-color,outline-color] duration-200",
          isSelected
            ? "outline outline-2 outline-offset-[-2px] outline-gold bg-gold-soft"
            : "hover:bg-surface-2"
        )}
      >
        <div
          className={cn(
            "group/thumb relative aspect-video overflow-hidden bg-surface-2",
            thumbFailed ? "cursor-default" : "cursor-grab active:cursor-grabbing"
          )}
          draggable={!thumbFailed}
          onDragStart={handleDragStart}
        >
          <img
            src={video.thumbnail}
            alt={video.title}
            loading="lazy"
            draggable={false}
            crossOrigin="anonymous"
            onError={() => setThumbFailed(true)}
            className="w-full h-full object-cover select-none"
          />

          {/* Index pill (bottom-left, always visible). */}
          <span className="absolute left-1 bottom-1 inline-flex items-center px-1 h-[14px] text-[9px] font-mono font-semibold tabular-nums bg-black/65 text-white/90 border border-white/10">
            #{index + 1}
          </span>

          {/* Selection toggle (top-left). Always visible when selected;
              hover-revealed otherwise. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectChange(video.video_id, !isSelected) }}
                role="checkbox"
                aria-checked={isSelected}
                aria-label={isSelected ? "Deselect video" : "Select video"}
                className={cn(
                  "absolute top-1 left-1 h-5 w-5 inline-flex items-center justify-center border",
                  "transition-[opacity,background-color,border-color] duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
                  isSelected
                    ? "bg-gold border-gold text-gold-ink opacity-100"
                    : "bg-jet/85 text-ink-on-jet border-white/15 opacity-0 group-hover/thumb:opacity-100 hover:bg-jet"
                )}
              >
                {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{isSelected ? "Deselect" : "Select"}</TooltipContent>
          </Tooltip>

          {/* Top-right hover actions: Preview + Download. */}
          <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); setPreviewOpen(true) }}
                  className="h-5 w-5 inline-flex items-center justify-center bg-jet text-ink-on-jet hover:bg-jet-2 border border-white/15"
                  aria-label="Preview video"
                >
                  <Play className="h-3 w-3 fill-current translate-x-px" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Preview</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadThumbnail() }}
                  className="h-5 w-5 inline-flex items-center justify-center bg-jet text-ink-on-jet hover:bg-jet-2 border border-white/15"
                  aria-label="Download thumbnail"
                >
                  <Download className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Download thumbnail</TooltipContent>
            </Tooltip>
          </div>

          {/* Centered DRAG hint on hover. */}
          {!thumbFailed && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none">
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-jet/85 text-ink-on-jet border border-white/15">
                <GripVertical className="h-2.5 w-2.5" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.10em]">
                  {thumbReady ? "Drag" : "…"}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 flex flex-col gap-2.5">
          <h4 className="text-[14px] font-medium leading-snug line-clamp-2 text-ink">
            {video.title}
          </h4>

          <div className="flex gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setGenerateOpen(true)}
                  aria-label="Generate custom thumbnail"
                  className="inline-flex items-center justify-center gap-1 h-7 px-2.5 text-[12.5px] font-semibold btn-gold"
                >
                  <Wand2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Generate</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Capture a frame from the video as a custom thumbnail.
              </TooltipContent>
            </Tooltip>
            <button
              onClick={copyTitle}
              className="flex-1 inline-flex items-center justify-center gap-1 h-7 px-2.5 bg-surface-2 text-[12.5px] font-medium text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors"
            >
              <AnimatePresence mode="wait">
                {copiedTitle ? (
                  <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="inline-flex items-center gap-1 text-good">
                    <Check className="h-3 w-3" strokeWidth={3} /> Copied
                  </motion.span>
                ) : (
                  <motion.span key="title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1">
                    <Copy className="h-3 w-3" /> Title
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            <button
              onClick={copyEmbed}
              className="flex-1 inline-flex items-center justify-center gap-1 h-7 px-2.5 bg-surface-2 text-[12.5px] font-medium text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors"
            >
              <AnimatePresence mode="wait">
                {copiedEmbed ? (
                  <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="inline-flex items-center gap-1 text-good">
                    <Check className="h-3 w-3" strokeWidth={3} /> Copied
                  </motion.span>
                ) : (
                  <motion.span key="embed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Embed
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </motion.article>

      {/* Conditional mount so the lazy chunk + heavy player only
          materialize once the user actually clicks Generate. */}
      {generateOpen && (
        <Suspense fallback={null}>
          <GenerateThumbnailModal
            videoId={video.video_id}
            platform={video.platform}
            title={video.title}
            open={generateOpen}
            initialToken={tokenCache.get(video.video_id)}
            onClose={() => setGenerateOpen(false)}
            onTokenAcquired={(t) => tokenCache.set(video.video_id, t)}
          />
        </Suspense>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-surface !rounded-none">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-[14px] pr-8 line-clamp-2 font-semibold tracking-tight">
              {video.title}
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-4">
            <div className="aspect-video w-full overflow-hidden bg-black">
              {previewOpen && (
                <iframe
                  src={`${video.embed_url}?autoplay=1`}
                  title={video.title}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * React.memo with default shallow compare. Combined with stable
 * `onSelectChange` (useCallback in YoutubeTab) and shared ref-based
 * blob/token caches, this lets the grid skip re-rendering every card
 * when only one card's selection state changes.
 */
export const VideoCard = memo(VideoCardImpl)

interface VideoGridProps {
  videos: (VideoInfo | null)[]
  selectedIds: Set<string>
  onSelectChange: (id: string, checked: boolean) => void
  recentCount?: number
}

export function VideoGrid({ videos, selectedIds, onSelectChange, recentCount = 0 }: VideoGridProps) {
  const blobCacheRef = useRef<BlobCache>(new Map())
  const tokenCacheRef = useRef<TokenCache>(new Map())

  const getIsRecent = useCallback(
    (i: number) => i >= videos.length - recentCount,
    [videos.length, recentCount]
  )

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
      {videos.map((video, i) =>
        video ? (
          <VideoCard
            key={video.video_id}
            video={video}
            index={i}
            isSelected={selectedIds.has(video.video_id)}
            onSelectChange={onSelectChange}
            isRecent={getIsRecent(i)}
            blobCache={blobCacheRef.current}
            tokenCache={tokenCacheRef.current}
          />
        ) : (
          <VideoCardSkeleton key={`skeleton-${i}`} />
        )
      )}
    </div>
  )
}
