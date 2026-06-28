import { useState } from "react"
import { toast } from "sonner"
import { FolderOpen, X } from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils"
import { useSetting } from "@/lib/settings"

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Single-row settings modal. Right now it only exposes the default
 * download folder — when set, saves skip the Save-As dialog and write
 * directly into that folder. Empty = "always ask", matching the legacy
 * behavior.
 *
 * Styled to match the rest of the app: dark surface, no rounding, gold
 * eyebrow text, square buttons.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [defaultDir, setDefaultDir] = useSetting("defaultDownloadDir")
  const [browsing, setBrowsing] = useState(false)

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
            "fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2",
            "bg-surface text-ink shadow-[0_20px_60px_-20px_rgba(0,0,0,0.75)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          {/* Header */}
          <header className="flex items-center justify-between gap-3 px-5 h-11 bg-jet">
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
          <div className="px-5 py-5 flex flex-col gap-5">
            <section className="flex flex-col gap-2.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold/90">
                Downloads
              </p>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="settings-default-dir"
                  className="text-[12.5px] font-medium text-ink"
                >
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
                <p className="text-[11.5px] text-ink-3 leading-relaxed">
                  When set, saves skip the Save-As dialog and write directly to this folder.
                </p>
              </div>
            </section>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
