import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { Building2, Copy, ExternalLink, MailPlus, UserRound } from 'lucide-react'
import { vendorApplicationCopy } from '../../lib/workspace'
import { useAppPath } from '../../lib/basePath'
import { formatInviteTtl, INVITE_TTL_PRESETS, parseInviteTtlHours } from '../../../shared/inviteTtl'

interface Invite {
  id: string; invite_type: string; email: string; full_name: string | null; status: string
  expires_at: string; created_at: string; inviter_name: string | null; role_name: string | null
  client_name: string | null; metadata_json: string
  email_status?: string | null; email_sent_at?: string | null; email_delivered_at?: string | null; email_error?: string | null
  staged_user_id?: string | null; staged_user_name?: string | null; staged_user_status?: string | null
}
interface RoleDef { id: string; name: string; party_type: string }

interface InviteForm {
  invite_type: string; full_name: string; email: string; vendor_category: string; company_name: string
  role_definition_id: string; lead_id: string; recipient_context: 'flexible' | 'person' | 'business'
  known_services: string[]; personal_note: string
}
const generalProviderUrl = 'https://secure.pinnaclemanagementventures.com/hq/vendor-signup'
const providerServices = [
  ['mobile_notary','Commissioned notary'], ['ron','Remote Online Notary (RON)'], ['property_field','Property / field services'],
  ['document_courier','Document courier / runner'], ['merchant_technology','POS & payment technology'],
  ['business_operations','Business operations / admin'], ['bookkeeping_financial','Bookkeeping / financial'], ['other','Other professional service'],
] as const
const blank: InviteForm = { invite_type: 'vendor', full_name: '', email: '', vendor_category: '', company_name: '', role_definition_id: '', lead_id: '', recipient_context: 'flexible', known_services: [], personal_note: '' }
function tone(status: string): 'green' | 'red' | 'gold' | 'slate' {
  if (status === 'accepted' || status === 'delivered') return 'green'
  if (status === 'expired' || status === 'revoked' || status === 'failed' || status === 'bounced') return 'red'
  if (status === 'pending' || status === 'sent' || status === 'queued') return 'gold'
  return 'slate'
}
function emailLabel(row: Invite) {
  if (row.email_status === 'delivered') return 'Delivered'
  if (row.email_status === 'sent') return 'Sent'
  if (row.email_status === 'failed') return 'Failed'
  if (row.email_status === 'bounced') return 'Bounced'
  if (row.email_status === 'queued') return 'Queued'
  return 'Not tracked'
}
function parseBulk(raw:string,type:'client'|'vendor'){
  return raw.split(/\n+/).map(line=>line.trim()).filter(Boolean).map(line=>{
    const [email,name='',company='',specialty='']=line.split(',').map(v=>v.trim())
    return {invite_type:type,email,full_name:name,company_name:company,vendor_category:specialty}
  }).filter(r=>r.email)
}
function inviteContext(row: Invite) {
  let metadata: Record<string, unknown> = {}
  try { metadata = JSON.parse(row.metadata_json || '{}') as Record<string, unknown> } catch { metadata = {} }
  return row.role_name || row.client_name || String(metadata.company_name || metadata.vendor_category || 'General invitation')
}

