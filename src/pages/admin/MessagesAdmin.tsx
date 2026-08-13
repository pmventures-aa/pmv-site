import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Mail, MailOpen, Send } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { Panel, EmptyState, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { ThreadView } from '../../components/kit/ThreadView'
import { PresenceDot } from '../../components/kit/PresenceDot'
import { usePresence } from '../../lib/presence'
import { Dialog, DialogTrigger, DialogContent } from '../../components/kit/Dialog'
import { toast } from '../../components/kit/toast'
import { timeAgo } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'
import { ConversationsPanel } from './ConversationsPanel'
import { EmailThreadsPanel } from './EmailThreadsPanel'
import { useEmailUnreadCount } from '../../lib/useEmailUnread'
import { NotificationsTab, OverviewTab, ReportingTab } from './CommunicationsHub'

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

type MessageTab = 'inbox' | 'email' | 'staff' | 'notifications' | 'pulse'
const TABS: { id: MessageTab; label: string }[] = [
  { id: 'inbox', label: 'Client inbox' },
  { id: 'email', label: 'Email' },
  { id: 'staff', label: 'Staff DMs' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'pulse', label: 'Pulse' },
]

function NewThreadDialog({ clients, initialClientId, onCreated }: { clients: ClientOption[]; initialClientId?: string | null; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(!!initialClientId)
  const [clientId, setClientId] = useState(initialClientId ?? '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { if (initialClientId) { setClientId(initialClientId); setOpen(true) } }, [initialClientId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId || !subject.trim() || !body.trim()) return
    setSending(true)
    try {
      const res = await api.post<{ id: string }>('/portal/message-threads', { client_user_id: clientId, subject: subject.trim(), body: body.trim() })
      setOpen(false); setSubject(''); setBody(''); onCreated(res.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The secure message could not be sent. Please try again.')
    } finally { setSending(false) }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button className={btnPrimary}>New secure message</button></DialogTrigger>
    <DialogContent title="New secure message" description="Start a private, auditable conversation with a client.">
      <form onSubmit={onSubmit} className="space-y-4">
        <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Client</span><select className={inputCls} required value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Select a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}</select></label>
        <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Subject</span><input className={inputCls} required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Enter a clear subject" /></label>
        <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Message</span><textarea className={`${inputCls} min-h-[140px]`} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" /></label>
        <button type="submit" disabled={sending} className={`${btnPrimary} w-full`}>{sending ? 'Sending…' : 'Send secure message'}</button>
      </form>
    </DialogContent>
  </Dialog>
}

function ClientInbox({ initialClientId, onClearClient }: { initialClientId?: string | null; onClearClient: () => void }) {
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([
        api.get<{ threads: ThreadRow[] }>('/portal/message-threads'),
        api.get<{ clients: ClientOption[] }>('/admin/clients'),
      ])
      setThreads(t.threads); setClients(c.clients); setActiveId((prev) => prev ?? t.threads[0]?.id ?? null)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useLiveRefresh(load)

  const visibleThreads = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return threads
    return threads.filter((t) => `${t.client_name || ''} ${t.client_email} ${t.subject}`.toLowerCase().includes(q))
  }, [threads, search])

  const clientIds = useMemo(() => Array.from(new Set(visibleThreads.map((t) => t.client_user_id))), [visibleThreads])
  const presence = usePresence(clientIds, 'admin')

  function onCreated(id: string) {
    setActiveId(id)
    onClearClient()
    void load()
  }

  return <Panel className="grid h-[72vh] grid-cols-1 gap-0 overflow-hidden !p-0 md:grid-cols-[320px_1fr]">
    <aside className="flex min-h-0 flex-col border-b border-white/10 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 border-b border-white/10 p-2.5">
        <div className="relative min-w-0 flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" /><input className={`${inputCls} !pl-8`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" /></div>
        <NewThreadDialog clients={clients} initialClientId={initialClientId} onCreated={onCreated} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <p className="p-4 text-sm text-slate-400">Loading conversations…</p> : visibleThreads.length === 0 ? <div className="p-4"><EmptyState label={search ? 'No conversations match your search.' : 'No secure conversations yet.'} /></div> : <ul className="divide-y divide-white/5">{visibleThreads.map((t) => <li key={t.id}><button onClick={() => setActiveId(t.id)} className={`block w-full px-3 py-2.5 text-left transition ${activeId === t.id ? 'bg-gold/10 ring-1 ring-inset ring-gold/20' : 'hover:bg-white/5'}`}><div className="flex items-center gap-2"><span className="text-slate-500">{t.unread ? <Mail size={14} /> : <MailOpen size={14} />}</span><PresenceDot entry={presence[t.client_user_id]} size={7} /><p className={`min-w-0 flex-1 truncate text-sm font-medium ${t.unread ? 'text-white' : 'text-slate-300'}`}>{t.client_name || t.client_email}</p><span className="shrink-0 text-[10px] text-slate-500">{timeAgo(t.last_message_at)}</span></div><p className={`mt-1 truncate pl-[34px] text-xs ${t.unread ? 'text-slate-200' : 'text-slate-500'}`}>{t.subject}</p></button></li>)}</ul>}
      </div>
    </aside>
    <section className="min-h-0 bg-navy-950/20">{activeId ? <ThreadView threadId={activeId} onSent={load} /> : <div className="grid h-full place-items-center p-6"><EmptyState label="Select a conversation or start a new secure message." /></div>}</section>
  </Panel>
}

function PulseTab() {
  const [overview, setOverview] = useState<{ unread_threads: number; active_threads_7d: number; aging_threads: number; campaigns_sent_7d: number; emails_sent_7d: number; avg_response_minutes: number | null; generated_at: string } | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get<NonNullable<typeof overview>>('/admin/communications/overview')
      .then(setOverview)
      .catch((err) => { if (err instanceof ApiError) toast.error(err.message) })
      .finally(() => setLoading(false))
  }, [])
  return <div className="space-y-5">
    <OverviewTab overview={overview} loading={loading} />
    <ReportingTab />
  </div>
}

export default function MessagesAdmin() {
  const p = useAppPath()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab: MessageTab = TABS.some((item) => item.id === rawTab) ? rawTab as MessageTab : 'inbox'
  const initialClientId = searchParams.get('client')
  const { count: emailUnread } = useEmailUnreadCount()

  function setTab(next: MessageTab) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      if (next === 'inbox') params.delete('tab')
      else params.set('tab', next)
      if (next !== 'email') params.delete('thread')
      return params
    }, { replace: true })
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3 sm:px-5 lg:px-6 lg:py-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/85">Communications</p>
          <h1 className="mt-1 text-xl font-bold text-white">Mail</h1>
        </div>
        <Link to={p('communications/email')} className={btnOutline}><Send size={14} />Campaigns</Link>
      </div>
      <div className="mb-3 flex shrink-0 gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`relative shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === item.id ? 'border-gold text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>
            {item.label}
            {item.id === 'email' && emailUnread > 0 && (
              <span className="ml-2 inline-grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{emailUnread > 99 ? '99+' : emailUnread}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'inbox' && <ClientInbox initialClientId={initialClientId} onClearClient={() => setSearchParams((current) => { const params = new URLSearchParams(current); params.delete('client'); return params }, { replace: true })} />}
        {tab === 'email' && <EmailThreadsPanel />}
        {tab === 'staff' && <ConversationsPanel />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'pulse' && <PulseTab />}
      </div>
    </div>
  )
}
