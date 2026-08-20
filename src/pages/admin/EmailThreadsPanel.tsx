import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCheck, ChevronLeft, MailPlus, MoreVertical, PenLine, RefreshCw, Reply, Send, Users, XCircle } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { Tag, btnPrimary, btnSecondary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { WhoSection } from '../../components/kit/WhoSection'
import { ResendWebhookPanel } from './settings/ResendWebhookPanel'
import { EmailComposePane, type ComposeDraft } from './EmailComposePane'
import { EmailSignaturesPanel } from './EmailSignaturesPanel'
import { previewSignatureHtml, type EmailSignature, type SignatureRosterPerson } from '../../lib/emailSignatures'
import { composeAddress } from '../../lib/engagements'
import { readComposeQuery, stripComposeQuery } from '../../lib/emailComposeQuery'
import { parseWhoAddresses, uniqueWhoPeople, type WhoPerson, type WhoRow } from '../../lib/who'
import { useAppPath } from '../../lib/basePath'
import { FIRM_NAME } from '../../../shared/letterhead'

type Thread = {
  id: string; subject: string; scope_client_user_id: string|null
  last_activity_at: string; created_at: string; conversation_id: string
  message_count: number; client_name: string | null; client_email?: string | null
  last_from?: string | null
  last_direction: 'inbound'|'outbound'|null; last_status: string|null
  unread?: number
}

type Message = {
  id: string; direction: 'inbound'|'outbound'; from_email: string; from_name: string|null
  to_json: string; cc_json: string; subject: string; body_html: string|null; body_text: string|null
  external_message_id: string|null; in_reply_to_external: string|null
  provider_id: string|null; provider_status: string
  opened_at: string|null; clicked_at: string|null; bounced_at: string|null; error: string|null
  sender_user_id: string|null; created_at: string
}

type Detail = { thread: Thread; messages: Message[]; attachments: any[] }

const POLL_MS = 4000

export function EmailThreadsPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('thread'))
  const [detail, setDetail] = useState<Detail | null>(null)
  const [signatures, setSignatures] = useState<EmailSignature[]>([])
  const [templates, setTemplates] = useState<{ company: string; support: string; personal: string } | undefined>()
  const [roster, setRoster] = useState<SignatureRosterPerson[]>([])
  const [canManageRoster, setCanManageRoster] = useState(false)
  const [draft, setDraft] = useState<ComposeDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [managingSignatures, setManagingSignatures] = useState(false)
  const composeScope = useRef<{ clientId: string | null; inquiryId: string | null }>({ clientId: null, inquiryId: null })
  const seededCompose = useRef(false)

  const loadSignatures = useCallback(async () => {
    try {
      const r = await api.get<{
        signatures: EmailSignature[]
        templates?: { company: string; support: string; personal: string }
        roster?: SignatureRosterPerson[]
        can_manage_roster?: boolean
      }>('/admin/email-signatures')
      setSignatures(r.signatures || [])
      setTemplates(r.templates)
      setRoster(r.roster || [])
      setCanManageRoster(!!r.can_manage_roster)
    } catch (err) { if (err instanceof ApiError) toast.error(err.message) }
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ threads: Thread[] }>('/admin/email-threads')
      setThreads(r.threads)
      setSelectedId((current) => {
        const fromUrl = new URLSearchParams(window.location.search).get('thread')
        if (fromUrl && r.threads.some((t) => t.id === fromUrl)) return fromUrl
        if (current && r.threads.some((t) => t.id === current)) return current
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) return null
        return r.threads[0]?.id ?? null
      })
    } catch (err) { if (err instanceof ApiError) toast.error(err.message) }
  }, [])

  const loadDetail = useCallback(async () => {
    if (!selectedId) { setDetail(null); return }
    try { setDetail(await api.get<Detail>(`/admin/email-threads/${selectedId}`)) }
    catch (err) { if (err instanceof ApiError) toast.error(err.message) }
  }, [selectedId])

  useEffect(() => { void load(); void loadSignatures() }, [load, loadSignatures])
  useEffect(() => { void loadDetail() }, [loadDetail])
  useEffect(() => {
    const timer = window.setInterval(() => { void load(); if (selectedId && !draft) void loadDetail() }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [load, loadDetail, selectedId, draft])
  useLiveRefresh(useCallback(() => { void load(); if (!draft) void loadDetail(); void loadSignatures() }, [load, loadDetail, loadSignatures, draft]))

  useEffect(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (selectedId) next.set('thread', selectedId)
      else next.delete('thread')
      if (next.toString() === current.toString()) return current
      return next
    }, { replace: true })
  }, [selectedId, setSearchParams])

  function selectThread(id: string) {
    setDraft(null)
    setManagingSignatures(false)
    setSelectedId(id)
  }

  useEffect(() => {
    const compose = readComposeQuery(searchParams)
    if (!compose) {
      seededCompose.current = false
      return
    }
    if (seededCompose.current) return
    seededCompose.current = true
    composeScope.current = {
      clientId: compose.clientId,
      inquiryId: compose.inquiryId,
    }
    setManagingSignatures(false)
    setDraft({ mode: 'new', to: composeAddress(compose.name, compose.to), cc: '', bcc: '', subject: '', html: '' })
    setSearchParams((current) => {
      const next = stripComposeQuery(current)
      if (next.toString() === current.toString()) return current
      return next
    }, { replace: true })
  }, [searchParams, setSearchParams])

  function startCompose() {
    composeScope.current = { clientId: null, inquiryId: null }
    setManagingSignatures(false)
    setDraft({ mode: 'new', to: '', cc: '', bcc: '', subject: '', html: '' })
  }

  function startReply() {
    if (!detail) return
    const lastInbound = [...detail.messages].reverse().find((m) => m.direction === 'inbound')
    const firstOut = detail.messages.find((m) => m.direction === 'outbound')
    const to = lastInbound
      ? (lastInbound.from_name ? `${lastInbound.from_name} <${lastInbound.from_email}>` : lastInbound.from_email)
      : safeArray<{ email: string; name?: string }>(firstOut?.to_json).map((a) => a.name ? `${a.name} <${a.email}>` : a.email).join(', ')
    const subject = /^re:/i.test(detail.thread.subject) ? detail.thread.subject : `Re: ${detail.thread.subject}`
    setManagingSignatures(false)
    setDraft({ mode: 'reply', threadId: detail.thread.id, to, cc: '', bcc: '', subject, html: '' })
  }

  async function send(signatureId: string | null) {
    if (!draft) return
    setBusy(true)
    try {
      const to = splitAddresses(draft.to)
      const cc = splitAddresses(draft.cc)
      const bcc = splitAddresses(draft.bcc)
      if (draft.mode === 'reply' && draft.threadId) {
        await api.post(`/admin/email-threads/${draft.threadId}/reply`, {
          body_html: draft.html, cc, bcc, signature_id: signatureId,
        })
        toast.success('Reply sent')
        setDraft(null)
        void load(); void loadDetail()
      } else {
        const r = await api.post<{ thread_id: string }>('/admin/email-threads', {
          subject: draft.subject.trim(), to, cc, bcc,
          body_html: draft.html, signature_id: signatureId,
          scope_client_user_id: composeScope.current.clientId,
          inquiry_id: composeScope.current.inquiryId,
        })
        toast.success('Email sent')
        setDraft(null)
        composeScope.current = { clientId: null, inquiryId: null }
        setSelectedId(r.thread_id)
        void load()
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Send failed')
    } finally { setBusy(false) }
  }

  const unread = threads.filter((t) => t.unread).length

  if (managingSignatures) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/10">
        <EmailSignaturesPanel
          signatures={signatures}
          roster={roster}
          canManageRoster={canManageRoster}
          templates={templates}
          onClose={() => setManagingSignatures(false)}
          onChanged={() => void loadSignatures()}
        />
      </div>
    )
  }

  if (draft) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/10">
        <EmailComposePane
          draft={draft}
          signatures={signatures}
          busy={busy}
          onChange={setDraft}
          onSend={(id) => void send(id)}
          onDiscard={() => setDraft(null)}
          onManageSignatures={() => setManagingSignatures(true)}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResendWebhookPanel compact />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-navy-900/40 md:flex-row">
        <aside className={`w-full shrink-0 flex-col border-b border-white/10 md:flex md:w-[320px] md:border-b-0 md:border-r ${selectedId ? 'hidden' : 'flex'}`}>
          <div className="border-b border-white/10 px-2.5 pb-2 pt-2.5">
            <div className="flex items-center gap-1.5">
              <Users size={12} className="text-gold/80" />
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">Shared inbox</p>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Pinnacle's shared mailbox. The whole HQ team can see and reply to these, not just you.</p>
          </div>
          <div className="flex items-center gap-2 border-b border-white/10 p-2.5">
            <button type="button" className={btnPrimary} onClick={startCompose}><MailPlus size={14}/>New Email</button>
            <button type="button" className={btnSecondary} onClick={() => { void load(); void loadDetail() }} aria-label="Refresh mail" title="Refresh mail">
              <RefreshCw size={14}/>
            </button>
            <p className="ml-auto text-[11px] font-semibold text-slate-500">{unread ? `${unread} unread` : 'Shared'}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.length === 0 && <p className="p-4 text-xs text-slate-500">No email threads yet. Compose one to start.</p>}
            {threads.map((t) => (
              <button key={t.id} type="button" onClick={() => selectThread(t.id)} className={`block w-full border-b border-white/[.05] px-3 py-3 text-left transition ${selectedId === t.id && !draft ? 'bg-gold/[.08]' : 'hover:bg-white/[.03]'}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.unread ? 'bg-rose-500' : 'bg-transparent'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`truncate font-display text-[13px] ${t.unread ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>{t.subject}</p>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {t.last_from && <>{t.last_from} · </>}
                      {t.client_name && <>{t.client_name} · </>}
                      {t.message_count} · {new Date(t.last_activity_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[.12em] text-slate-500">
                      {t.last_direction === 'inbound' ? 'Reply received' : 'Sent by us'}
                    </p>
                  </div>
                  {t.last_status && <StatusPill status={t.last_status}/>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className={`relative min-w-0 flex-1 bg-navy-950/40 ${selectedId ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
          <EmailThreadDetail
            detail={detail}
            onBack={() => setSelectedId(null)}
            onReply={startReply}
            onCompose={startCompose}
            onSignatures={() => setManagingSignatures(true)}
          />
        </section>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const tone: 'green' | 'red' | 'blue' | 'slate' = status === 'delivered' ? 'green' : status === 'bounced' || status === 'failed' ? 'red' : status === 'received' ? 'blue' : 'slate'
  return <Tag tone={tone}>{status}</Tag>
}

function clientWho(thread: Thread, p: (path?: string) => string): WhoPerson[] {
  if (!thread.scope_client_user_id) return []
  return [{
    name: thread.client_name,
    email: thread.client_email,
    userId: thread.scope_client_user_id,
    role: 'Client',
    href: p(`clients/${thread.scope_client_user_id}`),
  }]
}

function messageWhoRows(m: Message): WhoRow[] {
  const to = parseWhoAddresses(m.to_json)
  const cc = parseWhoAddresses(m.cc_json)
  const from: WhoPerson[] = [{
    name: m.from_name || (m.direction === 'outbound' ? FIRM_NAME : null),
    email: m.from_email,
    userId: m.sender_user_id,
    role: m.direction === 'outbound' ? 'Pinnacle' : undefined,
  }]
  return [
    { label: 'From', people: from },
    { label: 'To', people: to },
    { label: 'Cc', people: cc },
    { label: 'Sent', text: new Date(m.created_at).toLocaleString() },
  ]
}

function threadWhoRows(detail: Detail, p: (path?: string) => string): WhoRow[] {
  const people: WhoPerson[] = []
  for (const m of detail.messages) {
    people.push({
      name: m.from_name,
      email: m.from_email,
      userId: m.sender_user_id,
      role: m.direction === 'outbound' ? 'Pinnacle' : undefined,
    })
    people.push(...parseWhoAddresses(m.to_json))
    people.push(...parseWhoAddresses(m.cc_json))
  }
  return [
    { label: 'Client', people: clientWho(detail.thread, p) },
    { label: 'People', people: uniqueWhoPeople(people) },
  ]
}

function EmailThreadDetail({
  detail, onBack, onReply, onCompose, onSignatures,
}: {
  detail: Detail | null
  onBack: () => void
  onReply: () => void
  onCompose: () => void
  onSignatures: () => void
}) {
  const p = useAppPath()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  if (!detail) return <div className="grid h-full place-items-center p-8 text-sm text-slate-500">Select a conversation or start a new email.</div>

  const lastActivity = timeAgoShort(detail.thread.last_activity_at)

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 items-start gap-2 border-b border-white/10 bg-navy-950/85 px-3 py-2.5 backdrop-blur md:static md:items-start md:justify-between md:bg-transparent md:px-4 md:py-3">
        <button type="button" onClick={onBack} className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-slate-300 hover:border-gold/40 hover:text-gold md:hidden" aria-label="Back to inbox">
          <ChevronLeft size={18}/>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold leading-tight tracking-[-.02em] text-white md:text-xl">{detail.thread.subject}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500 md:mt-1 md:text-xs">
            <span className="md:hidden">{detail.messages.length} {detail.messages.length === 1 ? 'message' : 'messages'} · {lastActivity}</span>
            <span className="hidden md:inline">{detail.messages.length} messages · Last activity {new Date(detail.thread.last_activity_at).toLocaleString()}</span>
          </p>
        </div>

        <div className="hidden flex-wrap gap-2 md:flex">
          <button type="button" className={btnPrimary} onClick={onReply}><Reply size={14}/>Reply</button>
          <button type="button" className={btnSecondary} onClick={onCompose}><MailPlus size={14}/>New Email</button>
          <button type="button" className={btnSecondary} onClick={onSignatures}><PenLine size={14}/>Signatures</button>
        </div>

        <div ref={menuRef} className="relative md:hidden">
          <button type="button" onClick={() => setMenuOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 text-slate-300 hover:border-gold/40 hover:text-gold" aria-label="More actions" aria-haspopup="menu" aria-expanded={menuOpen}>
            <MoreVertical size={18}/>
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-11 z-20 w-52 overflow-hidden rounded-xl border border-white/12 bg-navy-900 shadow-2xl">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onCompose() }} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-sm text-slate-200 hover:bg-white/5">
                <MailPlus size={15}/>New email
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onSignatures() }} className="flex w-full items-center gap-2.5 border-t border-white/[.06] px-3.5 py-3 text-left text-sm text-slate-200 hover:bg-white/5">
                <PenLine size={15}/>Signatures
              </button>
            </div>
          )}
        </div>
      </div>

      <WhoSection rows={threadWhoRows(detail, p)} />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pb-24 md:space-y-3 md:p-4 md:pb-4">
        {detail.messages.map((m) => {
          const to = parseWhoAddresses(m.to_json)
          const isOut = m.direction === 'outbound'
          const attachments = detail.attachments.filter((a) => a.email_message_id === m.id)
          const senderLabel = m.from_name || nameFromEmail(m.from_email)
          return (
            <article key={m.id} className={`overflow-hidden rounded-2xl border md:rounded-lg ${isOut ? 'border-gold/25 bg-gold/[.04] md:border-white/10 md:bg-white/[.02]' : 'border-sky-400/25 bg-sky-400/[.05]'}`}>
              <div className="flex items-start justify-between gap-2 px-3 py-2.5 md:hidden">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${isOut ? 'bg-gold/20 text-gold' : 'bg-sky-400/20 text-sky-300'}`}>
                    {isOut ? <Send size={11}/> : <Reply size={11}/>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[13px] font-bold text-white">{senderLabel}</span>
                      <span className="shrink-0 text-[10px] text-slate-500">{timeAgoShort(m.created_at)}</span>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">to {summarizeRecipients(to)}</p>
                  </div>
                </div>
                {m.opened_at && <span title={`Opened ${new Date(m.opened_at).toLocaleString()}`} className="text-emerald-300"><CheckCheck size={14}/></span>}
                {(m.bounced_at || m.provider_status === 'failed' || m.provider_status === 'bounced') && <span className="text-rose-400"><XCircle size={14}/></span>}
              </div>

              <div className="hidden items-center justify-between gap-2 px-4 pt-4 md:flex">
                <div className="flex items-center gap-2">
                  <span className={`grid h-5 w-5 place-items-center rounded ${isOut ? 'bg-gold/15 text-gold' : 'bg-sky-400/15 text-sky-300'}`}>{isOut ? <Send size={11}/> : <Reply size={11}/>}</span>
                  <StatusPill status={m.provider_status}/>
                  {m.opened_at && <span title={`Opened ${new Date(m.opened_at).toLocaleString()}`} className="text-emerald-300"><CheckCheck size={13}/></span>}
                  {m.bounced_at && <span title={`Bounced ${new Date(m.bounced_at).toLocaleString()}`} className="text-rose-400"><XCircle size={13}/></span>}
                </div>
              </div>

              <div className="hidden md:block">
                <WhoSection eyebrow={null} className="border-white/10" rows={messageWhoRows(m)} />
              </div>

              {m.error && <div className="mx-3 mb-2 mt-2 rounded-lg border border-red-400/25 bg-red-400/[.06] p-2.5 text-[11px] text-red-200 md:mx-4 md:mt-2">Delivery error: {m.error}</div>}

              <div className="signature-preview prose prose-sm mx-3 mb-3 mt-1 max-w-none rounded-lg bg-white p-4 font-serif text-[15px] leading-7 text-[#1b2430] md:mx-4 md:mb-4 md:mt-3 md:rounded-md md:p-5" dangerouslySetInnerHTML={{ __html: safeMessageHtml(m.body_html, m.body_text) }}/>

              {attachments.length > 0 && (
                <div className="border-t border-white/10 px-3 py-2 md:px-4">
                  {attachments.map((a) => (
                    <p key={a.id} className="text-[11px] text-slate-400 md:text-slate-500">Attachment: {a.file_name}</p>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="pointer-events-none sticky bottom-0 z-10 shrink-0 md:hidden">
        <div className="pointer-events-auto border-t border-white/10 bg-navy-950/90 px-3 py-2.5 backdrop-blur">
          <button
            type="button"
            onClick={onReply}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-bold text-navy-950 shadow-lg shadow-gold/20 hover:bg-gold-300"
          >
            <Reply size={16}/>Reply
          </button>
        </div>
      </div>
    </div>
  )
}

function nameFromEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return email
  return email.slice(0, at)
}

function summarizeRecipients(to: WhoPerson[]): string {
  if (to.length === 0) return '(no recipients)'
  const first = to[0].name || (to[0].email ? nameFromEmail(to[0].email) : 'recipient')
  if (to.length === 1) return first
  return `${first} +${to.length - 1} others`
}

function timeAgoShort(iso: string): string {
  const then = new Date(iso).getTime()
  if (!then) return ''
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  const min = Math.round(diff / 60_000)
  if (min < 60) return `${min}m ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function splitAddresses(value: string): string[] {
  return value.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
}

function safeArray<T>(json: string | null | undefined): T[] {
  if (!json) return []
  try { const p = JSON.parse(json); return Array.isArray(p) ? p : [] } catch { return [] }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Render one message's body defensively. previewSignatureHtml parses stored
// email HTML from external senders; if it ever throws on a malformed body we
// fall back to the plain text (or a notice) instead of letting the exception
// take down the whole Messages workspace via the error boundary.
function safeMessageHtml(bodyHtml: string | null, bodyText: string | null): string {
  const plain = bodyText ? `<pre class="whitespace-pre-wrap font-serif">${escapeHtml(bodyText)}</pre>` : ''
  try {
    return previewSignatureHtml(bodyHtml || '') || plain || '<em>(empty)</em>'
  } catch {
    return plain || '<em>(could not render this message)</em>'
  }
}
