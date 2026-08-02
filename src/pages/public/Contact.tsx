import { useState } from 'react'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Card } from '../../components/ui'
import { services } from '../../data/services'
import { api, ApiError } from '../../lib/api'
import { inputCls } from '../auth/AuthLayout'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', service_key: '', message: '' })
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
      await api.post('/contact', form)
      setStatus('sent')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again, or email us directly.')
      setStatus('idle')
    }
  }

  return (
    <div className="min-h-screen bg-navy-radial">
      <Header />
      <section className="container-pmv py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Get in touch</p>
          <h1 className="mt-2 text-4xl font-bold text-white">Request Service</h1>
          <p className="mt-5 text-lg text-slate-300">
            Tell us what you need and we&rsquo;ll follow up to map the right service and next steps.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl gap-8 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            {status === 'sent' ? (
              <div className="py-8 text-center">
                <p className="text-xl font-semibold text-white">Thanks — we got it.</p>
                <p className="mt-2 text-sm text-slate-300">
                  We&rsquo;ll follow up at {form.email || 'the email you provided'} shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</span>
                    <input className={inputCls} required value={form.name} onChange={(e) => set('name', e.target.value)} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Email</span>
                    <input className={inputCls} type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Phone (optional)</span>
                    <input className={inputCls} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Service</span>
                    <select className={inputCls} value={form.service_key} onChange={(e) => set('service_key', e.target.value)}>
                      <option value="">Not sure yet</option>
                      {services.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">What do you need help with?</span>
                  <textarea className={`${inputCls} min-h-[120px]`} required value={form.message} onChange={(e) => set('message', e.target.value)} />
                </label>
                {error && <p className="text-sm text-rose-300">{error}</p>}
                <button type="submit" disabled={status === 'busy'} className="btn-gold disabled:opacity-60">
                  {status === 'busy' ? 'Sending…' : 'Send request'}
                </button>
              </form>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Direct contact</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li>
                <a href="mailto:support@pinnaclemanagementventures.com" className="hover:text-gold">
                  support@pinnaclemanagementventures.com
                </a>
              </li>
              <li>
                <a href="tel:+15613887879" className="hover:text-gold">
                  (561) 388-7879
                </a>
              </li>
              <li className="text-slate-400">Nationwide · South Florida (on-site)</li>
            </ul>
            <div className="mt-6 border-t border-white/10 pt-4">
              <a href="https://client.pinnaclemanagementventures.com/login" className="text-sm font-medium text-gold hover:underline">
                Already a client? Sign in →
              </a>
            </div>
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  )
}
