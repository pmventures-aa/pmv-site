import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Mail, MailOpen, ChevronLeft, Plus } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { Panel, EmptyState, inputCls, btnPrimary } from '../../components/admin/ui'
import { ThreadView } from '../../components/kit/ThreadView'
import { PresenceDot } from '../../components/kit/PresenceDot'
import { usePresence } from '../../lib/presence'
import { Dialog, DialogTrigger, DialogContent } from '../../components/kit/Dialog'
import { toast } from '../../components/kit/toast'
import { timeAgo } from '../../lib/activity'
import { useAppPath } from '../../lib/basePath'
import { ConversationsPanel } from './ConversationsPanel'
import { EmailThreadsPanel } from './EmailThreadsPanel'
import { EmailTemplatesPanel } from './EmailTemplatesPanel'
import { useEmailUnreadCount } from '../../lib/useEmailUnread'
import { OverviewTab, ReportingTab } from './CommunicationsHub'
import { SessionWho } from '../../components/kit/WhoSection'
import CommunicationsCRMAdmin from './CommunicationsCRMAdmin'

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

type MessageTab = 'staff' | 'email' | 'templates' | 'campaigns' | 'pulse' | 'inbox'
const TABS: { id: MessageTab; label: string }[] = [
  { id: 'staff', label: 'Direct messages' },
  { id: 'email', label: 'Email' },
  { id: 'templates', label: 'Templates' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'pulse', label: 'Pulse' },
]

// 'inbox' is kept in the type + component tree for bookmark backwards-compat
// but is intentionally not in the tab list. The old Client Inbox has been
// folded into Direct messages (compose the message and use "Link to client").

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
    <DialogTrigger asChild><button className={`${btnPrimary} shrink-0 !px-2.5 sm:!px-3`}><Plus size={14}/><span className="sm:hidden">New</span><span className="hidden sm:inline">New secure message</span></button></DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-none sm:overflow-visible" title="New secure message" description="Start a private, auditable conversation with a client.">
      <form onSubmit={onSubmit} className="space-y-4">
        <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Client</span><select className={inputCls} required value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Select a client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}</select></label>
        <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Subject</span><input className={inputCls} required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Enter a clear subject" /></label>
        <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Message</span><textarea className={`${inputCls} min-h-[140px]`} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" /></label>
        <button type="submit" disabled={sending} className={`${btnPrimary} w-full`}>{sending ? 'Sending…' : 'Send secure message'}</button>
      </form>
    </DialogContent>
  </Dialog>
}

