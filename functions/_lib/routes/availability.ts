// Consultation availability API.
//
//   availabilityPublicRoutes -> mounted at '/'      (unauthenticated slot list)
//   availabilityAdminRoutes  -> mounted at '/admin' (HQ schedule configuration)
//
// Security model:
//   * The public endpoint serves ONLY schedules explicitly flagged
//     public_bookable AND active. A half-configured schedule is invisible.
//   * The public response is slot instants and nothing else. It never leaks the
//     host's identity, the titles of the events blocking a slot, buffer sizes,
//     or anything else about what fills the rest of the calendar. A visitor
//     learns "10:00 is taken", never why.
//   * Reading full schedule config requires staff; writing requires admin.
//
// The slot math is in shared/availability.ts and is pure. This file only loads
// the schedule, loads what is already booked, and hands both to the engine.

import { Hono } from 'hono'
import { zoomConfigStatus } from '../zoom'
import type { AppEnv, Env } from '../types'
import { requireStaff, requireAdmin } from '../mid'
import { googleBusySpans } from '../googleFreeBusy'
import { uuid } from '../crypto'
import { actorGeo, actorIp, actorUserAgent, logAudit } from '../auditLog'
import {
  DEFAULT_SCHEDULE,
  type AvailabilityBlackout,
  type AvailabilitySchedule,
  type AvailabilityWindow,
  type BusyInterval,
  defaultBusinessWindows,
  enumerateDateKeys,
  generateAvailableSlots,
  groupSlotsByDay,
  isValidDateKey,
  isValidTimezone,
  normalizeWindows,
  utcMsToDateKey,
} from '../../../shared/availability'

export const availabilityPublicRoutes = new Hono<AppEnv>()
export const availabilityAdminRoutes = new Hono<AppEnv>()

// The schedule the public consultation page books against.
const CONSULTATION_SLUG = 'consultation'
// Widest range a single request may ask for, so a crafted query cannot walk a
// year of the calendar in one call.
const MAX_RANGE_DAYS = 62

interface ScheduleRow {
  id: string
  slug: string
  name: string
  description: string | null
  host_user_id: string | null
  timezone: string
  slot_minutes: number
  increment_minutes: number
  buffer_before_minutes: number
  buffer_after_minutes: number
  min_notice_minutes: number
  max_advance_days: number
  event_type: string
  location_type: string
  public_bookable: number
  active: number
}

const SCHEDULE_COLUMNS = `id, slug, name, description, host_user_id, timezone, slot_minutes,
  increment_minutes, buffer_before_minutes, buffer_after_minutes, min_notice_minutes,
  max_advance_days, event_type, location_type, public_bookable, active`

/**
 * Load a schedule by slug, seeding the consultation default on first read.
 *
 * Seeding happens here rather than in the migration for the same reason the
 * cleaning config does it: the defaults then live in exactly one place
 * (shared/availability.ts) instead of being frozen into SQL. The seeded
 * schedule is deliberately NOT public_bookable — someone has to review the
 * hours and turn it on.
 */
