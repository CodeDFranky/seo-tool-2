import * as React from "react"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-surface-2 animate-[skeleton-breathe_2.4s_ease-in-out_infinite]", className)}
      {...props}
    />
  )
}

export { Skeleton }
