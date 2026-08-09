export interface InvoiceLineInput {
  name: string
  description?: string
  quantity?: number
  unit_price_cents?: number
  discount_cents?: number
  shipped?: boolean
  taxable?: boolean
  local_tax_rate?: number
  national_tax_rate?: number
}

export interface NormalizedInvoiceLine {
  name: string
  description: string | null
  quantity: number
  unit_price_cents: number
  discount_cents: number
  shipped: number
  taxable: number
  local_tax_rate: number
  national_tax_rate: number
  sort_order: number
}

function cents(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function rate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

export function calculateInvoiceTotals(lines: InvoiceLineInput[], shippingCents = 0) {
  let subtotal = 0
  let discount = 0
  let tax = 0

  const items: NormalizedInvoiceLine[] = lines.slice(0, 100).map((raw, index) => {
    const quantity = typeof raw.quantity === 'number' && Number.isFinite(raw.quantity)
      ? Math.max(0, raw.quantity)
      : 1
    const unitPrice = cents(raw.unit_price_cents)
    const gross = Math.round(quantity * unitPrice)
    const itemDiscount = Math.min(gross, cents(raw.discount_cents))
    const taxableBase = Math.max(0, gross - itemDiscount)
    const localTaxRate = rate(raw.local_tax_rate)
    const nationalTaxRate = rate(raw.national_tax_rate)
    const itemTax = raw.taxable
      ? Math.round(taxableBase * (localTaxRate + nationalTaxRate) / 100)
      : 0

    subtotal += gross
    discount += itemDiscount
    tax += itemTax

    return {
      name: String(raw.name || '').trim().slice(0, 200) || `Line item ${index + 1}`,
      description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 1000) || null : null,
      quantity,
      unit_price_cents: unitPrice,
      discount_cents: itemDiscount,
      shipped: raw.shipped ? 1 : 0,
      taxable: raw.taxable ? 1 : 0,
      local_tax_rate: localTaxRate,
      national_tax_rate: nationalTaxRate,
      sort_order: index,
    }
  })

  const shipping = cents(shippingCents)
  const total = Math.max(0, subtotal - discount + tax + shipping)
  return { items, subtotal, discount, tax, shipping, total }
}
