import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Env } from '../functions/_lib/types'

// Providers already have a calendar and are not going to adopt ours. An .ics
// invite reaches Google, Apple, Outlook, and Fastmail alike with no OAuth and
// nothing for us to store. These tests pin the behaviour that makes that
// trustworthy: the entry MOVES on a reschedule rather than duplicating, it
// disappears on a cancel, and a calendar failure never breaks the assignment.

const dispatched: Array<{ eventId: string; transition: string }> = []
vi.mock('../functions/_lib/calendarInviteDispatch', () => ({
  dispatchCalendarInvites: vi.fn(async (_env: Env, o: { eventId: string; transition: string }) => {
    dispatched.push({ eventId: o.eventId, transition: o.transition })
    return { sent: 1, skipped: 0, failed: 0 }
  }),
}))
let idCounter = 0
vi.mock('../functions/_lib/crypto', () => ({ uuid: () => `evt-${++idCounter}` }))

import { cancelAssignmentCalendar, syncAssignmentToCalendar } from '../functions/_lib/fieldAssignmentCalendar'

type Row = Record<string, unknown>
let events: Row[] = []
let links: Row[] = []
let failWrites = false

function env(): Env {
  const prepare = (sql: string) => {
    const s = sql.trim().toLowerCase().replace(/\s+/g, ' ')
    let bound: unknown[] = []
    const api = {
      bind(...a: unknown[]) { bound = a; return api },
      async first<T>() {
        if (s.includes('from field_assignment_calendar_links')) {
          return (links.find((l) => l.assignment_id === bound[0]) ?? null) as T | null
        }
        throw new Error(`unhandled first: ${sql}`)
      },
      async run() {
        if (failWrites) throw new Error('simulated D1 failure')
        if (s.startsWith('insert into calendar_events')) {
          events.push({ id: bound[0], title: bound[1], description: bound[2], starts_at: bound[3], ends_at: bound[4], location_type: bound[5], location_name: bound[6], address: bound[7], assigned_user_id: bound[9], client_user_id: bound[10], vendor_user_id: bound[11], status: 'confirmed' })
        } else if (s.startsWith('insert into field_assignment_calendar_links')) {
          links.push({ assignment_id: bound[0], event_id: bound[1] })
        } else if (s.startsWith('update calendar_events set title')) {
          const row = events.find((e) => e.id === bound[bound.length - 1])
          if (row) Object.assign(row, { title: bound[0], starts_at: bound[1], ends_at: bound[2], location_type: bound[3], address: bound[5] })
        } else if (s.startsWith("update calendar_events set status = 'cancelled'")) {
          const row = events.find((e) => e.id === bound[0])
          if (row) row.status = 'cancelled'
        } else if (s.startsWith('update field_assignment_calendar_links')) {
          /* touch */
        } else throw new Error(`unhandled run: ${sql}`)
        return { success: true }
      },
    }
    return api
  }
  return { DB: { prepare } } as unknown as Env
}

const ASSIGNMENT = {
  id: 'asn-1',
  kind: 'field',
  service_key: 'mobile_notary',
  title: 'Estate signing',
  site_label: 'Client home',
  site_address: '100 Main St',
  site_city: 'Boca Raton',
  site_state: 'FL',
  site_postal_code: '33432',
  scheduled_at: '2026-09-01T14:00:00.000Z',
  client_user_id: 'client-1',
  vendor_user_id: 'vendor-1',
  assigned_by_user_id: 'staff-1',
  notes: 'Two deeds and a POA.',
}

function reset() {
  events = []; links = []; dispatched.length = 0; idCounter = 0; failWrites = false
}

describe('an assignment becomes a calendar event', () => {
  it('writes the event, links it, and confirms it to the provider', async () => {
    reset()
    const id = await syncAssignmentToCalendar(env(), ASSIGNMENT)
    expect(id).toBe('evt-1')
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Estate signing')
    expect(events[0].vendor_user_id).toBe('vendor-1')
    expect(events[0].client_user_id).toBe('client-1')
    // The provider is the one doing the work, so the event is assigned to them.
    expect(events[0].assigned_user_id).toBe('vendor-1')
    expect(events[0].address).toBe('100 Main St Boca Raton, FL 33432')
    expect(dispatched).toEqual([{ eventId: 'evt-1', transition: 'CONFIRM' }])
  })

  it('marks a RON as virtual and a site visit as field', async () => {
    reset()
    await syncAssignmentToCalendar(env(), ASSIGNMENT)
    expect(events[0].location_type).toBe('field')
    reset()
    await syncAssignmentToCalendar(env(), { ...ASSIGNMENT, kind: 'ron' })
    expect(events[0].location_type).toBe('virtual')
  })

  it('gives the event an end time so it is not a zero-length blip', async () => {
    reset()
    await syncAssignmentToCalendar(env(), ASSIGNMENT)
    const span = Date.parse(String(events[0].ends_at)) - Date.parse(String(events[0].starts_at))
    expect(span).toBeGreaterThan(0)
  })

  // An invite with no time is noise in someone's inbox.
  it('stays off the calendar until there is a date', async () => {
    reset()
    const id = await syncAssignmentToCalendar(env(), { ...ASSIGNMENT, scheduled_at: null })
    expect(id).toBeNull()
    expect(events).toHaveLength(0)
    expect(dispatched).toHaveLength(0)
  })
})

