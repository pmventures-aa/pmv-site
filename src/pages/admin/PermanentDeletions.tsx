import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Panel, EmptyState, inputCls, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { Dialog, DialogTrigger, DialogContent } from '../../components/kit/Dialog'
import { timeAgo } from '../../lib/activity'

const ENTITIES = [
  { key: 'inquiries', label: 'Leads' },
  { key: 'matters', label: 'Matters' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'documents', label: 'Documents' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'notes', label: 'Notes' },
] as const
type EntityKey = (typeof ENTITIES)[number]['key']

function titleOf(entity: EntityKey, row: any): string {
  switch (entity) {
    case 'inquiries':
      return `${row.name || row.email} — lead`
    case 'matters':
    case 'tasks':
      return row.title || 'Untitled'
    case 'invoices':
      return `$${((row.amount_cents ?? 0) / 100).toLocaleString()} invoice`
    case 'documents':
      return row.file_name || row.category || 'Document'
    case 'tickets':
      return row.subject || 'Untitled ticket'
    case 'notes':
      return (row.body || '').slice(0, 80) || 'Note'
  }
}

// Every staff/admin can archive; only an Owner can go the rest of the way
// to a permanent delete — see requireOwner in functions/_lib/mid.ts. This
// page (an Owner-only Settings tab) is where that second, heavier step
// happens: browse what's been archived across every entity, restore it, or
// permanently delete it after re-entering a password and a reason.
export default function PermanentDeletions() {
  const [entity, setEntity] = useState<EntityKey>('inquiries')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [target, setTarget] = useState<any | null>(null)
  const [showLedger, setShowLedger] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ records: any[] }>(`/admin/records/${entity}/archived`)
      setRecords(res.records)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [entity])

  useEffect(() => {
    load()
  }, [load])

  async function restore(id: string) {
    try {
      await api.patch(`/admin/records/${entity}/${id}/restore`)
      toast.success('Restored.')
      setRecords((rs) => rs.filter((r) => r.id !== id))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not restore this record.')
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-400">
          Records staff have archived, across every entity. Restore returns a record to active use. Permanently
          deleting a record cannot be undone — it requires your password and a reason, and is logged forever.
        </p>
        <button className={`${btnOutline} shrink-0 text-xs`} onClick={() => setShowLedger(true)}>
          View deletion log
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-white/10">
        {ENTITIES.map((e) => (
          <button
            key={e.key}
            onClick={() => setEntity(e.key)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              entity === e.key ? 'border-gold text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : loadError ? (
        <div className="space-y-2 text-sm text-slate-400">
          <p>Couldn't load archived {ENTITIES.find((e) => e.key === entity)?.label.toLowerCase()}.</p>
          <button onClick={load} className="text-gold hover:underline">
            Try again
          </button>
        </div>
      ) : records.length === 0 ? (
        <Panel>
          <EmptyState label={`No archived ${ENTITIES.find((e) => e.key === entity)?.label.toLowerCase()}.`} />
        </Panel>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <Panel key={r.id} className="flex flex-wrap items-center justify-between gap-3 !p-4">
              <div>
                <p className="text-sm font-medium text-white">{titleOf(entity, r)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Archived {timeAgo(r.archived_at)}
                  {r.archived_reason ? ` — “${r.archived_reason}”` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-4">
                <button onClick={() => restore(r.id)} className="text-xs font-medium text-gold hover:underline">
                  Restore
                </button>
                <button onClick={() => setTarget(r)} className="text-xs font-medium text-rose-300 hover:underline">
                  Delete permanently
                </button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {target && (
        <PermanentDeleteDialog
          entity={entity}
          record={target}
          onClose={() => setTarget(null)}
          onDeleted={() => {
            setRecords((rs) => rs.filter((r) => r.id !== target.id))
            setTarget(null)
          }}
        />
      )}

      {showLedger && <DeletionLedgerDialog onClose={() => setShowLedger(false)} />}
    </div>
  )
}

function PermanentDeleteDialog({
  entity,
  record,
  onClose,
  onDeleted,
}: {
  entity: EntityKey
  record: any
  onClose: () => void
  onDeleted: () => void
}) {
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.del(`/admin/records/${entity}/${record.id}/permanent`, { password, reason })
      toast.success('Permanently deleted.')
      onDeleted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this record.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Permanently delete this record?" description={`“${titleOf(entity, record)}” — this cannot be undone.`}>
        <form onSubmit={confirm} className="space-y-4">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Your password</span>
            <input className={inputCls} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Reason (required)</span>
            <textarea className={`${inputCls} min-h-[70px]`} required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className={btnOutline}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:opacity-60">
              {busy ? 'Deleting…' : 'Permanently delete'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface DeletionRow {
  id: string
  entity_type: string
  entity_id: string
  reason: string
  deleted_by_name: string | null
  deleted_by_email: string
  deleted_at: string
}

function DeletionLedgerDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<DeletionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ deletions: DeletionRow[] }>('/admin/permanent-deletions')
      .then((r) => setRows(r.deletions))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Permanent deletion log" description="Every record ever permanently deleted, by whom, and why. This list itself cannot be edited or cleared." className="max-w-2xl">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState label="No permanent deletions on record." />
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {rows.map((r) => (
              <div key={r.id} className="rounded-md border border-white/10 bg-navy-950 p-3 text-sm">
                <p className="text-white">
                  <span className="font-medium">{r.deleted_by_name || r.deleted_by_email}</span> permanently deleted a {r.entity_type.replace(/_/g, ' ')} record
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {timeAgo(r.deleted_at)} — “{r.reason}”
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
