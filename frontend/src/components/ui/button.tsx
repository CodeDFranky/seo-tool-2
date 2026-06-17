import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[13px] font-semibold tracking-[-0.003em] " +
  "transition-[background-color,border-color,color,transform] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-page " +
  "active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:     "btn-gold",
        destructive: "bg-bad text-white border border-bad hover:bg-bad/90",
        outline:     "border border-line bg-page text-ink hover:bg-surface-2 hover:border-line-strong",
        secondary:   "bg-surface-2 text-ink hover:bg-surface-3",
        ghost:       "text-ink-2 hover:bg-surface-2 hover:text-ink",
        link:        "text-ink underline underline-offset-4 hover:text-gold-deep",
      },
      size: {
        default: "h-9 px-4",
        sm:      "h-8 px-3 text-[12.5px]",
        lg:      "h-10 px-6 text-[14px]",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
