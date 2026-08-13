import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'

interface Ticket {
  id: string
  subject: string
  category: string | null
  priority: string
  status: string
  created_at: string
  details?: string | null
  service_key?: string | null
  response_due_at?: string | null
  resolution_due_at?: string | null
  waiting_on?: string
}
interface Msg {
  id: string
  body: string
  sender_user_id: string
  created_at: string
}

export default function Support() {
  const { user } = useAuth()
  const isStaff = user?.role === 'staff' || user?.role === 'admin'
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ subject: '', category: 'general', priority: 'normal', details: '', service_key: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [thread, setThread] = useState<Msg[]>([])
  const [reply, setReply] = useState('')
  const threadRequest = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ tickets: Ticket[] }>('/portal/support')
      setTickets(res.tickets)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/portal/support', form)
      setForm({ subject: '', category: 'general', priority: 'normal', details: '', service_key: '' })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function openThread(id: string) {
    if (openId === id) {
      threadRequest.current += 1
      setOpenId(null)
      setThread([])
      return
    }
    const requestId = ++threadRequest.current
    setOpenId(id)
    try {
      const res = await api.get<{ messages: Msg[] }>(`/portal/support/${id}/messages`)
      if (threadRequest.current === requestId) setThread(res.messages)
    } catch {
      if (threadRequest.current === requestId) setThread([])
    }
  }

  async function sendReply(id: string) {
    if (!reply.trim()) return
    await api.post(`/portal/support/${id}/messages`, { body: reply.trim() })
    setReply('')
    const res = await api.get<{ messages: Msg[] }>(`/portal/support/${id}/messages`)
    setThread(res.messages)
  }

  async function setStatus(id: string, status: string) {
    await api.patch(`/portal/support/${id}`, { status })
    await load()
  }

  const ordered = [...tickets].sort((a, b) => {
    const score = (t: Ticket) => (t.status !== 'closed' && (t.waiting_on === 'you' || t.waiting_on === 'client') ? 0 : t.status === 'closed' ? 2 : 1)
    return score(a) - score(b)
  })

  return (
    <div>
      <PageHeader
        eyebrow="One place for every need"
        title="Requests & Cases"
        subtitle="Request a service, send instructions, and follow ownership, messages, and response commitments in one thread."
        action={
          <button className="btn-gold" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ Start request'}
          </button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-3">
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">What do you need?</span>
              <select className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="property">Property / REO</option><option value="eviction">Eviction support</option><option value="inspection">Inspection</option><option value="cleaning">Cleaning / deep clean</option><option value="documents">Document preparation</option><option value="notary">Notary / courier</option><option value="general">Something else</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Subject</span>
              <input className={inputCls} required value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </label>
            <label className="sm:col-span-1">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Priority</span>
              <select className={inputCls} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {['low', 'normal', 'high', 'urgent'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-slate-500">Urgent: 30 min · High: 2 hrs · Normal: 4 hrs</span>
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Details</span>
              <textarea className={`${inputCls} min-h-24`} value={form.details} onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))} placeholder="Address, deadline, access notes, documents needed, or anything else that will help us begin." />
            </label>
            <div className="flex items-center gap-3 sm:col-span-3">
              <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
                {busy ? 'Submitting…' : 'Submit request'}
              </button>
              {error && <span className="text-sm text-rose-300">{error}</span>}
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : tickets.length === 0 ? (
        <Card>
          <EmptyState label="No requests yet. Start one whenever you need Pinnacle's help." />
        </Card>
      ) : (
        <div className="space-y-3">
          {ordered.map((t) => {
            const yours = t.status !== 'closed' && (t.waiting_on === 'you' || t.waiting_on === 'client')
            return (
            <Card key={t.id} className={`!p-0 ${yours ? 'border-gold/30' : ''}`}>
              <button onClick={() => openThread(t.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                <div>
                  {yours && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-gold">Action needed</p>}
                  <p className="text-sm font-medium text-white">{t.subject}</p>
                  <p className="mt-1 text-xs text-slate-500">Case {t.id.slice(0, 8).toUpperCase()} · {t.category?.replace('_', ' ') || 'General'} · {new Date(t.created_at).toLocaleString()}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{t.status === 'open' && t.response_due_at ? `Response due ${new Date(t.response_due_at).toLocaleString()}` : t.status === 'closed' ? 'Completed' : `In progress · waiting on ${yours ? 'you' : 'Pinnacle'}`}</p>
                </div>
                <StatusBadge tone={t.status === 'closed' ? 'green' : yours ? 'gold' : t.status === 'in_progress' ? 'blue' : 'gold'}>{yours ? 'waiting on you' : t.status}</StatusBadge>
              </button>
              {openId === t.id && (
                <div className="border-t border-white/10 p-5">
                  {isStaff && (
                    <div className="mb-4 flex items-center gap-2">
                      <span className="text-xs text-slate-400">Set status:</span>
                      {['open', 'in_progress', 'closed'].map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(t.id, s)}
                          className={`rounded-full border px-3 py-1 text-xs ${t.status === s ? 'border-gold text-gold' : 'border-white/10 text-slate-400'}`}
                        >
                          {s.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  )}
                  <ul className="mb-4 space-y-2">
                    {thread.length === 0 ? (
                      <li className="text-sm text-slate-500">No replies yet.</li>
                    ) : (
                      thread.map((m) => (
                        <li key={m.id} className="rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-slate-200">
                          {m.body}
                          <span className="ml-2 text-[10px] text-slate-500">{new Date(m.created_at).toLocaleTimeString()}</span>
                        </li>
                      ))
                    )}
                  </ul>
                  <div className="flex gap-2">
                    <input className={`${inputCls} flex-1`} placeholder="Reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
                    <button onClick={() => sendReply(t.id)} className="btn-outline">
                      Reply
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )})}
        </div>
      )}
    </div>
  )
}
