import * as React from "react"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

export interface ShortcutItem {
  /**
   * A chord or set of equivalent keys.
   *  - "cmd+k"       → renders [⌘]+[K]
   *  - ["left","right"] (or "left,right") → renders [←] [→] as alternates
   */
  keys: string | string[]
  /** Action description, shown after the keys. */
  label: string
}

interface ShortcutHintProps extends React.HTMLAttributes<HTMLDivElement> {
  items: ShortcutItem[]
  /** `sm` for inline placement; `md` for help surfaces. */
  size?: "sm" | "md"
  /** Layout alignment. */
  align?: "start" | "center" | "end"
}

function parseAlternates(keys: string | string[]): string[] {
  if (Array.isArray(keys)) return keys.filter(Boolean)
  return keys.split(",").map((k) => k.trim()).filter(Boolean)
}

/**
 * Quiet horizontal row that pairs keys with their action labels.
 * Use for "discoverable but unobtrusive" shortcut hints in modals,
 * dialog footers, and side panels.
 */
export function ShortcutHint({
  items, size = "sm", align = "center", className, ...rest
}: ShortcutHintProps) {
  const labelSize = size === "sm" ? "text-[12px]" : "text-[12.5px]"
  const gap = size === "sm" ? "gap-1.5" : "gap-2"
  const groupGap = size === "sm" ? "gap-3" : "gap-4"
  const alignCls =
    align === "start" ? "justify-start"
    : align === "end" ? "justify-end"
    : "justify-center"

  return (
    <div
      className={cn(
        "flex flex-wrap items-center select-none",
        groupGap, alignCls, className
      )}
      {...rest}
    >
      {items.map((item, i) => {
        const alts = parseAlternates(item.keys)
        return (
          <div key={i} className={cn("flex items-center", gap)}>
            <span className="inline-flex items-center gap-0.5">
              {alts.map((chord, j) => (
                <Kbd key={`${chord}-${j}`} keys={chord} size={size} />
              ))}
            </span>
            <span
              className={cn(
                "font-medium tracking-[-0.003em] text-ink-3",
                labelSize
              )}
            >
              {item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
