import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const route = read('../functions/_lib/routes/externalCalendar.ts')
const ui = read('../src/pages/admin/settings/CalendarSyncSettings.tsx')
const freebusy = read('../functions/_lib/googleFreeBusy.ts')

// Freebusy fails open by design, so an expired or revoked Google grant looks
// like an empty calendar rather than an error. That is the right behaviour for
// an outage and a terrible one to leave invisible: the host silently stops
// being protected from double-booking. These make the broken state loud.

describe('a broken connection is not the same as no connection', () => {
  it('does not hide errored accounts from the status query', () => {
    // Filtering to status='active' made a dead grant read as "Not connected",
    // which is what let this fail silently.
    expect(route).not.toContain("AND a.status = 'active'\n       LIMIT 1")
    expect(route).toContain("a.status != 'disconnected'")
  })

  it('reports the status and the reason', () => {
    expect(route).toContain('a.status, a.last_error')
    expect(route).toContain("needs_reconnect: row.status === 'error'")
  })

  it('still excludes accounts the user deliberately disconnected', () => {
    expect(route).toContain("!= 'disconnected'")
  })
})

describe('the settings panel says what it costs', () => {
  it('renders a distinct reconnect state, not just a colour change', () => {
    expect(ui).toContain('needs_reconnect')
    expect(ui).toContain('Reconnect needed for')
  })

  it('explains the consequence rather than only the fault', () => {
    // "Reconnect needed" alone does not convey that bookings are exposed.
    expect(ui).toContain('not blocking consultation slots right now')
    expect(ui).toContain('times you are busy can still be booked')
  })

  it('surfaces what Google actually said', () => {
    expect(ui).toContain('Google said:')
  })

  it('offers Reconnect instead of Sync now when the grant is dead', () => {
    // Sync now cannot succeed without a working token; offering it would just
    // fail and teach the user the button is broken.
    expect(ui).toContain('Reconnect\n                    </button>')
  })

  it('keeps the healthy state describing what the connection does', () => {
    expect(ui).toContain('Busy times block consultation slots')
  })
})

describe('the failure that gets recorded', () => {
  it('marks the account errored when a refresh fails', () => {
    expect(freebusy).toContain("SET status = 'error', last_error = ?")
  })

  it('only uses accounts that are actually active', () => {
    expect(freebusy).toContain("status = 'active'")
  })
})
