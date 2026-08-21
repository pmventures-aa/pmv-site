// Consultation availability engine.
//
// Pure scheduling math shared by the Hono API layer and the public booking UI.
// There is no I/O here and no hidden clock read — the caller passes `now` in —
// so every rule below (including the two DST transitions a year) is directly
// unit-testable.
//
// Model: a schedule declares recurring weekly windows in wall-clock minutes in
// its own IANA timezone. Slots are generated in wall time and converted to UTC
// per day, which is what makes the DST handling correct: a 9:00 AM window is
// 9:00 AM to the host year-round, even though its UTC instant shifts by an hour
// in March and November.

export interface AvailabilityWindow {
  // 0 = Sunday ... 6 = Saturday, evaluated in the schedule's timezone.
  weekday: number
  // Minutes from local midnight. endMinute may be up to 1440 (midnight).
  startMinute: number
  endMinute: number
}

// A one-off exception that removes time from the schedule (holiday, vacation,
// a blocked afternoon). Stored as absolute UTC instants, not wall time, so an
// exception means the same thing regardless of later timezone edits.
export interface AvailabilityBlackout {
  startsAt: string
  endsAt: string
  reason?: string | null
}

export interface AvailabilitySchedule {
  timezone: string
  // Length of a bookable appointment.
  slotMinutes: number
  // How far apart slot start times are. Equal to slotMinutes for back-to-back
  // slots; smaller for overlapping start times (e.g. 60-minute calls offered
  // every 30 minutes).
  incrementMinutes: number
  // Dead time reserved either side of a booking. Applied when testing against
  // existing commitments, not when testing against the window edges.
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  // Earliest a visitor may book, measured from now.
  minNoticeMinutes: number
  // Latest a visitor may book, measured from now.
  maxAdvanceDays: number
  windows: AvailabilityWindow[]
  blackouts?: AvailabilityBlackout[]
}

// An existing commitment that makes time unbookable. Sourced from
// calendar_events (and anything else that occupies the host).
export interface BusyInterval {
  startsAt: string
  endsAt: string
}

export interface AvailabilitySlot {
  // UTC ISO instants. The UI localizes these for display.
  startsAt: string
  endsAt: string
}

export interface SlotQuery {
  // Inclusive date key 'YYYY-MM-DD' in the schedule's timezone.
  from: string
  // Inclusive date key 'YYYY-MM-DD' in the schedule's timezone.
  to: string
  // Current instant in epoch milliseconds.
  now: number
  // Safety valve so a wide date range cannot generate an unbounded response.
  limit?: number
}