export default function InvitationsAdmin() {
  const p = useAppPath()
  const [params] = useSearchParams()
  const prefill = useMemo(() => ({ ...blank, invite_type: params.get('type') || 'vendor', full_name: params.get('name') || '', email: params.get('email') || '', lead_id: params.get('lead') || '' }), [params])
  const [rows, setRows] = useState<Invite[]>([])
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [canInviteStaff, setCanInviteStaff] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(() => !!(prefill.email || prefill.full_name))
  const [showBulk,setShowBulk]=useState(false)
  const [bulkType,setBulkType]=useState<'client'|'vendor'>('client')
  const [bulkText,setBulkText]=useState('')
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(prefill)
  const [inviteTtlHours, setInviteTtlHours] = useState(24)
  const [ttlBusy, setTtlBusy] = useState(false)
  const selectedKnownServices = providerServices.filter(([key])=>form.known_services.includes(key)).map(([,label])=>label)
  const vendorCopy = vendorApplicationCopy(form.known_services.length ? form.known_services : form.vendor_category ? [form.vendor_category] : [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const invites = await api.get<{ invitations: Invite[]; can_invite_staff: boolean; invite_ttl_hours?: number }>('/admin/invitations')
      setRows(invites.invitations);setCanInviteStaff(invites.can_invite_staff)
      setInviteTtlHours(parseInviteTtlHours(invites.invite_ttl_hours))
      if (invites.can_invite_staff) setRoles((await api.get<{ roles: RoleDef[] }>('/admin/invitation-role-options')).roles)
      else setRoles([])
    } catch (err) { if (!silent) toast.error(err instanceof ApiError ? err.message : 'Could not load invitations.') }
    finally { if (!silent) setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const backgroundLoad=useCallback(()=>load(true),[load])
  useLiveRefresh(backgroundLoad)

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const result = await api.post<{ email_status: string; email_error?: string; staged_user_id?: string | null }>('/admin/invitations', form)
      if (result.email_status === 'sent') toast.success(`Invitation emailed to ${form.email}. Tracking is on; delivered updates when the mailbox accepts it.${form.invite_type==='vendor'?' A pending vendor profile is on Team & Vendors.':''}`)
      else toast.error(`Invitation created, but the email was not sent. ${result.email_error || ''}`)
      setShowForm(false); setForm(blank); await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not create invitation.') }
    finally { setBusy(false) }
  }
  async function sendBulk(){
    const batch=parseBulk(bulkText,bulkType);if(!batch.length)return toast.error('Paste at least one email address.')
    setBusy(true);try{const result=await api.post<{sent:number;failed:number}>('/admin/invitations/bulk',{rows:batch});toast.success(`${result.sent} invitation${result.sent===1?'':'s'} sent${result.failed?` · ${result.failed} need attention`:''}.`);setBulkText('');setShowBulk(false);await load()}catch(err){toast.error(err instanceof ApiError?err.message:'Could not send invitations.')}finally{setBusy(false)}
  }
  async function action(id: string, kind: 'resend' | 'revoke') {
    try { await api.post(`/admin/invitations/${id}/${kind}`, {}); toast.success(kind === 'resend' ? `A fresh branded invitation was emailed. It expires in ${formatInviteTtl(inviteTtlHours)}. Tracking is on.` : 'Invitation revoked.'); await load() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : `Could not ${kind} invitation.`) }
  }
  async function copyGeneralApplication() {
    try { await navigator.clipboard.writeText(generalProviderUrl); toast.success('General provider application link copied.') }
    catch { toast.error('Could not copy the link. Open the application and copy it from the address bar.') }
  }
  function toggleKnownService(key:string) {
    setForm((current)=>({...current,known_services:current.known_services.includes(key)?current.known_services.filter((item)=>item!==key):[...current.known_services,key]}))
  }

  async function saveInviteTtl(hours: number) {
    const next = parseInviteTtlHours(hours)
    setTtlBusy(true)
    try {
      const result = await api.patch<{ invite_ttl_hours: number }>('/admin/invitations/settings', { invite_ttl_hours: next })
      setInviteTtlHours(result.invite_ttl_hours)
      toast.success(`New invitation links will expire after ${formatInviteTtl(result.invite_ttl_hours)}.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update invitation expiry.')
    } finally {
      setTtlBusy(false)
    }
  }

  const visible = rows.filter((r) => filter === 'all' || r.status === filter || (filter === 'vendor' && r.invite_type === 'vendor') || (filter === 'delivered' && r.email_status === 'delivered'))
  const counts = { pending: rows.filter((r) => r.status === 'pending').length, accepted: rows.filter((r) => r.status === 'accepted').length, delivered: rows.filter((r) => r.email_status === 'delivered').length }

  return <div>
    <PageIntro kicker="Professional network growth" title="Invitations & Applications" subtitle="Send a personal, tracked invitation when you know the professional, or share the open application when you do not need a private link." action={<div className="flex flex-wrap gap-2"><button className={btnOutline} onClick={()=>setShowBulk(v=>!v)}>{showBulk?'Close bulk tools':'Bulk invitations'}</button><button className={btnPrimary} onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close invitation' : 'Create invitation'}</button></div>} />

    <Panel className="mb-6 overflow-hidden !border-gold/20 !p-0"><div className="grid lg:grid-cols-[1fr_auto]"><div className="p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gold/20 bg-gold/[.07] text-gold"><MailPlus size={19}/></span><div><p className="eyebrow">Open provider application</p><h2 className="mt-2 text-lg font-semibold text-white">A general link for any professional or business</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Anyone with this link can apply without a private invitation. They choose whether they are applying as an individual, sole proprietor, or business and select every service they want Pinnacle to review.</p></div></div></div><div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-white/[.018] p-5 lg:border-l lg:border-t-0"><button type="button" className={btnOutline} onClick={copyGeneralApplication}><Copy size={15}/>Copy link</button><a className={btnPrimary} href={generalProviderUrl} target="_blank" rel="noreferrer">Open application<ExternalLink size={14}/></a></div></div></Panel>

    <Panel className="mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Private invite links</p>
          <h2 className="mt-1 text-base font-semibold text-white">Company-wide expiry</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">New invitations and resent tokens expire after this window. The open provider application above does not use a private token.</p>
        </div>
        <label className="w-full max-w-xs">
          <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-slate-500">Link lifetime</span>
          <select className={inputCls} disabled={ttlBusy} value={String(inviteTtlHours)} onChange={(e) => void saveInviteTtl(Number(e.target.value))}>
            {INVITE_TTL_PRESETS.map((item) => <option key={item.hours} value={item.hours}>{item.label}</option>)}
            {!INVITE_TTL_PRESETS.some((item) => item.hours === inviteTtlHours) && <option value={inviteTtlHours}>{formatInviteTtl(inviteTtlHours)}</option>}
          </select>
        </label>
      </div>
    </Panel>

    <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-lg">{([['Pending', counts.pending], ['Accepted', counts.accepted], ['Delivered', counts.delivered]] as const).map(([label, value]) => <Panel key={label} className="!p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></Panel>)}</div>

    {showBulk&&<Panel className="mb-6 !border-gold/20"><div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">Automated outreach</p><h2 className="mt-2 text-lg font-semibold text-white">Send a batch of private invitations</h2><p className="mt-2 text-sm leading-6 text-slate-400">Useful after importing leads, building a provider list, or inviting an existing relationship into Pinnacle. Each person gets their own tracked {formatInviteTtl(inviteTtlHours)} link and branded email.</p><div className="mt-4 flex gap-2">{(['client','vendor'] as const).map(t=><button key={t} onClick={()=>setBulkType(t)} className={`rounded-md border px-3 py-2 text-xs ${bulkType===t?'border-gold/40 bg-gold/10 text-gold':'border-white/10 text-slate-400'}`}>{t==='client'?'Prospective clients':'Professional providers'}</button>)}</div></div><div><label className="block text-xs text-slate-400">One person per line: <strong className="text-slate-300">email, name, company, specialty</strong></label><textarea className={`${inputCls} mt-2 min-h-[150px]`} value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder={bulkType==='vendor'?'pro@example.com, Jordan Lee, Lee Inspections, Property inspector':'client@example.com, Jamie Smith, Smith Holdings'}/><div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-500">{parseBulk(bulkText,bulkType).length} ready to invite · max 100 per batch</span><button disabled={busy} onClick={sendBulk} className={btnPrimary}>{busy?'Sending…':'Send branded invites'}</button></div></div></div></Panel>}

    {showForm && <Panel className="mb-6 !border-gold/25 !p-0"><form onSubmit={send}><div className="border-b border-white/10 px-5 py-4 sm:px-6"><p className="eyebrow">New invitation</p><h2 className="mt-2 text-xl font-semibold text-white">{form.invite_type==='staff'?'Invite a Pinnacle employee':form.invite_type==='client'?'Invite a client into their workspace':vendorCopy.title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{form.invite_type==='staff'?'The role template decides what they see in HQ after they activate access.':form.invite_type==='client'?'The client invitation opens a private workspace. Their live services later shape login, dashboard, and mobile tabs.':vendorCopy.sideBody}</p></div><div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]"><div className="space-y-6 p-5 sm:p-6">
      <div className="grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-xs font-medium text-slate-400">Invitation type</span><select className={inputCls} value={form.invite_type} onChange={(e)=>setForm((f)=>({...f,invite_type:e.target.value,role_definition_id:''}))}><option value="vendor">Professional vendor / provider</option><option value="client">Prospective client</option>{canInviteStaff && <option value="staff">Staff account</option>}</select></label><label><span className="mb-1.5 block text-xs font-medium text-slate-400">Email address</span><input className={inputCls} type="email" required value={form.email} onChange={(e)=>setForm((f)=>({...f,email:e.target.value}))}/></label><label><span className="mb-1.5 block text-xs font-medium text-slate-400">Person’s name</span><input className={inputCls} placeholder="Recommended for a personal email" value={form.full_name} onChange={(e)=>setForm((f)=>({...f,full_name:e.target.value}))}/></label>{form.invite_type==='vendor'&&<label><span className="mb-1.5 block text-xs font-medium text-slate-400">Business / practice name <span className="text-slate-600">(optional)</span></span><input className={inputCls} placeholder="They can change or add this" value={form.company_name} onChange={(e)=>setForm((f)=>({...f,company_name:e.target.value}))}/></label>}{form.invite_type==='staff'&&canInviteStaff&&<label><span className="mb-1.5 block text-xs font-medium text-slate-400">Role template</span><select className={inputCls} required value={form.role_definition_id} onChange={(e)=>setForm((f)=>({...f,role_definition_id:e.target.value}))}><option value="">Choose role</option>{roles.map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}</div>
      {form.invite_type==='vendor'&&<><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">How should they be able to register?</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{([['flexible','Their choice','Individual or business'],['person','Known person','May still add a business'],['business','Known business','Contact may apply personally']] as const).map(([key,title,detail])=><button type="button" key={key} onClick={()=>setForm((f)=>({...f,recipient_context:key}))} className={`rounded-xl border p-3 text-left transition ${form.recipient_context===key?'border-gold/40 bg-gold/[.07]':'border-white/10 bg-white/[.015] hover:border-white/20'}`}><span className="flex items-center gap-2 text-sm font-semibold text-white">{key==='business'?<Building2 size={15}/>:<UserRound size={15}/>} {title}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{detail}</span></button>)}</div></div>
      <div><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">What do you already know about their work?</p><p className="mt-1 text-xs text-slate-500">This personalizes the email and preselects services. It does not restrict their application.</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{providerServices.map(([key,label])=>{const selected=form.known_services.includes(key);return <button type="button" key={key} onClick={()=>toggleKnownService(key)} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition ${selected?'border-gold/40 bg-gold/[.07] text-gold':'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'}`}><span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${selected?'border-gold bg-gold text-navy-950':'border-white/20'}`}>{selected?'✓':''}</span>{label}</button>})}</div></div>
      <div className="grid gap-4 md:grid-cols-2"><label><span className="mb-1.5 block text-xs font-medium text-slate-400">Other specialty <span className="text-slate-600">(optional)</span></span><input className={inputCls} placeholder="Attorney, contractor, inspector…" value={form.vendor_category} onChange={(e)=>setForm((f)=>({...f,vendor_category:e.target.value}))}/></label><label className="md:col-span-2"><span className="mb-1.5 block text-xs font-medium text-slate-400">Personal note <span className="text-slate-600">(optional)</span></span><textarea className={`${inputCls} min-h-[90px]`} maxLength={800} placeholder="Example: I’ve always appreciated how responsive and thorough you are with clients, and I think that would translate well to the network we’re building." value={form.personal_note} onChange={(e)=>setForm((f)=>({...f,personal_note:e.target.value}))}/><span className="mt-1 block text-right text-[10px] text-slate-600">{form.personal_note.length}/800</span></label></div></>}
      {form.lead_id&&<p className="text-xs text-slate-500">Connected CRM lead: {form.lead_id}</p>}
    </div><aside className="border-t border-white/10 bg-white/[.018] p-5 sm:p-6 lg:border-l lg:border-t-0"><p className="eyebrow">Email preview</p><h3 className="mt-3 text-lg font-semibold text-white">{form.invite_type==='vendor'?vendorCopy.sideTitle:form.invite_type==='staff'?'Activate Pinnacle HQ access':'A clear invitation into Pinnacle'}</h3><p className="mt-3 text-xs leading-6 text-slate-400">{form.invite_type==='vendor'?vendorCopy.sideBody:form.invite_type==='staff'?'The email includes the role they are being invited into and how HQ access is activated.':'The email explains the private client workspace and what happens after they accept.'}</p>{selectedKnownServices.length>0&&<div className="mt-4 rounded-lg border border-gold/20 bg-gold/[.05] p-3"><p className="text-[10px] font-bold uppercase tracking-[.13em] text-gold">Known experience</p><p className="mt-1 text-xs leading-5 text-slate-300">{selectedKnownServices.join(' · ')}</p></div>}<div className="mt-4 rounded-lg border border-white/10 p-3 text-xs leading-5 text-slate-400"><strong className="text-white">Flexible registration:</strong> They can apply personally, as a sole proprietor, or as a business. All prefilled information remains editable.</div><p className="mt-4 text-[11px] leading-5 text-slate-500">Private invitation links expire after {formatInviteTtl(inviteTtlHours)}. The open provider application above does not use a private invitation token.</p></aside></div><div className="flex flex-wrap gap-3 border-t border-white/10 px-5 py-4 sm:px-6"><button className={btnPrimary} disabled={busy}>{busy?'Sending personalized email…':'Send personalized invitation'}</button><button type="button" className={btnOutline} onClick={()=>setShowForm(false)}>Cancel</button></div></form></Panel>}

    <div className="mb-4 flex flex-wrap gap-2">{['all','pending','accepted','expired','delivered','vendor'].map((f)=><button key={f} className={`rounded-full border px-3 py-1.5 text-xs capitalize ${filter===f?'border-gold/40 bg-gold/10 text-gold':'border-white/10 text-slate-400 hover:text-white'}`} onClick={()=>setFilter(f)}>{f}</button>)}</div>
    <Panel className="!p-0">{loading?<p className="p-6 text-sm text-slate-400">Loading invitations…</p>:visible.length===0?<div className="p-6"><EmptyState label="No invitations match this view."/></div>:<><div className="divide-y divide-white/10 md:hidden">{visible.map((r)=><article key={r.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-white">{r.full_name||r.email}</p><p className="mt-1 text-xs text-slate-500">{r.email}</p></div><div className="flex flex-col items-end gap-1"><Tag tone={tone(r.status)}>{r.status}</Tag><Tag tone={tone(r.email_status||'')}>{emailLabel(r)}</Tag></div></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-600">Type</dt><dd className="mt-1 capitalize text-slate-300">{r.invite_type.replace(/_/g,' ')}</dd></div><div><dt className="text-slate-600">Context</dt><dd className="mt-1 text-slate-300">{inviteContext(r)}</dd></div><div className="col-span-2"><dt className="text-slate-600">Expires</dt><dd className="mt-1 text-slate-400">{new Date(r.expires_at).toLocaleString()}</dd></div>{r.email_error&&<div className="col-span-2"><dt className="text-slate-600">Email error</dt><dd className="mt-1 text-rose-300">{r.email_error}</dd></div>}</dl><div className="mt-4 flex flex-wrap gap-4 border-t border-white/[.07] pt-3">{r.status!=='accepted'&&<button className="text-xs font-medium text-gold" onClick={()=>action(r.id,'resend')}>Resend</button>}{r.status==='pending'&&<button className="text-xs font-medium text-rose-300" onClick={()=>action(r.id,'revoke')}>Revoke</button>}{r.staged_user_id&&<Link to={p(`network/${r.staged_user_id}/profile`)} className="text-xs font-medium text-slate-300 hover:text-gold">Open profile</Link>}</div></article>)}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3 font-medium">Recipient</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Invite</th><th className="px-5 py-3 font-medium">Email</th><th className="px-5 py-3 font-medium">Expires</th><th className="px-5 py-3 font-medium">Profile</th><th className="px-5 py-3 font-medium">Actions</th></tr></thead><tbody>{visible.map((r)=><tr key={r.id} className="border-b border-white/5 last:border-0"><td className="px-5 py-3"><p className="font-medium text-white">{r.full_name||r.email}</p><p className="text-xs text-slate-500">{r.email}</p></td><td className="px-5 py-3 capitalize text-slate-300">{r.invite_type.replace(/_/g,' ')}</td><td className="px-5 py-3"><Tag tone={tone(r.status)}>{r.status}</Tag></td><td className="px-5 py-3"><div className="space-y-1"><Tag tone={tone(r.email_status||'')}>{emailLabel(r)}</Tag>{r.email_delivered_at&&<p className="text-[11px] text-slate-500">{new Date(r.email_delivered_at).toLocaleString()}</p>}{r.email_error&&<p className="text-[11px] text-rose-300">{r.email_error}</p>}</div></td><td className="px-5 py-3 text-slate-400">{new Date(r.expires_at).toLocaleString()}</td><td className="px-5 py-3">{r.staged_user_id?<Link to={p(`network/${r.staged_user_id}/profile`)} className="text-xs font-medium text-gold hover:underline">{r.staged_user_status==='pending'?'Pending profile':'Open profile'}</Link>:<span className="text-xs text-slate-600">Not staged</span>}</td><td className="px-5 py-3"><div className="flex gap-3">{r.status!=='accepted'&&<button className="text-xs font-medium text-gold hover:underline" onClick={()=>action(r.id,'resend')}>Resend</button>}{r.status==='pending'&&<button className="text-xs font-medium text-rose-300 hover:underline" onClick={()=>action(r.id,'revoke')}>Revoke</button>}</div></td></tr>)}</tbody></table></div></>}</Panel>
  </div>
}
