import { motion } from "framer-motion"
import dfrLogo from "@/assets/dfr.png"

/**
 * Shown in front of the app while the Tauri sidecar boots (~700ms cold).
 * Crossfades out the moment `backend-ready` fires.
 *
 * The hairline fills to 92% in 0.8s and parks. If the backend takes longer
 * than expected the bar holds at 92% — never lies about being done. If the
 * backend is already up (warm reload), the gate flips `ready` instantly and
 * the whole splash exits before the fill animation matters.
 */
export function SplashScreen() {
  return (
    <div className="absolute inset-0 bg-page flex flex-col items-center justify-center select-none">
      <div className="flex flex-col items-center gap-6">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="h-16 w-16 overflow-hidden border border-white/15"
        >
          <img
            src={dfrLogo}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        </motion.div>

        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.32 }}
          className="text-[12px] font-medium tracking-[0.18em] uppercase text-ink-2"
        >
          DFR Toolkit
        </motion.span>

        <div className="relative h-px w-32 bg-white/[0.07] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "92%" }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 left-0 bg-gold"
          />
        </div>
      </div>
    </div>
  )
}
