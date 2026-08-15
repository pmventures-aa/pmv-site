import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'
import { Icon } from '../../components/kit/Icon'
import { invoiceDueLabel, invoiceMoney, invoiceStatusLabel, isInvoiceOverdue } from '../../../shared/invoiceWorkspace'
import { quoteMoney, quoteStatusLabel } from '../../../shared/quoteWorkspace'
import { billingCompliance } from '../../../shared/cardBrandCompliance'

interface LineItem {
  id: string
  name: string
  description: string | null
  quantity: number
  unit_price_cents: number
  discount_cents: number
}

interface Invoice {
  id: string
  invoice_number: string | null
  customer_number: string | null
  title: string | null
  amount_cents: number
  subtotal_cents?: number
  discount_cents?: number
  tax_cents?: number
  shipping_cents?: number
  currency: string
  status: string
  due_date: string | null
  issue_date?: string | null
  message?: string | null
  payment_methods_json?: string | null
  card_processor_label?: string | null
  quote_number?: string | null
  sent_at?: string | null
  created_at: string
  line_items?: LineItem[]
}

interface PaymentMethod {
  id: string
  method_type: string
  account_holder_name: string | null
  bank_name: string | null
  account_type: string | null
  account_last4: string | null
}

interface PortalQuote {
  id: string
  quote_number: string
  public_token: string
  status: string
  title: string
  total_cents: number
  valid_until: string | null
  decision_note: string | null
  decided_at: string | null
}

