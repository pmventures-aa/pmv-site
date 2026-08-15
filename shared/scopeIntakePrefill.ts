import { resolveScopeEntry } from './scopeEntries'
import {
  SCOPE_JOB_PRIMARY_OFFERING,
  buildScopeIntroMessage,
  estimateMidpointCents,
  formatEstimateRange,
  offeringIdForScopePhoto,
  offeringIdForScopeReport,
  type CatalogOffering,
} from './quoteCatalog'

export type ScopeAnswerValue = string | number | boolean | string[]

export type ScopeIntakeRow = {
  id: string
  job_type: string
  service_key: string | null
  location_type: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  timing: string | null
  details: string | null
  contact_name: string
  email: string
  phone: string | null
  answers_json: string | null
  estimate_low_cents: number | null
  estimate_high_cents: number | null
  reserved_user_id: string | null
  created_at: string
}

export type QuoteLinePrefill = {
  offering_id: string | null
  name: string
  description: string
  quantity: string
  unit_price: string
  is_optional: boolean
  is_pass_through: boolean
}

export function parseScopeAnswers(json: string | null | undefined): Record<string, ScopeAnswerValue> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, ScopeAnswerValue> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) out[key] = value.map((item) => String(item)).filter(Boolean)
      else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function answerText(value: ScopeAnswerValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function isYes(value: ScopeAnswerValue | undefined): boolean {
  if (typeof value === 'boolean') return value
  const text = answerText(value).trim().toLowerCase()
  return text === 'yes' || text === 'true' || text === '1'
}

export function propertyAddressFromScope(row: ScopeIntakeRow, answers: Record<string, ScopeAnswerValue> = parseScopeAnswers(row.answers_json)): string {
  const fromAnswers = answerText(answers.meeting_location) || answerText(answers.property_address) || answerText(answers.signer_location) || answerText(answers.pickup)
  if (fromAnswers) return fromAnswers
  return [row.city, row.state, row.postal_code].filter(Boolean).join(', ')
}

export function formatScopeAnswersSummary(row: ScopeIntakeRow): string {
  const answers = parseScopeAnswers(row.answers_json)
  const entry = resolveScopeEntry({ job: row.job_type, service: row.service_key || undefined })
  const labels = new Map((entry?.questions || []).map((question) => [question.key, question.label]))
  const lines: string[] = []
  if (row.timing) lines.push(`Timing: ${row.timing}`)
  if (row.location_type) lines.push(`Location: ${row.location_type === 'remote' ? 'Remote / nationwide' : 'On site'}`)
  for (const [key, value] of Object.entries(answers)) {
    const text = answerText(value)
    if (!text) continue
    lines.push(`${labels.get(key) || key.replace(/_/g, ' ')}: ${text}`)
  }
  if (row.details) lines.push(row.details)
  return lines.join('\n')
}

function moneyFromCents(cents: number | null): string {
  if (!cents || cents <= 0) return '0.00'
  return (cents / 100).toFixed(2)
}

function catalogLine(
  offeringId: string | null,
  fallbackName: string,
  fallbackDescription: string,
  fallbackCents: number | null,
  catalog?: Map<string, CatalogOffering>,
): QuoteLinePrefill {
  const offering = offeringId ? catalog?.get(offeringId) : undefined
  const priceCents = fallbackCents ?? offering?.starting_price_cents ?? null
  return {
    offering_id: offeringId,
    name: offering?.name || fallbackName,
    description: offering?.description || fallbackDescription,
    quantity: '1',
    unit_price: moneyFromCents(priceCents),
    is_optional: false,
    is_pass_through: false,
  }
}

export function quotePrefillFromScope(
  row: ScopeIntakeRow,
  catalog?: Map<string, CatalogOffering>,
): {
  title: string
  recipient_name: string
  recipient_email: string
  recipient_phone: string
  property_address: string
  intro_message: string
  lines: QuoteLinePrefill[]
} {
  const answers = parseScopeAnswers(row.answers_json)
  const entry = resolveScopeEntry({ job: row.job_type, service: row.service_key || undefined })
  const jobLabel = entry?.pickerLabel || row.job_type.replace(/_/g, ' ')
  const address = propertyAddressFromScope(row, answers)
  const occupied = isYes(answers.occupied)
  const photos = answerText(answers.photos_required)
  const reports = answerText(answers.reports_required)
  const estimateRange = formatEstimateRange(row.estimate_low_cents, row.estimate_high_cents)
  const midpoint = estimateMidpointCents(row.estimate_low_cents, row.estimate_high_cents)
  const primaryOfferingId = SCOPE_JOB_PRIMARY_OFFERING[row.job_type] || null
  const lines: QuoteLinePrefill[] = []

  const primaryDescription = [
    row.timing,
    address,
    estimateRange ? `Planning range ${estimateRange}` : '',
  ].filter(Boolean).join(' · ')

  lines.push(catalogLine(
    primaryOfferingId,
    jobLabel,
    primaryDescription,
    midpoint,
    catalog,
  ))

  if (occupied) {
    lines.push(catalogLine(
      'occupancy-notice',
      'Occupied-property coordination',
      'Access, occupant notice, and on-site coordination from the scope answers.',
      null,
      catalog,
    ))
  }

  if (photos && !/^no\b/i.test(photos)) {
    const photoOfferingId = offeringIdForScopePhoto(photos)
    lines.push(catalogLine(
      photoOfferingId,
      'Photo package',
      photos,
      null,
      catalog,
    ))
  }

  if (reports && !/^no\b/i.test(reports)) {
    const reportOfferingId = offeringIdForScopeReport(reports)
    lines.push(catalogLine(
      reportOfferingId,
      'Written report',
      reports,
      null,
      catalog,
    ))
  }

  return {
    title: `${jobLabel} quote`,
    recipient_name: row.contact_name,
    recipient_email: row.email,
    recipient_phone: row.phone || '',
    property_address: address,
    intro_message: buildScopeIntroMessage({
      contactName: row.contact_name,
      jobLabel,
      propertyAddress: address,
      estimateRange,
      summary: formatScopeAnswersSummary(row),
    }),
    lines,
  }
}

export function fieldPrefillFromScope(row: ScopeIntakeRow): {
  kind: 'field' | 'ron'
  service_key: string
  title: string
  site_address: string
  site_city: string
  site_state: string
  site_postal_code: string
  notes: string
  new_client: { full_name: string; email: string; phone: string }
} {
  const answers = parseScopeAnswers(row.answers_json)
  const entry = resolveScopeEntry({ job: row.job_type, service: row.service_key || undefined })
  const notaryKind = answerText(answers.notary_kind).toLowerCase()
  const ron = row.location_type === 'remote' || notaryKind.includes('remote') || notaryKind.includes('ron')
  return {
    kind: ron ? 'ron' : 'field',
    service_key: row.service_key || entry?.serviceKey || (ron ? 'ron' : 'mobile_notary'),
    title: entry?.pickerLabel || row.job_type.replace(/_/g, ' '),
    site_address: propertyAddressFromScope(row, answers),
    site_city: row.city || '',
    site_state: row.state || '',
    site_postal_code: row.postal_code || '',
    notes: formatScopeAnswersSummary(row),
    new_client: {
      full_name: row.contact_name,
      email: row.email,
      phone: row.phone || '',
    },
  }
}
