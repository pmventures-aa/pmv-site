import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, NoAccess, inputCls, btnPrimary, Tag, CardList, DataCard, CardRow } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { ConfirmDialog } from '../../components/kit/ConfirmDialog'
import { useAuth } from '../../lib/auth'
import { useLiveRefresh } from '../../lib/liveRefresh'

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
  is_primary: number
  created_at: string
}

export default function AssignmentsAdmin() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [staffId, setStaffId] = useState('')
  const [clientIds, setClientIds] = useState<Set<string>>(new Set())
  const [clientFilter, setClientFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [primaryBusy, setPrimaryBusy] = useState<string | null>(null)
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

  useEffect(() => { void load() }, [load])
  useLiveRefresh(load)

  const staff = users.filter((u) => u.role === 'staff' || u.role === 'admin')
  const clients = users.filter((u) => u.role === 'client')

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!staffId || clientIds.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<{ count: number }>('/admin/assignments/bulk', {
        staff_user_id: staffId,
        client_user_ids: [...clientIds],
      })
      setStaffId('')
      setClientIds(new Set())
      setClientFilter('')
      toast.success(r.count === 1 ? 'Assignment created.' : `${r.count} clients assigned.`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create assignment(s).')
    } finally {
      setBusy(false)
    }
  }

  function toggleClient(id: string) {
    setClientIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function makePrimary(a: Assignment) {
    setPrimaryBusy(a.id)
    try {
      await api.patch(`/admin/assignments/${a.id}/primary`)
      toast.success(`${a.staff_name || a.staff_email} is now the primary representative for ${a.client_name || a.client_email}.`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the primary representative.')
    } finally {
      setPrimaryBusy(null)
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
        subtitle={
          isAdmin
            ? 'Control who can see each client and identify the primary representative used for new-service routing.'
            : 'See client coverage and primary representatives. Ask an admin to make changes.'
        }
      />

      {isAdmin && (
        <Panel className="mb-6">
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Staff member</span>
              <select className={inputCls} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">Select…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Clients {clientIds.size > 0 ? `(${clientIds.size} selected)` : ''}
              </span>
              <input
                className={`${inputCls} mb-2`}
                placeholder="Filter clients…"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
              />
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-white/10 p-2">
                {clients
                  .filter((c) => {
                    const q = clientFilter.trim().toLowerCase()
                    if (!q) return true
                    return (c.full_name || '').toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
                  })
                  .map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-200 hover:bg-white/5">
                      <input type="checkbox" checked={clientIds.has(c.id)} onChange={() => toggleClient(c.id)} />
                      {c.full_name || c.email}
                    </label>
                  ))}
                {clients.length === 0 && <p className="px-2 py-1 text-sm text-slate-500">No clients yet.</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={busy || !staffId || clientIds.size === 0} className={`${btnPrimary} disabled:opacity-60`}>
                {busy ? 'Saving…' : clientIds.size > 1 ? `Assign ${clientIds.size} clients` : 'Assign'}
              </button>
              {error && <span className="text-sm text-rose-300">{error}</span>}
            </div>
          </form>
          <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-slate-500">
            If a client has one assigned staff member, that person is used automatically. For clients with multiple staff members, mark one as Primary so new service applications route to the correct representative.
          </p>
        </Panel>
      )}

      <Panel className="overflow-x-auto !p-0">
        {assignments.length === 0 ? (
          <div className="p-6"><EmptyState label="No assignments yet." /></div>
        ) : (
          <>
          <CardList className="p-3">{assignments.map((a) => <DataCard key={a.id}><p className="font-medium text-white">{a.staff_name || a.staff_email}</p><div className="mt-3 space-y-1.5"><CardRow label="Client">{a.client_name || a.client_email}</CardRow><CardRow label="Routing">{a.is_primary ? <Tag tone="gold">Primary rep</Tag> : isAdmin ? <button disabled={primaryBusy === a.id} onClick={() => makePrimary(a)} className="text-xs font-medium text-gold hover:underline disabled:opacity-50">{primaryBusy === a.id ? 'Saving…' : 'Make primary'}</button> : <span className="text-slate-500">Team access</span>}</CardRow></div>{isAdmin && <div className="mt-3 flex justify-end border-t border-white/5 pt-3"><button onClick={() => setPendingRemove(a)} className="text-xs font-medium text-rose-300 hover:underline">Remove</button></div>}</DataCard>)}</CardList>
          <table className="hidden w-full min-w-[680px] text-sm md:table">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Staff</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Routing</th>
                {isAdmin && <th className="px-5 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3 text-slate-200">{a.staff_name || a.staff_email}</td>
                  <td className="px-5 py-3 text-slate-200">{a.client_name || a.client_email}</td>
                  <td className="px-5 py-3">
                    {a.is_primary ? (
                      <Tag tone="gold">Primary rep</Tag>
                    ) : isAdmin ? (
                      <button
                        disabled={primaryBusy === a.id}
                        onClick={() => makePrimary(a)}
                        className="text-xs font-medium text-gold hover:underline disabled:opacity-50"
                      >
                        {primaryBusy === a.id ? 'Saving…' : 'Make primary'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Team access</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setPendingRemove(a)} className="text-xs font-medium text-rose-300 hover:underline">Remove</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </Panel>

      {isAdmin && (
        <ConfirmDialog
          open={!!pendingRemove}
          onOpenChange={(open) => !open && setPendingRemove(null)}
          title="Remove this assignment?"
          description={pendingRemove ? `${pendingRemove.staff_name || pendingRemove.staff_email} will no longer see ${pendingRemove.client_name || pendingRemove.client_email}.` : undefined}
          confirmLabel="Remove"
          busy={removing}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  )
}
