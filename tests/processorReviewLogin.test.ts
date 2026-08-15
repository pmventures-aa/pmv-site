import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PROCESSOR_REVIEW_EMAIL,
  generateProcessorReviewPassword,
  isProcessorReviewEmail,
} from '../shared/processorReviewLogin'
import { SERVICE_WORLD } from '../shared/workspace'
import { clientPortalNav } from '../src/components/layout/nav'

describe('processor review login', () => {
  it('builds a readable temporary password', () => {
    const password = generateProcessorReviewPassword(() => Uint8Array.from({ length: 16 }, (_, i) => i + 1))
    expect(password).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/)
    expect(isProcessorReviewEmail(PROCESSOR_REVIEW_EMAIL)).toBe(true)
    expect(isProcessorReviewEmail('cjenkins@pinnaclemanagementventures.com')).toBe(false)
  })

  it('turns on every client-facing module when all services are assigned', () => {
    const keys = Object.keys(SERVICE_WORLD)
    const nav = clientPortalNav(keys).map((item) => item.key)
    expect(nav).toContain('properties')
    expect(nav).toContain('funding')
    expect(nav).toContain('billing')
    expect(nav).toContain('documents')
    expect(nav).toContain('support')
    expect(nav).toContain('work')
    expect(nav).not.toContain('users')
    expect(nav).not.toContain('settings')
  })

  it('stages the login from HQ settings as a client, not HQ', () => {
    const panel = readFileSync(new URL('../src/pages/admin/settings/ProcessorReviewLoginPanel.tsx', import.meta.url), 'utf8')
    const backend = readFileSync(new URL('../functions/_lib/processorReviewLogin.ts', import.meta.url), 'utf8')
    expect(panel).toContain('Stage processor review login')
    expect(panel).toContain('cannot open HQ')
    expect(backend).toContain("role = 'client'")
    expect(backend).toContain('two_factor_enabled = 0')
    expect(backend).toContain("status = 'active'")
    expect(backend).toContain('SELECT key FROM services WHERE active = 1')
    expect(backend).toContain('POS / Payments Implementation Coordination')
  })
})
