import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, FileText, Plus, Receipt, StickyNote, Users } from 'lucide-react'
import { pmvMotion } from '../../lib/motionTheme'
import { btnPrimary } from './ui'

// Contextual "New" menu on the client detail header. Consolidates the
// create-shaped actions that were previously buried on a subtab (New
// invoice on Billing, New quote on Billing) or required a separate page
// (Manage records). One click from any client tab to any create flow.
//
// Deliberately no server calls in this component - every entry is a
// deep link that carries the client context via query params so the
// target module opens with the client pre-selected.

export interface ClientActionsMenuProps {
  clientId: string
  clientRef: string
  buildBaseHref: (segment: string) => string
}

export function ClientActionsMenu({ clientId, clientRef, buildBaseHref: p }: ClientActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const clientQuery = `?client=${encodeURIComponent(clientId)}`

  const items: Array<{ label: string; hint: string; to: string; icon: typeof FileText }> = [
    { label: 'New invoice',        hint: 'Prefilled with this client',           to: `${p('invoices')}${clientQuery}`,                    icon: Receipt },
    { label: 'New quote',          hint: 'Draft a branded proposal',             to: `${p('quotes')}${clientQuery}`,                      icon: FileText },
    { label: 'Add internal note',  hint: 'Staff-only - never visible to client', to: p(`clients/${clientRef}/activity`),                  icon: StickyNote },
    { label: 'Manage full record', hint: 'Services, matters, tasks, documents',  to: p(`clients/${clientRef}/manage`),                    icon: Users },
  ]

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Create a new record for this client"
        className={btnPrimary}
      >
        <Plus size={14} /> New
        <ChevronDown size={13} className={`ml-0.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.985 }}
            transition={pmvMotion.ui}
            role="menu"
            aria-label="Client actions"
            className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-lg border border-white/10 bg-navy-900 shadow-2xl"
          >
            <div className="border-b border-white/10 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-gold">Create for this client</p>
              <p className="mt-1 text-xs text-slate-500">Each action opens with the client pre-selected.</p>
            </div>
            {items.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 border-b border-white/[.04] px-3 py-2.5 text-sm text-slate-200 transition last:border-b-0 hover:bg-white/[.04] hover:text-white"
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gold/10 text-gold">
                  <item.icon size={15} />
                </span>
                <span className="min-w-0">
                  <strong className="block font-semibold">{item.label}</strong>
                  <small className="text-[11px] leading-4 text-slate-500">{item.hint}</small>
                </span>
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
