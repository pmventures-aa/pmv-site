import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { statusToPercent } from '../src/components/portal/JourneyProgress'

// Phase 1 of the client-portal engagement work: a progress ring per service/job
// on the home, plus the subtle EAGLE motto.
describe('client journey progress', () => {
  it('maps a job status/stage to an advancing completion percentage', () => {
    expect(statusToPercent('completed')).toBe(100)
    expect(statusToPercent('closed')).toBe(100)
    expect(statusToPercent('under_review')).toBe(80)
    expect(statusToPercent('in_progress')).toBe(55)
    expect(statusToPercent('open')).toBe(20)
    expect(statusToPercent('requested')).toBe(20)
    // Unknown stages land in the middle rather than 0 or 100.
    expect(statusToPercent('something_else')).toBe(40)
  })

  it('renders one animated ring per service/job and an easy start action', () => {
    const src = readFileSync(new URL('../src/components/portal/JourneyProgress.tsx', import.meta.url), 'utf8')
    expect(src).toContain('jobs.map')
    expect(src).toContain('motion.circle')
    expect(src).toContain('Start something new')
    // Empty state nudges the client to begin a service.
    expect(src).toContain('Start a service')
  })

  it('feeds the ring from the client dashboard services and matters', () => {
    const dash = readFileSync(new URL('../src/pages/portal/Dashboard.tsx', import.meta.url), 'utf8')
    expect(dash).toContain('<JourneyProgress')
    expect(dash).toContain('active_matters')
    expect(dash).toContain('enabled_services')
  })

  it('carries the EAGLE motto subtly in the portal welcome', () => {
    const welcome = readFileSync(new URL('../src/components/DashboardWelcome.tsx', import.meta.url), 'utf8')
    expect(welcome).toContain('ndeavor')
    expect(welcome).toContain('row')
    expect(welcome).toContain('nhance')
  })
})
