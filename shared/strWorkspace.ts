// Shared STR Turnover & Property Support workspace.
// Pure helpers shared by the Hono API layer, HQ, Client Portal, and the
// public site. No I/O here so it is unit-testable.

export const STR_SERVICE_KEY = 'str_turnover'
export const STR_SERVICE_LABEL = 'STR Turnover & Property Support'

// ---------------------------------------------------------------------------
// Service packages
// ---------------------------------------------------------------------------
export const STR_PACKAGES = ['guest_ready', 'guest_ready_plus', 'managed'] as const
export type StrPackageKey = (typeof STR_PACKAGES)[number]

export function isStrPackageKey(value: string | null | undefined): value is StrPackageKey {
  return !!value && (STR_PACKAGES as readonly string[]).includes(value)
}

export function strPackageLabel(key: string | null | undefined): string {
  if (key === 'guest_ready') return 'Guest Ready Turnover'
  if (key === 'guest_ready_plus') return 'Guest Ready+'
  if (key === 'managed') return 'Pinnacle Managed Turnover'
  return 'Turnover service'
}

export function strPackageShortLabel(key: string | null | undefined): string {
  if (key === 'guest_ready') return 'Guest Ready'
  if (key === 'guest_ready_plus') return 'Guest Ready+'
  if (key === 'managed') return 'Managed'
  return 'Service'
}

// ---------------------------------------------------------------------------
// Turnover lifecycle
// ---------------------------------------------------------------------------
export const TURNOVER_STATUSES = [
  'scheduled',
  'offered',
  'accepted',
  'en_route',
  'in_progress',
  'issue_reported',
  'at_risk',
  'verification_needed',
  'guest_ready',
  'completed',
  'cancelled',
] as const
export type TurnoverStatus = (typeof TURNOVER_STATUSES)[number]

export function isTurnoverStatus(value: string | null | undefined): value is TurnoverStatus {
  return !!value && (TURNOVER_STATUSES as readonly string[]).includes(value)
}

// Internal (HQ) labels for the operational status.
export function turnoverStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'scheduled': return 'Scheduled'
    case 'offered': return 'Offer pending'
    case 'accepted': return 'Assigned'
    case 'en_route': return 'En route'
    case 'in_progress': return 'In progress'
    case 'issue_reported': return 'Issue flagged'
    case 'at_risk': return 'At risk'
    case 'verification_needed': return 'Awaiting verification'
    case 'guest_ready': return 'Guest ready'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    default: return 'Scheduled'
  }
}

// Client-safe presentation — the spec explicitly separates internal status
// from what a guest-ready report / portal shows.
export function turnoverClientStatus(status: string | null | undefined): string {
  switch (status) {
    case 'scheduled':
    case 'offered':
      return 'Scheduled'
    case 'accepted':
      return 'Assigned'
    case 'en_route':
    case 'in_progress':
      return 'In Progress'
    case 'issue_reported':
      return 'Issue Flagged'
    case 'at_risk':
      return 'At Risk'
    case 'verification_needed':
      return 'Finishing Up'
    case 'guest_ready':
      return 'Guest Ready'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Scheduled'
  }
}

export function turnoverClientDescription(status: string | null | undefined): string {
  switch (status) {
    case 'scheduled':
    case 'offered':
      return 'Your turnover is scheduled and we are confirming coverage.'
    case 'accepted':
      return 'A Pinnacle provider is confirmed for this turnover.'
    case 'en_route':
      return 'Your provider is on the way to the property.'
    case 'in_progress':
      return 'Your turnover is underway at the property.'
    case 'issue_reported':
      return 'A condition was flagged during this turnover. Pinnacle is handling it and may reach out if needed.'
    case 'at_risk':
      return 'This turnover needs attention to stay on schedule. Pinnacle is on it.'
    case 'verification_needed':
      return 'The work is done and Pinnacle is doing the final review.'
    case 'guest_ready':
      return 'Your property is guest ready. The turnover report is available below.'
    case 'completed':
      return 'This turnover is complete.'
    case 'cancelled':
      return 'This turnover was cancelled.'
    default:
      return 'Your turnover is scheduled.'
  }
}

