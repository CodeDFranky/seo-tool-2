import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

type TooltipContentProps = React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Content
> & {
  /**
   * Optional shortcut shown on the right side of the bubble, rendered
   * via `Kbd`. Accepts chord notation: "left", "cmd+k", "shift+enter".
   */
  shortcut?: string
  /**
   * `default` (sentence case, 12px medium) for short imperative or prose.
   * `chip` for the rare case where a tracked-uppercase micro-label is
   * the right voice (e.g. on a corner annotation button).
   */
  tone?: "default" | "chip"
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 6, children, shortcut, tone = "default", ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      // Surface — square, dark, hairline border, no shadow.
      "z-50 inline-flex items-center gap-2 bg-jet border border-line-strong px-2 py-1",
      "text-ink-on-jet",
      tone === "chip"
        ? "text-[10.5px] uppercase tracking-[0.10em] font-semibold"
        : "text-[12px] font-medium tracking-[-0.003em]",
      // Radix-driven animation, intentionally subtle.
      "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
      "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
      "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
      className
    )}
    {...props}
  >
    <span className="whitespace-nowrap">{children}</span>
    {shortcut && (
      <>
        <span aria-hidden className="h-3 w-px bg-white/15" />
        <Kbd keys={shortcut} size="sm" />
      </>
    )}
  </TooltipPrimitive.Content>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
