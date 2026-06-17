"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Platform-aligned toasts: jet surface, hairline border (floating UI
 * earns one), square corners, no shadow, sentence-case typography.
 * Type accent lives on the leading icon only — no rich-colored
 * backgrounds.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: [
            "!rounded-none !shadow-none !font-sans",
            "!bg-jet !text-ink !border !border-line-soft",
            "!min-h-0 !py-3 !px-3.5 !gap-2.5",
            "!tracking-[-0.003em]",
          ].join(" "),
          title: "!text-[13px] !font-medium !text-ink !leading-snug",
          description: "!text-[12px] !text-ink-3 !mt-0.5 !leading-snug",
          icon: "!ml-0",
          closeButton: [
            "!bg-jet !border-0 !text-ink-4 hover:!text-ink",
            "!rounded-none !left-auto !right-2 !top-2 !w-5 !h-5",
            "!transition-colors",
          ].join(" "),
          actionButton: [
            "!bg-gold !text-gold-ink !rounded-none !font-semibold",
            "!text-[12px] !px-2.5 !py-1 !h-7 !tracking-[-0.003em]",
            "hover:!bg-gold-2",
          ].join(" "),
          cancelButton: [
            "!bg-surface-2 !text-ink-2 !rounded-none !font-medium",
            "!text-[12px] !px-2.5 !py-1 !h-7",
            "hover:!bg-surface-3",
          ].join(" "),
        },
        duration: 3200,
      }}
      style={
        {
          // Same jet surface for every type — differentiation lives in the
          // colored icon. Borders stay neutral so we don't end up with
          // five different toast outlines.
          "--normal-bg":     "hsl(var(--jet))",
          "--normal-border": "hsl(var(--line-soft))",
          "--normal-text":   "hsl(var(--ink))",
          "--success-bg":     "hsl(var(--jet))",
          "--success-border": "hsl(var(--line-soft))",
          "--success-text":   "hsl(var(--good))",
          "--error-bg":     "hsl(var(--jet))",
          "--error-border": "hsl(var(--line-soft))",
          "--error-text":   "hsl(var(--bad))",
          "--warning-bg":     "hsl(var(--jet))",
          "--warning-border": "hsl(var(--line-soft))",
          "--warning-text":   "hsl(var(--warn))",
          "--info-bg":     "hsl(var(--jet))",
          "--info-border": "hsl(var(--line-soft))",
          "--info-text":   "hsl(var(--gold))",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
