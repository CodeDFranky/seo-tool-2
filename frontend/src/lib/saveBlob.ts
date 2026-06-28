/**
 * Save a Blob to disk. In Tauri, opens a native Save-As dialog and writes
 * via the fs plugin — unless a `defaultFolder` is provided, in which case
 * the dialog is skipped and the file is written directly to
 * `<defaultFolder>/<defaultName>`.
 *
 * In a regular browser (dev), falls back to the <a download>.click()
 * pattern; the browser controls the save location so we return a sentinel
 * path string for history-display purposes.
 *
 * Dynamic-imports the Tauri plugins so web builds don't bundle them — same
 * pattern as lib/backend.ts.
 */
export interface SaveFilter {
  name: string
  extensions: string[]
}

export type SaveResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" }

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function saveBlob(
  blob: Blob,
  defaultName: string,
  filters?: SaveFilter[],
  defaultFolder?: string | null,
): Promise<SaveResult> {
  if (inTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog")
    const { writeFile } = await import("@tauri-apps/plugin-fs")

    let path: string | null
    if (defaultFolder) {
      // Skip the dialog; compose the path manually. Path separator: use the
      // first separator we see in the folder string so a user-picked folder
      // works regardless of whether it came back Windows- or POSIX-style.
      const sep = defaultFolder.includes("\\") ? "\\" : "/"
      path = defaultFolder.replace(/[\\/]+$/, "") + sep + defaultName
    } else {
      path = await save({ defaultPath: defaultName, filters })
    }
    if (!path) return { status: "cancelled" }

    const bytes = new Uint8Array(await blob.arrayBuffer())
    await writeFile(path, bytes)
    return { status: "saved", path }
  }

  // Web/dev fallback — browser controls the save location, we don't get
  // to know it. Return a sentinel path string so callers that record this
  // in history still have something to display.
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = defaultName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { status: "saved", path: `(browser download: ${defaultName})` }
}
