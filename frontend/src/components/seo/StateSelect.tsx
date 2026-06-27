import { useMemo, useState, useRef, useEffect } from "react"
import * as Popover from "@radix-ui/react-popover"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Search, X, Check } from "lucide-react"

import { Input } from "@/components/ui/input"
import { STATE_MAP } from "@/lib/seoTitles"
import { cn } from "@/lib/utils"

interface StateSelectProps {
  value: string
  onChange: (next: string) => void
  isOther: boolean
  onIsOtherChange: (next: boolean) => void
}

const ALL_STATES = Object.keys(STATE_MAP).sort()

export function StateSelect({ value, onChange, isOther, onIsOtherChange }: StateSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const otherInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ALL_STATES
    return ALL_STATES.filter(
      (s) => s.toLowerCase().includes(q) || STATE_MAP[s].toLowerCase().includes(q)
    )
  }, [query])

  useEffect(() => {
    if (!open) setQuery("")
    else setTimeout(() => searchInputRef.current?.focus(), 20)
  }, [open])

  useEffect(() => {
    if (isOther) setTimeout(() => otherInputRef.current?.focus(), 220)
  }, [isOther])

  const showOther = !query || "other".includes(query.trim().toLowerCase())
  const triggerLabel = isOther ? "Other" : value || "Select state"

  return (
    <div className="flex gap-2 min-w-0">
      <div
        className={cn(
          "overflow-hidden transition-[max-width,opacity] duration-300 ease-out min-w-0 flex-1",
          isOther ? "max-w-[420px] opacity-100" : "max-w-0 opacity-0 pointer-events-none"
        )}
      >
        <Input
          ref={otherInputRef}
          placeholder="Enter state"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          tabIndex={isOther ? 0 : -1}
          className="w-full"
        />
      </div>

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-9 items-center justify-between border border-transparent bg-surface-2 px-3 text-[13px] outline-none",
              "transition-[border-color,background-color] duration-150",
              "hover:border-line-strong hover:bg-surface-3/70",
              "data-[state=open]:border-gold data-[state=open]:bg-page",
              "focus-visible:border-gold focus-visible:bg-page",
              isOther ? "w-32 shrink-0" : "flex-1"
            )}
            aria-label="Select state"
          >
            <span className={cn(value || isOther ? "text-ink" : "text-ink-4")}>{triggerLabel}</span>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="ml-2 text-ink-4 shrink-0"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.span>
          </button>
        </Popover.Trigger>

        <AnimatePresence>
          {open && (
            <Popover.Portal forceMount>
              <Popover.Content
                forceMount
                sideOffset={6}
                align="end"
                className="z-50 outline-none"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  // Match the trigger's measured width so the dropdown
                  // sits flush with the State input. Radix sets this var
                  // on `Popover.Content`; the cascade reaches us here.
                  // `min-width` guards against tiny triggers where the
                  // search-states row would otherwise wrap awkwardly.
                  style={{ width: "var(--radix-popover-trigger-width)" }}
                  className="min-w-[240px] border border-line-soft bg-page overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-3 py-2 bg-surface-2">
                    <Search className="h-3.5 w-3.5 text-ink-4 shrink-0" />
                    <input
                      ref={searchInputRef}
                      placeholder="Search states"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-4 outline-none"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="text-ink-4 hover:text-ink-2"
                        aria-label="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {showOther && (
                      <button
                        type="button"
                        onClick={() => {
                          onIsOtherChange(true)
                          onChange("")
                          setOpen(false)
                        }}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-left transition-colors",
                          isOther
                            ? "bg-gold/15 text-gold-deep"
                            : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                        )}
                      >
                        <span>Other</span>
                        {isOther && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                      </button>
                    )}

                    {filtered.length === 0 && !showOther && (
                      <div className="px-3 py-6 text-center text-[12px] text-ink-4">
                        No states match "{query}"
                      </div>
                    )}

                    {filtered.map((stateName) => {
                      const selected = !isOther && value === stateName
                      return (
                        <button
                          key={stateName}
                          type="button"
                          onClick={() => {
                            onIsOtherChange(false)
                            onChange(stateName)
                            setOpen(false)
                          }}
                          className={cn(
                            "w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-left transition-colors",
                            selected
                              ? "bg-gold/15 text-gold-deep"
                              : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                          )}
                        >
                          <span>{stateName}</span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-[10.5px] font-mono tabular-nums text-ink-4">
                              {STATE_MAP[stateName]}
                            </span>
                            {selected && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              </Popover.Content>
            </Popover.Portal>
          )}
        </AnimatePresence>
      </Popover.Root>
    </div>
  )
}
