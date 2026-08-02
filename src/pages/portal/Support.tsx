import { useCallback, useEffect, useState } from 'react'
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
  const [form, setForm] = useState({ subject: '', category: '', priority: 'normal' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [thread, setThread] = useState<Msg[]>([])
  const [reply, setReply] = useState('')

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
      setForm({ subject: '', category: '', priority: 'normal' })
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
      setOpenId(null)
      return
    }
    setOpenId(id)
    const res = await api.get<{ messages: Msg[] }>(`/portal/support/${id}/messages`)
    setThread(res.messages)
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

  return (
    <div>
      <PageHeader
        eyebrow="We're here to help"
        title="Support"
        subtitle="Open a ticket and message our team directly."
        action={
          <button className="btn-gold" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ New ticket'}
          </button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-3">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Subject</span>
              <input className={inputCls} required value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Priority</span>
              <select className={inputCls} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {['low', 'normal', 'high', 'urgent'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3 sm:col-span-3">
              <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
                {busy ? 'Saving…' : 'Submit'}
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
          <EmptyState label="No support tickets yet." />
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.id} className="!p-0">
              <button onClick={() => openThread(t.id)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                <div>
                  <p className="text-sm font-medium text-white">{t.subject}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <StatusBadge tone={t.status === 'closed' ? 'green' : t.status === 'in_progress' ? 'blue' : 'gold'}>{t.status}</StatusBadge>
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
          ))}
        </div>
      )}
    </div>
  )
}
