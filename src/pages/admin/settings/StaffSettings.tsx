import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../../lib/api'
import { Panel, Tag, NoAccess, inputCls, btnOutline } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'
import { useAuth } from '../../../lib/auth'

interface StaffUser {
  id: string
  email: string
  role: string
  status: string
  full_name: string | null
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
}

const STAFF_ROLE_OPTIONS = [
  'representative',
  'billing_specialist',
  'funding_specialist',
  'affiliate_paralegal',
  'accountant',
  'enrolled_agent',
  'property_manager',
  'support_specialist',
  'auditor_readonly',
  'pinnacle_admin',
]

export default function StaffSettings() {
  const { user: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ users: StaffUser[] }>('/admin/users')
      setUsers(res.users.filter((u) => u.role === 'staff' || u.role === 'admin'))
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true)
      else toast.error(err instanceof ApiError ? err.message : 'Could not load staff.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save(u: StaffUser) {
    try {
      await api.patch(`/admin/users/${u.id}/staff-profile`, {
        staff_role: u.staff_role ?? 'representative',
        title: u.title,
        can_reveal_payment_info: !!u.can_reveal_payment_info,
        can_manage_users: !!u.can_manage_users,
        can_manage_settings: !!u.can_manage_settings,
        can_view_reports: !!u.can_view_reports,
        can_view_audit_log: !!u.can_view_audit_log,
        can_manage_communications: !!u.can_manage_communications,
        is_owner: !!u.is_owner,
        party_type: u.party_type === 'vendor' ? 'vendor' : 'employee',
        vendor_category: u.vendor_category,
        status: u.status === 'suspended' ? 'suspended' : 'active',
      })
      toast.success(`Updated ${u.full_name || u.email}.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update staff member.')
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>
  if (forbidden) return <NoAccess label="Staff &amp; Permissions" />

  return (
    <div>
      {!isAdmin && <p className="mb-4 text-sm text-slate-400">Role and capability grants are admin-only. You can view the team below, but saving is disabled.</p>}

      {isAdmin && users.length > 0 && (
        <Panel className="mb-5 overflow-x-auto !p-0">
          <h3 className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">All grants at a glance</h3>
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2 font-medium">Name</th><th className="px-5 py-2 font-medium">Role</th><th className="px-5 py-2 font-medium">Owner</th><th className="px-5 py-2 font-medium">Banking</th><th className="px-5 py-2 font-medium">Users</th><th className="px-5 py-2 font-medium">Settings</th><th className="px-5 py-2 font-medium">Reports</th><th className="px-5 py-2 font-medium">Audit log</th>
            </tr></thead>
            <tbody>{users.map((u) => <tr key={u.id} className="border-t border-white/5">
              <td className="px-5 py-2 text-slate-200">{u.full_name || u.email}</td><td className="px-5 py-2"><Tag tone={u.role === 'admin' ? 'gold' : 'slate'}>{u.role}</Tag></td><td className="px-5 py-2">{u.is_owner ? '✓' : 'Not provided'}</td><td className="px-5 py-2">{u.role === 'admin' || u.can_reveal_payment_info ? '✓' : 'Not provided'}</td><td className="px-5 py-2">{u.role === 'admin' || u.can_manage_users ? '✓' : 'Not provided'}</td><td className="px-5 py-2">{u.role === 'admin' || u.can_manage_settings ? '✓' : 'Not provided'}</td><td className="px-5 py-2">{u.role === 'admin' || u.can_view_reports ? '✓' : 'Not provided'}</td><td className="px-5 py-2">{u.role === 'admin' || u.can_view_audit_log ? '✓' : 'Not provided'}</td>
            </tr>)}</tbody>
          </table>
        </Panel>
      )}

      <div className="space-y-3">
        {users.map((u) => (
          <Panel key={u.id}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-white">{u.full_name || u.email}</p>
                <p className="text-xs text-slate-500">
                  {u.email} · <Tag tone={u.role === 'admin' ? 'gold' : 'slate'}>{u.role}</Tag>{' '}
                  {u.party_type === 'vendor' && <Tag tone="blue">vendor</Tag>}{' '}
                  {u.status === 'pending' && <Tag tone="gold">pending</Tag>}
                  {u.status === 'suspended' && <Tag tone="red">suspended</Tag>}
                </p>
              </div>
              {isAdmin && <button onClick={() => save(u)} className={`${btnOutline} text-xs`}>Save</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Staff role</span><select className={inputCls} disabled={!isAdmin} value={u.staff_role ?? 'representative'} onChange={(e) => setUsers((us) => us.map((x) => x.id === u.id ? { ...x, staff_role: e.target.value } : x))}>{STAFF_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</select></label>
              <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Title</span><input className={inputCls} disabled={!isAdmin} value={u.title ?? ''} onChange={(e) => setUsers((us) => us.map((x) => x.id === u.id ? { ...x, title: e.target.value } : x))} /></label>
            </div>
            {u.role !== 'admin' && (
              <div className="mt-3 grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-3">
                <label>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Type</span>
                  <select className={inputCls} disabled={!isAdmin} value={u.party_type === 'vendor' ? 'vendor' : 'employee'} onChange={(e) => setUsers((us) => us.map((x) => x.id === u.id ? { ...x, party_type: e.target.value } : x))}>
                    <option value="employee">Employee</option>
                    <option value="vendor">Vendor / provider</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Vendor category</span>
                  <input className={inputCls} disabled={!isAdmin || u.party_type !== 'vendor'} placeholder="What they provide" value={u.vendor_category ?? ''} onChange={(e) => setUsers((us) => us.map((x) => x.id === u.id ? { ...x, vendor_category: e.target.value } : x))} />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Account status</span>
                  <select className={inputCls} disabled={!isAdmin} value={u.status === 'suspended' ? 'suspended' : 'active'} onChange={(e) => setUsers((us) => us.map((x) => x.id === u.id ? { ...x, status: e.target.value } : x))}>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </label>
              </div>
            )}
            {u.role !== 'admin' && <div className="mt-3 flex flex-wrap gap-4 border-t border-white/10 pt-3">{([
              ['can_reveal_payment_info', 'View decrypted banking info'], ['can_manage_users', 'Manage users (not admin promotion)'], ['can_manage_settings', 'Manage settings & service catalog'], ['can_view_reports', 'View the Reporting Center'], ['can_view_audit_log', 'View the Audit Log'], ['can_manage_communications', 'Compose & send from the Communications Center'],
            ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" disabled={!isAdmin} checked={!!u[key]} onChange={(e) => setUsers((us) => us.map((x) => x.id === u.id ? { ...x, [key]: e.target.checked ? 1 : 0 } : x))} />{label}</label>)}</div>}
            {u.role === 'admin' && <div className="mt-3 border-t border-white/10 pt-3"><label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" disabled={!isAdmin} checked={!!u.is_owner} onChange={(e) => setUsers((us) => us.map((x) => x.id === u.id ? { ...x, is_owner: e.target.checked ? 1 : 0 } : x))} />Owner: can permanently delete archived records</label></div>}
          </Panel>
        ))}
      </div>
    </div>
  )
}
