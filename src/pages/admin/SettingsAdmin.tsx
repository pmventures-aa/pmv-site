import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag, EmptyState, NoAccess, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useAuth } from '../../lib/auth'

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'catalog', label: 'Service Catalog' },
  { key: 'staff', label: 'Staff & Permissions' },
  { key: 'notifications', label: 'Notifications' },
] as const
type TabKey = (typeof TABS)[number]['key']

export default function SettingsAdmin() {
  const [tab, setTab] = useState<TabKey>('general')
  return (
    <div>
      <PageIntro kicker="Firm settings" title="Settings" subtitle="Global configuration for the Pinnacle console." />
      <div className="mb-5 flex gap-1.5 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.key ? 'border-gold text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'general' && <GeneralTab />}
      {tab === 'catalog' && <CatalogTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'notifications' && <NotificationsTab />}
    </div>
  )
}

// ---------------- General ----------------
const GENERAL_FIELDS: { key: string; label: string; type?: string; help?: string }[] = [
  { key: 'firm_notify_email', label: 'Notification email', type: 'email', help: 'Fallback recipient for firm-wide events (e.g. a new inquiry with no assigned staff yet).' },
  { key: 'business_name', label: 'Business name' },
  { key: 'business_phone', label: 'Business phone', type: 'tel' },
  { key: 'business_address', label: 'Business address' },
  { key: 'business_hours', label: 'Business hours', help: 'e.g. "Mon–Fri, 9am–5pm ET"' },
]

