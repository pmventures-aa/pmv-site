import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, StatCard, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { services } from '../../data/services'

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
  created_at: string
  line_item_count: number
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

const STATUS_TONES: Record<string, 'slate' | 'gold' | 'green' | 'red' | 'blue'> = {
  draft: 'slate', sent: 'blue', viewed: 'gold', accepted: 'green', declined: 'red', expired: 'slate', void: 'slate',
}
const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
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

export default function QuotesAdmin() {
  const [tab, setTab] = useState<'quotes' | 'templates'>('quotes')
  const [quotes, setQuotes] = useState<QuoteRow[] | null>(null)
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [offerings, setOfferings] = useState<OfferingOption[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [building, setBuilding] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = useCallback(() => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (search.trim()) params.set('q', search.trim())
    return Promise.all([
      api.get<{ quotes: QuoteRow[] }>(`/admin/quotes${params.size ? `?${params}` : ''}`).then((r) => setQuotes(r.quotes)),
      api.get<{ templates: TemplateRow[] }>('/admin/quote-templates').then((r) => setTemplates(r.templates)),
    ]).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load quotes.'))
  }, [statusFilter, search])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    fetch('/api/service-offerings')
      .then((r) => r.ok ? r.json() as Promise<{ offerings?: OfferingOption[] }> : Promise.reject())
      .then((data) => setOfferings(data.offerings || []))
      .catch(() => {})
  }, [])

  const stats = useMemo(() => {
    const list = quotes || []
    const open = list.filter((q) => ['draft', 'sent', 'viewed'].includes(q.status))
    const accepted = list.filter((q) => q.status === 'accepted')
    return {
      open: open.length,
      openValue: open.reduce((sum, q) => sum + q.total_cents, 0),
      accepted: accepted.length,
      acceptedValue: accepted.reduce((sum, q) => sum + q.total_cents, 0),
    }
  }, [quotes])

  return <div className="space-y-6">
    <PageIntro kicker="Revenue" title="Quotes" subtitle="Branded quotes built from your service catalog and reusable templates. Recipients review and accept on a Pinnacle-branded page - no account needed." action={<button className={btnPrimary} onClick={() => setBuilding(true)}>New Quote</button>} />
    {error && <div className="rounded-xl border border-red-400/20 bg-red-400/[.06] p-4 text-sm text-red-200">{error}</div>}

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Open quotes" value={stats.open} />
      <StatCard label="Open value" value={money(stats.openValue)} />
      <StatCard label="Accepted" value={stats.accepted} />
      <StatCard label="Accepted value" value={money(stats.acceptedValue)} />
    </div>

    <div className="flex flex-wrap items-center gap-2">
      {(['quotes', 'templates'] as const).map((key) => (
        <button key={key} onClick={() => setTab(key)} className={`rounded-full border px-4 py-2 text-xs font-bold capitalize transition ${tab === key ? 'border-gold/60 bg-gold/15 text-gold' : 'border-white/10 bg-white/[.02] text-slate-300 hover:border-white/25'}`}>{key}</button>
      ))}
      {tab === 'quotes' && <>
        <select className={`${inputCls} !w-44`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'void'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className={`${inputCls} !w-64`} placeholder="Search number, name, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </>}
    </div>

    {building && <QuoteBuilder templates={templates.filter((t) => t.active)} offerings={offerings} onClose={() => setBuilding(false)} onSaved={() => { setBuilding(false); void load() }} />}

    {tab === 'quotes' && (
      quotes === null ? <p className="text-sm text-slate-400">Loading…</p>
      : quotes.length === 0 ? <EmptyState label="No quotes yet. Build the first one from a template - it takes about a minute." />
      : <Panel className="!p-0 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Quote</th><th>Recipient</th><th>Status</th><th>Total</th><th>Valid until</th><th /></tr></thead>
            <tbody className="divide-y divide-white/10">
              {quotes.map((q) => <QuoteListRow key={q.id} quote={q} expanded={detailId === q.id} onToggle={() => setDetailId(detailId === q.id ? null : q.id)} onChanged={load} offerings={offerings} />)}
            </tbody>
          </table>
        </Panel>
    )}

    {tab === 'templates' && <TemplateManager templates={templates} offerings={offerings} onChanged={load} />}
  </div>
}

function QuoteListRow({ quote, expanded, onToggle, onChanged, offerings }: { quote: QuoteRow; expanded: boolean; onToggle: () => void; onChanged: () => void; offerings: OfferingOption[] }) {
  return <>
    <tr className="cursor-pointer transition hover:bg-white/[.02]" onClick={onToggle}>
      <td className="px-5 py-4"><b className="block text-white">{quote.quote_number}</b><span className="text-xs text-slate-500">{quote.title}</span></td>
      <td><b className="block text-slate-200">{quote.recipient_name}</b><span className="text-xs text-slate-500">{quote.recipient_company || quote.recipient_email}</span></td>
      <td><Tag tone={STATUS_TONES[quote.status] || 'slate'}>{quote.status}</Tag></td>
      <td className="font-semibold text-white">{money(quote.total_cents)}</td>
      <td className="text-xs text-slate-400">{quote.valid_until ? new Date(`${quote.valid_until.slice(0, 10)}T12:00:00`).toLocaleDateString() : '-'}</td>
      <td className="pr-5 text-right text-gold">{expanded ? '▴' : '▾'}</td>
    </tr>
    {expanded && <tr><td colSpan={6} className="bg-navy-950/40 px-5 py-5"><QuoteDetail quoteId={quote.id} onChanged={onChanged} offerings={offerings} /></td></tr>}
  </>
}

interface QuoteDetailData {
  quote: QuoteRow & { intro_message: string | null; scope_notes: string | null; terms: string | null; pass_through_note: string | null; subtotal_cents: number; discount_cents: number }
  line_items: Array<{ id: string; offering_id: string | null; name: string; description: string | null; quantity: number; unit_price_cents: number; is_optional: number; is_pass_through: number }>
  events: Array<{ kind: string; actor: string | null; detail: string | null; created_at: string }>
}

function QuoteDetail({ quoteId, onChanged, offerings }: { quoteId: string; onChanged: () => void; offerings: OfferingOption[] }) {
  const [data, setData] = useState<QuoteDetailData | null>(null)
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)

  const load = useCallback(() => api.get<QuoteDetailData>(`/admin/quotes/${quoteId}`).then(setData).catch(() => toast.error('Could not load the quote.')), [quoteId])
  useEffect(() => { void load() }, [load])

  if (!data) return <p className="text-sm text-slate-400">Loading…</p>
  const { quote, line_items, events } = data
  const editable = ['draft', 'sent', 'viewed'].includes(quote.status)
  const publicUrl = `${window.location.origin}/quote/${quote.public_token}`

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    try { await fn(); await load(); onChanged() } catch (e) { toast.error(e instanceof ApiError ? e.message : `Could not ${label} the quote.`) } finally { setBusy('') }
  }

  if (editing) {
    return <QuoteEditor
      quote={quote}
      lines={line_items.map((li) => ({ offering_id: li.offering_id, name: li.name, description: li.description || '', quantity: String(li.quantity), unit_price: (li.unit_price_cents / 100).toFixed(2), is_optional: !!li.is_optional, is_pass_through: !!li.is_pass_through }))}
      offerings={offerings}
      onCancel={() => setEditing(false)}
      onSaved={() => { setEditing(false); void load(); onChanged() }}
    />
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2">
      {editable && <button className={btnOutline} disabled={!!busy} onClick={() => setEditing(true)}>Edit</button>}
      {editable && <button className={btnPrimary} disabled={!!busy} onClick={() => act('send', () => api.post(`/admin/quotes/${quote.id}/send`, {}))}>{busy === 'send' ? 'Sending…' : quote.sent_at ? 'Re-send Quote' : 'Send Quote'}</button>}
      <a className={btnOutline} href={publicUrl} target="_blank" rel="noreferrer">Open Branded View</a>
      <button className={btnOutline} onClick={() => { void navigator.clipboard.writeText(publicUrl); toast.success('Quote link copied.') }}>Copy Link</button>
      {editable && <>
        <button className={btnOutline} disabled={!!busy} onClick={() => act('accept', () => api.patch(`/admin/quotes/${quote.id}/status`, { status: 'accepted' }))}>Mark Accepted</button>
        <button className={btnOutline} disabled={!!busy} onClick={() => act('decline', () => api.patch(`/admin/quotes/${quote.id}/status`, { status: 'declined' }))}>Mark Declined</button>
        <button className="rounded-xl border border-red-400/20 px-4 py-2.5 text-sm font-bold text-red-200 transition hover:border-red-400/50" disabled={!!busy} onClick={() => { if (confirm('Void this quote? The public link stops working.')) void act('void', () => api.patch(`/admin/quotes/${quote.id}/status`, { status: 'void' })) }}>Void</button>
      </>}
    </div>

    <div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[.03] text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Line item</th><th>Qty</th><th>Unit</th><th className="pr-4 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-white/[.07]">
            {line_items.map((li) => <tr key={li.id}>
              <td className="px-4 py-3"><b className="block text-slate-200">{li.name}{li.is_optional ? <span className="ml-2 text-[10px] font-bold uppercase text-slate-500">optional</span> : null}{li.is_pass_through ? <span className="ml-2 text-[10px] font-bold uppercase text-gold/70">pass-through</span> : null}</b>{li.description && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{li.description}</span>}</td>
              <td className="text-slate-300">{li.quantity}</td>
              <td className="text-slate-300">{money(li.unit_price_cents)}</td>
              <td className="pr-4 text-right font-semibold text-white">{money(Math.round(li.quantity * li.unit_price_cents))}</td>
            </tr>)}
          </tbody>
          <tfoot><tr className="border-t border-gold/25 bg-gold/[.04]"><td className="px-4 py-3 font-bold text-white" colSpan={3}>Total (optional lines excluded)</td><td className="pr-4 text-right font-display text-lg font-extrabold text-gold">{money(quote.total_cents)}</td></tr></tfoot>
        </table>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-4 text-xs leading-6 text-slate-400">
          <p><strong className="text-slate-200">Recipient:</strong> {quote.recipient_name} · {quote.recipient_email}</p>
          {quote.recipient_company && <p><strong className="text-slate-200">Company:</strong> {quote.recipient_company}</p>}
          {'property_address' in quote && (quote as Record<string, unknown>).property_address ? <p><strong className="text-slate-200">Property:</strong> {String((quote as Record<string, unknown>).property_address)}</p> : null}
          {quote.intro_message && <p className="mt-2 border-t border-white/[.07] pt-2">{quote.intro_message}</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">History</p>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
            {events.map((event, index) => <li key={index}><span className="font-semibold text-slate-300">{event.kind}</span> · {new Date(event.created_at + 'Z').toLocaleString()} {event.detail ? `· ${event.detail}` : ''}</li>)}
          </ul>
        </div>
      </div>
    </div>
  </div>
}

function LineItemsEditor({ lines, setLines, offerings }: { lines: LineDraft[]; setLines: (updater: (lines: LineDraft[]) => LineDraft[]) => void; offerings: OfferingOption[] }) {
  const totals = draftTotals(lines)
  const update = (index: number, patch: Partial<LineDraft>) => setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line))
  return <div className="space-y-3">
    {lines.map((line, index) => <div key={index} className="rounded-xl border border-white/10 bg-white/[.02] p-3">
      <div className="grid gap-2 sm:grid-cols-[1.4fr_.8fr]">
        <input className={inputCls} placeholder="Line item name" value={line.name} onChange={(e) => update(index, { name: e.target.value })} />
        <select className={inputCls} value={line.offering_id || ''} onChange={(e) => {
          const offering = offerings.find((o) => o.id === e.target.value)
          update(index, offering
            ? { offering_id: offering.id, name: offering.name, unit_price: typeof offering.startingPrice === 'number' ? offering.startingPrice.toFixed(2) : line.unit_price }
            : { offering_id: null })
        }}>
          <option value="">Custom line (no catalog link)</option>
          {offerings.map((o) => <option key={o.id} value={o.id}>{o.name}{typeof o.startingPrice === 'number' ? ` - from $${o.startingPrice}` : ''}</option>)}
        </select>
      </div>
      <textarea className={`${inputCls} mt-2 min-h-16`} placeholder="Description shown on the quote" value={line.description} onChange={(e) => update(index, { description: e.target.value })} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="text-xs font-bold text-slate-400">Qty<input className={`${inputCls} mt-1 !w-20`} inputMode="decimal" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} /></label>
        <label className="text-xs font-bold text-slate-400">Unit price ($)<input className={`${inputCls} mt-1 !w-28`} inputMode="decimal" value={line.unit_price} onChange={(e) => update(index, { unit_price: e.target.value })} /></label>
        <label className="flex items-center gap-2 pt-5 text-xs text-slate-400"><input type="checkbox" className="accent-gold" checked={line.is_optional} onChange={(e) => update(index, { is_optional: e.target.checked })} />Optional (excluded from total)</label>
        <label className="flex items-center gap-2 pt-5 text-xs text-slate-400"><input type="checkbox" className="accent-gold" checked={line.is_pass_through} onChange={(e) => update(index, { is_pass_through: e.target.checked })} />Pass-through cost</label>
        <button type="button" className="ml-auto pt-5 text-xs font-bold text-red-300 hover:text-red-200" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</button>
      </div>
    </div>)}
    <div className="flex items-center justify-between">
      <button type="button" className={btnOutline} onClick={() => setLines((current) => [...current, emptyLine()])}>Add Line Item</button>
      <p className="text-sm text-slate-300">Total: <strong className="font-display text-lg text-gold">{money(totals.total)}</strong></p>
    </div>
  </div>
}

