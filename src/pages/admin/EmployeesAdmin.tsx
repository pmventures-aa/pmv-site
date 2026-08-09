import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag } from '../../components/admin/ui'
import { Dialog, DialogContent } from '../../components/kit/Dialog'
import { timeAgo } from '../../lib/activity'

interface Employee {
  id: string
  email: string
  full_name: string | null
  last_seen_at: string | null
  last_login_at: string | null
  status: string
  staff_role: string | null
  title: string | null
  tasks_assigned: number
  tasks_completed: number
  tasks_overdue: number
  notes_added: number
  emails_sent: number
  client_interactions: number
}

type SortKey = 'name' | 'tasks_assigned' | 'tasks_completed' | 'tasks_overdue' | 'last_seen_at'

export default function EmployeesAdmin() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sort, setSort] = useState<SortKey>('name')
  const [selected, setSelected] = useState<Employee | null>(null)

  const load = () => {
    setLoading(true)
    api
      .get<{ employees: Employee[] }>('/admin/employees')
      .then((r) => {
        setEmployees(r.employees)
        setLoadError(false)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const sorted = [...employees].sort((a, b) => {
    switch (sort) {
      case 'tasks_assigned':
        return b.tasks_assigned - a.tasks_assigned
      case 'tasks_completed':
        return b.tasks_completed - a.tasks_completed
      case 'tasks_overdue':
        return b.tasks_overdue - a.tasks_overdue
      case 'last_seen_at':
        return (b.last_seen_at ?? '').localeCompare(a.last_seen_at ?? '')
      default:
        return (a.full_name || a.email).localeCompare(b.full_name || b.email)
    }
  })

  return (
    <div>
      <PageIntro
        kicker="Team performance"
        title="Employees"
        subtitle="Login activity, workload, and response times across the team. Admin/Owner only."
      />

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : loadError ? (
        <div className="space-y-2 text-sm text-slate-400">
          <p>Couldn't load the employee roster.</p>
          <button onClick={load} className="text-gold hover:underline">
            Try again
          </button>
        </div>
      ) : employees.length === 0 ? (
        <Panel>
          <EmptyState label="No staff accounts yet." />
        </Panel>
      ) : (
        <Panel className="overflow-x-auto !p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="cursor-pointer px-5 py-3 font-medium" onClick={() => setSort('name')}>
                  Name
                </th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="cursor-pointer px-5 py-3 font-medium" onClick={() => setSort('last_seen_at')}>
                  Last active
                </th>
                <th className="cursor-pointer px-5 py-3 font-medium" onClick={() => setSort('tasks_assigned')}>
                  Tasks assigned
                </th>
                <th className="cursor-pointer px-5 py-3 font-medium" onClick={() => setSort('tasks_completed')}>
                  Completed
                </th>
                <th className="cursor-pointer px-5 py-3 font-medium" onClick={() => setSort('tasks_overdue')}>
                  Overdue
                </th>
                <th className="px-5 py-3 font-medium">Notes / Emails</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.02]" onClick={() => setSelected(e)}>
                  <td className="px-5 py-3 text-slate-200">
                    {e.full_name || e.email}
                    {e.status === 'suspended' && (
                      <Tag tone="red">
                        <span className="ml-1">suspended</span>
                      </Tag>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-400">{e.title || e.staff_role?.replace(/_/g, ' ') || '—'}</td>
                  <td className="px-5 py-3 text-slate-400">{e.last_seen_at ? timeAgo(e.last_seen_at) : 'never'}</td>
                  <td className="px-5 py-3 text-slate-200 tabular-nums">{e.tasks_assigned}</td>
                  <td className="px-5 py-3 text-slate-200 tabular-nums">{e.tasks_completed}</td>
                  <td className="px-5 py-3 tabular-nums">
                    <span className={e.tasks_overdue > 0 ? 'font-semibold text-rose-300' : 'text-slate-200'}>{e.tasks_overdue}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-400 tabular-nums">
                    {e.notes_added} / {e.emails_sent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {selected && <EmployeeDetail id={selected.id} name={selected.full_name || selected.email} onClose={() => setSelected(null)} />}
    </div>
  )
}

interface EmployeeDetailData {
  employee: Employee & { created_at: string; can_reveal_payment_info: number; can_manage_users: number; can_manage_settings: number; can_view_reports: number; can_view_audit_log: number; is_owner: number }
  login_history: { created_at: string; actor_ip: string | null; actor_user_agent: string | null }[]
  tasks: { id: string; title: string; status: string; due_date: string | null; client_name: string | null; client_email: string }[]
  notes: { id: string; body: string; created_at: string; client_name: string | null; client_email: string | null }[]
  avg_response_hours: number | null
}

function EmployeeDetail({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<EmployeeDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<EmployeeDetailData>(`/admin/employees/${id}`)
      .then(setData)
      .finally(() => setLoading(false))
  }, [id])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={name} description="Login history, workload, and activity." className="max-w-2xl">
        {loading || !data ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="max-h-[70vh] space-y-6 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border border-white/10 p-3">
                <p className="text-xl font-semibold text-white tabular-nums">{data.employee.tasks_assigned}</p>
                <p className="text-xs text-slate-500">Assigned</p>
              </div>
              <div className="rounded-md border border-white/10 p-3">
                <p className="text-xl font-semibold text-white tabular-nums">{data.employee.tasks_completed}</p>
                <p className="text-xs text-slate-500">Completed</p>
              </div>
              <div className="rounded-md border border-white/10 p-3">
                <p className="text-xl font-semibold text-white tabular-nums">
                  {data.avg_response_hours !== null ? `${data.avg_response_hours.toFixed(1)}h` : '—'}
                </p>
                <p className="text-xs text-slate-500">Avg. response</p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">Capability grants</h3>
              <div className="flex flex-wrap gap-2">
                {data.employee.is_owner ? <Tag tone="gold">Owner</Tag> : null}
                {data.employee.can_reveal_payment_info ? <Tag>Banking</Tag> : null}
                {data.employee.can_manage_users ? <Tag>Users</Tag> : null}
                {data.employee.can_manage_settings ? <Tag>Settings</Tag> : null}
                {data.employee.can_view_reports ? <Tag>Reports</Tag> : null}
                {data.employee.can_view_audit_log ? <Tag>Audit log</Tag> : null}
                {!data.employee.can_reveal_payment_info &&
                  !data.employee.can_manage_users &&
                  !data.employee.can_manage_settings &&
                  !data.employee.can_view_reports &&
                  !data.employee.can_view_audit_log &&
                  !data.employee.is_owner && <span className="text-xs text-slate-500">No grants beyond base role.</span>}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">Recent logins</h3>
              {data.login_history.length === 0 ? (
                <p className="text-xs text-slate-500">No login history recorded yet.</p>
              ) : (
                <ul className="space-y-1 text-xs text-slate-400">
                  {data.login_history.slice(0, 8).map((l, i) => (
                    <li key={i} className="truncate" title={l.actor_user_agent ?? undefined}>
                      {timeAgo(l.created_at)} {l.actor_ip ? `· ${l.actor_ip}` : ''} {l.actor_user_agent ? `· ${l.actor_user_agent}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">Assigned tasks</h3>
              {data.tasks.length === 0 ? (
                <p className="text-xs text-slate-500">Nothing assigned.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {data.tasks.slice(0, 10).map((t) => (
                    <li key={t.id} className="flex items-center justify-between text-slate-300">
                      <span>
                        {t.title} <span className="text-slate-500">— {t.client_name || t.client_email}</span>
                      </span>
                      <Tag tone={t.status === 'done' ? 'green' : 'slate'}>{t.status.replace(/_/g, ' ')}</Tag>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
