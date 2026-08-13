import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { inputCls } from './ui'
import { formatScopeAnswersSummary, type ScopeIntakeRow } from '../../../shared/scopeIntakePrefill'

export function ScopeIntakePicker({ onPick, label = 'Prefill from a scoped request' }: { onPick: (row: ScopeIntakeRow) => void; label?: string }) {
  const [rows, setRows] = useState<ScopeIntakeRow[]>([])
  const [selected, setSelected] = useState('')

  useEffect(() => {
    api.get<{ requests: ScopeIntakeRow[] }>('/admin/scope-intake')
      .then((res) => setRows(res.requests || []))
      .catch(() => setRows([]))
  }, [])

  if (!rows.length) return null
  const current = rows.find((row) => row.id === selected)

  return (
    <div className="rounded-lg border border-white/10 bg-white/[.02] p-3">
      <label className="block text-xs font-bold text-slate-400">{label}
        <select
          className={`${inputCls} mt-1`}
          value={selected}
          onChange={(e) => {
            const id = e.target.value
            setSelected(id)
            const row = rows.find((item) => item.id === id)
            if (row) onPick(row)
          }}
        >
          <option value="">Choose a recent public request…</option>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.contact_name} · {row.job_type.replace(/_/g, ' ')} · {row.city ? `${row.city}, ${row.state}` : row.email}
            </option>
          ))}
        </select>
      </label>
      {current && <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-slate-500">{formatScopeAnswersSummary(current)}</p>}
    </div>
  )
}
