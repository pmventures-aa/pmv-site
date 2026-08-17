import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Env } from '../functions/_lib/types'

// Capture every outbound send and let individual tests force a failure.
const sends: Array<{ to: string | string[]; subject: string; attachments?: unknown[]; idempotencyKey?: string }> = []
let failNextSendFor: ((to: string) => boolean) | null = null

vi.mock('../functions/_lib/email', () => ({
  escapeHtml: (s: string) => s,
  sendEmail: vi.fn(async (_env: Env, opts: { to: string; subject: string; attachments?: unknown[]; idempotencyKey?: string }) => {
    if (failNextSendFor && failNextSendFor(String(opts.to))) throw new Error('simulated send failure')
    sends.push({ to: opts.to, subject: opts.subject, attachments: opts.attachments, idempotencyKey: opts.idempotencyKey })
  }),
}))

// Audit + layout are best-effort side channels; stub them to no-ops so the
// D1 mock only has to model the calendar_invites surface under test.
const audits: Array<{ action: string; entityId: string }> = []
vi.mock('../functions/_lib/auditLog', () => ({
  logAudit: vi.fn(async (_env: Env, entry: { action: string; entityId: string }) => { audits.push({ action: entry.action, entityId: entry.entityId }) }),
}))
vi.mock('../functions/_lib/emailTemplates/layout', () => ({
  renderPinnacleEmailLayout: (o: { title: string }) => `<html>${o.title}</html>`,
}))

import { dispatchCalendarInvites } from '../functions/_lib/calendarInviteDispatch'

interface Store {
  events: Record<string, Record<string, unknown>>
  users: Record<string, Record<string, unknown>>
  invites: Array<Record<string, unknown>>
}

function makeEnv(store: Store): Env {
  const preparer = (sql: string) => {
    const s = sql.trim().toLowerCase()
    let bound: unknown[] = []
    const api = {
      bind(...args: unknown[]) { bound = args; return api },
      async run() {
        if (s.startsWith('insert into calendar_invites')) {
          const [id, pmv_event_id, recipient_id, recipient_type, uid, sequence, last_method, last_status, material_hash, last_sent_at] = bound
          store.invites.push({ id, pmv_event_id, recipient_id, recipient_type, uid, sequence, last_method, last_status, material_hash, last_sent_at, send_status: 'PENDING', last_error_code: null })
          return { success: true }
        }
        if (s.startsWith('update calendar_invites set sequence')) {
          const [sequence, last_method, last_status, material_hash, last_sent_at, , id] = bound
          const row = store.invites.find((r) => r.id === id)
          if (row) Object.assign(row, { sequence, last_method, last_status, material_hash, last_sent_at, send_status: 'PENDING' })
          return { success: true }
        }
        if (s.startsWith('update calendar_invites set send_status')) {
          const [send_status, last_error_code, pmv_event_id, recipient_id] = bound
          const row = store.invites.find((r) => r.pmv_event_id === pmv_event_id && r.recipient_id === recipient_id)
          if (row) Object.assign(row, { send_status, last_error_code })
          return { success: true }
        }
        throw new Error(`unhandled run SQL: ${sql}`)
      },
      async first<T>(): Promise<T | null> {
        if (s.includes('from calendar_events')) {
          return (store.events[bound[0] as string] as unknown as T) ?? null
        }
        if (s.includes('from users')) {
          return (store.users[bound[0] as string] as unknown as T) ?? null
        }
        if (s.includes('from calendar_invites')) {
          const [pmv_event_id, recipient_id] = bound
          const row = store.invites.find((r) => r.pmv_event_id === pmv_event_id && r.recipient_id === recipient_id)
          return (row as unknown as T) ?? null
        }
        throw new Error(`unhandled first SQL: ${sql}`)
      },
    }
    return api
  }
  return { DB: { prepare: preparer } } as unknown as Env
}

function baseStore(): Store {
  return {
    events: {
      evt_1: {
        id: 'evt_1', title: 'Property Inspection', description: null,
        starts_at: '2026-08-18T14:00:00Z', ends_at: '2026-08-18T15:00:00Z', all_day: 0,
        timezone: 'America/New_York', status: 'proposed',
        location_type: 'field', location_name: null, address: '123 Main St, Miami, FL', meeting_url: null,
        client_user_id: 'usr_c', vendor_user_id: 'usr_v',
      },
    },
    users: {
      usr_c: { id: 'usr_c', email: 'client@example.com', full_name: 'Casey Client', calendar_invites_enabled: 1 },
      usr_v: { id: 'usr_v', email: 'vendor@example.com', full_name: 'Val Vendor', calendar_invites_enabled: 1 },
    },
    invites: [],
  }
}

beforeEach(() => { sends.length = 0; audits.length = 0; failNextSendFor = null })

