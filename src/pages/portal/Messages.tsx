import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, HelpCircle, Info, Loader2, Plus, Wrench } from 'lucide-react'
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

type Priority = 'standard' | 'urgent'

type Template = {
  id: string
  label: string
  icon: typeof HelpCircle
  subject: string
  body: string
  priority?: Priority
}

const TEMPLATES: Template[] = [
  { id: 'question', label: 'Ask a question', icon: HelpCircle, subject: 'Quick question for your team', body: 'Hi, I had a question about ' },
  { id: 'issue', label: 'Report a property issue', icon: Wrench, subject: 'Issue at my property', body: 'I wanted to let you know about an issue at my property.\n\nWhat happened: \nWhere at the property: \nWhen it started: \nBest way to reach me: ' },
  { id: 'billing', label: 'Payment or billing', icon: Info, subject: 'Billing question', body: 'Wanted to follow up on billing.\n\nInvoice or charge in question: \nQuestion: ' },
  { id: 'urgent', label: 'Urgent issue', icon: AlertTriangle, subject: 'Urgent - needs a call back today', body: 'This is time-sensitive. Please call me when you can.\n\nWhat is happening: \nCallback number: ', priority: 'urgent' },
]

const DRAFT_KEY = 'pmv:portal:new-message-draft-v1'

function NewThreadDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<Priority>('standard')
  const [sending, setSending] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)

  // Restore draft on open
  useEffect(() => {
    if (!open) return
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw) as { subject?: string; body?: string; priority?: Priority }
      if ((d.subject && d.subject.length) || (d.body && d.body.length)) {
        setSubject(d.subject || '')
        setBody(d.body || '')
        setPriority(d.priority === 'urgent' ? 'urgent' : 'standard')
        setDraftRestored(true)
      }
    } catch {}
  }, [open])

  // Reset when closed
  useEffect(() => {
    if (open) return
    setSubject(''); setBody(''); setPriority('standard'); setDraftRestored(false); setSending(false)
  }, [open])

  // Autosave draft
  useEffect(() => {
    if (!open) return
    const empty = !subject.trim() && !body.trim()
    try {
      if (empty) window.localStorage.removeItem(DRAFT_KEY)
      else window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject, body, priority }))
    } catch {}
  }, [open, subject, body, priority])

  const canSend = useMemo(() => subject.trim().length > 0 && body.trim().length > 0, [subject, body])

  function applyTemplate(t: Template) {
    if (t.priority) setPriority(t.priority)
    if (!subject.trim()) setSubject(t.subject)
    setBody((prev) => prev ? `${t.body}\n\n${prev}` : t.body)
  }

  function discardDraft() {
    try { window.localStorage.removeItem(DRAFT_KEY) } catch {}
    setSubject(''); setBody(''); setPriority('standard'); setDraftRestored(false)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend) return
    setSending(true)
    try {
      const finalSubject = priority === 'urgent' && !/^\[urgent\]/i.test(subject.trim())
        ? `[URGENT] ${subject.trim()}`
        : subject.trim()
      const res = await api.post<{ id: string }>('/portal/message-threads', {
        subject: finalSubject,
        body: body.trim(),
      })
      try { window.localStorage.removeItem(DRAFT_KEY) } catch {}
      setOpen(false)
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
        <button className="btn-gold inline-flex items-center gap-1.5"><Plus size={14}/>New message</button>
      </DialogTrigger>
      <DialogContent
        size="lg"
        title="New message"
        description="A private line to your Pinnacle team."
        className="flex max-h-[92dvh] flex-col overflow-hidden !p-0"
      >
        <form onSubmit={onSubmit} className="flex flex-1 min-h-0 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-3 pt-1 sm:px-6">
            {draftRestored && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gold/25 bg-gold/[.06] px-3 py-2 text-[11px] text-gold">
                <span>Restored your last draft.</span>
                <button type="button" className="font-bold underline underline-offset-2 hover:text-white" onClick={discardDraft}>Discard</button>
              </div>
            )}

            <section>
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Quick starts</p>
              <div className="mt-2 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" onClick={() => applyTemplate(t)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[.03] px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-gold/40 hover:text-gold">
                    <t.icon size={12}/>{t.label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Subject</label>
              <input className={`${inputCls} mt-2`} required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What is this about?" />
            </section>

            <section>
              <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Priority</label>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setPriority('standard')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${priority === 'standard' ? 'border-gold/50 bg-gold/10 text-gold' : 'border-white/10 text-slate-400 hover:border-white/25'}`}>
                  Standard
                </button>
                <button type="button" onClick={() => setPriority('urgent')}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold ${priority === 'urgent' ? 'border-rose-400/60 bg-rose-400/10 text-rose-200' : 'border-white/10 text-slate-400 hover:border-rose-400/30 hover:text-rose-200'}`}>
                  <AlertTriangle size={14}/>Urgent
                </button>
              </div>
              {priority === 'urgent' && (
                <p className="mt-2 text-[11px] text-rose-300/80">Urgent messages are flagged for a same-business-day response and we prepend [URGENT] to the subject so it stands out for the team.</p>
              )}
            </section>

            <section>
              <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Message</label>
              <textarea className={`${inputCls} mt-2 min-h-32`} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share the details. The more context you give, the faster we can help." />
              <p className="mt-1 text-[10px] text-slate-500">Drafts are saved automatically while you type, so nothing gets lost.</p>
            </section>
          </div>

          <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-white/10 bg-navy-900/95 px-5 py-3 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
            <button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-gold/40 hover:text-gold" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" disabled={!canSend || sending} className="btn-gold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
              {sending && <Loader2 size={14} className="animate-spin"/>}
              {sending ? 'Sending...' : 'Send message'}
            </button>
          </div>
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
      setActiveId((prev) => prev ?? (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? null : res.threads[0]?.id ?? null))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
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
        subtitle="Private line to your Pinnacle team."
        action={<NewThreadDialog onCreated={onCreated} />}
      />
      <Card className="grid h-[65vh] grid-cols-1 gap-0 overflow-hidden !p-0 md:grid-cols-[280px_1fr]">
        <div className={`overflow-y-auto border-b border-white/10 md:border-b-0 md:border-r md:block ${activeId ? 'hidden' : 'block'}`}>
          {loading ? (
            <p className="p-4 text-sm text-slate-400">Loading...</p>
          ) : threads.length === 0 ? (
            <div className="p-4">
              <EmptyState label="No messages yet. Start one above." />
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {threads.map((t) => {
                const isUrgent = /^\[urgent\]/i.test(t.subject)
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setActiveId(t.id)}
                      className={`block w-full px-3 py-2.5 text-left transition ${activeId === t.id ? 'bg-gold/10' : 'hover:bg-white/5'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`min-w-0 flex-1 truncate text-sm font-medium ${t.unread ? 'text-white' : 'text-slate-300'}`}>
                          {isUrgent && <span className="mr-1.5 inline-flex items-center gap-0.5 rounded bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-300"><AlertTriangle size={9}/>Urgent</span>}
                          {t.subject.replace(/^\[urgent\]\s*/i, '')}
                        </p>
                        {!!t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{timeAgo(t.last_message_at)}</p>
                    </button>
                  </li>
                )
              })}
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
