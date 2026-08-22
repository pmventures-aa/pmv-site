import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Panel, EmptyState, Skeleton, inputCls, btnPrimary, btnOutline, Tag } from '../../../components/admin/ui'
import { api, ApiError } from '../../../lib/api'
import {
  WEEKDAY_LABELS,
  addDaysToDateKey,
  dateKeyWeekday,
  defaultBusinessWindows,
  formatHhMm,
  parseHhMm,
  utcMsToDateKey,
  zonedWallTimeToUtcMs,
  type AvailabilityWindow,
} from '../../../../shared/availability'

// Editor for the public consultation schedule.
//
// The weekly grid is edited as wall-clock times in the schedule's own
// timezone, which is exactly how it is stored. No instant conversion happens
// in this component: the engine does that per day at read time, so a schedule
// stays correct across daylight saving without anything being regenerated.

interface ZoomStatus {
  configured: boolean
  hasAccountId: boolean
  hasClientId: boolean
  hasClientSecret: boolean
  hostEmail: string
}

interface Blackout { id: string; startsAt: string; endsAt: string; reason?: string | null }

const MINUTES_PER_DAY = 24 * 60

// The short address to hand out. /consultation still answers and is what the
// site links internally; this is the one that fits in a signature or a text.
const BOOKING_LINK = 'https://pinnaclemanagementventures.com/book'

/** Local midnight of dateKey IN THE SCHEDULE'S ZONE, as an ISO instant. */
function dayStartIso(dateKey: string, timezone: string): string {
  return new Date(zonedWallTimeToUtcMs(dateKey, 0, timezone)).toISOString()
}

/**
 * A datetime-local value ("2026-08-25T14:30") as an instant in the schedule's
 * zone. new Date() on that string reads it as the BROWSER's wall time, which
 * silently shifts the block whenever the admin is not sitting in the
 * schedule's timezone.
 */
function wallTimeToIso(value: string, timezone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  const minuteOfDay = Number(match[2]) * 60 + Number(match[3])
  if (!Number.isFinite(minuteOfDay) || minuteOfDay >= MINUTES_PER_DAY) return null
  return new Date(zonedWallTimeToUtcMs(match[1], minuteOfDay, timezone)).toISOString()
}

/** Today in the schedule's zone, which is not always today in the browser's. */
function todayKey(timezone: string): string {
  return utcMsToDateKey(Date.now(), timezone)
}

/** The next dateKey on the given weekday, or today when today already is. */
function nextWeekdayKey(timezone: string, weekday: number): string {
  const start = todayKey(timezone)
  const delta = (weekday - dateKeyWeekday(start) + 7) % 7
  return addDaysToDateKey(start, delta)
}

/**
 * How a stored blackout reads back to a human, in the schedule's zone.
 *
 * Whole days are by far the common case and deserve to look like days rather
 * than a pair of midnight timestamps. Anything else falls back to times.
 */
function describeBlackout(b: Blackout, timezone: string): string {
  const startMs = Date.parse(b.startsAt)
  const endMs = Date.parse(b.endsAt)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Invalid dates'

  const startKey = utcMsToDateKey(startMs, timezone)
  const wholeDays = startMs === zonedWallTimeToUtcMs(startKey, 0, timezone)
    && endMs === zonedWallTimeToUtcMs(utcMsToDateKey(endMs, timezone), 0, timezone)
    && endMs > startMs

  const day = (ms: number) => new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: timezone,
  }).format(new Date(ms))
  const time = (ms: number) => new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone,
  }).format(new Date(ms))

  if (!wholeDays) return `${time(startMs)} to ${time(endMs)}`
  // The stored end is midnight of the day AFTER the last blocked day.
  const lastKey = addDaysToDateKey(utcMsToDateKey(endMs, timezone), -1)
  const lastMs = zonedWallTimeToUtcMs(lastKey, 0, timezone)
  return lastKey === startKey
    ? `${day(startMs)}, all day`
    : `${day(startMs)} to ${day(lastMs)}, all day`
}

