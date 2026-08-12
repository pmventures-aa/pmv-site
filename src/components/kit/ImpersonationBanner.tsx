import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, LogOut, Timer } from 'lucide-react'
import { api } from '../../lib/api'

type Status = {
  active: boolean
  session_id?: string
  owner_email?: string
  owner_name?: string
  target_email?: string
  target_name?: string
  reason?: string
  started_at?: string
  expires_at?: string
}

const POLL_MS = 30_000

export function ImpersonationBanner() {
  const [status, setStatus] = useState<Status | null>(null)
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    try { setStatus(await api.get<Status>('/admin/impersonate/status')) } catch { setStatus(null) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { const t = setInterval(() => void load(), POLL_MS); return () => clearInterval(t) }, [load])
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t) }, [])

  if (!status?.active) return null

  const remainingMs = status.expires_at ? Math.max(0, new Date(status.expires_at).getTime() - Date.now()) : 0
  const remainingMin = Math.floor(remainingMs / 60_000)
  const remainingSec = Math.floor((remainingMs % 60_000) / 1000)

  async function end() {
    try { await api.post('/admin/impersonate/end') } catch {}
    // Force full reload so cached UI state doesn't linger with impersonation styling.
    window.location.reload()
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 border-b-2 border-rose-500 bg-gradient-to-r from-rose-600 via-rose-700 to-rose-800 px-4 py-2 text-white shadow-lg">
      <div className="flex items-center gap-3 min-w-0">
        <AlertTriangle size={16} className="shrink-0 text-yellow-200"/>
        <div className="min-w-0 text-xs sm:text-sm">
          <strong className="font-extrabold">IMPERSONATING</strong>{' '}
          <span className="font-semibold">{status.target_name || status.target_email}</span>
          <span className="hidden sm:inline"> · as owner {status.owner_email}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs">
        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 font-mono"><Timer size={11}/>{String(remainingMin).padStart(2,'0')}:{String(remainingSec).padStart(2,'0')}</span>
        <button onClick={() => void end()} className="inline-flex items-center gap-1.5 rounded-md bg-white text-rose-800 px-3 py-1 text-xs font-extrabold hover:bg-yellow-100"><LogOut size={12}/>Exit</button>
      </div>
      {/* Reserve visual space so page content isn't hidden behind the banner. */}
      <div aria-hidden="true" className="fixed inset-x-0 top-0 h-9 sm:h-10 pointer-events-none"/>
    </div>
  )
}
