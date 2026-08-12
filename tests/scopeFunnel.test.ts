import { describe, expect, it } from 'vitest'
import { calculateCleaningEstimate, twoBusinessHoursFrom, type QuoteRule } from '../functions/_lib/scopeFunnel'

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
})
