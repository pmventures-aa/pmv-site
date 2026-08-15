import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AtSign, CheckCheck, ChevronDown, ChevronLeft, Circle, Hash, Loader2, Lock, MessageSquare, Paperclip, PinIcon, Plus, Send, User, Users, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Panel, Tag, inputCls, btnPrimary, btnSecondary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { WhoSection } from '../../components/kit/WhoSection'
import { Dialog, DialogContent } from '../../components/kit/Dialog'
import { useAppPath } from '../../lib/basePath'

type Conversation = {
  id: string; kind: 'dm'|'group_dm'|'email_thread'; subject: string
  scope_client_user_id: string|null; assignee_user_id: string|null
  priority: 'low'|'normal'|'high'|'urgent'; status: 'open'|'snoozed'|'closed'
  last_message_at: string; created_at: string; latest_message_at: string|null
  unread_count: number; participant_count: number
  assignee_name: string|null; client_name: string|null
}
type Message = {
  id: string; conversation_id: string; sender_user_id: string|null
  body_md: string; body_html: string|null; is_internal_note: 0|1
  in_reply_to_message_id: string|null; created_at: string
  sender_name: string|null; sender_email: string|null; sender_role: string|null
}
type Participant = { user_id: string; role_in_conv: string; full_name: string|null; email: string; user_role: string; last_seen_at: string|null }
type Detail = { conversation: Conversation; participants: Participant[]; messages: Message[]; can_see_internal_notes: boolean; pins: { message_id: string }[] }
type MentionableUser = { id: string; full_name: string|null; email: string; role: string }

const POLL_MS = 4000

const KIND_LABEL: Record<string, string> = { dm: 'DM', group_dm: 'Group', email_thread: 'Email' }
const STATUS_TONE: Record<string, 'green'|'gold'|'slate'> = { open: 'green', snoozed: 'gold', closed: 'slate' }

