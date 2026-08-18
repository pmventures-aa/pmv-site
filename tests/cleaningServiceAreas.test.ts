import { describe, expect, it } from 'vitest'
import { CLEANING_SERVICE_AREAS, findServiceArea, nearbyAreas, areasByCounty } from '../shared/cleaningServiceAreas'

describe('cleaning service areas', () => {
  it('has unique, url-safe slugs', () => {
    const slugs = CLEANING_SERVICE_AREAS.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
  })

  it('does not collide with reserved cleaning sub-routes', () => {
    const slugs = new Set(CLEANING_SERVICE_AREAS.map((a) => a.slug))
    for (const reserved of ['airbnb-turnovers', 'recurring', 'areas']) expect(slugs.has(reserved)).toBe(false)
  })

  it('looks up an area by slug', () => {
    expect(findServiceArea('fort-lauderdale')?.city).toBe('Fort Lauderdale')
    expect(findServiceArea('nowhere')).toBeUndefined()
  })

  it('nearby areas share the county and exclude self', () => {
    const area = findServiceArea('miami')!
    const near = nearbyAreas(area)
    expect(near.length).toBeGreaterThan(0)
    expect(near.every((a) => a.county === 'miami_dade')).toBe(true)
    expect(near.some((a) => a.slug === 'miami')).toBe(false)
  })

  it('groups every area under one of the three counties', () => {
    const groups = areasByCounty()
    expect(groups.map((g) => g.county)).toEqual(['miami_dade', 'broward', 'palm_beach'])
    expect(groups.reduce((n, g) => n + g.areas.length, 0)).toBe(CLEANING_SERVICE_AREAS.length)
  })
})
