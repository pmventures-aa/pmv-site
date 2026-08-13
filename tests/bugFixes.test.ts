import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nextScopeFollowupStep, SCOPE_FOLLOWUP_STEPS } from '../functions/_lib/scopeFunnel'
import { impersonationBlockReason } from '../functions/_lib/impersonationGuard'
import { parseSqliteUtc, timeAgo } from '../src/lib/activity'
import { isCampaignAudienceQuery } from '../src/lib/engagements'
import { normalizeTrustedPermissions } from '../functions/_lib/trustedAccess'

describe('impersonation denylist', () => {
  const impersonating = { impersonation_session_id: 'imp-1' }

  it('blocks password, logout, and nested impersonation while impersonating', () => {
    expect(impersonationBlockReason(impersonating, 'POST', '/api/auth/change-password')).toMatch(/password/)
    expect(impersonationBlockReason(impersonating, 'POST', '/api/auth/logout')).toMatch(/logout/)
    expect(impersonationBlockReason(impersonating, 'POST', '/api/admin/impersonate')).toMatch(/nested/)
    expect(impersonationBlockReason(impersonating, 'DELETE', '/api/me')).toMatch(/deletion/)
  })

  it('does not block ordinary traffic or a normal session', () => {
    expect(impersonationBlockReason(impersonating, 'GET', '/api/me')).toBeNull()
    expect(impersonationBlockReason({ impersonation_session_id: null }, 'POST', '/api/auth/change-password')).toBeNull()
    expect(impersonationBlockReason(null, 'POST', '/api/auth/logout')).toBeNull()
  })
})

describe('scope follow-up sequence', () => {
  it('sends the earliest missing step instead of jumping to the latest eligible one', () => {
    expect(nextScopeFollowupStep(0.5, [])).toBeNull()
    expect(nextScopeFollowupStep(1, [])?.key).toBe('day1_make_scope_easy')
    expect(nextScopeFollowupStep(5, [])?.key).toBe('day1_make_scope_easy')
    expect(nextScopeFollowupStep(5, ['day1_make_scope_easy'])?.key).toBe('day3_one_relationship')
    expect(nextScopeFollowupStep(5, ['day1_make_scope_easy', 'day3_one_relationship'])?.key).toBe('day5_close_loop')
    expect(nextScopeFollowupStep(6, SCOPE_FOLLOWUP_STEPS.map((step) => step.key))).toBeNull()
  })
})

describe('UTC date parsing', () => {
  it('accepts both SQLite datetime and ISO timestamps', () => {
    expect(parseSqliteUtc('2026-08-13 16:00:00').toISOString()).toBe('2026-08-13T16:00:00.000Z')
    expect(parseSqliteUtc('2026-08-13T16:00:00Z').toISOString()).toBe('2026-08-13T16:00:00.000Z')
    expect(Number.isNaN(parseSqliteUtc('2026-08-13T16:00:00Z').getTime())).toBe(false)
    expect(timeAgo('2026-08-13T16:00:00Z')).not.toBe('Invalid Date')
  })
})

describe('campaign audience deep links', () => {
  it('treats a client selector as an Email Center audience', () => {
    expect(isCampaignAudienceQuery(new URLSearchParams('client=abc'))).toBe(true)
    expect(isCampaignAudienceQuery(new URLSearchParams('lead=abc'))).toBe(true)
    expect(isCampaignAudienceQuery(new URLSearchParams('tab=email'))).toBe(false)
  })
})

describe('trusted permission JSON', () => {
  it('normalizes corrupt objects to none instead of throwing', () => {
    expect(normalizeTrustedPermissions(undefined).documents).toBe('none')
    expect(normalizeTrustedPermissions('not-json').calendar).toBe('none')
  })
})

describe('source contracts for crash bugs', () => {
  it('keeps signer audit INSERT placeholders aligned with bind values', () => {
    const source = readFileSync(new URL('../functions/_lib/routes/documentSignerSecurity.ts', import.meta.url), 'utf8')
    const match = source.match(/INSERT INTO envelope_events\([^)]+\) VALUES \(([^)]+)\)/)
    expect(match, 'signer event INSERT is missing').toBeTruthy()
    const placeholders = (match?.[1].match(/\?/g) || []).length
    expect(placeholders).toBe(10)
  })

  it('does not mangle service-hub intake query strings', () => {
    const source = readFileSync(new URL('../src/pages/public/ServiceHubs.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('${HUB_INTAKE[hub].to}-bottom')
  })
})
