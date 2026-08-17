import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { DateSelect, todayIsoDate } from '../../components/kit/DateSelect'
import { toast } from '../../components/kit/toast'
import { COUNTRY_OPTIONS, US_STATES } from '../../data/regions'
import { AddressAutocomplete } from '../../components/kit/AddressAutocomplete'
import { useAppPath } from '../../lib/basePath'
import { clientEmailHref } from '../../lib/engagements'
import { useLiveRefresh } from '../../lib/liveRefresh'
import {
  INVOICE_FOCUS,
  formatInvoiceDate,
  invoiceDueLabel,
  invoiceMatchesFocus,
  invoiceMoney,
  invoiceNextAction,
  invoicePlusDays,
  invoiceStatusLabel,
  invoiceStatusTone,
  invoiceToday,
  type InvoiceFocusKey,
} from '../../../shared/invoiceWorkspace'

interface ClientOption {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  business_name: string | null
}

interface InvoiceRow {
  id: string
  client_user_id: string
  invoice_number: string | null
  customer_number: string | null
  title: string | null
  amount_cents: number
  currency: string
  status: string
  due_date: string | null
  issue_date: string | null
  sent_at: string | null
  client_name: string | null
  client_email: string
  business_name: string | null
  line_item_count: number
  created_at: string
  quote_id?: string | null
  quote_number?: string | null
}

interface ContactBlock {
  first_name: string
  last_name: string
  company: string
  address_line_1: string
  address_line_2: string
  country: string
  state: string
  city: string
  postal_code: string
  email: string
  phone: string
  fax: string
}

interface LineDraft {
  name: string
  description: string
  quantity: string
  unit_price: string
  discount: string
  taxable: boolean
  local_tax_rate: string
  national_tax_rate: string
}

interface QuoteOption {
  id: string
  quote_number: string
  title: string
  recipient_email: string
  total_cents: number
  status: string
}

const PAYMENT_OPTIONS = [
  ['card', 'Card'],
  ['ach', 'ACH'],
  ['mail', 'Mail'],
  ['apple_pay', 'Apple Pay'],
  ['google_pay', 'Google Pay'],
] as const
const DUE_SHORTCUTS = [[0, 'Today'], [7, '7 days'], [14, '14 days'], [30, '30 days']] as const

function emptyContact(): ContactBlock {
  return {
    first_name: '', last_name: '', company: '', address_line_1: '', address_line_2: '',
    country: 'United States', state: '', city: '', postal_code: '', email: '', phone: '', fax: '',
  }
}

function emptyLine(): LineDraft {
  return { name: '', description: '', quantity: '1', unit_price: '0.00', discount: '0.00', taxable: false, local_tax_rate: '0', national_tax_rate: '0' }
}

function toCents(value: string) {
  const n = Number.parseFloat(value || '0')
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0
}

function linesToPayload(lines: LineDraft[]) {
  return lines.filter((line) => line.name.trim()).map((line) => ({
    name: line.name,
    description: line.description,
    quantity: Number(line.quantity) || 1,
    unit_price_cents: toCents(line.unit_price),
    discount_cents: toCents(line.discount),
    taxable: line.taxable,
    local_tax_rate: Number(line.local_tax_rate) || 0,
    national_tax_rate: Number(line.national_tax_rate) || 0,
  }))
}

