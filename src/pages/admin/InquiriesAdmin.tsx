import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { services } from '../../data/services'
import { timeAgo } from '../../lib/activity'

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

interface Conversion {
  id: string
  inquiry_id: string
  client_user_id: string
  lead_name: string
  lead_email: string
  converted_by_name: string | null
  converted_by_email: string
  notes_transferred: number
  emails_transferred: number
  activity_transferred: number
  created_at: string
}

const emptyForm = { name: '', email: '', phone: '', service_key: '', message: '' }
const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'lost']

export default function InquiriesAdmin() {
  const [tab, setTab] = useState<'active' | 'converted'>('active')
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [converting, setConverting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'active') {
        const res = await api.get<{ inquiries: Inquiry[] }>('/admin/inquiries')
        setInquiries(res.inquiries)
      } else {
        const res = await api.get<{ conversions: Conversion[] }>('/admin/conversions')
        setConversions(res.conversions)
      }
    } finally {
      setLoading(false)
    }
  }, [tab])

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

  async function convert(i: Inquiry) {
    setConverting(i.id)
    try {
      await api.post(`/admin/inquiries/${i.id}/convert`)
      toast.success(`${i.name} is now a client: notes, emails, and activity carried over automatically.`)
      setInquiries((rows) => rows.filter((r) => r.id !== i.id))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not convert this lead.')
    } finally {
      setConverting(null)
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
          tab === 'active' && (
            <button className={btnPrimary} onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : '+ New lead'}
            </button>
          )
        }
      />

      <div className="mb-5 flex gap-1.5 border-b border-white/10">
        {(
          [
            ['active', 'Active pipeline'],
            ['converted', 'Converted'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === key ? 'border-gold text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'active' && showForm && (
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
      ) : tab === 'active' ? (
        inquiries.length === 0 ? (
          <Panel>
            <EmptyState label="No inquiries yet." />
          </Panel>
        ) : (
          <Panel className="divide-y divide-white/5 !p-0">
            {inquiries.map((i) => (
              <div key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-white">
                    {i.name} <span className="font-normal text-slate-400">: {i.email}</span>
                  </p>
                  {i.phone && <p className="text-xs text-slate-500">{i.phone}</p>}
                  {i.service_name && <p className="mt-1 text-xs text-gold">{i.service_name}</p>}
                  {i.message && <p className="mt-2 max-w-xl text-sm text-slate-300">{i.message}</p>}
                  <p className="mt-2 text-xs text-slate-500">{new Date(i.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <select
                    className="rounded-md border border-white/10 bg-navy-900 px-2 py-1 text-xs text-white"
                    value={STATUS_OPTIONS.includes(i.status) ? i.status : 'new'}
                    onChange={(e) => setStatus(i.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => convert(i)}
                    disabled={converting === i.id}
                    className="text-xs font-semibold text-gold hover:underline disabled:opacity-60"
                  >
                    {converting === i.id ? 'Converting…' : 'Convert to Client'}
                  </button>
                  <button onClick={() => archive(i.id)} className="text-xs font-medium text-slate-500 hover:text-rose-300">
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </Panel>
        )
      ) : conversions.length === 0 ? (
        <Panel>
          <EmptyState label="No leads converted yet." />
        </Panel>
      ) : (
        <Panel className="divide-y divide-white/5 !p-0">
          {conversions.map((c) => (
            <div key={c.id} className="px-5 py-4">
              <p className="text-sm font-medium text-white">
                {c.lead_name} <span className="font-normal text-slate-400">: {c.lead_email}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Converted by {c.converted_by_name || c.converted_by_email} · {timeAgo(c.created_at)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Carried over: {c.notes_transferred} note{c.notes_transferred === 1 ? '' : 's'}, {c.emails_transferred} email
                {c.emails_transferred === 1 ? '' : 's'}, {c.activity_transferred} activity event{c.activity_transferred === 1 ? '' : 's'}
              </p>
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}
