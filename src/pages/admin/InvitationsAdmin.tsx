import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'

interface Invite {
  id: string; invite_type: string; email: string; full_name: string | null; status: string
  expires_at: string; created_at: string; inviter_name: string | null; role_name: string | null
  client_name: string | null; metadata_json: string
}
interface RoleDef { id: string; name: string; party_type: string }

const blank = { invite_type: 'vendor', full_name: '', email: '', vendor_category: '', company_name: '', role_definition_id: '', lead_id: '' }
function tone(status: string): 'green' | 'red' | 'gold' | 'slate' {
  if (status === 'accepted') return 'green'
  if (status === 'expired' || status === 'revoked') return 'red'
  if (status === 'pending') return 'gold'
  return 'slate'
}
function parseBulk(raw:string,type:'client'|'vendor'){
  return raw.split(/\n+/).map(line=>line.trim()).filter(Boolean).map(line=>{
    const [email,name='',company='',specialty='']=line.split(',').map(v=>v.trim())
    return {invite_type:type,email,full_name:name,company_name:company,vendor_category:specialty}
  }).filter(r=>r.email)
}

export default function InvitationsAdmin() {
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const invites = await api.get<{ invitations: Invite[]; can_invite_staff: boolean }>('/admin/invitations')
      setRows(invites.invitations);setCanInviteStaff(invites.can_invite_staff)
      if (invites.can_invite_staff) setRoles((await api.get<{ roles: RoleDef[] }>('/admin/invitation-role-options')).roles)
      else setRoles([])
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not load invitations.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const result = await api.post<{ email_status: string; email_error?: string }>('/admin/invitations', form)
      if (result.email_status === 'sent') toast.success(`Branded invitation sent to ${form.email}.`)
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
    try { await api.post(`/admin/invitations/${id}/${kind}`, {}); toast.success(kind === 'resend' ? 'A fresh branded 24-hour invitation was sent.' : 'Invitation revoked.'); await load() }
    catch (err) { toast.error(err instanceof ApiError ? err.message : `Could not ${kind} invitation.`) }
  }

  const visible = rows.filter((r) => filter === 'all' || r.status === filter || (filter === 'vendor' && r.invite_type === 'vendor'))
  const counts = { pending: rows.filter((r) => r.status === 'pending').length, accepted: rows.filter((r) => r.status === 'accepted').length, expired: rows.filter((r) => r.status === 'expired').length }

  return <div>
    <PageIntro kicker="Relationship onboarding" title="Invitation Center" subtitle="Invite prospective clients, professional providers, and team members into the right Pinnacle experience. Every private link expires after 24 hours and its status stays visible here." action={<div className="flex gap-2"><button className={btnOutline} onClick={()=>setShowBulk(v=>!v)}>{showBulk?'Close bulk':'Bulk invites'}</button><button className={btnPrimary} onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : '+ New invitation'}</button></div>} />
    <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-lg">{([['Pending', counts.pending], ['Accepted', counts.accepted], ['Expired', counts.expired]] as const).map(([label, value]) => <Panel key={label} className="!p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></Panel>)}</div>

    {showBulk&&<Panel className="mb-6 !border-gold/20"><div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">Automated outreach</p><h2 className="mt-2 text-lg font-semibold text-white">Send a batch of private invitations</h2><p className="mt-2 text-sm leading-6 text-slate-400">Useful after importing leads, building a provider list, or inviting an existing relationship into Pinnacle. Each person gets their own tracked 24-hour link and branded email.</p><div className="mt-4 flex gap-2">{(['client','vendor'] as const).map(t=><button key={t} onClick={()=>setBulkType(t)} className={`rounded-md border px-3 py-2 text-xs ${bulkType===t?'border-gold/40 bg-gold/10 text-gold':'border-white/10 text-slate-400'}`}>{t==='client'?'Prospective clients':'Professional providers'}</button>)}</div></div><div><label className="block text-xs text-slate-400">One person per line: <strong className="text-slate-300">email, name, company, specialty</strong></label><textarea className={`${inputCls} mt-2 min-h-[150px]`} value={bulkText} onChange={e=>setBulkText(e.target.value)} placeholder={bulkType==='vendor'?'pro@example.com, Jordan Lee, Lee Inspections, Property inspector':'client@example.com, Jamie Smith, Smith Holdings'}/><div className="mt-3 flex items-center justify-between"><span className="text-xs text-slate-500">{parseBulk(bulkText,bulkType).length} ready to invite · max 100 per batch</span><button disabled={busy} onClick={sendBulk} className={btnPrimary}>{busy?'Sending…':'Send branded invites'}</button></div></div></div></Panel>}

    {showForm && <Panel className="mb-6 !border-gold/20"><form onSubmit={send} className="space-y-5"><div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="grid gap-4 md:grid-cols-2">
      <label><span className="mb-1 block text-xs text-slate-400">Invite type</span><select className={inputCls} value={form.invite_type} onChange={(e)=>setForm((f)=>({...f,invite_type:e.target.value,role_definition_id:''}))}><option value="vendor">Professional vendor/provider</option><option value="client">Prospective client</option>{canInviteStaff && <option value="staff">Employee / staff</option>}</select></label>
      <label><span className="mb-1 block text-xs text-slate-400">Full name</span><input className={inputCls} value={form.full_name} onChange={(e)=>setForm((f)=>({...f,full_name:e.target.value}))}/></label>
      <label><span className="mb-1 block text-xs text-slate-400">Email</span><input className={inputCls} type="email" required value={form.email} onChange={(e)=>setForm((f)=>({...f,email:e.target.value}))}/></label>
      {form.invite_type==='vendor' && <><label><span className="mb-1 block text-xs text-slate-400">Professional specialty</span><input className={inputCls} placeholder="Broker, contractor, bookkeeper…" value={form.vendor_category} onChange={(e)=>setForm((f)=>({...f,vendor_category:e.target.value}))}/></label><label><span className="mb-1 block text-xs text-slate-400">Company</span><input className={inputCls} value={form.company_name} onChange={(e)=>setForm((f)=>({...f,company_name:e.target.value}))}/></label></>}
      {form.invite_type==='staff' && canInviteStaff && <label><span className="mb-1 block text-xs text-slate-400">Role template</span><select className={inputCls} required value={form.role_definition_id} onChange={(e)=>setForm((f)=>({...f,role_definition_id:e.target.value}))}><option value="">Choose role</option>{roles.map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
    </div><div className="rounded-lg border border-white/10 bg-white/[.02] p-4"><p className="text-xs font-semibold uppercase tracking-[.14em] text-gold">What they’ll receive</p><p className="mt-2 text-sm font-medium text-white">A personalized Pinnacle invitation</p><p className="mt-2 text-xs leading-5 text-slate-400">The email explains why they are being invited, what experience they are entering, and that the link is private and expires in 24 hours. Provider invitations explain the vetted-network/assignment model; client invitations focus on beginning their Pinnacle journey.</p></div></div>
      {form.lead_id && <p className="text-xs text-slate-500">Connected CRM lead: {form.lead_id}</p>}
      <div className="flex gap-3"><button className={btnPrimary} disabled={busy}>{busy?'Sending…':'Send invitation'}</button><button type="button" className={btnOutline} onClick={()=>setShowForm(false)}>Cancel</button></div>
    </form></Panel>}

    <div className="mb-4 flex flex-wrap gap-2">{['all','pending','accepted','expired','vendor'].map((f)=><button key={f} className={`rounded-full border px-3 py-1.5 text-xs capitalize ${filter===f?'border-gold/40 bg-gold/10 text-gold':'border-white/10 text-slate-400 hover:text-white'}`} onClick={()=>setFilter(f)}>{f}</button>)}</div>
    <Panel className="!p-0 overflow-x-auto">{loading?<p className="p-6 text-sm text-slate-400">Loading…</p>:visible.length===0?<div className="p-6"><EmptyState label="No invitations match this view."/></div>:<table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3 font-medium">Person</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Expires</th><th className="px-5 py-3 font-medium">Role / context</th><th className="px-5 py-3 font-medium">Actions</th></tr></thead><tbody>{visible.map((r)=><tr key={r.id} className="border-b border-white/5 last:border-0"><td className="px-5 py-3"><p className="font-medium text-white">{r.full_name||r.email}</p><p className="text-xs text-slate-500">{r.email}</p></td><td className="px-5 py-3 capitalize text-slate-300">{r.invite_type.replace(/_/g,' ')}</td><td className="px-5 py-3"><Tag tone={tone(r.status)}>{r.status}</Tag></td><td className="px-5 py-3 text-slate-400">{new Date(r.expires_at).toLocaleString()}</td><td className="px-5 py-3 text-slate-400">{r.role_name||r.client_name||'—'}</td><td className="px-5 py-3"><div className="flex gap-2">{r.status!=='accepted'&&<button className="text-xs font-medium text-gold hover:underline" onClick={()=>action(r.id,'resend')}>Resend</button>}{r.status==='pending'&&<button className="text-xs font-medium text-rose-300 hover:underline" onClick={()=>action(r.id,'revoke')}>Revoke</button>}</div></td></tr>)}</tbody></table>}</Panel>
  </div>
}
