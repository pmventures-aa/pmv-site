import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../src/pages/admin/AdminCalendar.tsx', import.meta.url), 'utf8')
const grid = readFileSync(new URL('../src/components/calendar/CalendarGrid.tsx', import.meta.url), 'utf8')

// The trap: prev/next/today live INSIDE CalendarGrid, and the page used to
// swap the whole grid for an empty state when a view had no events. Landing on
// an empty month therefore removed every control for leaving it.
describe('an empty month is not a dead end', () => {
  it('keeps the navigation inside the grid', () => {
    expect(grid).toContain('aria-label="Previous"')
    expect(grid).toContain('aria-label="Next"')
  })

  it('never swaps the grid out for an empty state', () => {
    expect(page).not.toContain('<EmptyState label="No events match this view')
    // The only branch left is loading, and it renders a placeholder grid.
    expect(page).toContain('loading && events.length === 0 ? (\n          <CalendarSkeleton />')
  })

  it('reports emptiness beside the calendar instead of in place of it', () => {
    expect(page).toContain('!loading && events.length === 0 &&')
    expect(page).toContain('Nothing scheduled in this view.')
  })

  // A hidden filter that silently removes events is worse than no filter.
  it('warns when filters are the reason a view looks empty', () => {
    expect(page).toContain('Filters are on, so there may be events you are not seeing.')
  })
})

describe('the calendar is the first thing on the page', () => {
  it('folds six filter controls away instead of stacking them above the grid', () => {
    expect(page).toContain('<details className="group rounded-lg')
    expect(page).toContain('open={hasFilters}')
  })

  it('says whether anything is hidden while collapsed', () => {
    expect(page).toContain("{hasFilters ? 'Some events are hidden' : 'Showing everything'}")
  })
})

describe('loading', () => {
  it('is a month-shaped placeholder, not a line of text', () => {
    expect(page).toContain('function CalendarSkeleton')
    expect(page).toContain('length: 42')
    // The aria-label still says "Loading calendar", which is exactly what a
    // screen reader needs. What is gone is the visible line of text.
    expect(page).toContain('aria-label="Loading calendar"')
    expect(page).not.toMatch(/<p[^>]*>Loading calendar/)
  })
})

describe('the page carries its hub colour', () => {
  it('is tagged Delivery, like the work it shows', () => {
    expect(page).toContain('section="Delivery"')
  })
})
