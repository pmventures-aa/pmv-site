import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLEANING_SERVICE_AREAS } from '../shared/cleaningServiceAreas'

// The sitemap is a static file served by Cloudflare Pages. This guard keeps it
// from drifting: if a service area is added to the shared data, this test fails
// until the new /cleaning/<slug> URL is listed in public/sitemap.xml.
const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8')
const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')
const BASE = 'https://pinnaclemanagementventures.com'

describe('sitemap', () => {
  it('lists every cleaning service-area page', () => {
    for (const area of CLEANING_SERVICE_AREAS) {
      expect(sitemap).toContain(`<loc>${BASE}/cleaning/${area.slug}</loc>`)
    }
  })

  it('lists the core public routes', () => {
    for (const path of ['/', '/services', '/cleaning', '/cleaning/areas', '/about', '/contact']) {
      expect(sitemap).toContain(`<loc>${BASE}${path}</loc>`)
    }
  })

  it('is well-formed and points robots.txt at itself', () => {
    expect(sitemap).toMatch(/^<\?xml/)
    expect(sitemap).toContain('<urlset')
    expect(robots).toContain(`Sitemap: ${BASE}/sitemap.xml`)
  })
})
