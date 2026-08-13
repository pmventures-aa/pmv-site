import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, EmptyState } from '../../components/ui'
import { ThreadView } from '../../components/kit/ThreadView'
import { Dialog, DialogTrigger, DialogContent } from '../../components/kit/Dialog'
import { toast } from '../../components/kit/toast'
import { inputCls } from '../auth/AuthLayout'
import { timeAgo } from '../../lib/activity'

interface ThreadRow {
  id: string
  subject: string
  last_message_at: string
  unread: number
}

function NewThreadDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    try {
      const res = await api.post<{ id: string }>('/portal/message-threads', { subject: subject.trim(), body: body.trim() })
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
        <button className="btn-gold">New message</button>
      </DialogTrigger>
      <DialogContent title="New message" description="A private message to your Pinnacle team.">
        <form onSubmit={onSubmit} className="space-y-4">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Subject</span>
            <input className={inputCls} required value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Message</span>
            <textarea className={`${inputCls} min-h-[120px]`} required value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <button type="submit" disabled={sending} className="btn-gold w-full disabled:opacity-60">
            {sending ? 'Sending…' : 'Send'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Messages() {
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ threads: ThreadRow[] }>('/portal/message-threads')
      setThreads(res.threads)
      setActiveId((prev) => prev ?? res.threads[0]?.id ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const refresh = () => { void load() }
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('pmv:activity', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pmv:activity', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  function onCreated(id: string) {
    setActiveId(id)
    load()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Secure messages"
        title="Messages"
        subtitle="A private line to your Pinnacle team."
        action={<NewThreadDialog onCreated={onCreated} />}
      />
      <Card className="grid h-[65vh] grid-cols-1 gap-0 overflow-hidden !p-0 md:grid-cols-[280px_1fr]">
        <div className={`overflow-y-auto border-b border-white/10 md:border-b-0 md:border-r md:block ${activeId ? 'hidden' : 'block'}`}>
          {loading ? (
            <p className="p-4 text-sm text-slate-400">Loading…</p>
          ) : threads.length === 0 ? (
            <div className="p-4">
              <EmptyState label="No messages yet: start one above." />
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
                      <p className={`truncate text-sm font-medium ${t.unread ? 'text-white' : 'text-slate-300'}`}>{t.subject}</p>
                      {!!t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{timeAgo(t.last_message_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`min-h-0 md:block ${activeId ? 'flex flex-col' : 'hidden'}`}>
          {activeId ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 md:hidden">
                <button type="button" onClick={() => setActiveId(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:border-gold/40 hover:text-gold" aria-label="Back to messages">
                  <ChevronLeft size={16}/>
                </button>
                <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Conversation</p>
              </div>
              <div className="min-h-0 flex-1"><ThreadView threadId={activeId} onSent={load} /></div>
            </>
          ) : (
            <div className="grid h-full place-items-center p-6">
              <EmptyState label="Select a conversation, or start a new one." />
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
