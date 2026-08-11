import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Send, FileText, CalendarClock, AlertTriangle, Inbox, RefreshCw, ChevronRight } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useCapabilities } from '../../lib/capabilities'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { PageIntro, Panel, EmptyState, Tag, btnPrimary, btnOutline, inputCls, NoAccess, SkeletonTable } from '../../components/admin/ui'
import { RichTextComposer } from '../../components/admin/RichTextComposer'
import { Dialog, DialogContent, DialogTrigger } from '../../components/kit/Dialog'

interface AudienceData {
  counts: { employees: number; vendors: number; clients: number; leads: number; prospects: number; opportunities: number }
  vendor_categories: { category: string; n: number }[]
  people: { id: string; email: string; full_name: string | null; role: string; status: string; marketing_email_status?: string; party_type: string | null; vendor_category: string | null; title: string | null }[]
  leads: { id: string; name: string; email: string; phone: string | null; company_name: string | null; record_type: string; lifecycle_stage: string; status: string; email_status: string }[]
  lists: { id: string; name: string; list_type: string; record_type: string }[]
}
interface MessageRow { id: string; subject: string; message_type: string; send_mode: string; status: string; scheduled_at: string | null; recurrence: string | null; next_run_at: string | null; last_sent_at: string | null; sent_at: string | null; created_at: string; created_by_name: string | null; recipient_count: number; sent_count: number; delivered_count: number; failed_count: number }
interface FolderCounts { total: number; drafts: number; scheduled: number; sent: number; exceptions: number }
interface MessageDetail { message: any; recipients: { id: string; email: string; full_name: string | null; recipient_kind: string; status: string; provider_message_id: string | null; sent_at: string | null; error: string | null }[] }

const statusTone: Record<string, 'gold' | 'green' | 'blue' | 'slate' | 'red'> = { draft: 'slate', queued: 'blue', sending: 'gold', sent: 'green', delivered: 'green', delayed: 'gold', canceled: 'slate', failed: 'red', bounced: 'red', suppressed: 'red', complained: 'gold' }
const fmt = (d: string | null) => d ? new Date(d).toLocaleString() : 'Not provided'

function AudienceCheck({ checked, onChange, title, count, detail }: { checked: boolean; onChange: () => void; title: string; count?: number; detail?: string }) {
  return <label className={`flex cursor-pointer items-start gap-3 border-b border-white/5 px-3 py-3 transition last:border-b-0 ${checked ? 'bg-white/[.05]' : 'hover:bg-white/[.025]'}`}><input className="mt-1" type="checkbox" checked={checked} onChange={onChange} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-sm font-medium text-slate-200"><span>{title}</span>{count !== undefined && <span className="text-xs font-normal text-slate-500">{count.toLocaleString()}</span>}</span>{detail && <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>}</span></label>
}

