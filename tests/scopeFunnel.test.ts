import { describe, expect, it } from 'vitest'
import { calculateCleaningEstimate, nextScopeFollowupStep, twoBusinessHoursFrom, type QuoteRule } from '../functions/_lib/scopeFunnel'

const rule: QuoteRule = {
  key:'clean_deep',label:'Deep property cleaning',base_price_cents:19500,per_sqft_cents:22,minimum_price_cents:19500,range_low_percent:90,range_high_percent:120,
}

describe('public scope funnel',()=>{
  it('builds a conservative rounded planning range',()=>{
    expect(calculateCleaningEstimate(rule,1200,'average',false)).toMatchObject({lowCents:24000,highCents:31500})
  })

  it('accounts for heavy condition and rush scheduling',()=>{
    const estimate=calculateCleaningEstimate(rule,1200,'heavy',true)
    expect(estimate.lowCents).toBe(38500)
    expect(estimate.highCents).toBe(51500)
  })

  it('carries the two-business-hour promise across a weekend',()=>{
    expect(twoBusinessHoursFrom(new Date('2026-08-07T20:00:00.000Z'))).toBe('2026-08-10T14:00:00.000Z')
    expect(twoBusinessHoursFrom(new Date('2026-08-07T20:53:00.000Z'))).toBe('2026-08-10T14:53:00.000Z')
    expect(twoBusinessHoursFrom(new Date('2026-08-08T16:00:00.000Z'))).toBe('2026-08-10T15:00:00.000Z')
  })

  it('sends the next unsent follow-up instead of jumping to the latest due step',()=>{
    expect(nextScopeFollowupStep(0, [])).toBeNull()
    expect(nextScopeFollowupStep(1, [])?.key).toBe('day1_make_scope_easy')
    expect(nextScopeFollowupStep(4, [])?.key).toBe('day1_make_scope_easy')
    expect(nextScopeFollowupStep(4, ['day1_make_scope_easy'])?.key).toBe('day3_one_relationship')
    expect(nextScopeFollowupStep(6, ['day1_make_scope_easy','day3_one_relationship'])?.key).toBe('day5_close_loop')
    expect(nextScopeFollowupStep(10, ['day1_make_scope_easy','day3_one_relationship','day5_close_loop'])).toBeNull()
  })
})
