import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FolderOpen, Loader2, RefreshCw, Trash2, X } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils"
import { useSetting, type CookiesBrowser } from "@/lib/settings"
import { Switch } from "@/components/ui/switch"
import { fetchYtDlpVersion, type YtDlpVersion } from "@/lib/api"
import { channelCacheSize, clearChannelCache } from "@/lib/channel-cache"

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const COOKIES_OPTIONS: ReadonlyArray<{ value: CookiesBrowser; label: string }> = [
  { value: "none", label: "None" },
  { value: "chrome", label: "Chrome" },
  { value: "edge", label: "Edge" },
  { value: "firefox", label: "Firefox" },
  { value: "brave", label: "Brave" },
  { value: "vivaldi", label: "Vivaldi" },
  { value: "opera", label: "Opera" },
]

const EYEBROW =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold/90"
const FIELD_LABEL = "text-[12.5px] font-medium text-ink"
const HELP_TEXT = "text-[11.5px] text-ink-3 leading-relaxed"

/**
 * App-wide settings modal. Four sections, all backed by the typed
 * localStorage wrapper in `lib/settings.ts`:
 *
 *   Downloads        — default folder for saves (skip Save-As)
 *   Privacy & Access — browser cookies for yt-dlp (members-only etc.)
 *   Engine           — bundled vs. user-fetched yt-dlp + self-update
 *   Notifications    — OS notifications for long-running ops
 *
 * Styled to match the rest of the app: dark surface, no rounding, gold
 * eyebrow text, square inputs, hairline borders.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/70",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2",
            "max-h-[calc(100vh-48px)] overflow-y-auto",
            "bg-surface text-ink shadow-[0_20px_60px_-20px_rgba(0,0,0,0.75)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          {/* Header */}
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 h-11 bg-jet">
            <DialogPrimitive.Title className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
              Settings
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close settings"
              className="inline-flex items-center justify-center h-8 w-8 text-ink-3 hover:text-ink transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </DialogPrimitive.Close>
          </header>

          {/* Body */}
          <div className="px-5 py-5 flex flex-col gap-6">
            <DownloadsSection open={open} />
            <PrivacySection />
            <EngineSection open={open} />
            <NotificationsSection />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ------------------------------------------------------------------ */
/*  Section: Downloads                                                  */
/* ------------------------------------------------------------------ */