function ClientInbox({ initialClientId, initialThreadId, onClearClient }: { initialClientId?: string | null; initialThreadId?: string | null; onClearClient: () => void }) {
  const [, setInboxParams] = useSearchParams()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(initialThreadId || null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([
        api.get<{ threads: ThreadRow[] }>('/portal/message-threads'),
        api.get<{ clients: ClientOption[] }>('/admin/clients'),
      ])
      setThreads(t.threads); setClients(c.clients)
      setActiveId((prev) => {
        if (initialThreadId && t.threads.some((row) => row.id === initialThreadId)) return initialThreadId
        if (!prev && typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) return null
        return prev ?? t.threads[0]?.id ?? null
      })
    } finally { setLoading(false) }
  }, [initialThreadId])

  useEffect(() => { void load() }, [load])
  useLiveRefresh(load)
  useEffect(() => {
    setInboxParams((current) => {
      const next = new URLSearchParams(current)
      if (activeId) next.set('inbox', activeId)
      else next.delete('inbox')
      return next.toString() === current.toString() ? current : next
    }, { replace: true })
  }, [activeId, setInboxParams])

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

  return <Panel className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden !p-0 md:h-[72vh] md:flex-none md:grid-cols-[320px_1fr]">
    <aside className={`min-h-0 flex-col border-b border-white/10 md:flex md:border-b-0 md:border-r ${activeId ? 'hidden' : 'flex'}`}>
      <div className="flex items-center gap-2 border-b border-white/10 p-2.5">
        <div className="relative min-w-0 flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" /><input className={`${inputCls} !pl-8`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" /></div>
        <NewThreadDialog clients={clients} initialClientId={initialClientId} onCreated={onCreated} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <p className="p-4 text-sm text-slate-400">Loading conversations…</p> : visibleThreads.length === 0 ? <div className="p-4"><EmptyState label={search ? 'No conversations match your search.' : 'No secure conversations yet.'} /></div> : <ul className="divide-y divide-white/5">{visibleThreads.map((t) => <li key={t.id}><button onClick={() => setActiveId(t.id)} className={`block w-full px-3 py-2.5 text-left transition ${activeId === t.id ? 'bg-gold/10 ring-1 ring-inset ring-gold/20' : 'hover:bg-white/5'}`}><div className="flex items-center gap-2"><span className="text-slate-500">{t.unread ? <Mail size={14} /> : <MailOpen size={14} />}</span><PresenceDot entry={presence[t.client_user_id]} size={7} /><p className={`min-w-0 flex-1 truncate text-sm font-medium ${t.unread ? 'text-white' : 'text-slate-300'}`}>{t.client_name || t.client_email}</p>{t.unread > 0 && <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-navy-950">{t.unread > 99 ? '99+' : t.unread}</span>}<span className="shrink-0 text-[10px] text-slate-500">{timeAgo(t.last_message_at)}</span></div><p className={`mt-1 truncate pl-[34px] text-xs ${t.unread ? 'text-slate-200' : 'text-slate-500'}`}>{t.subject}</p></button></li>)}</ul>}
      </div>
    </aside>
    <section className={`min-h-0 flex-col bg-navy-950/20 ${activeId ? 'flex' : 'hidden md:flex'}`}>
      {activeId ? (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 md:hidden">
            <button type="button" onClick={() => setActiveId(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:border-gold/40 hover:text-gold" aria-label="Back to conversations">
              <ChevronLeft size={16}/>
            </button>
            <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Conversation</p>
          </div>
          <div className="min-h-0 flex-1 [&_.thread-view-header]:hidden md:[&_.thread-view-header]:block"><ThreadView threadId={activeId} onSent={load} /></div>
        </>
      ) : (
        <div className="grid h-full place-items-center p-6"><EmptyState label="Select a conversation or start a new secure message." /></div>
      )}
    </section>
  </Panel>
}

function PulseTab() {
  const [overview, setOverview] = useState<{ unread_threads: number; active_threads_7d: number; aging_threads: number; campaigns_sent_7d: number; emails_sent_7d: number; avg_response_minutes: number | null; generated_at: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<'overview' | 'reporting'>('overview')
  useEffect(() => {
    api.get<NonNullable<typeof overview>>('/admin/communications/overview')
      .then(setOverview)
      .catch((err) => { if (err instanceof ApiError) toast.error(err.message) })
      .finally(() => setLoading(false))
  }, [])
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    <SessionWho hint="Pulse counts conversations and mail you can see from this HQ session." />
    <div className="sticky top-0 z-10 grid grid-cols-2 rounded-lg border border-white/10 bg-navy-950/90 p-1 backdrop-blur lg:hidden">
      <button type="button" onClick={() => setSection('overview')} className={`rounded-md px-3 py-2 text-xs font-semibold ${section === 'overview' ? 'bg-gold text-navy-950' : 'text-slate-400'}`}>Overview</button>
      <button type="button" onClick={() => setSection('reporting')} className={`rounded-md px-3 py-2 text-xs font-semibold ${section === 'reporting' ? 'bg-gold text-navy-950' : 'text-slate-400'}`}>Reporting</button>
    </div>
    <div className={`${section === 'overview' ? 'block' : 'hidden'} lg:block`}><OverviewTab overview={overview} loading={loading} /></div>
    <div className={`${section === 'reporting' ? 'block' : 'hidden'} lg:block`}><ReportingTab /></div>
  </div>
}

export default function MessagesAdmin() {
  const p = useAppPath()
  void p
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab: MessageTab = (rawTab === 'inbox' || TABS.some((item) => item.id === rawTab)) ? rawTab as MessageTab : 'staff'
  const initialClientId = searchParams.get('client')
  const { count: emailUnread } = useEmailUnreadCount()

  if (rawTab === 'notifications') {
    return <Navigate to={`${p('settings')}?tab=notifications`} replace />
  }

  function setTab(next: MessageTab) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      if (next === 'staff') params.delete('tab')
      else params.set('tab', next)
      if (next !== 'email') params.delete('thread')
      if (next !== 'staff') params.delete('conv')
      if (next !== 'inbox') params.delete('inbox')
      if (next !== 'templates') { params.delete('template'); params.delete('slug') }
      if (next !== 'campaigns') { params.delete('campaign') }
      return params
    }, { replace: true })
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-3 pt-2 sm:px-5 lg:px-6">
      <div className="mb-2 flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
        {TABS.map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`relative shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === item.id ? 'border-gold font-semibold text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>
            {item.label}
            {item.id === 'email' && emailUnread > 0 && (
              <span className="ml-2 inline-grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{emailUnread > 99 ? '99+' : emailUnread}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-3">
        {tab === 'inbox' && <ClientInbox initialClientId={initialClientId} initialThreadId={searchParams.get('inbox')} onClearClient={() => setSearchParams((current) => { const params = new URLSearchParams(current); params.delete('client'); return params }, { replace: true })} />}
        {tab === 'email' && <EmailThreadsPanel />}
        {tab === 'templates' && <EmailTemplatesPanel />}
        {tab === 'staff' && <ConversationsPanel />}
        {tab === 'campaigns' && <div className="min-h-0 flex-1 overflow-y-auto"><CommunicationsCRMAdmin /></div>}
        {tab === 'pulse' && <PulseTab />}
      </div>
    </div>
  )
}

