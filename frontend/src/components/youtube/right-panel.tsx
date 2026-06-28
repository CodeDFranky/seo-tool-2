import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { CaptureHistoryBody } from "./capture-history"
import { DownloadHistoryBody } from "./download-history"

/** Width of the unified drawer when open on desktop. */
const PANEL_WIDTH = 440

export type RightPanelTab = "captures" | "downloads"

interface RightPanelContextValue {
  openTab: RightPanelTab | null
  /** Opens the drawer (if closed) to the given tab, or switches to it.
   *  Passing the currently-open tab toggles the drawer closed. */
  toggle: (tab: RightPanelTab) => void
  close: () => void
}

const Ctx = createContext<RightPanelContextValue | null>(null)

export function RightPanelProvider({ children }: { children: ReactNode }) {
  const [openTab, setOpenTab] = useState<RightPanelTab | null>(null)

  const toggle = useCallback((tab: RightPanelTab) => {
    setOpenTab((prev) => (prev === tab ? null : tab))
  }, [])
  const close = useCallback(() => setOpenTab(null), [])

  // Escape closes the drawer regardless of which tab is active. Mirrors
  // the per-panel behavior that used to live in each of the two drawers.
  useEffect(() => {
    if (openTab === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenTab(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openTab])

  const value = useMemo<RightPanelContextValue>(
    () => ({ openTab, toggle, close }),
    [openTab, toggle, close],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRightPanel(): RightPanelContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useRightPanel must be used inside RightPanelProvider")
  return ctx
}

/* ───────────────────────── Drawer shell ─────────────────────────────── */

const TABS: { id: RightPanelTab; label: string }[] = [
  { id: "captures",  label: "Captures" },
  { id: "downloads", label: "Downloads" },
]

export function RightPanel() {
  const { openTab, toggle, close } = useRightPanel()
  // Above md the drawer is an inline sibling that animates its width and
  // pushes content; below md it floats over the page as a dismissible
  // drawer so the main view keeps its full real estate. Same threshold
  // the two prior panels used.
  const isDesktop = useMediaQuery("(min-width: 768px)")

  // Animation shape mirrors the legacy per-panel behavior.
  const motionProps = isDesktop
    ? {
        initial: { width: 0 },
        animate: { width: PANEL_WIDTH },
        exit:    { width: 0 },
      }
    : {
        initial: { x: "100%" },
        animate: { x: 0 },
        exit:    { x: "100%" },
      }

  const isOpen = openTab !== null

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <>
          {!isDesktop && (
            <motion.div
              key="right-panel-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={close}
              aria-hidden
              className="fixed inset-0 z-30 bg-black/60"
            />
          )}
          <motion.aside
            key="right-panel"
            {...motionProps}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "bg-surface flex",
              isDesktop
                ? "shrink-0 overflow-hidden"
                : "fixed inset-y-0 right-0 z-40 w-[min(440px,90vw)] shadow-[0_0_40px_-10px_rgba(0,0,0,0.8)]",
            )}
            aria-label="Right side panel"
          >
            <div
              style={isDesktop ? { width: PANEL_WIDTH } : undefined}
              className={cn(
                "h-full flex flex-col shrink-0",
                !isDesktop && "w-full",
              )}
            >
              {/* Sticky header — tab strip + close. Stays put while the
                  body underneath scrolls independently. */}
              <header className="flex items-center gap-0.5 px-2 h-11 bg-jet shrink-0 relative">
                {TABS.map((tab) => {
                  const active = openTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => toggle(tab.id)}
                      className={cn(
                        "relative h-9 px-3 text-[12px] font-semibold uppercase tracking-[0.12em] transition-colors",
                        active ? "text-gold" : "text-ink-3 hover:text-ink-2",
                      )}
                    >
                      {tab.label}
                      {active && (
                        <motion.span
                          // UNIQUE id so the underline doesn't try to fly
                          // between this drawer and the App-header tabs
                          // (which use layoutId="tab-underline").
                          layoutId="right-panel-tab-underline"
                          className="absolute left-3 right-3 bottom-0 h-[2px] bg-gold"
                          transition={{ type: "spring", stiffness: 500, damping: 36 }}
                        />
                      )}
                    </button>
                  )
                })}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={close}
                      aria-label="Close panel"
                      className="ml-auto inline-flex items-center justify-center h-9 w-9 text-ink-3 hover:text-ink transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Close</TooltipContent>
                </Tooltip>
              </header>

              {/* Body — cross-fade between tabs when the user switches. */}
              <div className="flex-1 min-h-0 relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {openTab === "captures" && (
                    <motion.div
                      key="captures"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 flex flex-col"
                    >
                      <CaptureHistoryBody />
                    </motion.div>
                  )}
                  {openTab === "downloads" && (
                    <motion.div
                      key="downloads"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 flex flex-col"
                    >
                      <DownloadHistoryBody />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
