import { useCallback, useEffect, useState } from 'react'
import { AtSign, Check, CheckCheck, Loader2, MailPlus, Reply, Send, X, XCircle } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Panel, Tag, inputCls, btnPrimary, btnSecondary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { Dialog, DialogContent } from '../../components/kit/Dialog'
import { ResendWebhookPanel } from './settings/ResendWebhookPanel'

type Thread = {
  id: string; subject: string; scope_client_user_id: string|null
  last_activity_at: string; created_at: string; conversation_id: string
  message_count: number; client_name: string|null
  last_direction: 'inbound'|'outbound'|null; last_status: string|null
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

const POLL_MS = 6000

export function EmailThreadsPanel() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ threads: Thread[] }>('/admin/email-threads')
      setThreads(r.threads)
      if (!selectedId && r.threads[0]) setSelectedId(r.threads[0].id)
    } catch (err) { if (err instanceof ApiError) toast.error(err.message) }
  }, [selectedId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { const t = setInterval(() => void load(), POLL_MS); return () => clearInterval(t) }, [load])

  const loadDetail = useCallback(async () => {
    if (!selectedId) { setDetail(null); return }
    try { setDetail(await api.get<Detail>(`/admin/email-threads/${selectedId}`)) }
    catch (err) { if (err instanceof ApiError) toast.error(err.message) }
  }, [selectedId])
  useEffect(() => { void loadDetail() }, [loadDetail])
  useEffect(() => { if (!selectedId) return; const t = setInterval(() => void loadDetail(), POLL_MS); return () => clearInterval(t) }, [selectedId, loadDetail])

  return (
    <div className="space-y-4">
      <ResendWebhookPanel compact />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Panel className="!p-0">
        <div className="flex items-center justify-between border-b border-white/10 p-3">
          <p className="text-sm font-extrabold text-white">Email threads</p>
          <button className={btnPrimary} onClick={() => setComposerOpen(true)}><MailPlus size={14}/>Compose</button>
        </div>
        <div className="max-h-[70vh] divide-y divide-white/10 overflow-y-auto">
          {threads.length === 0 && <p className="p-4 text-xs text-slate-500">No email threads yet. Compose one to start.</p>}
          {threads.map((t) => (
            <button key={t.id} onClick={() => setSelectedId(t.id)} className={`block w-full px-3 py-3 text-left transition ${selectedId === t.id ? 'bg-gold/[.05]' : 'hover:bg-white/[.02]'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><AtSign size={13} className="text-slate-500"/><p className="truncate text-sm font-bold text-white">{t.subject}</p></div>
                  <p className="mt-1 truncate text-[11px] text-slate-500">
                    {t.client_name && <>Client: {t.client_name} · </>}
                    {t.message_count} msg · {new Date(t.last_activity_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                {t.last_status && <StatusPill status={t.last_status}/>}
              </div>
              <div className="mt-1.5 text-[10px] uppercase tracking-[.12em] text-slate-500">
                Last: {t.last_direction === 'inbound' ? '← reply received' : '→ sent by us'}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <EmailThreadDetail detail={detail} onReplied={() => { void load(); void loadDetail() }}/>
      </div>

      <ComposerDialog open={composerOpen} onClose={() => setComposerOpen(false)} onSent={(id) => { setComposerOpen(false); setSelectedId(id); void load() }}/>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const tone: any = status === 'delivered' ? 'green' : status === 'bounced' || status === 'failed' ? 'red' : status === 'received' ? 'blue' : 'slate'
  return <Tag tone={tone}>{status}</Tag>
}

function EmailThreadDetail({ detail, onReplied }: { detail: Detail | null; onReplied: () => void }) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setReply('') }, [detail?.thread.id])

  if (!detail) return <Panel><p className="p-8 text-center text-sm text-slate-500">Select an email thread to view.</p></Panel>

  async function send() {
    if (!reply.trim()) return
    setBusy(true)
    try {
      const html = reply.trim().split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('')
      await api.post(`/admin/email-threads/${detail!.thread.id}/reply`, { body_html: html, body_text: reply.trim() })
      setReply(''); toast.success('Reply sent'); onReplied()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Send failed') }
    finally { setBusy(false) }
  }

  return (
    <Panel className="!p-0">
      <div className="border-b border-white/10 p-4">
        <p className="text-lg font-extrabold text-white">{detail.thread.subject}</p>
        <p className="mt-1 text-xs text-slate-500">{detail.messages.length} messages · Last activity {new Date(detail.thread.last_activity_at).toLocaleString()}</p>
        <p className="mt-1 text-[11px] text-slate-600">Sent as Pinnacle. Reply-To is a private Resend receiving address so the answer threads here instead of a personal inbox.</p>
      </div>

      <div className="max-h-[52vh] min-h-[320px] space-y-3 overflow-y-auto p-4">
        {detail.messages.map((m) => {
          const to = safeArray<{ email: string; name?: string }>(m.to_json)
          const isOut = m.direction === 'outbound'
          return (
            <div key={m.id} className={`rounded-lg border p-4 ${isOut ? 'border-white/10 bg-white/[.02]' : 'border-blue-400/25 bg-blue-400/[.04]'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`grid h-5 w-5 place-items-center rounded ${isOut ? 'bg-gold/15 text-gold' : 'bg-blue-400/15 text-blue-300'}`}>{isOut ? <Send size={11}/> : <Reply size={11}/>}</span>
                    <span className="text-xs font-bold text-white">{m.from_name || m.from_email}</span>
                    <span className="text-[10px] text-slate-500">to {to.map((a) => a.name || a.email).join(', ')}</span>
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
              <div className="prose prose-sm prose-invert mt-3 max-w-none text-sm text-slate-200" dangerouslySetInnerHTML={{ __html: m.body_html || (m.body_text ? `<pre class="whitespace-pre-wrap font-sans">${escapeHtml(m.body_text)}</pre>` : '<em>(empty)</em>') }}/>
              {detail.attachments.filter((a) => a.email_message_id === m.id).map((a) => (
                <p key={a.id} className="mt-2 text-[11px] text-slate-500">Attachment: {a.file_name}</p>
              ))}
            </div>
          )
        })}
      </div>

      <div className="border-t border-white/10 p-3">
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} className={`${inputCls} min-h-24 resize-y`} placeholder="Write a reply. It goes out from Pinnacle and stays on this thread."/>
        <div className="mt-2 flex items-center justify-end">
          <button className={btnPrimary} disabled={busy || !reply.trim()} onClick={() => void send()}>{busy ? <Loader2 size={14} className="animate-spin"/> : <Reply size={14}/>}Send reply</button>
        </div>
      </div>
    </Panel>
  )
}

