import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Maps friendly key names to their canonical display form.
 * Lowercase keys; resolved case-insensitively.
 */
const KEY_DISPLAY: Record<string, string> = {
  // Modifiers
  cmd: "⌘", meta: "⌘", super: "⌘",
  shift: "⇧",
  alt: "⌥", opt: "⌥", option: "⌥",
  ctrl: "Ctrl", control: "Ctrl",
  // Whitespace / actions
  enter: "↵", return: "↵",
  esc: "Esc", escape: "Esc",
  space: "Space",
  tab: "Tab",
  backspace: "⌫", delete: "⌫",
  // Arrows
  left: "←", arrowleft: "←",
  right: "→", arrowright: "→",
  up: "↑", arrowup: "↑",
  down: "↓", arrowdown: "↓",
}

/** Keys that visually want a slightly wider chip so the label "breathes". */
const WIDE_KEYS = new Set(["Space", "Esc", "Tab", "Ctrl"])

function normalizeSegment(seg: string): string {
  const trimmed = seg.trim()
  if (!trimmed) return ""
  const mapped = KEY_DISPLAY[trimmed.toLowerCase()]
  if (mapped) return mapped
  // Single character: upper-case it. Multi-char unknown: leave as typed (e.g. "F5").
  return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed
}

type KbdSize = "sm" | "md"

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /**
   * Chord notation: "k", "cmd+k", "shift+enter", "ctrl+alt+space". Joined by `+`.
   * When omitted, the component renders `children` directly inside a single chip.
   */
  keys?: string
  size?: KbdSize
}

/**
 * A pressed-key glyph. Use `keys` for chord notation; the component will
 * normalize names (`cmd` → ⌘, `left` → ←, ...) and render each segment in its
 * own chip separated by a faint `+`. Pass `children` for one-off content.
 */
export function Kbd({ keys, size = "sm", className, children, ...rest }: KbdProps) {
  // Per-chip and per-row sizing.
  const chip =
    size === "sm"
      ? "h-[16px] min-w-[16px] px-1 text-[9.5px] tracking-[0.08em]"
      : "h-[20px] min-w-[20px] px-1.5 text-[10.5px] tracking-[0.10em]"
  const chipWide = size === "sm" ? "min-w-[28px]" : "min-w-[34px]"
  const plus =
    size === "sm"
      ? "text-[9px] text-ink-4 mx-0.5"
      : "text-[10px] text-ink-4 mx-1"

  // Single segment (children or single key) path.
  const segments = React.useMemo(() => {
    if (!keys) return null
    return keys.split("+").map(normalizeSegment).filter(Boolean)
  }, [keys])

  // Quiet, annotation-weight surface. Uses currentColor-friendly tints so
  // the chip stays subtle on both the page surface and the dark tooltip bg.
  const chipSurface =
    "bg-white/[0.04] border border-white/[0.06] text-ink-3 font-medium"

  if (!segments) {
    return (
      <kbd
        className={cn(
          "inline-flex items-center justify-center font-mono uppercase select-none align-middle",
          chipSurface,
          chip,
          className
        )}
        {...rest}
      >
        {children}
      </kbd>
    )
  }

  return (
    <span
      className={cn("inline-flex items-center align-middle", className)}
      {...rest}
    >
      {segments.map((seg, i) => (
        <React.Fragment key={`${seg}-${i}`}>
          {i > 0 && <span className={cn("font-mono select-none", plus)}>+</span>}
          <kbd
            className={cn(
              "inline-flex items-center justify-center font-mono uppercase select-none",
              chipSurface,
              chip,
              WIDE_KEYS.has(seg) && chipWide
            )}
          >
            {seg}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  )
}
