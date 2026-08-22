import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../src/pages/admin/SettingsAdmin.tsx', import.meta.url), 'utf8')

// Below xl the settings sections are a <select>, not the nav list. The select
// rendered visibleTabs while the search box filtered matchingTabs, so typing
// into the search box on a phone narrowed a list that was not on screen and
// left the only usable control untouched.

describe('the settings search works on a phone', () => {
  it('drives the mobile select from the same filter as the nav', () => {
    expect(page).toContain('{selectableTabs.map(item =>')
    expect(page).not.toContain('{visibleTabs.map(item => <option')
  })

  it('keeps the nav list desktop-only, so the select is the mobile control', () => {
    expect(page).toContain('className={`${inputCls} mb-3 xl:hidden`}')
    expect(page).toContain('className="hidden space-y-1 xl:block"')
  })
})

describe('the select can never be left unusable', () => {
  it('falls back to every section when a search matches nothing', () => {
    // An empty select on mobile would strand the user on whatever tab they
    // happened to be on, with no way to leave it.
    expect(page).toContain('matchingTabs.length ? matchingTabs : visibleTabs')
  })

  it('always contains the current tab', () => {
    // A select whose value has no matching option renders blank in most
    // browsers and reads as a broken control.
    expect(page).toContain('base.some(item => item.key === tab)')
    expect(page).toContain('...visibleTabs.filter(item => item.key === tab)')
  })
})

describe('the sections themselves are unchanged', () => {
  it('still offers Consultation Booking to any staff member', () => {
    // The Calendar tab was the Google Calendar sync connector and went with
    // that integration. Consultation Booking is the surface that survived, and
    // a missing tab there is a layout problem, never a permission one.
    expect(page).not.toContain("key: 'calendar', label: 'Calendar'")
    expect(page).toContain("key: 'booking', label: 'Consultation Booking'")
    expect(page).toContain("TABS.filter((item) => !['deletions', 'templates'].includes(item.key) || caps.is_owner)")
  })

  it('still accepts the section from the url, so a direct link lands right', () => {
    expect(page).toContain("searchParams.get('tab')")
    expect(page).toContain('isSettingsTab(fromUrl)')
  })
})
