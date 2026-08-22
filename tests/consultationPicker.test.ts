import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { firstOfMonth, monthGrid, shiftMonth } from '../shared/dayBlocking'

// The booking page used to render every open slot on one page. Measured
// against the live schedule that was 8 days x 10 slots = 80 buttons in a
// single scroll, which is a wall rather than a choice. It now picks a date
// first, the way every scheduling tool people already know works.

const page = readFileSync(new URL('../src/pages/public/Consultation.tsx', import.meta.url), 'utf8')

describe('the picker asks for a date before a time', () => {
  it('renders a month grid, not a flat list of every day', () => {
    expect(page).toContain('function SlotPicker')
    expect(page).toContain("from '../../../shared/dayBlocking'")
    expect(page).toContain('monthGrid(month)')
    expect(page).toContain('WEEKDAY_INITIALS.map')
  })

  it('shows only the chosen day, so one day of times is on screen', () => {
    expect(page).toContain('openDay.slots.map')
    // The old shape mapped every day and then every slot inside it.
    expect(page).not.toContain('days.map((day) => (')
  })

  it('opens on the next available day instead of an empty column', () => {
    expect(page).toContain('setActiveDay((current)')
    expect(page).toContain('days[0].dateKey')
  })

  it('keeps the selected day across a reload when it is still open', () => {
    // A 409 reloads availability. Resetting to day one there would throw away
    // a choice that is very likely still valid.
    expect(page).toContain('days.some((d) => d.dateKey === current)')
  })

  it('only lets the calendar walk months that hold availability', () => {
    expect(page).toContain('const canGoBack = month > firstOfMonth(firstKey)')
    expect(page).toContain('const canGoForward = month < firstOfMonth(lastKey)')
  })

  it('disables days with nothing open rather than hiding them', () => {
    expect(page).toContain('disabled={!open}')
    expect(page).toContain('no times')
  })
})

describe('the details form', () => {
  it('appears after a time is chosen, instead of sitting disabled', () => {
    // The old page rendered the whole form at opacity-50 with every field
    // disabled, which is noise the visitor cannot act on.
    expect(page).not.toContain("className={selected ? '' : 'opacity-50'}")
    expect(page).not.toContain('disabled={!selected}')
    expect(page).toContain('Pick a different time')
  })

  it('still confirms exactly which time is being booked', () => {
    expect(page).toContain('longLabel(selected.startsAt)')
  })

  it('keeps the phone requirement tied to choosing a phone call', () => {
    expect(page).toContain("required={meetingFormat === 'phone'}")
  })
})

describe('loading', () => {
  it('lays out skeletons in the shape of the thing that is coming', () => {
    expect(page).toContain('function LoadingPanel')
    expect(page).toContain('animate-pulse')
    expect(page).not.toContain('Loading available times...')
  })
})

// The two calendars in this app - HQ time-off and public booking - share one
// grid helper so they cannot disagree about what a month looks like.
describe('the shared month grid holds up for booking too', () => {
  it('keeps a stable six-week shape as the visitor pages through', () => {
    let month = firstOfMonth('2026-08-14')
    for (let i = 0; i < 14; i += 1) {
      const grid = monthGrid(month)
      expect(grid.weeks).toHaveLength(6)
      expect(grid.weeks.every((w) => w.length === 7)).toBe(true)
      month = shiftMonth(month, 1)
    }
  })

  it('walks from the live schedule window into the next month', () => {
    expect(shiftMonth(firstOfMonth('2026-08-25'), 1)).toBe('2026-09-01')
    expect(monthGrid('2026-09-01').label).toBe('September 2026')
  })
})
