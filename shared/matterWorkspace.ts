export const MATTER_STATUSES = ['open', 'in_progress', 'blocked', 'closed'] as const
export type MatterStatus = (typeof MATTER_STATUSES)[number]

export function isMatterStatus(value: string | null | undefined): value is MatterStatus {
  return !!value && (MATTER_STATUSES as readonly string[]).includes(value)
}

export function matterStatusLabel(status: string | null | undefined): string {
  if (status === 'in_progress') return 'In progress'
  if (status === 'blocked') return 'Blocked'
  if (status === 'closed') return 'Closed'
  return 'Open'
}

export const MATTER_TYPES = [
  { key: 'property_work', label: 'Property work' },
  { key: 'document_prep', label: 'Documents' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'turnover', label: 'Turnover' },
  { key: 'admin_support', label: 'Admin support' },
  { key: 'funding', label: 'Funding' },
  { key: 'other', label: 'Other' },
] as const

export function matterTypeLabel(type: string | null | undefined): string {
  const match = MATTER_TYPES.find((item) => item.key === type)
  if (match) return match.label
  if (!type) return 'Work'
  return type.replace(/_/g, ' ')
}

export const RESPONSIBILITY_STATES = ['client', 'pinnacle', 'third_party', 'none'] as const
export type ResponsibilityState = (typeof RESPONSIBILITY_STATES)[number]

export function isResponsibilityState(value: string | null | undefined): value is ResponsibilityState {
  return !!value && (RESPONSIBILITY_STATES as readonly string[]).includes(value)
}

export function resolveResponsibility(state: string | null | undefined, status: string | null | undefined): ResponsibilityState {
  if (isResponsibilityState(state)) return state
  if (status === 'closed') return 'none'
  if (status === 'blocked') return 'third_party'
  return 'pinnacle'
}

export function responsibilityBanner(state: string | null | undefined, status: string | null | undefined, blockedReason?: string | null) {
  const resolved = resolveResponsibility(state, status)
  if (resolved === 'client') {
    return { state: resolved, label: 'Waiting on you', body: 'Pinnacle cannot move this forward until you complete the next step.' }
  }
  if (resolved === 'third_party') {
    return {
      state: resolved,
      label: 'Waiting on third party',
      body: blockedReason?.trim() || 'Pinnacle is waiting on someone outside this workspace. Your contact will add a client-safe explanation.',
    }
  }
  if (resolved === 'none' || status === 'closed') {
    return { state: 'none' as const, label: 'Complete', body: 'This work is finished. Files and history stay on this page.' }
  }
  return { state: 'pinnacle' as const, label: 'Pinnacle is working', body: 'Nothing is currently required from you.' }
}

export const CLIENT_STAGES = ['received', 'review', 'in_progress', 'waiting', 'complete'] as const
export type ClientStage = (typeof CLIENT_STAGES)[number]

export function isClientStage(value: string | null | undefined): value is ClientStage {
  return !!value && (CLIENT_STAGES as readonly string[]).includes(value)
}

export function resolveClientStage(stage: string | null | undefined, status: string | null | undefined): ClientStage {
  if (isClientStage(stage)) return stage
  if (status === 'closed') return 'complete'
  if (status === 'blocked') return 'waiting'
  if (status === 'in_progress') return 'in_progress'
  return 'received'
}

export function clientStageLabel(stage: string | null | undefined, status?: string | null): string {
  const resolved = resolveClientStage(stage, status)
  if (resolved === 'received') return 'Received'
  if (resolved === 'review') return 'Under review'
  if (resolved === 'in_progress') return 'In progress'
  if (resolved === 'waiting') return 'Waiting'
  return 'Complete'
}

export const MILESTONE_STATUSES = ['completed', 'current', 'upcoming', 'blocked', 'not_applicable'] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export function isMilestoneStatus(value: string | null | undefined): value is MilestoneStatus {
  return !!value && (MILESTONE_STATUSES as readonly string[]).includes(value)
}

export function milestoneStatusLabel(status: string | null | undefined): string {
  if (status === 'completed') return 'Done'
  if (status === 'current') return 'Current'
  if (status === 'blocked') return 'Blocked'
  if (status === 'not_applicable') return 'Not applicable'
  return 'Upcoming'
}

export function defaultMilestonesForType(type: string | null | undefined): Array<{ name: string; sequence: number }> {
  if (type === 'funding') {
    return [
      { name: 'Request received', sequence: 1 },
      { name: 'Documents gathered', sequence: 2 },
      { name: 'Under review', sequence: 3 },
      { name: 'Decision', sequence: 4 },
    ]
  }
  if (type === 'document_prep') {
    return [
      { name: 'Request received', sequence: 1 },
      { name: 'Review', sequence: 2 },
      { name: 'Prepare or sign', sequence: 3 },
      { name: 'Complete', sequence: 4 },
    ]
  }
  if (type === 'inspection' || type === 'turnover' || type === 'property_work') {
    return [
      { name: 'Request received', sequence: 1 },
      { name: 'Review and schedule', sequence: 2 },
      { name: 'Work in progress', sequence: 3 },
      { name: 'Complete', sequence: 4 },
    ]
  }
  return [
    { name: 'Request received', sequence: 1 },
    { name: 'Review', sequence: 2 },
    { name: 'In progress', sequence: 3 },
    { name: 'Complete', sequence: 4 },
  ]
}

export function inferMilestoneStatus(matterStatus: string | null | undefined, index: number, total: number): MilestoneStatus {
  if (matterStatus === 'closed') return index === total - 1 ? 'current' : 'completed'
  if (matterStatus === 'blocked') return index === Math.min(1, total - 1) ? 'blocked' : index === 0 ? 'completed' : 'upcoming'
  if (matterStatus === 'in_progress') {
    if (index === 0) return 'completed'
    if (index === 1 || index === 2) return index === 2 ? 'current' : 'completed'
    return 'upcoming'
  }
  return index === 0 ? 'current' : 'upcoming'
}

export type NextActionType = 'upload' | 'sign' | 'pay' | 'approve' | 'schedule' | 'message' | 'acknowledge' | 'task' | 'other'

export function nextActionHref(type: string | null | undefined, matterId: string): string {
  if (type === 'upload' || type === 'sign') return 'documents'
  if (type === 'pay' || type === 'approve') return 'billing'
  if (type === 'schedule') return 'calendar'
  if (type === 'message') return `matters/${matterId}`
  return `matters/${matterId}`
}

export function nextActionButtonLabel(type: string | null | undefined): string {
  if (type === 'upload') return 'Upload file'
  if (type === 'sign') return 'Open to sign'
  if (type === 'pay') return 'Review billing'
  if (type === 'approve') return 'Review quote'
  if (type === 'schedule') return 'Open calendar'
  if (type === 'message') return 'Send an update'
  if (type === 'acknowledge') return 'Send an update'
  return 'Open this work'
}

export function formatClientWhen(value: string | null | undefined): string | null {
  if (!value) return null
  const date = value.length <= 10 ? new Date(`${value}T12:00:00`) : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: value.length > 10 ? 'numeric' : undefined, minute: value.length > 10 ? '2-digit' : undefined })
}
