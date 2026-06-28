import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import dfrLogo from "@/assets/dfr.png"
import { Toaster } from "@/components/ui/sonner"
import { SeoTab } from "@/components/seo/SeoTab"
import { YoutubeTab } from "@/components/youtube/YoutubeTab"
import { LandingPage } from "@/components/landing/LandingPage"
import { CaptureHistoryProvider } from "@/components/youtube/capture-history"
import { DownloadHistoryProvider } from "@/components/youtube/download-history"
import {
  RightPanel,
  RightPanelProvider,
  useRightPanel,
} from "@/components/youtube/right-panel"
import { SettingsButton } from "@/components/SettingsButton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type Tool = "seo" | "vlog"
type View = "landing" | "app"

const TOOLS: { id: Tool; label: string }[] = [
  { id: "seo",  label: "SEO" },
  { id: "vlog", label: "Vlog" },
]

const TOOL_STORAGE_KEY = "dfr:tool"
const VIEW_STORAGE_KEY = "dfr:view"

function readStoredTool(): Tool {
  try {
    const saved = localStorage.getItem(TOOL_STORAGE_KEY)
    if (saved === "vlog" || saved === "seo") return saved
  } catch { /* localStorage unavailable */ }
  return "seo"
}

/**
 * First-time visitor (no `dfr:view` key in storage) lands on the
 * landing screen. Returning visitor picks up wherever they were —
 * either back on the landing or directly into the app.
 */
function readStoredView(): View {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY)
    if (saved === "app") return "app"
    if (saved === "landing") return "landing"
  } catch { /* localStorage unavailable */ }
  return "landing"
}

function AppShell() {
  const [view, setView] = useState<View>(readStoredView)
  const [tool, setTool] = useState<Tool>(readStoredTool)
  // Single drawer state — open/close + which tab is shown.
  const { close: closeRightPanel } = useRightPanel()

  // Persist the active tab and view so a reload preserves the user's spot.
  useEffect(() => {
    try { localStorage.setItem(TOOL_STORAGE_KEY, tool) } catch { /* ignore */ }
  }, [tool])
  useEffect(() => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, view) } catch { /* ignore */ }
  }, [view])

  // Auto-close the side drawer when leaving the Vlog tab or returning to
  // landing — it would otherwise overlay incorrect surfaces.
  useEffect(() => {
    if (tool !== "vlog" || view !== "app") {
      closeRightPanel()
    }
  }, [tool, view, closeRightPanel])

  const enterApp = useCallback((nextTool: Tool) => {
    setTool(nextTool)
    setView("app")
  }, [])

  const exitToLanding = useCallback(() => {
    setView("landing")
  }, [])

  const onLanding = view === "landing"
  const onApp = view === "app"

  return (
    // Both the landing and the app are kept mounted at all times so tool
    // sessions survive view changes. Crossfade is driven by opacity on
    // stacked absolute layers rather than mount/unmount via AnimatePresence.
    // Same pattern applies one level deeper for SEO vs Vlog.
    // TooltipProvider lifted to app root so every icon-button across the
    // tree (header, panel close X's, settings gear, etc.) can use Radix
    // tooltips without each surface spinning up its own provider.
    <TooltipProvider delayDuration={350}>
    <div className="h-screen w-screen overflow-hidden bg-page text-ink relative">
      {/* ── Landing layer ───────────────────────────────────────────── */}
      <motion.div
        initial={false}
        animate={{
          opacity: onLanding ? 1 : 0,
          scale:   onLanding ? 1 : 1.015,
        }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{ pointerEvents: onLanding ? "auto" : "none" }}
        aria-hidden={!onLanding}
        className="absolute inset-0 z-20"
      >
        <LandingPage onEnter={enterApp} />
      </motion.div>

      {/* ── App layer (always mounted) ──────────────────────────────── */}
      <motion.div
        initial={false}
        animate={{
          opacity: onApp ? 1 : 0,
          scale:   onApp ? 1 : 0.985,
        }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{ pointerEvents: onApp ? "auto" : "none" }}
        aria-hidden={!onApp}
        className="absolute inset-0 z-10 flex flex-col"
      >
        {/* Top bar — pure black with gold accent. Three flow regions
            (brand · tabs · meta) collapse independently below sm: the
            wordmark hides first so the centered tabs have room, then the
            version stamp hides if there's still not enough space. */}
        <header className="shrink-0 h-14 flex items-center gap-3 px-3 sm:px-6 bg-jet text-ink-on-jet">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={exitToLanding}
                aria-label="Back to landing"
                className="group shrink-0 flex items-center gap-2.5 -mx-2 px-2 py-1.5 transition-colors
                           hover:bg-white/[0.04]"
              >
                <div className="h-7 w-7 overflow-hidden border border-white/15
                                transition-[border-color] group-hover:border-gold/60">
                  <img src={dfrLogo} alt="" className="h-full w-full object-cover" />
                </div>
                <span className="hidden sm:inline text-[12.5px] font-medium tracking-[0.14em] uppercase
                                 transition-colors group-hover:text-gold">
                  DFR Toolkit
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to landing</TooltipContent>
          </Tooltip>

          <nav
            className="flex-1 flex items-center justify-center gap-1 min-w-0"
            role="tablist"
          >
            {TOOLS.map((t) => {
              const active = tool === t.id
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTool(t.id)}
                  className={
                    "relative h-9 px-3 sm:px-4 text-[14px] font-semibold tracking-[-0.003em] transition-colors " +
                    (active ? "text-ink-on-jet" : "text-white/55 hover:text-white/85")
                  }
                >
                  {t.label}
                  {active && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute left-3 right-3 bottom-0 h-[2px] bg-gold"
                      transition={{ type: "spring", stiffness: 500, damping: 36 }}
                    />
                  )}
                </button>
              )
            })}
          </nav>

          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <SettingsButton />
            <span className="text-[11.5px] font-mono text-white/40">
              v{__APP_VERSION__}
            </span>
          </div>
        </header>

        {/* Workspace + inline side panel */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <main className="flex-1 min-w-0 overflow-hidden relative">
            {/* Both tabs always mounted on stacked layers so tool
                sessions (form state, fetched videos, in-flight captures,
                scroll position) survive switching. Crossfade is opacity
                + a small slide — same feel as the previous AnimatePresence
                version, but without unmounting either tab. */}
            <motion.div
              initial={false}
              animate={{
                opacity: tool === "seo" ? 1 : 0,
                y:       tool === "seo" ? 0 : 4,
              }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ pointerEvents: tool === "seo" ? "auto" : "none" }}
              aria-hidden={tool !== "seo"}
              className="absolute inset-0"
            >
              <SeoTab />
            </motion.div>
            <motion.div
              initial={false}
              animate={{
                opacity: tool === "vlog" ? 1 : 0,
                y:       tool === "vlog" ? 0 : 4,
              }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{ pointerEvents: tool === "vlog" ? "auto" : "none" }}
              aria-hidden={tool !== "vlog"}
              className="absolute inset-0"
            >
              <YoutubeTab />
            </motion.div>
          </main>

          {tool === "vlog" && view === "app" && <RightPanel />}
        </div>
      </motion.div>

      <Toaster />
    </div>
    </TooltipProvider>
  )
}

export default function App() {
  return (
    <CaptureHistoryProvider>
      <DownloadHistoryProvider>
        <RightPanelProvider>
          <AppShell />
        </RightPanelProvider>
      </DownloadHistoryProvider>
    </CaptureHistoryProvider>
  )
}
