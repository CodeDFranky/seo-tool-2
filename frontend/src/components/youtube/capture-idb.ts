/**
 * Tiny IndexedDB store for capture blobs. ~40 lines of plumbing so the
 * history survives a page reload.
 */

const DB_NAME = "dfr-toolkit"
const DB_VERSION = 1
const STORE = "captures"

export interface StoredCapture {
  id: string
  blob: Blob
  filename: string
  atTime: number
  videoId: string
  videoTitle?: string
  capturedAt: number
  /** Optional for back-compat with already-stored captures. */
  origin?: "manual" | "auto"
}

// Cached connection. IndexedDB.open() is non-trivial at the OS level
// (each call goes through versioning checks), so we open once per session
// and reuse the same handle across all reads/writes. With auto-prefetch
// firing 6 writes per modal open, this avoids 6 OS-level open calls in
// quick succession.
let cachedDb: IDBDatabase | null = null
let opening: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (cachedDb) return Promise.resolve(cachedDb)
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" })
      }
    }
    req.onsuccess = () => {
      cachedDb = req.result
      // If the browser ever forcibly closes the connection (e.g. another
      // tab triggers an upgrade), drop the cache so the next call reopens.
      cachedDb.onclose = () => { cachedDb = null }
      cachedDb.onversionchange = () => { cachedDb?.close(); cachedDb = null }
      opening = null
      resolve(req.result)
    }
    req.onerror = () => {
      opening = null
      reject(req.error)
    }
  })
  return opening
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const store = transaction.objectStore(STORE)
    const req = fn(store)
    transaction.oncomplete = () => resolve(req?.result as T | undefined)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function idbLoadAll(): Promise<StoredCapture[]> {
  const result = await tx<StoredCapture[]>("readonly", (s) => s.getAll())
  // Sort newest first.
  return (result ?? []).sort((a, b) => b.capturedAt - a.capturedAt)
}

export async function idbPut(c: StoredCapture): Promise<void> {
  await tx("readwrite", (s) => s.put(c))
}

export async function idbDelete(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id))
}

export async function idbClear(): Promise<void> {
  await tx("readwrite", (s) => s.clear())
}
