export const PROPERTY_STATUSES = ['active', 'under_contract', 'sold', 'inactive'] as const
export const PROPERTY_OCCUPANCIES = ['owner', 'tenant', 'vacant', 'unknown'] as const
export const PROPERTY_TYPES = ['residential', 'commercial', 'multi_family', 'land', 'other'] as const

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number]
export type PropertyOccupancy = (typeof PROPERTY_OCCUPANCIES)[number]
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyStatus(value: string | null | undefined): value is PropertyStatus {
  return !!value && (PROPERTY_STATUSES as readonly string[]).includes(value)
}

export function isPropertyOccupancy(value: string | null | undefined): value is PropertyOccupancy {
  return !!value && (PROPERTY_OCCUPANCIES as readonly string[]).includes(value)
}

export function propertyStatusLabel(status: string | null | undefined): string {
  if (status === 'under_contract') return 'Under contract'
  if (status === 'sold') return 'Sold'
  if (status === 'inactive') return 'Inactive'
  return 'Active'
}

export function occupancyLabel(value: string | null | undefined): string {
  if (value === 'owner') return 'Owner occupied'
  if (value === 'tenant') return 'Tenant occupied'
  if (value === 'vacant') return 'Vacant'
  return 'Not provided'
}

export function propertyTypeLabel(value: string | null | undefined): string {
  if (value === 'multi_family') return 'Multi-family'
  if (!value) return 'Property'
  return value.replace(/_/g, ' ')
}

export function propertyDisplayName(row: { name?: string | null; address?: string | null }): string {
  const name = String(row.name || '').trim()
  if (name) return name
  const address = String(row.address || '').trim()
  return address || 'Property'
}

export function propertyCityLine(row: { city?: string | null; state?: string | null; postal_code?: string | null }): string {
  const city = String(row.city || '').trim()
  const state = String(row.state || '').trim()
  const zip = String(row.postal_code || '').trim()
  return [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

export function trimPropertyField(value: unknown, max = 200): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  return text.slice(0, max)
}

export function optionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  if (!Number.isInteger(n) || n < 0 || n > 100000) return null
  return n
}
