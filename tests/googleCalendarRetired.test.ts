import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The Google Calendar integration is retired: it needed sensitive-scope
// verification, only ever worked for Google users, and meant holding OAuth
// tokens. Providers and hosts now get .ics invites and a subscribe feed
// instead, which work everywhere and store nothing.
//
// The critical distinction these tests protect: Google SIGN-IN via Auth0 is a
// completely separate thing and must survive. Removing it would lock people
// out of their accounts.

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const gone = (p: string) => !existsSync(new URL(`../${p}`, import.meta.url))

describe('the calendar integration is gone', () => {
  it.each([
    'functions/_lib/googleCalendarPush.ts',
    'functions/_lib/googleFreeBusy.ts',
    'functions/_lib/externalCalendar.ts',
    'functions/_lib/routes/externalCalendar.ts',
    'src/pages/admin/settings/CalendarSyncSettings.tsx',
  ])('%s is deleted', (path) => {
    expect(gone(path)).toBe(true)
  })

  it('nothing imports it any more', () => {
    for (const path of [
      'functions/_lib/routes/consultationBooking.ts',
      'functions/_lib/routes/availability.ts',
      'functions/api/[[route]].ts',
      'src/pages/admin/SettingsAdmin.tsx',
    ]) {
      const src = read(path)
      expect(src).not.toContain('googleCalendarPush')
      expect(src).not.toContain('googleFreeBusy')
      expect(src).not.toContain('externalCalendar')
      expect(src).not.toContain('CalendarSyncSettings')
    }
  })

  it('booking no longer writes to or reads from a Google calendar', () => {
    const booking = read('functions/_lib/routes/consultationBooking.ts')
    expect(booking).not.toContain('pushConsultationToGoogle')
    expect(booking).not.toContain('removeConsultationFromGoogle')
  })

  // Losing free/busy is the real trade. Availability now knows only about work
  // booked through Pinnacle, and the code should say so rather than leaving a
  // reader to wonder why the merge disappeared.
  it('availability says plainly that it only knows Pinnacle work', () => {
    const availability = read('functions/_lib/routes/availability.ts')
    expect(availability).not.toContain('googleBusySpans')
    expect(availability).toContain('Only work booked through Pinnacle counts as busy')
  })
})

// This is the one that matters most. Google here is a LOGIN provider.
describe('Google sign-in is untouched', () => {
  it('is still offered alongside Microsoft', () => {
    const config = read('functions/_lib/auth0Config.ts')
    expect(config).toContain("Auth0ProviderKey = 'google' | 'microsoft'")
    expect(config).toContain('AUTH0_CONNECTION_GOOGLE')
  })

  it('still renders on the sign-in surface', () => {
    const providers = read('src/components/auth/Auth0Providers.tsx')
    expect(providers).toContain("provider.key === 'google'")
  })
})

// A page describing scopes the app no longer requests is a false statement on
// a public URL, not merely stale content.
describe('the public pages no longer describe permissions we do not use', () => {
  it('removes the Google review page, its route, and its sitemap entry', () => {
    expect(gone('src/pages/public/AboutThisApp.tsx')).toBe(true)
    expect(read('src/main.tsx')).not.toContain('about-this-app')
    expect(read('public/sitemap.xml')).not.toContain('about-this-app')
  })

  it('removes the Google user data section from the privacy policy', () => {
    const privacy = read('src/pages/public/Privacy.tsx')
    expect(privacy).not.toContain('google-user-data')
    expect(privacy).not.toContain('calendar.readonly')
    expect(privacy).not.toContain('Google')
  })
})
