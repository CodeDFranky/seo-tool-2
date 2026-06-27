import { useEffect, useState, type ReactNode } from "react"
import { motion } from "framer-motion"

import { initBackend } from "@/lib/backend"
import { SplashScreen } from "@/components/SplashScreen"

/**
 * Mounts `children` only AFTER the Python sidecar has announced its port
 * (or immediately in web/dev where there is no sidecar). The splash sits
 * on top during the gap and crossfades out once we're ready.
 *
 * Stacking children behind the splash (rather than gating with AnimatePresence)
 * lets the app paint its first frame while the splash is still fading,
 * which kills any visible flicker between the two.
 */
export function BackendGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void initBackend().then(() => {
      if (!cancelled) setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-page relative">
      {ready && children}
      <motion.div
        initial={false}
        animate={{ opacity: ready ? 0 : 1 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        style={{ pointerEvents: ready ? "none" : "auto" }}
        aria-hidden={ready}
        className="absolute inset-0 z-50"
      >
        <SplashScreen />
      </motion.div>
    </div>
  )
}
