/**
 * Paint a source <img> onto an off-screen <canvas> and use that as the
 * drag preview. This avoids the browser's default "ghost" effect on the
 * floating image that follows the cursor — the canvas renders solid.
 *
 * For cross-origin images (e.g. YouTube CDN) the canvas may be tainted,
 * in which case drawImage throws and we fall back to using the <img>
 * element directly. The caller should add `crossOrigin="anonymous"` to
 * its <img> when the server permits it to avoid this fallback.
 */
export function setSolidDragImage(
  e: React.DragEvent<HTMLElement>,
  imgEl: HTMLImageElement | null
): void {
  if (!imgEl) return

  // Use the rendered (CSS) box, not the natural dimensions — that's what
  // the user expects the preview to look like.
  const w = imgEl.offsetWidth
  const h = imgEl.offsetHeight
  if (!w || !h || !imgEl.complete) {
    e.dataTransfer.setDragImage(imgEl, (w || 0) / 2, (h || 0) / 2)
    return
  }

  try {
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    canvas.style.position = "fixed"
    canvas.style.top = "-9999px"
    canvas.style.left = "-9999px"
    canvas.style.pointerEvents = "none"

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      e.dataTransfer.setDragImage(imgEl, w / 2, h / 2)
      return
    }
    // Will throw SecurityError if the source image is cross-origin
    // without proper CORS headers.
    ctx.drawImage(imgEl, 0, 0, w, h)

    document.body.appendChild(canvas)
    e.dataTransfer.setDragImage(canvas, w / 2, h / 2)
    // The browser snapshots the canvas synchronously inside
    // setDragImage, so we can detach on the next frame.
    requestAnimationFrame(() => canvas.remove())
  } catch {
    // Tainted canvas or other failure — use the in-DOM <img> directly.
    e.dataTransfer.setDragImage(imgEl, w / 2, h / 2)
  }
}
