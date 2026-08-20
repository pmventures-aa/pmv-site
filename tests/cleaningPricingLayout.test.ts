import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../src/pages/admin/CleaningPricingAdmin.tsx', import.meta.url), 'utf8')

// The editor used to be a tall stack of always-expanded panels (four full
// service panels + add-ons + promos + payout + territories). It is now a
// compact accordion with tabbed service pricing and a sticky Save bar.
describe('cleaning pricing editor layout', () => {
  it('collapses sections into an accordion instead of always-open panels', () => {
    expect(page).toContain('function Section(')
    expect(page).toContain('<details')
    // The five groups are titled sections.
    for (const title of ['Service pricing', 'Add-ons', 'Recurring discounts & promotion', 'Payout, margin & adjustments', 'Service areas']) {
      expect(page).toContain(title)
    }
  })

  it('shows one service at a time via tabs instead of four stacked panels', () => {
    expect(page).toContain("role=\"tablist\"")
    expect(page).toContain('activeService')
    // The tier grid renders the active service only, not every service.
    expect(page).toContain('active.tiers.map')
    expect(page).not.toContain('config.services.map((service, si) => (\n        <Panel')
  })

  it('keeps a sticky action bar so Save is always reachable', () => {
    expect(page).toContain('sticky top-0')
    expect(page).toContain('Save Pricing')
  })
})
