export type OperatingWorld = 'property' | 'documents' | 'business' | 'funding' | 'general'

export const SERVICE_WORLD: Record<string, OperatingWorld> = {
  property_management: 'property',
  property_inspections: 'property',
  mobile_notary: 'documents',
  remote_online_notary: 'documents',
  document_courier: 'documents',
  consulting: 'business',
  merchant_services: 'business',
  admin_support: 'business',
  funding: 'funding',
}

export const VENDOR_ENROLLMENT_WORLD: Record<string, OperatingWorld> = {
  property_field: 'property',
  document_courier: 'documents',
  mobile_notary: 'documents',
  ron: 'documents',
  merchant_technology: 'business',
  business_operations: 'business',
  bookkeeping_financial: 'funding',
  other: 'general',
}

export const WORLD_PRIORITY: OperatingWorld[] = ['property', 'documents', 'funding', 'business', 'general']

export function resolveWorld(serviceKeys: string[]): OperatingWorld {
  const worlds = new Set(
    serviceKeys.map((key) => SERVICE_WORLD[key]).filter((world): world is OperatingWorld => !!world),
  )
  for (const world of WORLD_PRIORITY) {
    if (worlds.has(world)) return world
  }
  return 'general'
}

export function resolveVendorWorld(enrollments: string[], vendorCategory?: string | null): OperatingWorld {
  const fromEnrollments = resolveWorldFromMap(enrollments, VENDOR_ENROLLMENT_WORLD)
  if (fromEnrollments !== 'general') return fromEnrollments
  const category = (vendorCategory || '').toLowerCase()
  if (/propert|inspect|clean|field|turnover|reo/.test(category)) return 'property'
  if (/notary|ron|sign|courier|document/.test(category)) return 'documents'
  if (/fund|book|account|financ/.test(category)) return 'funding'
  if (/ops|consult|admin|merchant|pos|payment/.test(category)) return 'business'
  return 'general'
}

function resolveWorldFromMap(keys: string[], map: Record<string, OperatingWorld>): OperatingWorld {
  const worlds = new Set(keys.map((key) => map[key]).filter((world): world is OperatingWorld => !!world))
  for (const world of WORLD_PRIORITY) {
    if (worlds.has(world)) return world
  }
  return 'general'
}

export interface WorkspaceContext {
  service_keys: string[]
  party_type: 'employee' | 'vendor' | null
  vendor_category: string | null
  role_name: string | null
  world: OperatingWorld
}

export const JOB_WORLD: Record<string, OperatingWorld> = {
  cleaning_turnover: 'property',
  property_inspection: 'property',
  eviction_reo: 'property',
  documents_notary: 'documents',
  business_operations: 'business',
  pos_payments: 'business',
  other: 'general',
}

export const WORLD_JOBS: Record<OperatingWorld, string[]> = {
  property: ['cleaning_turnover', 'property_inspection', 'eviction_reo'],
  documents: ['documents_notary'],
  business: ['business_operations', 'pos_payments'],
  funding: ['business_operations', 'other'],
  general: ['cleaning_turnover', 'property_inspection', 'documents_notary', 'eviction_reo', 'business_operations', 'pos_payments', 'other'],
}

export function parseOperatingWorld(value: string | null | undefined): OperatingWorld | null {
  if (value === 'property' || value === 'documents' || value === 'business' || value === 'funding' || value === 'general') return value
  return null
}

export function jobsForWorld(world: OperatingWorld): string[] {
  return WORLD_JOBS[world]
}

export function worldFromPublicParams(input: {
  world?: string | null
  service?: string | null
  job?: string | null
  source?: string | null
  audience?: string | null
  family?: string | null
  guide?: string | null
  entry?: string | null
}): OperatingWorld {
  const explicit = parseOperatingWorld(input.world)
  if (explicit) return explicit
  if (input.service) {
    const fromService = SERVICE_WORLD[input.service]
    if (fromService) return fromService
  }
  if (input.job) {
    const fromJob = JOB_WORLD[input.job]
    if (fromJob && fromJob !== 'general') return fromJob
  }
  const blob = [input.source, input.audience, input.family, input.guide, input.entry].filter(Boolean).join(' ').toLowerCase()
  if (/moving-data|data-between|switching-pos|pos-payment|business-transition|administrative-support|merchant|ops-on-call/.test(blob)) return 'business'
  if (/propert|clean|inspect|eviction|reo|landlord|investor|agent|broker|field-photo|bpo/.test(blob)) return 'property'
  if (/document|notary|sign|courier|legal|attorney|mobile-hub|mobile_hub/.test(blob)) return 'documents'
  if (/fund|lender|financ/.test(blob)) return 'funding'
  if (/business|ops|admin|operator|payment/.test(blob)) return 'business'
  return 'general'
}
