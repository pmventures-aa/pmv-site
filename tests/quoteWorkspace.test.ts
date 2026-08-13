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
    expect(quoteNextAction('accepted')).toBe('none')
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
    expect(source).not.toContain('RecentWindow')
    expect(source).not.toContain('StatCard')
  })
})
