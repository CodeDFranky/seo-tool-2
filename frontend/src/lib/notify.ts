/**
 * Thin wrapper around `@tauri-apps/plugin-notification` that no-ops outside
 * the Tauri shell (dev browser, web preview) so callers don't have to guard.
 *
 * Permission is requested lazily on first call. Once granted, the OS keeps
 * the grant across launches; once denied, the call falls through silently
 * rather than nagging on every event.
 */

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

async function ensurePermission(): Promise<boolean> {
  if (!inTauri()) return false
  const { isPermissionGranted, requestPermission } = await import(
    "@tauri-apps/plugin-notification"
  )
  if (await isPermissionGranted()) return true
  const status = await requestPermission()
  return status === "granted"
}

export async function notify(title: string, body?: string): Promise<void> {
  if (!inTauri()) return
  const ok = await ensurePermission()
  if (!ok) return
  const { sendNotification } = await import("@tauri-apps/plugin-notification")
  sendNotification({ title, body })
}
