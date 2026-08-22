// A provider's working hours.
//
// Before this, a provider was either "available" or not - a single flag that
// says nothing about Tuesday afternoons, the week they are away, or whether
// 7am is reasonable. Dispatch could only ask "are they switched on", which is
// not enough to schedule anyone.
//
// This adds no tables. availability_schedules is already per-host with
// public_bookable defaulting to 0, and the engine that turns windows and
// blackouts into free time is the same one already running the public
// consultation page. A provider's working week is simply another schedule row
// that is not publicly bookable, which means:
//
//   * one engine, so provider hours and consultation hours cannot drift apart
//     in how they handle timezones, buffers, or daylight saving,
//   * the HQ time-off calendar component works on provider blackouts as-is,
//   * anything later that needs "when is this person free" already works.
//
// What this deliberately is NOT: a read of the provider's personal calendar.
// We never see it. Providers tell us when they work; we never look. That is
// both the respectful design and the one that does not require holding OAuth
// tokens for everybody in the network.

import type { Env } from './types'
import { uuid } from './crypto'
import {
  generateAvailableSlots,
  normalizeSchedule,
  type AvailabilityBlackout,
  type AvailabilitySchedule,
  type AvailabilityWindow,
  type BusyInterval,
} from '../../shared/availability'

/** One schedule per provider, addressed by a slug derived from their id. */
export function providerScheduleSlug(vendorUserId: string): string {
  return `provider-${vendorUserId}`
}

export interface ProviderScheduleRow {
  id: string
  slug: string
  host_user_id: string | null
  timezone: string
  slot_minutes: number
  increment_minutes: number
  buffer_before_minutes: number
  buffer_after_minutes: number
  min_notice_minutes: number
  max_advance_days: number
  active: number
}

const COLUMNS = `id, slug, host_user_id, timezone, slot_minutes, increment_minutes,
  buffer_before_minutes, buffer_after_minutes, min_notice_minutes, max_advance_days, active`

/**
 * The provider's schedule row, created empty on first read.
 *
 * Created with NO windows on purpose. An empty week means "has not said yet",
 * which is honest; seeding nine-to-five would invent a claim about someone's
 * working hours that they never made, and dispatch would act on it.
 */
export async function getOrCreateProviderSchedule(env: Env, vendorUserId: string): Promise<ProviderScheduleRow> {
  const slug = providerScheduleSlug(vendorUserId)
  const existing = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM availability_schedules WHERE slug = ?`,
  ).bind(slug).first<ProviderScheduleRow>()
  if (existing) return existing

  const id = uuid()
  await env.DB.prepare(
    `INSERT INTO availability_schedules (
       id, slug, name, description, host_user_id, timezone,
       slot_minutes, increment_minutes, buffer_before_minutes, buffer_after_minutes,
       min_notice_minutes, max_advance_days, event_type, location_type,
       public_bookable, active, created_by_user_id
     ) VALUES (?, ?, 'Working hours', 'When this provider is available for assignments', ?,
       'America/New_York', 60, 30, 0, 15, 240, 60, 'field_work', 'field', 0, 1, ?)`,
  ).bind(id, slug, vendorUserId, vendorUserId).run()

  const created = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM availability_schedules WHERE id = ?`,
  ).bind(id).first<ProviderScheduleRow>()
  if (!created) throw new Error('provider schedule could not be created')
  return created
}

export async function loadProviderWindows(env: Env, scheduleId: string): Promise<AvailabilityWindow[]> {
  const { results } = await env.DB.prepare(
    'SELECT weekday, start_minute, end_minute FROM availability_windows WHERE schedule_id = ? ORDER BY weekday, start_minute',
  ).bind(scheduleId).all<{ weekday: number; start_minute: number; end_minute: number }>()
  return (results ?? []).map((r) => ({ weekday: r.weekday, startMinute: r.start_minute, endMinute: r.end_minute }))
}

export async function loadProviderBlackouts(env: Env, scheduleId: string): Promise<(AvailabilityBlackout & { id: string })[]> {
  const { results } = await env.DB.prepare(
    'SELECT id, starts_at, ends_at, reason FROM availability_blackouts WHERE schedule_id = ? ORDER BY starts_at',
  ).bind(scheduleId).all<{ id: string; starts_at: string; ends_at: string; reason: string | null }>()
  return (results ?? []).map((r) => ({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, reason: r.reason }))
}

