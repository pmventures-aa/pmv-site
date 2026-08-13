export function quoteMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export function quoteStatusLabel(status: string): string {
  if (status === 'draft') return 'Draft'
  if (status === 'sent') return 'Sent'
  if (status === 'viewed') return 'Viewed'
  if (status === 'accepted') return 'Accepted'
  if (status === 'declined') return 'Declined'
  if (status === 'expired') return 'Expired'
  if (status === 'void') return 'Void'
  return status
}

export function quoteStatusTone(status: string): 'slate' | 'gold' | 'green' | 'red' | 'blue' {
  if (status === 'accepted') return 'green'
  if (status === 'declined' || status === 'void') return 'red'
  if (status === 'viewed') return 'gold'
  if (status === 'sent') return 'blue'
  return 'slate'
}

export const QUOTE_FOCUS = [
  { key: 'working', label: 'Working', statuses: ['draft', 'sent', 'viewed'] },
  { key: 'draft', label: 'Drafts', statuses: ['draft'] },
  { key: 'out', label: 'Awaiting reply', statuses: ['sent', 'viewed'] },
  { key: 'won', label: 'Accepted', statuses: ['accepted'] },
  { key: 'all', label: 'All', statuses: [] as string[] },
] as const

export type QuoteFocusKey = (typeof QUOTE_FOCUS)[number]['key']

export function quoteMatchesFocus(status: string, focus: QuoteFocusKey): boolean {
  const spec = QUOTE_FOCUS.find((item) => item.key === focus)
  if (!spec || spec.statuses.length === 0) return true
  return (spec.statuses as readonly string[]).includes(status)
}

export function quoteNextAction(status: string): 'send' | 'copy' | 'none' {
  if (status === 'draft') return 'send'
  if (status === 'sent' || status === 'viewed') return 'copy'
  return 'none'
}

export function quoteEventLabel(kind: string): string {
  if (kind === 'created') return 'Created'
  if (kind === 'sent') return 'Sent to recipient'
  if (kind === 'viewed') return 'Opened by recipient'
  if (kind === 'updated') return 'Edited'
  if (kind === 'accepted') return 'Accepted'
  if (kind === 'declined') return 'Declined'
  if (kind === 'voided') return 'Voided'
  return kind.replace(/_/g, ' ')
}

export function quoteIdleLabel(quote: { status: string; sent_at: string | null; viewed_at: string | null; valid_until: string | null; created_at: string }): string {
  if (quote.status === 'viewed' && quote.viewed_at) return `Viewed ${shortWhen(quote.viewed_at)}`
  if (quote.status === 'sent' && quote.sent_at) return `Sent ${shortWhen(quote.sent_at)}`
  if (quote.valid_until) return `Valid through ${new Date(`${quote.valid_until.slice(0, 10)}T12:00:00`).toLocaleDateString()}`
  return `Created ${shortWhen(quote.created_at)}`
}

function shortWhen(value: string): string {
  const parsed = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (!Number.isFinite(parsed)) return value
  const days = Math.max(0, Math.floor((Date.now() - parsed) / 86400000))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  return new Date(parsed).toLocaleDateString()
}
