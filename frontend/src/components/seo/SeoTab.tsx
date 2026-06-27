import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Copy, Search, X, ChevronRight, Type, Eraser } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StateSelect } from "@/components/seo/StateSelect"
import {
  generateSeoTitles,
  titleCase,
  sentenceCase,
  type GroupedTitles,
  type SeoTitle,
} from "@/lib/seoTitles"
import { cn } from "@/lib/utils"

function CharCounter() {
  const [text, setText] = useState("")
  const count = text.replace(/\s+/g, " ").trim().length
  const status: "good" | "warn" | "idle" =
    count === 0 ? "idle" : count >= 45 && count <= 60 ? "good" : "warn"

  function transform(fn: (t: string) => string) {
    setText(fn(text.replace(/\s+/g, " ").trim()))
  }

  return (
    <div className="bg-surface-2 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <Label className="text-[13px] font-medium text-ink-2">
          Character counter
        </Label>
        <span
          className={cn(
            "tabular-nums text-[11px] font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 font-mono",
            status === "good" && "bg-good/18 text-good",
            status === "warn" && "bg-warn/18 text-warn",
            status === "idle" && "bg-surface-3 text-ink-3"
          )}
        >
          {count}
          <span className="opacity-50">/ 60</span>
        </span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste text to count or transform"
        className="min-h-[70px] resize-none border-0 bg-transparent hover:bg-transparent focus-visible:bg-transparent"
      />
      <div className="flex flex-wrap gap-1 px-2 py-2 bg-surface">
        {(["lower", "UPPER", "Sentence", "Title"] as const).map((label) => (
          <button
            key={label}
            onClick={() => {
              if (label === "lower") transform((t) => t.toLowerCase())
              else if (label === "UPPER") transform((t) => t.toUpperCase())
              else if (label === "Sentence") transform(sentenceCase)
              else transform(titleCase)
            }}
            className="px-2 h-6 text-[11px] font-medium bg-surface-3/60 text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors"
          >
            {label}
          </button>
        ))}
        {text && (
          <button
            onClick={() => setText("")}
            aria-label="Clear text"
            className="ml-auto inline-flex items-center gap-1 px-1.5 h-6 text-[11px] text-ink-3 hover:text-ink transition-colors"
          >
            <Eraser className="h-3 w-3" /> clear
          </button>
        )}
      </div>
    </div>
  )
}

function TitleRow({ title }: { title: SeoTitle }) {
  const good = title.characterCount >= 45 && title.characterCount <= 60

  function copy() {
    navigator.clipboard.writeText(title.title)
    toast.success("Copied", { description: title.title, duration: 1500 })
  }

  return (
    <button
      onClick={copy}
      className="group relative w-full flex items-center gap-3 pl-3 pr-2.5 py-2 text-left text-[14px] leading-snug text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/50"
    >
      <span
        className={cn(
          "shrink-0 inline-flex items-center justify-center min-w-[30px] h-[18px] px-1 text-[11px] font-semibold tabular-nums font-mono",
          good
            ? "bg-good/18 text-good"
            : "bg-warn/18 text-warn"
        )}
      >
        {title.characterCount}
      </span>
      <span className="flex-1 truncate">{title.title}</span>
      <Copy className="h-3.5 w-3.5 shrink-0 text-ink-4 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
    </button>
  )
}

