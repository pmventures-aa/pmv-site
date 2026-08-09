import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, inputCls, btnPrimary } from '../../components/admin/ui'
import { ThreadView } from '../../components/kit/ThreadView'
import { Dialog, DialogTrigger, DialogContent } from '../../components/kit/Dialog'
import { toast } from '../../components/kit/toast'
import { timeAgo } from '../../lib/activity'

interface ThreadRow {
  id: string
  subject: string
  client_user_id: string
  client_name: string | null
  client_email: string
  last_message_at: string
  unread: number
}
interface ClientOption {
  id: string
  full_name: string | null
  email: string
}

// initialClientId pre-selects the recipient (and auto-opens the dialog)
// when arriving via a "Message this client" link from the client detail
// page — see ClientDetail.tsx's PageIntro action.
function NewThreadDialog({
  clients,
  initialClientId,
  onCreated,
}: {
  clients: ClientOption[]
  initialClientId?: string | null
  onCreated: (id: string) => void
}) {
  const [open, setOpen] = useState(!!initialClientId)
  const [clientId, setClientId] = useState(initialClientId ?? '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (initialClientId) {
      setClientId(initialClientId)
      setOpen(true)
    }
  }, [initialClientId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId || !subject.trim() || !body.trim()) return
    setSending(true)
    try {
      const res = await api.post<{ id: string }>('/portal/message-threads', {
        client_user_id: clientId,
        subject: subject.trim(),
        body: body.trim(),
      })
      setOpen(false)
      setSubject('')
      setBody('')
      onCreated(res.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={btnPrimary}>New message</button>
      </DialogTrigger>
      <DialogContent title="New message" description="Start a private conversation with a client.">
        <form onSubmit={onSubmit} className="space-y-4">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Client</span>
            <select className={inputCls} required value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Subject</span>
            <input className={inputCls} required value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Message</span>
            <textarea className={`${inputCls} min-h-[120px]`} required value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <button type="submit" disabled={sending} className={`${btnPrimary} w-full`}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function MessagesAdmin() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const initialClientId = searchParams.get('client')

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([
        api.get<{ threads: ThreadRow[] }>('/portal/message-threads'),
        api.get<{ clients: ClientOption[] }>('/admin/clients'),
      ])
      setThreads(t.threads)
      setClients(c.clients)
      setActiveId((prev) => prev ?? t.threads[0]?.id ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function onCreated(id: string) {
    setActiveId(id)
    if (initialClientId) setSearchParams((p) => { p.delete('client'); return p }, { replace: true })
    load()
  }

  return (
    <div>
      <PageIntro
        kicker="Client communication"
        title="Messages"
        subtitle="Threads with clients you're assigned to."
        action={<NewThreadDialog clients={clients} initialClientId={initialClientId} onCreated={onCreated} />}
      />
      <Panel className="grid h-[65vh] grid-cols-1 gap-0 overflow-hidden !p-0 md:grid-cols-[300px_1fr]">
        <div className="overflow-y-auto border-b border-white/10 md:border-b-0 md:border-r">
          {loading ? (
            <p className="p-4 text-sm text-slate-400">Loading…</p>
          ) : threads.length === 0 ? (
            <div className="p-4">
              <EmptyState label="No conversations yet." />
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActiveId(t.id)}
                    className={`block w-full px-4 py-3 text-left transition ${activeId === t.id ? 'bg-gold/10' : 'hover:bg-white/5'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-sm font-medium ${t.unread ? 'text-white' : 'text-slate-300'}`}>
                        {t.client_name || t.client_email}
                      </p>
                      {!!t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-400">{t.subject}</p>
                    <p className="mt-1 text-xs text-slate-500">{timeAgo(t.last_message_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-h-0">
          {activeId ? (
            <ThreadView threadId={activeId} onSent={load} />
          ) : (
            <div className="grid h-full place-items-center p-6">
              <EmptyState label="Select a conversation, or start a new one." />
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