export async function loadScheduleRow(env: Env, slug: string): Promise<ScheduleRow | null> {
  const existing = await env.DB.prepare(
    `SELECT ${SCHEDULE_COLUMNS} FROM availability_schedules WHERE slug = ?`,
  ).bind(slug).first<ScheduleRow>()
  if (existing) return existing
  if (slug !== CONSULTATION_SLUG) return null

  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO availability_schedules
       (id, slug, name, description, timezone, slot_minutes, increment_minutes,
        buffer_before_minutes, buffer_after_minutes, min_notice_minutes, max_advance_days,
        event_type, location_type, public_bookable, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'consultation', 'virtual', 0, 1)`,
  ).bind(
    id,
    CONSULTATION_SLUG,
    'Consultation',
    'Introductory call to scope what you need and how Pinnacle can help.',
    DEFAULT_SCHEDULE.timezone,
    DEFAULT_SCHEDULE.slotMinutes,
    DEFAULT_SCHEDULE.incrementMinutes,
    DEFAULT_SCHEDULE.bufferBeforeMinutes,
    DEFAULT_SCHEDULE.bufferAfterMinutes,
    DEFAULT_SCHEDULE.minNoticeMinutes,
    DEFAULT_SCHEDULE.maxAdvanceDays,
  ).run()

  const inserts = defaultBusinessWindows().map((w) =>
    env.DB.prepare(
      'INSERT INTO availability_windows (id, schedule_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?, ?)',
    ).bind(uuid(), id, w.weekday, w.startMinute, w.endMinute),
  )
  if (inserts.length) await env.DB.batch(inserts)

  return await env.DB.prepare(
    `SELECT ${SCHEDULE_COLUMNS} FROM availability_schedules WHERE id = ?`,
  ).bind(id).first<ScheduleRow>()
}

async function loadWindows(env: Env, scheduleId: string): Promise<AvailabilityWindow[]> {
  const { results } = await env.DB.prepare(
    'SELECT weekday, start_minute, end_minute FROM availability_windows WHERE schedule_id = ? ORDER BY weekday, start_minute',
  ).bind(scheduleId).all<{ weekday: number; start_minute: number; end_minute: number }>()
  return (results ?? []).map((r) => ({ weekday: r.weekday, startMinute: r.start_minute, endMinute: r.end_minute }))
}

async function loadBlackouts(env: Env, scheduleId: string): Promise<(AvailabilityBlackout & { id: string })[]> {
  const { results } = await env.DB.prepare(
    'SELECT id, starts_at, ends_at, reason FROM availability_blackouts WHERE schedule_id = ? ORDER BY starts_at',
  ).bind(scheduleId).all<{ id: string; starts_at: string; ends_at: string; reason: string | null }>()
  return (results ?? []).map((r) => ({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, reason: r.reason }))
}

/** Assemble the pure-engine schedule object from its stored parts. */
export async function loadSchedule(env: Env, row: ScheduleRow): Promise<AvailabilitySchedule> {
  const [windows, blackouts] = await Promise.all([loadWindows(env, row.id), loadBlackouts(env, row.id)])
  return {
    timezone: row.timezone,
    slotMinutes: row.slot_minutes,
    incrementMinutes: row.increment_minutes,
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    minNoticeMinutes: row.min_notice_minutes,
    maxAdvanceDays: row.max_advance_days,
    windows,
    blackouts,
  }
}

/**
 * What already occupies the host, as UTC intervals.
 *
 * A schedule with a named host is blocked by that host's own calendar. An
 * unassigned schedule has no single person to check, so it is blocked by
 * anything already booked through the same offering — which is what stops two
 * visitors claiming one slot. Cancelled events never block.
 */
export async function loadBusyIntervals(
  env: Env,
  row: ScheduleRow,
  fromIso: string,
  toIso: string,
): Promise<BusyInterval[]> {
  const scope = row.host_user_id
    ? { where: 'assigned_user_id = ?', params: [row.host_user_id] }
    : { where: 'event_type = ?', params: [row.event_type] }

  const { results } = await env.DB.prepare(
    `SELECT starts_at, ends_at FROM calendar_events
      WHERE status IN ('proposed', 'confirmed')
        AND ${scope.where}
        AND starts_at < ?
        AND COALESCE(ends_at, starts_at) > ?`,
  ).bind(...scope.params, toIso, fromIso).all<{ starts_at: string; ends_at: string | null }>()

  const pinnacle = (results ?? []).map((r) => ({
    startsAt: r.starts_at,
    // A stored event with no end still occupies its slot length.
    endsAt: r.ends_at ?? new Date(Date.parse(r.starts_at.replace(' ', 'T') + 'Z') + row.slot_minutes * 60_000).toISOString(),
  }))

  // The host's own calendar, if they have connected one. Without this a
  // schedule only knows about work booked through Pinnacle, so anything on
  // the host's real calendar stays bookable and double-books them.
  //
  // Freebusy only: spans, never titles or attendees. And it fails open, so a
  // Google outage leaves slots bookable rather than making the booking page
  // look fully booked.
  if (!row.host_user_id) return pinnacle
  const external = await googleBusySpans(env, row.host_user_id, fromIso, toIso)
  return external.length ? [...pinnacle, ...external] : pinnacle
}

// Resolve and bound the requested date range. Defaults to the next 30 days.
function resolveRange(c: { req: { query: (k: string) => string | undefined } }, timezone: string) {
  const now = Date.now()
  const today = utcMsToDateKey(now, timezone)
  const rawFrom = c.req.query('from')
  const rawTo = c.req.query('to')
  const from = rawFrom && isValidDateKey(rawFrom) && rawFrom > today ? rawFrom : today
  const fallbackTo = utcMsToDateKey(now + 30 * 86_400_000, timezone)
  let to = rawTo && isValidDateKey(rawTo) ? rawTo : fallbackTo
  if (to < from) to = from
  const days = enumerateDateKeys(from, to)
  if (days.length > MAX_RANGE_DAYS) to = days[MAX_RANGE_DAYS - 1]
  return { from, to, now }
}

// Pad the busy query either side of the range so a commitment that starts the
// evening before can still block an early slot through its buffer.
function busyBounds(from: string, to: string): { fromIso: string; toIso: string } {
  return {
    fromIso: new Date(Date.parse(`${from}T00:00:00Z`) - 2 * 86_400_000).toISOString(),
    toIso: new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Public: slot list for the booking page
// ---------------------------------------------------------------------------

availabilityPublicRoutes.get('/consultation/availability', async (c) => {
  const row = await loadScheduleRow(c.env, CONSULTATION_SLUG)
  // Not configured for public booking is a normal state, not an error: the
  // page renders its "call us instead" fallback.
  if (!row || !row.active || !row.public_bookable) {
    return c.json({ bookable: false, schedule: null, days: [] })
  }

  const schedule = await loadSchedule(c.env, row)
  const { from, to, now } = resolveRange(c, schedule.timezone)
  const bounds = busyBounds(from, to)
  const busy = await loadBusyIntervals(c.env, row, bounds.fromIso, bounds.toIso)
  const slots = generateAvailableSlots(schedule, busy, { from, to, now })

  return c.json({
    bookable: true,
    schedule: {
      slug: row.slug,
      name: row.name,
      description: row.description,
      timezone: schedule.timezone,
      slotMinutes: schedule.slotMinutes,
      locationType: row.location_type,
      minNoticeMinutes: schedule.minNoticeMinutes,
      maxAdvanceDays: schedule.maxAdvanceDays,
    },
    range: { from, to },
    days: groupSlotsByDay(slots, schedule.timezone),
  })
})

// ---------------------------------------------------------------------------
// Admin: schedule configuration
// ---------------------------------------------------------------------------

function adminScheduleView(row: ScheduleRow, windows: AvailabilityWindow[], blackouts: (AvailabilityBlackout & { id: string })[]) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    hostUserId: row.host_user_id,
    timezone: row.timezone,
    slotMinutes: row.slot_minutes,
    incrementMinutes: row.increment_minutes,
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    minNoticeMinutes: row.min_notice_minutes,
    maxAdvanceDays: row.max_advance_days,
    eventType: row.event_type,
    locationType: row.location_type,
    publicBookable: !!row.public_bookable,
    active: !!row.active,
    windows,
    blackouts,
  }
}

availabilityAdminRoutes.get('/availability/schedules', requireStaff, async (c) => {
  // Touch the consultation slug so a fresh install shows a schedule to edit
  // rather than an empty page.
  await loadScheduleRow(c.env, CONSULTATION_SLUG)
  const { results } = await c.env.DB.prepare(
    `SELECT ${SCHEDULE_COLUMNS} FROM availability_schedules ORDER BY slug`,
  ).all<ScheduleRow>()

  const schedules = await Promise.all(
    (results ?? []).map(async (row) => adminScheduleView(row, await loadWindows(c.env, row.id), await loadBlackouts(c.env, row.id))),
  )
  // Zoom's state travels with the schedules because that is the only page
  // where it matters. Without it, the sole way to discover a missing secret
  // was to take a real booking and notice the confirmation had no join link.
  return c.json({ schedules, zoom: zoomConfigStatus(c.env) })
})

availabilityAdminRoutes.get('/availability/schedules/:id/preview', requireStaff, async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT ${SCHEDULE_COLUMNS} FROM availability_schedules WHERE id = ?`,
  ).bind(c.req.param('id')).first<ScheduleRow>()
  if (!row) return c.json({ error: 'Schedule not found' }, 404)

  const schedule = await loadSchedule(c.env, row)
  const { from, to, now } = resolveRange(c, schedule.timezone)
  const bounds = busyBounds(from, to)
  const busy = await loadBusyIntervals(c.env, row, bounds.fromIso, bounds.toIso)
  const slots = generateAvailableSlots(schedule, busy, { from, to, now })

  // Staff see the counts a visitor's view is derived from, which is what makes
  // "why is Thursday empty" answerable without guessing.
  return c.json({
    range: { from, to },
    timezone: schedule.timezone,
    busyCount: busy.length,
    slotCount: slots.length,
    days: groupSlotsByDay(slots, schedule.timezone),
  })
})

