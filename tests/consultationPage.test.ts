import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const page = read('../src/pages/public/Consultation.tsx')
const router = read('../src/main.tsx')

describe('public consultation booking page', () => {
  it('is routed, lazily, alongside its manage view', () => {
    expect(router).toContain("import('./pages/public/Consultation')")
    expect(router).toContain('path="/consultation"')
    expect(router).toContain('path="/consultation/booking"')
  })

  it('renders slot times in the visitor timezone, not the host timezone', () => {
    // Slots arrive as UTC instants; toLocaleTimeString with no explicit zone
    // renders them where the visitor actually is.
    expect(page).toContain('resolvedOptions().timeZone')
    expect(page).toContain('toLocaleTimeString(undefined')
    expect(page).toContain('Times in your timezone')
    // The zone is named next to the choice so the pick is unambiguous.
    expect(page).toContain('timeZoneName')
  })

  it('recovers when the chosen slot is taken between render and submit', () => {
    expect(page).toContain('err.status === 409')
    expect(page).toContain('setSelected(null)')
  })

  it('degrades to a phone number instead of a dead end', () => {
    expect(page).toContain('FallbackPanel')
    expect(page).toContain('(561) 388-7879')
    // Not bookable and load failure both land on the fallback.
    expect(page).toContain('Online booking is not open right now')
  })

  it('only ever renders a join link, never a host link', () => {
    expect(page).toContain('meetingUrl')
    expect(page).not.toMatch(/start_url|startUrl|hostUrl/)
  })

  // The form used to render disabled at half opacity before a time was
  // picked. It is now not rendered at all until one is, which is the same
  // guarantee enforced more strongly: there is no field to reach, not merely
  // a greyed one. The assertion follows the mechanism.
  it('offers no booking form until a time is chosen', () => {
    expect(page).toContain('? (\n            <form onSubmit={submit}')
    expect(page).not.toContain('disabled={!selected}')
  })

  it('addresses an existing booking only by its token', () => {
    expect(page).toContain("new URLSearchParams(window.location.search).get('ref')")
    expect(page).toContain('/consultation/booking/${encodeURIComponent(ref)}')
  })

  it('carries no em dashes, which the release gate rejects in src', () => {
    expect(page).not.toContain('—')
  })
})
