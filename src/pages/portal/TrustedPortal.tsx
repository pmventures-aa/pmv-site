import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Logo } from '../../components/ui'
import { Icon, type IconName } from '../../components/kit/Icon'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'

interface Relationship {
  relationship_id: string
  client_user_id: string
  client_name: string
  client_business_name: string | null
  relationship_label: string | null
  permissions: Record<string, 'none' | 'view' | 'edit'>
}
interface SectionData { mode: 'view' | 'edit'; rows?: any[]; account?: any; profile?: any }

const sectionMeta: Record<string, { label: string; icon: IconName }> = {
  business_profile: { label: 'Business Profile', icon: 'building' }, services: { label: 'Services', icon: 'services' },
  documents: { label: 'Documents', icon: 'file' }, billing: { label: 'Billing', icon: 'billing' }, tasks: { label: 'Tasks', icon: 'check' },
  calendar: { label: 'Calendar', icon: 'calendar' }, messages: { label: 'Messages', icon: 'mail' }, support: { label: 'Support', icon: 'support' },
}

function money(cents: number) { return `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }

export default function TrustedPortal() {
  const { user, logout } = useAuth()
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [clientId, setClientId] = useState('')
  const [section, setSection] = useState('')
  const [data, setData] = useState<SectionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ relationships: Relationship[] }>('/portal/trusted/context').then((r) => {
      setRelationships(r.relationships)
      if (r.relationships[0]) setClientId(r.relationships[0].client_user_id)
    }).catch(() => toast.error('Could not load delegated access.')).finally(() => setLoading(false))
  }, [])

  const relationship = useMemo(() => relationships.find((r) => r.client_user_id === clientId) || null, [relationships, clientId])
  const allowed = useMemo(() => relationship ? Object.entries(relationship.permissions).filter(([, mode]) => mode !== 'none') : [], [relationship])

  useEffect(() => {
    if (!relationship) return
    if (!section || relationship.permissions[section] === 'none') setSection(allowed[0]?.[0] || '')
  }, [relationship, allowed, section])

  useEffect(() => {
    if (!clientId || !section) { setData(null); return }
    setData(null)
    api.get<SectionData>(`/portal/trusted/${clientId}/${section}`).then(setData).catch(() => toast.error('That section is not available.'))
  }, [clientId, section])

  if (loading) return <div className="grid min-h-screen place-items-center bg-navy-950 text-sm text-slate-400">Loading Trusted Contact access…</div>

  return (
    <div className="min-h-screen bg-navy-950 text-slate-200">
      <header className="border-b border-white/10 bg-navy-950/90 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-4"><Logo /><span className="hidden rounded-full border border-gold/20 bg-gold/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold sm:inline">Trusted Contact</span></div>
          <div className="flex items-center gap-3 text-sm"><span className="hidden text-slate-400 sm:inline">{user?.full_name || user?.email}</span><button onClick={() => logout()} className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:border-gold/30 hover:text-gold">Sign out</button></div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="eyebrow">Delegated access</p><h1 className="mt-2 font-display text-3xl font-medium text-white">{relationship?.client_business_name || relationship?.client_name || 'Trusted Contact Portal'}</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">You are viewing only the account sections this client has chosen to share with you. Edit controls appear only where the client granted edit access.</p></div>
          {relationships.length > 1 && <label className="min-w-64"><span className="mb-1 block text-xs text-slate-500">Client relationship</span><select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>{relationships.map((r) => <option key={r.relationship_id} value={r.client_user_id}>{r.client_business_name || r.client_name}</option>)}</select></label>}
        </div>

        {!relationship ? <div className="mt-8 rounded-xl border border-white/10 p-6 text-sm text-slate-400">You do not currently have active Trusted Contact access.</div> : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside className="space-y-2">{allowed.map(([key, mode]) => { const meta = sectionMeta[key] || { label: key, icon: 'file' as IconName }; return <button key={key} onClick={() => setSection(key)} className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${section === key ? 'border-gold/40 bg-gold/[0.08] text-white' : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white'}`}><Icon name={meta.icon} size={17}/><span className="flex-1 text-sm font-medium">{meta.label}</span><span className="text-[10px] uppercase tracking-wide text-gold">{mode}</span></button> })}</aside>
            <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
              {section && <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">Shared by client</p><h2 className="mt-1 text-xl font-semibold text-white">{sectionMeta[section]?.label || section}</h2></div>{data?.mode && <span className="rounded-full border border-gold/20 px-2.5 py-1 text-xs text-gold">{data.mode} access</span>}</div>}
              {!data ? <p className="text-sm text-slate-500">Loading…</p> : <SectionView section={section} clientId={clientId} data={data} onRefresh={() => api.get<SectionData>(`/portal/trusted/${clientId}/${section}`).then(setData)} />}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

function SectionView({ section, clientId, data, onRefresh }: { section: string; clientId: string; data: SectionData; onRefresh: () => Promise<void> | void }) {
  const [profile, setProfile] = useState<any>({ ...(data.profile || {}), phone: data.account?.phone || '' })
  if (section === 'business_profile') return <div className="grid gap-4 sm:grid-cols-2">{[['business_name','Business name'],['entity_type','Entity type'],['ein','EIN'],['state','State'],['phone','Phone']].map(([key,label]) => <label key={key}><span className="mb-1 block text-xs text-slate-500">{label}</span><input className={inputCls} readOnly={data.mode !== 'edit'} value={profile[key] || ''} onChange={(e) => setProfile((p:any)=>({...p,[key]:e.target.value}))}/></label>)}{data.mode === 'edit' && <div className="sm:col-span-2"><button className="btn-gold" onClick={async()=>{await api.patch(`/portal/trusted/${clientId}/business_profile`,profile); toast.success('Business Profile updated.'); await onRefresh()}}>Save changes</button></div>}</div>
  const rows = data.rows || []
  if (rows.length === 0) return <p className="text-sm text-slate-500">Nothing has been shared in this section yet.</p>
  if (section === 'billing') return <div className="space-y-3">{rows.map((r:any)=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div><p className="font-medium text-white">{r.title || r.invoice_number || 'Invoice'}</p><p className="text-xs text-slate-500">{r.due_date ? `Due ${new Date(`${r.due_date}T12:00:00`).toLocaleDateString()}` : 'No due date'} · {r.status}</p></div><strong className="text-gold">{money(r.amount_cents)}</strong></div>)}</div>
  if (section === 'tasks') return <div className="space-y-3">{rows.map((r:any)=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"><div><p className="font-medium text-white">{r.title}</p><p className="text-xs text-slate-500">{r.due_date ? `Due ${new Date(r.due_date).toLocaleDateString()}` : 'No due date'}</p></div>{data.mode === 'edit' ? <select className={`${inputCls} !w-auto`} value={r.status} onChange={async(e)=>{await api.patch(`/portal/trusted/${clientId}/tasks/${r.id}`,{status:e.target.value}); await onRefresh()}}><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="done">Done</option></select> : <span className="text-xs text-gold">{r.status}</span>}</div>)}</div>
  return <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">{Object.keys(rows[0]).filter((k)=>!['id','sender_user_id','client_user_id'].includes(k)).slice(0,5).map((k)=><th key={k} className="px-3 py-2 font-medium">{k.replace(/_/g,' ')}</th>)}</tr></thead><tbody>{rows.map((r:any)=><tr key={r.id} className="border-b border-white/5">{Object.keys(rows[0]).filter((k)=>!['id','sender_user_id','client_user_id'].includes(k)).slice(0,5).map((k)=><td key={k} className="max-w-xs truncate px-3 py-3 text-slate-300">{r[k] == null ? '—' : String(r[k])}</td>)}</tr>)}</tbody></table></div>
}