interface ScheduleBody {
  name?: unknown
  description?: unknown
  hostUserId?: unknown
  timezone?: unknown
  slotMinutes?: unknown
  incrementMinutes?: unknown
  bufferBeforeMinutes?: unknown
  bufferAfterMinutes?: unknown
  minNoticeMinutes?: unknown
  maxAdvanceDays?: unknown
  publicBookable?: unknown
  active?: unknown
  windows?: unknown
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function coerceWindows(value: unknown): AvailabilityWindow[] | null {
  if (!Array.isArray(value)) return null
  // Cap the list so one request cannot write thousands of rows.
  const raw = value.slice(0, 100).map((entry) => {
    const w = entry as Record<string, unknown>
    return {
      weekday: Math.round(Number(w.weekday)),
      startMinute: Math.round(Number(w.startMinute)),
      endMinute: Math.round(Number(w.endMinute)),
    }
  })
  if (raw.some((w) => !Number.isFinite(w.weekday) || !Number.isFinite(w.startMinute) || !Number.isFinite(w.endMinute))) {
    return null
  }
  return normalizeWindows(raw)
}

availabilityAdminRoutes.put('/availability/schedules/:id', requireAdmin, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id') ?? ''
  const before = await c.env.DB.prepare(
    `SELECT ${SCHEDULE_COLUMNS} FROM availability_schedules WHERE id = ?`,
  ).bind(id).first<ScheduleRow>()
  if (!before) return c.json({ error: 'Schedule not found' }, 404)

  const body = (await c.req.json().catch(() => ({}))) as ScheduleBody

  if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
    return c.json({ error: 'Unrecognized timezone' }, 400)
  }
  const windows = body.windows === undefined ? null : coerceWindows(body.windows)
  if (body.windows !== undefined && windows === null) {
    return c.json({ error: 'Windows must be a list of { weekday, startMinute, endMinute }' }, 400)
  }

