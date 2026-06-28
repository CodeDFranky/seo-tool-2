/**
 * Persistent list of recent downloads, backed by localStorage.
 *
 * Capped at MAX_ENTRIES; oldest entries are dropped on overflow. Mutations
 * fire a `dfr:downloads-changed` window event so any number of subscribers
 * (panel, badge, etc.) re-render without prop-drilling.
 */
import { useEffect, useState } from "react"

const STORAGE_KEY = "dfr:download-history"
const MAX_ENTRIES = 100

export type DownloadKind = "thumbnail" | "batch-zip" | "frame"

export interface DownloadRecord {
  /** Unique id (crypto.randomUUID()). */
  id: string
  /** Basename, e.g. "v1_abcXYZ.jpg". */
  filename: string
  /** Absolute path the file was saved to. */
  path: string
  kind: DownloadKind
  /** Bytes — optional, fill if known. */
  size?: number
  /** Date.now() when the save completed. */
  savedAt: number
}

function load(): DownloadRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DownloadRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(records: DownloadRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_ENTRIES)))
    window.dispatchEvent(new Event("dfr:downloads-changed"))
  } catch {
    /* localStorage full / unavailable */
  }
}

export function recordDownload(rec: Omit<DownloadRecord, "id" | "savedAt">): DownloadRecord {
  const full: DownloadRecord = { ...rec, id: crypto.randomUUID(), savedAt: Date.now() }
  const current = load()
  save([full, ...current])
  return full
}

export function removeDownload(id: string): void {
  save(load().filter((r) => r.id !== id))
}

export function clearDownloads(): void {
  save([])
}

export const MAX_DOWNLOADS = MAX_ENTRIES

export function useDownloadHistory(): DownloadRecord[] {
  const [records, setRecords] = useState<DownloadRecord[]>(load)
  useEffect(() => {
    const onChange = () => setRecords(load())
    window.addEventListener("dfr:downloads-changed", onChange)
    return () => window.removeEventListener("dfr:downloads-changed", onChange)
  }, [])
  return records
}
