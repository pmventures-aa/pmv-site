import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CALENDAR_EVENT_TYPES,
  calendarDayLabel,
  calendarEventStatusLabel,
  calendarEventStatusTone,
  calendarEventTone,
  calendarEventTypeLabel,
  calendarLocationLabel,
  calendarTimeLabel,
  calendarWindowLabel,
  dayKey,
  dayKeyOfIso,
  defaultEventDurationMinutes,
  isCalendarEventStatus,
  isCalendarEventType,
  isCalendarLocationType,
  isCalendarVisibility,
  monthGridDayKeys,
  parseCalendarDate,
  sameDay,
  sortCalendarEvents,
  weekDayKeys,
} from '../shared/calendarWorkspace'

describe('calendar workspace labels', () => {
  it('maps event types, statuses, and locations to friendly labels', () => {
    expect(calendarEventTypeLabel('signature_deadline')).toBe('Signature deadline')
    expect(calendarEventTypeLabel('field_visit')).toBe('Field visit')
    expect(calendarEventTypeLabel('unknown_type')).toBe('unknown type')
    expect(calendarEventTypeLabel(null)).toBe('Event')
    expect(calendarEventStatusLabel('confirmed')).toBe('confirmed')
    expect(calendarLocationLabel('virtual')).toBe('Virtual meeting')
    expect(calendarLocationLabel('client_location')).toBe('Client location')
    expect(calendarLocationLabel(null)).toBe('No location set')
  })

  it('assigns tones without depending on color alone', () => {
    expect(calendarEventTone('signature_deadline')).toBe('red')
    expect(calendarEventTone('invoice_due')).toBe('red')
    expect(calendarEventTone('appointment')).toBe('blue')
    expect(calendarEventTone('internal_meeting')).toBe('slate')
    expect(calendarEventTone('task_deadline')).toBe('gold')
    expect(calendarEventTone(null)).toBe('slate')
    expect(calendarEventStatusTone('cancelled')).toBe('red')
    expect(calendarEventStatusTone('confirmed')).toBe('green')
    expect(calendarEventStatusTone(null)).toBe('slate')
  })

  it('guards the union enums', () => {
    expect(isCalendarEventType('field_visit')).toBe(true)
    expect(isCalendarEventType('nope')).toBe(false)
    expect(isCalendarEventStatus('proposed')).toBe(true)
    expect(isCalendarEventStatus('rejected')).toBe(false)
    expect(isCalendarLocationType('office')).toBe(true)
    expect(isCalendarVisibility('internal')).toBe(true)
    expect(isCalendarVisibility('admin')).toBe(false)
    expect(CALENDAR_EVENT_TYPES).toContain('signature_deadline')
  })
})

describe('calendar date helpers', () => {
  it('parses ISO, space-separated, and date-only values', () => {
    expect(parseCalendarDate('2026-08-15T10:00:00').getFullYear()).toBe(2026)
    expect(parseCalendarDate('2026-08-15 10:00:00').getHours()).toBe(10)
    expect(dayKeyOfIso('2026-08-15T10:00:00')).toBe('2026-08-15')
    expect(dayKeyOfIso('2026-08-15 10:00:00')).toBe('2026-08-15')
    expect(dayKeyOfIso('2026-08-15')).toBe('2026-08-15')
    expect(sameDay('2026-08-15T23:59:00', '2026-08-15T00:01:00')).toBe(true)
    expect(sameDay('2026-08-15T23:59:00', '2026-08-16T00:01:00')).toBe(false)
  })

  it('produces day keys and week/month grids', () => {
    const d = new Date(2026, 7, 15) // Aug 15 2026
    expect(dayKey(d)).toBe('2026-08-15')
    const week = weekDayKeys(d)
    expect(week).toHaveLength(7)
    expect(week[0]).toBe('2026-08-09') // Sunday
    expect(week[6]).toBe('2026-08-15')
    const grid = monthGridDayKeys(d)
    expect(grid[0]).toBe('2026-07-26') // Aug 1 2026 is a Saturday -> grid opens on the prior Sunday
    expect(grid).toContain('2026-08-31')
    expect(grid).toContain('2026-09-05')
  })

  it('formats time windows and day labels', () => {
    expect(calendarTimeLabel('2026-08-15T09:30:00')).toMatch(/9:30|09:30/)
    expect(calendarWindowLabel('2026-08-15T09:30:00', '2026-08-15T10:00:00')).toMatch(/–/)
    expect(calendarWindowLabel('2026-08-15T09:30:00')).toMatch(/9:30|09:30/)
    const today = new Date()
    expect(calendarDayLabel(dayKey(today))).toBe('Today')
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    expect(calendarDayLabel(dayKey(tomorrow))).toBe('Tomorrow')
  })

  it('sorts events by start time and defaults durations', () => {
    const events = [
      { id: 'a', title: 'Late', startsAt: '2026-08-15T14:00:00' },
      { id: 'b', title: 'Early', startsAt: '2026-08-15T09:00:00' },
    ]
    expect(sortCalendarEvents(events).map((e) => e.id)).toEqual(['b', 'a'])
    expect(defaultEventDurationMinutes('phone_call')).toBe(30)
    expect(defaultEventDurationMinutes('consultation')).toBe(60)
    expect(defaultEventDurationMinutes('appointment')).toBe(60)
    expect(defaultEventDurationMinutes('task_deadline', true)).toBe(24 * 60)
  })
})

describe('calendar security + integrity', () => {
  it('canonical store enforces visibility and scoping columns', () => {
    const sql = readFileSync(new URL('../migrations/0075_calendar_events.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/CREATE TABLE calendar_events/)
    expect(sql).toMatch(/visibility\s+TEXT NOT NULL DEFAULT 'client'/i)
    expect(sql).toMatch(/client_visible\s+INTEGER NOT NULL DEFAULT 1/i)
    expect(sql).toMatch(/client_user_id\s+TEXT/i)
    expect(sql).toMatch(/starts_at\s+TEXT NOT NULL/i)
    expect(sql).toMatch(/event_type\s+TEXT NOT NULL/i)
  })

  it('never duplicates derived timestamps in the canonical store', () => {
    const sql = readFileSync(new URL('../migrations/0075_calendar_events.sql', import.meta.url), 'utf8')
    // Derived sources own their own scheduling timestamps; calendar_events
    // must not carry duplicates (due_date / expires_at / target_at / etc.).
    expect(sql).not.toMatch(/due_date/i)
    expect(sql).not.toMatch(/expires_at/i)
    expect(sql).not.toMatch(/target_at/i)
    // It may only reference those tables as deep links, never embed their rows.
    expect(sql).toMatch(/task_id\s+TEXT REFERENCES client_tasks\(id\)/)
  })

  it('scopes all calendar reads and blocks client internal visibility at the API layer', () => {
    const query = readFileSync(new URL('../functions/_lib/calendarQuery.ts', import.meta.url), 'utf8')
    expect(query).toMatch(/visibleClientIds/)
    expect(query).toContain("ce.visibility = 'client' AND ce.client_user_id")
    const routes = readFileSync(new URL('../functions/_lib/routes/calendarRoutes.ts', import.meta.url), 'utf8')
    expect(routes).toMatch(/portalCalendarRoutes\.use\('\*', requireUser\)/)
    expect(routes).toMatch(/adminCalendarRoutes\.use\('\*', requireStaff\)/)
    expect(routes).toMatch(/clients may only cancel events/)
    expect(routes).toMatch(/clients may not mark events internal/)
  })
})
