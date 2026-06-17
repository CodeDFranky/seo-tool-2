import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import dfrLogo from "@/assets/dfr.png"
import { Toaster } from "@/components/ui/sonner"
import { SeoTab } from "@/components/seo/SeoTab"
import { YoutubeTab } from "@/components/youtube/YoutubeTab"
import { LandingPage } from "@/components/landing/LandingPage"
import {
  CaptureHistoryProvider,
  CaptureHistoryPanel,
  useCaptureHistoryActions,
} from "@/components/youtube/capture-history"

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
  // Actions context — stable identity. AppShell will not re-render on
  // capture mutations because of this.
  const { setPanelOpen } = useCaptureHistoryActions()

  // Persist the active tab and view so a reload preserves the user's spot.
  useEffect(() => {
    try { localStorage.setItem(TOOL_STORAGE_KEY, tool) } catch { /* ignore */ }
  }, [tool])
  useEffect(() => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, view) } catch { /* ignore */ }
  }, [view])

  // Auto-close the capture history panel when leaving the Vlog tab or
  // returning to landing — both would otherwise overlay incorrect surfaces.
  useEffect(() => {
    if (tool !== "vlog" || view !== "app") setPanelOpen(false)
  }, [tool, view, setPanelOpen])

  const enterApp = useCallback((nextTool: Tool) => {
    setTool(nextTool)
    setView("app")
  }, [])

  const exitToLanding = useCallback(() => {
    setView("landing")
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-page text-ink">
      <AnimatePresence mode="wait">
        {view === "landing" ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.015 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full"
          >
            <LandingPage onEnter={enterApp} />
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full flex flex-col"
          >
            {/* Top bar — pure black with gold accent */}
            <header className="shrink-0 h-14 flex items-center px-6 bg-jet text-ink-on-jet">
              <button
                type="button"
                onClick={exitToLanding}
                aria-label="Back to landing"
                title="Back to landing"
                className="group flex items-center gap-2.5 -mx-2 px-2 py-1.5 transition-colors
                           hover:bg-white/[0.04]"
              >
                <div className="h-7 w-7 overflow-hidden border border-white/15
                                transition-[border-color] group-hover:border-gold/60">
                  <img src={dfrLogo} alt="" className="h-full w-full object-cover" />
                </div>
                <span className="text-[12.5px] font-medium tracking-[0.14em] uppercase
                                 transition-colors group-hover:text-gold">
                  DFR Toolkit
                </span>
              </button>

              <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1" role="tablist">
                {TOOLS.map((t) => {
                  const active = tool === t.id
                  return (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTool(t.id)}
                      className={
                        "relative h-9 px-4 text-[14px] font-semibold tracking-[-0.003em] transition-colors " +
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

              <div className="ml-auto text-[11.5px] font-mono text-white/40">
                v1.0
              </div>
            </header>

            {/* Workspace + inline side panel */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              <main className="flex-1 min-w-0 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tool}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full"
                  >
                    {tool === "seo" ? <SeoTab /> : <YoutubeTab />}
                  </motion.div>
                </AnimatePresence>
              </main>

              {tool === "vlog" && <CaptureHistoryPanel />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toaster />
    </div>
  )
}

export default function App() {
  return (
    <CaptureHistoryProvider>
      <AppShell />
    </CaptureHistoryProvider>
  )
}