  const slotMinutes = body.slotMinutes === undefined ? before.slot_minutes : clampInt(body.slotMinutes, 5, 480, before.slot_minutes)
  const next = {
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : before.name,
    description: body.description === undefined
      ? before.description
      : (typeof body.description === 'string' ? body.description.trim().slice(0, 500) || null : null),
    hostUserId: body.hostUserId === undefined
      ? before.host_user_id
      : (typeof body.hostUserId === 'string' && body.hostUserId ? body.hostUserId : null),
    timezone: body.timezone === undefined ? before.timezone : String(body.timezone),
    slotMinutes,
    incrementMinutes: body.incrementMinutes === undefined ? before.increment_minutes : clampInt(body.incrementMinutes, 5, 480, slotMinutes),
    bufferBeforeMinutes: body.bufferBeforeMinutes === undefined ? before.buffer_before_minutes : clampInt(body.bufferBeforeMinutes, 0, 240, 0),
    bufferAfterMinutes: body.bufferAfterMinutes === undefined ? before.buffer_after_minutes : clampInt(body.bufferAfterMinutes, 0, 240, 0),
    minNoticeMinutes: body.minNoticeMinutes === undefined ? before.min_notice_minutes : clampInt(body.minNoticeMinutes, 0, 90 * 24 * 60, before.min_notice_minutes),
    maxAdvanceDays: body.maxAdvanceDays === undefined ? before.max_advance_days : clampInt(body.maxAdvanceDays, 1, 365, before.max_advance_days),
    publicBookable: body.publicBookable === undefined ? !!before.public_bookable : body.publicBookable === true,
    active: body.active === undefined ? !!before.active : body.active === true,
  }

  // A schedule with no window can never produce a slot, so publishing one
  // would render an empty booking page. Refuse rather than ship a dead end.
  const effectiveWindows = windows ?? (await loadWindows(c.env, id))
  if (next.publicBookable && !effectiveWindows.length) {
    return c.json({ error: 'Add at least one weekly window before making this schedule public' }, 400)
  }

