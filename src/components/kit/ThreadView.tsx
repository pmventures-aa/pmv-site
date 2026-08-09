import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
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
}
interface Attachment {
  id: string
  message_id: string
  file_name: string
  content_type: string
  size_bytes: number
}
interface ThreadDetail {
  thread: { id: string; subject: string; client_user_id: string; created_at: string; last_message_at: string }
  messages: ThreadMessage[]
  attachments: Attachment[]
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Shared thread detail (messages + attachments + reply/attach box), used by
// both the client portal's Messages page and the staff console's Messages
// page — the two surfaces differ in how they list/start threads (a client
// always messages "the firm"; staff pick a client), but once a thread is
// open the read/reply/attach experience is identical, so it isn't
// duplicated per surface.
export function ThreadView({ threadId, onSent }: { threadId: string; onSent?: () => void }) {
  const { user } = useAuth()
  const [data, setData] = useState<ThreadDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ThreadDetail>(`/portal/message-threads/${threadId}`)
      setData(res)
    } catch {
      toast.error('Could not load this conversation.')
    } finally {
      setLoading(false)
    }
  }, [threadId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages.length])

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
      toast.error(err instanceof ApiError ? err.message : 'Message could not be sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <p className="p-5 text-sm text-slate-400">Loading…</p>
  if (!data) return <p className="p-5 text-sm text-slate-400">Couldn't load this conversation.</p>

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-5">
        <ul className="space-y-4">
          {data.messages.map((m) => {
            const mine = m.sender_user_id === user?.id
            const files = attachmentsFor(m.id)
            return (
              <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-gold/20 text-white' : 'bg-white/[0.06] text-slate-200'}`}>
                  {!mine && <p className="mb-1 text-xs font-semibold text-gold">{m.sender_name || m.sender_email}</p>}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
                      {files.map((f) => (
                        <li key={f.id}>
                          <a
                            href={`/api/portal/message-attachments/${f.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs text-gold hover:underline"
                          >
                            📎 {f.file_name} <span className="text-slate-500">({fmtSize(f.size_bytes)})</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-[10px] text-slate-500">{new Date(m.created_at).toLocaleString()}</p>
                </div>
              </li>
            )
          })}
          <div ref={bottomRef} />
        </ul>
      </div>
      <form onSubmit={send} className="border-t border-white/10 p-4">
        {pendingFiles.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
                📎 {f.name}
                <button
                  type="button"
                  onClick={() => setPendingFiles((fs) => fs.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-white"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              setPendingFiles((fs) => [...fs, ...files])
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-slate-300 hover:border-gold/40 hover:text-gold"
            aria-label="Attach file"
          >
            📎
          </button>
          <input
            className="flex-1 rounded-md border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none"
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={sending || !draft.trim()} className="btn-gold shrink-0 disabled:opacity-60">
            Send
          </button>
        </div>
      </form>
    </div>
  )
}
