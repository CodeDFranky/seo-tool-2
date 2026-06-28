/**
 * Save a Blob to disk. In Tauri, opens a native Save-As dialog and writes
 * via the fs plugin. In a regular browser (dev), falls back to the
 * <a download>.click() pattern.
 *
 * Dynamic-imports the Tauri plugins so web builds don't bundle them — same
 * pattern as lib/backend.ts.
 */
export type SaveResult = "saved" | "cancelled"

export interface SaveFilter {
  name: string
  extensions: string[]
}

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function saveBlob(
  blob: Blob,
  defaultName: string,
  filters?: SaveFilter[]
): Promise<SaveResult> {
  if (inTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog")
    const { writeFile } = await import("@tauri-apps/plugin-fs")
    const path = await save({
      defaultPath: defaultName,
      filters,
    })
    if (!path) return "cancelled"
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await writeFile(path, bytes)
    return "saved"
  }

  // Web/dev fallback
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = defaultName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return "saved"
}
