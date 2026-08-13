import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, inputCls, btnPrimary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useCapabilities } from '../../lib/capabilities'
import { RoleTemplatesPanel, type Permission, type RoleDef } from './settings/RoleTemplatesPanel'

interface Employee { id: string; email: string; full_name: string | null; status: string; party_type: string | null; title: string | null; staff_role: string | null }

const starterDescriptions = [
  ['Operations Coordinator', 'Cases, assignments, documents, communications, network, reporting.'],
  ['Client Relationship Manager', 'Intake, follow-up, communications, documents.'],
  ['Document & E-Sign Specialist', 'Documents, signatures, invitations, communications.'],
  ['Field Dispatch Coordinator', 'Providers, field assignments, completion records.'],
  ['Professional Provider', 'Assigned work and supporting documents only.'],
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
  const [showStarters, setShowStarters] = useState(false)

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
    <PageIntro kicker="Security & access" title="Roles & Permissions" subtitle="Assign a starter or custom role, then edit grants. Per-user overrides live in Settings." />

    <Panel className="mb-4 !p-3">
      <form onSubmit={assign} className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex-1"><span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Person</span><select className={inputCls} required value={assignUser} onChange={(e)=>setAssignUser(e.target.value)}><option value="">Choose…</option>{networkProfessionals.filter((person)=>person.status!=='suspended').map((person)=><option key={person.id} value={person.id}>{person.full_name||person.email} · {person.party_type==='vendor'?'Provider':'Internal'}</option>)}</select></label>
        <label className="flex-1"><span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-500">Role</span><select className={inputCls} value={assignRole} onChange={(e)=>setAssignRole(e.target.value)}><option value="">No custom role</option>{activeRoles.map((role)=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
        <button className={btnPrimary} disabled={busy || !assignUser}>{busy?'Saving…':'Assign'}</button>
      </form>
    </Panel>

    <details className="mb-4 rounded-lg border border-white/[.08] bg-white/[.015] px-4 py-3" open={showStarters} onToggle={(e)=>setShowStarters((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-semibold text-white">Starter roles <span className="ml-2 text-xs font-normal text-slate-500">6 templates · Owner is never included</span></summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{starterDescriptions.map(([name, description])=><div key={name} className="rounded-md border border-white/[.06] px-3 py-2"><p className="text-xs font-semibold text-white">{name}</p><p className="mt-0.5 text-[11px] leading-4 text-slate-500">{description}</p></div>)}</div>
    </details>

    <RoleTemplatesPanel permissions={permissions} roles={roles} canMutate={caps.is_owner} onChanged={load} />
  </div>
}