export function ConversationsPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('conv'))
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'open'|'closed'|'all'>('open')
  const [kindFilter, setKindFilter] = useState<'all'|'dm'|'group_dm'>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('kind', kindFilter === 'all' ? 'staff' : kindFilter)
      if (search.trim()) params.set('q', search.trim())
      const r = await api.get<{ conversations: Conversation[] }>(`/admin/conversations?${params}`)
      setConversations(r.conversations)
      setSelectedId((current) => {
        const fromUrl = new URLSearchParams(window.location.search).get('conv')
        if (fromUrl && r.conversations.some((c) => c.id === fromUrl)) return fromUrl
        if (current && r.conversations.some((c) => c.id === current)) return current
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) return null
        return r.conversations[0]?.id ?? null
      })
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally { setLoading(false) }
  }, [statusFilter, kindFilter, search])

  useEffect(() => { void load() }, [load])
  useEffect(() => { const t = setInterval(() => void load(), POLL_MS); return () => clearInterval(t) }, [load])

  useEffect(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (selectedId) next.set('conv', selectedId)
      else next.delete('conv')
      if (next.toString() === current.toString()) return current
      return next
    }, { replace: true })
  }, [selectedId, setSearchParams])

  const loadDetail = useCallback(async () => {
    if (!selectedId) { setDetail(null); return }
    try { setDetail(await api.get<Detail>(`/admin/conversations/${selectedId}`)) }
    catch (err) { if (err instanceof ApiError) toast.error(err.message) }
  }, [selectedId])
  useEffect(() => { void loadDetail() }, [loadDetail])
  useEffect(() => { if (!selectedId) return; const t = setInterval(() => void loadDetail(), POLL_MS); return () => clearInterval(t) }, [selectedId, loadDetail])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:grid md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]">
      <Panel className={`min-h-0 flex-1 flex-col !p-0 md:flex md:flex-none ${selectedId ? 'hidden' : 'flex'}`}>
        <div className="flex items-center justify-between border-b border-white/10 p-3">
          <p className="text-sm font-extrabold text-white">Conversations</p>
          <button className={btnPrimary} onClick={() => setComposerOpen(true)}><Plus size={14}/>New</button>
        </div>
        <div className="space-y-2 border-b border-white/10 p-3">
          <input className={inputCls} placeholder="Search subject…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {(['open','closed','all'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusFilter===s?'border-gold/50 bg-gold/10 text-gold':'border-white/10 text-slate-400'}`}>{s}</button>
            ))}
            {(['all','dm','group_dm'] as const).map((k) => (
              <button key={k} onClick={() => setKindFilter(k)} className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${kindFilter===k?'border-gold/50 bg-gold/10 text-gold':'border-white/10 text-slate-400'}`}>{k==='all'?'any type':k==='dm'?'1:1':'group'}</button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-white/10 overflow-y-auto md:max-h-[70vh]">
          {loading && !conversations.length && <p className="p-4 text-xs text-slate-500">Loading conversations…</p>}
          {!loading && !conversations.length && <p className="p-4 text-xs text-slate-500">No conversations match. Start one with the "New" button above.</p>}
          {conversations.map((c) => (
            <button key={c.id} onClick={() => setSelectedId(c.id)} className={`block w-full px-3 py-3 text-left transition ${selectedId===c.id?'bg-gold/[.05]':'hover:bg-white/[.02]'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {c.kind==='group_dm'?<Hash size={13} className="text-slate-500"/>:c.kind==='email_thread'?<AtSign size={13} className="text-slate-500"/>:<User size={13} className="text-slate-500"/>}
                    <p className="truncate text-sm font-bold text-white">{c.subject}</p>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">
                    {c.client_name && <>Client: {c.client_name} · </>}
                    {c.participant_count} participant{c.participant_count===1?'':'s'} · {new Date(c.last_message_at).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}
                  </p>
                </div>
                {c.unread_count > 0 && <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-navy-950">{c.unread_count}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Tag tone={STATUS_TONE[c.status]}>{c.status}</Tag>
                {c.priority !== 'normal' && <Tag tone={c.priority==='urgent'?'red':'gold'}>{c.priority}</Tag>}
                {c.assignee_name && <span className="text-[10px] text-slate-500">→ {c.assignee_name}</span>}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <div className={`min-h-0 flex-1 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
        <ConversationDetail detail={detail} onBack={() => setSelectedId(null)} onChanged={() => { void load(); void loadDetail() }} />
      </div>

      <ComposerDialog
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={(id) => { setComposerOpen(false); setSelectedId(id); void load() }}
      />
    </div>
  )
}

function ConversationDetail({ detail, onBack, onChanged }: { detail: Detail | null; onBack: () => void; onChanged: () => void }) {
  const p = useAppPath()
  const [busy, setBusy] = useState(false)
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [whoOpen, setWhoOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinned = useMemo(() => new Set((detail?.pins || []).map((p) => p.message_id)), [detail])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [detail?.messages.length])

  if (!detail) return <Panel><p className="p-8 text-center text-sm text-slate-500">Select a conversation to view it.</p></Panel>
  const { conversation, participants, messages, can_see_internal_notes } = detail

  async function send() {
    const trimmed = body.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await api.post(`/admin/conversations/${conversation.id}/messages`, { body_md: trimmed, is_internal_note: internal })
      setBody('')
      setInternal(false)
      onChanged()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not send message') }
    finally { setBusy(false) }
  }

  async function togglePin(messageId: string) {
    try {
      if (pinned.has(messageId)) await api.del(`/admin/conversations/${conversation.id}/pins/${messageId}`)
      else await api.post(`/admin/conversations/${conversation.id}/pins`, { message_id: messageId })
      onChanged()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not update pin') }
  }

  async function setStatus(status: 'open'|'closed') {
    try { await api.patch(`/admin/conversations/${conversation.id}`, { status }); onChanged() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not update status') }
  }

  return (
    <Panel className="flex min-h-0 flex-1 flex-col !p-0">
      <div className="sticky top-0 z-10 shrink-0 border-b border-white/10 bg-navy-950/90 p-3 backdrop-blur md:static md:bg-transparent md:p-4 md:backdrop-blur-none">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <button type="button" onClick={onBack} className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:border-gold/40 hover:text-gold md:hidden" aria-label="Back to conversations">
              <ChevronLeft size={16}/>
            </button>
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold text-white md:text-lg">{conversation.subject}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <Tag>{KIND_LABEL[conversation.kind] || conversation.kind}</Tag>
                <Tag tone={STATUS_TONE[conversation.status]}>{conversation.status}</Tag>
                {conversation.priority !== 'normal' && <Tag tone={conversation.priority==='urgent'?'red':'gold'}>{conversation.priority}</Tag>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conversation.status === 'open' ? <button className={`${btnSecondary} !px-2.5 md:!px-3`} onClick={() => setStatus('closed')}>Close</button> : <button className={`${btnSecondary} !px-2.5 md:!px-3`} onClick={() => setStatus('open')}>Reopen</button>}
          </div>
        </div>
      </div>
      <button type="button" onClick={() => setWhoOpen((value) => !value)} className="flex w-full items-center justify-between border-b border-white/10 px-3 py-2 text-left text-xs font-semibold text-slate-400 md:hidden">
        <span className="inline-flex items-center gap-2"><Users size={13}/>Participants</span>
        <ChevronDown size={14} className={`transition ${whoOpen ? 'rotate-180' : ''}`}/>
      </button>
      <div className={`${whoOpen ? 'block' : 'hidden'} md:block`}>
      <WhoSection
        rows={[
          { label: 'People', people: participants.map((part) => ({
            name: part.full_name,
            email: part.email,
            userId: part.user_id,
            role: part.user_role,
            href: part.user_role === 'client' ? p(`clients/${part.user_id}`) : undefined,
          })) },
          { label: 'Assignee', people: conversation.assignee_name ? [{ name: conversation.assignee_name, userId: conversation.assignee_user_id, role: 'Staff' }] : [] },
          { label: 'Client', people: conversation.client_name && conversation.scope_client_user_id ? [{
            name: conversation.client_name,
            userId: conversation.scope_client_user_id,
            role: 'Client',
            href: p(`clients/${conversation.scope_client_user_id}`),
          }] : [] },
        ]}
      />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pb-24 md:min-h-[320px] md:max-h-[52vh] md:p-4 md:pb-4">
        {messages.map((m) => {
          const isNote = !!m.is_internal_note
          return (
            <div key={m.id} className={`group rounded-lg border p-3 ${isNote ? 'border-amber-400/25 bg-amber-400/[.04]' : 'border-white/10 bg-white/[.02]'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Circle size={7} className="text-slate-500" fill="currentColor"/>
                  <span className="text-xs font-bold text-white">{m.sender_name || m.sender_email || 'System'}</span>
                  <span className="text-[10px] text-slate-500">{m.sender_role}</span>
                  {isNote && <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.12em] text-amber-200"><Lock size={8}/>Internal note</span>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span>{new Date(m.created_at).toLocaleString()}</span>
                  <button onClick={() => void togglePin(m.id)} className={`opacity-100 transition md:opacity-40 md:group-hover:opacity-100 ${pinned.has(m.id) ? 'text-gold !opacity-100' : ''}`} aria-label="Pin"><PinIcon size={12}/></button>
                </div>
              </div>
              <div className="prose prose-sm prose-invert mt-2 max-w-none overflow-x-auto text-sm text-slate-200" dangerouslySetInnerHTML={{ __html: m.body_html || escapeHtml(m.body_md) }}/>
            </div>
          )
        })}
        {messages.length === 0 && <p className="text-center text-xs text-slate-500">No messages yet.</p>}
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-white/10 bg-navy-950/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:bg-transparent md:backdrop-blur-none">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${inputCls} min-h-24 resize-y`}
          placeholder={internal ? 'Write an internal note (never visible to clients or vendors)…' : 'Write a message… **bold** *italic* @mention'}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void send() }}
        />
        <div className="mt-2 flex items-center justify-between">
          <label className={`flex items-center gap-2 text-xs font-semibold ${can_see_internal_notes ? 'text-slate-300' : 'text-slate-600'}`}>
            <input type="checkbox" className="accent-gold" checked={internal} disabled={!can_see_internal_notes} onChange={(e) => setInternal(e.target.checked)}/>
            <Lock size={12}/> Internal note
          </label>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-slate-600 md:inline">Ctrl / ⌘ + Enter to send</span>
            <button className={btnPrimary} onClick={() => void send()} disabled={busy || !body.trim()}>{busy ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}Send</button>
          </div>
        </div>
      </div>
    </Panel>
  )
}

