// Cleaning job status model - shared by the server, HQ dispatch board, and the
// vendor app so status names, tones, and allowed transitions never drift.

export type CleaningJobStatus =
  | 'requested'
  | 'needs_review'
  | 'scheduled'
  | 'offered'
  | 'assigned'
  | 'en_route'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type CleaningStatusTone = 'neutral' | 'info' | 'active' | 'success' | 'warn' | 'danger'

export interface CleaningStatusMeta {
  key: CleaningJobStatus
  label: string
  tone: CleaningStatusTone
  /** Grouping stage for board columns. */
  stage: 'intake' | 'dispatch' | 'field' | 'closed'
}

export const CLEANING_JOB_STATUSES: CleaningStatusMeta[] = [
  { key: 'requested', label: 'Requested', tone: 'info', stage: 'intake' },
  { key: 'needs_review', label: 'Needs Review', tone: 'warn', stage: 'intake' },
  { key: 'scheduled', label: 'Scheduled', tone: 'info', stage: 'dispatch' },
  { key: 'offered', label: 'Offered', tone: 'info', stage: 'dispatch' },
  { key: 'assigned', label: 'Assigned', tone: 'active', stage: 'dispatch' },
  { key: 'en_route', label: 'En Route', tone: 'active', stage: 'field' },
  { key: 'checked_in', label: 'Checked In', tone: 'active', stage: 'field' },
  { key: 'in_progress', label: 'In Progress', tone: 'active', stage: 'field' },
  { key: 'completed', label: 'Completed', tone: 'success', stage: 'closed' },
  { key: 'cancelled', label: 'Cancelled', tone: 'danger', stage: 'closed' },
]

const STATUS_BY_KEY = new Map(CLEANING_JOB_STATUSES.map((s) => [s.key, s]))

export function isCleaningJobStatus(value: unknown): value is CleaningJobStatus {
  return typeof value === 'string' && STATUS_BY_KEY.has(value as CleaningJobStatus)
}

export function cleaningStatusLabel(status: string): string {
  return STATUS_BY_KEY.get(status as CleaningJobStatus)?.label ?? status
}

export function cleaningStatusTone(status: string): CleaningStatusTone {
  return STATUS_BY_KEY.get(status as CleaningJobStatus)?.tone ?? 'neutral'
}

// Allowed forward transitions. HQ can always cancel or reschedule; these govern
// the normal flow and what the vendor app may trigger.
const TRANSITIONS: Record<CleaningJobStatus, CleaningJobStatus[]> = {
  requested: ['needs_review', 'scheduled', 'cancelled'],
  needs_review: ['scheduled', 'cancelled'],
  scheduled: ['offered', 'assigned', 'cancelled'],
  offered: ['assigned', 'scheduled', 'cancelled'],
  assigned: ['en_route', 'checked_in', 'scheduled', 'cancelled'],
  en_route: ['checked_in', 'assigned', 'cancelled'],
  checked_in: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function canTransition(from: string, to: string): boolean {
  if (!isCleaningJobStatus(from) || !isCleaningJobStatus(to)) return false
  return TRANSITIONS[from].includes(to)
}

// Statuses the assigned vendor drives from the field, in order.
export const VENDOR_FIELD_STEPS: { action: string; from: CleaningJobStatus; to: CleaningJobStatus; label: string }[] = [
  { action: 'en_route', from: 'assigned', to: 'en_route', label: "I'm On My Way" },
  { action: 'check_in', from: 'en_route', to: 'checked_in', label: "I'm Here / Check In" },
  { action: 'start', from: 'checked_in', to: 'in_progress', label: 'Start Cleaning' },
  { action: 'complete', from: 'in_progress', to: 'completed', label: 'Complete Job' },
]

export type CleaningPayoutStatus = 'pending' | 'approved' | 'paid'
export function isCleaningPayoutStatus(v: unknown): v is CleaningPayoutStatus {
  return v === 'pending' || v === 'approved' || v === 'paid'
}

// ---- STR turnover countdown -------------------------------------------------

export type TurnoverUrgency = 'on_track' | 'attention' | 'at_risk' | 'late' | 'none'

/**
 * Turnover window health from guest checkout to the next check-in. Pure and
 * time-injected so it is deterministic and testable. Not fake urgency: it
 * simply reflects how much of the real window remains.
 */
export function turnoverUrgency(
  checkoutIso: string | null,
  checkinIso: string | null,
  nowMs: number,
): { urgency: TurnoverUrgency; minutesRemaining: number | null; windowMinutes: number | null } {
  if (!checkinIso) return { urgency: 'none', minutesRemaining: null, windowMinutes: null }
  const checkin = Date.parse(checkinIso)
  if (Number.isNaN(checkin)) return { urgency: 'none', minutesRemaining: null, windowMinutes: null }
  const checkout = checkoutIso ? Date.parse(checkoutIso) : NaN
  const windowMinutes = Number.isNaN(checkout) ? null : Math.round((checkin - checkout) / 60000)
  const minutesRemaining = Math.round((checkin - nowMs) / 60000)
  let urgency: TurnoverUrgency
  if (minutesRemaining < 0) urgency = 'late'
  else if (minutesRemaining <= 60) urgency = 'at_risk'
  else if (minutesRemaining <= 150) urgency = 'attention'
  else urgency = 'on_track'
  return { urgency, minutesRemaining, windowMinutes }
}

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return ''
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const sign = minutes < 0 ? '-' : ''
  if (h === 0) return `${sign}${m}m`
  if (m === 0) return `${sign}${h}h`
  return `${sign}${h}h ${m}m`
}
