import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { services } from '../../data/services'

interface Inquiry {
  id: string
  name: string
  email: string
  phone: string | null
  service_name: string | null
  message: string
  status: string
  created_at: string
}

const emptyForm = { name: '', email: '', phone: '', service_key: '', message: '' }

export default function InquiriesAdmin() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ inquiries: Inquiry[] }>('/admin/inquiries')
      setInquiries(res.inquiries)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(id: string, status: string) {
    try {
      await api.patch(`/admin/inquiries/${id}`, { status })
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update status.')
    }
  }

  async function archive(id: string) {
    try {
      await api.patch(`/admin/records/inquiries/${id}/archive`)
      toast.success('Lead archived.')
      setInquiries((rows) => rows.filter((r) => r.id !== id))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not archive this lead.')
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.post('/admin/inquiries', form)
      toast.success('Lead added.')
      setForm(emptyForm)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add lead.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageIntro
        kicker="Website + manual entry"
        title="Request Service Inquiries"
        subtitle="Submissions from the public contact form, plus any leads you enter directly."
        action={
          <button className={btnPrimary} onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ New lead'}
          </button>
        }
      />

      {showForm && (
        <Panel className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</span>
              <input className={inputCls} required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Email</span>
              <input className={inputCls} type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Phone</span>
              <input className={inputCls} type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Interested in</span>
              <select className={inputCls} value={form.service_key} onChange={(e) => setForm((f) => ({ ...f, service_key: e.target.value }))}>
                <option value="">Not sure yet</option>
                {services.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Notes</span>
              <textarea
                className={inputCls}
                rows={3}
                placeholder="How you met them, what they need, anything relevant…"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              />
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={busy} className={btnOutline}>
                {busy ? 'Adding…' : 'Add lead'}
              </button>
              {error && <span className="text-sm text-rose-300">{error}</span>}
            </div>
          </form>
        </Panel>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : inquiries.length === 0 ? (
        <Panel>
          <EmptyState label="No inquiries yet." />
        </Panel>
      ) : (
        <Panel className="divide-y divide-white/5 !p-0">
          {inquiries.map((i) => (
            <div key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">
                  {i.name} <span className="font-normal text-slate-400">— {i.email}</span>
                </p>
                {i.phone && <p className="text-xs text-slate-500">{i.phone}</p>}
                {i.service_name && <p className="mt-1 text-xs text-gold">{i.service_name}</p>}
                {i.message && <p className="mt-2 max-w-xl text-sm text-slate-300">{i.message}</p>}
                <p className="mt-2 text-xs text-slate-500">{new Date(i.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <select
                  className="rounded-md border border-white/10 bg-navy-900 px-2 py-1 text-xs text-white"
                  value={i.status}
                  onChange={(e) => setStatus(i.id, e.target.value)}
                >
                  {['new', 'contacted', 'qualified', 'converted', 'lost'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button onClick={() => archive(i.id)} className="text-xs font-medium text-slate-500 hover:text-rose-300">
                  Archive
                </button>
              </div>
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}