export async function loadProviderSchedule(env: Env, row: ProviderScheduleRow): Promise<AvailabilitySchedule> {
  const [windows, blackouts] = await Promise.all([
    loadProviderWindows(env, row.id),
    loadProviderBlackouts(env, row.id),
  ])
  return normalizeSchedule({
    timezone: row.timezone,
    slotMinutes: row.slot_minutes,
    incrementMinutes: row.increment_minutes,
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    minNoticeMinutes: row.min_notice_minutes,
    maxAdvanceDays: row.max_advance_days,
    windows,
    blackouts,
  })
}

/** Work already on this provider's calendar, which is busy time. */
export async function providerBusy(env: Env, vendorUserId: string, fromIso: string, toIso: string): Promise<BusyInterval[]> {
  const { results } = await env.DB.prepare(
    `SELECT starts_at, ends_at FROM calendar_events
      WHERE vendor_user_id = ?
        AND status IN ('proposed', 'confirmed')
        AND starts_at < ? AND COALESCE(ends_at, starts_at) > ?`,
  ).bind(vendorUserId, toIso, fromIso).all<{ starts_at: string; ends_at: string | null }>()
  return (results ?? []).map((r) => ({ startsAt: r.starts_at, endsAt: r.ends_at ?? r.starts_at }))
}

export interface ProviderFitness {
  /** Whether the provider has told us any working hours at all. */
  hasHours: boolean
  /** Free at the requested time, according to hours, blackouts, and existing work. */
  free: boolean
  /** Why not, when not. */
  reason: 'no_hours' | 'outside_hours' | 'time_off' | 'already_booked' | null
}

/**
 * Whether a provider is free for a span.
 *
 * Answers 'no_hours' rather than false when the provider has never told us
 * their hours. Those are different facts and dispatch should treat them
 * differently: an unknown schedule is a person to ask, not a person to skip.
 */
export async function providerFitness(
  env: Env,
  vendorUserId: string,
  startsAt: string,
  endsAt: string,
): Promise<ProviderFitness> {
  const row = await getOrCreateProviderSchedule(env, vendorUserId)
  const schedule = await loadProviderSchedule(env, row)
  if (!schedule.windows.length) return { hasHours: false, free: false, reason: 'no_hours' }

  const startMs = Date.parse(startsAt)
  const endMs = Date.parse(endsAt)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { hasHours: true, free: false, reason: 'outside_hours' }
  }

  // A blackout is a flat no, checked before anything else so "I am away" wins
  // over a weekly window that would otherwise look open.
  for (const blackout of schedule.blackouts ?? []) {
    const from = Date.parse(blackout.startsAt)
    const to = Date.parse(blackout.endsAt)
    if (Number.isFinite(from) && Number.isFinite(to) && from < endMs && to > startMs) {
      return { hasHours: true, free: false, reason: 'time_off' }
    }
  }

  const busy = await providerBusy(env, vendorUserId, startsAt, endsAt)
  for (const span of busy) {
    const from = Date.parse(span.startsAt)
    const to = Date.parse(span.endsAt)
    if (Number.isFinite(from) && Number.isFinite(to) && from < endMs && to > startMs) {
      return { hasHours: true, free: false, reason: 'already_booked' }
    }
  }

  // Finally the weekly pattern. Generated with no minimum notice so dispatch
  // can ask about a slot today; the notice rule belongs to public booking, not
  // to a coordinator placing work.
  const dayKey = new Date(startMs).toISOString().slice(0, 10)
  const slots = generateAvailableSlots(
    { ...schedule, minNoticeMinutes: 0, blackouts: [] },
    [],
    { from: dayKey, to: dayKey, now: startMs - 1 },
  )
  const covered = slots.some((slot) => Date.parse(slot.startsAt) <= startMs && Date.parse(slot.endsAt) >= endMs)
  return covered
    ? { hasHours: true, free: true, reason: null }
    : { hasHours: true, free: false, reason: 'outside_hours' }
}
