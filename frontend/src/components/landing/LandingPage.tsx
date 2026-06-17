import { motion, type Variants } from "framer-motion"
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
    description: "YouTube and Vimeo metadata, previews, thumbnails, drag-out.",
  },
]

// Cinema timing: slow video reveal, then the panel rides in.
const panelVariants: Variants = {
  hidden:   { opacity: 0, x: -32, filter: "blur(8px)" },
  visible:  { opacity: 1, x: 0,   filter: "blur(0px)" },
}

const entryVariants: Variants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export function LandingPage({ onEnter }: LandingPageProps) {
  return (
    <div className="h-screen w-screen bg-jet text-ink-on-jet overflow-hidden">
      {/* Full-bleed video frame: relative parent for the video, overlays,
          and the glass nav panel. Edge to edge — no frame, no nesting. */}
      <div className="relative h-full w-full overflow-hidden bg-jet">
          {/* ── Background video ──────────────────────────────────── */}
          <motion.video
            src="/videos/landing.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Directional dim: heavier on the left under the nav panel so
              the type lands clean; tapers to about 22% black on the right
              so the video stays watchable, not just a tinted plate. */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0.32) 60%, rgba(0,0,0,0.22) 100%)",
            }}
          />
          {/* Top-to-bottom vignette anchors the brand mark and footer line. */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 78%, rgba(0,0,0,0.55) 100%)",
            }}
          />

          {/* ── Glass nav panel ───────────────────────────────────── */}
          <motion.aside
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
            className={[
              "absolute inset-y-0 left-0",
              // ~38% of the frame, with sane bounds so it never collapses
              // or eats the whole video on narrow viewports.
              "w-full max-w-[560px] sm:w-[clamp(420px,38%,560px)]",
              // Single deliberate glass moment: bg-jet at low alpha,
              // backdrop-blur for the lens effect, saturation pumped
              // slightly so the video's color life still bleeds through.
              "bg-jet/30",
              "[backdrop-filter:blur(24px)_saturate(140%)]",
              "[-webkit-backdrop-filter:blur(24px)_saturate(140%)]",
              // Hairline meeting the video on the right edge — floating
              // UI earns its border. White at low alpha so it reads as
              // light catching a glass edge, not a drawn rule.
              "border-r border-white/10",
              // Vertical layout for brand / hero+nav / footer.
              "flex flex-col px-7 py-7 sm:px-9 sm:py-8 lg:px-11 lg:py-10",
            ].join(" ")}
          >
            {/* Brand mark */}
            <motion.div
              variants={entryVariants}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.55 }}
              className="flex items-center gap-2.5"
            >
              <div className="h-8 w-8 overflow-hidden border border-white/15">
                <img src={dfrLogo} alt="" className="h-full w-full object-cover" />
              </div>
              <span className="text-[12.5px] font-medium tracking-[0.16em] uppercase text-ink-on-jet">
                DFR Toolkit
              </span>
            </motion.div>

            {/* Hero + tool nav */}
            <div className="flex-1 flex flex-col justify-center gap-10 max-w-[460px]">
              <div className="flex flex-col gap-4">
                <motion.p
                  variants={entryVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.7 }}
                  className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold"
                >
                  Workbench
                </motion.p>
                <motion.h1
                  variants={entryVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.78 }}
                  className="text-[clamp(36px,4.4vw,52px)] font-semibold tracking-[-0.026em]
                             leading-[1.04] text-balance text-ink-on-jet"
                >
                  Two tools for the parts of the day that aren&apos;t building.
                </motion.h1>
                <motion.p
                  variants={entryVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.92 }}
                  className="text-[14px] leading-relaxed max-w-[42ch] text-white/72"
                >
                  Pick one. Switch any time from the top bar. The mark up there
                  brings you back to this screen.
                </motion.p>
              </div>

              <nav className="flex flex-col">
                {TOOLS.map((t, i) => (
                  <motion.button
                    key={t.id}
                    type="button"
                    variants={entryVariants}
                    initial="hidden"
                    animate="visible"
                    transition={{
                      duration: 0.5,
                      delay: 1.08 + i * 0.1,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    onClick={() => onEnter(t.id)}
                    className="group relative flex items-center justify-between gap-6 py-5 text-left
                               transition-colors hover:bg-white/[0.04] -mx-3 px-3
                               focus-visible:outline-none focus-visible:bg-white/[0.06]"
                  >
                    {/* Vertical tick that grows on hover — replaces the
                        last-of-type-border ladder; reads as an interactive
                        affordance rather than scaffolding. */}
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-0 w-px bg-gold
                                 transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
                                 group-hover:h-8 group-focus-visible:h-8"
                    />
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-[22px] font-semibold tracking-[-0.018em]
                                       text-ink-on-jet transition-colors group-hover:text-gold
                                       leading-tight">
                        {t.title}
                      </span>
                      <span className="text-[13px] leading-snug text-white/60">
                        {t.description}
                      </span>
                    </div>
                    <ArrowRight
                      className="h-5 w-5 shrink-0 text-white/40 transition-all duration-300
                                 ease-[cubic-bezier(0.16,1,0.3,1)]
                                 group-hover:text-gold group-hover:translate-x-1"
                      strokeWidth={1.75}
                    />
                  </motion.button>
                ))}
              </nav>
            </div>

            {/* Footer */}
            <motion.div
              variants={entryVariants}
              initial="hidden"
              animate="visible"
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 1.35 }}
              className="flex items-end justify-between text-[11px] font-mono text-white/45"
            >
              <span>v1.0</span>
              <span className="tracking-[0.16em] uppercase">Local · single user</span>
            </motion.div>
          </motion.aside>
        </div>
    </div>
  )
}
