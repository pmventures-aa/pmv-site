import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const route = read('../functions/_lib/routes/availability.ts')
const ui = read('../src/pages/admin/settings/ConsultationBookingSettings.tsx')
const booking = read('../functions/_lib/routes/consultationBooking.ts')

// A real booking came through as "Format: Video call" with no Zoom link. That
// message only renders when isZoomConfigured is true, so the secrets were set
// and the Zoom call itself failed. The reason went to console.error, which
// nobody reads, and the first symptom was a booked call with no way to join.

describe('the failure is reachable without taking a booking', () => {
  it('exercises the same call a booking makes', () => {
    expect(route).toContain("availabilityAdminRoutes.post('/availability/zoom/test'")
    expect(route).toContain('createZoomMeeting(c.env, {')
    expect(route).toContain("topic: 'Pinnacle connection test'")
  })

  it('cleans up after itself', () => {
    // Otherwise every diagnostic leaves a meeting on the host's calendar.
    expect(route).toContain('deleteZoomMeeting(c.env, created.value.meetingId)')
    expect(route).toContain('cleanedUp: removed.ok')
  })

  it('reports a failed cleanup rather than hiding it', () => {
    expect(ui).toContain('zoomTest.cleanedUp === false')
    expect(ui).toContain('Pinnacle connection test')
  })

  it('is admin-gated', () => {
    expect(route).toMatch(/availability\/zoom\/test', requireAdmin/)
  })
})

describe('it says what Zoom actually said', () => {
  it('passes the reason and detail through', () => {
    // detail carries Zoom's status and message, which is what distinguishes a
    // missing scope from an inactive app from a bad host address.
    expect(route).toContain('reason: created.reason, detail: created.detail')
    expect(ui).toContain('{zoomTest.detail}')
  })

  it('names the missing variables when nothing is set at all', () => {
    expect(route).toContain("reason: 'not_configured'")
    expect(route).toContain('`Not set: ${missing.join(\', \')}`')
  })

  it('offers the three explanations that actually cause this', () => {
    expect(ui).toContain('missing the meeting write scope')
    expect(ui).toContain('never')
    expect(ui).toContain('is not a licensed user on the account')
  })
})

describe('the booking path is unchanged by the diagnostic', () => {
  it('still takes the booking when Zoom fails', () => {
    expect(booking).toContain('else console.error(\'[zoom] consultation meeting create failed\'')
    expect(booking).toContain('No Zoom link was generated for this booking.')
  })

  it('still only warns when Zoom is configured but produced nothing', () => {
    // With Zoom unconfigured the line is omitted, which is what made the
    // received email proof that the credentials are present.
    expect(booking).toContain("meetingFormat === 'virtual' && isZoomConfigured(c.env)")
  })
})
