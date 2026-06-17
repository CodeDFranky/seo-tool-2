import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
  X, Loader2, AlertCircle, Play, Pause, Camera,
  ChevronLeft, ChevronRight, Volume2, VolumeX, Volume1,
} from "lucide-react"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ShortcutHint } from "@/components/ui/shortcut-hint"
import { AUTO_PREFETCH_COUNT, CaptureTile, useCaptureHistory } from "@/components/youtube/capture-history"
import type { Platform } from "@/lib/api"

interface Props {
  videoId: string
  platform: Platform
  title: string
  open: boolean
  initialToken?: string
  onClose: () => void
  onTokenAcquired: (token: string) => void
}

type Stage = "downloading" | "ready" | "error"

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "0:00.00"
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toFixed(2).padStart(5, "0")}`
}

export default function GenerateThumbnailModal({
  videoId, platform, title, open, initialToken, onClose, onTokenAcquired,
}: Props) {
  const [stage, setStage] = useState<Stage>("downloading")
  const [error, setError] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)

  const tokenRef = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const frameStepRef = useRef<number>(1 / 30)
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const captureHistory = useCaptureHistory()

  // Captures for the current video, partitioned by origin so the modal
  // can show user-captured frames at full size and the auto-generated
  // candidates as a denser strip below.
  const videoCaptures = useMemo(
    () => captureHistory.captures.filter((c) => c.videoId === videoId),
    [captureHistory.captures, videoId]
  )
  const manualCaps = useMemo(() => videoCaptures.filter((c) => c.origin === "manual"), [videoCaptures])
  const autoCaps   = useMemo(() => videoCaptures.filter((c) => c.origin === "auto"),   [videoCaptures])

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)

  const [captureFlash, setCaptureFlash] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null); setIsPlaying(false); setCurrentTime(0); setDuration(0)
    setDownloadProgress(0); setCaptureFlash(false)
    frameStepRef.current = 1 / 30
    autoPrefetchRef.current = false

    if (initialToken) {
      tokenRef.current = initialToken
      setStage("ready")
      return
    }

    setStage("downloading")
    tokenRef.current = null
    const controller = new AbortController()
    abortControllerRef.current = controller

    ;(async () => {
      try {
        const res = await fetch("/api/capture_thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: videoId, platform }),
          signal: controller.signal,
        })
        if (res.status === 429) {
          const data = await res.json().catch(() => ({} as { error?: string; retry_after?: number }))
          const retry = Number(res.headers.get("Retry-After")) || data.retry_after || 30
          throw new Error(
            data.error ||
              `Rate limit hit. Try again in ${retry}s. Custom thumbnails are limited to 4/min, 30/hr.`
          )
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
              tokenRef.current = token
              onTokenAcquired(token)
              setStage("ready")
              break outer
            } else if (evtType === "error") {
              const { error: errMsg } = JSON.parse(dataLine) as { error: string }
              setError(errMsg); setStage("error")
              break outer
            } else {
              const { progress } = JSON.parse(dataLine) as { progress: number }
              setDownloadProgress(progress)
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setError(err instanceof Error ? err.message : "Download failed")
        setStage("error")
      }
    })()

    return () => {
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleClose = useCallback(() => {
    if (stage === "downloading") abortControllerRef.current?.abort()
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current)
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current)
    onClose()
  }, [stage, onClose])

  const autoPrefetchRef = useRef(false)

  /** Auto-capture N random frames from the cached video using an offscreen
   *  <video> so the visible player isn't disturbed. Frames are written
   *  straight into the global history with origin "auto". */
  async function autoPrefetchThumbnails(token: string, duration: number) {
    if (autoPrefetchRef.current) return
    autoPrefetchRef.current = true
    if (!isFinite(duration) || duration <= 0) return
    if (captureHistory.hasCapturesFor(videoId)) return

    // Pick N timestamps: divide [5%, 95%] of duration into equal segments,
    // then jitter each pick within its segment for variety.
    const usable = Math.max(1, duration * 0.9)
    const start = duration * 0.05
    const n = AUTO_PREFETCH_COUNT
    const times: number[] = []
    for (let i = 0; i < n; i++) {
      const segLo = start + (i / n) * usable
      const segHi = start + ((i + 1) / n) * usable
      // Avoid the very edges of each segment.
      const lo = segLo + (segHi - segLo) * 0.15
      const hi = segLo + (segHi - segLo) * 0.85
      times.push(lo + Math.random() * (hi - lo))
    }

    const off = document.createElement("video")
    off.src = `/api/capture_thumbnail?token=${encodeURIComponent(token)}`
    off.muted = true
    off.preload = "auto"
    off.crossOrigin = "anonymous"
    off.playsInline = true
    off.style.position = "fixed"
    off.style.left = "-99999px"
    off.style.top = "-99999px"
    document.body.appendChild(off)

    const waitFor = (target: HTMLVideoElement, ev: keyof HTMLVideoElementEventMap) =>
      new Promise<void>((resolve, reject) => {
        const onOk = () => { cleanup(); resolve() }
        const onErr = () => { cleanup(); reject(new Error(`offscreen ${ev} error`)) }
        const cleanup = () => {
          target.removeEventListener(ev, onOk)
          target.removeEventListener("error", onErr)
        }
        target.addEventListener(ev, onOk, { once: true })
        target.addEventListener("error", onErr, { once: true })
      })

    try {
      await waitFor(off, "loadeddata")
      const canvas = document.createElement("canvas")
      canvas.width = off.videoWidth || 1280
      canvas.height = off.videoHeight || 720
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      for (const t of times) {
        off.currentTime = Math.max(0, Math.min(t, off.duration - 0.05))
        await waitFor(off, "seeked")
        ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
        const blob: Blob | null = await new Promise((res) =>
          canvas.toBlob(res, "image/jpeg", 0.9)
        )
        if (!blob) continue
        const filename = `v_${videoId}_auto_${Math.floor(t)}s.jpg`
        const url = URL.createObjectURL(blob)
        captureHistory.addCapture({
          url,
          file: new File([blob], filename, { type: "image/jpeg" }),
          atTime: t,
          videoId,
          videoTitle: title,
          origin: "auto",
        })
      }
    } catch (err) {
      console.warn("auto-prefetch failed:", err)
    } finally {
      off.removeAttribute("src")
      off.load()
      off.remove()
    }
  }

  const handleLoadedData = () => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration)
    if (tokenRef.current) {
      // Fire-and-forget — runs in parallel with the user's playback.
      void autoPrefetchThumbnails(tokenRef.current, v.duration)
    }
    const saved = parseFloat(localStorage.getItem("dfr:player-volume") ?? "1")
    const vol = isNaN(saved) ? 1 : Math.max(0, Math.min(1, saved))
    v.volume = vol; v.muted = false
    setVolume(vol); setIsMuted(false)

    type RVFC = HTMLVideoElement & {
      requestVideoFrameCallback: (cb: (now: number, meta: { mediaTime: number }) => void) => void
    }
    if ("requestVideoFrameCallback" in v) {
      let first: number | null = null
      const vid = v as RVFC
      vid.requestVideoFrameCallback((_n, meta) => {
        first = meta.mediaTime
        vid.requestVideoFrameCallback((_n2, meta2) => {
          if (first !== null && meta2.mediaTime > first) {
            const detected = meta2.mediaTime - first
            if (detected >= 1 / 120 && detected <= 1 / 15) frameStepRef.current = detected
          }
        })
      })
    }
  }

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }, [])

  const stepFrame = useCallback((dir: 1 | -1) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    const next = Math.max(0, Math.min(v.currentTime + dir * frameStepRef.current, v.duration || 0))
    v.currentTime = next
    setCurrentTime(next)
  }, [])

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current
    if (!v) return
    const t = parseFloat(e.target.value)
    v.currentTime = t
    setCurrentTime(t)
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setIsMuted(v.muted)
  }

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current
    if (!v) return
    const x = parseFloat(e.target.value)
    v.volume = x; v.muted = false
    setVolume(x); setIsMuted(false)
    localStorage.setItem("dfr:player-volume", String(x))
  }

  const clearHold = useCallback(() => {
    if (holdTimeoutRef.current) { clearTimeout(holdTimeoutRef.current); holdTimeoutRef.current = null }
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null }
  }, [])
  const startHold = useCallback((dir: 1 | -1) => {
    stepFrame(dir)
    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => stepFrame(dir), 100)
    }, 400)
  }, [stepFrame])

  useEffect(() => {
    if (stage !== "ready" || !open) return
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowLeft") { e.preventDefault(); stepFrame(-1) }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepFrame(1) }
      else if (e.key === " ") { e.preventDefault(); togglePlay() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [stage, open, stepFrame, togglePlay])

  const captureFrame = () => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    setCaptureFlash(true)
    const at = v.currentTime
    const canvas = document.createElement("canvas")
    canvas.width = v.videoWidth || 1280
    canvas.height = v.videoHeight || 720
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const filename = `v_${videoId}_frame_${Math.floor(at)}s.jpg`
        captureHistory.addCapture({
          url,
          file: new File([blob], filename, { type: "image/jpeg" }),
          atTime: at,
          videoId,
          videoTitle: title,
          origin: "manual",
        })
        toast.success("Frame captured", {
          description: "Open the history icon to drag or download it.",
          duration: 1800,
        })
      },
      "image/jpeg",
      0.92,
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
          />
        </Dialog.Overlay>
        <Dialog.Content
          asChild
          onEscapeKeyDown={(e) => { e.preventDefault(); handleClose() }}
          onInteractOutside={(e) => { e.preventDefault(); handleClose() }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-surface w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 px-5 py-3.5 shrink-0 bg-jet text-ink-on-jet">
                <div className="flex flex-col min-w-0">
                  <Dialog.Title className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                    Generate thumbnail
                  </Dialog.Title>
                  {title && (
                    <Dialog.Description className="text-[14px] text-white/75 truncate mt-1">
                      {title}
                    </Dialog.Description>
                  )}
                </div>
                <button
                  onClick={handleClose}
                  className="p-1.5 text-white/65 hover:text-white transition-colors shrink-0"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-4 p-5 overflow-y-auto bg-page">
                {stage === "downloading" && (
                  <div className="flex flex-col items-center gap-5 py-10">
                    <Loader2 className="h-7 w-7 text-gold animate-spin" strokeWidth={2} />
                    <div className="w-full max-w-xs flex flex-col gap-2">
                      <div className="w-full bg-surface-2 h-1.5 overflow-hidden">
                        <motion.div
                          className="bg-gold h-full"
                          animate={{ width: `${downloadProgress}%` }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        />
                      </div>
                      <p className="text-[13px] text-ink-2 text-center font-medium">
                        {downloadProgress > 0
                          ? <>Downloading · <span className="font-mono tabular-nums">{downloadProgress.toFixed(0)}%</span></>
                          : "Preparing"}
                      </p>
                      <p className="text-[12.5px] text-ink-4 text-center">
                        720p · longer videos may take a moment.
                      </p>
                    </div>
                    <button
                      onClick={handleClose}
                      className="text-[13px] font-medium text-ink-3 hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {stage === "error" && (
                  <div className="flex flex-col items-center gap-4 py-14">
                    <AlertCircle className="h-8 w-8 text-bad" strokeWidth={1.5} />
                    <div className="text-center">
                      <p className="text-[15px] font-semibold text-ink">Download failed</p>
                      <p className="text-[13px] text-bad mt-1.5 max-w-xs leading-relaxed">{error}</p>
                    </div>
                    <button
                      onClick={handleClose}
                      className="text-[13px] font-medium text-ink-3 hover:text-ink transition-colors"
                    >
                      Close
                    </button>
                  </div>
                )}

                {stage === "ready" && tokenRef.current && (
                  <>
                    <div className="relative bg-black overflow-hidden aspect-video w-full">
                      <video
                        ref={videoRef}
                        src={`/api/capture_thumbnail?token=${encodeURIComponent(tokenRef.current)}`}
                        className="w-full h-full object-contain"
                        preload="auto"
                        muted
                        onContextMenu={(e) => e.preventDefault()}
                        onTimeUpdate={() => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime) }}
                        onLoadedData={handleLoadedData}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />
                      <AnimatePresence>
                        {captureFlash && (
                          <motion.div
                            initial={{ opacity: 0.95 }}
                            animate={{ opacity: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.32, ease: "easeOut" }}
                            onAnimationComplete={() => setCaptureFlash(false)}
                            className="absolute inset-0 bg-white pointer-events-none"
                          />
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <input
                        type="range"
                        min={0}
                        max={duration || 1}
                        step="any"
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1.5 accent-gold cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[11.5px] font-mono text-ink-4 px-0.5 tabular-nums">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>

                    <TooltipProvider delayDuration={350}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onMouseDown={() => startHold(-1)}
                              onMouseUp={clearHold}
                              onMouseLeave={clearHold}
                              aria-label="Previous frame"
                              className="flex items-center gap-1 px-3 h-8 bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink text-[13px] font-medium transition-colors"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" /> Frame
                            </button>
                          </TooltipTrigger>
                          <TooltipContent shortcut="left">Previous frame</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={togglePlay}
                              aria-label={isPlaying ? "Pause" : "Play"}
                              className="flex items-center justify-center w-10 h-10 text-white btn-gold"
                            >
                              {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current translate-x-px" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent shortcut="space">{isPlaying ? "Pause" : "Play"}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onMouseDown={() => startHold(1)}
                              onMouseUp={clearHold}
                              onMouseLeave={clearHold}
                              aria-label="Next frame"
                              className="flex items-center gap-1 px-3 h-8 bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink text-[13px] font-medium transition-colors"
                            >
                              Frame <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent shortcut="right">Next frame</TooltipContent>
                        </Tooltip>

                        <div className="ml-1 flex items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={toggleMute}
                                aria-label={isMuted ? "Unmute" : "Mute"}
                                className="p-2 bg-surface-2 text-ink-3 hover:text-ink hover:bg-surface-3 transition-colors"
                              >
                                {isMuted || volume === 0
                                  ? <VolumeX className="h-3.5 w-3.5" />
                                  : volume < 0.5 ? <Volume1 className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
                          </Tooltip>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.02}
                            value={isMuted ? 0 : volume}
                            onChange={handleVolume}
                            aria-label="Volume"
                            className="w-20 h-1.5 accent-gold cursor-pointer"
                          />
                        </div>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={captureFrame}
                              aria-label="Capture current frame"
                              className="ml-auto flex items-center gap-1.5 px-4 h-9 text-white btn-gold text-[14px] font-semibold"
                            >
                              <Camera className="h-4 w-4" /> Capture frame
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Capture the current video frame.</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>

                    <ShortcutHint
                      align="center"
                      items={[
                        { keys: ["left", "right"], label: "Step frame" },
                        { keys: "space",            label: "Play / pause" },
                      ]}
                    />

                    {(manualCaps.length > 0 || autoCaps.length > 0) && (
                      <section className="flex flex-col gap-4 mt-3">
                        {manualCaps.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                              Captured
                              <span className="ml-1.5 text-ink-4 font-mono tabular-nums">
                                {manualCaps.length}
                              </span>
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                              {manualCaps.map((c) => (
                                <CaptureTile
                                  key={c.id}
                                  c={c}
                                  onRemove={captureHistory.removeCapture}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        {autoCaps.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-[10.5px] font-medium uppercase tracking-[0.10em] text-ink-3">
                              Auto-generated
                              <span className="ml-1.5 text-ink-4 font-mono tabular-nums">
                                {autoCaps.length}
                              </span>
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                              {autoCaps.map((c) => (
                                <CaptureTile
                                  key={c.id}
                                  c={c}
                                  onRemove={captureHistory.removeCapture}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </section>
                    )}

                  </>
                )}
              </div>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
