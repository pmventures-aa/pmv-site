export const INVITE_TTL_SETTING_KEY = 'invite_link_ttl_hours'
export const DEFAULT_INVITE_TTL_HOURS = 24

export const INVITE_TTL_PRESETS = [
  { hours: 24, label: '24 hours' },
  { hours: 48, label: '2 days' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
  { hours: 336, label: '14 days' },
  { hours: 720, label: '30 days' },
] as const

/** Clamp a firm-wide invite link lifetime to 1 hour through 1 year. */
export function parseInviteTtlHours(value: unknown, fallback = DEFAULT_INVITE_TTL_HOURS): number {
  if (value == null || String(value).trim() === '') return fallback
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return fallback
  return Math.min(8760, Math.max(1, Math.round(n)))
}

export function formatInviteTtl(hours: number): string {
  const h = parseInviteTtlHours(hours)
  if (h % 24 === 0) {
    const days = h / 24
    return days === 1 ? '24 hours' : `${days} days`
  }
  return h === 1 ? '1 hour' : `${h} hours`
}