function TitleGroup({ name, titles }: { name: string; titles: SeoTitle[] }) {
  const [open, setOpen] = useState(true)
  const good = titles.filter((t) => t.characterCount >= 45 && t.characterCount <= 60).length

  return (
    <section className="bg-surface overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <motion.div
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="text-ink-4"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </motion.div>
          <h3 className="text-[17px] font-semibold tracking-[-0.012em] text-ink truncate leading-[1.35]">
            {name}
          </h3>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 text-[11px] tabular-nums font-mono">
          {good > 0 && (
            <span className="text-good font-medium">{good} ideal</span>
          )}
          <span className="text-ink-4">{titles.length}</span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col px-1 pb-1">
              {titles.map((t, i) => (
                <TitleRow key={i} title={t} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="text-bad/80 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

function Toggle({
  id, label, checked, onChange,
}: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 cursor-pointer select-none">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
    </label>
  )
}

export function SeoTab() {
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [state, setState] = useState("")
  const [solo, setSolo] = useState(true)
  const [abbrState, setAbbrState] = useState(false)
  const [abbrRe, setAbbrRe] = useState(false)
  const [search, setSearch] = useState("")
  const [showCounter, setShowCounter] = useState(false)
  const [isOtherState, setIsOtherState] = useState(false)

  const hasValues = !!(name.trim() && location.trim() && state.trim())
  const hasAny = !!(name || location || state)

  const grouped: GroupedTitles | null = useMemo(() => {
    if (!hasValues) return null
    return generateSeoTitles(
      {
        clientName: name.trim(),
        clientLocation: location.trim(),
        clientState: state.trim(),
        solo,
        stateAbbreviated: abbrState,
        reAbbreviated: abbrRe,
      },
      search.trim() || undefined
    )
  }, [name, location, state, solo, abbrState, abbrRe, search, hasValues])

  const groups = grouped ? Object.entries(grouped) : []
  const total = groups.reduce((sum, [, t]) => sum + t.length, 0)
  const ideal = groups.reduce(
    (sum, [, t]) => sum + t.filter((x) => x.characterCount >= 45 && x.characterCount <= 60).length,
    0
  )

  return (
    <div className="h-full overflow-y-auto bg-page">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Title row */}
        <header className="flex items-end justify-between mb-9">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.022em] text-ink leading-[1.2]">
              SEO title generator
            </h1>
            <p className="text-[14px] text-ink-2 mt-1.5 tracking-[-0.005em]">
              Generate listing-friendly title variants for real-estate agents.
            </p>
          </div>
          {hasAny && (
            <button
              onClick={() => { setName(""); setLocation(""); setState(""); setIsOtherState(false) }}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </header>

        {/* Inputs panel — bg-surface step alone is the boundary */}
        <div className="bg-surface p-5 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_minmax(220px,280px)] gap-3">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            </Field>
            <Field label="Location" required>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Austin" />
            </Field>
            <Field label="State" required>
              <StateSelect
                value={state}
                onChange={setState}
                isOther={isOtherState}
                onIsOtherChange={setIsOtherState}
              />
            </Field>
          </div>

          <div className="h-px bg-line" />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <Toggle id="solo-switch" label={solo ? "Solo agent" : "Team"} checked={!solo} onChange={(v) => setSolo(!v)} />
            <Toggle id="abbr-state" label="Abbreviate state" checked={abbrState} onChange={setAbbrState} />
            <Toggle id="abbr-re" label="Abbreviate Real Estate" checked={abbrRe} onChange={setAbbrRe} />

            <button
              onClick={() => setShowCounter((v) => !v)}
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 text-[12.5px] font-medium transition-colors",
                showCounter
                  ? "bg-gold/20 text-gold-deep"
                  : "bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink"
              )}
            >
              <Type className="h-3.5 w-3.5" /> Counter
            </button>
          </div>

          <AnimatePresence initial={false}>
            {showCounter && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <CharCounter />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Search + stats bar */}
        <div className="mt-7 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-4" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter titles"
              className="pl-8 pr-8 h-9"
              disabled={!hasValues}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <AnimatePresence>
            {hasValues && (
              <motion.div
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 4 }}
                className="text-[12.5px] text-ink-3 tabular-nums font-mono"
              >
                <span className="text-good font-semibold">{ideal}</span>
                <span className="text-ink-4"> / </span>
                <span className="text-ink-2">{total}</span>
                <span className="ml-1">ideal</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Results */}
        <div className="mt-4 flex flex-col gap-3 pb-12">
          {!hasValues && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-[14px] text-ink-2 py-16 leading-relaxed"
            >
              Fill in <span className="text-ink-2 font-medium">Name</span>, <span className="text-ink-2 font-medium">Location</span>, and <span className="text-ink-2 font-medium">State</span> to start generating titles.
            </motion.p>
          )}
          {hasValues && groups.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-[14px] text-ink-2 py-16 leading-relaxed"
            >
              No titles match <span className="font-mono text-ink-2">"{search.trim()}"</span>.
            </motion.p>
          )}
          {hasValues && groups.length > 0 && groups.map(([groupName, titles], i) => (
            <motion.div
              key={groupName}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
            >
              <TitleGroup name={groupName} titles={titles} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
