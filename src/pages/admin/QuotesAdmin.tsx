import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { services } from '../../data/services'
import { ScopeIntakePicker } from '../../components/admin/ScopeIntakePicker'
import { quotePrefillFromScope } from '../../../shared/scopeIntakePrefill'
import { useAppPath } from '../../lib/basePath'
import {
  QUOTE_FOCUS,
  quoteEventLabel,
  quoteIdleLabel,
  quoteMatchesFocus,
  quoteMoney,
  quoteNextAction,
  quoteStatusLabel,
  quoteStatusTone,
  type QuoteFocusKey,
} from '../../../shared/quoteWorkspace'

interface QuoteRow {
  id: string
  quote_number: string
  public_token: string
  status: string
  title: string
  recipient_name: string
  recipient_email: string
  recipient_company: string | null
  service_key: string | null
  total_cents: number
  valid_until: string | null
  sent_at: string | null
  viewed_at: string | null
  decided_at: string | null
  decision_note?: string | null
  client_user_id?: string | null
  created_at: string
  line_item_count: number
  invoice_id?: string | null
  invoice_number?: string | null
  invoice_status?: string | null
}

interface LineDraft {
  offering_id: string | null
  name: string
  description: string
  quantity: string
  unit_price: string
  is_optional: boolean
  is_pass_through: boolean
}

interface TemplateRow {
  id: string
  name: string
  service_key: string | null
  description: string | null
  intro_message: string | null
  terms: string | null
  valid_days: number
  active: number
  line_items: Array<{ offering_id?: string | null; name?: string; description?: string; quantity?: number; unit_price_cents?: number; is_optional?: boolean | number; is_pass_through?: boolean | number }>
}

interface OfferingOption { id: string; serviceKey: string; name: string; startingPrice?: number }

const serviceChoices = Array.from(new Map(services.map((item) => [item.key, item])).values())
const emptyLine = (): LineDraft => ({ offering_id: null, name: '', description: '', quantity: '1', unit_price: '0.00', is_optional: false, is_pass_through: false })

function draftTotals(lines: LineDraft[]) {
  const billable = lines.filter((line) => !line.is_optional)
  const subtotal = billable.reduce((sum, line) => sum + Math.round((Number(line.quantity) || 1) * Math.round((Number(line.unit_price) || 0) * 100)), 0)
  return { subtotal, total: subtotal }
}

function linesToPayload(lines: LineDraft[]) {
  return lines
    .filter((line) => line.name.trim())
    .map((line) => ({
      offering_id: line.offering_id || undefined,
      name: line.name,
      description: line.description,
      quantity: Number(line.quantity) || 1,
      unit_price_cents: Math.round((Number(line.unit_price) || 0) * 100),
      is_optional: line.is_optional,
      is_pass_through: line.is_pass_through,
    }))
}

