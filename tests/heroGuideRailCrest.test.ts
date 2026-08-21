import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The decorative watermark crest in the home hero guide rail floated in dead
// space above the guide card on phones and read as low quality. It is now
// hidden below sm and shown only as a subtle desktop watermark.
describe('hero guide rail crest', () => {
  const src = readFileSync(new URL('../src/components/public/HeroGuideRail.tsx', import.meta.url), 'utf8')

  it('hides the decorative crest on mobile and keeps it on sm+', () => {
    const crestWrapper = src.split('<Crest')[0].split('<div').pop() || ''
    expect(crestWrapper).toContain('hidden')
    expect(crestWrapper).toContain('sm:block')
    // Still decorative, so it never reaches the accessibility tree.
    expect(crestWrapper).toContain('aria-hidden="true"')
  })
})
