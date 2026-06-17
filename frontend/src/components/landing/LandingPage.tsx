import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import dfrLogo from "@/assets/dfr.png"

export type Tool = "seo" | "vlog"

interface LandingPageProps {
  onEnter: (tool: Tool) => void
}

const TOOLS: { id: Tool; title: string; description: string }[] = [
  {
    id: "seo",
    title: "SEO title generator",
    description: "Listing-friendly title variants for real-estate agents.",
  },
  {
    id: "vlog",
    title: "Vlog library",
    description: "YouTube and Vimeo. Metadata, previews, thumbnails, drag-out.",
  },
]

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="h-screen w-screen flex bg-page text-ink overflow-hidden">
      {/* ── Left column: nav ─────────────────────────────────── */}
      <motion.aside
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        className="flex-1 min-w-0 flex flex-col px-12 py-10 lg:px-16"
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 overflow-hidden border border-white/15">
            <img src={dfrLogo} alt="" className="h-full w-full object-cover" />
          </div>
          <span className="text-[13px] font-medium tracking-[0.14em] uppercase">
            DFR Toolkit
          </span>
        </div>

        {/* Hero copy + tool selection, centered vertically */}
        <div className="flex-1 flex flex-col justify-center gap-12 max-w-xl">
          <div className="flex flex-col gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
              Workbench
            </p>
            <h1 className="text-[clamp(34px,4.5vw,48px)] font-semibold tracking-[-0.025em] leading-[1.05] text-balance">
              Two tools for the parts of the day that aren&apos;t building.
            </h1>
            <p className="text-[14px] text-ink-2 leading-relaxed max-w-md">
              Pick one. You can switch any time from the top bar — clicking
              the mark brings you back here.
            </p>
          </div>

          {/* Tool entries */}
          <nav className="flex flex-col">
            {TOOLS.map((t, i) => (
              <motion.button
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.45,
                  delay: 0.28 + i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                onClick={() => onEnter(t.id)}
                className="group relative flex items-center justify-between gap-6 py-5 text-left
                           border-b border-line-soft last:border-b-0
                           transition-colors hover:bg-surface/60 -mx-3 px-3"
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-[22px] font-semibold tracking-[-0.018em] text-ink leading-tight
                                   transition-colors group-hover:text-gold">
                    {t.title}
                  </span>
                  <span className="text-[13px] text-ink-3 leading-snug">
                    {t.description}
                  </span>
                </div>
                <ArrowRight
                  className="h-5 w-5 shrink-0 text-ink-4 transition-all
                             group-hover:text-gold group-hover:translate-x-1"
                  strokeWidth={1.75}
                />
              </motion.button>
            ))}
          </nav>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-between text-[11px] font-mono text-ink-4">
          <span>v1.0</span>
          <span className="tracking-[0.12em] uppercase">Local · single user</span>
        </div>
      </motion.aside>

      {/* ── Right column: looping video ─────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 min-w-0 relative bg-jet overflow-hidden"
      >
        <video
          src="/videos/landing.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Subtle vignette so any UI text overlaying later would still read,
            and to soften the edges where video meets the left column. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(120% 100% at 100% 50%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.45) 100%)",
          }}
        />
      </motion.div>
    </div>
  )
}