function GeneralTab() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    api
      .get<{ settings: { key: string; value: string }[] }>('/admin/settings')
      .then((r) => {
        const map: Record<string, string> = {}
        for (const row of r.settings) map[row.key] = row.value
        setSettings(map)
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true)
      })
      .finally(() => setLoading(false))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.patch('/admin/settings', settings)
      toast.success('Settings saved.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>
  if (forbidden) return <NoAccess label="General settings" />

  return (
    <Panel>
      <form onSubmit={save} className="max-w-md space-y-4">
        {GENERAL_FIELDS.map((f) => (
          <label key={f.key}>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{f.label}</span>
            <input
              className={inputCls}
              type={f.type ?? 'text'}
              value={settings[f.key] ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
            />
            {f.help && <span className="mt-1 block text-xs text-slate-500">{f.help}</span>}
          </label>
        ))}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </Panel>
  )
}

// ---------------- Service Catalog ----------------
interface ServiceRow {
  key: string
  name: string
  description: string | null
  category: string | null
  sort_order: number
  active: number
  question_count: number
}
interface QuestionRow {
  id: string
  service_key: string
  question_key: string
  label: string
  help_text: string | null
  input_type: string
  options: string | null
  required: number
  step_label: string | null
  step_order: number
  sort_order: number
}

function CatalogTab() {
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ key: '', name: '', description: '', category: '', sort_order: '0' })
  const [busy, setBusy] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ services: ServiceRow[] }>('/admin/services')
      setServices(res.services)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createService(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/admin/services', { ...form, sort_order: Number(form.sort_order) || 0 })
      toast.success('Service created.')
      setForm({ key: '', name: '', description: '', category: '', sort_order: '0' })
      setShowNew(false)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create service.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(s: ServiceRow) {
    try {
      await api.patch(`/admin/services/${s.key}`, { active: !s.active })
      toast.success(s.active ? 'Service retired.' : 'Service restored.')
      await load()
    } catch {
      toast.error('Could not update service.')
    }
  }

  if (forbidden) return <NoAccess label="the Service Catalog" />

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm text-slate-400">
        Controls what a client can apply for in the portal, and each service's multi-step application questions.
        This is separate from the public marketing site's service pages (those are static copy) — editing here
        changes the portal application flow, not the public site.
      </p>

      <div className="mb-4">
        <button className={btnOutline} onClick={() => setShowNew((s) => !s)}>
          {showNew ? 'Cancel' : '+ New service'}
        </button>
      </div>

      {showNew && (
        <Panel className="mb-5">
          <form onSubmit={createService} className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Key</span>
              <input className={inputCls} required placeholder="e.g. notary" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</span>
              <input className={inputCls} required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Description</span>
              <input className={inputCls} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Category</span>
              <input className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Sort order</span>
              <input className={inputCls} type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy} className={btnPrimary}>
                {busy ? 'Creating…' : 'Create service'}
              </button>
            </div>
          </form>
        </Panel>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : services.length === 0 ? (
        <Panel>
          <EmptyState label="No services yet." />
        </Panel>
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <Panel key={s.key} className="!p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">{s.name}</p>
                    <Tag tone={s.active ? 'green' : 'red'}>{s.active ? 'active' : 'retired'}</Tag>
                    {s.category && <Tag>{s.category}</Tag>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {s.key} · {s.question_count} question{s.question_count === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setExpanded((e) => (e === s.key ? null : s.key))} className="text-xs font-medium text-gold hover:underline">
                    {expanded === s.key ? 'Hide questions' : 'Manage questions'}
                  </button>
                  <button onClick={() => toggleActive(s)} className="text-xs font-medium text-slate-400 hover:text-rose-300">
                    {s.active ? 'Retire' : 'Restore'}
                  </button>
                </div>
              </div>
              {expanded === s.key && <QuestionsEditor serviceKey={s.key} onChanged={load} />}
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}

function QuestionsEditor({ serviceKey, onChanged }: { serviceKey: string; onChanged: () => void }) {
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newQ, setNewQ] = useState({ question_key: '', label: '', step_label: '', step_order: '1', required: true })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ questions: QuestionRow[] }>(`/admin/services/${serviceKey}/questions`)
      setQuestions(res.questions)
    } finally {
      setLoading(false)
    }
  }, [serviceKey])

  useEffect(() => {
    load()
  }, [load])

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post(`/admin/services/${serviceKey}/questions`, { ...newQ, step_order: Number(newQ.step_order) || 1 })
      toast.success('Question added.')
      setNewQ({ question_key: '', label: '', step_label: '', step_order: '1', required: true })
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add question.')
    } finally {
      setBusy(false)
    }
  }

  async function updateQuestion(q: QuestionRow) {
    try {
      await api.patch(`/admin/services/questions/${q.id}`, {
        label: q.label,
        step_label: q.step_label,
        step_order: q.step_order,
        required: !!q.required,
      })
      toast.success('Question updated.')
    } catch {
      toast.error('Could not update question.')
    }
  }

  async function removeQuestion(id: string) {
    try {
      await api.del(`/admin/services/questions/${id}`)
      toast.success('Question removed.')
      setQuestions((qs) => qs.filter((q) => q.id !== id))
      onChanged()
    } catch {
      toast.error('Could not remove question.')
    }
  }

  return (
    <div className="border-t border-white/10 px-5 py-4">
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => (
            <div key={q.id} className="grid gap-2 rounded-md border border-white/10 bg-navy-950 p-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
              <input
                className={`${inputCls} text-xs`}
                value={q.label}
                onChange={(e) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, label: e.target.value } : x)))}
              />
              <input
                className={`${inputCls} w-32 text-xs`}
                placeholder="Step label"
                value={q.step_label ?? ''}
                onChange={(e) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, step_label: e.target.value } : x)))}
              />
              <input
                className={`${inputCls} w-16 text-xs`}
                type="number"
                value={q.step_order}
                onChange={(e) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, step_order: Number(e.target.value) } : x)))}
              />
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={!!q.required}
                  onChange={(e) => setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, required: e.target.checked ? 1 : 0 } : x)))}
                />
                Required
              </label>
              <div className="flex gap-2">
                <button onClick={() => updateQuestion(q)} className="text-xs font-medium text-gold hover:underline">
                  Save
                </button>
                <button onClick={() => removeQuestion(q.id)} className="text-xs font-medium text-rose-300 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {questions.length === 0 && <p className="text-xs text-slate-500">No questions yet — clients apply with zero required fields until you add some.</p>}
        </div>
      )}

      <form onSubmit={addQuestion} className="mt-4 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
        <input
          className={`${inputCls} text-xs`}
          required
          placeholder="question_key (e.g. monthly_revenue)"
          value={newQ.question_key}
          onChange={(e) => setNewQ((f) => ({ ...f, question_key: e.target.value }))}
        />
        <input
          className={`${inputCls} text-xs`}
          required
          placeholder="Question label"
          value={newQ.label}
          onChange={(e) => setNewQ((f) => ({ ...f, label: e.target.value }))}
        />
        <input
          className={`${inputCls} w-28 text-xs`}
          placeholder="Step label"
          value={newQ.step_label}
          onChange={(e) => setNewQ((f) => ({ ...f, step_label: e.target.value }))}
        />
        <input
          className={`${inputCls} w-16 text-xs`}
          type="number"
          value={newQ.step_order}
          onChange={(e) => setNewQ((f) => ({ ...f, step_order: e.target.value }))}
        />
        <button type="submit" disabled={busy} className={`${btnOutline} text-xs`}>
          {busy ? 'Adding…' : '+ Add'}
        </button>
      </form>
    </div>
  )
}