function ComposerDialog({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (id: string) => void }) {
  const [subject, setSubject] = useState('')
  const [toStr, setToStr] = useState('')
  const [ccStr, setCcStr] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!open) { setSubject(''); setToStr(''); setCcStr(''); setBody('') } }, [open])

  const canSend = subject.trim() && toStr.trim() && body.trim()

  async function send() {
    setBusy(true)
    try {
      const html = body.trim().split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('')
      const r = await api.post<{ thread_id: string }>('/admin/email-threads', {
        subject: subject.trim(),
        to: toStr.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
        cc: ccStr.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
        body_html: html, body_text: body.trim(),
      })
      toast.success('Email sent')
      onSent(r.thread_id)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Send failed') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent size="lg" title="Compose email" description="Sends from pinnaclemanagementventures.com. Replies come back through Resend receiving and land on this thread.">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400">To</label>
            <input className={inputCls} value={toStr} onChange={(e) => setToStr(e.target.value)} placeholder="name@example.com, another@example.com"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">CC (optional)</label>
            <input className={inputCls} value={ccStr} onChange={(e) => setCcStr(e.target.value)} placeholder="cc@example.com"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Subject</label>
            <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)}/>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">Message</label>
            <textarea className={`${inputCls} min-h-40`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your email…"/>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Cancel</button>
          <button className={btnPrimary} disabled={!canSend || busy} onClick={() => void send()}>{busy && <Loader2 size={14} className="animate-spin"/>}Send email</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function safeArray<T>(json: string | null | undefined): T[] {
  if (!json) return []
  try { const p = JSON.parse(json); return Array.isArray(p) ? p : [] } catch { return [] }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
