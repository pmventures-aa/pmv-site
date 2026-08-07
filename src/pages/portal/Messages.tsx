import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Card, PageHeader, EmptyState } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'

interface Msg {
  id: string
  body: string
  sender_user_id: string
  created_at: string
}

export default function Messages() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ messages: Msg[] }>('/portal/messages')
      setMessages([...res.messages].reverse())
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    try {
      await api.post('/portal/messages', { body: draft.trim() })
      setDraft('')
      await load()
    } catch {
      toast.error('Message could not be sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Secure messages" title="Messages" subtitle="A private line to your Pinnacle team." />
      <Card className="flex h-[60vh] flex-col !p-0">
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : loadError ? (
            <div className="space-y-2 text-sm text-slate-400">
              <p>Couldn't load messages.</p>
              <button onClick={() => { setLoading(true); load() }} className="text-gold hover:underline">
                Try again
              </button>
            </div>
          ) : messages.length === 0 ? (
            <EmptyState label="No messages yet — say hello below." />
          ) : (
            <ul className="space-y-3">
              {messages.map((m) => {
                const mine = m.sender_user_id === user?.id
                return (
                  <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-gold/20 text-white' : 'bg-white/[0.06] text-slate-200'}`}>
                      <p>{m.body}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{new Date(m.created_at).toLocaleString()}</p>
                    </div>
                  </li>
                )
              })}
              <div ref={bottomRef} />
            </ul>
          )}
        </div>
        <form onSubmit={send} className="flex items-center gap-3 border-t border-white/10 p-4">
          <input
            className={`${inputCls} flex-1`}
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={sending} className="btn-gold disabled:opacity-60">
            Send
          </button>
        </form>
      </Card>
    </div>
  )
}
