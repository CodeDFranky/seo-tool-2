import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center px-1.5 py-px text-[10.5px] font-semibold tracking-[0.06em] uppercase tabular-nums",
  {
    variants: {
      variant: {
        default:     "bg-gold/20 text-gold-deep",
        secondary:   "bg-surface-2 text-ink-2",
        destructive: "bg-bad/18 text-bad",
        outline:     "text-ink-2 border border-line",
        success:     "bg-good/18 text-good",
        warning:     "bg-warn/18 text-warn",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
