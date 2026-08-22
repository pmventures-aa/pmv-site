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

// The first real run came back "Zoom token exchange returned 400" and nothing
// else. The status alone cannot distinguish a wrong account id from an app
// that is not a Server-to-Server app, and the body carrying that answer was
// being discarded on credential-safety grounds.

describe('the token failure says which credential Zoom objected to', () => {
  const zoom = read('../functions/_lib/zoom.ts')

  it('includes Zoom\'s own error text, not just the status', () => {
    expect(zoom).toContain('Zoom token exchange returned ${response.status}: ${safeZoomError(body, config)}')
    expect(zoom).not.toContain('detail: `Zoom token exchange returned ${response.status}` }')
  })

  it('keeps the fields Zoom puts the diagnosis in', () => {
    expect(zoom).toContain('const parts = [parsed.error, parsed.reason, parsed.message]')
  })

  it('scrubs every configured credential out of whatever came back', () => {
    // The body is echoed to a page and a log; a credential riding along in an
    // error string is still a leaked credential.
    expect(zoom).toContain('text.split(secret).join(\'[redacted]\')')
    expect(zoom).toContain('config.clientSecret, config.accountId, config.clientId')
  })

  it('scrubs longest first so an overlapping credential is not partly missed', () => {
    expect(zoom).toContain('.sort((a, b) => b.length - a.length)')
  })

  it('caps the length, so a hostile body cannot flood the page', () => {
    expect(zoom).toContain('return text.slice(0, 200)')
  })

  it('routes the meeting-create body through the same scrub', () => {
    expect(zoom).toContain('Zoom create returned ${response.status}: ${safeZoomError(body, config)}')
    expect(zoom).not.toContain('${body.slice(0, 200)}')
  })
})

describe('the advice matches which call failed', () => {
  const ui = read('../src/pages/admin/settings/ConsultationBookingSettings.tsx')

  it('sends a rejected token to the app type and account id', () => {
    expect(ui).toContain("zoomTest.reason === 'auth_failed'")
    expect(ui).toContain('Server-to-Server OAuth</strong> app')
    expect(ui).toContain('ZOOM_ACCOUNT_ID')
  })

  it('names a disabled app on the token branch, where it actually surfaces', () => {
    // A deactivated Server-to-Server app rejects its own credentials at the
    // token exchange, not at meeting create. This was filed under the create
    // branch, which sent the reader to the scopes screen for an app that was
    // simply switched off.
    expect(ui).toContain('activate it on the app&rsquo;s Activation tab')
    const authBranch = ui.slice(ui.indexOf("zoomTest.reason === 'auth_failed'"), ui.indexOf('The credentials worked'))
    expect(authBranch).toContain('disabled')
  })

  it('keeps the scope advice for the case it actually describes', () => {
    expect(ui).toContain('The credentials worked and the meeting call was refused.')
    expect(ui).toContain('missing the meeting write scope')
    // Activation no longer appears here.
    const createBranch = ui.slice(ui.indexOf('The credentials worked'))
    expect(createBranch.slice(0, 500)).not.toContain('never activated')
  })
})
