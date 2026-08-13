import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { lifecycleLabel } from '../../../shared/lifecycle'
import { useAppPath } from '../../lib/basePath'

interface ClientHit { id: string; full_name: string | null; email: string; business_name: string | null }
interface InquiryHit { id: string; name: string; email: string; phone: string | null; company_name: string | null; record_type: string; lifecycle_stage: string; status: string }
interface MatterHit { id: string; title: string; status: string; client_user_id: string; client_name: string | null; client_email: string }
interface InvoiceHit { id: string; amount_cents: number; status: string; client_user_id: string; client_name: string | null; client_email: string }
interface SearchResults { clients: ClientHit[]; inquiries: InquiryHit[]; matters: MatterHit[]; invoices: InvoiceHit[] }
const EMPTY: SearchResults = { clients: [], inquiries: [], matters: [], invoices: [] }

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function GlobalSearch({ className = '' }: { className?: string }) {
  const p = useAppPath()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onClickAway(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [])

  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) { setResults(EMPTY); return }
    setLoading(true)
    const t = setTimeout(() => {
      api.get<SearchResults>(`/admin/search?q=${encodeURIComponent(query)}`)
        .then(setResults).catch(() => setResults(EMPTY)).finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const hasAny = results.clients.length + results.inquiries.length + results.matters.length + results.invoices.length > 0
  const showPanel = open && q.trim().length >= 2
  function go() { setOpen(false); setQ(''); inputRef.current?.blur() }

  return (
    <div className={`relative ${className}`} ref={boxRef}>
      <input ref={inputRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder="Search clients, leads, businesses, work…" className="w-full rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/40 focus:outline-none" />
      {showPanel && <div className="absolute left-0 top-10 z-30 max-h-[28rem] w-96 overflow-y-auto rounded-md border border-white/10 bg-navy-900 shadow-lg">
        {loading ? <p className="px-4 py-6 text-center text-sm text-slate-400">Searching…</p> : !hasAny ? <p className="px-4 py-6 text-center text-sm text-slate-400">No matches for "{q.trim()}".</p> : <div className="divide-y divide-white/5">
          {results.clients.length > 0 && <SearchGroup label="Clients">{results.clients.map((r) => <Link key={r.id} to={p(`clients/${r.id}/overview`)} onClick={go} className="block px-4 py-2.5 text-sm hover:bg-white/5"><p className="text-slate-200">{r.full_name || r.email}</p><p className="text-xs text-slate-500">{r.business_name || r.email}</p></Link>)}</SearchGroup>}
          {results.inquiries.length > 0 && <SearchGroup label="Leads & Prospects">{results.inquiries.map((r) => <Link key={r.id} to={p(`leads/${r.id}/overview`)} onClick={go} className="block px-4 py-2.5 text-sm hover:bg-white/5"><p className="text-slate-200">{r.name}</p><p className="text-xs text-slate-500">{r.record_type === 'business' ? 'Business' : r.company_name || 'Person'} · {r.email} · {lifecycleLabel(r.lifecycle_stage)}</p></Link>)}</SearchGroup>}
          {results.matters.length > 0 && <SearchGroup label="Matters">{results.matters.map((r) => <Link key={r.id} to={p(`clients/${r.client_user_id}`)} onClick={go} className="block px-4 py-2.5 text-sm hover:bg-white/5"><p className="text-slate-200">{r.title}</p><p className="text-xs text-slate-500">{r.client_name || r.client_email} · {r.status.replace(/_/g, ' ')}</p></Link>)}</SearchGroup>}
          {results.invoices.length > 0 && <SearchGroup label="Invoices">{results.invoices.map((r) => <Link key={r.id} to={p(`clients/${r.client_user_id}`)} onClick={go} className="block px-4 py-2.5 text-sm hover:bg-white/5"><p className="text-slate-200">{money(r.amount_cents)}: {r.status.replace(/_/g, ' ')}</p><p className="text-xs text-slate-500">{r.client_name || r.client_email}</p></Link>)}</SearchGroup>}
        </div>}
      </div>}
    </div>
  )
}

function SearchGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>{children}</div>
}
