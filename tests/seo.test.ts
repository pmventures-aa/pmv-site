import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Guard the static SEO surface in index.html: the social scrapers and crawlers
// that do not run JS depend on these being present in the initial HTML.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

describe('index.html SEO tags', () => {
  it('declares a canonical URL on the www host', () => {
    expect(html).toContain('<link rel="canonical" href="https://www.pinnaclemanagementventures.com/" />')
  })

  it('has Open Graph and Twitter card tags', () => {
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) {
      expect(html).toContain(tag)
    }
  })

  it('embeds Organization + WebSite structured data', () => {
    expect(html).toContain('application/ld+json')
    expect(html).toContain('"@type": "Organization"')
    expect(html).toContain('"@type": "WebSite"')
    expect(html).toContain('"telephone": "+1-561-388-7879"')
  })
})
