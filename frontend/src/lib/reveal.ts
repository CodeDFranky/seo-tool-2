/**
 * Reveal a file in the OS file manager via tauri-plugin-shell.
 *
 * In dev/web (no Tauri runtime) we degrade to copying the path to the
 * clipboard so the user can paste it into their file manager manually.
 *
 * `open` against the parent directory works cross-platform (Explorer on
 * Windows, Finder on macOS, the default file manager on Linux) without
 * needing the more permissive "select" form (`explorer /select,<file>`),
 * which would require a different capability wildcard.
 */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

export async function revealInFolder(path: string): Promise<void> {
  if (!inTauri()) {
    // No native shell access in the browser. Best we can do is copy.
    try {
      await navigator.clipboard.writeText(path)
    } catch {
      /* ignore */
    }
    return
  }
  const { open } = await import("@tauri-apps/plugin-shell")
  // Strip the trailing path component so we end up at the parent folder.
  // Handles both POSIX and Windows separators.
  const parent = path.replace(/[\\/][^\\/]+$/, "")
  await open(parent || path)
}

export async function copyPath(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path)
  } catch {
    /* ignore */
  }
}
