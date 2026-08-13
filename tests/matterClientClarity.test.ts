import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  clientStageLabel,
  defaultMilestonesForType,
  inferMilestoneStatus,
  nextActionHref,
  resolveResponsibility,
  responsibilityBanner,
  responsibilityRank,
} from '../shared/matterWorkspace'

describe('matter client clarity', () => {
  it('maps operational status to a client-safe responsibility banner', () => {
    expect(resolveResponsibility(null, 'in_progress')).toBe('pinnacle')
    expect(resolveResponsibility(null, 'blocked')).toBe('third_party')
    expect(resolveResponsibility(null, 'closed')).toBe('none')
    expect(responsibilityBanner('client', 'open').label).toBe('Waiting on you')
    expect(responsibilityBanner('pinnacle', 'in_progress').body).toBe('Nothing is currently required from you.')
    expect(responsibilityBanner('third_party', 'blocked', 'Waiting on the clerk to record.').body).toBe('Waiting on the clerk to record.')
    expect(clientStageLabel(null, 'blocked')).toBe('Waiting')
  })

  it('seeds a short milestone path and infers current state', () => {
    const steps = defaultMilestonesForType('property_work')
    expect(steps).toHaveLength(4)
    expect(inferMilestoneStatus('open', 0, 4)).toBe('current')
    expect(inferMilestoneStatus('closed', 3, 4)).toBe('current')
    expect(nextActionHref('upload', 'abc')).toBe('documents')
    expect(nextActionHref('message', 'abc')).toBe('matters/abc')
    expect(responsibilityRank('client', 'in_progress')).toBeLessThan(responsibilityRank('pinnacle', 'in_progress'))
  })

  it('keeps Work as a first-class portal destination and stores client-safe fields', () => {
    const nav = readFileSync(new URL('../src/components/layout/nav.ts', import.meta.url), 'utf8')
    const portal = readFileSync(new URL('../functions/_lib/routes/portal.ts', import.meta.url), 'utf8')
    const detail = readFileSync(new URL('../src/pages/portal/MatterDetail.tsx', import.meta.url), 'utf8')
    const migration = readFileSync(new URL('../migrations/0069_matter_client_clarity.sql', import.meta.url), 'utf8')
    expect(nav).toContain("key:'work'")
    expect(nav).toContain("label:'Work'")
    expect(portal).toContain('active_matters')
    expect(portal).toContain('blocked_reason_client_safe')
    expect(portal).toContain('matter_milestones')
    expect(detail).toContain('Nothing is currently required from you.')
    expect(detail).toContain('Send an update')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS matter_milestones')
    expect(migration).not.toMatch(/card_number|cvv2|primary_account/i)
  })
})
