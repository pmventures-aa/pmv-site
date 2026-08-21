import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { emailVariablesByCategory, type EmailVariable } from '../../../shared/emailVariables'

// A compact "Insert variable" dropdown for template editors. It lists every
// variable from the shared registry, grouped by category and searchable, and
// calls onInsert with the {{token}} form so the caller can drop it at the
// caret. Deliberately registry-driven so a new variable shows up everywhere at
// once with no per-editor wiring.
export function VariableInsertMenu({ onInsert, label = 'Insert variable', className = '' }: {
  onInsert: (token: string) => void
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    function onDown(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase()
    return emailVariablesByCategory()
      .map((group) => ({
        ...group,
        items: term
          ? group.items.filter((v) => `${v.label} ${v.key} ${v.description}`.toLowerCase().includes(term))
          : group.items,
      }))
      .filter((group) => group.items.length > 0)
  }, [query])

  function pick(v: EmailVariable) {
    onInsert(`{{${v.key}}}`)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/[.08] px-2.5 py-1 text-[11px] font-bold text-gold transition hover:bg-gold/15"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Plus size={12} /> {label} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-72 overflow-hidden rounded-lg border border-white/12 bg-navy-950 shadow-xl shadow-black/40">
          <div className="flex items-center gap-2 border-b border-white/10 px-2.5 py-2">
            <Search size={13} className="shrink-0 text-slate-500" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search variables…"
              className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {groups.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-500">No variables match “{query}”.</p>
            ) : groups.map((group) => (
              <div key={group.category} className="py-1">
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[.14em] text-gold/70">{group.label}</p>
                {group.items.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => pick(v)}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition hover:bg-white/[.05]"
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-100">{v.label}</span>
                      <code className="shrink-0 rounded bg-white/[.06] px-1 text-[10px] text-gold/80">{`{{${v.key}}}`}</code>
                    </span>
                    <span className="line-clamp-1 text-[10px] leading-4 text-slate-500">{v.description}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
