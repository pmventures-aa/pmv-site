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

export default function InvitationsAdmin() {
  const [params] = useSearchParams()
  const prefill = useMemo(() => ({
    ...blank,
    invite_type: params.get('type') || 'vendor',
    full_name: params.get('name') || '',
    email: params.get('email') || '',
    lead_id: params.get('lead') || '',
  }), [params])
  const [rows, setRows] = useState<Invite[]>([])
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(() => !!(prefill.email || prefill.full_name))
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(prefill)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [invites, roleData] = await Promise.all([
        api.get<{ invitations: Invite[] }>('/admin/invitations'),
        api.get<{ roles: RoleDef[] }>('/admin/roles'),
      ])
      setRows(invites.invitations); setRoles(roleData.roles)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not load invitations.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const result = await api.post<{ email_status: string; email_error?: string }>('/admin/invitations', form)
      if (result.email_status === 'sent') toast.success(`Invitation sent to ${form.email}.`)
      else toast.error(`Invitation created, but the email was not sent. ${result.email_error || ''}`)
      setShowForm(false); setForm(blank); await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not create invitation.') }
    finally { setBusy(false) }
  }

  async function action(id: string, kind: 'resend' | 'revoke') {
    try {
      await api.post(`/admin/invitations/${id}/${kind}`, {})
      toast.success(kind === 'resend' ? 'A fresh 24-hour invitation was sent.' : 'Invitation revoked.')
      await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : `Could not ${kind} invitation.`) }
  }

  const visible = rows.filter((r) => filter === 'all' || r.status === filter || (filter === 'vendor' && r.invite_type === 'vendor'))
  const counts = { pending: rows.filter((r) => r.status === 'pending').length, accepted: rows.filter((r) => r.status === 'accepted').length, expired: rows.filter((r) => r.status === 'expired').length }

  return <div>
    <PageIntro kicker="Access onboarding" title="Invitation Center" subtitle="Send, track, resend, and revoke private onboarding invitations. Every new link expires after 24 hours." action={<button className={btnPrimary} onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : '+ New invitation'}</button>} />
    <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-lg">
      {([['Pending', counts.pending], ['Accepted', counts.accepted], ['Expired', counts.expired]] as const).map(([label, value]) => <Panel key={label} className="!p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-white">{value}</p></Panel>)}
    </div>

    {showForm && <Panel className="mb-6 !border-gold/20"><form onSubmit={send} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label><span className="mb-1 block text-xs text-slate-400">Invite type</span><select className={inputCls} value={form.invite_type} onChange={(e)=>setForm((f)=>({...f,invite_type:e.target.value,role_definition_id:''}))}><option value="vendor">Professional vendor/provider</option><option value="client">Prospective client</option><option value="staff">Employee / staff</option></select></label>
        <label><span className="mb-1 block text-xs text-slate-400">Full name</span><input className={inputCls} value={form.full_name} onChange={(e)=>setForm((f)=>({...f,full_name:e.target.value}))}/></label>
        <label><span className="mb-1 block text-xs text-slate-400">Email</span><input className={inputCls} type="email" required value={form.email} onChange={(e)=>setForm((f)=>({...f,email:e.target.value}))}/></label>
        {form.invite_type==='vendor' && <><label><span className="mb-1 block text-xs text-slate-400">Professional specialty</span><input className={inputCls} placeholder="Attorney, contractor, bookkeeper…" value={form.vendor_category} onChange={(e)=>setForm((f)=>({...f,vendor_category:e.target.value}))}/></label><label><span className="mb-1 block text-xs text-slate-400">Company</span><input className={inputCls} value={form.company_name} onChange={(e)=>setForm((f)=>({...f,company_name:e.target.value}))}/></label></>}
        {form.invite_type==='staff' && <label><span className="mb-1 block text-xs text-slate-400">Role template</span><select className={inputCls} required value={form.role_definition_id} onChange={(e)=>setForm((f)=>({...f,role_definition_id:e.target.value}))}><option value="">Choose role</option>{roles.filter((r)=>r.party_type!=='vendor').map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
      </div>
      {form.lead_id && <p className="text-xs text-slate-500">Connected CRM lead: {form.lead_id}</p>}
      <div className="flex gap-3"><button className={btnPrimary} disabled={busy}>{busy?'Sending…':'Send invitation'}</button><button type="button" className={btnOutline} onClick={()=>setShowForm(false)}>Cancel</button></div>
    </form></Panel>}

    <div className="mb-4 flex flex-wrap gap-2">{['all','pending','accepted','expired','vendor'].map((f)=><button key={f} className={`rounded-full border px-3 py-1.5 text-xs capitalize ${filter===f?'border-gold/40 bg-gold/10 text-gold':'border-white/10 text-slate-400 hover:text-white'}`} onClick={()=>setFilter(f)}>{f}</button>)}</div>
    <Panel className="!p-0 overflow-x-auto">{loading?<p className="p-6 text-sm text-slate-400">Loading…</p>:visible.length===0?<div className="p-6"><EmptyState label="No invitations match this view."/></div>:<table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3 font-medium">Person</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Expires</th><th className="px-5 py-3 font-medium">Role / context</th><th className="px-5 py-3 font-medium">Actions</th></tr></thead><tbody>{visible.map((r)=><tr key={r.id} className="border-b border-white/5 last:border-0"><td className="px-5 py-3"><p className="font-medium text-white">{r.full_name||r.email}</p><p className="text-xs text-slate-500">{r.email}</p></td><td className="px-5 py-3 capitalize text-slate-300">{r.invite_type.replace(/_/g,' ')}</td><td className="px-5 py-3"><Tag tone={tone(r.status)}>{r.status}</Tag></td><td className="px-5 py-3 text-slate-400">{new Date(r.expires_at).toLocaleString()}</td><td className="px-5 py-3 text-slate-400">{r.role_name||r.client_name||'—'}</td><td className="px-5 py-3"><div className="flex gap-2">{r.status!=='accepted'&&<button className="text-xs font-medium text-gold hover:underline" onClick={()=>action(r.id,'resend')}>Resend</button>}{r.status==='pending'&&<button className="text-xs font-medium text-rose-300 hover:underline" onClick={()=>action(r.id,'revoke')}>Revoke</button>}</div></td></tr>)}</tbody></table>}</Panel>
  </div>
}
