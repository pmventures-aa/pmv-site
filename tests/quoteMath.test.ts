import { describe, expect, it } from 'vitest'
import { normalizeQuoteLines } from '../functions/_lib/routes/quotesAdmin'

describe('branded quote line math', () => {
  it('totals billable lines and skips optional ones', () => {
    const { lines, subtotal, total } = normalizeQuoteLines([
      { name: 'Move-out cleaning', quantity: 1, unit_price_cents: 42500 },
      { name: 'Occupancy visits', quantity: 12, unit_price_cents: 6500 },
      { name: 'RON backup (billed only if used)', quantity: 1, unit_price_cents: 4500, is_optional: true },
    ])
    expect(lines).toHaveLength(3)
    expect(subtotal).toBe(42500 + 12 * 6500)
    expect(total).toBe(120500)
  })

  it('applies line discounts without going negative', () => {
    const { total } = normalizeQuoteLines([
      { name: 'Deep clean', quantity: 1, unit_price_cents: 30000, discount_cents: 5000 },
    ])
    expect(total).toBe(25000)
    const clamped = normalizeQuoteLines([
      { name: 'Credit-heavy line', quantity: 1, unit_price_cents: 1000, discount_cents: 5000 },
    ])
    expect(clamped.total).toBe(0)
    // An oversized discount on one line must not erase other billable lines.
    const multi = normalizeQuoteLines([
      { name: 'Service A', quantity: 1, unit_price_cents: 10000, discount_cents: 15000 },
      { name: 'Service B', quantity: 1, unit_price_cents: 5000 },
    ])
    expect(multi.discount).toBe(10000)
    expect(multi.total).toBe(5000)
  })

  it('drops unnamed lines and clamps quantity', () => {
    const { lines } = normalizeQuoteLines([
      { name: '', unit_price_cents: 9900 },
      { name: 'Filing run', quantity: 100000, unit_price_cents: 16500 },
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(999)
  })
})
