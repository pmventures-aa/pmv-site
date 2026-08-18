// Cleaning property profile shape shared by the server (validation) and the
// client portal form. Access instructions are kept separate so they can be
// access-gated on read.

export interface CleaningPropertyProfile {
  id: string
  nickname: string | null
  propertyType: string | null
  address: string | null
  unit: string | null
  county: string | null
  bedrooms: number | null
  bathrooms: number | null
  beds: number | null
  squareFeet: number | null
  parking: string | null
  buildingEntry: string | null
  trashLocation: string | null
  supplyLocation: string | null
  laundryNotes: string | null
  linenStandards: string | null
  cleaningPreferences: string | null
  doNotTouch: string | null
  petNotes: string | null
  specialWarnings: string | null
  checkinTime: string | null
  checkoutTime: string | null
  emergencyContact: string | null
  /** Sensitive; present only when the caller is authorized to see it. */
  accessInstructions?: string | null
}

// Editable text fields shown on the client form, in display order. The value is
// the DB column; label drives the form. Access instructions are handled
// separately because of the access gate.
export const PROPERTY_TEXT_FIELDS: { column: string; label: string; multiline?: boolean }[] = [
  { column: 'nickname', label: 'Property nickname' },
  { column: 'address', label: 'Address' },
  { column: 'unit', label: 'Unit / suite' },
  { column: 'parking', label: 'Parking instructions', multiline: true },
  { column: 'building_entry', label: 'Building / gate entry', multiline: true },
  { column: 'trash_location', label: 'Trash location' },
  { column: 'supply_location', label: 'Where supplies are kept' },
  { column: 'laundry_notes', label: 'Laundry / washer-dryer notes', multiline: true },
  { column: 'linen_standards', label: 'Linen & towel standards', multiline: true },
  { column: 'cleaning_preferences', label: 'Cleaning preferences', multiline: true },
  { column: 'do_not_touch', label: 'Do-not-touch items', multiline: true },
  { column: 'pet_notes', label: 'Pets' },
  { column: 'special_warnings', label: 'Special warnings', multiline: true },
  { column: 'checkin_time', label: 'Check-in time' },
  { column: 'checkout_time', label: 'Check-out time' },
  { column: 'emergency_contact', label: 'Emergency contact' },
]

export const PROPERTY_COUNTIES = ['miami_dade', 'broward', 'palm_beach'] as const
export const PROPERTY_TYPES = ['house', 'condo', 'townhome', 'apartment', 'str', 'other'] as const

const TEXT_COLUMNS = new Set(PROPERTY_TEXT_FIELDS.map((f) => f.column))
const INT_COLUMNS = new Set(['bedrooms', 'bathrooms', 'beds', 'square_feet'])

export interface SanitizedProfile {
  text: Record<string, string | null>
  ints: Record<string, number | null>
  county: string | null
  propertyType: string | null
  accessInstructions: string | null
}

/** Coerce untrusted form input into safe column values. */
export function sanitizePropertyInput(body: Record<string, unknown>): SanitizedProfile {
  const text: Record<string, string | null> = {}
  for (const col of TEXT_COLUMNS) {
    const v = body[col]
    text[col] = typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null
  }
  const ints: Record<string, number | null> = {}
  for (const col of INT_COLUMNS) {
    const n = Number(body[col])
    ints[col] = Number.isFinite(n) && n >= 0 ? Math.min(100000, Math.round(n)) : null
  }
  const county = PROPERTY_COUNTIES.includes(body.county as (typeof PROPERTY_COUNTIES)[number]) ? String(body.county) : null
  const propertyType = PROPERTY_TYPES.includes(body.property_type as (typeof PROPERTY_TYPES)[number]) ? String(body.property_type) : null
  const access = typeof body.access_instructions === 'string' && body.access_instructions.trim()
    ? body.access_instructions.trim().slice(0, 2000)
    : null
  return { text, ints, county, propertyType, accessInstructions: access }
}