function QuoteBuilder({ templates, offerings, onClose, onSaved }: { templates: TemplateRow[]; offerings: OfferingOption[]; onClose: () => void; onSaved: () => void }) {
  const [templateId, setTemplateId] = useState('')
  const [form, setForm] = useState({ title: '', recipient_name: '', recipient_email: '', recipient_phone: '', recipient_company: '', property_address: '', intro_message: '', terms: '', valid_days: '14' })
  const [lines, setLinesState] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const setLines = (updater: (lines: LineDraft[]) => LineDraft[]) => setLinesState(updater)

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

  async function save(sendAfter: boolean) {
    if (!form.recipient_name.trim()) return toast.error('Enter the recipient name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.recipient_email.trim())) return toast.error('Enter a valid recipient email.')
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
      toast.success(sendAfter ? `Quote ${created.quote_number} sent.` : `Quote ${created.quote_number} saved as draft.`)
      onSaved()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save the quote.')
    } finally { setBusy(false) }
  }

  return <Panel>
    <div className="flex items-start justify-between gap-4">
      <div><h2 className="text-xl font-bold text-white">New quote</h2><p className="mt-1 text-xs text-slate-500">Start from a template or build line by line from the service catalog.</p></div>
      <button className={btnOutline} onClick={onClose}>Close</button>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold text-slate-400 sm:col-span-2">Template
        <select className={`${inputCls} mt-1`} value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
          <option value="">Blank quote</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <input className={inputCls} placeholder="Quote title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input className={inputCls} placeholder="Valid days (e.g. 14)" inputMode="numeric" value={form.valid_days} onChange={(e) => setForm({ ...form, valid_days: e.target.value })} />
      <input className={inputCls} placeholder="Recipient name *" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
      <input className={inputCls} type="email" placeholder="Recipient email *" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} />
      <input className={inputCls} placeholder="Phone (optional)" value={form.recipient_phone} onChange={(e) => setForm({ ...form, recipient_phone: e.target.value })} />
      <input className={inputCls} placeholder="Company (optional)" value={form.recipient_company} onChange={(e) => setForm({ ...form, recipient_company: e.target.value })} />
      <input className={`${inputCls} sm:col-span-2`} placeholder="Property address (optional)" value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} />
      <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Intro message shown at the top of the quote" value={form.intro_message} onChange={(e) => setForm({ ...form, intro_message: e.target.value })} />
      <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Terms shown at the bottom of the quote" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
    </div>
    <div className="mt-5"><LineItemsEditor lines={lines} setLines={setLines} offerings={offerings} /></div>
    <div className="mt-5 flex flex-wrap gap-2">
      <button className={btnOutline} disabled={busy} onClick={() => void save(false)}>{busy ? 'Saving…' : 'Save Draft'}</button>
      <button className={btnPrimary} disabled={busy} onClick={() => void save(true)}>{busy ? 'Working…' : 'Save & Send'}</button>
    </div>
  </Panel>
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

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <input className={inputCls} placeholder="Quote title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input className={inputCls} type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
      <input className={inputCls} placeholder="Recipient name" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
      <input className={inputCls} type="email" placeholder="Recipient email" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} />
      <input className={`${inputCls} sm:col-span-2`} placeholder="Company" value={form.recipient_company} onChange={(e) => setForm({ ...form, recipient_company: e.target.value })} />
      <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Intro message" value={form.intro_message} onChange={(e) => setForm({ ...form, intro_message: e.target.value })} />
      <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Terms" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
    </div>
    <LineItemsEditor lines={lines} setLines={setLines} offerings={offerings} />
    <div className="flex gap-2">
      <button className={btnPrimary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save Changes'}</button>
      <button className={btnOutline} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>
}