function Chip({ label, active, onClick, tone = 'slate' }: { label: string; active: boolean; onClick: () => void; tone?: 'red' | 'gold' | 'slate' }) {
  const activeCls = tone === 'red' ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
    : tone === 'gold' ? 'border-gold/50 bg-gold/10 text-gold'
      : 'border-white/20 bg-white/[.05] text-white'
  return (
    <button type="button" onClick={onClick} className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${active ? activeCls : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200'}`}>
      {label}
    </button>
  )
}

function publicQuoteUrl(token: string) {
  return `${window.location.origin}/quote/${token}`
}

export default function QuotesAdmin() {
  const p = useAppPath()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [screen, setScreen] = useState<'list' | 'build' | 'templates'>('list')
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null)
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [offerings, setOfferings] = useState<OfferingOption[]>([])
  const [focus, setFocus] = useState<QuoteFocusKey>('working')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [detailId, setDetailId] = useState<string | null>(params.get('quote'))

  const load = useCallback(() => Promise.all([
    api.get<{ quotes: QuoteRow[] }>('/admin/quotes').then((r) => setQuotes(r.quotes)),
    api.get<{ templates: TemplateRow[] }>('/admin/quote-templates').then((r) => setTemplates(r.templates)),
  ]).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load quotes.')), [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    fetch('/api/service-offerings')
      .then((r) => r.ok ? r.json() as Promise<{ offerings?: OfferingOption[] }> : Promise.reject())
      .then((data) => setOfferings(data.offerings || []))
      .catch(() => {})
  }, [])

  const visible = useMemo(() => {
    const list = quotes || []
    const needle = search.trim().toLowerCase()
    return list.filter((quote) => {
      if (!quoteMatchesFocus(quote.status, focus)) return false
      if (!needle) return true
      return [quote.quote_number, quote.title, quote.recipient_name, quote.recipient_email, quote.recipient_company].some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [quotes, focus, search])

  const counts = useMemo(() => {
    const list = quotes || []
    return {
      working: list.filter((quote) => quoteMatchesFocus(quote.status, 'working')).length,
      draft: list.filter((quote) => quote.status === 'draft').length,
      out: list.filter((quote) => quoteMatchesFocus(quote.status, 'out')).length,
      won: list.filter((quote) => quote.status === 'accepted').length,
      openValue: list.filter((quote) => quoteMatchesFocus(quote.status, 'working')).reduce((sum, quote) => sum + quote.total_cents, 0),
    }
  }, [quotes])

  function openDetail(id: string) {
    setDetailId(id)
    const next = new URLSearchParams(params)
    next.set('quote', id)
    setParams(next, { replace: true })
  }

  function backToList() {
    setDetailId(null)
    const next = new URLSearchParams(params)
    next.delete('quote')
    setParams(next, { replace: true })
  }

  async function copyLink(quote: QuoteRow) {
    await navigator.clipboard.writeText(publicQuoteUrl(quote.public_token))
    toast.success('Quote link copied.')
  }

  async function sendQuote(quote: QuoteRow) {
    try {
      await api.post(`/admin/quotes/${quote.id}/send`, {})
      toast.success(`Quote ${quote.quote_number} sent.`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send the quote.')
    }
  }

  if (screen === 'build') {
    return <QuoteComposer templates={templates.filter((t) => t.active)} offerings={offerings} onClose={() => setScreen('list')} onSaved={() => { setScreen('list'); void load() }} />
  }

  if (detailId) {
    return <QuoteDetail quoteId={detailId} offerings={offerings} onBack={backToList} onChanged={load} />
  }

  return <div>
    <PageIntro
      kicker="Revenue"
        title="Quotes"
      subtitle="Write a quote, send a branded link, and let the client accept or decline with notes. Accepted quotes convert to an invoice."
      action={<div className="flex flex-wrap items-center gap-2">
        <button className={btnOutline} onClick={() => setScreen('templates')}>Templates</button>
        <button className={btnPrimary} onClick={() => setScreen('build')}><Plus size={14} />New quote</button>
      </div>}
    />
    {error && <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/[.06] p-4 text-sm text-red-200">{error}</div>}

    {screen === 'templates' ? (
      <div>
        <button type="button" onClick={() => setScreen('list')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-gold"><ChevronLeft size={14} />Back to quotes</button>
        <TemplateManager templates={templates} offerings={offerings} onChanged={load} />
      </div>
    ) : (
      <>
        <Panel className="mb-4 !p-4">
          <div className="flex flex-wrap items-center gap-2">
            {QUOTE_FOCUS.map((item) => {
              const count = item.key === 'working' ? counts.working : item.key === 'draft' ? counts.draft : item.key === 'out' ? counts.out : item.key === 'won' ? counts.won : quotes?.length || 0
              return <Chip key={item.key} label={`${item.label} (${count})`} active={focus === item.key} tone={item.key === 'out' ? 'gold' : 'slate'} onClick={() => setFocus(item.key)} />
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">Working quotes total {quoteMoney(counts.openValue)}. Click a row to review, edit, or send.</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-slate-500"><Search size={14} /></span>
            <input className={`${inputCls} flex-1`} placeholder="Search number, recipient, or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Panel>

        {quotes === null ? <p className="text-sm text-slate-400">Loading quotes…</p>
          : visible.length === 0 ? <EmptyState label={quotes.length === 0 ? 'No quotes yet. Create one, send the link, and it will show up here.' : 'Nothing matches this view.'} />
          : <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-white/[0.025] text-[10px] uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3 font-medium">Quote</th><th className="px-4 py-3 font-medium">Recipient</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Total</th><th className="px-4 py-3 font-medium">Next</th></tr>
                </thead>
                <tbody>
                  {visible.map((quote) => {
                    const action = quoteNextAction(quote.status, quote.invoice_id)
                    return (
                      <tr key={quote.id} className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.025]" onClick={() => openDetail(quote.id)}>
                        <td className="px-4 py-3"><b className="block text-white">{quote.quote_number}</b><span className="text-xs text-slate-500">{quote.title}</span></td>
                        <td className="px-4 py-3"><b className="block text-slate-200">{quote.recipient_name}</b><span className="text-xs text-slate-500">{quote.recipient_company || quote.recipient_email}</span></td>
                        <td className="px-4 py-3"><Tag tone={quoteStatusTone(quote.status)}>{quoteStatusLabel(quote.status)}</Tag><p className="mt-1 text-[11px] text-slate-500">{quote.invoice_number ? `Invoice ${quote.invoice_number}` : quoteIdleLabel(quote)}</p></td>
                        <td className="px-4 py-3 font-semibold text-white">{quoteMoney(quote.total_cents)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {action === 'send' && <button className={btnPrimary} onClick={() => void sendQuote(quote)}>Send</button>}
                          {action === 'copy' && <button className={btnOutline} onClick={() => void copyLink(quote)}>Copy link</button>}
                          {action === 'convert' && <button className={btnPrimary} onClick={() => openDetail(quote.id)}>Convert</button>}
                          {action === 'open-invoice' && quote.invoice_id && <button className={btnOutline} onClick={() => navigate(`${p('invoices')}?invoice=${encodeURIComponent(quote.invoice_id!)}`)}>Open invoice</button>}
                          {action === 'none' && <button className="text-xs font-bold text-gold hover:underline" onClick={() => openDetail(quote.id)}>Open</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>}
      </>
    )}
  </div>
}

interface QuoteDetailData {
  quote: QuoteRow & { intro_message: string | null; scope_notes: string | null; terms: string | null; pass_through_note: string | null; subtotal_cents: number; discount_cents: number; recipient_phone?: string | null; property_address?: string | null; decision_note?: string | null; client_user_id?: string | null }
  line_items: Array<{ id: string; offering_id: string | null; name: string; description: string | null; quantity: number; unit_price_cents: number; is_optional: number; is_pass_through: number }>
  events: Array<{ kind: string; actor: string | null; detail: string | null; created_at: string }>
  invoice: { id: string; invoice_number: string | null; status: string; amount_cents: number } | null
}

function QuoteDetail({ quoteId, offerings, onBack, onChanged }: { quoteId: string; offerings: OfferingOption[]; onBack: () => void; onChanged: () => void }) {
  const p = useAppPath()
  const navigate = useNavigate()
  const [data, setData] = useState<QuoteDetailData | null>(null)
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [decisionNote, setDecisionNote] = useState('')

  const load = useCallback(() => api.get<QuoteDetailData>(`/admin/quotes/${quoteId}`).then(setData).catch(() => toast.error('Could not load the quote.')), [quoteId])
  useEffect(() => { void load() }, [load])

  if (!data) return <div><button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-gold"><ChevronLeft size={14} />Back to quotes</button><p className="text-sm text-slate-400">Loading…</p></div>
  const { quote, line_items, events, invoice } = data
  const editable = ['draft', 'sent', 'viewed'].includes(quote.status)
  const publicUrl = publicQuoteUrl(quote.public_token)

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    try { await fn(); await load(); onChanged() } catch (e) { toast.error(e instanceof ApiError ? e.message : `Could not ${label} the quote.`) } finally { setBusy('') }
  }

  async function convertQuote(opts: { mark_paid?: boolean; send?: boolean }) {
    setBusy(opts.mark_paid ? 'paid' : opts.send ? 'send-invoice' : 'convert')
    try {
      const created = await api.post<{ id: string; invoice_number: string }>(`/admin/invoices/from-quote/${quote.id}`, {
        mark_paid: opts.mark_paid === true,
        due_days: 30,
      })
      if (opts.send) await api.post(`/admin/invoices/${created.id}/send`, {})
      toast.success(opts.mark_paid
        ? `Paid invoice ${created.invoice_number} created from this quote.`
        : opts.send
          ? `Invoice ${created.invoice_number} created and sent.`
          : `Invoice ${created.invoice_number} created from this quote.`)
      onChanged()
      navigate(`${p('invoices')}?invoice=${encodeURIComponent(created.id)}`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not convert this quote to an invoice.')
    } finally { setBusy('') }
  }

  async function duplicate() {
    setBusy('duplicate')
    try {
      const created = await api.post<{ quote_number: string }>('/admin/quotes', {
        title: `${quote.title} (copy)`,
        recipient_name: quote.recipient_name,
        recipient_email: quote.recipient_email,
        recipient_phone: quote.recipient_phone || undefined,
        recipient_company: quote.recipient_company || undefined,
        property_address: quote.property_address || undefined,
        intro_message: quote.intro_message || undefined,
        terms: quote.terms || undefined,
        line_items: line_items.map((li) => ({
          offering_id: li.offering_id || undefined,
          name: li.name,
          description: li.description,
          quantity: li.quantity,
          unit_price_cents: li.unit_price_cents,
          is_optional: !!li.is_optional,
          is_pass_through: !!li.is_pass_through,
        })),
      })
      toast.success(`Draft ${created.quote_number} created from this quote.`)
      onChanged()
      onBack()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not duplicate the quote.')
    } finally { setBusy('') }
  }

  if (editing) {
    return <div>
      <button type="button" onClick={() => setEditing(false)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-gold"><ChevronLeft size={14} />Cancel editing</button>
      <QuoteEditor
        quote={quote}
        lines={line_items.map((li) => ({ offering_id: li.offering_id, name: li.name, description: li.description || '', quantity: String(li.quantity), unit_price: (li.unit_price_cents / 100).toFixed(2), is_optional: !!li.is_optional, is_pass_through: !!li.is_pass_through }))}
        offerings={offerings}
        onCancel={() => setEditing(false)}
        onSaved={() => { setEditing(false); void load(); onChanged() }}
      />
    </div>
  }

  return <div>
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-gold"><ChevronLeft size={14} />Back to quotes</button>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">{quote.quote_number}</p>
        <h2 className="mt-1 text-xl font-bold text-white">{quote.title}</h2>
        <p className="mt-1 text-sm text-slate-400">{quote.recipient_name} · {quote.recipient_email}</p>
      </div>
      <Tag tone={quoteStatusTone(quote.status)}>{quoteStatusLabel(quote.status)}</Tag>
    </div>

    <div className="mb-5 flex flex-wrap items-center gap-2">
      {editable && quote.status === 'draft' && <button className={btnPrimary} disabled={!!busy} onClick={() => act('send', () => api.post(`/admin/quotes/${quote.id}/send`, {}))}>{busy === 'send' ? 'Sending…' : 'Send quote'}</button>}
      {editable && quote.status !== 'draft' && <button className={btnPrimary} disabled={!!busy} onClick={() => act('send', () => api.post(`/admin/quotes/${quote.id}/send`, {}))}>{busy === 'send' ? 'Sending…' : 'Re-send'}</button>}
      {editable && <button className={btnOutline} disabled={!!busy} onClick={() => setEditing(true)}>Edit</button>}
      <button className={btnOutline} onClick={() => { void navigator.clipboard.writeText(publicUrl); toast.success('Quote link copied.') }}>Copy link</button>
      <a className={btnOutline} href={publicUrl} target="_blank" rel="noreferrer">Preview</a>
      <Link className={btnOutline} to={`${p('messages')}?tab=email&compose=1&to=${encodeURIComponent(quote.recipient_email)}&name=${encodeURIComponent(quote.recipient_name)}`}>Email</Link>
      <button className={btnOutline} disabled={!!busy} onClick={() => void duplicate()}>{busy === 'duplicate' ? 'Copying…' : 'Duplicate'}</button>
      {editable && <button className="text-xs font-bold text-slate-500 hover:text-white" onClick={() => setShowMore((v) => !v)}>{showMore ? 'Hide decisions' : 'Mark accepted, declined, or void'}</button>}
    </div>
    {showMore && editable && (
      <div className="mb-5 space-y-3 rounded-xl border border-white/10 bg-white/[.02] p-3">
        <textarea className={`${inputCls} min-h-16`} placeholder="Optional notes from the client or this call" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button className={btnOutline} disabled={!!busy} onClick={() => act('accept', () => api.patch(`/admin/quotes/${quote.id}/status`, { status: 'accepted', note: decisionNote.trim() || undefined }))}>Mark accepted</button>
          <button className={btnOutline} disabled={!!busy} onClick={() => act('decline', () => api.patch(`/admin/quotes/${quote.id}/status`, { status: 'declined', note: decisionNote.trim() || undefined }))}>Mark declined</button>
          <button className="rounded-md border border-red-400/20 px-3 py-1.5 text-sm font-bold text-red-200 transition hover:border-red-400/50" disabled={!!busy} onClick={() => { if (confirm('Void this quote? The public link stops working.')) void act('void', () => api.patch(`/admin/quotes/${quote.id}/status`, { status: 'void' })) }}>Void</button>
        </div>
      </div>
    )}
    {quote.status === 'accepted' && !invoice && (
      <div className="mb-5 rounded-xl border border-gold/25 bg-gold/[.06] p-4">
        <p className="text-sm font-semibold text-white">This quote is accepted. Convert it to an invoice to bill the work.</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">Billable lines copy over. Optional add-ons stay off the invoice. You can send it, or mark it paid if the client already paid.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={!!busy} onClick={() => void convertQuote({})}>{busy === 'convert' ? 'Converting…' : 'Convert to invoice'}</button>
          <button className={btnOutline} disabled={!!busy} onClick={() => void convertQuote({ send: true })}>{busy === 'send-invoice' ? 'Sending…' : 'Convert and send'}</button>
          <button className={btnOutline} disabled={!!busy} onClick={() => void convertQuote({ mark_paid: true })}>{busy === 'paid' ? 'Saving…' : 'Convert and mark paid'}</button>
        </div>
      </div>
    )}
    {invoice && (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[.05] px-4 py-3">
        <p className="text-sm text-slate-200">Linked invoice <strong className="text-white">{invoice.invoice_number || invoice.id.slice(0, 8)}</strong> · {invoice.status === 'paid' ? 'Paid' : invoice.status === 'void' ? 'Void' : 'Open'}</p>
        <Link className={btnOutline} to={`${p('invoices')}?invoice=${encodeURIComponent(invoice.id)}`}>Open invoice</Link>
      </div>
    )}

    <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[.03] text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Line</th><th>Qty</th><th>Unit</th><th className="pr-4 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-white/[.07]">
            {line_items.map((li) => <tr key={li.id}>
              <td className="px-4 py-3"><b className="block text-slate-200">{li.name}{li.is_optional ? <span className="ml-2 text-[10px] font-bold uppercase text-slate-500">optional</span> : null}{li.is_pass_through ? <span className="ml-2 text-[10px] font-bold uppercase text-gold/70">pass-through</span> : null}</b>{li.description && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{li.description}</span>}</td>
              <td className="text-slate-300">{li.quantity}</td>
              <td className="text-slate-300">{quoteMoney(li.unit_price_cents)}</td>
              <td className="pr-4 text-right font-semibold text-white">{quoteMoney(Math.round(li.quantity * li.unit_price_cents))}</td>
            </tr>)}
          </tbody>
          <tfoot><tr className="border-t border-gold/25 bg-gold/[.04]"><td className="px-4 py-3 font-bold text-white" colSpan={3}>Total</td><td className="pr-4 text-right font-display text-lg font-extrabold text-gold">{quoteMoney(quote.total_cents)}</td></tr></tfoot>
        </table>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-4 text-sm leading-6 text-slate-400">
          {quote.recipient_company && <p><strong className="text-slate-200">Company:</strong> {quote.recipient_company}</p>}
          {quote.property_address && <p><strong className="text-slate-200">Property:</strong> {quote.property_address}</p>}
          <p><strong className="text-slate-200">Valid through:</strong> {quote.valid_until ? new Date(`${quote.valid_until.slice(0, 10)}T12:00:00`).toLocaleDateString() : 'Not set'}</p>
          {quote.decision_note && <p className="mt-2 border-t border-white/[.07] pt-2 text-xs"><strong className="text-slate-200">Decision notes:</strong> {quote.decision_note}</p>}
          {quote.intro_message && <p className="mt-2 border-t border-white/[.07] pt-2 text-xs">{quote.intro_message}</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Activity</p>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
            {events.map((event, index) => <li key={index}><span className="font-semibold text-slate-300">{quoteEventLabel(event.kind)}</span>{event.detail ? ` · ${event.detail}` : ''} · {new Date(event.created_at.includes('T') ? event.created_at : `${event.created_at.replace(' ', 'T')}Z`).toLocaleString()}</li>)}
          </ul>
        </div>
      </div>
    </div>
  </div>
}

function LineItemsEditor({ lines, setLines, offerings }: { lines: LineDraft[]; setLines: (updater: (lines: LineDraft[]) => LineDraft[]) => void; offerings: OfferingOption[] }) {
  const totals = draftTotals(lines)
  const [advanced, setAdvanced] = useState(false)
  const update = (index: number, patch: Partial<LineDraft>) => setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line))
  return <div className="space-y-3">
    {lines.map((line, index) => <div key={index} className="rounded-xl border border-white/10 bg-white/[.02] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_7rem_8rem_auto]">
        <input className={inputCls} placeholder="What is this line for?" value={line.name} onChange={(e) => update(index, { name: e.target.value })} />
        <input className={inputCls} inputMode="decimal" aria-label="Quantity" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} />
        <input className={inputCls} inputMode="decimal" aria-label="Unit price" value={line.unit_price} onChange={(e) => update(index, { unit_price: e.target.value })} />
        <button type="button" className="text-xs font-bold text-red-300 hover:text-red-200" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</button>
      </div>
      {advanced && <>
        <select className={`${inputCls} mt-2`} value={line.offering_id || ''} onChange={(e) => {
          const offering = offerings.find((o) => o.id === e.target.value)
          update(index, offering
            ? { offering_id: offering.id, name: offering.name, unit_price: typeof offering.startingPrice === 'number' ? offering.startingPrice.toFixed(2) : line.unit_price }
            : { offering_id: null })
        }}>
          <option value="">Custom line (no catalog link)</option>
          {offerings.map((o) => <option key={o.id} value={o.id}>{o.name}{typeof o.startingPrice === 'number' ? ` - from $${o.startingPrice}` : ''}</option>)}
        </select>
        <textarea className={`${inputCls} mt-2 min-h-16`} placeholder="Description shown on the quote" value={line.description} onChange={(e) => update(index, { description: e.target.value })} />
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-gold" checked={line.is_optional} onChange={(e) => update(index, { is_optional: e.target.checked })} />Optional (excluded from total)</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-gold" checked={line.is_pass_through} onChange={(e) => update(index, { is_pass_through: e.target.checked })} />Pass-through cost</label>
        </div>
      </>}
    </div>)}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2">
        <button type="button" className={btnOutline} onClick={() => setLines((current) => [...current, emptyLine()])}>Add line</button>
        <button type="button" className="text-xs font-bold text-slate-500 hover:text-gold" onClick={() => setAdvanced((v) => !v)}>{advanced ? 'Hide extras' : 'Catalog, notes, optional lines'}</button>
      </div>
      <p className="text-sm text-slate-300">Total: <strong className="font-display text-lg text-gold">{quoteMoney(totals.total)}</strong></p>
    </div>
  </div>
}

function QuoteComposer({ templates, offerings, onClose, onSaved }: { templates: TemplateRow[]; offerings: OfferingOption[]; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [templateId, setTemplateId] = useState('')
  const [showPrefill, setShowPrefill] = useState(false)
  const [form, setForm] = useState({ title: '', recipient_name: '', recipient_email: '', recipient_phone: '', recipient_company: '', property_address: '', intro_message: '', terms: '', valid_days: '14' })
  const [lines, setLinesState] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const setLines = (updater: (lines: LineDraft[]) => LineDraft[]) => setLinesState(updater)
  const totals = draftTotals(lines)

  function applyTemplate(id: string) {
    setTemplateId(id)
    const template = templates.find((t) => t.id === id)
    if (!template) return
    setForm((current) => ({
      ...current,
      title: template.name,
      intro_message: template.intro_message || '',
      terms: template.terms || '',
      valid_days: String(template.valid_days || 14),
    }))
    setLinesState(template.line_items.map((li) => ({
      offering_id: li.offering_id || null,
      name: li.name || '',
      description: li.description || '',
      quantity: String(li.quantity || 1),
      unit_price: ((li.unit_price_cents || 0) / 100).toFixed(2),
      is_optional: li.is_optional === 1 || li.is_optional === true,
      is_pass_through: li.is_pass_through === 1 || li.is_pass_through === true,
    })))
  }

  function goPricing() {
    if (!form.recipient_name.trim()) return toast.error('Enter the recipient name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.recipient_email.trim())) return toast.error('Enter a valid recipient email.')
    setStep(2)
  }

  function goReview() {
    if (!linesToPayload(lines).length) return toast.error('Add at least one named line item.')
    setStep(3)
  }

  async function save(sendAfter: boolean) {
    const payload = linesToPayload(lines)
    if (!payload.length) return toast.error('Add at least one line item with a name.')
    setBusy(true)
    try {
      const created = await api.post<{ id: string; quote_number: string }>('/admin/quotes', {
        template_id: templateId || undefined,
        title: form.title || undefined,
        recipient_name: form.recipient_name,
        recipient_email: form.recipient_email,
        recipient_phone: form.recipient_phone || undefined,
        recipient_company: form.recipient_company || undefined,
        property_address: form.property_address || undefined,
        intro_message: form.intro_message || undefined,
        terms: form.terms || undefined,
        valid_days: Number(form.valid_days) || 14,
        line_items: payload,
      })
      if (sendAfter) await api.post(`/admin/quotes/${created.id}/send`, {})
      toast.success(sendAfter ? `Quote ${created.quote_number} sent.` : `Quote ${created.quote_number} saved as a draft.`)
      onSaved()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save the quote.')
    } finally { setBusy(false) }
  }

  const steps = [{ n: 1, label: 'Recipient' }, { n: 2, label: 'Pricing' }, { n: 3, label: 'Review' }] as const

  return <div>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <button type="button" onClick={onClose} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-gold"><ChevronLeft size={14} />Back to quotes</button>
        <h2 className="text-xl font-bold text-white">New quote</h2>
        <p className="mt-1 text-sm text-slate-400">Recipient, then pricing, then send. Everything else is optional.</p>
      </div>
    </div>
    <div className="mb-5 flex gap-2">
      {steps.map((item) => (
        <button key={item.n} type="button" onClick={() => { if (item.n < step) setStep(item.n) }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${step === item.n ? 'border-gold/50 bg-gold/10 text-gold' : item.n < step ? 'border-white/15 text-slate-300' : 'border-white/10 text-slate-600'}`}>
          {item.n}. {item.label}
        </button>
      ))}
    </div>

    {step === 1 && <Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-400 sm:col-span-2">Start from a template
          <select className={`${inputCls} mt-1`} value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Blank quote</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <input className={inputCls} placeholder="Recipient name *" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
        <input className={inputCls} type="email" placeholder="Recipient email *" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} />
        <input className={inputCls} placeholder="Company (optional)" value={form.recipient_company} onChange={(e) => setForm({ ...form, recipient_company: e.target.value })} />
        <input className={inputCls} placeholder="Quote title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <button type="button" className="mt-3 text-xs font-bold text-slate-500 hover:text-gold" onClick={() => setShowPrefill((v) => !v)}>{showPrefill ? 'Hide extra recipient details' : 'Phone, property, or prefill from a request'}</button>
      {showPrefill && <div className="mt-3 space-y-3">
        <ScopeIntakePicker onPick={(row) => {
          const prefill = quotePrefillFromScope(row)
          setForm((current) => ({
            ...current,
            title: prefill.title,
            recipient_name: prefill.recipient_name,
            recipient_email: prefill.recipient_email,
            recipient_phone: prefill.recipient_phone,
            property_address: prefill.property_address,
            intro_message: prefill.intro_message,
          }))
          setLinesState(prefill.lines)
        }} />
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={inputCls} placeholder="Phone" value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} />
          <input className={inputCls} placeholder="Property address" value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} />
        </div>
      </div>}
      <div className="mt-5 flex justify-end"><button className={btnPrimary} onClick={goPricing}>Continue to pricing</button></div>
    </Panel>}

    {step === 2 && <Panel>
      <p className="mb-4 text-sm text-slate-400">Name, quantity, and price. Open extras only if you need a catalog item, note, or optional line.</p>
      <LineItemsEditor lines={lines} setLines={setLines} offerings={offerings} />
      <div className="mt-5 flex justify-between gap-2">
        <button className={btnOutline} onClick={() => setStep(1)}>Back</button>
        <button className={btnPrimary} onClick={goReview}>Review quote</button>
      </div>
    </Panel>}

    {step === 3 && <Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="sm:col-span-2 text-sm text-slate-300"><strong className="text-white">{form.recipient_name}</strong> · {form.recipient_email}</p>
        <input className={inputCls} placeholder="Valid days" inputMode="numeric" value={form.valid_days} onChange={(e) => setForm({ ...form, valid_days: e.target.value })} />
        <p className="flex items-center text-sm text-slate-300">Total <strong className="ml-2 font-display text-xl text-gold">{quoteMoney(totals.total)}</strong></p>
        <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Intro message (optional)" value={form.intro_message} onChange={(e) => setForm({ ...form, intro_message: e.target.value })} />
        <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Terms (optional)" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
      </div>
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <button className={btnOutline} onClick={() => setStep(2)}>Back</button>
        <div className="flex gap-2">
          <button className={btnOutline} disabled={busy} onClick={() => void save(false)}>{busy ? 'Saving…' : 'Save draft'}</button>
          <button className={btnPrimary} disabled={busy} onClick={() => void save(true)}>{busy ? 'Working…' : 'Send quote'}</button>
        </div>
      </div>
    </Panel>}
  </div>
}

function QuoteEditor({ quote, lines: initialLines, offerings, onCancel, onSaved }: { quote: QuoteDetailData['quote']; lines: LineDraft[]; offerings: OfferingOption[]; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: quote.title,
    recipient_name: quote.recipient_name,
    recipient_email: quote.recipient_email,
    recipient_company: quote.recipient_company || '',
    intro_message: quote.intro_message || '',
    terms: quote.terms || '',
    valid_until: quote.valid_until ? quote.valid_until.slice(0, 10) : '',
  })
  const [lines, setLinesState] = useState<LineDraft[]>(initialLines)
  const [busy, setBusy] = useState(false)
  const setLines = (updater: (lines: LineDraft[]) => LineDraft[]) => setLinesState(updater)

  async function save() {
    const payload = linesToPayload(lines)
    if (!payload.length) return toast.error('A quote needs at least one line item.')
    setBusy(true)
    try {
      await api.patch(`/admin/quotes/${quote.id}`, { ...form, line_items: payload })
      toast.success('Quote updated.')
      onSaved()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not update the quote.')
    } finally { setBusy(false) }
  }

  return <Panel>
    <h2 className="text-lg font-bold text-white">Edit quote</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <input className={inputCls} placeholder="Quote title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input className={inputCls} type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
      <input className={inputCls} placeholder="Recipient name" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
      <input className={inputCls} type="email" placeholder="Recipient email" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} />
      <input className={`${inputCls} sm:col-span-2`} placeholder="Company" value={form.recipient_company} onChange={(e) => setForm({ ...form, recipient_company: e.target.value })} />
      <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Intro message" value={form.intro_message} onChange={(e) => setForm({ ...form, intro_message: e.target.value })} />
      <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Terms" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
    </div>
    <div className="mt-4"><LineItemsEditor lines={lines} setLines={setLines} offerings={offerings} /></div>
    <div className="mt-4 flex gap-2">
      <button className={btnPrimary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</button>
      <button className={btnOutline} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </Panel>
}

function TemplateManager({ templates, offerings, onChanged }: { templates: TemplateRow[]; offerings: OfferingOption[]; onChanged: () => void }) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-slate-400">Templates fill in line items, intro copy, and terms so a new quote starts halfway done.</p>
      <button className={btnPrimary} onClick={() => setEditingId('new')}>New template</button>
    </div>
    {editingId === 'new' && <TemplateEditor offerings={offerings} onDone={() => { setEditingId(null); onChanged() }} onCancel={() => setEditingId(null)} />}
    <div className="grid gap-4 lg:grid-cols-2">
      {templates.map((template) => editingId === template.id
        ? <TemplateEditor key={template.id} template={template} offerings={offerings} onDone={() => { setEditingId(null); onChanged() }} onCancel={() => setEditingId(null)} />
        : <Panel key={template.id} className={template.active ? '' : 'opacity-60'}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-white">{template.name}</h3>
                <p className="mt-1 text-xs text-slate-500">{serviceChoices.find((s) => s.key === template.service_key)?.title || 'Any service'} · valid {template.valid_days} days · {template.line_items.length} line items{template.active ? '' : ' · archived'}</p>
              </div>
              <div className="flex gap-2">
                <button className={btnOutline} onClick={() => setEditingId(template.id)}>Edit</button>
                {!!template.active && <button className="rounded-md border border-red-400/20 px-3 py-1.5 text-sm font-bold text-red-200" onClick={() => { if (confirm(`Archive "${template.name}"?`)) void api.del(`/admin/quote-templates/${template.id}`).then(onChanged).catch(() => toast.error('Could not archive the template.')) }}>Archive</button>}
              </div>
            </div>
            {template.description && <p className="mt-3 text-sm leading-6 text-slate-400">{template.description}</p>}
            <ul className="mt-3 divide-y divide-white/[.07] border-y border-white/[.07] text-xs">
              {template.line_items.map((li, index) => <li key={index} className="flex items-center justify-between gap-3 py-2"><span className="text-slate-300">{li.name}{li.quantity && li.quantity !== 1 ? ` × ${li.quantity}` : ''}</span><span className="font-semibold text-slate-200">{quoteMoney(li.unit_price_cents || 0)}</span></li>)}
            </ul>
          </Panel>)}
    </div>
    {!templates.length && <EmptyState label="No templates yet." />}
  </div>
}

function TemplateEditor({ template, offerings, onDone, onCancel }: { template?: TemplateRow; offerings: OfferingOption[]; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: template?.name || '',
    service_key: template?.service_key || '',
    description: template?.description || '',
    intro_message: template?.intro_message || '',
    terms: template?.terms || '',
    valid_days: String(template?.valid_days || 14),
    active: template ? !!template.active : true,
  })
  const [lines, setLinesState] = useState<LineDraft[]>(template
    ? template.line_items.map((li) => ({ offering_id: li.offering_id || null, name: li.name || '', description: li.description || '', quantity: String(li.quantity || 1), unit_price: ((li.unit_price_cents || 0) / 100).toFixed(2), is_optional: li.is_optional === 1 || li.is_optional === true, is_pass_through: li.is_pass_through === 1 || li.is_pass_through === true }))
    : [emptyLine()])
  const [busy, setBusy] = useState(false)
  const setLines = (updater: (lines: LineDraft[]) => LineDraft[]) => setLinesState(updater)

  async function save() {
    if (!form.name.trim()) return toast.error('Enter a template name.')
    const payload = linesToPayload(lines)
    if (!payload.length) return toast.error('Add at least one line item.')
    setBusy(true)
    try {
      const body = { ...form, service_key: form.service_key || null, valid_days: Number(form.valid_days) || 14, line_items: payload }
      if (template) await api.patch(`/admin/quote-templates/${template.id}`, body)
      else await api.post('/admin/quote-templates', body)
      toast.success('Template saved.')
      onDone()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save the template.')
    } finally { setBusy(false) }
  }

  return <Panel className="lg:col-span-2">
    <h3 className="font-bold text-white">{template ? `Edit "${template.name}"` : 'New template'}</h3>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <input className={inputCls} placeholder="Template name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <select className={inputCls} value={form.service_key} onChange={(e) => setForm({ ...form, service_key: e.target.value })}>
        <option value="">Any service</option>
        {serviceChoices.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
      </select>
      <input className={inputCls} placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <input className={inputCls} placeholder="Valid days" inputMode="numeric" value={form.valid_days} onChange={(e) => setForm({ ...form, valid_days: e.target.value })} />
      <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Intro message" value={form.intro_message} onChange={(e) => setForm({ ...form, intro_message: e.target.value })} />
      <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Terms" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
      <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" className="accent-gold" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Active</label>
    </div>
    <div className="mt-4"><LineItemsEditor lines={lines} setLines={setLines} offerings={offerings} /></div>
    <div className="mt-4 flex gap-2">
      <button className={btnPrimary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save template'}</button>
      <button className={btnOutline} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </Panel>
}
