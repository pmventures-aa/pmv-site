import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, NoAccess, inputCls, btnPrimary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { ConfirmDialog } from '../../components/kit/ConfirmDialog'
import { useAuth } from '../../lib/auth'

interface UserRow {
  id: string
  email: string
  full_name: string | null
  role: string
}
interface Assignment {
  id: string
  staff_user_id: string
  client_user_id: string
  staff_name: string | null
  staff_email: string
  client_name: string | null
  client_email: string
  created_at: string
}

export default function AssignmentsAdmin() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [staffId, setStaffId] = useState('')
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<Assignment | null>(null)
  const [removing, setRemoving] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    try {
      const [a, u] = await Promise.all([
        api.get<{ assignments: Assignment[] }>('/admin/assignments'),
        api.get<{ users: UserRow[] }>('/admin/users'),
      ])
      setAssignments(a.assignments)
      setUsers(u.users)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const staff = users.filter((u) => u.role === 'staff' || u.role === 'admin')
  const clients = users.filter((u) => u.role === 'client')

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!staffId || !clientId) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/admin/assignments', { staff_user_id: staffId, client_user_id: clientId })
      setStaffId('')
      setClientId('')
      toast.success('Assignment created.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create assignment.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return
    setRemoving(true)
    try {
      await api.del(`/admin/assignments/${pendingRemove.id}`)
      toast.success('Assignment removed.')
      setPendingRemove(null)
      await load()
    } catch {
      toast.error('Could not remove assignment.')
    } finally {
      setRemoving(false)
    }
  }

  if (forbidden) {
    return (
      <div>
        <PageIntro kicker="Coverage" title="Staff Assignments" />
        <NoAccess label="Staff Assignments" />
      </div>
    )
  }

  return (
    <div>
      <PageIntro
        kicker="Coverage"
        title="Staff Assignments"
        subtitle={isAdmin ? 'Control which staff can see which clients.' : 'Who can see which clients. Ask an admin to change assignments.'}
      />

      {isAdmin && (
      <Panel className="mb-6">
        <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Staff member</span>
            <select className={inputCls} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Select…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || s.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Client</span>
            <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.email}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? 'Saving…' : 'Assign'}
            </button>
          </div>
          {error && <span className="text-sm text-rose-300 sm:col-span-3">{error}</span>}
        </form>
      </Panel>
      )}

      <Panel className="overflow-x-auto !p-0">
        {assignments.length === 0 ? (
          <div className="p-6">
            <EmptyState label="No assignments yet." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Staff</th>
                <th className="px-5 py-3 font-medium">Client</th>
                {isAdmin && <th className="px-5 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3 text-slate-200">{a.staff_name || a.staff_email}</td>
                  <td className="px-5 py-3 text-slate-200">{a.client_name || a.client_email}</td>
                  {isAdmin && (
                    <td className="px-5 py-3">
                      <button onClick={() => setPendingRemove(a)} className="text-xs font-medium text-rose-300 hover:underline">
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {isAdmin && (
      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title="Remove this assignment?"
        description={
          pendingRemove
            ? `${pendingRemove.staff_name || pendingRemove.staff_email} will no longer see ${pendingRemove.client_name || pendingRemove.client_email}.`
            : undefined
        }
        confirmLabel="Remove"
        busy={removing}
        onConfirm={confirmRemove}
      />
      )}
    </div>
  )
}