// ---------------- Staff & Permissions ----------------
interface StaffUser {
  id: string
  email: string
  role: string
  full_name: string | null
  staff_role: string | null
  title: string | null
  can_reveal_payment_info: number | null
  can_manage_users: number | null
  can_manage_settings: number | null
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

function StaffTab() {
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

  useEffect(() => {
    load()
  }, [load])

  async function save(u: StaffUser) {
    try {
      await api.patch(`/admin/users/${u.id}/staff-profile`, {
        staff_role: u.staff_role ?? 'representative',
        title: u.title,
        can_reveal_payment_info: !!u.can_reveal_payment_info,
        can_manage_users: !!u.can_manage_users,
        can_manage_settings: !!u.can_manage_settings,
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
      {!isAdmin && (
        <p className="mb-4 text-sm text-slate-400">
          Role and capability grants are admin-only. You can view the team below, but saving is disabled.
        </p>
      )}

      {isAdmin && users.length > 0 && (
        <Panel className="mb-5 overflow-x-auto !p-0">
          <h3 className="border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">All grants at a glance</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2 font-medium">Name</th>
                <th className="px-5 py-2 font-medium">Role</th>
                <th className="px-5 py-2 font-medium">Banking</th>
                <th className="px-5 py-2 font-medium">Users</th>
                <th className="px-5 py-2 font-medium">Settings</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-white/5">
                  <td className="px-5 py-2 text-slate-200">{u.full_name || u.email}</td>
                  <td className="px-5 py-2">
                    <Tag tone={u.role === 'admin' ? 'gold' : 'slate'}>{u.role}</Tag>
                  </td>
                  <td className="px-5 py-2">{u.role === 'admin' || u.can_reveal_payment_info ? '✓' : '—'}</td>
                  <td className="px-5 py-2">{u.role === 'admin' || u.can_manage_users ? '✓' : '—'}</td>
                  <td className="px-5 py-2">{u.role === 'admin' || u.can_manage_settings ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
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
                  {u.email} · <Tag tone={u.role === 'admin' ? 'gold' : 'slate'}>{u.role}</Tag>
                </p>
              </div>
              {isAdmin && (
                <button onClick={() => save(u)} className={`${btnOutline} text-xs`}>
                  Save
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Staff role</span>
                <select
                  className={inputCls}
                  disabled={!isAdmin}
                  value={u.staff_role ?? 'representative'}
                  onChange={(e) => setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, staff_role: e.target.value } : x)))}
                >
                  {STAFF_ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Title</span>
                <input
                  className={inputCls}
                  disabled={!isAdmin}
                  value={u.title ?? ''}
                  onChange={(e) => setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, title: e.target.value } : x)))}
                />
              </label>
            </div>
            {u.role !== 'admin' && (
              <div className="mt-3 flex flex-wrap gap-4 border-t border-white/10 pt-3">
                {(
                  [
                    ['can_reveal_payment_info', 'View decrypted banking info'],
                    ['can_manage_users', 'Manage users (not admin promotion)'],
                    ['can_manage_settings', 'Manage settings & service catalog'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={!!u[key]}
                      onChange={(e) => setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, [key]: e.target.checked ? 1 : 0 } : x)))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </Panel>
        ))}
      </div>
    </div>
  )
}

// ---------------- Notifications (own prefs) ----------------
function NotificationsTab() {
  const [kinds, setKinds] = useState<string[]>([])
  const [muted, setMuted] = useState<Set<string>>(new Set())
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get<{ kinds: string[]; muted_kinds: string[]; email_enabled: boolean; sound_enabled: boolean }>('/admin/notification-prefs')
      .then((r) => {
        setKinds(r.kinds)
        setMuted(new Set(r.muted_kinds))
        setEmailEnabled(r.email_enabled)
        setSoundEnabled(r.sound_enabled)
        setLoading(false)
      })
  }, [])

  function toggle(kind: string) {
    setMuted((m) => {
      const next = new Set(m)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  async function save() {
    setBusy(true)
    try {
      await api.patch('/admin/notification-prefs', { muted_kinds: Array.from(muted), email_enabled: emailEnabled, sound_enabled: soundEnabled })
      toast.success('Notification preferences saved.')
    } catch {
      toast.error('Could not save preferences.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>

  return (
    <Panel className="max-w-2xl">
      <p className="mb-4 text-sm text-slate-400">
        Choose which events show up in your activity feed and bell. Muted events are still logged for audit
        purposes — they just won't notify you.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
        Play a sound when a new notification arrives (checked every ~30 seconds while HQ is open)
      </label>
      <label className="mb-4 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
        Also email me for events I haven't muted (requires email delivery to be configured firm-wide)
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {kinds.map((k) => (
          <label key={k} className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={!muted.has(k)} onChange={() => toggle(k)} />
            {k.replace(/_/g, ' ')}
          </label>
        ))}
      </div>
      <button onClick={save} disabled={busy} className={`${btnPrimary} mt-5`}>
        {busy ? 'Saving…' : 'Save preferences'}
      </button>
    </Panel>
  )
}
