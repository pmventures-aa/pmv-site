import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { DateSelect, todayIsoDate } from '../../components/kit/DateSelect'
import { Icon } from '../../components/kit/Icon'
import { toast } from '../../components/kit/toast'
import { COUNTRY_OPTIONS, US_STATES } from '../../data/regions'
import { AddressAutocomplete } from '../../components/kit/AddressAutocomplete'

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

interface LineItem {
  name: string
  description: string
  quantity: number
  unit_price: string
  discount: string
  shipped: boolean
  taxable: boolean
  local_tax_rate: string
  national_tax_rate: string
}

interface Reminder {
  days_offset: number
  channel: string
  enabled: boolean
}

const CURRENCIES = ['USD', 'CAD', 'MXN', 'AUD', 'EUR', 'GBP', 'SEK', 'PHP', 'NOK', 'DKK', 'JPY', 'RUB', 'PLN', 'INR', 'CNY']
const PAYMENT_OPTIONS = [
  ['card', 'Card'],
  ['apple_pay', 'Apple Pay'],
  ['google_pay', 'Google Pay'],
  ['ach', 'ACH'],
  ['mail', 'Mail'],
] as const
const DUE_SHORTCUTS = [
  [0, 'Today'],
  [7, '7d'],
  [14, '14d'],
  [30, '30d'],
] as const

function emptyContact(): ContactBlock {
  return {
    first_name: '',
    last_name: '',
    company: '',
    address_line_1: '',
    address_line_2: '',
    country: 'United States',
    state: '',
    city: '',
    postal_code: '',
    email: '',
    phone: '',
    fax: '',
  }
}

function newLine(): LineItem {
  return {
    name: 'Professional services',
    description: '',
    quantity: 1,
    unit_price: '0.00',
    discount: '0.00',
    shipped: false,
    taxable: false,
    local_tax_rate: '0',
    national_tax_rate: '0',
  }
}

function plusDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dollars(cents: number) {
  return `$${(Number(cents || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function toCents(value: string) {
  const n = Number.parseFloat(value || '0')
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0
}

function ContactFields({ value, onChange }: { value: ContactBlock; onChange: (next: ContactBlock) => void }) {
  const set = (key: keyof ContactBlock, next: string) => onChange({ ...value, [key]: next })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label>
        <span className="mb-1 block text-xs text-slate-400">First name</span>
        <input className={inputCls} value={value.first_name} onChange={(e) => set('first_name', e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-slate-400">Last name</span>
        <input className={inputCls} value={value.last_name} onChange={(e) => set('last_name', e.target.value)} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-slate-400">Company</span>
        <input className={inputCls} value={value.company} onChange={(e) => set('company', e.target.value)} />
      </label>
      <div className="sm:col-span-2">
        <span className="mb-1 block text-xs text-slate-400">Address line 1</span>
        <AddressAutocomplete
          value={value.address_line_1}
          onChange={(line1) => set('address_line_1', line1)}
          onSelect={(address) => {
            // Snap city / state / postal / country to whatever the picked
            // suggestion resolved to. Preserves any existing line 2, email
            // and phone the operator has already typed.
            onChange({
              ...value,
              address_line_1: address.line1,
              city: address.city || value.city,
              state: address.state || value.state,
              postal_code: address.postal_code || value.postal_code,
              country: address.country === 'US' ? 'United States' : (address.country || value.country),
            })
          }}
          inputClassName={inputCls}
          placeholder="123 Main St"
        />
      </div>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs text-slate-400">Address line 2</span>
        <input className={inputCls} value={value.address_line_2} onChange={(e) => set('address_line_2', e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-slate-400">Country</span>
        <select className={inputCls} value={value.country} onChange={(e) => set('country', e.target.value)}>
          {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.label}>{country.label}</option>)}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs text-slate-400">State / region</span>
        {value.country === 'United States' ? (
          <select className={inputCls} value={value.state} onChange={(e) => set('state', e.target.value)}>
            <option value="">Select state</option>
            {US_STATES.map(([code, name]) => <option key={code} value={name}>{name}</option>)}
          </select>
        ) : (
          <input className={inputCls} value={value.state} onChange={(e) => set('state', e.target.value)} />
        )}
      </label>
      <label>
        <span className="mb-1 block text-xs text-slate-400">City</span>
        <input className={inputCls} value={value.city} onChange={(e) => set('city', e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-slate-400">Postal code</span>
        <input className={inputCls} value={value.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-slate-400">Email</span>
        <input type="email" className={inputCls} value={value.email} onChange={(e) => set('email', e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-slate-400">Phone</span>
        <input className={inputCls} value={value.phone} onChange={(e) => set('phone', e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-slate-400">Fax</span>
        <input className={inputCls} value={value.fax} onChange={(e) => set('fax', e.target.value)} />
      </label>
    </div>
  )
}

export default function InvoicesAdmin() {
  const [params] = useSearchParams()
  const requestedClient = params.get('client') || ''
  const [clients, setClients] = useState<ClientOption[]>([])
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [clientId, setClientId] = useState(requestedClient)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [customerNumber, setCustomerNumber] = useState('')
  const [title, setTitle] = useState('Professional services invoice')
  const [currency, setCurrency] = useState('USD')
  const [issueDate, setIssueDate] = useState(todayIsoDate())
  const [dueDate, setDueDate] = useState(plusDays(14))
  const [billTo, setBillTo] = useState<ContactBlock>(emptyContact())
  const [payableTo, setPayableTo] = useState<ContactBlock>(emptyContact())
  const [lineItems, setLineItems] = useState<LineItem[]>([newLine()])
  const [shipping, setShipping] = useState('0.00')
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['card', 'ach'])
  const [cardProcessor, setCardProcessor] = useState('Default')
  const [transactionType, setTransactionType] = useState('sale')
  const [achProcessor, setAchProcessor] = useState('Default')
  const [secCodes, setSecCodes] = useState<string[]>(['PPD', 'CCD', 'WEB'])
  const [partialType, setPartialType] = useState('none')
  const [partialAmount, setPartialAmount] = useState('0.00')
  const [requireShipping, setRequireShipping] = useState(false)
  const [saveCustomer, setSaveCustomer] = useState('none')
  const [sendReceipt, setSendReceipt] = useState(true)
  const [delivery, setDelivery] = useState('email')
  const [additionalEmails, setAdditionalEmails] = useState('')
  const [message, setMessage] = useState('Thank you for working with Pinnacle Management Ventures.')
  const [reminders, setReminders] = useState<Reminder[]>([
    { days_offset: 7, channel: 'email', enabled: true },
    { days_offset: 1, channel: 'email', enabled: true },
    { days_offset: -3, channel: 'email', enabled: true },
  ])

  const load = useCallback(async () => {
    const query = new URLSearchParams()
    if (search.trim()) query.set('q', search.trim())
    if (status) query.set('status', status)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    const [invoiceResult, clientResult] = await Promise.all([
      api.get<{ invoices: InvoiceRow[] }>(`/admin/invoices${suffix}`),
      api.get<{ clients: ClientOption[] }>('/admin/invoice-clients'),
    ])
    setRows(invoiceResult.invoices)
    setClients(clientResult.clients)
  }, [search, status])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (requestedClient) {
      setClientId(requestedClient)
      setCreating(true)
    }
  }, [requestedClient])

  useEffect(() => {
    if (!clientId) return
    api.get<{ bill_to: ContactBlock; payable_to: ContactBlock }>(`/admin/invoice-clients/${clientId}/defaults`)
      .then((defaults) => {
        setBillTo({ ...emptyContact(), ...defaults.bill_to })
        setPayableTo({ ...emptyContact(), ...defaults.payable_to })
      })
      .catch(() => {})
  }, [clientId])

  const totals = useMemo(() => {
    let subtotal = 0
    let discount = 0
    let tax = 0
    for (const item of lineItems) {
      const gross = Math.round((Number(item.quantity) || 0) * toCents(item.unit_price))
      const itemDiscount = Math.min(gross, toCents(item.discount))
      const base = Math.max(0, gross - itemDiscount)
      subtotal += gross
      discount += itemDiscount
      if (item.taxable) tax += Math.round(base * ((Number(item.local_tax_rate) || 0) + (Number(item.national_tax_rate) || 0)) / 100)
    }
    const shippingCents = toCents(shipping)
    return { subtotal, discount, tax, shipping: shippingCents, total: Math.max(0, subtotal - discount + tax + shippingCents) }
  }, [lineItems, shipping])

  function toggle(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  function updateLine(index: number, patch: Partial<LineItem>) {
    setLineItems((items) => items.map((row, i) => i === index ? { ...row, ...patch } : row))
  }

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) return toast.error('Choose a client first.')
    setBusy(true)
    try {
      const result = await api.post<{ id: string; invoice_number: string }>('/admin/invoices', {
        client_user_id: clientId,
        invoice_number: invoiceNumber || undefined,
        customer_number: customerNumber || undefined,
        title,
        currency,
        issue_date: issueDate,
        due_date: dueDate,
        bill_to: billTo,
        payable_to: payableTo,
        line_items: lineItems.map((item) => ({
          ...item,
          unit_price_cents: toCents(item.unit_price),
          discount_cents: toCents(item.discount),
          local_tax_rate: Number(item.local_tax_rate) || 0,
          national_tax_rate: Number(item.national_tax_rate) || 0,
        })),
        shipping_cents: toCents(shipping),
        payment_methods: paymentMethods,
        card_processor_label: cardProcessor,
        transaction_type: transactionType,
        ach_processor_label: achProcessor,
        ach_sec_codes: secCodes,
        partial_payment_type: partialType,
        partial_payment_amount_cents: toCents(partialAmount),
        require_shipping_details: requireShipping,
        save_customer_mode: saveCustomer,
        send_receipt: sendReceipt,
        delivery_channel: delivery,
        additional_emails: additionalEmails,
        message,
        reminders,
      })
      toast.success(`Invoice ${result.invoice_number} created.`)
      setCreating(false)
      setInvoiceNumber('')
      setCustomerNumber('')
      setLineItems([newLine()])
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create invoice.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(id: string, next: string) {
    try {
      await api.patch(`/admin/invoices/${id}/status`, { status: next })
      toast.success('Invoice updated.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update invoice.')
    }
  }

  async function sendInvoice(id: string) {
    try {
      const result = await api.post<{ recipients: number; sms_requested_but_not_connected?: boolean }>(`/admin/invoices/${id}/send`)
      toast.success(`Invoice emailed to ${result.recipients} recipient${result.recipients === 1 ? '' : 's'}.${result.sms_requested_but_not_connected ? ' SMS is not connected yet.' : ''}`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send invoice.')
    }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageIntro
        kicker="Billing operations"
        title="Invoices"
        subtitle="Create, send, track, and manage detailed client invoices without processing cards or ACH inside Pinnacle."
        action={(
          <button onClick={() => setCreating((value) => !value)} className={btnPrimary}>
            <Icon name={creating ? 'close' : 'plus'} size={16} />
            {creating ? 'Close editor' : 'New invoice'}
          </button>
        )}
      />

      {creating && (
        <form onSubmit={createInvoice} className="mb-8 space-y-4">
          <Panel className="relative overflow-hidden !p-0">
            <div className="border-b border-white/10 bg-gradient-to-r from-gold/[0.06] to-transparent px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-gold">1 · Start here</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Client & invoice basics</h2>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              <label className="lg:col-span-2">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Client *</span>
                <select required className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Choose client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.business_name ? `${client.business_name} — ` : ''}{client.full_name || client.email}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs text-slate-400">Invoice number</span>
                <input className={inputCls} placeholder="Auto-generated if blank" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              </label>
              <label>
                <span className="mb-1.5 block text-xs text-slate-400">Customer number</span>
                <input className={inputCls} placeholder="Auto-generated if blank" value={customerNumber} onChange={(e) => setCustomerNumber(e.target.value)} />
              </label>
              <label className="lg:col-span-2">
                <span className="mb-1.5 block text-xs text-slate-400">Invoice title</span>
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <div>
                <span className="mb-1.5 block text-xs text-slate-400">Issue date</span>
                <DateSelect value={issueDate} onChange={setIssueDate} ariaLabel="Issue date" />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">Date due</span>
                  <div className="flex gap-1">
                    {DUE_SHORTCUTS.map(([days, label]) => (
                      <button key={label} type="button" onClick={() => setDueDate(plusDays(days))} className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 hover:border-gold/30 hover:text-gold">
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <DateSelect value={dueDate} onChange={setDueDate} ariaLabel="Due date" />
              </div>
              <label>
                <span className="mb-1.5 block text-xs text-slate-400">Currency</span>
                <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
          </Panel>

          <Panel className="!p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-gold">2 · Line items</p>
                <h2 className="mt-1 text-lg font-semibold text-white">What are you billing for?</h2>
              </div>
              <button type="button" onClick={() => setLineItems((value) => [...value, newLine()])} className={btnOutline}>
                <Icon name="plus" size={14} /> Add line
              </button>
            </div>
            <div className="space-y-4 p-5">
              {lineItems.map((item, index) => (
                <div key={index} className="rounded-xl border border-white/10 bg-white/[.02] p-4">
                  <div className="grid gap-3 lg:grid-cols-[1.1fr_1.5fr_.55fr_.75fr_.75fr_auto]">
                    <input className={inputCls} placeholder="Name" value={item.name} onChange={(e) => updateLine(index, { name: e.target.value })} />
                    <input className={inputCls} placeholder="Description" value={item.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
                    <input className={inputCls} type="number" min="0" step=".01" placeholder="Qty" value={item.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} />
                    <input className={inputCls} inputMode="decimal" placeholder="Unit $" value={item.unit_price} onChange={(e) => updateLine(index, { unit_price: e.target.value })} />
                    <input className={inputCls} inputMode="decimal" placeholder="Discount $" value={item.discount} onChange={(e) => updateLine(index, { discount: e.target.value })} />
                    <button type="button" disabled={lineItems.length === 1} onClick={() => setLineItems((value) => value.filter((_, i) => i !== index))} className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 text-slate-500 hover:border-rose-400/30 hover:text-rose-300 disabled:opacity-30">
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={item.taxable} onChange={(e) => updateLine(index, { taxable: e.target.checked })} />Taxable</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={item.shipped} onChange={(e) => updateLine(index, { shipped: e.target.checked })} />Shipped</label>
                    {item.taxable && (
                      <>
                        <label className="flex items-center gap-2">Local tax % <input className="w-20 rounded border border-white/10 bg-navy-900 px-2 py-1" value={item.local_tax_rate} onChange={(e) => updateLine(index, { local_tax_rate: e.target.value })} /></label>
                        <label className="flex items-center gap-2">National tax % <input className="w-20 rounded border border-white/10 bg-navy-900 px-2 py-1" value={item.national_tax_rate} onChange={(e) => updateLine(index, { national_tax_rate: e.target.value })} /></label>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div className="grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-[1fr_300px]">
                <label>
                  <span className="mb-1 block text-xs text-slate-400">Shipping / additional item</span>
                  <input className={inputCls} inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} />
                </label>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{dollars(totals.subtotal)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd>-{dollars(totals.discount)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd>{dollars(totals.tax)}</dd></div>
                  <div className="flex justify-between border-t border-white/10 pt-2 text-base font-semibold"><dt>Total</dt><dd className="text-gold">{dollars(totals.total)}</dd></div>
                </dl>
              </div>
            </div>
          </Panel>

          <details className="group rounded-xl border border-white/10 bg-white/[.02]">
            <summary className="cursor-pointer list-none px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-gold">3 · Address details</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Bill to & payable to</h2>
                  <p className="mt-1 text-sm text-slate-500">Prefilled from the client and firm profiles. Open only if something needs changing.</p>
                </div>
                <Icon name="chevronRight" size={18} className="transition group-open:rotate-90" />
              </div>
            </summary>
            <div className="grid gap-6 border-t border-white/10 p-5 xl:grid-cols-2">
              <div><h3 className="mb-3 text-sm font-semibold text-white">Bill to</h3><ContactFields value={billTo} onChange={setBillTo} /></div>
              <div><h3 className="mb-3 text-sm font-semibold text-white">Payable to</h3><ContactFields value={payableTo} onChange={setPayableTo} /></div>
            </div>
          </details>

          <details className="group rounded-xl border border-white/10 bg-white/[.02]">
            <summary className="cursor-pointer list-none px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-gold">4 · Payment preferences</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Accepted methods & invoice controls</h2>
                  <p className="mt-1 text-sm text-slate-500">Record/display options only. Pinnacle does not charge cards or ACH from this invoice screen.</p>
                </div>
                <Icon name="chevronRight" size={18} className="transition group-open:rotate-90" />
              </div>
            </summary>
            <div className="grid gap-5 border-t border-white/10 p-5 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs text-slate-400">Available payments</p>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_OPTIONS.map(([value, label]) => (
                    <button type="button" key={value} onClick={() => toggle(paymentMethods, value, setPaymentMethods)} className={`rounded-full border px-3 py-2 text-xs ${paymentMethods.includes(value) ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label><span className="mb-1 block text-xs text-slate-400">Card processor label</span><input className={inputCls} value={cardProcessor} onChange={(e) => setCardProcessor(e.target.value)} /></label>
              <label><span className="mb-1 block text-xs text-slate-400">Transaction type</span><select className={inputCls} value={transactionType} onChange={(e) => setTransactionType(e.target.value)}><option value="sale">Sale</option><option value="authorization">Authorization</option></select></label>
              <label><span className="mb-1 block text-xs text-slate-400">ACH processor label</span><input className={inputCls} value={achProcessor} onChange={(e) => setAchProcessor(e.target.value)} /></label>
              <div>
                <p className="mb-2 text-xs text-slate-400">ACH SEC codes</p>
                <div className="flex gap-2">
                  {['PPD', 'CCD', 'WEB'].map((value) => (
                    <button type="button" key={value} onClick={() => toggle(secCodes, value, setSecCodes)} className={`rounded border px-3 py-2 text-xs ${secCodes.includes(value) ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-400'}`}>{value}</button>
                  ))}
                </div>
              </div>
              <label><span className="mb-1 block text-xs text-slate-400">Partial payment</span><select className={inputCls} value={partialType} onChange={(e) => setPartialType(e.target.value)}><option value="none">None</option><option value="line_items">By line items</option><option value="amount">Specific amount</option></select></label>
              {partialType === 'amount' && <label><span className="mb-1 block text-xs text-slate-400">Partial amount ($)</span><input className={inputCls} value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} /></label>}
              <label><span className="mb-1 block text-xs text-slate-400">Save customer to vault</span><select className={inputCls} value={saveCustomer} onChange={(e) => setSaveCustomer(e.target.value)}><option value="none">None</option><option value="optional">Optional</option><option value="required">Required</option></select></label>
              <div className="flex flex-col gap-3 text-sm text-slate-300">
                <label className="flex items-center gap-2"><input type="checkbox" checked={requireShipping} onChange={(e) => setRequireShipping(e.target.checked)} />Require shipping details</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={sendReceipt} onChange={(e) => setSendReceipt(e.target.checked)} />Send receipt</label>
              </div>
            </div>
          </details>

          <Panel>
            <div className="grid gap-4 lg:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs text-slate-400">Send invoice via</span>
                <select className={inputCls} value={delivery} onChange={(e) => setDelivery(e.target.value)}>
                  <option value="email">Email</option>
                  <option value="text">Text (not connected yet)</option>
                  <option value="email_text">Email & text</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label><span className="mb-1 block text-xs text-slate-400">Additional email(s)</span><input className={inputCls} placeholder="comma separated" value={additionalEmails} onChange={(e) => setAdditionalEmails(e.target.value)} /></label>
              <label className="lg:col-span-2"><span className="mb-1 block text-xs text-slate-400">Message</span><textarea className={`${inputCls} min-h-24`} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
              <div className="lg:col-span-2">
                <p className="mb-2 text-xs text-slate-400">Reminder schedule</p>
                <div className="flex flex-wrap gap-2">
                  {reminders.map((reminder, index) => (
                    <label key={`${reminder.days_offset}-${index}`} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs">
                      <input type="checkbox" checked={reminder.enabled} onChange={(e) => setReminders((items) => items.map((item, i) => i === index ? { ...item, enabled: e.target.checked } : item))} />
                      <span>{reminder.days_offset > 0 ? `${reminder.days_offset} days before` : reminder.days_offset === 0 ? 'Due date' : `${Math.abs(reminder.days_offset)} days after`}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy} className={btnPrimary}><Icon name="billing" size={16} />{busy ? 'Creating…' : `Create invoice · ${dollars(totals.total)}`}</button>
              <button type="button" onClick={() => setCreating(false)} className={btnOutline}>Cancel</button>
            </div>
          </Panel>
        </form>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input className={`${inputCls} max-w-md`} placeholder="Search invoice, client, company…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={`${inputCls} sm:w-40`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
      </div>

      <Panel className="!p-0">
        {rows.length === 0 ? (
          <div className="p-6"><EmptyState label="No invoices match this view." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Due</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Delivery</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-white/5 transition hover:bg-white/[.025]">
                    <td className="px-5 py-3"><p className="font-medium text-white">{row.invoice_number || row.id.slice(0, 8)}</p><p className="text-xs text-slate-500">{row.title || 'Invoice'} · {row.line_item_count} line{Number(row.line_item_count) === 1 ? '' : 's'}</p></td>
                    <td className="px-5 py-3"><p className="text-slate-200">{row.business_name || row.client_name || row.client_email}</p><p className="text-xs text-slate-500">{row.client_email}</p></td>
                    <td className="px-5 py-3 text-slate-300">{row.due_date ? new Date(`${row.due_date}T12:00:00`).toLocaleDateString() : '—'}</td>
                    <td className="px-5 py-3 font-medium text-white">{dollars(row.amount_cents)}</td>
                    <td className="px-5 py-3"><Tag tone={row.status === 'paid' ? 'green' : row.status === 'void' ? 'slate' : 'gold'}>{row.status}</Tag></td>
                    <td className="px-5 py-3 text-xs text-slate-400">{row.sent_at ? 'Sent' : 'Not sent'}</td>
                    <td className="px-5 py-3">
                      {row.status === 'open' && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => sendInvoice(row.id)} className="inline-flex items-center gap-1 text-xs font-medium text-gold hover:underline"><Icon name="send" size={13} />Send</button>
                          <button onClick={() => changeStatus(row.id, 'paid')} className="text-xs text-slate-400 hover:text-white">Mark paid</button>
                          <button onClick={() => changeStatus(row.id, 'void')} className="text-xs text-slate-500 hover:text-rose-300">Void</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
