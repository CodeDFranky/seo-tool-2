import { useState } from "react"
import { Settings as SettingsIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { SettingsDialog } from "./SettingsDialog"

/**
 * Small gear icon button, lives in the top bar next to the version stamp.
 * Mounts the SettingsDialog on first open and keeps it mounted afterwards
 * (cheap — a single localStorage-backed input).
 */
export function SettingsButton() {
  const [open, setOpen] = useState(false)
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
