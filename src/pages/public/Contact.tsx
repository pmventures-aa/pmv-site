import { useState } from 'react'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnPrimary, PageIntro, panelCls } from '../../components/public/ui'
import { services } from '../../data/services'
import { api, ApiError } from '../../lib/api'
import { inputCls } from '../auth/AuthLayout'
import { usePageMeta } from '../../lib/usePageMeta'

export default function Contact() {
  usePageMeta('Contact', 'Tell us what you need help with and we will follow up about the right service and next step.')
  const [form, setForm] = useState({ name: '', email: '', phone: '', service_key: '', message: '' })
  const [website, setWebsite] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('busy')
    setError(null)
    try {
      await api.post('/contact', { ...form, website })
      setStatus('sent')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not send your request. Please try again or contact us directly.')
      setStatus('idle')
    }
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <section className="container-pmv py-16">
        <PageIntro
          kicker="Contact Pinnacle"
          title="Tell us what you need help with"
          subtitle="Give us a little context and we will follow up to discuss the right service, scope, and next step."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          <div className={`${panelCls} lg:col-span-2`}>
            {status === 'sent' ? (
              <div className="py-8 text-center">
                <p className="text-xl font-semibold text-white">Your request was received.</p>
                <p className="mt-2 text-sm text-slate-300">
                  We will follow up using {form.email || 'the contact information you provided'}.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden="true">
                  <label>
                    Website
                    <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Name <span className="text-gold">*</span></span>
                    <input className={inputCls} required value={form.name} onChange={(e) => set('name', e.target.value)} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Email <span className="text-gold">*</span></span>
                    <input className={inputCls} type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Phone</span>
                    <input className={inputCls} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Service</span>
                    <select className={inputCls} value={form.service_key} onChange={(e) => set('service_key', e.target.value)}>
                      <option value="">I am not sure yet</option>
                      {services.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
                    </select>
                  </label>
                </div>
                <label>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">What is going on? <span className="text-gold">*</span></span>
                  <textarea className={`${inputCls} min-h-[130px]`} required placeholder="Tell us what needs attention, what you have already tried, and what outcome you are looking for." value={form.message} onChange={(e) => set('message', e.target.value)} />
                </label>
                {error && <p className="text-sm text-rose-300">{error}</p>}
                <button type="submit" disabled={status === 'busy'} className={`${btnPrimary} disabled:opacity-60`}>
                  {status === 'busy' ? 'Sending...' : 'Send Request'}
                </button>
                <p className="text-xs text-slate-500">We use the information you provide to respond to your request and manage the resulting client relationship.</p>
              </form>
            )}
          </div>

          <div className={panelCls}>
            <h2 className="text-sm font-semibold text-white">Contact information</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li><a href="mailto:support@pinnaclemanagementventures.com" className="hover:text-gold">support@pinnaclemanagementventures.com</a></li>
              <li><a href="tel:+15613887879" className="hover:text-gold">(561) 388-7879</a></li>
              <li className="text-slate-400">Remote services nationwide</li>
              <li className="text-slate-400">On-site services in South Florida</li>
            </ul>
            <div className="mt-6 border-t border-white/10 pt-4">
              <a href="https://secure.pinnaclemanagementventures.com/login" className="text-sm font-medium text-gold hover:underline">Already a client? Sign in</a>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  )
}
