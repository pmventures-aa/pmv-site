import { useState } from 'react'
import { buildIcs, type CalendarEvent } from '../../../shared/ics'

export function downloadIcsFile(ics: string, filename: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function AddToCalendarButton({ event, className = '' }: { event: CalendarEvent; className?: string }) {
  return (
    <button
      type="button"
      className={className || 'text-xs font-semibold text-gold hover:underline'}
      onClick={() => downloadIcsFile(buildIcs([event], 'Pinnacle'), `${event.id}.ics`)}
    >
      Add to Apple Calendar
    </button>
  )
}

export function CalendarSubscribePanel({ feedPath }: { feedPath: string }) {
  const [open, setOpen] = useState(false)
  const [webcal, setWebcal] = useState('')
  const [httpsUrl, setHttpsUrl] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function loadFeed() {
    setError(''); setBusy(true)
    try {
      const res = await fetch(`/api${feedPath}`, { credentials: 'include' })
      const data = await res.json().catch(() => ({})) as { error?: string; webcal_url?: string; https_url?: string }
      if (!res.ok) throw new Error(data.error || `Server responded ${res.status}.`)
      if (!data.webcal_url) throw new Error('The server did not return a subscription link.')
      setWebcal(data.webcal_url)
      setHttpsUrl(data.https_url || '')
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a calendar link.')
    } finally { setBusy(false) }
  }

  // Fallback: pull the current appointments as a one-shot .ics download
  // when the auto-subscribe endpoint isn't available. Uses the /api base
  // path that the subscribe call already uses so the surface is consistent.
  async function downloadOneOff() {
    setError(''); setBusy(true)
    try {
      const listPath = feedPath.replace(/\/feed$/, '')
      const res = await fetch(`/api${listPath}`, { credentials: 'include' })
      const data = await res.json().catch(() => ({})) as { appointments?: Array<{ id: string; title: string; starts_at: string; status?: string }> }
      if (!res.ok) throw new Error('Could not load your appointments right now.')
      const events = (data.appointments || []).map((a) => ({
        id: a.id,
        title: a.title || 'Pinnacle appointment',
        startsAt: a.starts_at,
        description: a.status ? `Pinnacle appointment (${a.status.replace(/_/g, ' ')})` : 'Pinnacle appointment',
      }))
      if (!events.length) throw new Error('You have no upcoming appointments to add.')
      const { buildIcs } = await import('../../../shared/ics')
      downloadIcsFile(buildIcs(events, 'Pinnacle'), 'pinnacle-appointments.ics')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download appointments.')
    } finally { setBusy(false) }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Copy failed. Select the link and copy it manually.')
    }
  }

  async function rotateFeed() {
    if (!confirm('Replace this calendar link? The old subscription will stop updating.')) return
    setError(''); setBusy(true)
    try {
      const res = await fetch(`/api${feedPath}/rotate`, { method: 'POST', credentials: 'include' })
      const data = await res.json().catch(() => ({})) as { error?: string; webcal_url?: string; https_url?: string }
      if (!res.ok || !data.webcal_url) throw new Error(data.error || 'Could not replace the calendar link.')
      setWebcal(data.webcal_url); setHttpsUrl(data.https_url || ''); setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not replace the calendar link.')
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Apple Calendar</p>
          <p className="mt-1 text-sm text-slate-300">Add one appointment as a file, or subscribe so new Pinnacle times show up automatically.</p>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button type="button" disabled={busy} onClick={() => void loadFeed()} className="min-h-11 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/15 disabled:opacity-60">
            {busy ? 'Working...' : 'Subscribe in Apple Calendar'}
          </button>
          <button type="button" disabled={busy} onClick={() => void downloadOneOff()} className="min-h-11 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white hover:border-gold/40 hover:text-gold disabled:opacity-60">
            Download .ics file
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-rose-300">{error}</p>
          <p className="text-[11px] text-slate-500">You can still use “Download .ics file” to add your current appointments while the subscription is unavailable.</p>
        </div>
      )}
      {open && webcal && (
        <div className="mt-4 space-y-3 text-xs leading-5 text-slate-400">
          <p>On iPhone or iPad: Calendar → Calendars → Add Calendar → Add Subscription Calendar, then paste the link. On a Mac: File → New Calendar Subscription.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="min-h-10 flex-1 rounded-lg border border-white/12 bg-white/[.04] px-3 text-[12px] text-slate-200" readOnly value={webcal} />
            <button type="button" onClick={() => void copy(webcal)} className="rounded-lg border border-white/15 px-3 py-2 font-bold text-white hover:border-gold/40 hover:text-gold">{copied ? 'Copied' : 'Copy link'}</button>
            <a href={webcal} className="rounded-lg bg-gold px-3 py-2 text-center font-bold text-navy-950 hover:bg-gold-300">Open in Calendar</a>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-all text-[11px] text-slate-500">If your device wants an https link instead, use {httpsUrl}.</p>
            <button type="button" disabled={busy} onClick={() => void rotateFeed()} className="text-[11px] font-bold text-slate-500 hover:text-rose-300">Replace private link</button>
          </div>
        </div>
      )}
    </div>
  )
}
