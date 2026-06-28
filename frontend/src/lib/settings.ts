/**
 * Tiny typed wrapper around localStorage for persistent app settings.
 *
 * Settings are written under the `dfr:settings:<key>` namespace and emit a
 * `dfr:settings-changed` window event so multiple subscribers (e.g. the
 * Settings dialog and the save pipeline) stay in sync without prop-drilling.
 */
import { useEffect, useState } from "react"

const STORAGE_PREFIX = "dfr:settings:"

export interface Settings {
  defaultDownloadDir: string | null
}

const DEFAULTS: Settings = {
  defaultDownloadDir: null,
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (raw === null) return DEFAULTS[key]
    return JSON.parse(raw) as Settings[K]
  } catch {
    return DEFAULTS[key]
  }
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(STORAGE_PREFIX + key)
    } else {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
    }
    window.dispatchEvent(new CustomEvent("dfr:settings-changed", { detail: { key } }))
  } catch {
    /* localStorage unavailable, no-op */
  }
}

/** React hook variant — re-renders the consumer on any settings change. */
export function useSetting<K extends keyof Settings>(
  key: K,
): [Settings[K], (v: Settings[K]) => void] {
  const [value, setValue] = useState<Settings[K]>(() => getSetting(key))
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: keyof Settings } | undefined
      if (!detail || detail.key === key) setValue(getSetting(key))
    }
    window.addEventListener("dfr:settings-changed", onChange)
    return () => window.removeEventListener("dfr:settings-changed", onChange)
  }, [key])
  return [value, (v) => setSetting(key, v)]
}
