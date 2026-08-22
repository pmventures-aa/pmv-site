import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const home = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8')

// An earlier pass put the wizard above the hero. That was wrong for this
// business: the hero is the pitch and it earned its place at the top. The
// wizard belongs immediately after it, small enough to read as a next step
// rather than a competing headline.

describe('the hero opens the page', () => {
  it('comes before the wizard', () => {
    const heroAt = home.indexOf('pmv-hero-story')
    const wizardAt = home.indexOf('<ScopeWizard source="home" compact />')
    expect(heroAt).toBeGreaterThan(-1)
    expect(wizardAt).toBeGreaterThan(heroAt)
  })

  it('keeps the copy that was asked for, unchanged', () => {
    expect(home).toContain("text: 'Professional Support.'")
    expect(home).toContain("text: 'One Call Away.'")
    expect(home).toContain('Business, property, and administrative matters handled through one trusted point of contact.')
    expect(home).toContain('Not sure which service you need? That is okay.')
  })

  it('commands the first screen without swallowing it whole', () => {
    // It was a full viewport, which meant nothing else was ever visible on
    // arrival. Tall enough to lead, short enough that the next block peeks.
    expect(home).toContain('min-h-[78vh]')
  })

  it('carries the page h1, and only one', () => {
    const h1s = home.match(/<h1[\s>]/g) ?? []
    expect(h1s).toHaveLength(1)
    expect((home.match(/<\/h1>/g) ?? []).length).toBe(1)
  })
})

describe('booking is reachable from the top', () => {
  it('offers a short call action beside the request action', () => {
    // Some people would rather talk than fill anything in.
    expect(home).toContain('to="/book" className={btnOutline}>Book a Call<')
  })
})

describe('the wizard is a next step, not a second hero', () => {
  it('sits directly after the hero rather than eighth of nine', () => {
    const heroClose = home.indexOf('</section>', home.indexOf('pmv-hero-story'))
    const wizardAt = home.indexOf('<ScopeWizard source="home" compact />')
    // Nothing but the wizard's own section between the hero and it.
    expect(home.slice(heroClose, wizardAt)).not.toContain('<PublicMetricsBand')
  })

  it('is visually smaller than the section it replaced', () => {
    // Was py-16 sm:py-24 with a 3xl/4xl heading; now tighter, with a heading
    // that cannot compete with the hero above it.
    expect(home).toContain('Two minutes. No account.')
    expect(home).toContain('text-xl font-bold tracking-[-.02em] text-white sm:text-2xl')
    expect(home).toContain('<section className="container-pmv py-10 sm:py-12">')
  })
})

describe('the monthly plans say what they are', () => {
  it('names who each plan is for', () => {
    // They were three cards with a name and a price and nothing else.
    expect(home).toContain('Owners and investors')
    expect(home).toContain('Businesses without the headcount')
    expect(home).toContain('Solo attorneys and firms')
  })

  it('explains what each one covers', () => {
    expect(home).toContain('inspections, service credits, storm coverage'.replace('inspections', 'Inspections'))
    expect(home).toContain('administrative capacity and project support')
    expect(home).toContain('Mobile notary, RON, courier, and courthouse coverage')
  })

  it('keeps the prices that were already published', () => {
    expect(home).toContain('From $89/mo')
    expect(home).toContain('From $199/mo')
    expect(home).toContain('From $99/mo')
  })

  it('frames the section so the three read as a set', () => {
    expect(home).toContain('Three retainers for the three kinds of work that come back every month')
    expect(home).toContain('Every plan is month to month')
  })
})

// "Really really long scroll" was not padding alone: the same message was on
// the page five times. The hero, "Three clear paths. One relationship.", "One
// Relationship. Multiple Capabilities. Less Runaround.", the situations block
// and the closing CTA all said some version of "you do not need to know which
// service you need". Two of those sat back to back.

describe('the page says each thing once', () => {
  it('drops the section that restated the one above it', () => {
    expect(home).not.toContain('Why Pinnacle')
    expect(home).not.toContain('One Relationship. Multiple Capabilities.')
    expect(home).not.toContain('whyPinnacle')
  })

  it('keeps the paths section, which is the actionable one of the pair', () => {
    // It routes people; the one removed only asserted.
    expect(home).toContain('Three clear paths. One relationship.')
    expect(home).toContain('What brings you to Pinnacle?')
  })

  it('keeps the portal section that the removed bullets duplicated', () => {
    expect(home).toContain('Client portal')
  })
})

describe('the page is physically shorter', () => {
  it('no section still uses the largest vertical padding', () => {
    // py-16 sm:py-24 on seven stacked sections is a lot of empty screen.
    expect(home).not.toContain('py-16 sm:py-24')
  })

  it('the hero no longer claims the entire first screen', () => {
    // Letting the next block peek tells a visitor there is more, which does
    // more for perceived length than any amount of copy trimming.
    expect(home).not.toContain('min-h-[calc(100vh-68px)]')
    expect(home).toContain('min-h-[78vh]')
  })

  it('still leads with the hero copy that was asked for', () => {
    expect(home).toContain("text: 'Professional Support.'")
    expect(home).toContain("text: 'One Call Away.'")
  })
})
