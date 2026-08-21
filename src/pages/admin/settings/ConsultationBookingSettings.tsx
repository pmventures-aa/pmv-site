import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Panel, EmptyState, Skeleton, inputCls, btnPrimary, btnOutline, Tag } from '../../../components/admin/ui'
import { api, ApiError } from '../../../lib/api'
import {
  WEEKDAY_LABELS,
  defaultBusinessWindows,
  formatHhMm,
  parseHhMm,
  type AvailabilityWindow,
} from '../../../../shared/availability'

// Editor for the public consultation schedule.
//
// The weekly grid is edited as wall-clock times in the schedule's own
// timezone, which is exactly how it is stored. No instant conversion happens
// in this component: the engine does that per day at read time, so a schedule
// stays correct across daylight saving without anything being regenerated.

interface Blackout { id: string; startsAt: string; endsAt: string; reason?: string | null }

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

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<{ schedules: Schedule[] }>('/admin/availability/schedules')
      setSchedule(res.schedules.find((s) => s.slug === 'consultation') ?? res.schedules[0] ?? null)
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

  async function addBlackout() {
    if (!schedule || !blackoutDraft.startsAt || !blackoutDraft.endsAt) return
    setError('')
    try {
      // datetime-local gives wall time with no zone; treat it as the browser's
      // own zone, which is what the person typing it means.
      const res = await api.post<{ blackout: Blackout }>(`/admin/availability/schedules/${schedule.id}/blackouts`, {
        startsAt: new Date(blackoutDraft.startsAt).toISOString(),
        endsAt: new Date(blackoutDraft.endsAt).toISOString(),
        reason: blackoutDraft.reason,
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
              Controls what visitors can book at /consultation. Times below are wall-clock times in the
              schedule timezone, so they stay correct through daylight saving on their own.
            </p>
          </div>
          <Tag tone={schedule.publicBookable && schedule.active ? 'green' : 'slate'}>
            {schedule.publicBookable && schedule.active ? 'Live' : 'Not published'}
          </Tag>
        </div>

        <div className="mt-6 rounded-xl border border-white/[.08] bg-white/[.02] p-4">
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

      <Panel>
        <h3 className="text-sm font-bold text-white">Time off</h3>
        <p className="mt-1.5 text-xs leading-5 text-slate-400">
          One-off blocks that remove time from the schedule. Entered in your own timezone.
        </p>
        <div className="mt-4 space-y-2">
          {schedule.blackouts.length === 0 && <EmptyState label="No time off scheduled." />}
          {schedule.blackouts.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[.08] bg-white/[.02] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white">
                  {new Date(b.startsAt).toLocaleString()} to {new Date(b.endsAt).toLocaleString()}
                </p>
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
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end">
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