export function turnoverStatusTone(status: string | null | undefined): 'gold' | 'green' | 'blue' | 'slate' | 'red' {
  switch (status) {
    case 'guest_ready':
    case 'completed':
      return 'green'
    case 'scheduled':
    case 'offered':
    case 'accepted':
      return 'blue'
    case 'en_route':
    case 'in_progress':
    case 'verification_needed':
      return 'gold'
    case 'issue_reported':
    case 'at_risk':
      return 'red'
    default:
      return 'slate'
  }
}

// Statuses that keep a turnover visible on an active board.
export function turnoverIsActive(status: string | null | undefined): boolean {
  return status !== 'completed' && status !== 'cancelled'
}

// ---------------------------------------------------------------------------
// Issues / exceptions
// ---------------------------------------------------------------------------
export const ISSUE_TYPES = [
  'damage',
  'missing_item',
  'maintenance',
  'supply_shortage',
  'excess_condition',
  'access_problem',
  'safety_concern',
  'other',
] as const
export type IssueType = (typeof ISSUE_TYPES)[number]

export function isIssueType(value: string | null | undefined): value is IssueType {
  return !!value && (ISSUE_TYPES as readonly string[]).includes(value)
}

export function issueTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'damage': return 'Damage'
    case 'missing_item': return 'Missing item'
    case 'maintenance': return 'Maintenance'
    case 'supply_shortage': return 'Supply shortage'
    case 'excess_condition': return 'Excess condition'
    case 'access_problem': return 'Access problem'
    case 'safety_concern': return 'Safety concern'
    case 'other': return 'Other'
    default: return 'Issue'
  }
}

export const ISSUE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number]

export function isIssueSeverity(value: string | null | undefined): value is IssueSeverity {
  return !!value && (ISSUE_SEVERITIES as readonly string[]).includes(value)
}

export function issueSeverityLabel(severity: string | null | undefined): string {
  switch (severity) {
    case 'low': return 'Low'
    case 'medium': return 'Medium'
    case 'high': return 'High'
    case 'critical': return 'Critical'
    default: return 'Medium'
  }
}

export function issueSeverityTone(severity: string | null | undefined): 'gold' | 'green' | 'blue' | 'slate' | 'red' {
  if (severity === 'high' || severity === 'critical') return 'red'
  if (severity === 'medium') return 'gold'
  return 'slate'
}

export const ISSUE_STATUSES = ['open', 'approved', 'declined', 'resolved'] as const
export type IssueStatus = (typeof ISSUE_STATUSES)[number]

export function isIssueStatus(value: string | null | undefined): value is IssueStatus {
  return !!value && (ISSUE_STATUSES as readonly string[]).includes(value)
}

export function issueStatusLabel(status: string | null | undefined): string {
  if (status === 'approved') return 'Approved'
  if (status === 'declined') return 'Declined'
  if (status === 'resolved') return 'Resolved'
  return 'Open'
}

// ---------------------------------------------------------------------------
// Supplies
// ---------------------------------------------------------------------------
export const SUPPLY_STOCKS = ['good', 'low', 'out'] as const
export type SupplyStock = (typeof SUPPLY_STOCKS)[number]

export function isSupplyStock(value: string | null | undefined): value is SupplyStock {
  return !!value && (SUPPLY_STOCKS as readonly string[]).includes(value)
}

export function supplyStockLabel(stock: string | null | undefined): string {
  if (stock === 'low') return 'Low'
  if (stock === 'out') return 'Out'
  return 'Good'
}

export function supplyStockTone(stock: string | null | undefined): 'gold' | 'green' | 'blue' | 'slate' | 'red' {
  if (stock === 'out') return 'red'
  if (stock === 'low') return 'gold'
  return 'green'
}

