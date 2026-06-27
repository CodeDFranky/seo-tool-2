/**
 * Backend address resolution.
 *
 * In web/dev: the Vite proxy forwards `/api` and `/download-thumbnails` to
 * the locally-running Flask server on port 5000. Components fetch with
 * relative URLs and the proxy handles the rest.
 *
 * In Tauri: there is no proxy — the React bundle is served from
 * `tauri://localhost` and must hit the Python sidecar on whichever port
 * waitress claimed. The Rust side reads `BACKEND_PORT=<n>` from the
 * sidecar's stdout, stores it, and exposes it through both the
 * `backend-ready` event (fast path) and the `get_backend_port` command
 * (slow path / late mount).
 *
 * `initBackend()` resolves once we know where to send requests. Components
 * mount AFTER it resolves, so `apiUrl()` can be a plain synchronous
 * function with no race conditions.
 */

let backendOrigin = "" // empty = same-origin (web/dev with Vite proxy)

export function apiUrl(path: string): string {
  return backendOrigin + path
}

function inTauri(): boolean {
  // Tauri 2.x sets __TAURI_INTERNALS__ on the window before any user JS runs.
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

/**
 * Resolves with the live port once the Python sidecar has announced it.
 * No-op (immediate resolve) in web/dev where the Vite proxy is in play.
 */
export async function initBackend(): Promise<void> {
  if (!inTauri()) return

  const { invoke } = await import("@tauri-apps/api/core")
  const { listen } = await import("@tauri-apps/api/event")

  // Fast path: the sidecar's port may already be cached on the Rust side
  // (App startup → spawn_sidecar → first stdout line is BACKEND_PORT).
  const cached = await invoke<number | null>("get_backend_port")
  if (cached) {
    backendOrigin = `http://127.0.0.1:${cached}`
    return
  }

  // Slow path: wait for the `backend-ready` event. Holds the splash visible
  // until the sidecar finishes booting (~600–900ms on cold start).
  return new Promise<void>((resolve) => {
    listen<number>("backend-ready", (event) => {
      backendOrigin = `http://127.0.0.1:${event.payload}`
      resolve()
    })
  })
}
