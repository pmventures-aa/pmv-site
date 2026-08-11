import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, inputCls, btnPrimary, btnOutline, Tag } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'

interface Permission { permission_key: string; label: string; description: string; category: string }
interface RoleDef { id: string; role_key: string; name: string; description: string | null; party_type: string; is_system: number; assigned_users: number; permissions: string[] }
interface Employee { id: string; email: string; full_name: string | null; status: string; party_type: string | null; title: string | null; staff_role: string | null }

const emptyRole = { name: '', description: '', party_type: 'employee', permissions: [] as string[] }

export default function RolesPermissionsAdmin() {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [editing, setEditing] = useState<RoleDef | null>(null)
  const [form, setForm] = useState(emptyRole)
  const [showForm, setShowForm] = useState(false)
  const [assignUser, setAssignUser] = useState('')
  const [assignRole, setAssignRole] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, r, e] = await Promise.all([
        api.get<{ permissions: Permission[] }>('/admin/permissions'),
        api.get<{ roles: RoleDef[] }>('/admin/roles'),
        api.get<{ employees: Employee[] }>('/admin/employees'),
      ])
      setPermissions(p.permissions); setRoles(r.roles); setEmployees(e.employees)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not load roles and permissions.') }
  }, [])
  useEffect(() => { load() }, [load])

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of permissions) { if (!map.has(p.category)) map.set(p.category, []); map.get(p.category)!.push(p) }
    return [...map.entries()]
  }, [permissions])

  function startNew() { setEditing(null); setForm(emptyRole); setShowForm(true) }
  function startEdit(role: RoleDef) { setEditing(role); setForm({ name: role.name, description: role.description || '', party_type: role.party_type, permissions: [...role.permissions] }); setShowForm(true) }
  function togglePermission(key: string) { setForm((f) => ({ ...f, permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key] })) }

  async function saveRole(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      if (editing) await api.patch(`/admin/roles/${editing.id}`, form)
      else await api.post('/admin/roles', form)
      toast.success(editing ? 'Role updated.' : 'Role created.')
      setShowForm(false); setEditing(null); setForm(emptyRole); await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not save role.') }
    finally { setBusy(false) }
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault(); if (!assignUser) return; setBusy(true)
    try {
      await api.patch(`/admin/users/${assignUser}/role-definition`, { role_definition_id: assignRole || null })
      toast.success(assignRole ? 'Role assigned.' : 'Role assignment removed.')
      setAssignUser(''); setAssignRole(''); await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not assign role.') }
    finally { setBusy(false) }
  }

  return <div>
    <PageIntro kicker="Security & access" title="Roles & Permissions" subtitle="Create reusable staff roles, understand exactly what each permission allows, and assign roles without hard-coding new account types." action={<button className={btnPrimary} onClick={startNew}>+ Create role</button>} />

    <Panel className="mb-6">
      <h2 className="text-base font-semibold text-white">Assign a role</h2>
      <p className="mt-1 text-sm text-slate-400">Role templates grant permissions. Owner authority remains separate and cannot be delegated from this screen.</p>
      <form onSubmit={assign} className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex-1"><span className="mb-1 block text-xs text-slate-400">Network contact</span><select className={inputCls} required value={assignUser} onChange={(e)=>setAssignUser(e.target.value)}><option value="">Choose an internal user or provider…</option>{employees.filter((e)=>e.status!=='suspended').map((e)=><option key={e.id} value={e.id}>{e.full_name||e.email} · {e.party_type==='vendor'?'Provider':'Internal'}</option>)}</select></label>
        <label className="flex-1"><span className="mb-1 block text-xs text-slate-400">Role</span><select className={inputCls} value={assignRole} onChange={(e)=>setAssignRole(e.target.value)}><option value="">No custom role</option>{roles.map((r)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <button className={btnPrimary} disabled={busy || !assignUser}>{busy?'Saving…':'Assign role'}</button>
      </form>
    </Panel>

    {showForm && <Panel className="mb-6 !border-gold/20"><form onSubmit={saveRole}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">{editing?'Edit role':'New role'}</p><h2 className="mt-1 text-lg font-semibold text-white">{editing?.name || 'Define exactly what this role can do'}</h2></div><button type="button" className="text-sm text-slate-400 hover:text-white" onClick={()=>setShowForm(false)}>Close</button></div>
      <div className="mt-5 grid gap-4 md:grid-cols-3"><label><span className="mb-1 block text-xs text-slate-400">Role name</span><input className={inputCls} required placeholder="Support Admin" value={form.name} onChange={(e)=>setForm((f)=>({...f,name:e.target.value}))}/></label><label><span className="mb-1 block text-xs text-slate-400">Applies to</span><select className={inputCls} value={form.party_type} onChange={(e)=>setForm((f)=>({...f,party_type:e.target.value}))}><option value="employee">Internal team</option><option value="vendor">Professional providers</option><option value="either">Internal or provider</option></select></label><label className="md:col-span-3"><span className="mb-1 block text-xs text-slate-400">Description</span><input className={inputCls} placeholder="What is this role responsible for?" value={form.description} onChange={(e)=>setForm((f)=>({...f,description:e.target.value}))}/></label></div>
      <div className="mt-6 space-y-5">{grouped.map(([category, items])=><div key={category}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{category}</h3><div className="grid gap-2 lg:grid-cols-2">{items.map((p)=><label key={p.permission_key} className={`cursor-pointer rounded-xl border p-4 transition ${form.permissions.includes(p.permission_key)?'border-gold/30 bg-gold/[0.06]':'border-white/10 bg-white/[0.02] hover:border-white/20'}`}><div className="flex gap-3"><input type="checkbox" className="mt-1" checked={form.permissions.includes(p.permission_key)} onChange={()=>togglePermission(p.permission_key)}/><div><p className="text-sm font-medium text-white">{p.label}</p><p className="mt-1 text-xs leading-5 text-slate-400">{p.description}</p></div></div></label>)}</div></div>)}</div>
      <div className="mt-6 flex gap-3"><button className={btnPrimary} disabled={busy}>{busy?'Saving…':editing?'Save role':'Create role'}</button><button type="button" className={btnOutline} onClick={()=>setShowForm(false)}>Cancel</button></div>
    </form></Panel>}

    <div className="grid gap-4 xl:grid-cols-2">{roles.length===0?<Panel><EmptyState label="No custom roles yet."/></Panel>:roles.map((r)=><Panel key={r.id}>
      <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-white">{r.name}</h2>{r.is_system?<Tag tone="gold">Starter template</Tag>:null}</div><p className="mt-1 text-sm text-slate-400">{r.description||'No description yet.'}</p><p className="mt-2 text-xs text-slate-500">Applies to: {r.party_type} · {r.assigned_users} assigned</p></div><button className="text-sm font-medium text-gold hover:underline" onClick={()=>startEdit(r)}>Edit</button></div>
      <div className="mt-4 flex flex-wrap gap-2">{r.permissions.length===0?<span className="text-xs text-slate-500">No elevated permissions.</span>:r.permissions.map((key)=>{const p=permissions.find((x)=>x.permission_key===key); return <span key={key} title={p?.description} className="rounded-full border border-white/10 bg-white/[0.025] px-2.5 py-1 text-[11px] text-slate-300">{p?.label||key}</span>})}</div>
    </Panel>)}</div>
  </div>
}
