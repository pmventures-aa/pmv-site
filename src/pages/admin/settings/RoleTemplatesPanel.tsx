import { useMemo, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../../lib/api'
import { Panel, Tag, EmptyState, inputCls, btnPrimary, btnOutline } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'

export interface Permission {
  permission_key: string
  label: string
  description: string
  category: string
}

export interface RoleDef {
  id: string
  role_key: string
  name: string
  description: string | null
  party_type: string
  is_system: number
  is_archived?: number
  assigned_users: number
  permissions: string[]
}

export const emptyRoleForm = {
  name: '',
  role_key: '',
  description: '',
  party_type: 'employee',
  permissions: [] as string[],
}

export type RoleForm = typeof emptyRoleForm

export function groupPermissions(permissions: Permission[]) {
  const map = new Map<string, Permission[]>()
  for (const item of permissions) {
    if (!map.has(item.category)) map.set(item.category, [])
    map.get(item.category)!.push(item)
  }
  return [...map.entries()]
}

export function slugRoleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
}

export function RoleEditor({
  form,
  setForm,
  permissions,
  editing,
  busy,
  onSubmit,
  onCancel,
}: {
  form: RoleForm
  setForm: (next: RoleForm | ((current: RoleForm) => RoleForm)) => void
  permissions: Permission[]
  editing: RoleDef | null
  busy: boolean
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}) {
  const grouped = useMemo(() => groupPermissions(permissions), [permissions])
  function toggle(key: string) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter((item) => item !== key)
        : [...current.permissions, key],
    }))
  }
  return (
    <Panel className="mb-6 !border-gold/20">
      <form onSubmit={onSubmit}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">{editing ? 'Edit role' : 'New role'}</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{editing?.name || 'Define exactly what this role can do'}</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">Defaults apply to everyone assigned this role. You can still override any permission on a specific user. Owner authority is never part of a template.</p>
          </div>
          <button type="button" className="text-sm text-slate-400 hover:text-white" onClick={onCancel}>Close</button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label>
            <span className="mb-1 block text-xs text-slate-400">Role name</span>
            <input className={inputCls} required placeholder="Support Admin" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value, role_key: current.role_key || slugRoleKey(e.target.value) }))} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-slate-400">Coding key</span>
            <input className={inputCls} required placeholder="support_admin" value={form.role_key} onChange={(e) => setForm((current) => ({ ...current, role_key: slugRoleKey(e.target.value) }))} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-slate-400">Applies to</span>
            <select className={inputCls} value={form.party_type} onChange={(e) => setForm((current) => ({ ...current, party_type: e.target.value }))}>
              <option value="employee">Internal team</option>
              <option value="vendor">Professional providers</option>
              <option value="either">Internal or provider</option>
            </select>
          </label>
          <label className="md:col-span-3">
            <span className="mb-1 block text-xs text-slate-400">Description</span>
            <input className={inputCls} placeholder="What is this role responsible for?" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />
          </label>
        </div>
        <div className="mt-6 space-y-5">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{category}</h3>
              <div className="grid gap-2 lg:grid-cols-2">
                {items.map((item) => (
                  <label key={item.permission_key} className={`cursor-pointer rounded-xl border p-4 transition ${form.permissions.includes(item.permission_key) ? 'border-gold/30 bg-gold/[0.06]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                    <div className="flex gap-3">
                      <input type="checkbox" className="mt-1" checked={form.permissions.includes(item.permission_key)} onChange={() => toggle(item.permission_key)} />
                      <div>
                        <p className="text-sm font-medium text-white">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-600">{item.permission_key}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save role' : 'Create role'}</button>
          <button type="button" className={btnOutline} onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </Panel>
  )
}

export function RoleTemplatesPanel({
  permissions,
  roles,
  canMutate,
  onChanged,
}: {
  permissions: Permission[]
  roles: RoleDef[]
  canMutate: boolean
  onChanged: () => Promise<void> | void
}) {
  const [editing, setEditing] = useState<RoleDef | null>(null)
  const [form, setForm] = useState<RoleForm>(emptyRoleForm)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const visible = roles.filter((role) => showArchived || !role.is_archived)

  function startNew() {
    setEditing(null)
    setForm(emptyRoleForm)
    setShowForm(true)
  }
  function startEdit(role: RoleDef) {
    setEditing(role)
    setForm({
      name: role.name,
      role_key: role.role_key,
      description: role.description || '',
      party_type: role.party_type,
      permissions: [...role.permissions],
    })
    setShowForm(true)
  }

  async function saveRole(e: FormEvent) {
    e.preventDefault()
    if (!canMutate) return
    setBusy(true)
    try {
      if (editing) await api.patch(`/admin/roles/${editing.id}`, form)
      else await api.post('/admin/roles', form)
      toast.success(editing ? 'Role updated.' : 'Role created.')
      setShowForm(false)
      setEditing(null)
      setForm(emptyRoleForm)
      await onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save role.')
    } finally {
      setBusy(false)
    }
  }

  async function archiveRole(role: RoleDef, archived: boolean) {
    if (!canMutate) return
    setBusy(true)
    try {
      await api.patch(`/admin/roles/${role.id}`, { is_archived: archived })
      toast.success(archived ? 'Role archived.' : 'Role restored.')
      await onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update role.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteRole(role: RoleDef) {
    if (!canMutate) return
    if (role.is_system) return
    if (!confirm(`Delete ${role.name}? This cannot be undone.`)) return
    setBusy(true)
    try {
      await api.del(`/admin/roles/${role.id}`)
      toast.success('Role deleted.')
      if (editing?.id === role.id) {
        setShowForm(false)
        setEditing(null)
      }
      await onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete role.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Coding roles</h3>
          <p className="mt-0.5 text-xs text-slate-500">Create, rename, and set default grants.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnOutline} onClick={() => setShowArchived((value) => !value)}>{showArchived ? 'Hide archived' : 'Show archived'}</button>
          {canMutate && <button type="button" className={btnPrimary} onClick={startNew}>+ Create role</button>}
        </div>
      </div>

      {showForm && canMutate && (
        <RoleEditor form={form} setForm={setForm} permissions={permissions} editing={editing} busy={busy} onSubmit={saveRole} onCancel={() => setShowForm(false)} />
      )}

      <div className="space-y-2">
        {visible.length === 0 ? (
          <Panel className="!p-3"><EmptyState label="No roles match this filter." /></Panel>
        ) : visible.map((role) => (
          <Panel key={role.id} className="!p-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-white">{role.name}</h2>
                  {role.is_system ? <Tag tone="gold">Starter</Tag> : <Tag tone="slate">Custom</Tag>}
                  {role.is_archived ? <Tag tone="red">Archived</Tag> : null}
                  <span className="font-mono text-[10px] text-slate-600">{role.role_key}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{role.description || 'No description yet.'} · {role.party_type} · {role.assigned_users} assigned</p>
              </div>
              {canMutate && (
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button type="button" className="text-sm font-medium text-gold hover:underline" onClick={() => startEdit(role)}>Edit</button>
                  <button type="button" className="text-xs text-slate-400 hover:text-white" onClick={() => archiveRole(role, !role.is_archived)}>{role.is_archived ? 'Restore' : 'Archive'}</button>
                  {!role.is_system && role.assigned_users === 0 && (
                    <button type="button" className="text-xs text-rose-300 hover:text-rose-200" onClick={() => deleteRole(role)}>Delete</button>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.permissions.length === 0
                ? <span className="text-xs text-slate-500">No elevated permissions.</span>
                : role.permissions.map((key) => {
                  const item = permissions.find((entry) => entry.permission_key === key)
                  return <span key={key} title={item?.description} className="rounded-full border border-white/10 bg-white/[0.025] px-2.5 py-1 text-[11px] text-slate-300">{item?.label || key}</span>
                })}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
