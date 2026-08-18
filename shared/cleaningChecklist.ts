// Default cleaning checklist templates and issue vocabulary, shared by the
// server (materialize + gate completion) and the vendor app (render + toggle).

import type { CleaningServiceType } from './cleaningPricing'

export interface ChecklistTemplateItem {
  category: string
  itemKey: string
  label: string
  required: boolean
}

// Base clean applies to every service. STR turnovers add guest-ready staging
// and a supplies check; move-in/out and deep add detail items.
const BASE: ChecklistTemplateItem[] = [
  { category: 'Kitchen', itemKey: 'counters', label: 'Counters and surfaces wiped', required: true },
  { category: 'Kitchen', itemKey: 'sink', label: 'Sink and faucet cleaned', required: true },
  { category: 'Kitchen', itemKey: 'appliances', label: 'Appliance exteriors wiped', required: true },
  { category: 'Kitchen', itemKey: 'trash', label: 'Trash removed', required: true },
  { category: 'Bathrooms', itemKey: 'toilet', label: 'Toilets scrubbed', required: true },
  { category: 'Bathrooms', itemKey: 'shower', label: 'Showers/tubs cleaned', required: true },
  { category: 'Bathrooms', itemKey: 'mirror', label: 'Mirrors and fixtures cleaned', required: true },
  { category: 'Bedrooms', itemKey: 'surfaces', label: 'Surfaces dusted', required: true },
  { category: 'Living Areas', itemKey: 'floors', label: 'Floors vacuumed and mopped', required: true },
  { category: 'Living Areas', itemKey: 'dust', label: 'Surfaces and furniture dusted', required: true },
  { category: 'Final', itemKey: 'walkthrough', label: 'Final walkthrough completed', required: true },
]

const STR_EXTRA: ChecklistTemplateItem[] = [
  { category: 'Bedrooms', itemKey: 'beds', label: 'Beds made with fresh linens', required: true },
  { category: 'Bathrooms', itemKey: 'restock', label: 'Toiletries and paper goods restocked', required: true },
  { category: 'Supplies', itemKey: 'inventory', label: 'Supplies checked against par', required: false },
  { category: 'Final', itemKey: 'staging', label: 'Guest-ready staging confirmed', required: true },
  { category: 'Final', itemKey: 'lights_thermostat', label: 'Lights, thermostat, and doors set', required: true },
]

const DEEP_EXTRA: ChecklistTemplateItem[] = [
  { category: 'Detail', itemKey: 'baseboards', label: 'Baseboards and door frames', required: true },
  { category: 'Detail', itemKey: 'fixtures', label: 'Fixtures and vents detailed', required: true },
  { category: 'Detail', itemKey: 'buildup', label: 'Buildup removed from edges/corners', required: true },
]

export function checklistTemplateFor(service: CleaningServiceType): ChecklistTemplateItem[] {
  if (service === 'str_turnover') return [...BASE, ...STR_EXTRA]
  if (service === 'deep' || service === 'move_in_out') return [...BASE, ...DEEP_EXTRA]
  return BASE
}

/** All required items are complete or explicitly marked not-applicable. */
export function allRequiredResolved(items: { required: boolean; status: string }[]): boolean {
  return items.every((i) => !i.required || i.status === 'complete' || i.status === 'not_applicable')
}

export function checklistProgress(items: { status: string }[]): { done: number; total: number } {
  const total = items.length
  const done = items.filter((i) => i.status === 'complete' || i.status === 'not_applicable').length
  return { done, total }
}

// ---- Issues -----------------------------------------------------------------

export const CLEANING_ISSUE_CATEGORIES = [
  'damage', 'missing_item', 'maintenance', 'leak_water', 'hvac', 'electrical',
  'appliance', 'pest', 'access_problem', 'excessive_mess', 'supply_shortage', 'safety', 'other',
] as const
export type CleaningIssueCategory = (typeof CLEANING_ISSUE_CATEGORIES)[number]

export const CLEANING_ISSUE_SEVERITIES = ['low', 'needs_attention', 'urgent'] as const
export type CleaningIssueSeverity = (typeof CLEANING_ISSUE_SEVERITIES)[number]

const ISSUE_CATEGORY_LABELS: Record<CleaningIssueCategory, string> = {
  damage: 'Damage',
  missing_item: 'Missing item',
  maintenance: 'Maintenance',
  leak_water: 'Leak / water',
  hvac: 'HVAC',
  electrical: 'Electrical',
  appliance: 'Appliance',
  pest: 'Pest',
  access_problem: 'Access problem',
  excessive_mess: 'Excessive mess',
  supply_shortage: 'Supply shortage',
  safety: 'Safety concern',
  other: 'Other',
}
const ISSUE_SEVERITY_LABELS: Record<CleaningIssueSeverity, string> = {
  low: 'Low',
  needs_attention: 'Needs attention',
  urgent: 'Urgent',
}

export function isIssueCategory(v: unknown): v is CleaningIssueCategory {
  return typeof v === 'string' && (CLEANING_ISSUE_CATEGORIES as readonly string[]).includes(v)
}
export function isIssueSeverity(v: unknown): v is CleaningIssueSeverity {
  return typeof v === 'string' && (CLEANING_ISSUE_SEVERITIES as readonly string[]).includes(v)
}
export function issueCategoryLabel(v: string): string {
  return ISSUE_CATEGORY_LABELS[v as CleaningIssueCategory] ?? v
}
export function issueSeverityLabel(v: string): string {
  return ISSUE_SEVERITY_LABELS[v as CleaningIssueSeverity] ?? v
}
