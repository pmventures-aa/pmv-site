export const LEAD_STALE_DAYS = 7

export const LEAD_BOARD_STAGES = [
  {
    key: 'new',
    label: 'New leads',
    hint: 'Just in. Reach out before they go cold.',
    status: 'new',
    lifecycle: 'lead',
  },
  {
    key: 'prospects',
    label: 'Prospects',
    hint: 'In conversation. Every card should have a next step.',
    status: 'contacted',
    lifecycle: 'prospect',
  },
  {
    key: 'ready',
    label: 'Ready to convert',
    hint: 'Qualified. Review and open a client account.',
    status: 'qualified',
    lifecycle: 'opportunity',
  },
  {
    key: 'lost',
    label: 'Lost',
    hint: 'Closed out. Hidden from the working board.',
    status: 'lost',
    lifecycle: 'lost',
  },
] as const

export type LeadBoardStage = (typeof LEAD_BOARD_STAGES)[number]['key']

export function leadBoardStage(lead: { status?: string | null; lifecycle_stage?: string | null }): LeadBoardStage {
  const status = String(lead.status || '')
  const lifecycle = String(lead.lifecycle_stage || '')
  if (status === 'lost' || lifecycle === 'lost') return 'lost'
  if (status === 'qualified' || lifecycle === 'opportunity' || lifecycle === 'converted') return 'ready'
  if (status === 'contacted' || lifecycle === 'prospect') return 'prospects'
  return 'new'
}

export function leadBoardPatch(stage: LeadBoardStage): { status: string; lifecycle_stage: string } {
  const column = LEAD_BOARD_STAGES.find((item) => item.key === stage) || LEAD_BOARD_STAGES[0]
  return { status: column.status, lifecycle_stage: column.lifecycle }
}

export function leadBoardLabel(stage: LeadBoardStage): string {
  return LEAD_BOARD_STAGES.find((item) => item.key === stage)?.label || 'New leads'
}

export function ageDays(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((Date.now() - parsed) / 86400000)) : 0
}

export function ageLabel(value: string | null | undefined): string {
  const days = ageDays(value)
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

export function isLeadStale(lead: { updated_at?: string | null; created_at?: string | null }, days = LEAD_STALE_DAYS): boolean {
  return ageDays(lead.updated_at || lead.created_at) >= days
}

export function compareLeadsByUrgency<T extends { updated_at?: string | null; created_at?: string | null }>(a: T, b: T): number {
  return ageDays(b.updated_at || b.created_at) - ageDays(a.updated_at || a.created_at)
}