  await c.env.DB.prepare(
    `UPDATE availability_schedules SET
       name = ?, description = ?, host_user_id = ?, timezone = ?, slot_minutes = ?,
       increment_minutes = ?, buffer_before_minutes = ?, buffer_after_minutes = ?,
       min_notice_minutes = ?, max_advance_days = ?, public_bookable = ?, active = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
  ).bind(
    next.name, next.description, next.hostUserId, next.timezone, next.slotMinutes,
    next.incrementMinutes, next.bufferBeforeMinutes, next.bufferAfterMinutes,
    next.minNoticeMinutes, next.maxAdvanceDays, next.publicBookable ? 1 : 0, next.active ? 1 : 0,
    id,
  ).run()

  if (windows) {
    // Replace wholesale: the editor sends the complete weekly grid, and a
    // diff would only add a way for the stored grid to drift from it.
    await c.env.DB.prepare('DELETE FROM availability_windows WHERE schedule_id = ?').bind(id).run()
    if (windows.length) {
      await c.env.DB.batch(windows.map((w) =>
        c.env.DB.prepare(
          'INSERT INTO availability_windows (id, schedule_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?, ?)',
        ).bind(uuid(), id, w.weekday, w.startMinute, w.endMinute),
      ))
    }
  }

  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'availability_schedule_updated',
    entityType: 'availability_schedule',
    entityId: id,
    before: { publicBookable: !!before.public_bookable, timezone: before.timezone, slotMinutes: before.slot_minutes },
    after: { publicBookable: next.publicBookable, timezone: next.timezone, slotMinutes: next.slotMinutes },
  }).catch(() => {})

  const row = await c.env.DB.prepare(
    `SELECT ${SCHEDULE_COLUMNS} FROM availability_schedules WHERE id = ?`,
  ).bind(id).first<ScheduleRow>()
  if (!row) return c.json({ error: 'Schedule not found' }, 404)
  return c.json({ schedule: adminScheduleView(row, await loadWindows(c.env, id), await loadBlackouts(c.env, id)) })
})

function parseInstant(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = Date.parse(value.trim().replace(' ', 'T'))
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

availabilityAdminRoutes.post('/availability/schedules/:id/blackouts', requireAdmin, async (c) => {
  const user = c.get('user')
  const scheduleId = c.req.param('id') ?? ''
  const exists = await c.env.DB.prepare('SELECT id FROM availability_schedules WHERE id = ?').bind(scheduleId).first<{ id: string }>()
  if (!exists) return c.json({ error: 'Schedule not found' }, 404)

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const startsAt = parseInstant(body.startsAt)
  const endsAt = parseInstant(body.endsAt)
  if (!startsAt || !endsAt) return c.json({ error: 'startsAt and endsAt must be valid timestamps' }, 400)
  if (endsAt <= startsAt) return c.json({ error: 'endsAt must be after startsAt' }, 400)

  const id = uuid()
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) || null : null
  await c.env.DB.prepare(
    'INSERT INTO availability_blackouts (id, schedule_id, starts_at, ends_at, reason, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, scheduleId, startsAt, endsAt, reason, user.id).run()

  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'availability_blackout_added',
    entityType: 'availability_schedule',
    entityId: scheduleId,
    after: { startsAt, endsAt, reason },
  }).catch(() => {})

  return c.json({ blackout: { id, startsAt, endsAt, reason } }, 201)
})

availabilityAdminRoutes.delete('/availability/blackouts/:id', requireAdmin, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id') ?? ''
  const row = await c.env.DB.prepare(
    'SELECT id, schedule_id, starts_at, ends_at FROM availability_blackouts WHERE id = ?',
  ).bind(id).first<{ id: string; schedule_id: string; starts_at: string; ends_at: string }>()
  if (!row) return c.json({ error: 'Blackout not found' }, 404)

  await c.env.DB.prepare('DELETE FROM availability_blackouts WHERE id = ?').bind(id).run()

  await logAudit(c.env, {
    actorUserId: user.id,
    actorIp: actorIp(c.req.raw),
    actorUserAgent: actorUserAgent(c.req.raw),
    actorGeo: actorGeo(c.req.raw),
    action: 'availability_blackout_removed',
    entityType: 'availability_schedule',
    entityId: row.schedule_id,
    before: { startsAt: row.starts_at, endsAt: row.ends_at },
  }).catch(() => {})

  return c.json({ ok: true })
})
