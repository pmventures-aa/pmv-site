import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, EmptyState } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'

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
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [staffId, setStaffId] = useState('')
  const [clientId, setClientId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [a, u] = await Promise.all([
      api.get<{ assignments: Assignment[] }>('/admin/assignments'),
      api.get<{ users: UserRow[] }>('/admin/users'),
    ])
    setAssignments(a.assignments)
    setUsers(u.users)
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
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create assignment.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await api.del(`/admin/assignments/${id}`)
    await load()
  }

  return (
    <div>
      <PageHeader eyebrow="Coverage" title="Staff Assignments" subtitle="Control which staff can see which clients." />

      <Card className="mb-6">
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
            <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
              {busy ? 'Saving…' : 'Assign'}
            </button>
          </div>
          {error && <span className="text-sm text-rose-300 sm:col-span-3">{error}</span>}
        </form>
      </Card>

      <Card className="overflow-x-auto !p-0">
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
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3 text-slate-200">{a.staff_name || a.staff_email}</td>
                  <td className="px-5 py-3 text-slate-200">{a.client_name || a.client_email}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => remove(a.id)} className="text-xs font-medium text-rose-300 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
