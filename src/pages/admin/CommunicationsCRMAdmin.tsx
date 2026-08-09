import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useCapabilities } from '../../lib/capabilities'
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

interface MessageRow {
  id: string
  subject: string
  message_type: string
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

const statusTone: Record<string, 'gold' | 'green' | 'blue' | 'slate' | 'red'> = { draft: 'slate', queued: 'blue', sending: 'gold', sent: 'green', canceled: 'slate', failed: 'red' }

function fmt(d: string | null) { return d ? new Date(d).toLocaleString() : '—' }

function AudienceCheck({ checked, onChange, title, count, detail }: { checked: boolean; onChange: () => void; title: string; count?: number; detail?: string }) {
  return <label className={`flex cursor-pointer items-start gap-3 border-b border-white/5 px-3 py-3 transition last:border-b-0 ${checked ? 'bg-gold/[0.06]' : 'hover:bg-white/[0.025]'}`}><input className="mt-1" type="checkbox" checked={checked} onChange={onChange} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-sm font-medium text-slate-200"><span>{title}</span>{count !== undefined && <span className="text-xs font-normal text-slate-500">{count.toLocaleString()}</span>}</span>{detail && <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>}</span></label>
}

export default function CommunicationsCRMAdmin() {
  const caps = useCapabilities()
  const [searchParams] = useSearchParams()
  const seeded = useRef(false)
  const [audience, setAudience] = useState<AudienceData | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [messageType, setMessageType] = useState<'marketing' | 'operational' | 'internal'>('marketing')
  const [segments, setSegments] = useState<string[]>([])
  const [userIds, setUserIds] = useState<string[]>([])
  const [inquiryIds, setInquiryIds] = useState<string[]>([])
  const [listIds, setListIds] = useState<string[]>([])
  const [recipientSearch, setRecipientSearch] = useState('')
  const [audienceTab, setAudienceTab] = useState<'segments' | 'lists' | 'records'>('segments')
  const [eligibleCount, setEligibleCount] = useState<number | null>(null)
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [recurrence, setRecurrence] = useState<'' | 'daily' | 'weekly' | 'monthly'>('')
  const [signature, setSignature] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [a, m, s] = await Promise.all([
        api.get<AudienceData>('/admin/comms/audience'),
        api.get<{ messages: MessageRow[] }>('/admin/comms/messages'),
        api.get<{ signature_html: string }>('/admin/my-signature'),
      ])
      setAudience(a); setMessages(m.messages); setSignature(s.signature_html || '')
      if (!seeded.current) {
        const lead = searchParams.get('lead')
        const leadIds = searchParams.get('leadIds')?.split(',').filter(Boolean) ?? []
        const list = searchParams.get('list')
        const client = searchParams.get('client')
        if (lead) setInquiryIds([lead])
        else if (leadIds.length) setInquiryIds(leadIds)
        if (list) setListIds([list])
        if (client) setUserIds([client])
        if (lead || leadIds.length || client) setAudienceTab('records')
        if (list) setAudienceTab('lists')
        seeded.current = true
      }
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not load Communications Center.') }
    finally { setLoading(false) }
  }, [searchParams])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!caps.can_manage_communications) return
    const totalSelectors = segments.length + userIds.length + inquiryIds.length + listIds.length
    if (!totalSelectors) { setEligibleCount(0); return }
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.post<{ count: number }>('/admin/comms/audience/preview', { message_type: messageType, audience: { segments, user_ids: userIds, inquiry_ids: inquiryIds, list_ids: listIds } })
        setEligibleCount(res.count)
      } catch { setEligibleCount(null) }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [segments, userIds, inquiryIds, listIds, messageType, caps.can_manage_communications])

  const toggle = (value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => setter((items) => items.includes(value) ? items.filter((x) => x !== value) : [...items, value])

  const recordMatches = useMemo(() => {
    if (!audience) return { people: [], leads: [] }
    const q = recipientSearch.trim().toLowerCase()
    const people = audience.people.filter((x) => !q || `${x.full_name || ''} ${x.email}`.toLowerCase().includes(q))
    const leads = audience.leads.filter((x) => !q || `${x.name} ${x.email} ${x.company_name || ''}`.toLowerCase().includes(q))
    return { people, leads }
  }, [audience, recipientSearch])

  async function uploadImage(file: File) { const res = await api.upload<{ ok: boolean; url: string }>('/admin/comms/images', file); return res.url }
  function insertSignature() { if (!signature.trim()) return window.alert('You have not saved a signature yet.'); setBodyHtml((html) => `${html}<br>${signature}`) }
  async function saveSignature() { try { await api.patch('/admin/my-signature', { signature_html: signature }) } catch { window.alert('Could not save signature.') } }

  function resetComposer() {
    setSubject(''); setBodyHtml(''); setSegments([]); setUserIds([]); setInquiryIds([]); setListIds([]); setSendMode('now'); setScheduledAt(''); setRecurrence(''); setEligibleCount(0)
  }

  async function submit(action: 'draft' | 'send_now' | 'schedule') {
    if (!subject.trim()) return window.alert('A subject is required.')
    if (!bodyHtml.trim()) return window.alert('A message body is required.')
    if (segments.length + userIds.length + inquiryIds.length + listIds.length === 0) return window.alert('Pick at least one audience.')
    if ((action === 'send_now' || action === 'schedule') && eligibleCount === 0) return window.alert('That audience has no eligible email recipients.')
    if (action === 'send_now' && !window.confirm(`Send this now to ${eligibleCount ?? 'the'} eligible recipient${eligibleCount === 1 ? '' : 's'}?`)) return
    if (action === 'schedule' && !scheduledAt) return window.alert('Pick a date/time to schedule for.')
    setBusy(true)
    try {
      await api.post('/admin/comms/messages', {
        subject, body_html: bodyHtml, message_type: messageType,
        audience: { segments, user_ids: userIds, inquiry_ids: inquiryIds, list_ids: listIds },
        action, scheduled_at: action === 'schedule' ? new Date(scheduledAt).toISOString() : undefined,
        recurrence: action === 'schedule' && recurrence ? recurrence : undefined,
      })
      resetComposer(); await load()
    } catch (err) { window.alert(err instanceof ApiError ? err.message : 'Could not save this message.') }
    finally { setBusy(false) }
  }

  async function sendDraft(id: string) { if (!window.confirm('Send this draft now?')) return; try { await api.post(`/admin/comms/messages/${id}/send`); await load() } catch (err) { window.alert(err instanceof ApiError ? err.message : 'Could not send.') } }
  async function cancelMessage(id: string) { if (!window.confirm('Cancel this message?')) return; try { await api.del(`/admin/comms/messages/${id}`); await load() } catch (err) { window.alert(err instanceof ApiError ? err.message : 'Could not cancel.') } }

  if (loading) return <div><PageIntro kicker="HQ" title="Communications Center" subtitle="Build audiences and communicate from one place." /><SkeletonTable rows={5} cols={5} /></div>

  return <div className="mx-auto max-w-[1540px]">
    <PageIntro kicker="Engagement" title="Communications Center" subtitle="Send from one CRM audience model: clients, leads, prospects, saved lists, employees, vendors, or selected records." />
    {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}

    {caps.can_manage_communications ? <Panel className="mb-8 !p-0">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="p-5 sm:p-6 xl:border-r xl:border-white/10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Message</p><h2 className="mt-1 text-lg font-semibold text-white">Compose once, target precisely</h2></div><select className={`${inputCls} !w-auto`} value={messageType} onChange={(e) => setMessageType(e.target.value as any)}><option value="marketing">Marketing / outreach</option><option value="operational">Operational / relationship</option><option value="internal">Internal team</option></select></div>
          <div className="space-y-4">
            <input className={inputCls} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <RichTextComposer value={bodyHtml} onChange={setBodyHtml} onUploadImage={uploadImage} />
            <div className="flex flex-wrap items-center gap-3"><button type="button" className={btnOutline} onClick={insertSignature}>Insert my signature</button><Dialog><DialogTrigger asChild><button type="button" className={`${btnOutline} !py-1.5 text-xs`}>Edit signature</button></DialogTrigger><DialogContent title="My signature" description="Appended when you click Insert my signature."><RichTextComposer value={signature} onChange={setSignature} onUploadImage={uploadImage} /><button type="button" className={`${btnPrimary} mt-4 w-full`} onClick={saveSignature}>Save signature</button></DialogContent></Dialog></div>
          </div>
        </section>

        <aside>
          <div className="border-b border-white/10 px-5 py-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Audience</p><p className="mt-1 text-sm font-semibold text-white">Who should receive this?</p></div><div className="text-right"><p className="font-display text-2xl text-white">{eligibleCount ?? '—'}</p><p className="text-[10px] uppercase tracking-wide text-slate-500">eligible emails</p></div></div></div>
          <div className="flex border-b border-white/10 px-3">{([['segments','Segments'],['lists','Lists'],['records','Records']] as const).map(([key,label]) => <button key={key} onClick={() => setAudienceTab(key)} className={`flex-1 border-b-2 px-2 py-3 text-xs font-medium ${audienceTab === key ? 'border-gold text-white' : 'border-transparent text-slate-500'}`}>{label}</button>)}</div>
          <div className="max-h-[430px] overflow-y-auto">
            {audienceTab === 'segments' && <div>
              {messageType !== 'internal' && <><AudienceCheck checked={segments.includes('all_clients')} onChange={() => toggle('all_clients', setSegments)} title="All clients" count={audience?.counts.clients ?? 0} detail="Active client accounts" /><AudienceCheck checked={segments.includes('all_leads')} onChange={() => toggle('all_leads', setSegments)} title="All leads & prospects" count={audience?.counts.leads ?? 0} detail="All open pre-client CRM records" /><AudienceCheck checked={segments.includes('lifecycle:prospect')} onChange={() => toggle('lifecycle:prospect', setSegments)} title="Prospects" count={audience?.counts.prospects ?? 0} /><AudienceCheck checked={segments.includes('lifecycle:opportunity')} onChange={() => toggle('lifecycle:opportunity', setSegments)} title="Opportunities" count={audience?.counts.opportunities ?? 0} /><AudienceCheck checked={segments.includes('record_type:business')} onChange={() => toggle('record_type:business', setSegments)} title="Business records" detail="Open CRM records marked as businesses" /><AudienceCheck checked={segments.includes('record_type:person')} onChange={() => toggle('record_type:person', setSegments)} title="People records" detail="Open CRM records marked as people" /></>}
              {messageType !== 'marketing' && <><AudienceCheck checked={segments.includes('all_employees')} onChange={() => toggle('all_employees', setSegments)} title="All employees" count={audience?.counts.employees ?? 0} /><AudienceCheck checked={segments.includes('all_vendors')} onChange={() => toggle('all_vendors', setSegments)} title="All vendors" count={audience?.counts.vendors ?? 0} />{audience?.vendor_categories.map((c) => <AudienceCheck key={c.category} checked={segments.includes(`vendor_category:${c.category}`)} onChange={() => toggle(`vendor_category:${c.category}`, setSegments)} title={c.category} count={c.n} detail="Vendor category" />)}</>}
            </div>}
            {audienceTab === 'lists' && <div>{audience?.lists.length ? audience.lists.map((list) => <AudienceCheck key={list.id} checked={listIds.includes(list.id)} onChange={() => toggle(list.id, setListIds)} title={list.name} detail={`${list.list_type === 'dynamic' ? 'Dynamic segment' : 'Static list'} · ${list.record_type}`} />) : <p className="p-5 text-sm text-slate-500">No saved lists or segments yet.</p>}</div>}
            {audienceTab === 'records' && <div><div className="sticky top-0 z-10 border-b border-white/10 bg-navy-950 p-3"><input className={inputCls} placeholder="Search clients, leads, people, businesses…" value={recipientSearch} onChange={(e) => setRecipientSearch(e.target.value)} /></div>{messageType !== 'internal' && recordMatches.leads.map((lead) => <AudienceCheck key={`lead-${lead.id}`} checked={inquiryIds.includes(lead.id)} onChange={() => toggle(lead.id, setInquiryIds)} title={lead.name} detail={`${lead.email}${lead.company_name ? ` · ${lead.company_name}` : ''} · ${lead.lifecycle_stage}`} />)}{recordMatches.people.filter((person) => messageType !== 'internal' || person.role !== 'client').map((person) => <AudienceCheck key={`user-${person.id}`} checked={userIds.includes(person.id)} onChange={() => toggle(person.id, setUserIds)} title={person.full_name || person.email} detail={`${person.email} · ${person.party_type === 'vendor' ? 'Vendor' : person.role === 'client' ? 'Client' : 'Team'}`} />)}</div>}
          </div>
          <div className="border-t border-white/10 p-5">
            {messageType === 'marketing' && <p className="mb-4 text-xs leading-5 text-slate-500">Marketing sends automatically exclude CRM records and clients marked unsubscribed, bounced, or suppressed.</p>}
            <div className="mb-3 flex gap-3 text-sm text-slate-300"><label className="flex items-center gap-1.5"><input type="radio" checked={sendMode === 'now'} onChange={() => setSendMode('now')} /> Now</label><label className="flex items-center gap-1.5"><input type="radio" checked={sendMode === 'schedule'} onChange={() => setSendMode('schedule')} /> Schedule</label></div>
            {sendMode === 'schedule' && <div className="mb-3 space-y-2"><input type="datetime-local" className={inputCls} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /><select className={inputCls} value={recurrence} onChange={(e) => setRecurrence(e.target.value as any)}><option value="">One-time</option><option value="daily">Repeats daily</option><option value="weekly">Repeats weekly</option><option value="monthly">Repeats monthly</option></select></div>}
            <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} className={btnOutline} onClick={() => submit('draft')}>Save draft</button><button type="button" disabled={busy} className={btnPrimary} onClick={() => submit(sendMode === 'now' ? 'send_now' : 'schedule')}>{busy ? 'Working…' : sendMode === 'now' ? 'Send now' : 'Schedule'}</button></div>
          </div>
        </aside>
      </div>
    </Panel> : <div className="mb-8"><NoAccess label="composing or sending communications" /></div>}

    <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Communication history</h2><span className="text-xs text-slate-500">{messages.length} campaigns / messages</span></div>
    {messages.length === 0 ? <EmptyState label="No messages yet." /> : <div className="overflow-x-auto rounded-md border border-white/10"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3 font-medium">Subject</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Recipients</th><th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">By</th><th className="px-4 py-3 font-medium" /></tr></thead><tbody>{messages.map((m) => <tr key={m.id} className="border-b border-white/5 last:border-0"><td className="px-4 py-3 font-medium text-slate-200">{m.subject}</td><td className="px-4 py-3 text-slate-500">{m.message_type || 'marketing'}</td><td className="px-4 py-3"><Tag tone={statusTone[m.status] ?? 'slate'}>{m.status}{m.recurrence ? ` · ${m.recurrence}` : ''}</Tag></td><td className="px-4 py-3 text-slate-400">{m.recipient_count} total{m.recipient_count > 0 ? ` · ${m.sent_count} sent${m.failed_count ? ` · ${m.failed_count} failed` : ''}` : ''}</td><td className="px-4 py-3 text-slate-400">{m.status === 'sent' ? fmt(m.sent_at) : m.status === 'queued' ? `next: ${fmt(m.next_run_at)}` : fmt(m.created_at)}</td><td className="px-4 py-3 text-slate-400">{m.created_by_name}</td><td className="px-4 py-3 text-right">{caps.can_manage_communications && m.status === 'draft' && <button className={`${btnOutline} !px-2.5 !py-1 text-xs`} onClick={() => sendDraft(m.id)}>Send now</button>}{caps.can_manage_communications && (m.status === 'draft' || m.status === 'queued') && <button className={`${btnOutline} ml-2 !px-2.5 !py-1 text-xs`} onClick={() => cancelMessage(m.id)}>Cancel</button>}</td></tr>)}</tbody></table></div>}
  </div>
}