function DownloadsSection({ open }: { open: boolean }) {
  const [defaultDir, setDefaultDir] = useSetting("defaultDownloadDir")
  const [browsing, setBrowsing] = useState(false)
  // Re-counts on every open so a recent fetch's contribution is
  // visible. localStorage doesn't emit a "size changed" event for
  // unrelated namespaces so we don't need to subscribe to anything.
  const [cacheCount, setCacheCount] = useState(0)
  useEffect(() => {
    if (open) setCacheCount(channelCacheSize())
  }, [open])

  function handleClearChannelCache() {
    clearChannelCache()
    setCacheCount(0)
    toast.success("Channel cache cleared", {
      description: "Next fetch will hit the source live.",
      duration: 2400,
    })
  }

  async function handleBrowse() {
    if (!inTauri()) {
      toast.info("Folder picker only available in the desktop app", {
        description: "In dev/web mode, your browser controls download location.",
        duration: 3500,
      })
      return
    }
    setBrowsing(true)
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog")
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: defaultDir ?? undefined,
      })
      if (typeof selected === "string" && selected.length > 0) {
        setDefaultDir(selected)
        toast.success("Default folder set", { duration: 2200 })
      }
    } catch (err) {
      toast.error("Couldn't open folder picker", { description: String(err) })
    } finally {
      setBrowsing(false)
    }
  }

  function handleClear() {
    setDefaultDir(null)
    toast.success("Default folder cleared", { duration: 1800 })
  }

  return (
    <section className="flex flex-col gap-2.5">
      <p className={EYEBROW}>Downloads</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="settings-default-dir" className={FIELD_LABEL}>
          Default folder
        </label>
        <div className="flex gap-2">
          <input
            id="settings-default-dir"
            readOnly
            value={defaultDir ?? ""}
            placeholder="Always ask where to save"
            className={cn(
              "flex-1 h-9 px-3 bg-surface-2 text-[12.5px] text-ink",
              "placeholder:text-ink-4 font-mono tabular-nums",
              "border border-transparent focus-visible:outline-none focus-visible:border-gold",
              "truncate",
            )}
            title={defaultDir ?? "Always ask where to save"}
          />
          <button
            type="button"
            onClick={handleBrowse}
            disabled={browsing}
            className={cn(
              "shrink-0 inline-flex items-center justify-center gap-1.5 h-9 px-3",
              "bg-surface-2 text-[12.5px] font-medium text-ink-2",
              "hover:bg-surface-3 hover:text-ink transition-colors",
              "disabled:opacity-50 disabled:pointer-events-none",
            )}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Browse…
          </button>
          {defaultDir && (
            <button
              type="button"
              onClick={handleClear}
              className={cn(
                "shrink-0 inline-flex items-center justify-center h-9 px-3",
                "bg-surface-2 text-[12.5px] font-medium text-ink-3",
                "hover:bg-bad/15 hover:text-bad transition-colors",
              )}
            >
              Clear
            </button>
          )}
        </div>
        <p className={HELP_TEXT}>
          When set, saves skip the Save-As dialog and write directly to this folder.
        </p>
      </div>

      <div className="flex flex-col gap-1.5 pt-3 border-t border-line-soft">
        <label className={FIELD_LABEL}>Channel cache</label>
        <div className="flex gap-2 items-center">
          <div
            className={cn(
              "flex-1 h-9 px-3 inline-flex items-center bg-surface-2 text-[12.5px]",
              "text-ink-2 font-mono tabular-nums",
            )}
          >
            {cacheCount === 0
              ? "Empty"
              : `${cacheCount} ${cacheCount === 1 ? "entry" : "entries"} cached`}
          </div>
          <button
            type="button"
            onClick={handleClearChannelCache}
            disabled={cacheCount === 0}
            className={cn(
              "shrink-0 inline-flex items-center justify-center gap-1.5 h-9 px-3",
              "bg-surface-2 text-[12.5px] font-medium text-ink-3",
              "hover:bg-bad/15 hover:text-bad transition-colors",
              "disabled:opacity-50 disabled:pointer-events-none",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
        <p className={HELP_TEXT}>
          Re-fetching a recently-viewed channel hits this cache instead of the source.
          Entries expire after 1 hour. Clear it if a fetch looks stale.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Section: Privacy & Access                                           */
/* ------------------------------------------------------------------ */

function PrivacySection() {
  const [cookies, setCookies] = useSetting("cookiesBrowser")

  return (
    <section className="flex flex-col gap-2.5">
      <p className={EYEBROW}>Privacy &amp; Access</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="settings-cookies-browser" className={FIELD_LABEL}>
          Browser sign-in
        </label>
        <select
          id="settings-cookies-browser"
          value={cookies}
          onChange={(e) => setCookies(e.target.value as CookiesBrowser)}
          className={cn(
            "h-9 px-2.5 bg-surface-2 text-[12.5px] text-ink",
            "border border-transparent focus-visible:outline-none focus-visible:border-gold",
            "appearance-none cursor-pointer",
          )}
        >
          {COOKIES_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-surface text-ink">
              {opt.label}
            </option>
          ))}
        </select>
        <p className={HELP_TEXT}>
          yt-dlp will use this browser&apos;s saved cookies to access age-restricted,
          members-only, and login-required videos. Your cookies stay in the browser;
          the app reads them at request time.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Section: Engine (yt-dlp self-update)                                */
/* ------------------------------------------------------------------ */

function EngineSection({ open }: { open: boolean }) {
  const [info, setInfo] = useState<YtDlpVersion | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Refresh on every open so a just-finished self-update reflects the new
  // version string once the user reopens the dialog (or reopens after the
  // app has restarted).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetchYtDlpVersion()
      .then((v) => { if (!cancelled) setInfo(v) })
      .catch(() => { if (!cancelled) setInfo({ version: "unknown", path: "", is_user_copy: false }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  async function handleUpdate() {
    if (!inTauri()) {
      toast.info("yt-dlp update only available in the desktop app", {
        description: "In dev/web mode, update yt-dlp through your venv (pip install -U yt-dlp).",
        duration: 4000,
      })
      return
    }
    setUpdating(true)
    const toastId = toast.loading("Downloading latest yt-dlp…")
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const path = await invoke<string>("update_ytdlp")
      toast.success("yt-dlp updated", {
        id: toastId,
        description: `Saved to ${path}. Restart the app to use it.`,
        action: {
          label: "Restart now",
          onClick: async () => {
            try {
              await invoke("restart_app")
            } catch (err) {
              toast.error("Restart failed", { description: String(err) })
            }
          },
        },
        duration: 12000,
      })
    } catch (err) {
      toast.error("Update failed", { id: toastId, description: String(err) })
    } finally {
      setUpdating(false)
    }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <p className={EYEBROW}>Engine</p>
      <div className="flex flex-col gap-1.5">
        <label className={FIELD_LABEL}>yt-dlp</label>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-9 px-3 bg-surface-2 flex items-center text-[12.5px] font-mono tabular-nums text-ink-2">
            {loading || !info ? (
              <span className="text-ink-4">Loading…</span>
            ) : (
              <>
                <span className="text-ink">v {info.version}</span>
                <span className="mx-2 text-ink-4">·</span>
                <span className="text-ink-3">{info.is_user_copy ? "user copy" : "bundled"}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={updating}
            className={cn(
              "shrink-0 inline-flex items-center justify-center gap-1.5 h-9 px-3",
              "bg-surface-2 text-[12.5px] font-medium text-ink-2",
              "hover:bg-surface-3 hover:text-ink transition-colors",
              "disabled:opacity-60 disabled:cursor-wait",
            )}
          >
            {updating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Updating…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Check for update
              </>
            )}
          </button>
        </div>
        <p className={HELP_TEXT}>
          yt-dlp is what fetches videos from YouTube and Vimeo. YouTube changes regularly;
          if videos stop downloading, an update usually fixes it.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Section: Notifications                                              */
/* ------------------------------------------------------------------ */

function NotificationsSection() {
  const [notifications, setNotifications] = useSetting("notifications")

  function update<K extends keyof typeof notifications>(key: K, value: boolean) {
    setNotifications({ ...notifications, [key]: value })
  }

  return (
    <section className="flex flex-col gap-2.5">
      <p className={EYEBROW}>Notifications</p>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="notif-capture"
          className="flex items-center justify-between gap-3 py-1 cursor-pointer"
        >
          <span className={FIELD_LABEL}>Capture is ready</span>
          <Switch
            id="notif-capture"
            checked={notifications.onCaptureDone}
            onCheckedChange={(v) => update("onCaptureDone", v)}
          />
        </label>
        <label
          htmlFor="notif-batch"
          className="flex items-center justify-between gap-3 py-1 cursor-pointer"
        >
          <span className={FIELD_LABEL}>Batch download finished</span>
          <Switch
            id="notif-batch"
            checked={notifications.onBatchDone}
            onCheckedChange={(v) => update("onBatchDone", v)}
          />
        </label>
        <p className={HELP_TEXT}>
          Show a desktop notification when long-running operations finish.
        </p>
      </div>
    </section>
  )
}
