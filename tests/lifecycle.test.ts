import { describe, expect, it } from 'vitest'
import { lifecycleLabel, nextLifecycle } from '../shared/lifecycle'

describe('lead lifecycle', () => {
  it('keeps a reserved account as a lead until they engage', () => {
    expect(nextLifecycle('lead', 'lead')).toBe('lead')
    expect(nextLifecycle('lead', 'prospect')).toBe('prospect')
  })

  it('promotes login to prospect and an application start to the application phase', () => {
    expect(nextLifecycle('lead', 'prospect')).toBe('prospect')
    expect(nextLifecycle('prospect', 'opportunity')).toBe('opportunity')
    expect(lifecycleLabel('opportunity')).toBe('Application')
  })

  it('never moves backward or out of converted/lost', () => {
    expect(nextLifecycle('opportunity', 'prospect')).toBe('opportunity')
    expect(nextLifecycle('converted', 'prospect')).toBe('converted')
    expect(nextLifecycle('lost', 'opportunity')).toBe('lost')
  })
})
