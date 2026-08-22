import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, btnPrimary, btnOutline, inputCls, Tag } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useAuth } from '../../lib/auth'
import { WEEKDAY_LABELS, formatHhMm, parseHhMm } from '../../../shared/availability'
import {
  WEEKDAY_INITIALS, blockingIdsForDay, dayBlockState, firstOfMonth,
  groupConsecutive, isPast, monthGrid, shiftMonth, todayKeyIn, type DayRange,
} from '../../../shared/dayBlocking'

// A provider's own working hours.
//
// The point of this page: we never look at anyone's personal calendar. The
// provider tells us when they work, and that is the only thing dispatch reads.
// It is the respectful design and the one that does not require us to hold
// OAuth tokens for every person in the network.

interface Window { weekday: number; startMinute: number; endMinute: number }
interface Blackout { id: string; startsAt: string; endsAt: string; reason?: string | null }
interface Payload {
  schedule: { id: string; vendor_user_id: string; timezone: string; active: boolean }
  windows: Window[]
  blackouts: Blackout[]
  configured: boolean
}

const DEFAULT_START = 9 * 60
const DEFAULT_END = 17 * 60

function dayStartIso(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toISOString()
}

export default function ProviderAvailability() {
  const { user } = useAuth()
  const vendorUserId = user?.id || ''
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!vendorUserId) return
    try {
      setData(await api.get<Payload>(`/admin/provider-availability/${vendorUserId}`))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your availability.')
    } finally {
      setLoading(false)
    }
  }, [vendorUserId])
  useEffect(() => { void load() }, [load])

  const byDay = useMemo(() => {
    const map = new Map<number, Window[]>()
    for (const w of data?.windows ?? []) {
      if (!map.has(w.weekday)) map.set(w.weekday, [])
      map.get(w.weekday)!.push(w)
    }
    return map
  }, [data])

  async function saveWindows(next: Window[]) {
    setSaving(true)
    setError('')
    try {
      const res = await api.put<Payload>(`/admin/provider-availability/${vendorUserId}/windows`, {
        windows: next.map((w) => ({ weekday: w.weekday, start: w.startMinute, end: w.endMinute })),
      })
      setData(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save those hours.')
    } finally {
      setSaving(false)
    }
  }

  function toggleDay(weekday: number) {
    const current = data?.windows ?? []
    const has = current.some((w) => w.weekday === weekday)
    void saveWindows(has
      ? current.filter((w) => w.weekday !== weekday)
      : [...current, { weekday, startMinute: DEFAULT_START, endMinute: DEFAULT_END }])
  }

  function setTime(weekday: number, index: number, field: 'startMinute' | 'endMinute', value: string) {
    const minutes = parseHhMm(value)
    if (minutes === null) return
    const current = data?.windows ?? []
    let seen = -1
    void saveWindows(current.map((w) => {
      if (w.weekday !== weekday) return w
      seen += 1
      return seen === index ? { ...w, [field]: minutes } : w
    }))
  }

  async function addTimeOff(ranges: DayRange[], reason: string) {
    setSaving(true)
    try {
      for (const range of ranges) {
        await api.post(`/admin/provider-availability/${vendorUserId}/time-off`, {
          startsAt: dayStartIso(range.from), endsAt: dayStartIso(range.toExclusive), reason,
        })
      }
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that time off.')
    } finally {
      setSaving(false)
    }
  }

  async function removeTimeOff(ids: string[]) {
    setSaving(true)
    try {
      for (const id of ids) await api.del(`/admin/provider-availability/${vendorUserId}/time-off/${id}`)
      await load()
    } catch {
      setError('Could not free that day.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Panel><p className="text-sm text-slate-400">Loading your availability...</p></Panel>
  if (!data) return <EmptyState label={error || 'Your availability is not available right now.'} />

  return (
    <div className="space-y-4">
      <PageIntro
        section="Delivery"
        kicker="Your work"
        title="When you are available"
        subtitle="We never look at your personal calendar. These hours are the only thing we schedule against, so keep them true and you will only be offered work you can take."
      />

      {!data.configured && (
        <Panel className="border-gold/25 bg-gold/[.05]">
          <p className="text-sm font-bold text-white">You have not set any hours yet.</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            Until you do, we cannot tell whether an assignment fits your week, so you may be asked
            about work at times that do not suit you. Turn on the days you work below.
          </p>
        </Panel>
      )}

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white">Your usual week</h3>
          <Tag tone="slate">Times in {data.schedule.timezone}</Tag>
        </div>
        <div className="mt-4 space-y-2">
          {WEEKDAY_LABELS.map((label, weekday) => {
            const windows = byDay.get(weekday) ?? []
            const on = windows.length > 0
            return (
              <div key={label} className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${on ? 'border-white/12 bg-white/[.025]' : 'border-white/[.06] bg-white/[.01]'}`}>
                <button
                  type="button" onClick={() => toggleDay(weekday)} disabled={saving}
                  className={`min-w-[7.5rem] rounded-md border px-3 py-1.5 text-left text-xs font-bold transition ${on ? 'border-sea-400/40 bg-sea-400/10 text-sea-300' : 'border-white/12 text-slate-500 hover:text-slate-300'}`}
                >
                  {label}
                </button>
                {on ? windows.map((w, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="time" className={`${inputCls} w-32`} value={formatHhMm(w.startMinute)}
                      onChange={(e) => setTime(weekday, index, 'startMinute', e.target.value)}
                    />
                    <span className="text-xs text-slate-500">to</span>
                    <input
                      type="time" className={`${inputCls} w-32`} value={formatHhMm(w.endMinute)}
                      onChange={(e) => setTime(weekday, index, 'endMinute', e.target.value)}
                    />
                  </div>
                )) : <span className="text-xs text-slate-600">Not working</span>}
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel>
        <h3 className="text-sm font-bold text-white">Time off</h3>
        <p className="mt-1.5 text-xs leading-5 text-slate-400">
          Days you are away, on top of your usual week. Click a day to block it, click a blocked day to free it.
        </p>
        <div className="mt-4">
          <TimeOffCalendar
            timezone={data.schedule.timezone}
            blackouts={data.blackouts}
            busy={saving}
            onBlock={addTimeOff}
            onFree={removeTimeOff}
          />
        </div>
        <div className="mt-4 space-y-2">
          {data.blackouts.length === 0 && <EmptyState label="No time off booked." section="Delivery" />}
          {data.blackouts.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2.5">
              <p className="text-xs font-bold text-white">
                {new Date(b.startsAt).toLocaleDateString()} to {new Date(b.endsAt).toLocaleDateString()}
                {b.reason && <span className="mt-0.5 block font-normal text-slate-400">{b.reason}</span>}
              </p>
              <button type="button" onClick={() => void removeTimeOff([b.id])} className="rounded-md p-1.5 text-slate-500 hover:text-red-300" aria-label="Remove time off">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <FeedPanel />

      {error && <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-400/[.06] px-4 py-3 text-sm text-rose-200">{error}</p>}
    </div>
  )
}

/** The same click-a-day calendar HQ uses for its own time off. */
function TimeOffCalendar({
  timezone, blackouts, busy, onBlock, onFree,
}: {
  timezone: string
  blackouts: Blackout[]
  busy: boolean
  onBlock: (ranges: DayRange[], reason: string) => Promise<void>
  onFree: (ids: string[]) => Promise<void>
}) {
  const today = todayKeyIn(timezone)
  const [month, setMonth] = useState(() => firstOfMonth(today))
  const [picked, setPicked] = useState<string[]>([])
  const [reason, setReason] = useState('')

  const grid = useMemo(() => monthGrid(month), [month])
  const ranges = useMemo(() => groupConsecutive(picked), [picked])
  const pickedSet = useMemo(() => new Set(picked), [picked])

  function toggle(dateKey: string) {
    if (dayBlockState(dateKey, blackouts, timezone) !== 'free') {
      void onFree(blockingIdsForDay(dateKey, blackouts, timezone))
      return
    }
    setPicked((prev) => prev.includes(dateKey) ? prev.filter((k) => k !== dateKey) : [...prev, dateKey])
  }

  return (
    <div className="rounded-lg border border-white/[.08] bg-white/[.015] p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded-md p-1.5 text-slate-400 hover:text-gold" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <p className="text-xs font-bold text-white">{grid.label}</p>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="rounded-md p-1.5 text-slate-400 hover:text-gold" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i} className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-600">{initial}</span>
        ))}
        {grid.weeks.flat().map((dateKey, i) => {
          if (!dateKey) return <span key={`pad-${i}`} />
          const past = isPast(dateKey, timezone)
          const state = dayBlockState(dateKey, blackouts, timezone)
          const isPicked = pickedSet.has(dateKey)
          const tone = state === 'full'
            ? 'border-gold/50 bg-gold/20 text-gold'
            : state === 'partial'
              ? 'border-gold/25 bg-gold/[.07] text-slate-200'
              : isPicked
                ? 'border-gold/60 bg-gold/10 text-white'
                : 'border-white/[.08] bg-white/[.02] text-slate-300 hover:border-white/25'
          return (
            <button
              key={dateKey} type="button" disabled={past || busy} onClick={() => toggle(dateKey)}
              aria-pressed={isPicked || state !== 'free'}
              aria-label={`${dateKey}${state === 'full' ? ', time off' : ''}`}
              className={`min-h-9 rounded-md border text-xs font-bold tabular-nums transition ${tone} ${past ? 'cursor-not-allowed opacity-25' : ''}`}
            >
              {Number(dateKey.slice(8))}
            </button>
          )
        })}
      </div>
      {picked.length > 0 && (
        <div className="mt-3 border-t border-white/[.08] pt-3">
          <p className="text-xs text-slate-300">{picked.length} day{picked.length === 1 ? '' : 's'} selected</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input className={inputCls} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <button type="button" className={btnOutline} onClick={() => setPicked([])}>Clear</button>
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => { void onBlock(ranges, reason.trim()); setPicked([]); setReason('') }}>
                <Plus className="h-3.5 w-3.5" /> Book time off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Subscribe once, see everything.
 *
 * The invites cover each assignment as it happens; this is the standing
 * picture in whatever calendar the provider already uses. The URL is the
 * credential, so it is shown only to its owner and can be rotated - which is
 * what revoke has to mean when there is no login in front of it.
 */
function FeedPanel() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get<{ url: string }>('/admin/provider-calendar-feed')
      .then((r) => setUrl(r.url))
      .catch(() => { /* the rest of the page still works without it */ })
  }, [])

  async function rotate() {
    setBusy(true)
    try {
      const res = await api.post<{ url: string }>('/admin/provider-calendar-feed/rotate', {})
      setUrl(res.url)
      toast.success('New link created. The old one has stopped updating.')
    } catch {
      toast.error('Could not create a new link.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard access is refused in plenty of ordinary situations, and the
      // link is on screen as selectable text.
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }

  if (!url) return null

  return (
    <Panel>
      <h3 className="text-sm font-bold text-white">See your PMV work in your own calendar</h3>
      <p className="mt-1.5 text-xs leading-5 text-slate-400">
        Add this link once in Google Calendar, Apple Calendar, or Outlook and every assignment
        appears there automatically. Nothing to install, and we still never read your calendar.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-navy-950 px-3 py-2 text-[11px] text-slate-300">{url}</code>
        <button type="button" className={btnOutline} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        Treat it like a password: anyone with the link can see your assignments. If it gets out,
        create a new one and re-add it in your calendar.
      </p>
      <button type="button" className={`${btnOutline} mt-2`} disabled={busy} onClick={() => void rotate()}>
        {busy ? 'Working...' : 'Create a new link'}
      </button>
    </Panel>
  )
}
