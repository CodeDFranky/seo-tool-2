import { useEffect, useState, type ReactNode } from "react"
import { motion } from "framer-motion"

import { initBackend } from "@/lib/backend"
import { SplashScreen } from "@/components/SplashScreen"

/**
 * Mounts `children` only AFTER the Python sidecar has announced its port
 * (or immediately in web/dev where there is no sidecar).
 *
 * In Tauri: the main window is hidden by Rust until both the sidecar and
 * the React app are ready. Once `initBackend()` resolves we invoke the
 * `frontend_ready` Tauri command so Rust can close the OS-level splash
 * window and show the main window. No in-window splash is needed here —
 * the user is looking at the dedicated splash window during this gap.
 *
 * In web/dev: there's no Tauri splash window, so the in-window
 * SplashScreen still gets rendered and crossfaded out the usual way.
 */
export function BackendGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await initBackend()
      if (cancelled) return
      setReady(true)
      // Signal Rust that the React tree is mounted. Rust holds the main
      // window hidden and the splash window visible until both this and
      // the BACKEND_PORT handshake have fired, then swaps them. No-op in
      // web/dev where __TAURI_INTERNALS__ is undefined.
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        try {
          const { invoke } = await import("@tauri-apps/api/core")
          await invoke("frontend_ready")
        } catch {
          /* harmless — older builds without the command will just ignore it */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const inTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

  return (
    <div className="h-screen w-screen overflow-hidden bg-page relative">
      {ready && children}
      {!inTauri && (
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
      )}
    </div>
  )
}
