import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Crest } from '../../components/ui'
import { usePageMeta } from '../../lib/usePageMeta'
import { api, ApiError } from '../../lib/api'

interface QuoteLine {
  name: string
  description: string | null
  quantity: number
  unit_price_cents: number
  discount_cents: number
  is_optional: boolean
  is_pass_through: boolean
}

interface PublicQuote {
  quote_number: string
  status: string
  title: string
  recipient_name: string
  recipient_company: string | null
  property_address: string | null
  intro_message: string | null
  scope_notes: string | null
  terms: string | null
  pass_through_note: string | null
  valid_until: string | null
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  created_at: string
  line_items: QuoteLine[]
}

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const prettyDate = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null

export default function QuoteView() {
  const { token } = useParams<{ token: string }>()
  const [quote, setQuote] = useState<PublicQuote | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')
  usePageMeta(quote ? `Quote ${quote.quote_number} - Pinnacle Management Ventures` : 'Your Pinnacle Quote', 'Review and accept your quote from Pinnacle Management Ventures.')

  useEffect(() => {
    if (!token) return
    api.get<{ quote: PublicQuote }>(`/public-quotes/${encodeURIComponent(token)}`)
      .then((r) => setQuote(r.quote))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'This quote link is not available.'))
  }, [token])

  async function respond(decision: 'accept' | 'decline') {
    if (!token) return
    setBusy(decision)
    try {
      await api.post(`/public-quotes/${encodeURIComponent(token)}/respond`, { decision, note: note || undefined })
      setQuote((current) => current ? { ...current, status: decision === 'accept' ? 'accepted' : 'declined' } : current)
      setDeclining(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not record your response. Call (561) 388-7879 and we will handle it.')
    } finally { setBusy('') }
  }

  if (error && !quote) {
    return <div className="grid min-h-screen place-items-center bg-navy-950 px-6">
      <div className="max-w-md text-center">
        <Crest size={72} tone="light" decorative className="mx-auto" />
        <h1 className="mt-6 font-display text-2xl font-bold text-white">This quote is not available</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{error}</p>
        <p className="mt-5 text-sm text-slate-300">Questions? Call <a className="font-semibold text-gold" href="tel:+15613887879">(561) 388-7879</a> or email <a className="font-semibold text-gold" href="mailto:orders@pinnaclemanagementventures.com">orders@pinnaclemanagementventures.com</a>.</p>
      </div>
    </div>
  }
  if (!quote) return <div className="grid min-h-screen place-items-center bg-navy-950 text-sm text-slate-400">Loading your quote…</div>

  const live = quote.status === 'sent' || quote.status === 'viewed'
  const validUntil = prettyDate(quote.valid_until)
  const optionalLines = quote.line_items.filter((line) => line.is_optional)
  const includedLines = quote.line_items.filter((line) => !line.is_optional)

  return <div className="min-h-screen bg-navy-950 py-8 print:bg-white print:py-0 sm:py-14">
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      <article className="overflow-hidden rounded-2xl border border-white/10 bg-navy-900/60 shadow-[0_30px_90px_rgba(0,0,0,.35)] print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <header className="border-b border-gold/25 bg-navy-950/60 px-6 py-7 print:bg-white sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <Crest size={64} tone="light" decorative />
              <div>
                <p className="font-display text-lg font-bold tracking-[-.01em] text-white print:text-navy-950">Pinnacle Management Ventures</p>
                <p className="text-[11px] uppercase tracking-[.16em] text-gold">Professional Services Quote</p>
              </div>
            </div>
            <div className="text-right text-xs leading-5 text-slate-400 print:text-slate-600">
              <p className="font-display text-base font-bold text-white print:text-navy-950">{quote.quote_number}</p>
              <p>Prepared {prettyDate(quote.created_at) || ''}</p>
              {validUntil && <p>Valid through <strong className="text-slate-200 print:text-navy-950">{validUntil}</strong></p>}
            </div>
          </div>
        </header>

        <div className="px-6 py-7 sm:px-10">
          {quote.status === 'accepted' && <p className="mb-6 rounded-xl border border-emerald-400/25 bg-emerald-400/[.07] px-4 py-3 text-sm font-semibold text-emerald-200 print:hidden">This quote has been accepted. A Pinnacle coordinator will reach out to schedule the work.</p>}
          {quote.status === 'declined' && <p className="mb-6 rounded-xl border border-white/15 bg-white/[.03] px-4 py-3 text-sm text-slate-300 print:hidden">This quote was declined. If anything changes, call (561) 388-7879 and we will re-scope it.</p>}
          {quote.status === 'expired' && <p className="mb-6 rounded-xl border border-amber-400/25 bg-amber-400/[.06] px-4 py-3 text-sm text-amber-200 print:hidden">This quote has expired. Call (561) 388-7879 or reply to your quote email for updated pricing.</p>}
          {error && <p className="mb-6 rounded-xl border border-red-400/25 bg-red-400/[.06] px-4 py-3 text-sm text-red-200 print:hidden">{error}</p>}

          <h1 className="font-display text-2xl font-bold leading-tight tracking-[-.02em] text-white print:text-navy-950 sm:text-3xl">{quote.title}</h1>
          <div className="mt-4 grid gap-1 text-sm leading-6 text-slate-300 print:text-slate-700">
            <p><span className="text-slate-500">Prepared for:</span> <strong className="text-white print:text-navy-950">{quote.recipient_name}</strong>{quote.recipient_company ? ` · ${quote.recipient_company}` : ''}</p>
            {quote.property_address && <p><span className="text-slate-500">Property:</span> {quote.property_address}</p>}
          </div>
          {quote.intro_message && <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 print:text-slate-700">{quote.intro_message}</p>}

          <div className="mt-8 overflow-hidden rounded-xl border border-white/10 print:border-slate-300">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[.04] text-[10px] uppercase tracking-[.12em] text-slate-500 print:bg-slate-100">
                <tr><th className="px-4 py-3 sm:px-5">Service</th><th className="py-3">Qty</th><th className="py-3">Unit</th><th className="py-3 pr-4 text-right sm:pr-5">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[.07] print:divide-slate-200">
                {includedLines.map((line, index) => <tr key={index}>
                  <td className="px-4 py-3.5 sm:px-5">
                    <p className="font-semibold text-white print:text-navy-950">{line.name}{line.is_pass_through && <span className="ml-2 rounded-full border border-gold/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold">Pass-through at cost</span>}</p>
                    {line.description && <p className="mt-1 max-w-xl text-xs leading-5 text-slate-400 print:text-slate-600">{line.description}</p>}
                  </td>
                  <td className="py-3.5 text-slate-300 print:text-slate-700">{line.quantity}</td>
                  <td className="py-3.5 text-slate-300 print:text-slate-700">{money(line.unit_price_cents)}</td>
                  <td className="py-3.5 pr-4 text-right font-semibold text-white print:text-navy-950 sm:pr-5">{money(Math.round(line.quantity * line.unit_price_cents))}</td>
                </tr>)}
              </tbody>
              <tfoot>
                {quote.discount_cents > 0 && <tr className="border-t border-white/10 print:border-slate-300"><td colSpan={3} className="px-4 py-2.5 text-slate-400 sm:px-5">Discount</td><td className="py-2.5 pr-4 text-right text-slate-300 sm:pr-5">-{money(quote.discount_cents)}</td></tr>}
                <tr className="border-t border-gold/30 bg-gold/[.05] print:bg-amber-50">
                  <td colSpan={3} className="px-4 py-4 font-bold text-white print:text-navy-950 sm:px-5">Quote total</td>
                  <td className="py-4 pr-4 text-right font-display text-xl font-extrabold text-gold print:text-amber-700 sm:pr-5">{money(quote.total_cents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {optionalLines.length > 0 && <div className="mt-6">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Optional add-ons (not included in the total)</p>
            <ul className="mt-2 divide-y divide-white/[.07] rounded-xl border border-dashed border-white/15 print:border-slate-300">
              {optionalLines.map((line, index) => <li key={index} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
                <div><p className="text-sm font-semibold text-slate-200 print:text-navy-950">{line.name}</p>{line.description && <p className="mt-0.5 text-xs leading-5 text-slate-500">{line.description}</p>}</div>
                <p className="whitespace-nowrap text-sm font-semibold text-slate-300 print:text-slate-700">{money(line.unit_price_cents)}</p>
              </li>)}
            </ul>
          </div>}

          {quote.scope_notes && <div className="mt-6 rounded-xl border border-white/10 bg-white/[.02] p-4 text-sm leading-7 text-slate-300 print:border-slate-300 print:text-slate-700 sm:p-5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Scope notes</p><p className="mt-2 whitespace-pre-line">{quote.scope_notes}</p></div>}
          {quote.pass_through_note && <p className="mt-4 text-xs leading-6 text-slate-500">{quote.pass_through_note}</p>}

          {live && <div className="mt-9 print:hidden">
            {!declining ? <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => void respond('accept')} disabled={!!busy} className="rounded-xl bg-gold px-7 py-3.5 text-sm font-bold text-navy-950 transition hover:bg-gold-300 disabled:opacity-60">{busy === 'accept' ? 'Recording…' : `Accept Quote · ${money(quote.total_cents)}`}</button>
              <button onClick={() => setDeclining(true)} disabled={!!busy} className="rounded-xl border border-white/15 px-6 py-3.5 text-sm font-bold text-slate-300 transition hover:border-white/35 hover:text-white disabled:opacity-60">Decline</button>
              <button onClick={() => window.print()} className="text-sm font-semibold text-slate-400 transition hover:text-gold">Print / save PDF</button>
            </div> : <div className="rounded-xl border border-white/15 bg-white/[.02] p-4">
              <p className="text-sm font-semibold text-white">Before you go - anything we should adjust?</p>
              <textarea className="mt-3 w-full rounded-lg border border-white/15 bg-navy-950/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none" rows={3} placeholder="Optional: price, scope, timing, or anything else" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="mt-3 flex gap-2">
                <button onClick={() => void respond('decline')} disabled={!!busy} className="rounded-lg border border-red-400/25 px-5 py-2.5 text-sm font-bold text-red-200 transition hover:border-red-400/50 disabled:opacity-60">{busy === 'decline' ? 'Recording…' : 'Confirm Decline'}</button>
                <button onClick={() => setDeclining(false)} disabled={!!busy} className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-bold text-slate-300 transition hover:text-white">Back</button>
              </div>
            </div>}
            <p className="mt-4 text-xs leading-6 text-slate-500">Accepting confirms the scope above. A Pinnacle coordinator confirms scheduling and any access details before work begins. Nothing is charged on this page.</p>
          </div>}

          {quote.terms && <div className="mt-8 border-t border-white/10 pt-5 text-xs leading-6 text-slate-500 print:border-slate-300 print:text-slate-600"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Terms</p><p className="mt-2 whitespace-pre-line">{quote.terms}</p></div>}
        </div>

        <footer className="border-t border-white/10 bg-navy-950/50 px-6 py-5 text-xs leading-6 text-slate-500 print:border-slate-300 print:bg-white sm:px-10">
          <p><strong className="text-slate-300 print:text-navy-950">Pinnacle Management Ventures</strong> · (561) 388-7879 · orders@pinnaclemanagementventures.com · <Link to="/" className="text-gold hover:underline print:text-slate-600">pinnaclemanagementventures.com</Link></p>
          <p className="mt-1">Pinnacle Management Ventures is not a law firm and does not provide legal advice. Licensed activities are performed by appropriately licensed professionals in our network. Government and third-party fees are pass-through at cost.</p>
        </footer>
      </article>
    </div>
  </div>
}