type RoleFilter = 'all' | 'staff' | 'client' | 'vendor'
type Priority = 'low' | 'normal' | 'high' | 'urgent'
type ClientOption = { id: string; full_name: string | null; email: string }

const COMPOSER_DRAFT_KEY = 'pmv:hq:composer-draft-v1'

const TEMPLATES: { id: string; label: string; kind: 'dm' | 'group_dm'; subject: string; body: string; priority: Priority }[] = [
  { id: 'client-check', label: 'Client status update', kind: 'dm', subject: 'Quick status update for you', body: 'Hi, wanted to give you a quick update on where things stand. ', priority: 'normal' },
  { id: 'vendor-schedule', label: 'Vendor scheduling', kind: 'dm', subject: 'Scheduling confirmation', body: 'Confirming the appointment window and site details. Please reply with any conflicts. ', priority: 'normal' },
  { id: 'ops-handoff', label: 'Ops handoff', kind: 'group_dm', subject: 'Handoff to next shift', body: 'Handing this over. Current state, open items, and who to loop in: ', priority: 'high' },
  { id: 'urgent-issue', label: 'Urgent property issue', kind: 'group_dm', subject: 'Urgent: property issue needs response', body: 'Flagging an urgent situation at the property. Details, contact, and what we need next: ', priority: 'urgent' },
]