function TemplateManager({ templates, offerings, onChanged }: { templates: TemplateRow[]; offerings: OfferingOption[]; onChanged: () => void }) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  return <div className="space-y-4">
    <div className="flex items-center justify-between">
      <p className="text-sm text-slate-400">Templates pre-fill a quote with line items, an intro message, and terms. The starter set matches the public service packages.</p>
      <button className={btnPrimary} onClick={() => setEditingId('new')}>New Template</button>
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
                {!!template.active && <button className="rounded-xl border border-red-400/20 px-4 py-2.5 text-sm font-bold text-red-200 transition hover:border-red-400/50" onClick={() => { if (confirm(`Archive "${template.name}"?`)) void api.del(`/admin/quote-templates/${template.id}`).then(onChanged).catch(() => toast.error('Could not archive the template.')) }}>Archive</button>}
              </div>
            </div>
            {template.description && <p className="mt-3 text-sm leading-6 text-slate-400">{template.description}</p>}
            <ul className="mt-3 divide-y divide-white/[.07] border-y border-white/[.07] text-xs">
              {template.line_items.map((li, index) => <li key={index} className="flex items-center justify-between gap-3 py-2"><span className="text-slate-300">{li.name}{li.quantity && li.quantity !== 1 ? ` × ${li.quantity}` : ''}</span><span className="font-semibold text-slate-200">{money(li.unit_price_cents || 0)}</span></li>)}
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
      <button className={btnPrimary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save Template'}</button>
      <button className={btnOutline} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </Panel>
}
