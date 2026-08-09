import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useCapabilities } from '../../lib/capabilities'
import { PageIntro, Panel, EmptyState, Tag, btnPrimary, btnOutline, inputCls, NoAccess, SkeletonTable } from '../../components/admin/ui'
import { RichTextComposer } from '../../components/admin/RichTextComposer'
import { Dialog, DialogContent, DialogTrigger } from '../../components/kit/Dialog'

interface AudienceData {
  counts: { employees: number; vendors: number }
  vendor_categories: { category: string; n: number }[]
  people: { id: string; email: string; full_name: string | null; status: string; party_type: string | null; vendor_category: string | null; title: string | null }[]
}

interface MessageRow {
  id: string
  subject: string
  send_mode: string
  status: string
  scheduled_at: string | null
  recurrence: string | null
  next_run_at: string | null
  last_sent_at: string | null
  sent_at: string | null
  created_at: string
  created_by_name: string | null
  recipient_count: number
  sent_count: number
  failed_count: number
}

const statusTone: Record<string, 'gold' | 'green' | 'blue' | 'slate' | 'red'> = {
  draft: 'slate',
  queued: 'blue',
  sending: 'gold',
  sent: 'green',
  canceled: 'slate',
  failed: 'red',
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

export default function CommunicationsAdmin() {
  const caps = useCapabilities()
  const [audience, setAudience] = useState<AudienceData | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [segments, setSegments] = useState<string[]>([])
  const [userIds, setUserIds] = useState<string[]>([])
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [recurrence, setRecurrence] = useState<'' | 'daily' | 'weekly' | 'monthly'>('')
  const [signature, setSignature] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [a, m, s] = await Promise.all([
        api.get<AudienceData>('/admin/comms/audience'),
        api.get<{ messages: MessageRow[] }>('/admin/comms/messages'),
        api.get<{ signature_html: string }>('/admin/my-signature'),
      ])
      setAudience(a)
      setMessages(m.messages)
      setSignature(s.signature_html || '')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load Communications Center.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function toggleSegment(seg: string) {
    setSegments((s) => (s.includes(seg) ? s.filter((x) => x !== seg) : [...s, seg]))
  }
  function toggleUser(id: string) {
    setUserIds((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]))
  }

  async function uploadImage(file: File): Promise<string> {
    const res = await api.upload<{ ok: boolean; url: string }>('/admin/comms/images', file)
    return res.url
  }

  function insertSignature() {
    if (!signature.trim()) {
      window.alert('You have not saved a signature yet — set one below first.')
      return
    }
    setBodyHtml((html) => `${html}<br>${signature}`)
  }

  async function saveSignature() {
    try {
      await api.patch('/admin/my-signature', { signature_html: signature })
    } catch {
      window.alert('Could not save signature.')
    }
  }

  function resetComposer() {
    setSubject('')
    setBodyHtml('')
    setSegments([])
    setUserIds([])
    setSendMode('now')
    setScheduledAt('')
    setRecurrence('')
  }

  async function submit(action: 'draft' | 'send_now' | 'schedule') {
    if (!subject.trim()) return window.alert('A subject is required.')
    if (!bodyHtml.trim()) return window.alert('A message body is required.')
    if (segments.length === 0 && userIds.length === 0) return window.alert('Pick at least one segment or individual recipient.')
    if (action === 'send_now' && !window.confirm('Send this now to everyone matched by the audience below?')) return
    if (action === 'schedule' && !scheduledAt) return window.alert('Pick a date/time to schedule for.')

    setBusy(true)
    try {
      await api.post('/admin/comms/messages', {
        subject,
        body_html: bodyHtml,
        audience: { segments, user_ids: userIds },
        action,
        scheduled_at: action === 'schedule' ? new Date(scheduledAt).toISOString() : undefined,
        recurrence: action === 'schedule' && recurrence ? recurrence : undefined,
      })
      resetComposer()
      await load()
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not save this message.')
    } finally {
      setBusy(false)
    }
  }

  async function sendDraft(id: string) {
    if (!window.confirm('Send this draft now?')) return
    try {
      await api.post(`/admin/comms/messages/${id}/send`)
      await load()
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not send.')
    }
  }

  async function cancelMessage(id: string) {
    if (!window.confirm('Cancel this message?')) return
    try {
      await api.del(`/admin/comms/messages/${id}`)
      await load()
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Could not cancel.')
    }
  }

  if (loading) {
    return (
      <div>
        <PageIntro kicker="HQ" title="Communications Center" subtitle="Email employees and vendors — one-off sends or scheduled campaigns." />
        <SkeletonTable rows={5} cols={5} />
      </div>
    )
  }

  return (
    <div>
      <PageIntro
        kicker="HQ"
        title="Communications Center"
        subtitle="Email employees and vendors — one-off sends or scheduled/recurring campaigns. Built on Resend."
      />
      {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}

      {caps.can_manage_communications ? (
        <Panel className="mb-8">
          <h2 className="mb-4 text-sm font-semibold text-white">Compose</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <input className={inputCls} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <RichTextComposer value={bodyHtml} onChange={setBodyHtml} onUploadImage={uploadImage} />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={btnOutline} onClick={insertSignature}>
                  Insert my signature
                </button>
                <Dialog>
                  <DialogTrigger asChild>
                    <button type="button" className={`${btnOutline} !py-1.5 text-xs`}>
                      Edit signature
                    </button>
                  </DialogTrigger>
                  <DialogContent title="My signature" description="Appended to drafts when you click “Insert my signature”.">
                    <RichTextComposer value={signature} onChange={setSignature} onUploadImage={uploadImage} />
                    <button type="button" className={`${btnPrimary} mt-4 w-full`} onClick={saveSignature}>
                      Save signature
                    </button>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Segments</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-slate-200">
                    <input type="checkbox" checked={segments.includes('all_employees')} onChange={() => toggleSegment('all_employees')} />
                    All employees ({audience?.counts.employees ?? 0})
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-200">
                    <input type="checkbox" checked={segments.includes('all_vendors')} onChange={() => toggleSegment('all_vendors')} />
                    All vendors ({audience?.counts.vendors ?? 0})
                  </label>
                  {audience?.vendor_categories.map((c) => (
                    <label key={c.category} className="flex items-center gap-2 pl-4 text-sm text-slate-400">
                      <input
                        type="checkbox"
                        checked={segments.includes(`vendor_category:${c.category}`)}
                        onChange={() => toggleSegment(`vendor_category:${c.category}`)}
                      />
                      {c.category} ({c.n})
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Individuals</p>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-white/10 p-2">
                  {audience?.people.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" checked={userIds.includes(p.id)} onChange={() => toggleUser(p.id)} />
                      <span className="truncate">
                        {p.full_name || p.email} {p.party_type === 'vendor' && <span className="text-slate-500">(vendor)</span>}
                        {p.status !== 'active' && <span className="text-amber-400"> · {p.status}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">When</p>
                <div className="flex gap-3 text-sm text-slate-200">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={sendMode === 'now'} onChange={() => setSendMode('now')} /> Now
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={sendMode === 'schedule'} onChange={() => setSendMode('schedule')} /> Schedule
                  </label>
                </div>
                {sendMode === 'schedule' && (
                  <div className="mt-2 space-y-2">
                    <input type="datetime-local" className={inputCls} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                    <select className={inputCls} value={recurrence} onChange={(e) => setRecurrence(e.target.value as any)}>
                      <option value="">One-time</option>
                      <option value="daily">Repeats daily</option>
                      <option value="weekly">Repeats weekly</option>
                      <option value="monthly">Repeats monthly</option>
                    </select>
                    <p className="text-xs text-slate-500">Scheduled sends flush within ~15 minutes of their time.</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button type="button" disabled={busy} className={`${btnOutline} disabled:opacity-60`} onClick={() => submit('draft')}>
                  Save draft
                </button>
                {sendMode === 'now' ? (
                  <button type="button" disabled={busy} className={`${btnPrimary} disabled:opacity-60`} onClick={() => submit('send_now')}>
                    {busy ? 'Sending…' : 'Send now'}
                  </button>
                ) : (
                  <button type="button" disabled={busy} className={`${btnPrimary} disabled:opacity-60`} onClick={() => submit('schedule')}>
                    {busy ? 'Scheduling…' : 'Schedule'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <div className="mb-8">
          <NoAccess label="composing or sending communications" />
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-white">History</h2>
      {messages.length === 0 ? (
        <EmptyState label="No messages yet." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-white/10">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Recipients</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">By</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-slate-200">{m.subject}</td>
                  <td className="px-4 py-3">
                    <Tag tone={statusTone[m.status] ?? 'slate'}>{m.status}{m.recurrence ? ` · ${m.recurrence}` : ''}</Tag>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {m.recipient_count} total{m.recipient_count > 0 ? ` · ${m.sent_count} sent${m.failed_count ? ` · ${m.failed_count} failed` : ''}` : ''}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {m.status === 'sent' ? fmt(m.sent_at) : m.status === 'queued' ? `next: ${fmt(m.next_run_at)}` : fmt(m.created_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{m.created_by_name}</td>
                  <td className="px-4 py-3 text-right">
                    {caps.can_manage_communications && m.status === 'draft' && (
                      <button className={`${btnOutline} !px-2.5 !py-1 text-xs`} onClick={() => sendDraft(m.id)}>
                        Send now
                      </button>
                    )}
                    {caps.can_manage_communications && (m.status === 'draft' || m.status === 'queued') && (
                      <button className={`${btnOutline} ml-2 !px-2.5 !py-1 text-xs`} onClick={() => cancelMessage(m.id)}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
