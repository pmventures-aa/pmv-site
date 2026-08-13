import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, inputCls, btnPrimary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useCapabilities } from '../../lib/capabilities'
import { RoleTemplatesPanel, type Permission, type RoleDef } from './settings/RoleTemplatesPanel'

interface Employee { id: string; email: string; full_name: string | null; status: string; party_type: string | null; title: string | null; staff_role: string | null }

const starterDescriptions = [
  ['Operations Coordinator', 'Cases, assignments, documents, communications, network coordination, and reporting.'],
  ['Client Relationship Manager', 'Intake, follow-up, communications, documents, and relationship continuity.'],
  ['Document & E-Sign Specialist', 'Document preparation, signature transactions, invitations, and related communications.'],
  ['Field Dispatch Coordinator', 'Provider coordination, field assignments, case updates, and completion records.'],
  ['Professional Provider', 'Restricted access for assigned work and supporting documents.'],
  ['Reporting & Audit Reviewer', 'Read-oriented reporting and audit access.'],
] as const

export default function RolesPermissionsAdmin() {
  const caps = useCapabilities()
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [networkProfessionals, setNetworkProfessionals] = useState<Employee[]>([])
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
      setPermissions(p.permissions); setRoles(r.roles); setNetworkProfessionals(e.employees)
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not load roles and permissions.') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function assign(e: React.FormEvent) {
    e.preventDefault(); if (!assignUser) return; setBusy(true)
    try {
      await api.patch(`/admin/users/${assignUser}/role-definition`, { role_definition_id: assignRole || null, reset_overrides: true })
      toast.success(assignRole ? 'Role assigned. Per-user overrides were reset to the role defaults.' : 'Role assignment removed.')
      setAssignUser(''); setAssignRole(''); await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not assign role.') }
    finally { setBusy(false) }
  }

  const activeRoles = roles.filter((role) => !role.is_archived)

  return <div>
    <PageIntro kicker="Security & access" title="Roles & Permissions" subtitle="Create reusable coding roles, rename them, set default grants, and assign them without hard-coding new account types. Fine-grained per-user overrides live in Settings." />

    <Panel className="mb-6">
      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold/80">Pinnacle Starter Roles</p>
      <h2 className="mt-2 text-lg font-extrabold text-white">Start With the Job Someone Actually Performs</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">These editable role templates cover Pinnacle's common operating functions. Assign the closest fit, then adjust only the permissions that role truly needs. Owner authority is never part of a template.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{starterDescriptions.map(([name, description])=><div key={name} className="rounded-xl border border-white/[.08] bg-white/[.02] p-3"><p className="text-sm font-bold text-white">{name}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>)}</div>
    </Panel>

    <Panel className="mb-6">
      <h2 className="text-base font-semibold text-white">Assign a role</h2>
      <p className="mt-1 text-sm text-slate-400">Role templates grant operational permissions. Owner authority remains separate and cannot be delegated from this screen.</p>
      <form onSubmit={assign} className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex-1"><span className="mb-1 block text-xs text-slate-400">Network professional</span><select className={inputCls} required value={assignUser} onChange={(e)=>setAssignUser(e.target.value)}><option value="">Choose an internal user or provider…</option>{networkProfessionals.filter((person)=>person.status!=='suspended').map((person)=><option key={person.id} value={person.id}>{person.full_name||person.email} · {person.party_type==='vendor'?'Provider':'Internal'}</option>)}</select></label>
        <label className="flex-1"><span className="mb-1 block text-xs text-slate-400">Role</span><select className={inputCls} value={assignRole} onChange={(e)=>setAssignRole(e.target.value)}><option value="">No custom role</option>{activeRoles.map((role)=><option key={role.id} value={role.id}>{role.name} ({role.role_key})</option>)}</select></label>
        <button className={btnPrimary} disabled={busy || !assignUser}>{busy?'Saving…':'Assign role'}</button>
      </form>
    </Panel>

    <RoleTemplatesPanel permissions={permissions} roles={roles} canMutate={caps.is_owner} onChanged={load} />
  </div>
}
