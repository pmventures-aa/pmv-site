import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../../lib/api'
import { Panel, Tag, NoAccess, inputCls, btnOutline, btnPrimary } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'
import { useAuth } from '../../../lib/auth'
import { useCapabilities } from '../../../lib/capabilities'
import { RoleTemplatesPanel, groupPermissions, type Permission, type RoleDef } from './RoleTemplatesPanel'
import { Avatar } from '../../../components/kit/Avatar'

type OverrideMode = 'inherit' | 'allow' | 'deny'

interface AccessUser {
  id: string
  email: string
  role: string
  full_name: string | null
  status: string
  staff_role: string | null
  title: string | null
  can_reveal_payment_info: number | null
  can_manage_users: number | null
  can_manage_settings: number | null
  can_view_reports: number | null
  can_view_audit_log: number | null
  can_manage_communications: number | null
  is_owner: number | null
  party_type: string | null
  vendor_category: string | null
  role_definition_id: string | null
  role_name: string | null
  role_code: string | null
  permission_overrides: Record<string, number>
  effective_permissions: Record<string, boolean>
  permission_sources: Record<string, string>
}

interface DraftUser extends AccessUser {
  modes: Record<string, OverrideMode>
}

function modeFromOverride(value: number | undefined): OverrideMode {
  if (value === 1) return 'allow'
  if (value === 0) return 'deny'
  return 'inherit'
}

function toDraft(user: AccessUser, catalog: Permission[]): DraftUser {
  const modes: Record<string, OverrideMode> = {}
  for (const item of catalog) modes[item.permission_key] = modeFromOverride(user.permission_overrides?.[item.permission_key])
  return { ...user, modes }
}

function effectiveFor(user: DraftUser, key: string, rolePerms: Set<string>) {
  if (user.role === 'admin') return true
  const mode = user.modes[key] || 'inherit'
  if (mode === 'allow') return true
  if (mode === 'deny') return false
  return rolePerms.has(key)
}

