export function invoiceMoney(cents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
    }).format((Number(cents) || 0) / 100)
  } catch {
    return `$${((Number(cents) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}

export function invoiceToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function invoicePlusDays(days: number, from = invoiceToday()): string {
  const d = new Date(`${from}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isInvoiceOverdue(invoice: { status: string; due_date?: string | null }): boolean {
  return invoice.status === 'open' && !!invoice.due_date && invoice.due_date.slice(0, 10) < invoiceToday()
}

export function isInvoiceDueSoon(invoice: { status: string; due_date?: string | null }, withinDays = 7): boolean {
  if (invoice.status !== 'open' || !invoice.due_date || isInvoiceOverdue(invoice)) return false
  const due = invoice.due_date.slice(0, 10)
  return due <= invoicePlusDays(withinDays)
}

export function invoiceStatusLabel(invoice: { status: string; due_date?: string | null }): string {
  if (invoice.status === 'paid') return 'Paid'
  if (invoice.status === 'void') return 'Void'
  if (isInvoiceOverdue(invoice)) return 'Overdue'
  if (invoice.status === 'open') return 'Open'
  return invoice.status
}

export function invoiceStatusTone(invoice: { status: string; due_date?: string | null }): 'gold' | 'green' | 'red' | 'slate' {
  if (invoice.status === 'paid') return 'green'
  if (invoice.status === 'void') return 'slate'
  if (isInvoiceOverdue(invoice)) return 'red'
  return 'gold'
}

export const INVOICE_FOCUS = [
  { key: 'open', label: 'Open' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due soon' },
  { key: 'unsent', label: 'Not sent' },
  { key: 'paid', label: 'Paid' },
  { key: 'void', label: 'Void' },
  { key: 'all', label: 'All' },
] as const

export type InvoiceFocusKey = (typeof INVOICE_FOCUS)[number]['key']

export function invoiceMatchesFocus(
  invoice: { status: string; due_date?: string | null; sent_at?: string | null },
  focus: InvoiceFocusKey,
): boolean {
  if (focus === 'all') return true
  if (focus === 'open') return invoice.status === 'open'
  if (focus === 'overdue') return isInvoiceOverdue(invoice)
  if (focus === 'due_soon') return isInvoiceDueSoon(invoice)
  if (focus === 'unsent') return invoice.status === 'open' && !invoice.sent_at
  if (focus === 'paid') return invoice.status === 'paid'
  if (focus === 'void') return invoice.status === 'void'
  return true
}

export function invoiceNextAction(invoice: { status: string; sent_at?: string | null }): 'send' | 'paid' | 'none' {
  if (invoice.status !== 'open') return 'none'
  return invoice.sent_at ? 'paid' : 'send'
}

export function invoiceDueLabel(invoice: { status: string; due_date?: string | null; sent_at?: string | null }): string {
  if (invoice.status === 'paid') return 'Paid'
  if (invoice.status === 'void') return 'Void'
  if (!invoice.due_date) return invoice.sent_at ? 'Sent · due upon receipt' : 'Due upon receipt'
  const due = invoice.due_date.slice(0, 10)
  const today = invoiceToday()
  if (due < today) {
    const days = Math.max(1, Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${due}T12:00:00`)) / 86400000))
    return days === 1 ? '1 day overdue' : `${days} days overdue`
  }
  if (due === today) return 'Due today'
  const days = Math.round((Date.parse(`${due}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86400000)
  if (days === 1) return 'Due tomorrow'
  if (days < 14) return `Due in ${days} days`
  return `Due ${new Date(`${due}T12:00:00`).toLocaleDateString()}`
}

export function formatInvoiceDate(value: string | null | undefined): string {
  if (!value) return 'Not provided'
  const day = value.slice(0, 10)
  const parsed = Date.parse(`${day}T12:00:00`)
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString() : value
}