export const SUPPLY_NAMES = [
  'Toilet paper',
  'Paper towels',
  'Trash bags',
  'Dishwasher tabs',
  'Dish soap',
  'Shampoo',
  'Conditioner',
  'Body wash',
  'Hand soap',
  'Coffee',
  'Coffee filters',
  'Laundry detergent',
  'Custom item',
] as const

// ---------------------------------------------------------------------------
// Checklist engine
// ---------------------------------------------------------------------------
export const CHECKLIST_CATEGORIES = [
  'Before Starting',
  'Kitchen',
  'Bathrooms',
  'Bedrooms',
  'Living Areas',
  'Laundry',
  'Supplies',
  'Final Walkthrough',
] as const

export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number]

export const CHECKLIST_ITEM_STATUSES = ['pending', 'complete', 'not_applicable'] as const
export type ChecklistItemStatus = (typeof CHECKLIST_ITEM_STATUSES)[number]

// ---------------------------------------------------------------------------
// Provider payouts
// ---------------------------------------------------------------------------
export const PAYOUT_STATUSES = ['pending', 'approved', 'paid', 'disputed'] as const
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

export function isPayoutStatus(value: string | null | undefined): value is PayoutStatus {
  return !!value && (PAYOUT_STATUSES as readonly string[]).includes(value)
}

export function payoutStatusLabel(status: string | null | undefined): string {
  if (status === 'approved') return 'Approved'
  if (status === 'paid') return 'Paid'
  if (status === 'disputed') return 'Disputed'
  return 'Pending'
}

// ---------------------------------------------------------------------------
// Reservations / platforms
// ---------------------------------------------------------------------------
export const STR_PLATFORMS = ['airbnb', 'vrbo', 'other', 'multiple'] as const
export type StrPlatform = (typeof STR_PLATFORMS)[number]

export function strPlatformLabel(platform: string | null | undefined): string {
  if (platform === 'airbnb') return 'Airbnb'
  if (platform === 'vrbo') return 'VRBO'
  if (platform === 'multiple') return 'Multiple'
  return 'Other'
}

// ---------------------------------------------------------------------------
// Money + pricing helpers (pure; tiers come from the API)
// ---------------------------------------------------------------------------
export function money(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '$0'
  const value = cents / 100
  const formatted = value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value % 1 === 0 ? 0 : 2 })
  return formatted
}

export interface StrPriceTier {
  tier_key: string
  tier_label: string
  max_bedrooms: number | null
  starting_from: number
  client_price_cents: number
  provider_payout_cents: number
}

export interface StrPackage {
  key: string
  name: string
  description: string | null
  badge: string | null
  monthly_rate_cents: number | null
  active: number
  tiers: StrPriceTier[]
}

// Pick the pricing tier for a bedroom count, preferring the largest tier that
// fits (5BR+ = max_bedrooms 99 / null).
export function tierForBedrooms(tiers: StrPriceTier[], bedrooms: number | null | undefined): StrPriceTier | null {
  if (!tiers || tiers.length === 0) return null
  const n = Number(bedrooms)
  if (!Number.isFinite(n) || n < 0) return tiers[0] ?? null
  for (const tier of tiers) {
    if (tier.max_bedrooms == null) return tier
    if (n <= tier.max_bedrooms) return tier
  }
  return tiers[tiers.length - 1] ?? null
}

// ---------------------------------------------------------------------------
// Guest-ready rule
// ---------------------------------------------------------------------------
export interface ChecklistGate {
  requiredItems: number
  completedItems: number
  notApplicableItems: number
  missingRequiredPhotos: string[]
  openIssuesAffectingReadiness: number
}

// A turnover may be submitted for verification only when every required
// checklist item is complete or N/A, every required photo is present, and no
// open issue affects guest readiness.
export function turnoverReadyForVerification(gate: ChecklistGate): boolean {
  return (
    gate.missingRequiredPhotos.length === 0 &&
    gate.openIssuesAffectingReadiness === 0 &&
    gate.requiredItems === gate.completedItems + gate.notApplicableItems
  )
}
