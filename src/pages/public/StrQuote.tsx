import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { btnPrimary, btnOutline } from '../../components/public/ui'
import { usePageMeta } from '../../lib/usePageMeta'
import { api, ApiError } from '../../lib/api'

const UNIT_TYPES = ['Condo', 'Townhome', 'Single-family home', 'Duplex / triplex', 'Multi-unit building', 'Vacation rental villa', 'Other']
const COUNTS = ['1', '2-3', '4-10', '10+']
const FREQUENCIES = ['Once in a while', '1-2 per month', '3-6 per month', '7+ per month']

export default function StrQuote() {
  usePageMeta('Get an STR Turnover Quote - Pinnacle Management Ventures', 'Tell us about your short-term rental and get a per-turnover price in writing. Checked by a real person within two business hours.')
  const [params] = useSearchParams()
  const [form, setForm] = useState<Record<string, string>>({
    name: '', email: '', phone: '', property_address: '', city: '', state: '', unit_type: UNIT_TYPES[0],
    property_count: COUNTS[0], avg_turnovers_per_month: FREQUENCIES[0], current_cleaning: '', notes: '',
  })
  const [managed, setManaged] = useState(params.get('managed') === '1')
  const [guestReadyPlus, setGuestReadyPlus] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/str/leads', {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        property_address: form.property_address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        unit_type: form.unit_type,
        property_count: form.property_count,
        avg_turnovers_per_month: form.avg_turnovers_per_month,
        current_cleaning: form.current_cleaning || undefined,
        guest_ready_plus: guestReadyPlus,
        managed,
        notes: form.notes || undefined,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'We could not submit that request. Please try again.')
    } finally { setBusy(false) }
  }

  const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400'
  const inputCls = 'w-full rounded-md border border-white/10 bg-white/[.03] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none'

  return (
    <div className="pmv-care-plans min-h-screen bg-navy-950">
      <Header />
      <main>
        <section className="pmv-hero-story relative overflow-hidden border-b border-white/[.08]">
          <div className="pmv-hero-gold" aria-hidden="true" />
          <div className="container-pmv relative z-10 py-12 sm:py-16">
            <Reveal distance={14}>
              <p className="eyebrow">STR Turnover quote</p>
              <h1 className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-[1.04] tracking-[-.03em] text-white sm:text-5xl">Tell us about your property. Get a price in writing.</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">No account, no card. A real person reviews your request and replies within two business hours with your per-turnover pricing.</p>
            </Reveal>
          </div>
        </section>

        <section className="container-pmv py-12 sm:py-16">
          {done ? (
            <Reveal className="mx-auto max-w-xl rounded-2xl border border-gold/25 bg-gold/[.05] p-7">
              <p className="eyebrow">Request received</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white">A person will take it from here.</h2>
              <p className="mt-4 text-sm leading-6 text-slate-300">We received your turnover quote request. Pinnacle will review the scope and reply within two business hours with pricing in writing.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/" className={btnPrimary}>Back to home</Link>
                <Link to="/short-term-rental-support" className={btnOutline}>Learn about turnover support</Link>
              </div>
            </Reveal>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
              <Reveal distance={14}>
                <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[.025] p-6 sm:p-8">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label><span className={labelCls}>Your name</span><input className={inputCls} required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jane Smith" /></label>
                    <label><span className={labelCls}>Email</span><input className={inputCls} type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" /></label>
                    <label><span className={labelCls}>Phone (optional)</span><input className={inputCls} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 555-5555" /></label>
                    <label><span className={labelCls}>Property address (optional)</span><input className={inputCls} value={form.property_address} onChange={(e) => set('property_address', e.target.value)} placeholder="Street address" /></label>
                    <label><span className={labelCls}>City</span><input className={inputCls} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Fort Lauderdale" /></label>
                    <label><span className={labelCls}>State</span><select className={inputCls} value={form.state || 'FL'} onChange={(e) => set('state', e.target.value)}><option value="FL">Florida</option><option value="other">Other</option></select></label>
                    <label><span className={labelCls}>Property type</span><select className={inputCls} value={form.unit_type} onChange={(e) => set('unit_type', e.target.value)}>{UNIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                    <label><span className={labelCls}>How many short-term rental properties?</span><select className={inputCls} value={form.property_count} onChange={(e) => set('property_count', e.target.value)}>{COUNTS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                    <label className="sm:col-span-2"><span className={labelCls}>Typical turnovers per month</span><select className={inputCls} value={form.avg_turnovers_per_month} onChange={(e) => set('avg_turnovers_per_month', e.target.value)}>{FREQUENCIES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                    <label className="sm:col-span-2"><span className={labelCls}>Who cleans between guests today?</span><input className={inputCls} value={form.current_cleaning} onChange={(e) => set('current_cleaning', e.target.value)} placeholder="e.g. an independent cleaner, the platform's cleaning, a property manager…" /></label>
                    <label className="sm:col-span-2"><span className={labelCls}>Anything else we should know?</span><textarea className={`${inputCls} min-h-[80px]`} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Number of bedrooms, access details, scheduling needs…" /></label>
                  </div>
                  <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
                    <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" className="mt-0.5" checked={guestReadyPlus} onChange={(e) => setGuestReadyPlus(e.target.checked)} /><span><strong className="text-white">Guest Ready+</strong> - approved extras handled, supply restock tracked to par, priority scheduling.</span></label>
                    <label className="flex items-start gap-3 text-sm text-slate-200"><input type="checkbox" className="mt-0.5" checked={managed} onChange={(e) => setManaged(e.target.checked)} /><span><strong className="text-white">Pinnacle Managed</strong> - month-to-month support with reservation feeds, auto-created turnovers, and supplies kept in stock.</span></label>
                  </div>
                  {error && <p className="mt-4 rounded-md border border-red-400/25 bg-red-400/[.06] px-3 py-2 text-sm text-red-100">{error}</p>}
                  <button type="submit" disabled={busy} className={`${btnPrimary} mt-6 disabled:opacity-60`}>{busy ? 'Sending…' : 'Get my turnover quote'}</button>
                  <p className="mt-3 text-xs leading-5 text-slate-500">A real person reviews every request - no autoresponder maze. By submitting, you agree to our <Link to="/privacy" className="text-gold hover:underline">privacy policy</Link>.</p>
                </form>
              </Reveal>
              <aside className="space-y-3">
                <Reveal distance={12}><div className="rounded-2xl border border-white/10 bg-white/[.02] p-5 text-sm leading-6 text-slate-300"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">What happens next</p><ul className="mt-3 space-y-2"><li className="flex gap-2"><span className="text-gold">1.</span><span>We review your property and scope.</span></li><li className="flex gap-2"><span className="text-gold">2.</span><span>You get per-turnover pricing in writing.</span></li><li className="flex gap-2"><span className="text-gold">3.</span><span>Confirm and your first turnover is scheduled.</span></li></ul></div></Reveal>
                <Reveal distance={12}><div className="rounded-2xl border border-white/10 bg-white/[.02] p-5 text-sm leading-6 text-slate-300"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">No surprises</p><p className="mt-2 text-sm text-slate-400">Your price is quoted up front. Standard conditions are handled in the work; excess conditions are approved before they cost anything.</p></div></Reveal>
                <Reveal distance={12}><div className="rounded-2xl border border-white/10 bg-white/[.02] p-5 text-sm leading-6 text-slate-300"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Why the portal</p><p className="mt-2 text-sm text-slate-400">Once you're a client, every turnover shows up with its checklist, photos, and guest-ready status in one place.</p></div></Reveal>
              </aside>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}