// This is the property that separates a working invite from calendar spam.
describe('rescheduling moves the entry rather than duplicating it', () => {
  it('reuses the linked event and sends RESCHEDULE', async () => {
    reset()
    await syncAssignmentToCalendar(env(), ASSIGNMENT)
    const again = await syncAssignmentToCalendar(env(), { ...ASSIGNMENT, scheduled_at: '2026-09-02T16:00:00.000Z' })

    expect(again).toBe('evt-1')
    expect(events).toHaveLength(1)
    expect(events[0].starts_at).toBe('2026-09-02T16:00:00.000Z')
    expect(dispatched.map((d) => d.transition)).toEqual(['CONFIRM', 'RESCHEDULE'])
    expect(new Set(dispatched.map((d) => d.eventId)).size).toBe(1)
  })
})

describe('cancelling takes it off the provider calendar', () => {
  it('cancels the event and sends CANCEL', async () => {
    reset()
    await syncAssignmentToCalendar(env(), ASSIGNMENT)
    dispatched.length = 0
    await cancelAssignmentCalendar(env(), 'asn-1', 'staff-1')
    expect(events[0].status).toBe('cancelled')
    expect(dispatched).toEqual([{ eventId: 'evt-1', transition: 'CANCEL' }])
  })

  it('does nothing for an assignment that never had an event', async () => {
    reset()
    await cancelAssignmentCalendar(env(), 'never-scheduled', 'staff-1')
    expect(dispatched).toHaveLength(0)
  })
})

// The assignment is the source of truth. A provider missing an invite is a
// worse day; an assignment failing to save is a worse system.
describe('the calendar can fail without taking the work with it', () => {
  it('returns null instead of throwing when the write fails', async () => {
    reset()
    failWrites = true
    await expect(syncAssignmentToCalendar(env(), ASSIGNMENT)).resolves.toBeNull()
  })

  it('swallows a cancel failure too', async () => {
    reset()
    await syncAssignmentToCalendar(env(), ASSIGNMENT)
    failWrites = true
    await expect(cancelAssignmentCalendar(env(), 'asn-1', 'staff-1')).resolves.toBeUndefined()
  })
})

describe('the three moments that create or move an invite', () => {
  const fieldWork = readFileSync(new URL('../functions/_lib/routes/fieldWork.ts', import.meta.url), 'utf8')
  const proposals = readFileSync(new URL('../functions/_lib/routes/vendorProposals.ts', import.meta.url), 'utf8')

  it('syncs when an assignment is created', () => {
    expect(fieldWork).toContain('if (row) await syncAssignmentToCalendar(c.env, row)')
  })

  it('cancels when the assignment is cancelled', () => {
    expect(fieldWork).toContain('await cancelAssignmentCalendar(c.env, row.id, user.id)')
  })

  it('syncs when a proposal is released into work', () => {
    expect(proposals).toContain('await syncAssignmentToCalendar(c.env, {')
    expect(proposals).toContain('scheduled_at: scheduledAt')
  })
})

describe('the migration stays re-runnable', () => {
  const sql = readFileSync(new URL('../migrations/0101_field_assignment_calendar_links.sql', import.meta.url), 'utf8')
  const body = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

  it('uses a link table rather than an un-re-runnable ALTER', () => {
    expect(body).toContain('CREATE TABLE IF NOT EXISTS field_assignment_calendar_links')
    expect(body).not.toMatch(/\bALTER\s+TABLE\b/i)
  })

  it('guards every create', () => {
    const creates = body.match(/CREATE\s+(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?[A-Za-z_]+/gi) ?? []
    expect(creates.length).toBe(2)
    for (const c of creates) expect(c.toUpperCase()).toContain('IF NOT EXISTS')
  })

  it('keeps one event per assignment', () => {
    expect(body).toMatch(/assignment_id TEXT PRIMARY KEY/i)
  })
})