export default function CommunicationsCRMAdmin() {
  const caps = useCapabilities()
  const [searchParams] = useSearchParams()
  const seeded = useRef(false)
  const [audience, setAudience] = useState<AudienceData | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [folders, setFolders] = useState<FolderCounts>({ total: 0, drafts: 0, scheduled: 0, sent: 0, exceptions: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [folder, setFolder] = useState<'all'|'drafts'|'scheduled'|'sent'|'exceptions'>('all')
  const [mailSearch, setMailSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MessageDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [messageType, setMessageType] = useState<'marketing' | 'operational' | 'internal'>('operational')
  const [segments, setSegments] = useState<string[]>([])
  const [userIds, setUserIds] = useState<string[]>([])
  const [inquiryIds, setInquiryIds] = useState<string[]>([])
  const [listIds, setListIds] = useState<string[]>([])
  const [directEmail, setDirectEmail] = useState('')
  const [directStatus, setDirectStatus] = useState<string | null>(null)
  const [recipientSearch, setRecipientSearch] = useState('')
  const [audienceTab, setAudienceTab] = useState<'segments' | 'lists' | 'records'>('records')
  const [eligibleCount, setEligibleCount] = useState<number | null>(null)
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [recurrence, setRecurrence] = useState<'' | 'daily' | 'weekly' | 'monthly'>('')
  const [signature, setSignature] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [a, m, s, f] = await Promise.all([
        api.get<AudienceData>('/admin/comms/audience'),
        api.get<{ messages: MessageRow[] }>('/admin/comms/messages'),
        api.get<{ signature_html: string }>('/admin/my-signature'),
        api.get<FolderCounts>('/admin/comms/folders'),
      ])
      setAudience(a); setMessages(m.messages); setFolders(f); setError(null)
      if (!silent) setSignature(s.signature_html || '')
      if (!seeded.current) {
        const lead = searchParams.get('lead'); const leadIds = searchParams.get('leadIds')?.split(',').filter(Boolean) ?? []; const list = searchParams.get('list'); const client = searchParams.get('client')
        if (lead) setInquiryIds([lead]); else if (leadIds.length) setInquiryIds(leadIds)
        if (list) { setListIds([list]); setAudienceTab('lists') }
        if (client) { setUserIds([client]); setAudienceTab('records') }
        if (lead || leadIds.length || list || client) setComposeOpen(true)
        seeded.current = true
      }
    } catch (err) { if (!silent) setError(err instanceof ApiError ? err.message : 'Could not load the Email Center.') }
    finally { if (!silent) setLoading(false) }
  }, [searchParams])

  const loadDetail = useCallback(async (id: string) => { setDetailLoading(true); try { setDetail(await api.get<MessageDetail>(`/admin/comms/messages/${id}`)) } catch { setDetail(null) } finally { setDetailLoading(false) } }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null) }, [selectedId, loadDetail])
  useLiveRefresh(useCallback(() => load(true), [load]))

  useEffect(() => {
    if (!caps.can_manage_communications) return
    const totalSelectors = segments.length + userIds.length + inquiryIds.length + listIds.length
    if (!totalSelectors) { setEligibleCount(0); return }
    const timer = window.setTimeout(async () => {
      try { const res = await api.post<{ count: number }>('/admin/comms/audience/preview', { message_type: messageType, audience: { segments, user_ids: userIds, inquiry_ids: inquiryIds, list_ids: listIds } }); setEligibleCount(res.count) }
      catch { setEligibleCount(null) }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [segments, userIds, inquiryIds, listIds, messageType, caps.can_manage_communications])

  const toggle = (value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => setter((items) => items.includes(value) ? items.filter((x) => x !== value) : [...items, value])
  const recordMatches = useMemo(() => {
    if (!audience) return { people: [], leads: [] }
    const q = recipientSearch.trim().toLowerCase()
    return { people: audience.people.filter((x) => !q || `${x.full_name || ''} ${x.email}`.toLowerCase().includes(q)), leads: audience.leads.filter((x) => !q || `${x.name} ${x.email} ${x.company_name || ''}`.toLowerCase().includes(q)) }
  }, [audience, recipientSearch])
  const visibleMessages = useMemo(() => {
    const q = mailSearch.trim().toLowerCase()
    return messages.filter((m) => {
      const inFolder = folder === 'all' || (folder === 'drafts' && m.status === 'draft') || (folder === 'scheduled' && m.status === 'queued') || (folder === 'sent' && m.status === 'sent') || (folder === 'exceptions' && ['failed','canceled'].includes(m.status))
      return inFolder && (!q || `${m.subject} ${m.created_by_name || ''} ${m.message_type}`.toLowerCase().includes(q))
    })
  }, [messages, folder, mailSearch])

  function addDirectRecipient() {
    if (!audience) return
    const email = directEmail.trim().toLowerCase(); setDirectStatus(null)
    if (!email || !email.includes('@')) return setDirectStatus('Enter a valid email address.')
    const customer = audience.people.find((person) => person.role === 'client' && person.email.toLowerCase() === email)
    if (customer) { if (!userIds.includes(customer.id)) setUserIds((ids) => [...ids, customer.id]); setDirectStatus(`${customer.full_name || customer.email} added as a recipient.`); setDirectEmail(''); return }
    const lead = audience.leads.find((record) => record.email.toLowerCase() === email)
    if (lead) { if (!inquiryIds.includes(lead.id)) setInquiryIds((ids) => [...ids, lead.id]); setDirectStatus(`${lead.name || lead.email} added as a recipient.`); setDirectEmail(''); return }
    setDirectStatus('That address is not attached to a client or CRM record. Add the record first so the communication remains part of the relationship history.')
  }
  async function uploadImage(file: File) { const res = await api.upload<{ ok: boolean; url: string }>('/admin/comms/images', file); return res.url }
  function insertSignature() { if (!signature.trim()) return window.alert('No signature is saved to your HQ profile yet.'); setBodyHtml((html) => `${html}<br>${signature}`) }
  async function saveSignature() { try { await api.patch('/admin/my-signature', { signature_html: signature }) } catch { window.alert('Your signature could not be saved.') } }
  function resetComposer() { setSubject(''); setBodyHtml(''); setSegments([]); setUserIds([]); setInquiryIds([]); setListIds([]); setDirectEmail(''); setDirectStatus(null); setSendMode('now'); setScheduledAt(''); setRecurrence(''); setEligibleCount(0) }

  async function submit(action: 'draft' | 'send_now' | 'schedule') {
    if (!subject.trim()) return window.alert('Enter a subject before continuing.')
    if (!bodyHtml.trim()) return window.alert('Enter a message before continuing.')
    if (segments.length + userIds.length + inquiryIds.length + listIds.length === 0) return window.alert('Add at least one recipient.')
    if ((action === 'send_now' || action === 'schedule') && eligibleCount === 0) return window.alert('No eligible recipients match this audience.')
    if (action === 'send_now' && !window.confirm(`Send this message now to ${eligibleCount ?? 'the selected'} recipient${eligibleCount === 1 ? '' : 's'}?`)) return
    if (action === 'schedule' && !scheduledAt) return window.alert('Choose a delivery date and time.')
    setBusy(true)
    try {
      await api.post('/admin/comms/messages', { subject, body_html: bodyHtml, message_type: messageType, audience: { segments, user_ids: userIds, inquiry_ids: inquiryIds, list_ids: listIds }, action, scheduled_at: action === 'schedule' ? new Date(scheduledAt).toISOString() : undefined, recurrence: action === 'schedule' && recurrence ? recurrence : undefined })
      resetComposer(); setComposeOpen(false); await load()
    } catch (err) { window.alert(err instanceof ApiError ? err.message : 'The message could not be saved.') }
    finally { setBusy(false) }
  }
  async function sendDraft(id: string) { if (!window.confirm('Send this draft now?')) return; try { await api.post(`/admin/comms/messages/${id}/send`); await load(); await loadDetail(id) } catch (err) { window.alert(err instanceof ApiError ? err.message : 'The draft could not be sent.') } }
  async function cancelMessage(id: string) { if (!window.confirm('Cancel this message?')) return; try { await api.del(`/admin/comms/messages/${id}`); await load(); await loadDetail(id) } catch (err) { window.alert(err instanceof ApiError ? err.message : 'The message could not be canceled.') } }

  if (loading) return <div><PageIntro kicker="HQ Communications" title="Email Center" subtitle="A unified mailbox for client, CRM, internal, scheduled, and campaign email." /><SkeletonTable rows={6} cols={5} /></div>

  const folderItems = [
    { key: 'all' as const, label: 'All mail', count: folders.total, icon: Inbox },
    { key: 'drafts' as const, label: 'Drafts', count: folders.drafts, icon: FileText },
    { key: 'scheduled' as const, label: 'Scheduled', count: folders.scheduled, icon: CalendarClock },
    { key: 'sent' as const, label: 'Sent', count: folders.sent, icon: Send },
    { key: 'exceptions' as const, label: 'Exceptions', count: folders.exceptions, icon: AlertTriangle },
  ]

  return <div className="mx-auto max-w-[1600px]">
    <PageIntro kicker="HQ Communications" title="Email Center" subtitle="Manage one-to-one email, internal communication, scheduled outreach, delivery status, and message history from one workspace." action={caps.can_manage_communications ? <button className={btnPrimary} onClick={() => setComposeOpen(true)}>New email</button> : undefined} />
    {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}

    <Panel className="grid min-h-[690px] overflow-hidden !p-0 xl:grid-cols-[220px_360px_minmax(0,1fr)]">
      <aside className="border-b border-white/10 p-3 xl:border-b-0 xl:border-r">
        <div className="mb-3 flex items-center justify-between px-2"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Folders</p><button className="text-slate-500 hover:text-white" onClick={() => load()} aria-label="Refresh email"><RefreshCw size={14} /></button></div>
        <div className="space-y-1">{folderItems.map((item) => { const Icon = item.icon; return <button key={item.key} onClick={() => setFolder(item.key)} className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm transition ${folder === item.key ? 'bg-gold/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><span className="flex items-center gap-2"><Icon size={15} />{item.label}</span><span className="text-xs text-slate-500">{item.count}</span></button> })}</div>
        <div className="mt-6 border-t border-white/10 pt-4"><p className="px-2 text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Mail types</p><div className="mt-2 space-y-2 px-2 text-xs text-slate-400"><p>Operational / client</p><p>Internal team</p><p>Marketing / outreach</p></div></div>
      </aside>

      <section className="border-b border-white/10 xl:border-b-0 xl:border-r">
        <div className="border-b border-white/10 p-3"><div className="relative"><Search className="absolute left-3 top-2.5 text-slate-500" size={16} /><input className={`${inputCls} !pl-9`} placeholder="Search mail" value={mailSearch} onChange={(e) => setMailSearch(e.target.value)} /></div></div>
        <div className="max-h-[620px] overflow-y-auto">
          {visibleMessages.length === 0 ? <div className="p-5"><EmptyState label="No messages in this view." /></div> : visibleMessages.map((m) => <button key={m.id} onClick={() => setSelectedId(m.id)} className={`w-full border-b border-white/5 px-4 py-3 text-left transition ${selectedId === m.id ? 'bg-white/[.06]' : 'hover:bg-white/[.025]'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{m.subject}</p><p className="mt-1 truncate text-xs text-slate-500">{m.created_by_name || 'Pinnacle Management Ventures'} · {m.message_type}</p></div><ChevronRight size={15} className="mt-1 shrink-0 text-slate-600" /></div><div className="mt-2 flex items-center justify-between gap-2"><Tag tone={statusTone[m.status] || 'slate'}>{m.status}</Tag><span className="text-[11px] text-slate-500">{fmt(m.sent_at || m.scheduled_at || m.created_at)}</span></div><p className="mt-2 text-xs text-slate-500">{m.recipient_count} recipient{m.recipient_count === 1 ? '' : 's'}{m.delivered_count ? ` · ${m.delivered_count} delivered` : ''}{m.failed_count ? ` · ${m.failed_count} exception${m.failed_count === 1 ? '' : 's'}` : ''}</p></button>)}
        </div>
      </section>

      <section className="min-w-0">
        {!selectedId ? <div className="grid h-full min-h-[500px] place-items-center p-8"><div className="max-w-md text-center"><Inbox className="mx-auto mb-4 text-slate-600" size={34} /><h2 className="text-lg font-semibold text-white">Select a message</h2><p className="mt-2 text-sm leading-6 text-slate-500">Open a message to review content, recipients, delivery status, scheduling, and any exceptions.</p></div></div> : detailLoading ? <p className="p-6 text-sm text-slate-400">Loading message…</p> : detail ? <div className="h-full overflow-y-auto p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[.16em] text-slate-500">{detail.message.message_type} email</p><h2 className="mt-1 text-xl font-semibold text-white">{detail.message.subject}</h2><p className="mt-2 text-sm text-slate-500">From {detail.message.created_by_name || detail.message.created_by_email || 'Pinnacle Management Ventures'} · {fmt(detail.message.created_at)}</p></div><Tag tone={statusTone[detail.message.status] || 'slate'}>{detail.message.status}</Tag></div>
          <div className="mt-5 rounded-lg border border-white/10 bg-white/[.025] p-5 text-sm leading-7 text-slate-200" dangerouslySetInnerHTML={{ __html: detail.message.body_html }} />
          <div className="mt-6 flex flex-wrap gap-2">{caps.can_manage_communications && detail.message.status === 'draft' && <button className={btnPrimary} onClick={() => sendDraft(detail.message.id)}>Send now</button>}{caps.can_manage_communications && ['draft','queued'].includes(detail.message.status) && <button className={btnOutline} onClick={() => cancelMessage(detail.message.id)}>Cancel</button>}</div>
          <div className="mt-8"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Recipient delivery</h3><span className="text-xs text-slate-500">Provider-backed status</span></div>{detail.recipients.length === 0 ? <EmptyState label="Recipients will be resolved when this draft is sent." /> : <div className="overflow-x-auto rounded-md border border-white/10"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Sent</th><th className="px-4 py-3">Details</th></tr></thead><tbody>{detail.recipients.map((r) => <tr key={r.id} className="border-b border-white/5 last:border-0"><td className="px-4 py-3"><p className="text-slate-200">{r.full_name || r.email}</p><p className="text-xs text-slate-500">{r.email}</p></td><td className="px-4 py-3"><Tag tone={statusTone[r.status] || 'slate'}>{r.status}</Tag></td><td className="px-4 py-3 text-slate-400">{fmt(r.sent_at)}</td><td className="max-w-[260px] px-4 py-3 text-xs text-slate-500">{r.error || (r.provider_message_id ? 'Provider delivery tracking active.' : 'Awaiting delivery.')}</td></tr>)}</tbody></table></div>}</div>
        </div> : <div className="p-6"><EmptyState label="This message could not be loaded." /></div>}
      </section>
    </Panel>

    <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
      <DialogContent size="xl" title="New email" description="Compose a professional message and select the exact audience, delivery time, and communication type.">
        {!caps.can_manage_communications ? <NoAccess label="sending communications" /> : <div className="max-h-[78vh] overflow-y-auto pr-1"><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-white">Message</p><p className="mt-1 text-xs text-slate-500">Write the final email exactly as the recipient should receive it.</p></div><select className={`${inputCls} !w-auto`} value={messageType} onChange={(e) => setMessageType(e.target.value as any)}><option value="operational">Client / operational</option><option value="internal">Internal team</option><option value="marketing">Marketing / outreach</option></select></div><div className="space-y-4"><input className={inputCls} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} /><RichTextComposer value={bodyHtml} onChange={setBodyHtml} onUploadImage={uploadImage} /><div className="flex flex-wrap gap-2"><button className={btnOutline} onClick={insertSignature}>Insert signature</button><Dialog><DialogTrigger asChild><button className={btnOutline}>Edit signature</button></DialogTrigger><DialogContent title="My email signature" description="This signature is saved to your HQ profile."><RichTextComposer value={signature} onChange={setSignature} onUploadImage={uploadImage} /><button className={`${btnPrimary} mt-4 w-full`} onClick={saveSignature}>Save signature</button></DialogContent></Dialog></div></div></section>
          <aside className="rounded-lg border border-white/10 bg-white/[.02]">
            {messageType !== 'internal' && <div className="border-b border-white/10 p-4"><label className="text-xs font-medium text-slate-400">Direct recipient</label><div className="mt-2 flex gap-2"><input className={inputCls} type="email" placeholder="name@example.com" value={directEmail} onChange={(e) => setDirectEmail(e.target.value)} /><button className={btnOutline} onClick={addDirectRecipient}>Add</button></div>{directStatus && <p className="mt-2 text-xs text-slate-500">{directStatus}</p>}</div>}
            <div className="border-b border-white/10 px-4 py-3"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">Recipients</p><p className="text-xs text-slate-500">Eligible after suppression rules</p></div><p className="text-xl font-semibold text-white">{eligibleCount ?? 'Not provided'}</p></div></div>
            <div className="flex border-b border-white/10 px-2">{([['records','Records'],['segments','Groups'],['lists','Lists']] as const).map(([key,label]) => <button key={key} onClick={() => setAudienceTab(key)} className={`flex-1 border-b-2 px-2 py-3 text-xs font-medium ${audienceTab === key ? 'border-gold text-white' : 'border-transparent text-slate-500'}`}>{label}</button>)}</div>
            <div className="max-h-[280px] overflow-y-auto">
              {audienceTab === 'records' && <><div className="p-3"><input className={inputCls} placeholder="Search clients and CRM records" value={recipientSearch} onChange={(e) => setRecipientSearch(e.target.value)} /></div>{recordMatches.people.slice(0,100).map((p) => <AudienceCheck key={p.id} checked={userIds.includes(p.id)} onChange={() => toggle(p.id,setUserIds)} title={p.full_name || p.email} detail={p.email} />)}{messageType !== 'internal' && recordMatches.leads.slice(0,100).map((p) => <AudienceCheck key={p.id} checked={inquiryIds.includes(p.id)} onChange={() => toggle(p.id,setInquiryIds)} title={p.name || p.email} detail={`${p.company_name ? `${p.company_name} · ` : ''}${p.email}`} />)}</>}
              {audienceTab === 'segments' && <><AudienceCheck checked={segments.includes('all_employees')} onChange={() => toggle('all_employees',setSegments)} title="All employees" count={audience?.counts.employees || 0} />{messageType !== 'internal' && <><AudienceCheck checked={segments.includes('all_clients')} onChange={() => toggle('all_clients',setSegments)} title="All clients" count={audience?.counts.clients || 0} /><AudienceCheck checked={segments.includes('all_leads')} onChange={() => toggle('all_leads',setSegments)} title="All leads and prospects" count={audience?.counts.leads || 0} /></>}</>}
              {audienceTab === 'lists' && (audience?.lists.length ? audience.lists.map((l) => <AudienceCheck key={l.id} checked={listIds.includes(l.id)} onChange={() => toggle(l.id,setListIds)} title={l.name} detail={l.list_type} />) : <div className="p-4 text-xs text-slate-500">No CRM lists are available.</div>)}
            </div>
            <div className="border-t border-white/10 p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Delivery</p><div className="mt-2 flex gap-4 text-sm text-slate-300"><label className="flex items-center gap-2"><input type="radio" checked={sendMode==='now'} onChange={() => setSendMode('now')} />Send now</label><label className="flex items-center gap-2"><input type="radio" checked={sendMode==='schedule'} onChange={() => setSendMode('schedule')} />Schedule</label></div>{sendMode==='schedule' && <div className="mt-3 space-y-2"><input type="datetime-local" className={inputCls} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /><select className={inputCls} value={recurrence} onChange={(e) => setRecurrence(e.target.value as any)}><option value="">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>}</div>
          </aside>
        </div><div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4"><button disabled={busy} className={btnOutline} onClick={() => submit('draft')}>Save draft</button><button disabled={busy} className={btnPrimary} onClick={() => submit(sendMode==='schedule' ? 'schedule' : 'send_now')}>{busy ? 'Working…' : sendMode==='schedule' ? 'Schedule email' : 'Send email'}</button></div></div>}
      </DialogContent>
    </Dialog>
  </div>
}
