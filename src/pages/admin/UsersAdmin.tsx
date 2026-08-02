import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'

interface UserRow {
  id: string
  email: string
  role: 'client' | 'staff' | 'admin'
  full_name: string | null
  status: string
  created_at: string
}

const MIN_PASSWORD = 10

export default function UsersAdmin() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', role: 'staff' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ users: UserRow[] }>('/admin/users')
      setUsers(res.users)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`)
      return
    }
    setBusy(true)
    try {
      await api.post('/admin/users', form)
      setForm({ email: '', password: '', first_name: '', last_name: '', role: 'staff' })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create user.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(u: UserRow) {
    const status = u.status === 'active' ? 'suspended' : 'active'
    await api.patch(`/admin/users/${u.id}`, { status })
    await load()
  }

  return (
    <div>
      <PageHeader
        eyebrow="Access"
        title="Users"
        subtitle="Provision staff, admin, and client accounts."
        action={
          <button className="btn-gold" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : '+ New user'}
          </button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-3">
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">First name</span>
              <input className={inputCls} required value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Last name</span>
              <input className={inputCls} required value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Role</span>
              <select className={inputCls} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
                <option value="client">Client</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Email</span>
              <input className={inputCls} type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Temporary password</span>
              <input className={inputCls} type="text" required minLength={MIN_PASSWORD} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </label>
            <div className="flex items-center gap-3 sm:col-span-3">
              <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
                {busy ? 'Creating…' : 'Create user'}
              </button>
              {error && <span className="text-sm text-rose-300">{error}</span>}
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto !p-0">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-6">
            <EmptyState label="No users yet." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-white">{u.full_name || u.email}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-200">{u.role}</td>
                  <td className="px-5 py-3">
                    <StatusBadge tone={u.status === 'active' ? 'green' : 'red'}>{u.status}</StatusBadge>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => toggleStatus(u)} className="text-xs font-medium text-gold hover:underline">
                      {u.status === 'active' ? 'Suspend' : 'Reactivate'}
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
