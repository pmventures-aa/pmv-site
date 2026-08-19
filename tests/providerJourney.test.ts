import { describe, expect, it } from 'vitest'
import { isReviewStage, reviewStageMeta, reviewProgress, isTerminalStage, REVIEW_PROGRESS } from '../shared/providerJourney'

describe('provider journey', () => {
  it('validates stages', () => {
    expect(isReviewStage('in_review')).toBe(true)
    expect(isReviewStage('nope')).toBe(false)
  })

  it('maps a stage to its metadata', () => {
    expect(reviewStageMeta('approved').label).toBe('Approved')
    expect(reviewStageMeta('submitted').key).toBe('submitted')
  })

  it('reports monotonic progress that ends at 1 for approved', () => {
    expect(reviewProgress('submitted')).toBe(0)
    expect(reviewProgress('approved')).toBe(1)
    expect(reviewProgress('in_review')).toBeGreaterThan(0)
    expect(reviewProgress('in_review')).toBeLessThan(reviewProgress('decision'))
    expect(reviewProgress('declined')).toBe(0)
  })

  it('marks terminal stages', () => {
    expect(isTerminalStage('approved')).toBe(true)
    expect(isTerminalStage('declined')).toBe(true)
    expect(isTerminalStage('in_review')).toBe(false)
    expect(REVIEW_PROGRESS[REVIEW_PROGRESS.length - 1]).toBe('approved')
  })
})
