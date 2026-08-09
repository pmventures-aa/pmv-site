import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, EmptyState, NoAccess, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { services } from '../../data/services'
import { toast } from '../../components/kit/toast'

const ROLE_OPTIONS = ['all', 'client', 'staff', 'admin']
const STATUS_OPTIONS = ['all', 'active', 'suspended']

interface UserRow {
  id: string
  email: string
  role: 'client' | 'staff' | 'admin'
  full_name: string | null
  status: string
  created_at: string
  password_set: number
  welcome_email_sent_at: string | null
  welcome_email_status: string | null
  welcome_email_last_event_at: string | null
}

interface EmailDelivery {
  deliveryId: string
  status: string
  providerId: string | null
  error?: string
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

// Pre-fills the "new user" form from URL query params — used by the
// Pipelines page's "Convert to client" link on a qualified inquiry, so
// staff don't retype what the lead already gave us.
function prefillFromParams(params: URLSearchParams): typeof emptyForm | null {
  if (!params.has('email') && !params.has('first_name') && !params.has('last_name')) return null
  const [first, ...rest] = (params.get('name') ?? '').split(' ')
  return {
    ...emptyForm,
    email: params.get('email') ?? '',
    first_name: params.get('first_name') ?? first ?? '',
    last_name: params.get('last_name') ?? rest.join(' '),
    phone: params.get('phone') ?? '',
    role: params.get('role') ?? 'client',
  }
}

function setupUrl(role: UserRow['role'] | string, token: string) {
  const host = role === 'client' ? 'client.pinnaclemanagementventures.com' : 'hq.pinnaclemanagementventures.com'
  return `https://${host}/set-password?token=${encodeURIComponent(token)}`
}

function emailTone(status: string | null): 'green' | 'red' | 'gold' | 'slate' {
  if (status === 'delivered' || status === 'sent') return 'green'
  if (status === 'failed' || status === 'bounced' || status === 'suppressed' || status === 'complained') return 'red'
  if (status === 'delayed' || status === 'skipped') return 'gold'
  return 'slate'
}

export default function UsersAdmin() {
  const [searchParams] = useSearchParams()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const prefill = useMemo(() => prefillFromParams(searchParams), [searchParams])
  const [showForm, setShowForm] = useState(() => prefill !== null)
  const [form, setForm] = useState(prefill ?? emptyForm)
  const [busy, setBusy] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [setupLink, setSetupLink] = useState<{ email: string; url: string; delivery?: EmailDelivery | null } | null>(null)
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ users: UserRow[] }>('/admin/account-users')
      setUsers(res.users)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true)
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
      const res = await api.post<{
        ok: boolean
        user: { email: string; role: UserRow['role'] }
        setup_token: string
        email_delivery: EmailDelivery
      }>('/admin/account-users', payload)
      setSetupLink({
        email: res.user.email,
        url: setupUrl(res.user.role, res.setup_token),
        delivery: res.email_delivery,
      })
      if (res.email_delivery.status === 'sent' || res.email_delivery.status === 'delivered') {
        toast.success(`Account created and setup email sent to ${res.user.email}.`)
      } else {
        toast.error(`Account created, but the setup email was ${res.email_delivery.status}. Use the fallback link shown below.`)
      }
      setForm(emptyForm)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create user.')
    } finally {
      setBusy(false)
    }
  }

  async function sendAccessEmail(u: UserRow) {
    setSendingId(u.id)
    try {
      const res = await api.post<{
        ok: boolean
        mode: 'setup' | 'reminder'
        setup_token?: string
        email_delivery: EmailDelivery
      }>(`/admin/users/${u.id}/setup-email`, {})
      if (res.mode === 'setup' && res.setup_token) {
        setSetupLink({ email: u.email, url: setupUrl(u.role, res.setup_token), delivery: res.email_delivery })
      }
      if (res.email_delivery.status === 'sent' || res.email_delivery.status === 'delivered') {
        toast.success(res.mode === 'setup' ? `New setup email sent to ${u.email}.` : `Portal reminder sent to ${u.email}.`)
      } else {
        toast.error(`Email ${res.email_delivery.status}. ${res.email_delivery.error || 'Use the manual fallback if needed.'}`)
      }
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send account email.')
    } finally {
      setSendingId(null)
    }
  }

  async function toggleStatus(u: UserRow) {
    const status = u.status === 'active' ? 'suspended' : 'active'
    try {
      await api.patch(`/admin/users/${u.id}`, { status })
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update this user. Try again.')
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (!needle) return true
      return (u.full_name ?? '').toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
    })
  }, [users, q, roleFilter, statusFilter])

  if (forbidden) {
    return (
      <div>
        <PageIntro kicker="Access" title="Users" />
        <NoAccess label="Users" />
      </div>
    )
  }

  return (
    <div>
      <PageIntro
        kicker="Access"
        title="Users"
        subtitle="Provision client and HQ accounts, track invitation delivery, and resend access when needed."
        action={
          <button
            className={btnPrimary}
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
        <Panel className={`mb-6 ${setupLink.delivery?.status === 'failed' || setupLink.delivery?.status === 'skipped' ? 'border-amber-400/30 bg-amber-400/[0.05]' : 'border-emerald-400/30 bg-emerald-400/[0.06]'}`}>
          <p className="text-sm font-medium text-white">
            Account access for {setupLink.email}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {setupLink.delivery?.status === 'sent' || setupLink.delivery?.status === 'delivered'
              ? 'The automated setup email was sent. Keep this one-time link as a fallback; it expires in 24 hours.'
              : `The automated email is ${setupLink.delivery?.status || 'unconfirmed'}. Send this one-time setup link manually if needed. Creating another setup link will invalidate this one.`}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md bg-black/30 px-3 py-2 text-xs text-emerald-100">
              {setupLink.url}
            </code>
            <button
              type="button"
              className={`${btnOutline} shrink-0 text-xs`}
              onClick={() => navigator.clipboard.writeText(setupLink.url)}
            >
              Copy
            </button>
          </div>
        </Panel>
      )}

      {showForm && (
        <Panel className="mb-6">
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
                        className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                          form.services_enrolled.includes(s.key)
                            ? 'border-gold/60 bg-gold/10 text-gold'
                            : 'border-white/10 bg-white/[0.02] text-slate-300'
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
              <button type="submit" disabled={busy} className={btnPrimary}>
                {busy ? 'Creating & sending…' : 'Create user & send setup'}
              </button>
              {error && <span className="text-sm text-rose-300">{error}</span>}
            </div>
          </form>
        </Panel>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={`${inputCls} max-w-[160px]`} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r === 'all' ? 'All roles' : r}
            </option>
          ))}
        </select>
        <select className={`${inputCls} max-w-[160px]`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s}
            </option>
          ))}
        </select>
      </div>

      <Panel className="overflow-x-auto !p-0">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState label={users.length === 0 ? 'No users yet.' : 'No users match your search.'} />
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Account email</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-white">{u.full_name || u.email}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-200">{u.role}</td>
                  <td className="px-5 py-3">
                    <Tag tone={u.status === 'active' ? 'green' : 'red'}>{u.status}</Tag>
                  </td>
                  <td className="px-5 py-3">
                    {u.welcome_email_status ? (
                      <div>
                        <Tag tone={emailTone(u.welcome_email_status)}>{u.welcome_email_status.replace(/_/g, ' ')}</Tag>
                        {u.welcome_email_last_event_at && <p className="mt-1 text-[11px] text-slate-500">Last update {new Date(`${u.welcome_email_last_event_at.replace(' ', 'T')}Z`).toLocaleString()}</p>}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Not sent</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => sendAccessEmail(u)}
                        disabled={sendingId === u.id || u.status !== 'active'}
                        className="text-xs font-medium text-gold hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sendingId === u.id ? 'Sending…' : u.password_set ? 'Send portal reminder' : u.welcome_email_sent_at ? 'Resend setup' : 'Send setup'}
                      </button>
                      <button onClick={() => toggleStatus(u)} className="text-xs font-medium text-gold hover:underline">
                        {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  )
}
