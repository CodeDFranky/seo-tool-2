import { useEffect, useState } from "react"

/**
 * Subscribe to a CSS media query and re-render when it flips.
 *
 * SSR-safe via the function-form initial state — we only touch
 * `window.matchMedia` if the global exists. In Tauri / Vite dev / web
 * browsers it always does.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    // Sync once in case the query result changed between render and effect.
    setMatches(mql.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [query])

  return matches
}