interface Schedule {
  id: string
  slug: string
  name: string
  description: string | null
  hostUserId: string | null
  timezone: string
  slotMinutes: number
  incrementMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minNoticeMinutes: number
  maxAdvanceDays: number
  eventType: string
  locationType: string
  publicBookable: boolean
  active: boolean
  windows: AvailabilityWindow[]
  blackouts: Blackout[]
}

interface AccessUser { id: string; full_name?: string | null; email: string; role: string }

interface PreviewResponse {
  range: { from: string; to: string }
  timezone: string
  busyCount: number
  slotCount: number
  days: Array<{ dateKey: string; slots: Array<{ startsAt: string }> }>
}

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC',
]

const NOTICE_CHOICES: Array<[number, string]> = [
  [0, 'No minimum'], [60, '1 hour'], [240, '4 hours'], [720, '12 hours'],
  [1440, '24 hours'], [2880, '2 days'], [4320, '3 days'],
]

const label = (u: AccessUser) => u.full_name?.trim() || u.email

export default function ConsultationBookingSettings() {
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [users, setUsers] = useState<AccessUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [blackoutDraft, setBlackoutDraft] = useState({ startsAt: '', endsAt: '', reason: '' })
  const [dayDraft, setDayDraft] = useState({ date: '', days: 1, reason: '' })
  const [zoom, setZoom] = useState<ZoomStatus | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<{ schedules: Schedule[]; zoom?: ZoomStatus }>('/admin/availability/schedules')
      setSchedule(res.schedules.find((s) => s.slug === 'consultation') ?? res.schedules[0] ?? null)
      setZoom(res.zoom ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the booking schedule.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    // The host picker is a convenience; a failure here must not block editing
    // the hours, so it stays silent.
    api.get<{ users: AccessUser[] }>('/admin/access-control')
      .then((r) => setUsers((r.users || []).filter((u) => u.role === 'staff' || u.role === 'admin')))
      .catch(() => {})
  }, [])

  const patch = (changes: Partial<Schedule>) => setSchedule((s) => (s ? { ...s, ...changes } : s))

  const windowsByDay = useMemo(() => {
    const map = new Map<number, AvailabilityWindow[]>()
    for (const w of schedule?.windows ?? []) {
      const list = map.get(w.weekday) ?? []
      list.push(w)
      map.set(w.weekday, list)
    }
    return map
  }, [schedule?.windows])

  const setWindows = (next: AvailabilityWindow[]) =>
    patch({ windows: [...next].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute) })

  const addWindow = (weekday: number) =>
    setWindows([...(schedule?.windows ?? []), { weekday, startMinute: 9 * 60, endMinute: 17 * 60 }])

  const removeWindow = (weekday: number, index: number) => {
    const remaining = (schedule?.windows ?? []).filter((w) => {
      if (w.weekday !== weekday) return true
      return (windowsByDay.get(weekday) ?? []).indexOf(w) !== index
    })
    setWindows(remaining)
  }

  const editWindow = (weekday: number, index: number, field: 'startMinute' | 'endMinute', value: string) => {
    const minutes = parseHhMm(value)
    if (minutes === null) return
    const dayWindows = windowsByDay.get(weekday) ?? []
    const target = dayWindows[index]
    if (!target) return
    setWindows((schedule?.windows ?? []).map((w) => (w === target ? { ...w, [field]: minutes } : w)))
  }

  async function save() {
    if (!schedule) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const res = await api.put<{ schedule: Schedule }>(`/admin/availability/schedules/${schedule.id}`, {
        name: schedule.name,
        description: schedule.description,
        hostUserId: schedule.hostUserId,
        timezone: schedule.timezone,
        slotMinutes: schedule.slotMinutes,
        incrementMinutes: schedule.incrementMinutes,
        bufferBeforeMinutes: schedule.bufferBeforeMinutes,
        bufferAfterMinutes: schedule.bufferAfterMinutes,
        minNoticeMinutes: schedule.minNoticeMinutes,
        maxAdvanceDays: schedule.maxAdvanceDays,
        publicBookable: schedule.publicBookable,
        active: schedule.active,
        windows: schedule.windows,
      })
      setSchedule(res.schedule)
      setNotice('Saved.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the schedule.')
    } finally {
      setSaving(false)
    }
  }

  async function runPreview() {
    if (!schedule) return
    setPreviewing(true)
    try {
      setPreview(await api.get<PreviewResponse>(`/admin/availability/schedules/${schedule.id}/preview`))
    } catch {
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }

  /**
   * Block whole days, resolved in the SCHEDULE'S timezone rather than the
   * browser's. new Date('2026-08-25T00:00') means midnight where the admin is
   * standing, so blocking a day from a different timezone used to shift the
   * block by the offset between them and leave part of the real day bookable.
   */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(BOOKING_LINK)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard access is refused in plenty of ordinary situations. The link
      // is on screen as selectable text, so this is a convenience failing, not
      // the feature failing.
      setError('Could not copy. Select the link and copy it by hand.')
    }
  }

  async function blockDays(dateKey: string, days: number, reason: string) {
    if (!schedule || !dateKey || days < 1) return
    setError('')
    try {
      const res = await api.post<{ blackout: Blackout }>(`/admin/availability/schedules/${schedule.id}/blackouts`, {
        startsAt: dayStartIso(dateKey, schedule.timezone),
        endsAt: dayStartIso(addDaysToDateKey(dateKey, days), schedule.timezone),
        reason,
      })
      patch({ blackouts: [...schedule.blackouts, res.blackout] })
      setDayDraft({ date: '', days: 1, reason: '' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not block those days.')
    }
  }

  async function addBlackout() {
    if (!schedule || !blackoutDraft.startsAt || !blackoutDraft.endsAt) return
    setError('')
    // Read in the schedule's zone, matching the day blocks above and the label
    // on the field. Treating it as the browser's zone made the same input mean
    // different hours depending on where the admin happened to be.
    const startsAt = wallTimeToIso(blackoutDraft.startsAt, schedule.timezone)
    const endsAt = wallTimeToIso(blackoutDraft.endsAt, schedule.timezone)
    if (!startsAt || !endsAt) { setError('Enter a valid start and end time.'); return }
    try {
      const res = await api.post<{ blackout: Blackout }>(`/admin/availability/schedules/${schedule.id}/blackouts`, {
        startsAt, endsAt, reason: blackoutDraft.reason,
      })
      patch({ blackouts: [...schedule.blackouts, res.blackout] })
      setBlackoutDraft({ startsAt: '', endsAt: '', reason: '' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that time off.')
    }
  }

  async function removeBlackout(id: string) {
    if (!schedule) return
    try {
      await api.del(`/admin/availability/blackouts/${id}`)
      patch({ blackouts: schedule.blackouts.filter((b) => b.id !== id) })
    } catch {
      setError('Could not remove that time off.')
    }
  }

  if (loading) return <Panel><Skeleton className="h-4 w-48" /><Skeleton className="mt-4 h-24 w-full" /></Panel>
  if (!schedule) return <Panel><p className="text-sm text-slate-400">{error || 'No booking schedule is configured yet.'}</p></Panel>

  const hasWindows = schedule.windows.length > 0

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">Public Booking</p>
            <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">Consultation scheduling</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Times below are wall-clock times in the schedule timezone, so they stay correct through
              daylight saving on their own.
            </p>
          </div>
          <Tag tone={schedule.publicBookable && schedule.active ? 'green' : 'slate'}>
            {schedule.publicBookable && schedule.active ? 'Live' : 'Not published'}
          </Tag>
        </div>

        <div className="mt-6 rounded-xl border border-white/[.08] bg-white/[.02] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Your booking link</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="min-w-0 break-all text-sm font-bold text-white">{BOOKING_LINK}</code>
            <button type="button" onClick={() => void copyLink()} className={`${btnOutline} min-h-9 shrink-0`}>
              <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Share this anywhere. Visitors pick a time and choose a video call or a phone call.
            {' '}
            {schedule.publicBookable && schedule.active
              ? 'It is live now.'
              : 'It shows a phone number instead of times until you publish below.'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">/consultation still works and is what the site links to internally.</p>
        </div>

        <div className="mt-4 rounded-xl border border-white/[.08] bg-white/[.02] p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox" className="mt-1 accent-gold" checked={schedule.publicBookable}
              onChange={(e) => patch({ publicBookable: e.target.checked })}
            />
            <span className="text-sm leading-6 text-slate-300">
              <strong className="text-white">Accept bookings from the public site.</strong>
              <span className="mt-1 block text-xs text-slate-400">
                While this is off, /consultation shows a phone number instead of a slot grid. At least one
                weekly window is required before this can be turned on.
              </span>
            </span>
          </label>
          {!hasWindows && schedule.publicBookable && (
            <p className="mt-3 text-xs text-amber-200">Add a weekly window below before saving, or publishing will be refused.</p>
          )}
        </div>
      </Panel>

      <Panel>
        <h3 className="text-sm font-bold text-white">Who the call is with</h3>
        <p className="mt-1.5 text-xs leading-5 text-slate-400">
          The host's Pinnacle calendar blocks slots automatically: anything assigned to them in the
          calendar makes that time unbookable. Leave unassigned and bookings are instead blocked only by
          other consultations.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-300">
            Host
            <select
              className={`${inputCls} mt-2`} value={schedule.hostUserId ?? ''}
              onChange={(e) => patch({ hostUserId: e.target.value || null })}
            >
              <option value="">Unassigned (staff triage)</option>
              {users.map((u) => <option key={u.id} value={u.id}>{label(u)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-300">
            Schedule timezone
            <select
              className={`${inputCls} mt-2`} value={schedule.timezone}
              onChange={(e) => patch({ timezone: e.target.value })}
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
        </div>
      </Panel>

      <Panel>
        <h3 className="text-sm font-bold text-white">Weekly hours</h3>
        <p className="mt-1.5 text-xs leading-5 text-slate-400">
          Times are in {schedule.timezone.replace(/_/g, ' ')}. Add a second block on a day to take a break
          in the middle of it.
        </p>
        <div className="mt-4 space-y-2">
          {WEEKDAY_LABELS.map((dayName, weekday) => {
            const dayWindows = windowsByDay.get(weekday) ?? []
            return (
              <div key={dayName} className="rounded-lg border border-white/[.08] bg-white/[.02] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="w-24 text-xs font-bold text-white">{dayName}</p>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {dayWindows.length === 0 && <span className="text-xs text-slate-500">Closed</span>}
                    {dayWindows.map((w, index) => (
                      <div key={`${weekday}-${index}`} className="flex items-center gap-1.5">
                        <input
                          type="time" className={`${inputCls} w-28`} value={formatHhMm(w.startMinute)}
                          onChange={(e) => editWindow(weekday, index, 'startMinute', e.target.value)}
                          aria-label={`${dayName} start time`}
                        />
                        <span className="text-xs text-slate-500">to</span>
                        <input
                          type="time" className={`${inputCls} w-28`} value={formatHhMm(w.endMinute)}
                          onChange={(e) => editWindow(weekday, index, 'endMinute', e.target.value)}
                          aria-label={`${dayName} end time`}
                        />
                        <button
                          type="button" onClick={() => removeWindow(weekday, index)}
                          className="rounded-md p-1.5 text-slate-500 hover:text-red-300"
                          aria-label={`Remove ${dayName} hours`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button" onClick={() => addWindow(weekday)}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 hover:border-gold/40 hover:text-white"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <button type="button" onClick={() => setWindows(defaultBusinessWindows())} className="mt-3 text-xs text-slate-400 underline">
          Reset to weekdays, 9:00 to 17:00
        </button>
      </Panel>

      <Panel>
        <h3 className="text-sm font-bold text-white">Call length and spacing</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-bold text-slate-300">
            Call length (minutes)
            <input
              type="number" min={5} max={480} step={5} className={`${inputCls} mt-2`} value={schedule.slotMinutes}
              onChange={(e) => patch({ slotMinutes: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs font-bold text-slate-300">
            Offer a start every (minutes)
            <input
              type="number" min={5} max={480} step={5} className={`${inputCls} mt-2`} value={schedule.incrementMinutes}
              onChange={(e) => patch({ incrementMinutes: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs font-bold text-slate-300">
            Buffer after a call (minutes)
            <input
              type="number" min={0} max={240} step={5} className={`${inputCls} mt-2`} value={schedule.bufferAfterMinutes}
              onChange={(e) => patch({ bufferAfterMinutes: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs font-bold text-slate-300">
            Buffer before a call (minutes)
            <input
              type="number" min={0} max={240} step={5} className={`${inputCls} mt-2`} value={schedule.bufferBeforeMinutes}
              onChange={(e) => patch({ bufferBeforeMinutes: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs font-bold text-slate-300">
            Minimum notice
            <select
              className={`${inputCls} mt-2`} value={schedule.minNoticeMinutes}
              onChange={(e) => patch({ minNoticeMinutes: Number(e.target.value) })}
            >
              {NOTICE_CHOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-300">
            Book up to (days ahead)
            <input
              type="number" min={1} max={365} className={`${inputCls} mt-2`} value={schedule.maxAdvanceDays}
              onChange={(e) => patch({ maxAdvanceDays: Number(e.target.value) })}
            />
          </label>
        </div>
      </Panel>

      {zoom && (
        <Panel>
          <h3 className="text-sm font-bold text-white">Video meetings</h3>
          {zoom.configured ? (
            <>
              <p className="mt-1.5 text-xs leading-5 text-slate-400">
                Zoom is configured. Every virtual booking gets its own meeting, and the join link goes into the confirmation email and the calendar entry. Cancelling a booking deletes the meeting.
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Meetings are created under <span className="font-bold text-slate-200">{zoom.hostEmail}</span>.
              </p>
            </>
          ) : (
            <>
              {/* Booking deliberately survives a missing Zoom credential, which
                  means the only previous symptom was a confirmation email with
                  no join link. Say it plainly instead. */}
              <p className="mt-1.5 text-xs leading-5 text-amber-200">
                Zoom is not configured, so virtual bookings will be taken without a join link. Nothing breaks; visitors just do not receive one.
              </p>
              <div className="mt-3 space-y-1.5">
                {([
                  ['ZOOM_ACCOUNT_ID', zoom.hasAccountId],
                  ['ZOOM_CLIENT_ID', zoom.hasClientId],
                  ['ZOOM_CLIENT_SECRET', zoom.hasClientSecret],
                ] as Array<[string, boolean]>).map(([name, present]) => (
                  <p key={name} className="flex items-center gap-2 text-xs">
                    <span className={present ? 'text-emerald-300' : 'text-rose-300'}>{present ? 'set' : 'missing'}</span>
                    <code className="text-slate-300">{name}</code>
                  </p>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                These are Cloudflare Pages secrets on this project, from a Zoom Server-to-Server OAuth app. Values are never read back here.
              </p>
            </>
          )}
        </Panel>
      )}

      <Panel>
        <h3 className="text-sm font-bold text-white">Time off</h3>
        <p className="mt-1.5 text-xs leading-5 text-slate-400">
          One-off blocks that remove time from the schedule. Days are resolved in {schedule.timezone}, the schedule's own zone, so a block means the same day wherever you happen to be when you set it.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ['Today', () => todayKey(schedule.timezone), 1],
            ['Tomorrow', () => addDaysToDateKey(todayKey(schedule.timezone), 1), 1],
            ['This weekend', () => nextWeekdayKey(schedule.timezone, 6), 2],
            ['Next week', () => addDaysToDateKey(nextWeekdayKey(schedule.timezone, 1), 0), 5],
          ] as Array<[string, () => string, number]>).map(([chipLabel, resolve, days]) => (
            <button
              key={chipLabel} type="button"
              onClick={() => void blockDays(resolve(), days, '')}
              className="rounded-full border border-white/[.12] bg-white/[.03] px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-gold/30 hover:text-white"
            >
              {chipLabel}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {schedule.blackouts.length === 0 && <EmptyState label="No time off scheduled." />}
          {schedule.blackouts.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white">{describeBlackout(b, schedule.timezone)}</p>
                {b.reason && <p className="mt-0.5 text-xs text-slate-400">{b.reason}</p>}
              </div>
              <button
                type="button" onClick={() => void removeBlackout(b.id)}
                className="rounded-md p-1.5 text-slate-500 hover:text-red-300" aria-label="Remove time off"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1.2fr_auto] sm:items-end">
          <label className="text-xs font-bold text-slate-300">
            Block from
            <input
              type="date" className={`${inputCls} mt-2`} value={dayDraft.date}
              min={todayKey(schedule.timezone)}
              onChange={(e) => setDayDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </label>
          <label className="text-xs font-bold text-slate-300">
            Days
            <input
              type="number" min={1} max={90} className={`${inputCls} mt-2 sm:w-24`} value={dayDraft.days}
              onChange={(e) => setDayDraft((d) => ({ ...d, days: Math.max(1, Math.min(90, Number(e.target.value) || 1)) }))}
            />
          </label>
          <label className="text-xs font-bold text-slate-300">
            Reason (optional)
            <input
              className={`${inputCls} mt-2`} value={dayDraft.reason}
              onChange={(e) => setDayDraft((d) => ({ ...d, reason: e.target.value }))}
            />
          </label>
          <button
            type="button" disabled={!dayDraft.date}
            onClick={() => void blockDays(dayDraft.date, dayDraft.days, dayDraft.reason)}
            className={`${btnOutline} min-h-10`}
          >
            <Plus className="h-3.5 w-3.5" /> Block
          </button>
        </div>

        {/* Part of a day is the rarer case, so it stops competing with the
            common one. Still here, just not first. */}
        <details className="mt-4 rounded-lg border border-white/[.08] bg-white/[.015] px-3 py-2.5">
          <summary className="cursor-pointer text-xs font-bold text-slate-300">Block part of a day instead</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end">
            <label className="text-xs font-bold text-slate-300">
              From
              <input
                type="datetime-local" className={`${inputCls} mt-2`} value={blackoutDraft.startsAt}
                onChange={(e) => setBlackoutDraft((d) => ({ ...d, startsAt: e.target.value }))}
              />
            </label>
            <label className="text-xs font-bold text-slate-300">
              To
              <input
                type="datetime-local" className={`${inputCls} mt-2`} value={blackoutDraft.endsAt}
                onChange={(e) => setBlackoutDraft((d) => ({ ...d, endsAt: e.target.value }))}
              />
            </label>
            <label className="text-xs font-bold text-slate-300">
              Reason (optional)
              <input
                className={`${inputCls} mt-2`} value={blackoutDraft.reason}
                onChange={(e) => setBlackoutDraft((d) => ({ ...d, reason: e.target.value }))}
              />
            </label>
            <button type="button" onClick={() => void addBlackout()} className={`${btnOutline} min-h-10`}>Add</button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Times here are read in {schedule.timezone}.</p>
        </details>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Preview</h3>
            <p className="mt-1.5 text-xs text-slate-400">What a visitor would see over the next 30 days, using saved settings.</p>
          </div>
          <button type="button" onClick={() => void runPreview()} disabled={previewing} className={`${btnOutline} min-h-10`}>
            {previewing ? 'Checking...' : 'Check Availability'}
          </button>
        </div>
        {preview && (
          <div className="mt-4 rounded-lg border border-white/[.08] bg-white/[.02] p-4">
            <p className="text-sm text-white">
              <strong className="tabular-nums">{preview.slotCount}</strong> bookable slots across{' '}
              <strong className="tabular-nums">{preview.days.length}</strong> days.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {preview.busyCount} existing commitment{preview.busyCount === 1 ? '' : 's'} in that range are blocking time.
            </p>
            {preview.slotCount === 0 && (
              <p className="mt-2 text-xs text-amber-200">
                Nothing is bookable. Check the weekly hours, the minimum notice, and whether time off covers the range.
              </p>
            )}
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className={`${btnPrimary} min-h-11`}>
          {saving ? 'Saving...' : 'Save Schedule'}
        </button>
        <button type="button" onClick={() => void load()} className={`${btnOutline} min-h-11`}>Discard Changes</button>
        {notice && <span className="text-xs text-green-300">{notice}</span>}
        {error && <span role="alert" className="text-xs text-red-300">{error}</span>}
      </div>
    </div>
  )
}
