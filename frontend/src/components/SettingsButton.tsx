import { useEffect, useState } from "react"
import { Settings as SettingsIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { SettingsDialog } from "./SettingsDialog"

/**
 * Small gear icon button, lives in the top bar next to the version stamp.
 * Mounts the SettingsDialog on first open and keeps it mounted afterwards
 * (cheap — a single localStorage-backed input).
 *
 * Also listens for a `dfr:open-settings` window event so deep links from
 * toasts (e.g. "Sign-in required — configure in Settings") can pop the
 * dialog without prop-drilling state through the app shell.
 */
export function SettingsButton() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener("dfr:open-settings", onOpen)
    return () => window.removeEventListener("dfr:open-settings", onOpen)
  }, [])
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open settings"
        title="Settings"
        className={cn(
          "inline-flex items-center justify-center h-7 w-7 transition-colors",
          "text-white/55 hover:text-white/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
        )}
      >
        <SettingsIcon className="h-3.5 w-3.5" />
      </button>
      <SettingsDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