function draftTotals(lines: LineDraft[], shipping = '0.00') {
  let subtotal = 0
  let discount = 0
  let tax = 0
  for (const item of lines) {
    const gross = Math.round((Number(item.quantity) || 0) * toCents(item.unit_price))
    const itemDiscount = Math.min(gross, toCents(item.discount))
    const base = Math.max(0, gross - itemDiscount)
    subtotal += gross
    discount += itemDiscount
    if (item.taxable) tax += Math.round(base * ((Number(item.local_tax_rate) || 0) + (Number(item.national_tax_rate) || 0)) / 100)
  }
  const shippingCents = toCents(shipping)
  return { subtotal, discount, tax, shipping: shippingCents, total: Math.max(0, subtotal - discount + tax + shippingCents) }
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

function clientLabel(client: ClientOption) {
  return `${client.business_name ? `${client.business_name}: ` : ''}${client.full_name || client.email}`
}

export default function InvoicesAdmin() {
  const p = useAppPath()
  const [params, setParams] = useSearchParams()
  const [screen, setScreen] = useState<'list' | 'build'>(() => (params.get('client') || params.get('new') === '1') ? 'build' : 'list')
  const [rows, setRows] = useState<InvoiceRow[] | null>(null)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [focus, setFocus] = useState<InvoiceFocusKey>(() => (params.get('focus') as InvoiceFocusKey) || 'open')
  const [search, setSearch] = useState(params.get('q') || '')
  const [detailId, setDetailId] = useState<string | null>(params.get('invoice'))
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [invoiceResult, clientResult] = await Promise.all([
        api.get<{ invoices: InvoiceRow[] }>('/admin/invoices'),
        api.get<{ clients: ClientOption[] }>('/admin/invoice-clients'),
      ])
      setRows(invoiceResult.invoices)
      setClients(clientResult.clients)
      setError('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load invoices.')
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useLiveRefresh(load)

  function openDetail(id: string) {
    setDetailId(id)
    setScreen('list')
    const next = new URLSearchParams(params)
    next.set('invoice', id)
    next.delete('new')
    setParams(next, { replace: true })
  }

  function openBuild() {
    setDetailId(null)
    setScreen('build')
    const next = new URLSearchParams(params)
    next.delete('invoice')
    next.set('new', '1')
    setParams(next, { replace: true })
  }

  function backToList() {
    setScreen('list')
    setDetailId(null)
    const next = new URLSearchParams(params)
    next.delete('invoice')
    next.delete('new')
    setParams(next, { replace: true })
  }

  const visible = useMemo(() => {
    const list = rows || []
    const needle = search.trim().toLowerCase()
    return list.filter((invoice) => {
      if (!invoiceMatchesFocus(invoice, focus)) return false
      if (!needle) return true
      return [invoice.invoice_number, invoice.title, invoice.client_name, invoice.client_email, invoice.business_name, invoice.customer_number].some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [rows, focus, search])

  const counts = useMemo(() => {
    const list = rows || []
    return {
      open: list.filter((invoice) => invoice.status === 'open').length,
      overdue: list.filter((invoice) => invoiceMatchesFocus(invoice, 'overdue')).length,
      due_soon: list.filter((invoice) => invoiceMatchesFocus(invoice, 'due_soon')).length,
      unsent: list.filter((invoice) => invoiceMatchesFocus(invoice, 'unsent')).length,
      paid: list.filter((invoice) => invoice.status === 'paid').length,
      openValue: list.filter((invoice) => invoice.status === 'open').reduce((sum, invoice) => sum + invoice.amount_cents, 0),
    }
  }, [rows])

  async function sendInvoice(invoice: InvoiceRow) {
    try {
      const result = await api.post<{ recipients: number; sms_requested_but_not_connected?: boolean }>(`/admin/invoices/${invoice.id}/send`)
      toast.success(`Invoice emailed to ${result.recipients} recipient${result.recipients === 1 ? '' : 's'}.${result.sms_requested_but_not_connected ? ' SMS is not connected yet.' : ''}`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send the invoice.')
    }
  }

  async function markPaid(invoice: InvoiceRow) {
    try {
      await api.patch(`/admin/invoices/${invoice.id}/status`, { status: 'paid' })
      toast.success(`${invoice.invoice_number || 'Invoice'} marked paid.`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the invoice.')
    }
  }

  if (screen === 'build') {
    return <InvoiceComposer
      clients={clients}
      initialClientId={params.get('client') || ''}
      onClose={backToList}
      onSaved={(id) => { void load(); openDetail(id) }}
    />
  }

  if (detailId) {
    return <InvoiceDetail invoiceId={detailId} onBack={backToList} onChanged={load} onOpen={openDetail} />
  }

  return <div>
    <PageIntro
      kicker="Revenue"
      title="Invoices"
      subtitle="Write an invoice, send it to the client portal, and mark it paid. Pinnacle records the amount and methods; it does not charge cards or ACH here."
      action={<button className={`${btnPrimary} min-h-11 w-full justify-center sm:w-auto`} onClick={openBuild}><Plus size={14} />New invoice</button>}
    />
    {error && <div className="mb-4 rounded-xl border border-red-400/20 bg-red-400/[.06] p-4 text-sm text-red-200">{error}</div>}

    <Panel className="mb-4 !p-4">
      <div className="flex flex-wrap items-center gap-2">
        {INVOICE_FOCUS.map((item) => {
          const count = item.key === 'open' ? counts.open
            : item.key === 'overdue' ? counts.overdue
              : item.key === 'due_soon' ? counts.due_soon
                : item.key === 'unsent' ? counts.unsent
                  : item.key === 'paid' ? counts.paid
                    : item.key === 'all' ? rows?.length || 0
                      : rows?.filter((invoice) => invoiceMatchesFocus(invoice, item.key)).length || 0
          return <Chip key={item.key} label={`${item.label} (${count})`} active={focus === item.key} tone={item.key === 'overdue' ? 'red' : item.key === 'unsent' ? 'gold' : 'slate'} onClick={() => setFocus(item.key)} />
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Open invoices total {invoiceMoney(counts.openValue)}. Click a row to review, send, or mark paid.</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-slate-500"><Search size={14} /></span>
        <input className={`${inputCls} flex-1`} placeholder="Search number, client, company, or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
    </Panel>

    {rows === null ? <p className="text-sm text-slate-400">Loading invoices…</p>
      : visible.length === 0 ? <EmptyState label={rows.length === 0 ? 'No invoices yet. Create one for a client and it will show up here.' : 'Nothing matches this view.'} />
      : <>
        <div className="grid gap-3 md:hidden">
          {visible.map((invoice) => {
            const action = invoiceNextAction(invoice)
            return <article key={invoice.id} tabIndex={0} role="button" aria-label={`Open invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}`} className="cursor-pointer rounded-xl border border-white/10 bg-white/[.02] p-4 outline-none transition focus-visible:border-gold/40 focus-visible:ring-1 focus-visible:ring-gold/40" onClick={() => openDetail(invoice.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(invoice.id) } }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><b className="block truncate text-white">{invoice.invoice_number || invoice.id.slice(0, 8)}</b><p className="mt-1 truncate text-xs text-slate-400">{invoice.business_name || invoice.client_name || invoice.client_email}</p></div>
                <Tag tone={invoiceStatusTone(invoice)}>{invoiceStatusLabel(invoice)}</Tag>
              </div>
              <p className="mt-3 text-sm text-slate-300">{invoice.title || 'Invoice'}</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div><p className="font-display text-xl font-bold text-gold">{invoiceMoney(invoice.amount_cents, invoice.currency)}</p><p className="text-[11px] text-slate-500">{invoiceDueLabel(invoice)}</p></div>
                <div onClick={(e) => e.stopPropagation()}>
                  {action === 'send' && <button className={`${btnPrimary} min-h-11`} onClick={() => void sendInvoice(invoice)}>Send</button>}
                  {action === 'paid' && <button className={`${btnOutline} min-h-11`} onClick={() => void markPaid(invoice)}>Mark paid</button>}
                  {action === 'none' && <button className={`${btnOutline} min-h-11`} onClick={() => openDetail(invoice.id)}>Open</button>}
                </div>
              </div>
            </article>
          })}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-white/[0.025] text-[10px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Client</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Amount</th><th className="px-4 py-3 font-medium">Next</th></tr>
            </thead>
            <tbody>
              {visible.map((invoice) => {
                const action = invoiceNextAction(invoice)
                return (
                  <tr key={invoice.id} tabIndex={0} role="button" aria-label={`Open invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}`} className="cursor-pointer border-t border-white/5 outline-none transition hover:bg-white/[0.025] focus-visible:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-gold/40" onClick={() => openDetail(invoice.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(invoice.id) } }}>
                    <td className="px-4 py-3"><b className="block text-white">{invoice.invoice_number || invoice.id.slice(0, 8)}</b><span className="text-xs text-slate-500">{invoice.title || 'Invoice'}{invoice.quote_number ? ` · from ${invoice.quote_number}` : ''} · {invoice.line_item_count} line{Number(invoice.line_item_count) === 1 ? '' : 's'}</span></td>
                    <td className="px-4 py-3"><b className="block text-slate-200">{invoice.business_name || invoice.client_name || invoice.client_email}</b><span className="text-xs text-slate-500">{invoice.client_email}</span></td>
                    <td className="px-4 py-3"><Tag tone={invoiceStatusTone(invoice)}>{invoiceStatusLabel(invoice)}</Tag><p className="mt-1 text-[11px] text-slate-500">{invoiceDueLabel(invoice)}</p></td>
                    <td className="px-4 py-3 font-semibold text-white">{invoiceMoney(invoice.amount_cents, invoice.currency)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {action === 'send' && <button className={btnPrimary} onClick={() => void sendInvoice(invoice)}>Send</button>}
                      {action === 'paid' && <button className={btnOutline} onClick={() => void markPaid(invoice)}>Mark paid</button>}
                      {action === 'none' && <button className="text-xs font-bold text-gold hover:underline" onClick={() => openDetail(invoice.id)}>Open</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </>}
    <p className="mt-3 text-xs text-slate-600"><Link to={p('quotes')} className="text-gold hover:underline">Accepted quotes</Link> convert to an invoice from the quote record, or you can fill a new invoice from a matching quote.</p>
  </div>
}

function LineItemsEditor({ lines, setLines, shipping, setShipping }: {
  lines: LineDraft[]
  setLines: (updater: (lines: LineDraft[]) => LineDraft[]) => void
  shipping: string
  setShipping: (value: string) => void
}) {
  const totals = draftTotals(lines, shipping)
  const [advanced, setAdvanced] = useState(false)
  const update = (index: number, patch: Partial<LineDraft>) => setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line))
  return <div className="space-y-3">
    {lines.map((line, index) => <div key={index} className="rounded-xl border border-white/10 bg-white/[.02] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_7rem_8rem_auto]">
        <label className="text-[11px] font-bold text-slate-500"><span className="mb-1 block sm:hidden">Service or item</span><input className={inputCls} placeholder="What is this line for?" value={line.name} onChange={(e) => update(index, { name: e.target.value })} /></label>
        <label className="text-[11px] font-bold text-slate-500"><span className="mb-1 block sm:hidden">Quantity</span><input className={inputCls} inputMode="decimal" aria-label="Quantity" placeholder="Quantity" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} /></label>
        <label className="text-[11px] font-bold text-slate-500"><span className="mb-1 block sm:hidden">Unit price</span><input className={inputCls} inputMode="decimal" aria-label="Unit price" placeholder="Unit price" value={line.unit_price} onChange={(e) => update(index, { unit_price: e.target.value })} /></label>
        <button type="button" className="min-h-10 rounded-lg border border-red-400/15 text-xs font-bold text-red-300 hover:text-red-200 sm:border-0 sm:px-1" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</button>
      </div>
      {advanced && <>
        <textarea className={`${inputCls} mt-2 min-h-16`} placeholder="Description shown on the invoice" value={line.description} onChange={(e) => update(index, { description: e.target.value })} />
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <input className={inputCls} inputMode="decimal" placeholder="Discount $" value={line.discount} onChange={(e) => update(index, { discount: e.target.value })} />
          <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" className="accent-gold" checked={line.taxable} onChange={(e) => update(index, { taxable: e.target.checked })} />Taxable</label>
        </div>
        {line.taxable && <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input className={inputCls} placeholder="Local tax %" value={line.local_tax_rate} onChange={(e) => update(index, { local_tax_rate: e.target.value })} />
          <input className={inputCls} placeholder="National tax %" value={line.national_tax_rate} onChange={(e) => update(index, { national_tax_rate: e.target.value })} />
        </div>}
      </>}
    </div>)}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnOutline} onClick={() => setLines((current) => [...current, emptyLine()])}>Add line</button>
        <button type="button" className="text-xs font-bold text-slate-500 hover:text-gold" onClick={() => setAdvanced((v) => !v)}>{advanced ? 'Hide extras' : 'Notes, discount, tax'}</button>
      </div>
      <p className="text-sm text-slate-300">Total: <strong className="font-display text-lg text-gold">{invoiceMoney(totals.total)}</strong></p>
    </div>
    {advanced && <label className="block max-w-xs text-xs font-bold text-slate-400">Shipping / additional
      <input className={`${inputCls} mt-1`} inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} />
    </label>}
  </div>
}

function InvoiceComposer({ clients, initialClientId, onClose, onSaved }: {
  clients: ClientOption[]
  initialClientId: string
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [clientId, setClientId] = useState(initialClientId)
  const [title, setTitle] = useState('Professional services invoice')
  const [dueDate, setDueDate] = useState(invoicePlusDays(14))
  const [issueDate, setIssueDate] = useState(todayIsoDate())
  const [billTo, setBillTo] = useState<ContactBlock>(emptyContact())
  const [lines, setLinesState] = useState<LineDraft[]>([emptyLine()])
  const [shipping, setShipping] = useState('0.00')
  const [message, setMessage] = useState('Thank you for working with Pinnacle Management Ventures.')
  const [delivery, setDelivery] = useState('email')
  const [additionalEmails, setAdditionalEmails] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['card', 'ach'])
  const [quotes, setQuotes] = useState<QuoteOption[]>([])
  const [quoteId, setQuoteId] = useState('')
  const [showAddresses, setShowAddresses] = useState(false)
  const [busy, setBusy] = useState(false)
  const setLines = (updater: (lines: LineDraft[]) => LineDraft[]) => setLinesState(updater)
  const totals = draftTotals(lines, shipping)
  const client = clients.find((item) => item.id === clientId)
  const matchingQuotes = quotes.filter((quote) => client && quote.recipient_email.toLowerCase() === client.email.toLowerCase() && ['accepted', 'sent', 'viewed'].includes(quote.status))

  useEffect(() => {
    api.get<{ quotes: QuoteOption[] }>('/admin/quotes').then((res) => setQuotes(res.quotes)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!clientId) return
    api.get<{ bill_to: ContactBlock }>(`/admin/invoice-clients/${clientId}/defaults`)
      .then((defaults) => setBillTo({ ...emptyContact(), ...defaults.bill_to }))
      .catch(() => {})
  }, [clientId])

  async function fillFromQuote(id: string) {
    setQuoteId(id)
    if (!id) return
    try {
      const data = await api.get<{ quote: { title: string; intro_message: string | null }; line_items: Array<{ name: string; description: string | null; quantity: number; unit_price_cents: number; is_optional: number }> }>(`/admin/quotes/${id}`)
      setTitle(data.quote.title || title)
      if (data.quote.intro_message) setMessage(data.quote.intro_message)
      const billed = data.line_items.filter((item) => !item.is_optional)
      if (billed.length) {
        setLinesState(billed.map((item) => ({
          name: item.name,
          description: item.description || '',
          quantity: String(item.quantity || 1),
          unit_price: ((item.unit_price_cents || 0) / 100).toFixed(2),
          discount: '0.00',
          taxable: false,
          local_tax_rate: '0',
          national_tax_rate: '0',
        })))
      }
      toast.success('Quote lines copied onto this invoice.')
    } catch {
      toast.error('Could not load that quote.')
    }
  }

  function goPricing() {
    if (!clientId) return toast.error('Choose a client first.')
    setStep(2)
  }

  function goReview() {
    if (!linesToPayload(lines).length) return toast.error('Add at least one named line item.')
    setStep(3)
  }

  async function save(sendAfter: boolean) {
    const payload = linesToPayload(lines)
    if (!payload.length) return toast.error('Add at least one line item with a name.')
    if (!clientId) return toast.error('Choose a client first.')
    setBusy(true)
    try {
      const created = await api.post<{ id: string; invoice_number: string }>('/admin/invoices', {
        client_user_id: clientId,
        title,
        issue_date: issueDate,
        due_date: dueDate,
        bill_to: billTo,
        line_items: payload,
        shipping_cents: toCents(shipping),
        payment_methods: paymentMethods,
        delivery_channel: delivery,
        additional_emails: additionalEmails,
        message,
        quote_id: quoteId && matchingQuotes.find((quote) => quote.id === quoteId)?.status === 'accepted' ? quoteId : undefined,
        reminders: [
          { days_offset: 7, channel: 'email', enabled: true },
          { days_offset: 1, channel: 'email', enabled: true },
          { days_offset: -3, channel: 'email', enabled: true },
        ],
      })
      if (sendAfter) await api.post(`/admin/invoices/${created.id}/send`, {})
      toast.success(sendAfter ? `Invoice ${created.invoice_number} sent.` : `Invoice ${created.invoice_number} saved.`)
      onSaved(created.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the invoice.')
    } finally {
      setBusy(false)
    }
  }

  const steps = [{ n: 1, label: 'Client' }, { n: 2, label: 'Pricing' }, { n: 3, label: 'Review' }] as const

  return <div>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <button type="button" onClick={onClose} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-gold"><ChevronLeft size={14} />Back to invoices</button>
        <h2 className="text-xl font-bold text-white">New invoice</h2>
        <p className="mt-1 text-sm text-slate-400">Client, then pricing, then send. Address and tax details stay optional.</p>
      </div>
    </div>
    <div className="mb-5 grid grid-cols-3 gap-2">
      {steps.map((item) => (
        <button key={item.n} type="button" onClick={() => { if (item.n < step) setStep(item.n) }} className={`min-h-11 rounded-xl border px-2 py-2 text-[11px] font-bold sm:rounded-full sm:px-3 sm:text-xs ${step === item.n ? 'border-gold/50 bg-gold/10 text-gold' : item.n < step ? 'border-white/15 text-slate-300' : 'border-white/10 text-slate-600'}`}>
          {item.n}. {item.label}
        </button>
      ))}
    </div>

    {step === 1 && <Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-400 sm:col-span-2">Client
          <select className={`${inputCls} mt-1`} value={clientId} onChange={(e) => { setClientId(e.target.value); setQuoteId('') }}>
            <option value="">Choose client</option>
            {clients.map((item) => <option key={item.id} value={item.id}>{clientLabel(item)}</option>)}
          </select>
        </label>
        {matchingQuotes.length > 0 && <label className="text-xs font-bold text-slate-400 sm:col-span-2">Fill from a quote
          <select className={`${inputCls} mt-1`} value={quoteId} onChange={(e) => void fillFromQuote(e.target.value)}>
            <option value="">Start blank</option>
            {matchingQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.quote_number} · {quote.title} · {invoiceMoney(quote.total_cents)}</option>)}
          </select>
        </label>}
        <label className="text-xs font-bold text-slate-400 sm:col-span-2">Invoice title<input className={`${inputCls} mt-1`} placeholder="Professional services invoice" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="sm:col-span-2">
          <p className="mb-1 text-xs font-bold text-slate-400">Due date</p>
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {DUE_SHORTCUTS.map(([days, label]) => (
              <button key={label} type="button" onClick={() => setDueDate(invoicePlusDays(days))} className="min-h-10 rounded-lg border border-white/10 px-1 py-2 text-[11px] font-semibold text-slate-400 hover:border-gold/30 hover:text-gold">{label}</button>
            ))}
          </div>
          <DateSelect value={dueDate} onChange={setDueDate} ariaLabel="Due date" />
        </div>
      </div>
      <div className="mt-5"><button className={`${btnPrimary} min-h-12 w-full justify-center sm:ml-auto sm:w-auto`} onClick={goPricing}>Continue to pricing</button></div>
    </Panel>}

    {step === 2 && <Panel>
      <p className="mb-4 text-sm text-slate-400">Name, quantity, and price. Open extras only if you need a note, discount, or tax.</p>
      <LineItemsEditor lines={lines} setLines={setLines} shipping={shipping} setShipping={setShipping} />
      <div className="mt-5 grid grid-cols-[auto_1fr] gap-2 sm:flex sm:justify-between">
        <button className={`${btnOutline} min-h-11`} onClick={() => setStep(1)}>Back</button>
        <button className={`${btnPrimary} min-h-11 justify-center`} onClick={goReview}>Review invoice</button>
      </div>
    </Panel>}

    {step === 3 && <Panel>
      <p className="text-sm text-slate-300"><strong className="text-white">{client ? clientLabel(client) : 'Client'}</strong> · due {formatInvoiceDate(dueDate)}</p>
      <p className="mt-1 text-sm text-slate-400">Total <strong className="ml-1 font-display text-xl text-gold">{invoiceMoney(totals.total)}</strong></p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-400">Issue date<DateSelect value={issueDate} onChange={setIssueDate} ariaLabel="Issue date" /></label>
        <label className="text-xs font-bold text-slate-400">Send via
          <select className={`${inputCls} mt-1`} value={delivery} onChange={(e) => setDelivery(e.target.value)}>
            <option value="email">Email</option>
            <option value="none">Save without sending</option>
            <option value="email_text">Email (text is not connected yet)</option>
          </select>
        </label>
        <input className={`${inputCls} sm:col-span-2`} placeholder="Additional email(s), comma separated" value={additionalEmails} onChange={(e) => setAdditionalEmails(e.target.value)} />
        <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Message on the invoice" value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs font-bold text-slate-400">Accepted payment methods (display only)</p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_OPTIONS.map(([value, label]) => (
            <button type="button" key={value} onClick={() => setPaymentMethods((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} className={`rounded-full border px-3 py-1.5 text-xs ${paymentMethods.includes(value) ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-400'}`}>{label}</button>
          ))}
        </div>
      </div>
      <button type="button" className="mt-4 text-xs font-bold text-slate-500 hover:text-gold" onClick={() => setShowAddresses((v) => !v)}>{showAddresses ? 'Hide bill-to address' : 'Edit bill-to address'}</button>
      {showAddresses && <div className="mt-3"><ContactFields value={billTo} onChange={setBillTo} /></div>}
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <button className={btnOutline} onClick={() => setStep(2)}>Back</button>
        <div className="grid w-full gap-2 sm:flex sm:w-auto">
          <button className={`${btnOutline} min-h-11 justify-center`} disabled={busy} onClick={() => void save(false)}>{busy ? 'Saving…' : 'Save without sending'}</button>
          <button className={`${btnPrimary} min-h-12 justify-center`} disabled={busy} onClick={() => void save(true)}>{busy ? 'Working…' : 'Create and send'}</button>
        </div>
      </div>
    </Panel>}
  </div>
}

interface InvoiceDetailData {
  invoice: InvoiceRow & {
    message: string | null
    additional_emails: string | null
    delivery_channel: string
    payment_methods: string[]
    bill_to: ContactBlock
    payable_to: ContactBlock
    subtotal_cents: number
    discount_cents: number
    tax_cents: number
    shipping_cents: number
    client_phone?: string | null
    quote_id?: string | null
    quote_number?: string | null
  }
  line_items: Array<{ id: string; name: string; description: string | null; quantity: number; unit_price_cents: number; discount_cents: number; taxable: number; local_tax_rate: number; national_tax_rate: number }>
  reminders: Array<{ id: string; days_offset: number; enabled: number }>
}

function InvoiceDetail({ invoiceId, onBack, onChanged, onOpen }: { invoiceId: string; onBack: () => void; onChanged: () => Promise<unknown> | void; onOpen: (id: string) => void }) {
  const p = useAppPath()
  const [data, setData] = useState<InvoiceDetailData | null>(null)
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const load = useCallback(() => api.get<InvoiceDetailData>(`/admin/invoices/${invoiceId}`).then(setData).catch(() => toast.error('Could not load the invoice.')), [invoiceId])
  useEffect(() => { void load() }, [load])

  if (!data) return <div><button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-gold"><ChevronLeft size={14} />Back to invoices</button><p className="text-sm text-slate-400">Loading…</p></div>
  const { invoice, line_items, reminders } = data
  const editable = invoice.status === 'open'

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    try { await fn(); await load(); await onChanged() } catch (e) { toast.error(e instanceof ApiError ? e.message : `Could not ${label} the invoice.`) } finally { setBusy('') }
  }

  async function duplicate() {
    setBusy('duplicate')
    try {
      const created = await api.post<{ id: string; invoice_number: string }>(`/admin/invoices/${invoice.id}/duplicate`, {})
      toast.success(`Draft ${created.invoice_number} created from this invoice.`)
      await onChanged()
      onOpen(created.id)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not duplicate the invoice.')
    } finally { setBusy('') }
  }

  if (editing) {
    return <div>
      <button type="button" onClick={() => setEditing(false)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-gold"><ChevronLeft size={14} />Cancel editing</button>
      <InvoiceEditor
        invoice={invoice}
        lines={line_items.map((li) => ({
          name: li.name,
          description: li.description || '',
          quantity: String(li.quantity),
          unit_price: (li.unit_price_cents / 100).toFixed(2),
          discount: ((li.discount_cents || 0) / 100).toFixed(2),
          taxable: !!li.taxable,
          local_tax_rate: String(li.local_tax_rate || 0),
          national_tax_rate: String(li.national_tax_rate || 0),
        }))}
        shipping={((invoice.shipping_cents || 0) / 100).toFixed(2)}
        onCancel={() => setEditing(false)}
        onSaved={() => { setEditing(false); void load(); void onChanged() }}
      />
    </div>
  }

  return <div>
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-gold"><ChevronLeft size={14} />Back to invoices</button>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">{invoice.invoice_number || invoice.id.slice(0, 8)}</p>
        <h2 className="mt-1 text-xl font-bold text-white">{invoice.title || 'Invoice'}</h2>
        <p className="mt-1 text-sm text-slate-400">{invoice.business_name || invoice.client_name} · {invoice.client_email}{invoice.quote_number ? ` · from ${invoice.quote_number}` : ''}</p>
      </div>
      <Tag tone={invoiceStatusTone(invoice)}>{invoiceStatusLabel(invoice)}</Tag>
    </div>

    <div className="mb-5 flex flex-wrap items-center gap-2">
      {editable && <button className={btnPrimary} disabled={!!busy} onClick={() => act('send', () => api.post(`/admin/invoices/${invoice.id}/send`, {}))}>{busy === 'send' ? 'Sending…' : invoice.sent_at ? 'Re-send' : 'Send invoice'}</button>}
      {editable && <button className={btnOutline} disabled={!!busy} onClick={() => act('paid', () => api.patch(`/admin/invoices/${invoice.id}/status`, { status: 'paid' }))}>Mark paid</button>}
      {editable && <button className={btnOutline} disabled={!!busy} onClick={() => setEditing(true)}>Edit</button>}
      <Link className={btnOutline} to={clientEmailHref(p, { id: invoice.client_user_id, email: invoice.client_email, name: invoice.client_name })}>Email</Link>
      <Link className={btnOutline} to={p(`clients/${invoice.client_user_id}`)}>Open client</Link>
      {invoice.quote_id && <Link className={btnOutline} to={`${p('quotes')}?quote=${encodeURIComponent(invoice.quote_id)}`}>Open quote</Link>}
      <button className={btnOutline} disabled={!!busy} onClick={() => void duplicate()}>{busy === 'duplicate' ? 'Copying…' : 'Duplicate'}</button>
      <button className="text-xs font-bold text-slate-500 hover:text-white" onClick={() => setShowMore((v) => !v)}>{showMore ? 'Hide decisions' : 'Void or reopen'}</button>
    </div>
    {showMore && (
      <div className="mb-5 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/[.02] p-3">
        {invoice.status !== 'open' && <button className={btnOutline} disabled={!!busy} onClick={() => act('reopen', () => api.patch(`/admin/invoices/${invoice.id}/status`, { status: 'open' }))}>Reopen</button>}
        {editable && <button className="rounded-md border border-red-400/20 px-3 py-1.5 text-sm font-bold text-red-200 transition hover:border-red-400/50" disabled={!!busy} onClick={() => { if (confirm('Void this invoice? The client still sees it as voided.')) void act('void', () => api.patch(`/admin/invoices/${invoice.id}/status`, { status: 'void' })) }}>Void</button>}
      </div>
    )}

    <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[.03] text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Line</th><th>Qty</th><th>Unit</th><th className="pr-4 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-white/[.07]">
            {line_items.map((li) => <tr key={li.id}>
              <td className="px-4 py-3"><b className="block text-slate-200">{li.name}</b>{li.description && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{li.description}</span>}</td>
              <td className="text-slate-300">{li.quantity}</td>
              <td className="text-slate-300">{invoiceMoney(li.unit_price_cents, invoice.currency)}</td>
              <td className="pr-4 text-right font-semibold text-white">{invoiceMoney(Math.round(li.quantity * li.unit_price_cents) - (li.discount_cents || 0), invoice.currency)}</td>
            </tr>)}
          </tbody>
          <tfoot>
            {Number(invoice.discount_cents) > 0 && <tr><td className="px-4 py-2 text-slate-500" colSpan={3}>Discount</td><td className="pr-4 text-right text-slate-300">-{invoiceMoney(invoice.discount_cents, invoice.currency)}</td></tr>}
            {Number(invoice.tax_cents) > 0 && <tr><td className="px-4 py-2 text-slate-500" colSpan={3}>Tax</td><td className="pr-4 text-right text-slate-300">{invoiceMoney(invoice.tax_cents, invoice.currency)}</td></tr>}
            {Number(invoice.shipping_cents) > 0 && <tr><td className="px-4 py-2 text-slate-500" colSpan={3}>Shipping</td><td className="pr-4 text-right text-slate-300">{invoiceMoney(invoice.shipping_cents, invoice.currency)}</td></tr>}
            <tr className="border-t border-gold/25 bg-gold/[.04]"><td className="px-4 py-3 font-bold text-white" colSpan={3}>Total</td><td className="pr-4 text-right font-display text-lg font-extrabold text-gold">{invoiceMoney(invoice.amount_cents, invoice.currency)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-4 text-sm leading-6 text-slate-400">
          <p><strong className="text-slate-200">Issued:</strong> {formatInvoiceDate(invoice.issue_date || invoice.created_at)}</p>
          <p><strong className="text-slate-200">Due:</strong> {invoiceDueLabel(invoice)}</p>
          <p><strong className="text-slate-200">Delivery:</strong> {invoice.sent_at ? `Sent ${formatInvoiceDate(invoice.sent_at)}` : 'Not sent'}</p>
          {invoice.bill_to?.company && <p><strong className="text-slate-200">Bill to:</strong> {invoice.bill_to.company}</p>}
          {invoice.quote_number && <p><strong className="text-slate-200">From quote:</strong> {invoice.quote_number}</p>}
          {invoice.message && <p className="mt-2 border-t border-white/[.07] pt-2 text-xs">{invoice.message}</p>}
        </div>
        {reminders.length > 0 && <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Reminders</p>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
            {reminders.map((reminder) => <li key={reminder.id}>{reminder.enabled ? 'On' : 'Off'} · {reminder.days_offset > 0 ? `${reminder.days_offset} days before due` : reminder.days_offset === 0 ? 'Due date' : `${Math.abs(reminder.days_offset)} days after due`}</li>)}
          </ul>
        </div>}
      </div>
    </div>
  </div>
}

function InvoiceEditor({ invoice, lines: initialLines, shipping: initialShipping, onCancel, onSaved }: {
  invoice: InvoiceDetailData['invoice']
  lines: LineDraft[]
  shipping: string
  onCancel: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(invoice.title || '')
  const [dueDate, setDueDate] = useState(invoice.due_date ? invoice.due_date.slice(0, 10) : invoicePlusDays(14))
  const [issueDate, setIssueDate] = useState(invoice.issue_date ? invoice.issue_date.slice(0, 10) : invoiceToday())
  const [message, setMessage] = useState(invoice.message || '')
  const [lines, setLinesState] = useState<LineDraft[]>(initialLines)
  const [shipping, setShipping] = useState(initialShipping)
  const [busy, setBusy] = useState(false)
  const setLines = (updater: (lines: LineDraft[]) => LineDraft[]) => setLinesState(updater)

  async function save() {
    const payload = linesToPayload(lines)
    if (!payload.length) return toast.error('An invoice needs at least one line item.')
    setBusy(true)
    try {
      await api.patch(`/admin/invoices/${invoice.id}`, {
        title,
        due_date: dueDate,
        issue_date: issueDate,
        message,
        line_items: payload,
        shipping_cents: toCents(shipping),
      })
      toast.success('Invoice updated.')
      onSaved()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not update the invoice.')
    } finally { setBusy(false) }
  }

  return <Panel>
    <h2 className="text-lg font-bold text-white">Edit invoice</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <input className={inputCls} placeholder="Invoice title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <DateSelect value={dueDate} onChange={setDueDate} ariaLabel="Due date" />
      <DateSelect value={issueDate} onChange={setIssueDate} ariaLabel="Issue date" />
      <textarea className={`${inputCls} min-h-20 sm:col-span-2`} placeholder="Message" value={message} onChange={(e) => setMessage(e.target.value)} />
    </div>
    <div className="mt-4"><LineItemsEditor lines={lines} setLines={setLines} shipping={shipping} setShipping={setShipping} /></div>
    <div className="mt-4 flex gap-2">
      <button className={btnPrimary} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</button>
      <button className={btnOutline} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </Panel>
}

function ContactFields({ value, onChange }: { value: ContactBlock; onChange: (next: ContactBlock) => void }) {
  const set = (key: keyof ContactBlock, next: string) => onChange({ ...value, [key]: next })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input className={inputCls} placeholder="First name" value={value.first_name} onChange={(e) => set('first_name', e.target.value)} />
      <input className={inputCls} placeholder="Last name" value={value.last_name} onChange={(e) => set('last_name', e.target.value)} />
      <input className={`${inputCls} sm:col-span-2`} placeholder="Company" value={value.company} onChange={(e) => set('company', e.target.value)} />
      <div className="sm:col-span-2">
        <AddressAutocomplete
          value={value.address_line_1}
          onChange={(line1) => set('address_line_1', line1)}
          onSelect={(address) => onChange({
            ...value,
            address_line_1: address.line1,
            city: address.city || value.city,
            state: address.state || value.state,
            postal_code: address.postal_code || value.postal_code,
            country: address.country === 'US' ? 'United States' : (address.country || value.country),
          })}
          inputClassName={inputCls}
          placeholder="123 Main St"
        />
      </div>
      <input className={`${inputCls} sm:col-span-2`} placeholder="Address line 2" value={value.address_line_2} onChange={(e) => set('address_line_2', e.target.value)} />
      <select className={inputCls} value={value.country} onChange={(e) => set('country', e.target.value)}>
        {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.label}>{country.label}</option>)}
      </select>
      {value.country === 'United States' ? (
        <select className={inputCls} value={value.state} onChange={(e) => set('state', e.target.value)}>
          <option value="">Select state</option>
          {US_STATES.map(([code, name]) => <option key={code} value={name}>{name}</option>)}
        </select>
      ) : (
        <input className={inputCls} placeholder="State / region" value={value.state} onChange={(e) => set('state', e.target.value)} />
      )}
      <input className={inputCls} placeholder="City" value={value.city} onChange={(e) => set('city', e.target.value)} />
      <input className={inputCls} placeholder="Postal code" value={value.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
      <input className={inputCls} type="email" placeholder="Email" value={value.email} onChange={(e) => set('email', e.target.value)} />
      <input className={inputCls} placeholder="Phone" value={value.phone} onChange={(e) => set('phone', e.target.value)} />
    </div>
  )
}
