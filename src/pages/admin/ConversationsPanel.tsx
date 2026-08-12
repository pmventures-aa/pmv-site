import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AtSign, CheckCheck, Circle, Hash, Loader2, Lock, MessageSquare, Paperclip, PinIcon, Plus, Send, User, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Panel, Tag, inputCls, btnPrimary, btnSecondary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { Dialog, DialogContent } from '../../components/kit/Dialog'

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
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
      if (kindFilter !== 'all') params.set('kind', kindFilter)
      if (search.trim()) params.set('q', search.trim())
      const r = await api.get<{ conversations: Conversation[] }>(`/admin/conversations?${params}`)
      setConversations(r.conversations)
      if (!selectedId && r.conversations[0]) setSelectedId(r.conversations[0].id)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally { setLoading(false) }
  }, [statusFilter, kindFilter, search, selectedId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { const t = setInterval(() => void load(), POLL_MS); return () => clearInterval(t) }, [load])

  const loadDetail = useCallback(async () => {
    if (!selectedId) { setDetail(null); return }
    try { setDetail(await api.get<Detail>(`/admin/conversations/${selectedId}`)) }
    catch (err) { if (err instanceof ApiError) toast.error(err.message) }
  }, [selectedId])
  useEffect(() => { void loadDetail() }, [loadDetail])
  useEffect(() => { if (!selectedId) return; const t = setInterval(() => void loadDetail(), POLL_MS); return () => clearInterval(t) }, [selectedId, loadDetail])

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Panel className="!p-0">
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
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-white/10">
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

      <ConversationDetail detail={detail} onChanged={() => { void load(); void loadDetail() }} />

      <ComposerDialog
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={(id) => { setComposerOpen(false); setSelectedId(id); void load() }}
      />
    </div>
  )
}

function ConversationDetail({ detail, onChanged }: { detail: Detail | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
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
    <Panel className="!p-0">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-extrabold text-white">{conversation.subject}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <Tag>{KIND_LABEL[conversation.kind] || conversation.kind}</Tag>
              <Tag tone={STATUS_TONE[conversation.status]}>{conversation.status}</Tag>
              {conversation.priority !== 'normal' && <Tag tone={conversation.priority==='urgent'?'red':'gold'}>{conversation.priority}</Tag>}
              {conversation.assignee_name && <span>Assignee: {conversation.assignee_name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conversation.status === 'open' ? <button className={btnSecondary} onClick={() => setStatus('closed')}>Close</button> : <button className={btnSecondary} onClick={() => setStatus('open')}>Reopen</button>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {participants.map((p) => (
            <span key={p.user_id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[.02] px-2.5 py-1 text-[11px] text-slate-300" title={p.email}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${presenceDot(p.last_seen_at)}`}/>
              {p.full_name || p.email}
              <span className="text-slate-500">· {p.user_role}</span>
            </span>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[52vh] min-h-[320px] space-y-3 overflow-y-auto p-4">
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
                  <button onClick={() => void togglePin(m.id)} className={`opacity-40 transition group-hover:opacity-100 ${pinned.has(m.id) ? 'text-gold opacity-100' : ''}`} aria-label="Pin"><PinIcon size={12}/></button>
                </div>
              </div>
              <div className="prose prose-sm prose-invert mt-2 max-w-none text-sm text-slate-200" dangerouslySetInnerHTML={{ __html: m.body_html || escapeHtml(m.body_md) }}/>
            </div>
          )
        })}
        {messages.length === 0 && <p className="text-center text-xs text-slate-500">No messages yet.</p>}
      </div>

      <div className="border-t border-white/10 p-3">
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
            <span className="text-[10px] text-slate-600">Ctrl / ⌘ + Enter to send</span>
            <button className={btnPrimary} onClick={() => void send()} disabled={busy || !body.trim()}>{busy ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}Send</button>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function ComposerDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<'dm'|'group_dm'>('dm')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [participants, setParticipants] = useState<MentionableUser[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MentionableUser[]>([])
  const [busy, setBusy] = useState(false)

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

  useEffect(() => { if (!open) { setKind('dm'); setSubject(''); setBody(''); setParticipants([]); setQuery(''); setResults([]) } }, [open])

  const canSubmit = subject.trim() && participants.length >= 1 && (kind === 'dm' ? participants.length === 1 : participants.length >= 2)

  async function create() {
    setBusy(true)
    try {
      const r = await api.post<{ id: string }>('/admin/conversations', {
        kind, subject: subject.trim(),
        participant_user_ids: participants.map((p) => p.id),
        initial_body: body.trim() || undefined,
      })
      onCreated(r.id)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not create conversation') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent size="lg" title="New conversation" description="Start a 1:1 or group thread with any staff, client, or vendor.">
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['dm','group_dm'] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${kind===k?'border-gold/50 bg-gold/10 text-gold':'border-white/10 text-slate-400'}`}>{k==='dm'?'1:1 DM':'Group DM'}</button>
          ))}
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400">Subject</label>
          <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's this about?"/>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400">Participants ({participants.length}{kind==='dm'?' / 1':''})</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {participants.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/[.06] px-2.5 py-1 text-[11px] font-semibold text-gold">
                {p.full_name || p.email}<button onClick={() => setParticipants((c) => c.filter((x) => x.id !== p.id))} className="text-gold hover:text-white"><X size={10}/></button>
              </span>
            ))}
          </div>
          <input className={`${inputCls} mt-2`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email…"/>
          {results.length > 0 && (
            <div className="mt-1 max-h-40 divide-y divide-white/10 overflow-y-auto rounded-lg border border-white/10 bg-navy-950">
              {results.filter((r) => !participants.find((p) => p.id === r.id)).slice(0, 8).map((r) => (
                <button key={r.id} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-white/[.03]" onClick={() => { setParticipants((c) => kind === 'dm' ? [r] : [...c, r]); setQuery(''); setResults([]) }}>
                  <span><span className="font-semibold text-white">{r.full_name || r.email}</span><span className="ml-2 text-[11px] text-slate-500">{r.email} · {r.role}</span></span>
                  <Plus size={12} className="text-gold"/>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-400">First message (optional)</label>
          <textarea className={`${inputCls} min-h-24`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Say hello…"/>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} disabled={!canSubmit || busy} onClick={() => void create()}>{busy && <Loader2 size={14} className="animate-spin"/>}Start conversation</button>
      </div>
      </DialogContent>
    </Dialog>
  )
}

function escapeHtml(s: string): string { return s.replace(/[&<>]/g, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;') }

function presenceDot(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'bg-slate-500'
  const ageMs = Date.now() - new Date(lastSeenAt).getTime()
  if (ageMs < 3 * 60_000) return 'bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,.7)]'
  if (ageMs < 15 * 60_000) return 'bg-amber-400'
  return 'bg-slate-500'
}
