import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  quoteMatchesFocus,
  quoteNextAction,
  quoteStatusLabel,
  quoteEventLabel,
} from '../shared/quoteWorkspace'

describe('quote workspace helpers', () => {
  it('treats draft, sent, and viewed as working quotes', () => {
    expect(quoteMatchesFocus('draft', 'working')).toBe(true)
    expect(quoteMatchesFocus('sent', 'working')).toBe(true)
    expect(quoteMatchesFocus('viewed', 'out')).toBe(true)
    expect(quoteMatchesFocus('accepted', 'working')).toBe(false)
    expect(quoteMatchesFocus('accepted', 'won')).toBe(true)
    expect(quoteMatchesFocus('void', 'all')).toBe(true)
  })

  it('picks a single next action for the list', () => {
    expect(quoteNextAction('draft')).toBe('send')
    expect(quoteNextAction('sent')).toBe('copy')
    expect(quoteNextAction('viewed')).toBe('copy')
    expect(quoteNextAction('accepted')).toBe('convert')
    expect(quoteNextAction('accepted', 'inv-1')).toBe('open-invoice')
    expect(quoteNextAction('declined')).toBe('none')
  })

  it('uses plain-language labels', () => {
    expect(quoteStatusLabel('viewed')).toBe('Viewed')
    expect(quoteEventLabel('viewed')).toBe('Opened by recipient')
    expect(quoteEventLabel('sent')).toBe('Sent to recipient')
  })
})

describe('HQ quotes page', () => {
  it('keeps the work queue, composer, and templates on separate screens', () => {
    const source = readFileSync(new URL('../src/pages/admin/QuotesAdmin.tsx', import.meta.url), 'utf8')
    expect(source).toContain("useState<'list' | 'build' | 'templates'>")
    expect(source).toContain('Continue to pricing')
    expect(source).toContain('Duplicate')
    expect(source).toContain('Convert to invoice')
    expect(source).toContain('Convert and mark paid')
    expect(source).not.toContain('RecentWindow')
    expect(source).not.toContain('StatCard')
  })
})

describe('public quote decision', () => {
  it('lets the recipient add notes when accepting or declining', () => {
    const source = readFileSync(new URL('../src/pages/public/QuoteView.tsx', import.meta.url), 'utf8')
    expect(source).toContain('Confirm Accept')
    expect(source).toContain('Confirm Decline')
    expect(source).toContain('decision_note')
  })
})

describe('quote loop wiring', () => {
  it('opens the composer from website requests, leads, and client billing', () => {
    const funnel = readFileSync(new URL('../src/pages/admin/PublicFunnelAdmin.tsx', import.meta.url), 'utf8')
    const leads = readFileSync(new URL('../src/pages/admin/LeadPipelineBoard.tsx', import.meta.url), 'utf8')
    const leadDetail = readFileSync(new URL('../src/pages/admin/LeadDetail.tsx', import.meta.url), 'utf8')
    const client = readFileSync(new URL('../src/pages/admin/ClientDetailModern.tsx', import.meta.url), 'utf8')
    const quotes = readFileSync(new URL('../src/pages/admin/QuotesAdmin.tsx', import.meta.url), 'utf8')
    expect(funnel).toContain("quotes')}?new=1&scope=")
    expect(funnel).toContain('Convert to quote')
    expect(leads).toContain("quotes')}?new=1&email=")
    expect(leadDetail).toContain('New quote')
    expect(leadDetail).toContain("quotes')}?new=1&email=")
    expect(client).toContain("quotes')}?new=1&client=")
    expect(client).toContain('Convert to invoice')
    expect(quotes).toContain("params.get('new') === '1'")
    expect(quotes).toContain('initialClientId')
    expect(quotes).toContain('scope_request_id')
  })

  it('deep-links quotes from search, dashboard, pipeline, and activity', () => {
    const search = readFileSync(new URL('../src/components/admin/GlobalSearch.tsx', import.meta.url), 'utf8')
    const dashboard = readFileSync(new URL('../src/pages/admin/AdminDashboard.tsx', import.meta.url), 'utf8')
    const pipeline = readFileSync(new URL('../src/pages/admin/PipelinesAdmin.tsx', import.meta.url), 'utf8')
    const activity = readFileSync(new URL('../src/pages/admin/ActivityAdmin.tsx', import.meta.url), 'utf8')
    const searchApi = readFileSync(new URL('../functions/_lib/routes/search.ts', import.meta.url), 'utf8')
    expect(search).toContain("quotes')}?quote=")
    expect(searchApi).toContain('quotes: []')
    expect(dashboard).toContain('stale_quotes')
    expect(dashboard).toContain('accepted_quotes')
    expect(dashboard).toContain("quotes')}?quote=")
    expect(pipeline).toContain('/admin/invoices/from-quote/')
    expect(pipeline).toContain("invoices')}?invoice=")
    expect(activity).toContain("quotes')}?quote=")
    expect(activity).toContain("invoices')}?invoice=")
  })

  it('shows pending quotes on portal billing and home', () => {
    const billing = readFileSync(new URL('../src/pages/portal/Billing.tsx', import.meta.url), 'utf8')
    const home = readFileSync(new URL('../src/pages/portal/Dashboard.tsx', import.meta.url), 'utf8')
    const portalApi = readFileSync(new URL('../functions/_lib/routes/portal.ts', import.meta.url), 'utf8')
    expect(billing).toContain('Quotes awaiting your reply')
    expect(billing).toContain('/quote/')
    expect(home).toContain('pending_quotes')
    expect(home).toContain('Review quotes')
    expect(portalApi).toContain('pending_quotes')
  })
})
