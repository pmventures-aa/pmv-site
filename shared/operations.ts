export const CASE_CONVERSION_TARGETS = ['matter', 'task', 'field_assignment', 'quote'] as const
export type CaseConversionTarget = (typeof CASE_CONVERSION_TARGETS)[number]

export function isCaseConversionTarget(value: unknown): value is CaseConversionTarget {
  return typeof value === 'string' && (CASE_CONVERSION_TARGETS as readonly string[]).includes(value)
}

export function caseConversionLabel(target: CaseConversionTarget): string {
  if (target === 'matter') return 'Work item'
  if (target === 'task') return 'Task'
  if (target === 'field_assignment') return 'Field job order'
  return 'Draft quote'
}

export type LocationFreshness = 'live' | 'last_known' | 'unavailable'

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function locationFreshness(
  updatedAt: string | null | undefined,
  sharingActive: boolean | number | null | undefined,
  nowMs = Date.now(),
): LocationFreshness {
  const updatedMs = timestampMs(updatedAt)
  if (!updatedMs) return 'unavailable'
  if (Boolean(sharingActive) && nowMs - updatedMs <= 5 * 60_000) return 'live'
  return 'last_known'
}

export function locationAgeLabel(updatedAt: string | null | undefined, nowMs = Date.now()): string {
  const updatedMs = timestampMs(updatedAt)
  if (!updatedMs) return 'Location not shared'
  const minutes = Math.max(0, Math.floor((nowMs - updatedMs) / 60_000))
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Last active ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Last active ${hours}h ago`
  const days = Math.floor(hours / 24)
  return `Last active ${days}d ago`
}

export function isEligibleProviderAccount(role: string | null | undefined, status: string | null | undefined): boolean {
  return (role === 'staff' || role === 'admin') && status === 'active'
}
