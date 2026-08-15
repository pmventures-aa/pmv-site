import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  invoiceDueLabel,
  invoiceMatchesFocus,
  invoiceNextAction,
  invoicePlusDays,
  invoiceStatusLabel,
  invoiceToday,
  isInvoiceDueSoon,
  isInvoiceOverdue,
} from '../shared/invoiceWorkspace'

describe('invoice workspace helpers', () => {
  it('flags overdue open invoices and leaves paid invoices alone', () => {
    expect(isInvoiceOverdue({ status: 'open', due_date: '2020-01-01' })).toBe(true)
    expect(isInvoiceOverdue({ status: 'paid', due_date: '2020-01-01' })).toBe(false)
    expect(isInvoiceOverdue({ status: 'open', due_date: invoicePlusDays(3) })).toBe(false)
    expect(isInvoiceOverdue({ status: 'open', due_date: invoiceToday() })).toBe(false)
  })

  it('treats the next week of open invoices as due soon', () => {
    expect(isInvoiceDueSoon({ status: 'open', due_date: invoicePlusDays(3) })).toBe(true)
    expect(isInvoiceDueSoon({ status: 'open', due_date: invoicePlusDays(21) })).toBe(false)
    expect(isInvoiceDueSoon({ status: 'open', due_date: '2020-01-01' })).toBe(false)
  })

  it('filters the work queue by focus', () => {
    const overdue = { status: 'open', due_date: '2020-01-01', sent_at: '2026-01-01' }
    const unsent = { status: 'open', due_date: invoicePlusDays(14), sent_at: null }
    expect(invoiceMatchesFocus(overdue, 'overdue')).toBe(true)
    expect(invoiceMatchesFocus(overdue, 'open')).toBe(true)
    expect(invoiceMatchesFocus(unsent, 'unsent')).toBe(true)
    expect(invoiceMatchesFocus(unsent, 'overdue')).toBe(false)
    expect(invoiceMatchesFocus({ status: 'paid', due_date: '2020-01-01' }, 'paid')).toBe(true)
    expect(invoiceMatchesFocus({ status: 'void' }, 'all')).toBe(true)
  })

  it('picks one next action for the list', () => {
    expect(invoiceNextAction({ status: 'open', sent_at: null })).toBe('send')
    expect(invoiceNextAction({ status: 'open', sent_at: '2026-01-01' })).toBe('paid')
    expect(invoiceNextAction({ status: 'paid' })).toBe('none')
  })

  it('uses plain-language due labels', () => {
    expect(invoiceStatusLabel({ status: 'open', due_date: '2020-01-01' })).toBe('Overdue')
    expect(invoiceDueLabel({ status: 'open', due_date: invoiceToday() })).toBe('Due today')
    expect(invoiceDueLabel({ status: 'open', due_date: invoicePlusDays(1) })).toBe('Due tomorrow')
    expect(invoiceDueLabel({ status: 'paid', due_date: '2020-01-01' })).toBe('Paid')
  })
})

describe('HQ invoices page', () => {
  it('keeps the work queue, composer, and detail on separate screens', () => {
    const source = readFileSync(new URL('../src/pages/admin/InvoicesAdmin.tsx', import.meta.url), 'utf8')
    expect(source).toContain("useState<'list' | 'build'>")
    expect(source).toContain('Continue to pricing')
    expect(source).toContain('Duplicate')
    expect(source).toContain('Fill from a quote')
    expect(source).toContain('quote_id')
    expect(source).not.toContain('Card processor label')
    expect(source).not.toContain('Save customer to vault')
  })
})

describe('quote to invoice conversion', () => {
  it('exposes a convert endpoint and stores the quote link', () => {
    const source = readFileSync(new URL('../functions/_lib/routes/invoiceAdmin.ts', import.meta.url), 'utf8')
    expect(source).toContain("/invoices/from-quote/:quoteId")
    expect(source).toContain('only an accepted quote can be converted')
    expect(source).toContain('quote_id')
  })
})