function parseMethods(raw: string | null | undefined) {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
const methodLabel: Record<string, string> = { card: 'Card', apple_pay: 'Apple Pay', google_pay: 'Google Pay', ach: 'ACH', mail: 'Mail' }

export default function Billing() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [quotes, setQuotes] = useState<PortalQuote[]>([])
  const [vault, setVault] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ invoices: Invoice[]; quotes?: PortalQuote[]; payment_methods?: PaymentMethod[] }>('/portal/billing')
      setInvoices(res.invoices)
      setQuotes(res.quotes || [])
      setVault(res.payment_methods || [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const openTotal = useMemo(() => invoices.filter((i) => i.status === 'open').reduce((s, i) => s + i.amount_cents, 0), [invoices])
  const openCount = invoices.filter((i) => i.status === 'open').length
  const overdueCount = invoices.filter((i) => isInvoiceOverdue(i)).length
  const liveQuotes = quotes.filter((q) => q.status === 'sent' || q.status === 'viewed')

  return (
    <div>
      <PageHeader eyebrow="Billing" title="Invoices and quotes" subtitle="Quotes first, then invoices and the payment methods on file." />
      <p className="mb-3 text-xs leading-5 text-slate-500">{billingCompliance.noCardStorage} {billingCompliance.storedAch}</p>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:max-w-2xl">
        <Card className="p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Open balance</p>
          <p className="mt-1 text-2xl font-semibold text-white">{invoiceMoney(openTotal)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{openCount} open{overdueCount ? ` · ${overdueCount} overdue` : ''}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Payment status</p>
          <p className="mt-1 text-base font-semibold text-white">{overdueCount ? 'Past due' : openCount ? 'Action may be needed' : 'Current'}</p>
          <p className="mt-0.5 text-xs text-slate-500">{billingCompliance.processor}</p>
        </Card>
      </div>

      {loading ? <Card><p className="text-sm text-slate-400">Loading…</p></Card> : (
        <div className="space-y-5">
          {vault.length > 0 && (
            <section className="space-y-2">
              {vault.map((m) => (
                <Card key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-white">ACH ·····{m.account_last4 || '••••'}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{[m.account_holder_name, m.bank_name, m.account_type].filter(Boolean).join(' · ')}</p>
                  </div>
                  <StatusBadge tone="slate">Bank account</StatusBadge>
                </Card>
              ))}
            </section>
          )}
          {liveQuotes.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-white">Quotes awaiting your reply</h2>
              <p className="mt-1 text-xs text-slate-500">Accept or decline with optional notes. Nothing is charged on the quote page.</p>
              <div className="mt-3 space-y-3">
                {liveQuotes.map((quote) => (
                  <Card key={quote.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-white">{quote.quote_number}: {quote.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{quoteStatusLabel(quote.status)} · {quoteMoney(quote.total_cents)}</p>
                    </div>
                    <a href={`/quote/${encodeURIComponent(quote.public_token)}`} className="btn-gold shrink-0 text-center">Review and respond</a>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {quotes.some((q) => q.status === 'accepted' || q.status === 'declined') && (
            <section>
              <h2 className="text-sm font-semibold text-white">Recent decisions</h2>
              <ul className="mt-3 divide-y divide-white/10 border-y border-white/10">
                {quotes.filter((q) => q.status === 'accepted' || q.status === 'declined').map((quote) => (
                  <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span className="text-slate-200">{quote.quote_number}: {quote.title}</span>
                    <span className="text-xs text-slate-500">{quoteStatusLabel(quote.status)}{quote.decision_note ? ` · ${quote.decision_note}` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {invoices.length === 0 ? <Card><EmptyState label="No invoices yet." /></Card> : (
            <div className="space-y-3">
              {invoices.map((inv) => {
                const accepted = parseMethods(inv.payment_methods_json)
                const overdue = isInvoiceOverdue(inv)
                return (
                  <Card key={inv.id} className="!p-0 overflow-hidden">
                    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-white">{inv.title || 'Pinnacle invoice'}</h2>
                          <StatusBadge tone={inv.status === 'paid' ? 'green' : inv.status === 'void' ? 'slate' : overdue ? 'red' : 'gold'}>{invoiceStatusLabel(inv)}</StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{inv.invoice_number || `Invoice ${inv.id.slice(0, 8)}`}{inv.quote_number ? ` · from ${inv.quote_number}` : ''}{inv.customer_number ? ` · Customer ${inv.customer_number}` : ''}</p>
                        <p className="mt-2 text-xl font-semibold text-white">{invoiceMoney(inv.amount_cents, inv.currency)}</p>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                          <span>Issued {inv.issue_date ? new Date(`${inv.issue_date}T12:00:00`).toLocaleDateString() : new Date(inv.created_at).toLocaleDateString()}</span>
                          <span>{invoiceDueLabel(inv)}</span>
                        </div>
                      </div>
                      {inv.status === 'open' && (
                        <div className={`rounded-md border px-3 py-2 text-sm ${overdue ? 'border-red-400/25 bg-red-400/[.06] text-red-100' : 'border-gold/15 bg-gold/[.05] text-slate-300'}`}>
                          <p className="font-medium text-gold">{overdue ? 'Past due' : 'Payment due'}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-400">Contact your Pinnacle team if you need payment instructions or have a billing question.</p>
                        </div>
                      )}
                    </div>
                    <details className="border-t border-white/10">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/[.025]">
                        <span>Invoice details</span>
                        <Icon name="chevronRight" size={16} />
                      </summary>
                      <div className="grid gap-4 border-t border-white/5 p-3 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lines</p>
                          {(inv.line_items || []).length ? (
                            <ul className="mt-3 space-y-2 text-sm">
                              {inv.line_items!.map((line) => (
                                <li key={line.id} className="flex justify-between gap-3">
                                  <span className="text-slate-300">{line.name}{line.quantity !== 1 ? ` × ${line.quantity}` : ''}</span>
                                  <span className="text-slate-200">{invoiceMoney(Math.round(line.quantity * line.unit_price_cents) - (line.discount_cents || 0), inv.currency)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-sm text-slate-500">No line items on this invoice.</p>
                          )}
                          <dl className="mt-4 space-y-2 text-sm">
                            {Number(inv.discount_cents) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Discount</dt><dd>-{invoiceMoney(inv.discount_cents || 0, inv.currency)}</dd></div>}
                            {Number(inv.tax_cents) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd>{invoiceMoney(inv.tax_cents || 0, inv.currency)}</dd></div>}
                            {Number(inv.shipping_cents) > 0 && <div className="flex justify-between"><dt className="text-slate-500">Shipping / additional</dt><dd>{invoiceMoney(inv.shipping_cents || 0, inv.currency)}</dd></div>}
                            <div className="flex justify-between border-t border-white/10 pt-2 font-semibold"><dt>Total</dt><dd className="text-gold">{invoiceMoney(inv.amount_cents, inv.currency)}</dd></div>
                          </dl>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available payment methods</p>
                          {accepted.length ? <div className="mt-2 flex flex-wrap gap-1.5">{accepted.map((m) => <span key={m} className="rounded-sm border border-white/10 bg-white/[.03] px-2 py-0.5 text-xs text-slate-300">{methodLabel[m] || m}</span>)}</div> : <p className="mt-2 text-sm text-slate-500">Contact Pinnacle for payment instructions.</p>}
                          {inv.card_processor_label && <p className="mt-3 text-xs text-slate-500">Card charges, if any, go through {inv.card_processor_label}. Card numbers are not entered on this page.</p>}
                          {inv.message && <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Message</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{inv.message}</p></div>}
                        </div>
                      </div>
                    </details>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
