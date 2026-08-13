export const LIFECYCLE_STAGES = ['lead', 'prospect', 'opportunity', 'converted', 'lost'] as const
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number]

const ORDER: Record<string, number> = { lead: 0, prospect: 1, opportunity: 2, converted: 3 }

export function nextLifecycle(current: string | null | undefined, target: string): string {
  const now = current || 'lead'
  if (now === 'lost' || now === 'converted') return now
  const from = ORDER[now] ?? 0
  const to = ORDER[target]
  if (to == null) return now
  return to > from ? target : now
}

/** HQ-facing label. `opportunity` is the application phase. */
export function lifecycleLabel(stage: string | null | undefined): string {
  if (stage === 'opportunity') return 'Application'
  if (stage === 'prospect') return 'Prospect'
  if (stage === 'converted') return 'Converted'
  if (stage === 'lost') return 'Lost'
  if (stage === 'lead' || !stage) return 'Lead'
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}