export default function StaffSettings() {
  const { user: me } = useAuth()
  const caps = useCapabilities()
  const isAdmin = me?.role === 'admin'
  const canMutateRoles = caps.is_owner
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [roles, setRoles] = useState<RoleDef[]>([])
  const [users, setUsers] = useState<DraftUser[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ permissions: Permission[]; roles: RoleDef[]; users: AccessUser[] }>('/admin/access-control')
      setPermissions(res.permissions)
      setRoles(res.roles)
      setUsers(res.users.map((user) => toDraft(user, res.permissions)))
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true)
      else toast.error(err instanceof ApiError ? err.message : 'Could not load access control.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const grouped = useMemo(() => groupPermissions(permissions), [permissions])
  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles])
  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return users
    return users.filter((user) => `${user.full_name || ''} ${user.email} ${user.role_name || ''} ${user.staff_role || ''} ${user.title || ''}`.toLowerCase().includes(needle))
  }, [query, users])

  function updateUser(id: string, patch: Partial<DraftUser> | ((current: DraftUser) => DraftUser)) {
    setUsers((list) => list.map((user) => {
      if (user.id !== id) return user
      return typeof patch === 'function' ? patch(user) : { ...user, ...patch }
    }))
  }

  function assignRole(user: DraftUser, roleId: string) {
    const role = roleById.get(roleId)
    const modes: Record<string, OverrideMode> = {}
    for (const item of permissions) modes[item.permission_key] = 'inherit'
    updateUser(user.id, {
      role_definition_id: roleId || null,
      role_name: role?.name || null,
      role_code: role?.role_key || null,
      staff_role: role?.role_key || user.staff_role,
      modes,
    })
  }

  async function save(user: DraftUser) {
    if (!isAdmin) return
    setSavingId(user.id)
    try {
      const permission_overrides: Record<string, boolean | null> = {}
      for (const item of permissions) {
        const mode = user.modes[item.permission_key] || 'inherit'
        permission_overrides[item.permission_key] = mode === 'inherit' ? null : mode === 'allow'
      }
      await api.patch(`/admin/users/${user.id}/staff-profile`, {
        staff_role: user.staff_role || 'representative',
        title: user.title,
        party_type: user.party_type === 'vendor' ? 'vendor' : 'employee',
        vendor_category: user.vendor_category,
        status: user.status === 'suspended' ? 'suspended' : 'active',
        account_role: user.role === 'admin' ? 'admin' : 'staff',
        is_owner: !!user.is_owner,
        role_definition_id: user.role_definition_id,
        permission_overrides,
      })
      toast.success(`Updated ${user.full_name || user.email}.`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update this user.')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading access control…</p>
  if (forbidden) return <NoAccess label="Staff &amp; Permissions" />

  return (
    <div className="space-y-8">
      <RoleTemplatesPanel permissions={permissions} roles={roles} canMutate={canMutateRoles} onChanged={load} />

      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Per-user access</h3>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">Assign a role for defaults, then allow or deny any permission for that person. Admins already have every operational grant; Owner remains a separate flag.</p>
          </div>
          <label className="w-full max-w-xs">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Find a user</span>
            <input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email, or role" />
          </label>
        </div>

        {isAdmin && users.length > 0 && (
          <Panel className="mb-5 overflow-x-auto !p-0">
            <h3 className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">Effective grants</h3>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2 font-medium">Name</th>
                  <th className="px-5 py-2 font-medium">Role</th>
                  {permissions.map((item) => <th key={item.permission_key} className="px-3 py-2 font-medium" title={item.label}>{item.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const rolePerms = new Set(roleById.get(user.role_definition_id || '')?.permissions || [])
                  return (
                    <tr key={user.id} className="border-t border-white/5">
                      <td className="px-5 py-2 text-slate-200">{user.full_name || user.email}</td>
                      <td className="px-5 py-2"><Tag tone={user.role === 'admin' ? 'gold' : 'slate'}>{user.role_name || user.staff_role || user.role}</Tag></td>
                      {permissions.map((item) => (
                        <td key={item.permission_key} className="px-3 py-2">{effectiveFor(user, item.permission_key, rolePerms) ? 'Yes' : 'No'}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>
        )}

        <div className="space-y-3">
          {visibleUsers.map((user) => {
            const rolePerms = new Set(roleById.get(user.role_definition_id || '')?.permissions || [])
            const open = openId === user.id
            const assignableRoles = roles.filter((role) => !role.is_archived && (role.party_type === 'either' || role.party_type === (user.party_type === 'vendor' ? 'vendor' : 'employee')))
            return (
              <Panel key={user.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar userId={user.id} name={user.full_name || user.email} size={40} editable={isAdmin} uploadPath={`/admin/users/${user.id}/avatar`} />
                    <button type="button" className="min-w-0 text-left" onClick={() => setOpenId(open ? null : user.id)}>
                    <p className="font-medium text-white">{user.full_name || user.email}</p>
                    <p className="text-xs text-slate-500">
                      {user.email} · <Tag tone={user.role === 'admin' ? 'gold' : 'slate'}>{user.role}</Tag>{' '}
                      {user.role_name && <Tag tone="blue">{user.role_name}</Tag>}{' '}
                      {user.party_type === 'vendor' && <Tag tone="blue">vendor</Tag>}{' '}
                      {user.status === 'pending' && <Tag tone="gold">pending</Tag>}
                      {user.status === 'suspended' && <Tag tone="red">suspended</Tag>}
                      {user.is_owner ? <Tag tone="gold">owner</Tag> : null}
                    </p>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={`${btnOutline} text-xs`} onClick={() => setOpenId(open ? null : user.id)}>{open ? 'Collapse' : 'Control access'}</button>
                    {isAdmin && <button type="button" onClick={() => save(user)} className={`${btnPrimary} text-xs`} disabled={savingId === user.id}>{savingId === user.id ? 'Saving…' : 'Save'}</button>}
                  </div>
                </div>

                {open && (
                  <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label>
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Account type</span>
                        <select className={inputCls} disabled={!isAdmin} value={user.role === 'admin' ? 'admin' : 'staff'} onChange={(e) => updateUser(user.id, { role: e.target.value, is_owner: e.target.value === 'admin' ? user.is_owner : 0 })}>
                          <option value="staff">Staff</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                      <label>
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Account status</span>
                        <select className={inputCls} disabled={!isAdmin} value={user.status === 'suspended' ? 'suspended' : 'active'} onChange={(e) => updateUser(user.id, { status: e.target.value })}>
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </label>
                      <label>
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Type</span>
                        <select className={inputCls} disabled={!isAdmin} value={user.party_type === 'vendor' ? 'vendor' : 'employee'} onChange={(e) => updateUser(user.id, { party_type: e.target.value, vendor_category: e.target.value === 'vendor' ? user.vendor_category : null })}>
                          <option value="employee">Employee</option>
                          <option value="vendor">Vendor / provider</option>
                        </select>
                      </label>
                      <label>
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Vendor category</span>
                        <input className={inputCls} disabled={!isAdmin || user.party_type !== 'vendor'} placeholder="What they provide" value={user.vendor_category ?? ''} onChange={(e) => updateUser(user.id, { vendor_category: e.target.value })} />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Coding role</span>
                        <select className={inputCls} disabled={!isAdmin} value={user.role_definition_id || ''} onChange={(e) => assignRole(user, e.target.value)}>
                          <option value="">No template (manual only)</option>
                          {assignableRoles.map((role) => <option key={role.id} value={role.id}>{role.name} ({role.role_key})</option>)}
                        </select>
                      </label>
                      <label className="sm:col-span-2 lg:col-span-2">
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Title</span>
                        <input className={inputCls} disabled={!isAdmin} value={user.title ?? ''} onChange={(e) => updateUser(user.id, { title: e.target.value })} />
                      </label>
                    </div>

                    {user.role === 'admin' && (
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input type="checkbox" disabled={!isAdmin} checked={!!user.is_owner} onChange={(e) => updateUser(user.id, { is_owner: e.target.checked ? 1 : 0 })} />
                        Owner: can permanently delete archived records, manage role templates, and use Owner-only HQ tools
                      </label>
                    )}

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Permissions</p>
                      <p className="mt-1 text-xs text-slate-500">Inherit uses the coding role defaults. Allow and Deny override that role for this user only.</p>
                      <div className="mt-3 space-y-4">
                        {grouped.map(([category, items]) => (
                          <div key={category}>
                            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{category}</h4>
                            <div className="grid gap-2 lg:grid-cols-2">
                              {items.map((item) => {
                                const mode = user.modes[item.permission_key] || 'inherit'
                                const granted = effectiveFor(user, item.permission_key, rolePerms)
                                const roleDefault = rolePerms.has(item.permission_key)
                                return (
                                  <div key={item.permission_key} className={`rounded-xl border p-3 ${granted ? 'border-gold/20 bg-gold/[0.04]' : 'border-white/10 bg-white/[0.02]'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-medium text-white">{item.label}</p>
                                        <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
                                        <p className="mt-1 text-[11px] text-slate-500">Role default: {roleDefault ? 'allowed' : 'not granted'} · Effective: {granted ? 'allowed' : 'denied'}</p>
                                      </div>
                                      <select
                                        className={`${inputCls} !min-h-9 w-[7.5rem] shrink-0 !py-1.5 text-xs`}
                                        disabled={!isAdmin || user.role === 'admin'}
                                        value={user.role === 'admin' ? 'allow' : mode}
                                        onChange={(e) => updateUser(user.id, (current) => ({ ...current, modes: { ...current.modes, [item.permission_key]: e.target.value as OverrideMode } }))}
                                      >
                                        {user.role === 'admin' ? <option value="allow">Admin</option> : (
                                          <>
                                            <option value="inherit">Inherit</option>
                                            <option value="allow">Allow</option>
                                            <option value="deny">Deny</option>
                                          </>
                                        )}
                                      </select>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </Panel>
            )
          })}
        </div>
      </div>
    </div>
  )
}
