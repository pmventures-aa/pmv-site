import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCheck, MailPlus, PenLine, RefreshCw, Reply, Send, XCircle } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { Tag, btnPrimary, btnSecondary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { ResendWebhookPanel } from './settings/ResendWebhookPanel'
import { EmailComposePane, type ComposeDraft } from './EmailComposePane'
import { EmailSignaturesPanel } from './EmailSignaturesPanel'
import type { EmailSignature } from '../../lib/emailSignatures'

type Thread = {
  id: string; subject: string; scope_client_user_id: string|null
  last_activity_at: string; created_at: string; conversation_id: string
  message_count: number; client_name: string|null
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
  const [draft, setDraft] = useState<ComposeDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [managingSignatures, setManagingSignatures] = useState(false)

  const loadSignatures = useCallback(async () => {
    try {
      const r = await api.get<{ signatures: EmailSignature[]; templates?: { company: string; support: string; personal: string } }>('/admin/email-signatures')
      setSignatures(r.signatures || [])
      setTemplates(r.templates)
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

  function startCompose() {
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
        })
        toast.success('Email sent')
        setDraft(null)
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
        <EmailSignaturesPanel signatures={signatures} templates={templates} onClose={() => setManagingSignatures(false)} onChanged={() => void loadSignatures()} />
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
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-navy-900/40">
        <aside className="flex w-[min(100%,320px)] shrink-0 flex-col border-r border-white/10">
          <div className="flex items-center gap-2 border-b border-white/10 p-2.5">
            <button type="button" className={btnPrimary} onClick={startCompose}><MailPlus size={14}/>New Email</button>
            <button type="button" className={btnSecondary} onClick={() => { void load(); void loadDetail() }} aria-label="Refresh mail" title="Refresh mail">
              <RefreshCw size={14}/>
            </button>
            <p className="ml-auto text-[11px] font-semibold text-slate-500">{unread ? `${unread} unread` : 'Inbox'}</p>
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

        <section className="relative min-w-0 flex-1 bg-navy-950/40">
          <EmailThreadDetail
            detail={detail}
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

function EmailThreadDetail({
  detail, onReply, onCompose, onSignatures,
}: {
  detail: Detail | null
  onReply: () => void
  onCompose: () => void
  onSignatures: () => void
}) {
  if (!detail) return <div className="grid h-full place-items-center p-8 text-sm text-slate-500">Select a conversation or start a new email.</div>

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold tracking-[-.02em] text-white">{detail.thread.subject}</p>
          <p className="mt-1 text-xs text-slate-500">{detail.messages.length} messages · Last activity {new Date(detail.thread.last_activity_at).toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={onReply}><Reply size={14}/>Reply</button>
          <button type="button" className={btnSecondary} onClick={onCompose}><MailPlus size={14}/>New Email</button>
          <button type="button" className={btnSecondary} onClick={onSignatures}><PenLine size={14}/>Signatures</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {detail.messages.map((m) => {
          const to = safeArray<{ email: string; name?: string }>(m.to_json)
          const isOut = m.direction === 'outbound'
          return (
            <article key={m.id} className={`rounded-lg border p-4 ${isOut ? 'border-white/10 bg-white/[.02]' : 'border-sky-400/25 bg-sky-400/[.05]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`grid h-5 w-5 place-items-center rounded ${isOut ? 'bg-gold/15 text-gold' : 'bg-sky-400/15 text-sky-300'}`}>{isOut ? <Send size={11}/> : <Reply size={11}/>}</span>
                    <span className="text-xs font-bold text-white">{m.from_name || m.from_email}</span>
                    <span className="truncate text-[10px] text-slate-500">to {to.map((a) => a.name || a.email).join(', ')}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">{new Date(m.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusPill status={m.provider_status}/>
                  {m.opened_at && <span title={`Opened ${new Date(m.opened_at).toLocaleString()}`} className="text-emerald-300"><CheckCheck size={13}/></span>}
                  {m.bounced_at && <span title={`Bounced ${new Date(m.bounced_at).toLocaleString()}`} className="text-rose-400"><XCircle size={13}/></span>}
                </div>
              </div>
              {m.error && <div className="mt-2 rounded border border-red-400/25 bg-red-400/[.05] p-2 text-[11px] text-red-200">Delivery error: {m.error}</div>}
              <div className="prose prose-sm mt-3 max-w-none rounded-md bg-white p-5 font-serif text-[15px] leading-7 text-[#1b2430]" dangerouslySetInnerHTML={{ __html: m.body_html || (m.body_text ? `<pre class="whitespace-pre-wrap font-serif">${escapeHtml(m.body_text)}</pre>` : '<em>(empty)</em>') }}/>
              {detail.attachments.filter((a) => a.email_message_id === m.id).map((a) => (
                <p key={a.id} className="mt-2 text-[11px] text-slate-500">Attachment: {a.file_name}</p>
              ))}
            </article>
          )
        })}
      </div>
    </div>
  )
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
