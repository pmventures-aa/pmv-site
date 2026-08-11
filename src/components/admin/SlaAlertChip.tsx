import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'

// Top-bar SLA alert chip. Polls /admin/cases/over-sla-count every 20s and
// only renders when the count is > 0, so it stays out of the way when
// everything is healthy. Clicking it jumps straight to the Cases page
// filtered to over-SLA rows. Pulses red so the chip reads as urgent.

const POLL_MS = 20_000

export function SlaAlertChip() {
  const p = useAppPath()
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function pull() {
      try {
        const res = await api.get<{ count: number }>('/admin/cases/over-sla-count')
        if (!cancelled) setCount(res.count)
      } catch { /* endpoint may not be available for role-restricted routes */ }
    }
    void pull()
    const timer = window.setInterval(pull, POLL_MS)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  if (count <= 0) return null

  return (
    <Link
      to={p('cases')}
      className="pmv-sla-overdue-pulse inline-flex items-center gap-1.5 rounded-md border border-rose-400/60 bg-rose-500/[.14] px-2.5 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/25"
      title={`${count} case${count === 1 ? '' : 's'} over SLA`}
    >
      <AlertTriangle size={13} />
      Cases over SLA: {count}
    </Link>
  )
}
