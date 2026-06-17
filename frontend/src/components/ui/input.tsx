import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full border border-transparent bg-surface-2 px-3 py-1 text-[13px] text-ink",
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
  }
)
Input.displayName = "Input"

export { Input }
