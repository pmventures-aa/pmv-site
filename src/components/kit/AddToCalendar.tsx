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

  async function loadFeed() {
    setError('')
    try {
      const res = await fetch(`/api${feedPath}`, { credentials: 'include' })
      const data = await res.json().catch(() => ({})) as { error?: string; webcal_url?: string; https_url?: string }
      if (!res.ok) throw new Error(data.error || 'Could not create a calendar link.')
      setWebcal(data.webcal_url || '')
      setHttpsUrl(data.https_url || '')
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a calendar link.')
    }
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

  return (
    <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Apple Calendar</p>
          <p className="mt-1 text-sm text-slate-300">Add one appointment as a file, or subscribe so new Pinnacle times show up automatically.</p>
        </div>
        <button type="button" onClick={() => void loadFeed()} className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/15">
          Subscribe in Apple Calendar
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      {open && webcal && (
        <div className="mt-4 space-y-3 text-xs leading-5 text-slate-400">
          <p>On iPhone or iPad: Calendar → Calendars → Add Calendar → Add Subscription Calendar, then paste the link. On a Mac: File → New Calendar Subscription.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="min-h-10 flex-1 rounded-lg border border-white/12 bg-white/[.04] px-3 text-[12px] text-slate-200" readOnly value={webcal} />
            <button type="button" onClick={() => void copy(webcal)} className="rounded-lg border border-white/15 px-3 py-2 font-bold text-white hover:border-gold/40 hover:text-gold">{copied ? 'Copied' : 'Copy link'}</button>
            <a href={webcal} className="rounded-lg bg-gold px-3 py-2 text-center font-bold text-navy-950 hover:bg-gold-300">Open in Calendar</a>
          </div>
          <p className="text-[11px] text-slate-500">If your device wants an https link instead, use {httpsUrl}.</p>
        </div>
      )}
    </div>
  )
}
