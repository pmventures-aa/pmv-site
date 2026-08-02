import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { services } from '../../data/services'

interface UserRow {
  id: string
  email: string
  role: 'client' | 'staff' | 'admin'
  full_name: string | null
  status: string
  created_at: string
}

const emptyForm = {
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  role: 'client',
  business_name: '',
  entity_type: '',
  ein: '',
  state: '',
  services_enrolled: [] as string[],
}

export default function UsersAdmin() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setupLink, setSetupLink] = useState<{ email: string; url: string } | null>(null)

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

  function toggleService(key: string) {
    setForm((f) => ({
      ...f,
      services_enrolled: f.services_enrolled.includes(key)
        ? f.services_enrolled.filter((k) => k !== key)
        : [...f.services_enrolled, key],
    }))
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || undefined,
        role: form.role,
      }
      if (form.role === 'client') {
        payload.business_name = form.business_name || undefined
        payload.entity_type = form.entity_type || undefined
        payload.ein = form.ein || undefined
        payload.state = form.state || undefined
        payload.services_enrolled = form.services_enrolled
      }
      const res = await api.post<{ ok: boolean; user: { email: string }; setup_token: string }>('/admin/users', payload)
      const surface = form.role === 'client' ? 'client' : 'hq'
      const host = surface === 'client' ? 'client.pinnaclemanagementventures.com' : 'hq.pinnaclemanagementventures.com'
      setSetupLink({ email: res.user.email, url: `https://${host}/set-password?token=${res.setup_token}` })
      setForm(emptyForm)
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
        subtitle="Provision staff, admin, and client accounts — including full client business profiles."
        action={
          <button
            className="btn-gold"
            onClick={() => {
              setSetupLink(null)
              setShowForm((s) => !s)
            }}
          >
            {showForm ? 'Cancel' : '+ New user'}
          </button>
        }
      />

      {setupLink && (
        <Card className="mb-6 border-emerald-400/30 bg-emerald-400/[0.06]">
          <p className="text-sm font-medium text-emerald-200">
            Account created for {setupLink.email}. Send them this one-time setup link — it lets them choose their own
            password and expires in 48 hours (no password was generated or stored by the system):
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-black/30 px-3 py-2 text-xs text-emerald-100">
              {setupLink.url}
            </code>
            <button
              type="button"
              className="btn-outline shrink-0 text-xs"
              onClick={() => navigator.clipboard.writeText(setupLink.url)}
            >
              Copy
            </button>
          </div>
        </Card>
      )}

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
                <option value="client">Client</option>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Email</span>
              <input className={inputCls} type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Phone</span>
              <input className={inputCls} type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </label>

            {form.role === 'client' && (
              <>
                <div className="sm:col-span-3 mt-2 border-t border-white/10 pt-4">
                  <p className="eyebrow">Client business profile</p>
                </div>
                <label>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Business name</span>
                  <input className={inputCls} value={form.business_name} onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))} />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Entity type</span>
                  <input className={inputCls} placeholder="LLC, S-Corp, Sole Prop…" value={form.entity_type} onChange={(e) => setForm((f) => ({ ...f, entity_type: e.target.value }))} />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">State</span>
                  <input className={inputCls} value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">EIN</span>
                  <input className={inputCls} value={form.ein} onChange={(e) => setForm((f) => ({ ...f, ein: e.target.value }))} />
                </label>
                <div className="sm:col-span-3">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Services enrolled</span>
                  <div className="flex flex-wrap gap-2">
                    {services.map((s) => (
                      <label
                        key={s.key}
                        className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          form.services_enrolled.includes(s.key)
                            ? 'border-gold/60 bg-gold/10 text-gold'
                            : 'border-white/10 bg-white/[0.03] text-slate-300'
                        }`}
                      >
                        <input type="checkbox" className="hidden" checked={form.services_enrolled.includes(s.key)} onChange={() => toggleService(s.key)} />
                        {s.title}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

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