describe('dispatchCalendarInvites — fan-out', () => {
  it('sends one invite per resolved recipient (client + vendor)', async () => {
    const store = baseStore()
    const summary = await dispatchCalendarInvites(makeEnv(store), { eventId: 'evt_1', transition: 'REQUEST' })
    expect(summary).toEqual({ sent: 2, skipped: 0, failed: 0 })
    expect(sends.map((x) => x.to).sort()).toEqual(['client@example.com', 'vendor@example.com'])
    expect(store.invites).toHaveLength(2)
    for (const inv of store.invites) expect(inv.send_status).toBe('SENT')
  })
})

describe('dispatchCalendarInvites — idempotency', () => {
  it('re-processing the identical transition does not re-send or bump SEQUENCE', async () => {
    const store = baseStore()
    const env = makeEnv(store)
    await dispatchCalendarInvites(env, { eventId: 'evt_1', transition: 'REQUEST' })
    expect(sends).toHaveLength(2)
    const seqs = store.invites.map((i) => i.sequence)
    const again = await dispatchCalendarInvites(env, { eventId: 'evt_1', transition: 'REQUEST' })
    expect(again).toEqual({ sent: 0, skipped: 2, failed: 0 })
    expect(sends).toHaveLength(2) // unchanged
    expect(store.invites.map((i) => i.sequence)).toEqual(seqs) // no bump
  })
})

describe('dispatchCalendarInvites — material change bumps SEQUENCE', () => {
  it('a reschedule increments SEQUENCE and re-sends on the same UID', async () => {
    const store = baseStore()
    const env = makeEnv(store)
    await dispatchCalendarInvites(env, { eventId: 'evt_1', transition: 'REQUEST' })
    const clientInvite0 = store.invites.find((i) => i.recipient_id === 'usr_c')!
    const uid0 = clientInvite0.uid
    expect(clientInvite0.sequence).toBe(0)

    // Change the time + confirm -> RESCHEDULE.
    store.events.evt_1.starts_at = '2026-08-19T14:00:00Z'
    store.events.evt_1.status = 'confirmed'
    sends.length = 0
    const summary = await dispatchCalendarInvites(env, { eventId: 'evt_1', transition: 'RESCHEDULE' })
    expect(summary.sent).toBe(2)
    const clientInvite1 = store.invites.find((i) => i.recipient_id === 'usr_c')!
    expect(clientInvite1.sequence).toBe(1)
    expect(clientInvite1.uid).toBe(uid0) // same UID across the lifecycle
    expect(clientInvite1.last_status).toBe('CONFIRMED')
    expect(store.invites).toHaveLength(2) // still one row per recipient
  })
})

describe('dispatchCalendarInvites — opt-out', () => {
  it('skips a recipient with calendar_invites_enabled = 0 without sending or writing a row', async () => {
    const store = baseStore()
    store.users.usr_c.calendar_invites_enabled = 0
    const summary = await dispatchCalendarInvites(makeEnv(store), { eventId: 'evt_1', transition: 'REQUEST' })
    expect(summary).toEqual({ sent: 1, skipped: 1, failed: 0 })
    expect(sends.map((x) => x.to)).toEqual(['vendor@example.com'])
    expect(store.invites).toHaveLength(1)
    expect(store.invites[0].recipient_id).toBe('usr_v')
  })
})

describe('dispatchCalendarInvites — failure isolation', () => {
  it('one recipient send failure does not block the other; row is marked FAILED', async () => {
    const store = baseStore()
    failNextSendFor = (to) => to === 'client@example.com'
    const summary = await dispatchCalendarInvites(makeEnv(store), { eventId: 'evt_1', transition: 'REQUEST' })
    expect(summary).toEqual({ sent: 1, skipped: 0, failed: 1 })
    expect(sends.map((x) => x.to)).toEqual(['vendor@example.com'])
    const clientRow = store.invites.find((i) => i.recipient_id === 'usr_c')!
    const vendorRow = store.invites.find((i) => i.recipient_id === 'usr_v')!
    expect(clientRow.send_status).toBe('FAILED')
    expect(clientRow.last_error_code).toBe('send_failed')
    expect(vendorRow.send_status).toBe('SENT')
  })
})

describe('dispatchCalendarInvites — cancel path', () => {
  it('emits METHOD:CANCEL semantics via last_method and audits a cancellation', async () => {
    const store = baseStore()
    const env = makeEnv(store)
    await dispatchCalendarInvites(env, { eventId: 'evt_1', transition: 'REQUEST' })
    audits.length = 0
    const summary = await dispatchCalendarInvites(env, { eventId: 'evt_1', transition: 'CANCEL' })
    expect(summary.sent).toBe(2)
    for (const inv of store.invites) {
      expect(inv.last_method).toBe('CANCEL')
      expect(inv.last_status).toBe('CANCELLED')
    }
    expect(audits.every((a) => a.action === 'CALENDAR_INVITE_CANCELLED')).toBe(true)
  })
})

describe('dispatchCalendarInvites — missing event', () => {
  it('is a no-op when the event does not exist', async () => {
    const store = baseStore()
    const summary = await dispatchCalendarInvites(makeEnv(store), { eventId: 'nope', transition: 'REQUEST' })
    expect(summary).toEqual({ sent: 0, skipped: 0, failed: 0 })
    expect(sends).toHaveLength(0)
  })
})
