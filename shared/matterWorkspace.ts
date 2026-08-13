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
  if (!type) return 'Project'
  return type.replace(/_/g, ' ')
}
