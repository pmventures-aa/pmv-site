import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Unplug } from 'lucide-react'
import { api, ApiError } from '../../../lib/api'
import { Panel, btnPrimary, btnOutline } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'

type Status = {
  configured: boolean
  provider: 'google'
  account: {
    connected: boolean
    email?: string | null
    target_calendar_id?: string
    target_calendar_name?: string | null
    connected_at?: string
    last_synced_at?: string | null
    last_sync_status?: string
    status?: string
    needs_reconnect?: boolean
    last_error?: string | null
    last_sync_error?: string | null
  }
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const raw = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z'
  const ms = Date.now() - Date.parse(raw)
  if (!Number.isFinite(ms)) return 'never'
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'moments ago'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function CalendarSyncSettings() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null)
  // Consent happens in another tab, so nothing in this one knows it finished.
  const awaitingConsent = useRef(false)

  const load = useCallback(async () => {
    try {
      const s = await api.get<Status>('/admin/external-calendar/google/status')
      setStatus(s)
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // The status card used to be fetched once, on mount. Consent runs in a
  // separate tab, so coming back from Google left this tab rendering state
  // captured BEFORE the grant existed: it still said "Not connected" and the
  // only cure was knowing to reload the page. Re-read when this tab is looked
  // at again after a connect was started. Both events are needed: a closing
  // popup fires focus, and a phone switching tabs fires visibilitychange.
  useEffect(() => {
    function recheck() {
      if (!awaitingConsent.current) return
      if (document.visibilityState === 'hidden') return
      awaitingConsent.current = false
      void load()
    }
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', recheck)
    return () => {
      window.removeEventListener('focus', recheck)
      document.removeEventListener('visibilitychange', recheck)
    }
  }, [load])

  async function connect() {
    setBusy('connect')
    try {
      const res = await api.get<{ url: string }>('/admin/external-calendar/google/connect')
      awaitingConsent.current = true
      const popup = window.open(res.url, '_blank', 'noopener')
      // Mobile browsers routinely refuse window.open. Sending this tab to
      // Google is better than a Connect button that silently does nothing;
      // the visibility listener above picks the status back up on return.
      if (!popup) window.location.href = res.url
    } catch (err) {
      awaitingConsent.current = false
      toast.error(err instanceof ApiError ? err.message : 'Could not start Google connection.')
    } finally { setBusy(null) }
  }

  async function syncNow() {
    setBusy('sync')
    try {
      const res = await api.post<{ ok: boolean; note?: string }>('/admin/external-calendar/google/sync-now', {})
      toast.success(res.note || 'Sync started.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not run sync.')
    } finally { setBusy(null) }
  }

  async function disconnect() {
    setBusy('disconnect')
    try {
      await api.post('/admin/external-calendar/google/disconnect', {})
      toast.success('Google Calendar disconnected.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not disconnect.')
    } finally { setBusy(null) }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Panel>
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">External Calendars</p>
        <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">Calendar Sync</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Keep Pinnacle and your personal calendar in step. Pinnacle stays the authoritative system for matter, field, and client work; your external calendar reflects those events, and supported edits made externally reflect back.</p>

        <div className="mt-6 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : !status?.configured ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[.06] p-4 text-sm text-amber-200">
              Google Calendar OAuth is not configured on this deployment. Ask your owner to set the Google credentials before connecting an account.
            </div>
          ) : status.account.connected ? (
            <div className={`rounded-xl border p-4 ${
              status.account.needs_reconnect
                ? 'border-rose-400/30 bg-rose-400/[.06]'
                : 'border-emerald-300/25 bg-emerald-400/[.05]'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-xs font-bold uppercase tracking-[.14em] ${status.account.needs_reconnect ? 'text-rose-300' : 'text-emerald-300'}`}>
                    Google Calendar
                  </p>
                  {status.account.needs_reconnect ? (
                    <>
                      <p className="mt-1 truncate text-sm font-bold text-white">
                        Reconnect needed for {status.account.email || 'this account'}
                      </p>
                      {/* Says what it COSTS, not just that it broke. Freebusy
                          fails open, so a dead grant looks like an empty
                          calendar rather than an error. */}
                      <p className="mt-1 text-xs text-rose-200">
                        Your calendar is not blocking consultation slots right now, so times you are busy can still be booked.
                        Reconnect to restore it.
                      </p>
                      {status.account.last_error && (
                        <p className="mt-2 text-xs text-slate-400">Google said: {status.account.last_error}</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="mt-1 truncate text-sm font-bold text-white">Connected as {status.account.email || 'this account'}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Busy times block consultation slots · Calendar: {status.account.target_calendar_name || status.account.target_calendar_id || 'primary'} · Last checked: {timeAgo(status.account.last_synced_at)}
                      </p>
                      {status.account.last_sync_error && (
                        <p className="mt-2 text-xs text-rose-300">Last error: {status.account.last_sync_error}</p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {status.account.needs_reconnect ? (
                    <button type="button" onClick={connect} disabled={busy === 'connect'} className={btnPrimary}>
                      {busy === 'connect' ? <Loader2 size={14} className="animate-spin" /> : null} Reconnect
                    </button>
                  ) : (
                    <button type="button" onClick={syncNow} disabled={busy === 'sync'} className={btnOutline}>
                      {busy === 'sync' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync now
                    </button>
                  )}
                  <button type="button" onClick={disconnect} disabled={busy === 'disconnect'} className={btnOutline}>
                    <Unplug size={14} /> Disconnect
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Google Calendar</p>
                  <p className="mt-1 text-sm text-white">Not connected</p>
                  <p className="mt-1 text-xs text-slate-500">Connect your Google account so Pinnacle events land on your calendar and supported external edits flow back.</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={connect} disabled={busy === 'connect'} className={btnPrimary}>
                    {busy === 'connect' ? <Loader2 size={14} className="animate-spin" /> : null} Connect
                  </button>
                  {/* Always available, so a connection that already succeeded
                      is never hidden behind an event that did not fire. */}
                  <button type="button" onClick={() => { void load() }} className={btnOutline}>
                    <RefreshCw size={14} /> Recheck
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">What syncs</p>
        <ul className="mt-4 space-y-3 text-sm leading-5 text-slate-400">
          <li><strong className="text-slate-200">Pinnacle stays authoritative</strong> for matter appointments, field jobs, assignments, client appointments, and scheduled work.</li>
          <li><strong className="text-slate-200">External edits</strong> can update start/end time, title, location, or cancellation - operational links (matter, client, property, provider) stay Pinnacle-owned.</li>
          <li><strong className="text-slate-200">Reservation iCal</strong> remains read-only for Airbnb, VRBO, and other booking platforms - we import check-in / checkout timing, never write back.</li>
        </ul>
      </Panel>
    </div>
  )
}
