import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Wide admin tables (min-w 520-980px) clip their trailing columns when scrolled
// on a phone. Every such table now pairs a mobile card list with the full
// desktop table, either via the shared CardList/DataCard primitives or a
// hand-rolled md:hidden list. This guards against a wide table shipping without
// a mobile alternative.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('admin tables are mobile-friendly', () => {
  it('ships shared card primitives in the admin UI kit', () => {
    const ui = read('../src/components/admin/ui.tsx')
    for (const name of ['export function TableScroll', 'export function CardList', 'export function DataCard', 'export function CardRow']) {
      expect(ui).toContain(name)
    }
  })

  // Files that carry a wide table and gained a mobile card fallback in this pass.
  const converted = [
    'SecurityCenter', 'UsersAdmin', 'ClientsList', 'AssignmentsAdmin', 'OpenItemsAdmin',
    'QuotesAdmin', 'ReportingCenter', 'StrPackages', 'JourneyAutomation', 'AutomationCenter',
    'CleaningDispatch', 'ManagementCenter', 'ClientDetail', 'ClientDetailModern',
  ]

  it('gives every converted admin table a mobile alternative and a desktop-only table', () => {
    for (const name of converted) {
      const src = read(`../src/pages/admin/${name}.tsx`)
      // A wide table is present...
      expect(src, `${name} should still have a wide table`).toMatch(/min-w-\[\d{3,}px\]/)
      // ...and it is gated for desktop (hidden ... md:block or md:table), with a
      // mobile card list alongside (md:hidden, directly or via CardList).
      const hasDesktopGate = /hidden[^"]*md:(block|table)/.test(src)
      const hasMobileCards = /md:hidden/.test(src) || /<CardList/.test(src)
      expect(hasDesktopGate, `${name} should hide its wide table below md`).toBe(true)
      expect(hasMobileCards, `${name} should render mobile cards`).toBe(true)
    }
  })
})
