import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCheck, ChevronDown, Paperclip, Users, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { FIRM_NAME } from '../../../shared/letterhead'
import { uniqueWhoPeople, type WhoPerson } from '../../lib/who'
import { Avatar } from './Avatar'
import { WhoSection } from './WhoSection'
import { toast } from './toast'

interface ThreadMessage {
  id: string
  thread_id: string
  sender_user_id: string
  body: string
  created_at: string
  sender_name: string | null
  sender_email: string
  sender_role: string
  delivery_status?: string
  read_at?: string | null
}
interface Attachment {
  id: string
  message_id: string
  file_name: string
  content_type: string
  size_bytes: number
}
interface ThreadDetail {
  thread: {
    id: string
    subject: string
    client_user_id: string
    client_name?: string | null
    client_email?: string | null
    created_at: string
    last_message_at: string
  }
  messages: ThreadMessage[]
  attachments: Attachment[]
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ThreadView({ threadId, onSent }: { threadId: string; onSent?: () => void }) {
  const { user } = useAuth()
  const p = useAppPath()
  const [data, setData] = useState<ThreadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [whoOpen, setWhoOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.get<ThreadDetail>(`/portal/message-threads/${threadId}`))
    } catch {
      toast.error('Unable to load this conversation.')
    } finally {
      setLoading(false)
    }
  }, [threadId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [data?.messages.length])

  const whoRows = useMemo(() => {
    if (!data) return []
    const isStaff = user?.role === 'staff' || user?.role === 'admin'
    const clientHref = isStaff && data.thread.client_user_id ? p(`clients/${data.thread.client_user_id}`) : undefined
    const client: WhoPerson = {
      name: data.thread.client_name,
      email: data.thread.client_email,
      userId: data.thread.client_user_id,
      role: 'Client',
      href: clientHref,
    }
    const staff = uniqueWhoPeople(
      data.messages
        .filter((m) => m.sender_role !== 'client')
        .map((m) => ({
          name: m.sender_name,
          email: m.sender_email,
          userId: m.sender_user_id,
          role: m.sender_role === 'admin' ? 'Admin' : 'Staff',
        })),
    )
    const you = user ? [{
      name: user.full_name,
      email: user.email,
      userId: user.id,
      role: 'You',
    }] : []
    return [
      { label: 'Client', people: [client] },
      { label: 'Pinnacle', people: staff.length ? staff : [{ name: FIRM_NAME, role: 'Firm' }] },
      { label: 'You', people: you },
    ]
  }, [data, p, user])

  function attachmentsFor(messageId: string) {
    return data?.attachments.filter((a) => a.message_id === messageId) ?? []
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    try {
      const res = await api.post<{ id: string }>(`/portal/message-threads/${threadId}/messages`, { body: draft.trim() })
      for (const file of pendingFiles) {
        await api.upload(`/portal/message-threads/${threadId}/messages/${res.id}/attachments`, file)
      }
      setDraft('')
      setPendingFiles([])
      await load()
      onSent?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The message could not be sent. Please try again.')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <p className="p-5 text-sm text-slate-400">Loading conversation…</p>
  if (!data) return <p className="p-5 text-sm text-slate-400">This conversation is currently unavailable.</p>

  return (
    <div className="flex h-full flex-col">
      <div className="thread-view-header border-b border-white/10 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Secure conversation</p>
        <h2 className="mt-1 text-base font-semibold text-white">{data.thread.subject}</h2>
      </div>
      <button type="button" onClick={() => setWhoOpen((value) => !value)} className="flex w-full items-center justify-between border-b border-white/10 px-3 py-2 text-left text-xs font-semibold text-slate-400 md:hidden">
        <span className="inline-flex items-center gap-2"><Users size={13}/>Participants</span>
        <ChevronDown size={14} className={`transition ${whoOpen ? 'rotate-180' : ''}`}/>
      </button>
      {whoOpen && <div className="md:hidden"><WhoSection rows={whoRows} /></div>}
      <div className="hidden md:block"><WhoSection rows={whoRows} /></div>
      <div className="flex-1 overflow-y-auto p-3 pb-24 sm:p-5 md:pb-5">
        <ul className="space-y-4">
          {data.messages.map((m) => {
            const mine = m.sender_user_id === user?.id
            const files = attachmentsFor(m.id)
            return (
              <li key={m.id} className={`flex items-end gap-2.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && <Avatar userId={m.sender_user_id} name={m.sender_name || m.sender_email} size={30} />}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${mine ? 'bg-gold/15 text-white ring-1 ring-gold/20' : 'bg-white/[0.06] text-slate-200 ring-1 ring-white/5'}`}>
                  {!mine && (
                    <div className="mb-1 flex items-center gap-2">
                      <p className="text-xs font-semibold text-gold">{m.sender_name || m.sender_email}</p>
                      <span className="text-[9px] uppercase tracking-wide text-slate-600">{m.sender_role === 'client' ? 'Client' : 'Pinnacle'}</span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap leading-6">{m.body}</p>
                  {files.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-white/10 pt-2">
                      {files.map((f) => (
                        <li key={f.id}>
                          <a href={`/api/portal/message-attachments/${f.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 text-xs text-gold hover:underline">
                            <Paperclip size={13} className="shrink-0"/><span className="truncate">{f.file_name}</span><span className="shrink-0 text-slate-500">({fmtSize(f.size_bytes)})</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex items-center justify-end gap-2 text-[10px] text-slate-500">
                    <span>{new Date(m.created_at).toLocaleString()}</span>
                    {mine && (
                      <span className={`inline-flex items-center gap-1 ${m.read_at ? 'text-emerald-300' : 'text-slate-400'}`} title={m.read_at ? `Read ${new Date(m.read_at).toLocaleString()}` : 'Delivered'}>
                        <CheckCheck size={13} />{m.read_at ? 'Read' : 'Delivered'}
                      </span>
                    )}
                  </div>
                </div>
                {mine && user?.id && <Avatar userId={user.id} name={user.full_name || user.email} size={30} />}
              </li>
            )
          })}
          <div ref={bottomRef} />
        </ul>
      </div>
      <form onSubmit={send} className="sticky bottom-0 z-10 border-t border-white/10 bg-navy-950/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:bg-navy-950/40 md:p-4 md:backdrop-blur-none">
        {pendingFiles.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                <Paperclip size={12} />{f.name}
                <button type="button" onClick={() => setPendingFiles((fs) => fs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-white" aria-label={`Remove ${f.name}`}>
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-3">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              setPendingFiles((fs) => [...fs, ...files])
              e.target.value = ''
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 text-slate-300 hover:border-gold/40 hover:text-gold" aria-label="Attach files">
            <Paperclip size={17} />
          </button>
          <textarea
            className="min-h-[42px] max-h-32 min-w-0 flex-1 resize-y rounded-md border border-white/10 bg-navy-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none"
            placeholder="Write a secure message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={sending || !draft.trim()} className="btn-gold shrink-0 disabled:opacity-60">{sending ? 'Sending…' : 'Send'}</button>
        </div>
        <p className="mt-2 hidden text-[10px] text-slate-600 md:block">Attachments: PDF, PNG, JPG, WebP, DOCX, XLSX, or TXT · 15 MB maximum each</p>
      </form>
    </div>
  )
}
