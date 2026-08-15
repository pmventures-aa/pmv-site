export type QuoteLineInput = {
  offering_id?: string | null
  name?: string
  description?: string
  quantity?: number
  unit_price_cents?: number
  discount_cents?: number
  is_optional?: boolean
  is_pass_through?: boolean
}

export type CatalogOffering = {
  id: string
  name: string
  description: string | null
  starting_price_cents: number | null
  pricing_label: string | null
}

/** Primary catalog offering when converting a scope request into a quote line. */
export const SCOPE_JOB_PRIMARY_OFFERING: Record<string, string> = {
  cleaning_turnover: 'property-moveout-clean',
  property_inspection: 'field-driveby',
  documents_notary: 'notary-local',
  eviction_reo: 'eviction-notice-prep',
  business_operations: 'consult-discovery',
  pos_payments: 'pos-environment-review',
  other: 'consult-discovery',
}

const PHOTO_OFFERING_BY_LABEL: Record<string, string> = {
  'Quick exterior (3-6 photos)': 'field-exterior-light',
  'Exterior + street scenes': 'field-street-scenes',
  'Interior photo package': 'interior-lockbox',
  'BPO photo set - exterior': 'bpo-photos-exterior',
  'BPO photo set - interior / full': 'bpo-photos-interior',
  'Licensed exterior BPO': 'bpo-exterior',
  'Licensed interior BPO': 'bpo-interior',
}

const REPORT_OFFERING_BY_LABEL: Record<string, string> = {
  'Occupancy confirmation': 'occupancy',
  'Condition / walkthrough report': 'field-driveby',
  'Move-in / move-out condition report': 'moveout',
  'Insurance / underwriting package': 'insurance-photo',
  'Rehab / construction progress': 'qc-progress',
  'Damage assessment': 'disaster-doc',
  'Rent-ready / punch list': 'rentready-lockbox',
}

export function formatEstimateRange(lowCents: number | null, highCents: number | null): string | null {
  if (!lowCents || lowCents <= 0) return null
  if (!highCents || highCents <= lowCents) return formatCents(lowCents)
  return `${formatCents(lowCents)}–${formatCents(highCents)}`
}

export function estimateMidpointCents(lowCents: number | null, highCents: number | null): number | null {
  if (!lowCents || lowCents <= 0) return null
  if (!highCents || highCents <= lowCents) return lowCents
  return Math.round((lowCents + highCents) / 2)
}

export function applyCatalogToQuoteLines(
  raw: QuoteLineInput[],
  catalog: Map<string, CatalogOffering>,
): QuoteLineInput[] {
  return raw.map((line) => {
    const offeringId = typeof line.offering_id === 'string' ? line.offering_id.trim() : ''
    if (!offeringId) return line
    const offering = catalog.get(offeringId)
    if (!offering) return line
    const customDescription = typeof line.description === 'string' ? line.description.trim() : ''
    return {
      ...line,
      offering_id: offeringId,
      name: offering.name,
      description: customDescription || offering.description || line.description || '',
      unit_price_cents: offering.starting_price_cents ?? line.unit_price_cents,
    }
  })
}

export function offeringIdForScopePhoto(label: string): string | null {
  const trimmed = label.trim()
  return PHOTO_OFFERING_BY_LABEL[trimmed] || null
}

export function offeringIdForScopeReport(label: string): string | null {
  const trimmed = label.trim()
  return REPORT_OFFERING_BY_LABEL[trimmed] || null
}

export function buildScopeIntroMessage(input: {
  contactName: string
  jobLabel: string
  propertyAddress: string
  estimateRange: string | null
  summary: string
}): string {
  const pieces = [
    `Hi ${input.contactName.split(/\s+/)[0] || 'there'},`,
    '',
    `Thank you for the ${input.jobLabel.toLowerCase()} request. Based on what you shared, here is a scoped quote for review.`,
  ]
  if (input.propertyAddress) pieces.push('', `Property / location: ${input.propertyAddress}`)
  if (input.estimateRange) pieces.push('', `Planning range from your intake: ${input.estimateRange}`)
  if (input.summary.trim()) pieces.push('', input.summary.trim())
  pieces.push('', 'If anything needs to change before you accept, reply and we will update the quote.')
  return pieces.join('\n')
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