export const DEFAULT_SCHEDULE: Omit<AvailabilitySchedule, 'windows'> = {
  timezone: 'America/New_York',
  slotMinutes: 60,
  incrementMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 15,
  minNoticeMinutes: 24 * 60,
  maxAdvanceDays: 60,
  blackouts: [],
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
// Hard ceiling on generated slots so a malformed range cannot exhaust memory.
const MAX_SLOTS = 2000
// Hard ceiling on days walked, for the same reason.
const MAX_DAYS = 400

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// Offset in milliseconds to ADD to a UTC instant to get local wall time in
// `timeZone` (so UTC-5 returns -18000000). Derived from Intl rather than a
// table, so it tracks whatever tzdata the runtime ships.
export function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  // 'en-US' renders midnight as hour 24 in some runtimes; normalize to 0.
  const hour = get('hour') % 24
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  // formatToParts drops sub-second precision, so round the source the same way
  // before differencing or the offset picks up a spurious remainder.
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

// Convert a wall-clock time in `timeZone` to a UTC instant.
//
// `minuteOfDay` may exceed 1440, which rolls into the following day — that is
// how a window ending at midnight is expressed. Solved iteratively because the
// offset itself depends on the instant we are solving for; two passes settle
// every real-world zone, including the half-hour and 45-minute offsets.
export function zonedWallTimeToUtcMs(dateKey: string, minuteOfDay: number, timeZone: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  const naive = Date.UTC(y, m - 1, d) + minuteOfDay * MINUTE_MS
  let utc = naive - tzOffsetMs(naive, timeZone)
  const corrected = naive - tzOffsetMs(utc, timeZone)
  if (corrected !== utc) utc = corrected
  return utc
}

// Local calendar date of a UTC instant, as 'YYYY-MM-DD'.
export function utcMsToDateKey(utcMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Weekday of a date key. The key is already a local calendar date, so this is
// pure arithmetic and needs no timezone.
export function dateKeyWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

// Inclusive list of date keys from `from` to `to`.
export function enumerateDateKeys(from: string, to: string): string[] {
  if (!isValidDateKey(from) || !isValidDateKey(to) || to < from) return []
  const keys: string[] = []
  let cursor = from
  while (cursor <= to && keys.length < MAX_DAYS) {
    keys.push(cursor)
    cursor = addDaysToDateKey(cursor, 1)
  }
  return keys
}

// ---- Window helpers ----

export function parseHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const min = Number(match[2])
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null
  return h * 60 + min
}

export function formatHhMm(minuteOfDay: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minuteOfDay)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Drop malformed windows and merge overlapping/adjacent ones per weekday, so a
// sloppily configured schedule cannot emit the same slot twice.
export function normalizeWindows(windows: AvailabilityWindow[]): AvailabilityWindow[] {
  const byDay = new Map<number, AvailabilityWindow[]>()
  for (const w of windows) {
    if (!Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6) continue
    const start = Math.max(0, Math.round(w.startMinute))
    const end = Math.min(1440, Math.round(w.endMinute))
    if (!(end > start)) continue
    const list = byDay.get(w.weekday) ?? []
    list.push({ weekday: w.weekday, startMinute: start, endMinute: end })
    byDay.set(w.weekday, list)
  }
  const out: AvailabilityWindow[] = []
  for (const weekday of [...byDay.keys()].sort((a, b) => a - b)) {
    const sorted = (byDay.get(weekday) ?? []).sort((a, b) => a.startMinute - b.startMinute)
    let current = sorted[0]
    for (const next of sorted.slice(1)) {
      if (next.startMinute <= current.endMinute) {
        current = { weekday, startMinute: current.startMinute, endMinute: Math.max(current.endMinute, next.endMinute) }
      } else {
        out.push(current)
        current = next
      }
    }
    if (current) out.push(current)
  }
  return out
}

// Clamp a stored schedule into a sane shape. Bad config should narrow
// availability, never widen it or wedge the generator.
export function normalizeSchedule(schedule: AvailabilitySchedule): AvailabilitySchedule {
  const slotMinutes = clampInt(schedule.slotMinutes, 5, 480, DEFAULT_SCHEDULE.slotMinutes)
  return {
    timezone: isValidTimezone(schedule.timezone) ? schedule.timezone : DEFAULT_SCHEDULE.timezone,
    slotMinutes,
    incrementMinutes: clampInt(schedule.incrementMinutes, 5, 480, slotMinutes),
    bufferBeforeMinutes: clampInt(schedule.bufferBeforeMinutes, 0, 240, 0),
    bufferAfterMinutes: clampInt(schedule.bufferAfterMinutes, 0, 240, 0),
    minNoticeMinutes: clampInt(schedule.minNoticeMinutes, 0, 90 * 24 * 60, DEFAULT_SCHEDULE.minNoticeMinutes),
    maxAdvanceDays: clampInt(schedule.maxAdvanceDays, 1, 365, DEFAULT_SCHEDULE.maxAdvanceDays),
    windows: normalizeWindows(schedule.windows ?? []),
    blackouts: (schedule.blackouts ?? []).filter((b) => msOf(b.startsAt) !== null && msOf(b.endsAt) !== null),
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function msOf(value: string | null | undefined): number | null {
  if (!value) return null
  // Accept both ISO and the 'YYYY-MM-DD HH:mm:ss' UTC form D1 stores.
  const normalized = value.trim().replace(' ', 'T')
  const withZone = /[Z+]|-\d{2}:\d{2}$/.test(normalized.slice(10)) ? normalized : `${normalized}Z`
  const ms = new Date(withZone).getTime()
  return Number.isNaN(ms) ? null : ms
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * Generate every bookable slot in a date range.
 *
 * A slot survives only if it clears all of:
 *   - it sits fully inside a weekly window for its local weekday
 *   - its real duration equals slotMinutes (drops the malformed hour either
 *     side of a DST transition rather than offering a call that is secretly
 *     two hours long)
 *   - at least minNoticeMinutes from now, at most maxAdvanceDays from now
 *   - no overlap with a busy interval once buffers are applied
 *   - no overlap with a blackout
 */
export function generateAvailableSlots(
  rawSchedule: AvailabilitySchedule,
  busy: BusyInterval[],
  query: SlotQuery,
): AvailabilitySlot[] {
  const schedule = normalizeSchedule(rawSchedule)
  if (!schedule.windows.length) return []

  const limit = Math.max(1, Math.min(MAX_SLOTS, query.limit ?? MAX_SLOTS))
  const earliest = query.now + schedule.minNoticeMinutes * MINUTE_MS
  const latest = query.now + schedule.maxAdvanceDays * DAY_MS

  const busyRanges = busy
    .map((b) => ({ start: msOf(b.startsAt), end: msOf(b.endsAt) }))
    .filter((b): b is { start: number; end: number } => b.start !== null && b.end !== null && b.end > b.start)

  const blackoutRanges = (schedule.blackouts ?? [])
    .map((b) => ({ start: msOf(b.startsAt), end: msOf(b.endsAt) }))
    .filter((b): b is { start: number; end: number } => b.start !== null && b.end !== null && b.end > b.start)

  const windowsByDay = new Map<number, AvailabilityWindow[]>()
  for (const w of schedule.windows) {
    const list = windowsByDay.get(w.weekday) ?? []
    list.push(w)
    windowsByDay.set(w.weekday, list)
  }

  const slotMs = schedule.slotMinutes * MINUTE_MS
  const seen = new Set<number>()
  const slots: AvailabilitySlot[] = []

  for (const dateKey of enumerateDateKeys(query.from, query.to)) {
    const dayWindows = windowsByDay.get(dateKeyWeekday(dateKey))
    if (!dayWindows?.length) continue

    for (const w of dayWindows) {
      // The window edges are resolved once per day, so the containment test
      // below is against real instants. On a fall-back day that correctly
      // makes a 9:00-17:00 window nine hours long rather than eight.
      const windowEndMs = zonedWallTimeToUtcMs(dateKey, w.endMinute, schedule.timezone)

      for (let m = w.startMinute; m + schedule.slotMinutes <= w.endMinute; m += schedule.incrementMinutes) {
        const startMs = zonedWallTimeToUtcMs(dateKey, m, schedule.timezone)
        // Duration is real time, never wall time: a booked hour is always an
        // hour. Wall arithmetic here would hand Zoom a 120-minute "hour" on
        // the fall-back Sunday.
        const endMs = startMs + slotMs
        if (endMs > windowEndMs) continue
        // Spring-forward collapses the skipped wall hour onto the instant
        // before it, so the same slot can be generated twice.
        if (seen.has(startMs)) continue

        if (startMs < earliest || startMs > latest) continue

        const guardStart = startMs - schedule.bufferBeforeMinutes * MINUTE_MS
        const guardEnd = endMs + schedule.bufferAfterMinutes * MINUTE_MS
        if (busyRanges.some((b) => overlaps(guardStart, guardEnd, b.start, b.end))) continue
        if (blackoutRanges.some((b) => overlaps(startMs, endMs, b.start, b.end))) continue

        seen.add(startMs)
        slots.push({ startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() })
        if (slots.length >= limit) return sortSlots(slots)
      }
    }
  }

  return sortSlots(slots)
}

function sortSlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

export interface SlotDay {
  dateKey: string
  slots: AvailabilitySlot[]
}

// Group slots into local calendar days for rendering. Days with no slots are
// omitted; the UI decides whether to show empty days.
export function groupSlotsByDay(slots: AvailabilitySlot[], timeZone: string): SlotDay[] {
  const zone = isValidTimezone(timeZone) ? timeZone : DEFAULT_SCHEDULE.timezone
  const byDay = new Map<string, AvailabilitySlot[]>()
  for (const slot of slots) {
    const ms = msOf(slot.startsAt)
    if (ms === null) continue
    const key = utcMsToDateKey(ms, zone)
    const list = byDay.get(key) ?? []
    list.push(slot)
    byDay.set(key, list)
  }
  return [...byDay.keys()].sort().map((dateKey) => ({ dateKey, slots: byDay.get(dateKey) ?? [] }))
}

// Re-check a single slot at booking time. The slot list a visitor is looking at
// can be seconds or minutes stale, so the write path must confirm the exact
// instant is still generatable rather than trusting the submitted time.
export function isSlotBookable(
  schedule: AvailabilitySchedule,
  busy: BusyInterval[],
  startsAt: string,
  now: number,
): boolean {
  const startMs = msOf(startsAt)
  if (startMs === null) return false
  const zone = isValidTimezone(schedule.timezone) ? schedule.timezone : DEFAULT_SCHEDULE.timezone
  const dateKey = utcMsToDateKey(startMs, zone)
  const slots = generateAvailableSlots(schedule, busy, {
    // Widen by a day either side so a slot near local midnight is still found.
    from: addDaysToDateKey(dateKey, -1),
    to: addDaysToDateKey(dateKey, 1),
    now,
  })
  return slots.some((s) => msOf(s.startsAt) === startMs)
}

// Sensible starting point for a new schedule: weekdays, 9:00 to 17:00.
export function defaultBusinessWindows(): AvailabilityWindow[] {
  return [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 17 * 60 }))
}

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? 'Day'
}
