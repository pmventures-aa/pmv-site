import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const zoom = read('../functions/_lib/zoom.ts')
const route = read('../functions/_lib/routes/availability.ts')
const ui = read('../src/pages/admin/settings/ConsultationBookingSettings.tsx')

// Booking deliberately succeeds when Zoom is unconfigured, so the only symptom
// of a missing secret was a confirmation email with no join link. Nothing in
// HQ said so, which made "is Zoom set up" unanswerable without taking a real
// booking.

describe('the settings page can answer whether Zoom is set up', () => {
  it('reports each credential separately, not one flag', () => {
    // "Zoom does not work" and "you set two of the three" need different
    // actions from whoever reads the page.
    expect(zoom).toContain('hasAccountId')
    expect(zoom).toContain('hasClientId')
    expect(zoom).toContain('hasClientSecret')
    expect(zoom).toContain('configured: hasAccountId && hasClientId && hasClientSecret')
  })

  it('travels with the schedules the page already loads', () => {
    expect(route).toContain('zoom: zoomConfigStatus(c.env)')
    expect(ui).toContain('setZoom(res.zoom ?? null)')
  })

  it('is behind staff auth like the rest of the schedule data', () => {
    expect(route).toContain("availabilityAdminRoutes.get('/availability/schedules', requireStaff")
  })
})

describe('no credential value crosses the wire', () => {
  it('sends booleans, never the secrets themselves', () => {
    const status = zoom.slice(zoom.indexOf('export function zoomConfigStatus'))
    // Presence checks only. A client secret that reaches a browser is leaked
    // no matter who was looking at the page.
    expect(status).toContain('!!env.ZOOM_CLIENT_SECRET?.trim()')
    expect(status).not.toMatch(/clientSecret:\s*env\.ZOOM_CLIENT_SECRET/)
    expect(status).not.toMatch(/accountId:\s*env\.ZOOM_ACCOUNT_ID/)
  })

  it('does show the host email, which is not a secret', () => {
    // It is committed in wrangler.toml, and showing it is how you catch
    // meetings being created under the wrong account.
    expect(zoom).toContain("hostEmail: env.ZOOM_HOST_EMAIL?.trim() || 'me'")
    expect(ui).toContain('{zoom.hostEmail}')
  })
})

describe('the copy tells the truth about the degraded state', () => {
  it('says bookings still work without Zoom', () => {
    expect(ui).toContain('virtual bookings will be taken without a join link')
  })

  it('names the missing variables so the fix is obvious', () => {
    expect(ui).toContain('ZOOM_ACCOUNT_ID')
    expect(ui).toContain('ZOOM_CLIENT_SECRET')
    expect(ui).toContain("present ? 'set' : 'missing'")
  })
})
