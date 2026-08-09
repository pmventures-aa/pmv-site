import { describe, expect, it } from 'vitest'
import { calculateInvoiceTotals } from '../functions/_lib/invoiceMath'

describe('invoice calculations', () => {
  it('calculates quantity, discounts, tax, and shipping in cents', () => {
    const result = calculateInvoiceTotals([
      {
        name: 'Implementation',
        quantity: 2,
        unit_price_cents: 12500,
        discount_cents: 2500,
        taxable: true,
        local_tax_rate: 6,
        national_tax_rate: 1,
      },
      {
        name: 'Training',
        quantity: 1,
        unit_price_cents: 5000,
        taxable: false,
      },
    ], 1500)

    expect(result.subtotal).toBe(30000)
    expect(result.discount).toBe(2500)
    expect(result.tax).toBe(1575)
    expect(result.shipping).toBe(1500)
    expect(result.total).toBe(30575)
  })

  it('never applies a discount beyond the line gross and clamps tax rates', () => {
    const result = calculateInvoiceTotals([
      {
        name: 'Service',
        quantity: 1,
        unit_price_cents: 1000,
        discount_cents: 5000,
        taxable: true,
        local_tax_rate: 500,
      },
    ])

    expect(result.discount).toBe(1000)
    expect(result.tax).toBe(0)
    expect(result.total).toBe(0)
  })

  it('normalizes missing names and negative monetary inputs safely', () => {
    const result = calculateInvoiceTotals([
      { name: '', quantity: -2, unit_price_cents: -100, discount_cents: -20 },
    ], -500)

    expect(result.items[0].name).toBe('Line item 1')
    expect(result.items[0].quantity).toBe(0)
    expect(result.items[0].unit_price_cents).toBe(0)
    expect(result.total).toBe(0)
  })
})