const PRIORITY_META: Record<Priority, { label: string; tone: string }> = {
  low: { label: 'Low', tone: 'border-white/10 text-slate-400 hover:border-white/25' },
  normal: { label: 'Normal', tone: 'border-white/10 text-slate-300 hover:border-white/25' },
  high: { label: 'High', tone: 'border-amber-400/30 text-amber-300 hover:border-amber-400/50' },
  urgent: { label: 'Urgent', tone: 'border-rose-400/30 text-rose-300 hover:border-rose-400/50' },
}

const PRIORITY_ACTIVE: Record<Priority, string> = {
  low: 'border-slate-300/40 bg-slate-300/10 text-slate-100',
  normal: 'border-gold/50 bg-gold/10 text-gold',
  high: 'border-amber-400/60 bg-amber-400/10 text-amber-200',
  urgent: 'border-rose-400/60 bg-rose-400/10 text-rose-200',
}

function ComposerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<'dm'|'group_dm'>('dm')
  const [priority, setPriority] = useState<Priority>('normal')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [participants, setParticipants] = useState<MentionableUser[]>([])
  const [scopeClient, setScopeClient] = useState<ClientOption | null>(null)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [results, setResults] = useState<MentionableUser[]>([])
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<ClientOption[]>([])
  const [busy, setBusy] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)

  // Load persisted draft when the dialog opens
  useEffect(() => {
    if (!open) return
    try {
      const raw = window.localStorage.getItem(COMPOSER_DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as {
        kind?: 'dm'|'group_dm'; priority?: Priority; subject?: string; body?: string
        participants?: MentionableUser[]; scopeClient?: ClientOption | null
      }
      if (draft.subject || draft.body || (draft.participants && draft.participants.length)) {
        setKind(draft.kind === 'group_dm' ? 'group_dm' : 'dm')
        setPriority(draft.priority && PRIORITY_META[draft.priority] ? draft.priority : 'normal')
        setSubject(draft.subject || '')
        setBody(draft.body || '')
        setParticipants(Array.isArray(draft.participants) ? draft.participants : [])
        setScopeClient(draft.scopeClient || null)
        setDraftRestored(true)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Reset when closed
  useEffect(() => {
    if (open) return
    setKind('dm'); setPriority('normal'); setSubject(''); setBody(''); setParticipants([])
    setScopeClient(null); setQuery(''); setResults([]); setClientQuery(''); setClientResults([])
    setRoleFilter('all'); setDraftRestored(false)
  }, [open])

  // Autosave draft
  useEffect(() => {
    if (!open) return
    const draft = { kind, priority, subject, body, participants, scopeClient }
    const empty = !subject.trim() && !body.trim() && participants.length === 0 && !scopeClient
    try {
      if (empty) window.localStorage.removeItem(COMPOSER_DRAFT_KEY)
      else window.localStorage.setItem(COMPOSER_DRAFT_KEY, JSON.stringify(draft))
    } catch {}
  }, [open, kind, priority, subject, body, participants, scopeClient])

  // Participant search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ users: MentionableUser[] }>(`/admin/mentionable-users?q=${encodeURIComponent(query.trim())}`)
        setResults(r.users)
      } catch {}
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  // Client (scope) search
  useEffect(() => {
    if (!clientQuery.trim()) { setClientResults([]); return }
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ clients: ClientOption[] }>(`/admin/clients?q=${encodeURIComponent(clientQuery.trim())}`)
        setClientResults(r.clients || [])
      } catch {}
    }, 200)
    return () => clearTimeout(t)
  }, [clientQuery])

  const filteredResults = useMemo(() => {
    const already = new Set(participants.map((p) => p.id))
    return results
      .filter((r) => !already.has(r.id))
      .filter((r) => {
        if (roleFilter === 'all') return true
        const role = (r.role || '').toLowerCase()
        if (roleFilter === 'staff') return ['owner', 'staff', 'admin', 'super_admin'].includes(role)
        if (roleFilter === 'client') return role === 'client'
        if (roleFilter === 'vendor') return role === 'vendor'
        return true
      })
      .slice(0, 10)
  }, [results, participants, roleFilter])

  const canSubmit = subject.trim().length > 0 && (kind === 'dm' ? participants.length === 1 : participants.length >= 2)

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setKind(t.kind)
    setPriority(t.priority)
    if (!subject.trim()) setSubject(t.subject)
    setBody((prev) => prev ? `${t.body}\n\n${prev}` : t.body)
  }

  function discardDraft() {
    try { window.localStorage.removeItem(COMPOSER_DRAFT_KEY) } catch {}
    setKind('dm'); setPriority('normal'); setSubject(''); setBody(''); setParticipants([])
    setScopeClient(null); setDraftRestored(false)
  }

  async function create() {
    setBusy(true)
    try {
      const r = await api.post<{ id: string }>('/admin/conversations', {
        kind,
        subject: subject.trim(),
        priority,
        scope_client_user_id: scopeClient?.id,
        participant_user_ids: participants.map((p) => p.id),
        initial_body: body.trim() || undefined,
      })
      try { window.localStorage.removeItem(COMPOSER_DRAFT_KEY) } catch {}
      onCreated(r.id)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not create conversation') }
    finally { setBusy(false) }
  }

  const participantsHint = kind === 'dm'
    ? `Pick one recipient (${participants.length}/1)`
    : `Pick at least two participants (${participants.length})`

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        size="lg"
        title="New conversation"
        description="Start a 1:1 or group thread with any staff, client, or vendor."
        className="flex max-h-[92dvh] flex-col overflow-hidden !p-0"
      >
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-3 pt-1 sm:px-6">
          {draftRestored && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gold/20 bg-gold/[.06] px-3 py-2 text-[11px] text-gold">
              <span>Restored your last draft.</span>
              <button type="button" className="font-bold underline underline-offset-2 hover:text-white" onClick={discardDraft}>Discard</button>
            </div>
          )}

          <section>
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Quick starts</p>
            <div className="mt-2 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" onClick={() => applyTemplate(t)}
                  className="shrink-0 rounded-full border border-white/12 bg-white/[.03] px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:border-gold/40 hover:text-gold">
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Type</label>
              <div className="mt-2 flex gap-2">
                {(['dm','group_dm'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setKind(k)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${kind===k?'border-gold/50 bg-gold/10 text-gold':'border-white/10 text-slate-400 hover:border-white/25'}`}>
                    {k==='dm'?'1:1 DM':'Group DM'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Priority</label>
              <div className="mt-2 flex gap-1.5">
                {(['low','normal','high','urgent'] as Priority[]).map((p) => (
                  <button key={p} type="button" onClick={() => setPriority(p)}
                    className={`flex-1 rounded-lg border px-2.5 py-2 text-[12px] font-semibold ${priority===p?PRIORITY_ACTIVE[p]:PRIORITY_META[p].tone}`}>
                    {PRIORITY_META[p].label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Subject</label>
            <input className={`${inputCls} mt-2`} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's this about?"/>
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Link to client (optional)</label>
              {scopeClient && (
                <button type="button" onClick={() => setScopeClient(null)} className="text-[11px] font-semibold text-slate-500 hover:text-white">Unlink</button>
              )}
            </div>
            {scopeClient ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/[.08] px-3 py-2">
                <Lock size={13} className="text-sky-300"/>
                <span className="min-w-0 flex-1 truncate text-sm text-sky-100"><span className="font-semibold">{scopeClient.full_name || scopeClient.email}</span><span className="ml-2 text-[11px] text-sky-300/70">Thread will appear on this client's timeline</span></span>
              </div>
            ) : (
              <>
                <input className={`${inputCls} mt-2`} value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Search clients by name or email..."/>
                {clientResults.length > 0 && (
                  <div className="mt-1 max-h-36 divide-y divide-white/10 overflow-y-auto rounded-lg border border-white/10 bg-navy-950">
                    {clientResults.slice(0, 6).map((r) => (
                      <button key={r.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/[.03]"
                        onClick={() => { setScopeClient(r); setClientQuery(''); setClientResults([]) }}>
                        <span className="min-w-0"><span className="font-semibold text-white">{r.full_name || r.email}</span><span className="ml-2 text-[11px] text-slate-500">{r.email}</span></span>
                        <Plus size={12} className="text-gold"/>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section>
            <div className="flex items-baseline justify-between">
              <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Participants</label>
              <span className="text-[11px] text-slate-500">{participantsHint}</span>
            </div>
            {participants.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {participants.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/[.06] py-1 pl-2.5 pr-1.5 text-[11px] font-semibold text-gold">
                    {p.full_name || p.email}
                    <span className="rounded-full bg-white/[.06] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-300">{p.role}</span>
                    <button type="button" onClick={() => setParticipants((c) => c.filter((x) => x.id !== p.id))} className="grid h-4 w-4 place-items-center rounded-full text-gold hover:bg-white/10 hover:text-white">
                      <X size={10}/>
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['all','staff','client','vendor'] as RoleFilter[]).map((r) => (
                <button key={r} type="button" onClick={() => setRoleFilter(r)}
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${roleFilter===r?'border-gold/50 bg-gold/10 text-gold':'border-white/10 text-slate-500 hover:border-white/25 hover:text-slate-300'}`}>
                  {r==='all'?'Any':r}
                </button>
              ))}
            </div>
            <input className={`${inputCls} mt-2`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email..."/>
            {filteredResults.length > 0 && (
              <div className="mt-1 max-h-48 divide-y divide-white/10 overflow-y-auto rounded-lg border border-white/10 bg-navy-950">
                {filteredResults.map((r) => (
                  <button key={r.id} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/[.03]"
                    onClick={() => { setParticipants((c) => kind === 'dm' ? [r] : [...c, r]); setQuery(''); setResults([]) }}>
                    <span className="min-w-0"><span className="font-semibold text-white">{r.full_name || r.email}</span><span className="ml-2 text-[11px] text-slate-500">{r.email} · {r.role}</span></span>
                    <Plus size={12} className="text-gold"/>
                  </button>
                ))}
              </div>
            )}
            {query.trim() && filteredResults.length === 0 && results.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">No results in "{roleFilter}". Switch the role filter above to broaden the search.</p>
            )}
          </section>

          <section>
            <label className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">First message (optional)</label>
            <textarea className={`${inputCls} mt-2 min-h-28`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Say hello, share context, or paste in the details..."/>
            <p className="mt-1 text-[10px] text-slate-500">Use @name to notify a specific person. Drafts auto-save while you type.</p>
          </section>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-white/10 bg-navy-900/95 px-5 py-3 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={!canSubmit || busy} onClick={() => void create()}>
            {busy && <Loader2 size={14} className="animate-spin"/>}Start conversation
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function escapeHtml(s: string): string { return s.replace(/[&<>]/g, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;') }
