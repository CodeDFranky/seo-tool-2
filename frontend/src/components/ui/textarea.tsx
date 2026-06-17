import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[72px] w-full border border-transparent bg-surface-2 px-3 py-2 text-[13px] text-ink",
        "transition-[border-color,background-color] duration-150",
        "placeholder:text-ink-4",
        "hover:bg-surface-3/70",
        "focus-visible:outline-none focus-visible:border-gold focus-visible:bg-page",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
