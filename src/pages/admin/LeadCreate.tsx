import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, ShieldCheck, UserPlus } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { PageIntro, Panel, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { BrandMark3D } from '../../components/ui'
import { toast } from '../../components/kit/toast'

type DraftLead = {
  record_type: 'person' | 'business'
  first_name: string
  last_name: string
  company_name: string
  email: string
  phone: string
  job_title: string
  source: string
  lifecycle_stage: 'lead' | 'prospect' | 'opportunity'
  message: string
}

const blank: DraftLead = {
  record_type: 'person',
  first_name: '',
  last_name: '',
  company_name: '',
  email: '',
  phone: '',
  job_title: '',
  source: '',
  lifecycle_stage: 'lead',
  message: '',
}

export default function LeadCreate() {
  const p = useAppPath()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<DraftLead>(blank)
  const [sendInvite, setSendInvite] = useState(true)
  const [busy, setBusy] = useState(false)

  const displayName = draft.record_type === 'business'
    ? draft.company_name.trim()
    : `${draft.first_name.trim()} ${draft.last_name.trim()}`.trim()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.email.trim()) return toast.error('Enter an email address before creating the lead.')
    setBusy(true)
    try {
      const result = await api.post<{ id: string }>('/admin/crm/records', {
        ...draft,
        company_name: draft.company_name || undefined,
        phone: draft.phone || undefined,
        job_title: draft.job_title || undefined,
        source: draft.source || 'Manual entry',
      })

      let inviteSent = false
      if (sendInvite) {
        try {
          const invite = await api.post<{ email_status: string; email_error?: string }>('/admin/invitations', {
            invite_type: 'client',
            email: draft.email.trim(),
            full_name: displayName,
            lead_id: result.id,
          })
          inviteSent = invite.email_status === 'sent'
          if (!inviteSent) toast.error(`Lead created, but the invitation email was not sent. ${invite.email_error || ''}`)
        } catch (err) {
          toast.error(err instanceof ApiError ? `Lead created, but the invitation could not be sent: ${err.message}` : 'Lead created, but the invitation could not be sent.')
        }
      }

      toast.success(inviteSent ? 'Lead created and branded account invitation sent.' : 'Lead created.')
      navigate(p(`leads/${result.id}/overview`))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create lead.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="mx-auto max-w-6xl pb-16">
    <PageIntro
      kicker="Relationship onboarding"
      title="Create a Lead"
      subtitle="Build the CRM relationship once, then optionally invite the person into their secure Pinnacle account immediately."
    />

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className="!p-0 overflow-hidden">
        <div className="border-b border-white/[.08] px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[.15em] text-gold">Lead profile</p><h2 className="mt-1 text-xl font-semibold text-white">Start with the relationship</h2></div>
            <select className={`${inputCls} !w-auto min-w-36`} value={draft.record_type} onChange={(e) => setDraft((d) => ({ ...d, record_type: e.target.value as DraftLead['record_type'] }))}><option value="person">Person</option><option value="business">Business</option></select>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-6 p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            {draft.record_type === 'person' ? <>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-400">First name</span><input className={inputCls} required value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-400">Last name</span><input className={inputCls} value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-400">Company</span><input className={inputCls} value={draft.company_name} onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))} /></label>
              <label><span className="mb-1.5 block text-xs font-semibold text-slate-400">Job title</span><input className={inputCls} value={draft.job_title} onChange={(e) => setDraft((d) => ({ ...d, job_title: e.target.value }))} /></label>
            </> : <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-400">Business name</span><input className={inputCls} required value={draft.company_name} onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))} /></label>}
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-400">Email</span><input className={inputCls} type="email" required value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-400">Phone</span><input className={inputCls} type="tel" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-400">Source</span><input className={inputCls} placeholder="Referral, website, outbound, event" value={draft.source} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))} /></label>
            <label><span className="mb-1.5 block text-xs font-semibold text-slate-400">Lifecycle</span><select className={inputCls} value={draft.lifecycle_stage} onChange={(e) => setDraft((d) => ({ ...d, lifecycle_stage: e.target.value as DraftLead['lifecycle_stage'] }))}><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="opportunity">Opportunity</option></select></label>
            <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-slate-400">Context and initial notes</span><textarea className={`${inputCls} min-h-[120px]`} placeholder="What brought them to Pinnacle, what they need, and anything the next person should know." value={draft.message} onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))} /></label>
          </div>

          <label className={`flex cursor-pointer gap-4 rounded-2xl border p-4 transition ${sendInvite ? 'border-gold/30 bg-gold/[.055]' : 'border-white/10 bg-white/[.018]'}`}>
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#c9a227]" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
            <div className="min-w-0"><div className="flex items-center gap-2"><Mail size={16} className="text-gold"/><p className="font-semibold text-white">Send a branded account invitation</p></div><p className="mt-1 text-sm leading-6 text-slate-400">After the lead is created, Pinnacle emails a private 24-hour invitation tied to this CRM relationship so they can create their client account without re-entering the relationship manually.</p></div>
          </label>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[.08] pt-5 sm:flex-row sm:justify-end">
            <button type="button" className={btnOutline} onClick={() => navigate(p('inquiries'))}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Creating…' : sendInvite ? 'Create Lead & Send Invite' : 'Create Lead'}</button>
          </div>
        </form>
      </Panel>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-gold/20 bg-gradient-to-b from-gold/[.07] to-white/[.02] p-5">
          <BrandMark3D size={92} decorative className="mx-auto" />
          <div className="mt-3 text-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-gold">Pinnacle Client Invitation</p><p className="mt-2 text-sm font-semibold text-white">Professional from the first touch</p></div>
          <div className="mt-5 space-y-3 text-sm text-slate-400">
            <div className="flex gap-3"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-gold"/><span>Private, tracked invitation with a 24-hour expiration.</span></div>
            <div className="flex gap-3"><UserPlus size={17} className="mt-0.5 shrink-0 text-gold"/><span>Connected to the lead so onboarding starts with the context HQ already captured.</span></div>
            <div className="flex gap-3"><Mail size={17} className="mt-0.5 shrink-0 text-gold"/><span>Uses Pinnacle’s existing branded invitation email and account-creation experience.</span></div>
          </div>
        </div>
        <button type="button" onClick={() => navigate(`${p('invitations')}?type=client&name=${encodeURIComponent(displayName)}&email=${encodeURIComponent(draft.email)}`)} className="w-full rounded-xl border border-white/10 bg-white/[.02] px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-gold/30 hover:text-gold">Open Invitation Center Instead</button>
      </aside>
    </div>
  </div>
}
