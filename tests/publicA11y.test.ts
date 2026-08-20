import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Accessibility pass on the public pages: decorative arrows must not be read
// aloud, the check bullet is a real icon not a glyph, and the split hero heading
// gets one spaced accessible name.
describe('public accessibility', () => {
  const home = read('../src/pages/Home.tsx')
  const hubs = read('../src/pages/public/ServiceHubs.tsx')
  const services = read('../src/pages/public/ServicesOverview.tsx')
  const motion = read('../src/components/public/motion.tsx')

  it('does not leave a raw check glyph in the homepage', () => {
    expect(home).not.toContain('✓')
    expect(home).toContain('name="check"')
  })

  it('hides every decorative arrow from screen readers', () => {
    // No bare arrow may sit directly against markup without aria-hidden nearby.
    for (const src of [home, hubs, services]) {
      const bare = src.match(/(?<!aria-hidden="true"[^<]*)>[^<>]*→/g) || []
      // Every arrow that renders should be inside an aria-hidden span.
      const arrows = (src.match(/→/g) || []).length
      const hidden = (src.match(/aria-hidden="true"[^>]*>→|>→<\/span>/g) || []).length
      expect(arrows).toBeGreaterThan(0)
      expect(hidden).toBeGreaterThanOrEqual(arrows - bare.length)
    }
    // Explicit spot checks.
    expect(home).toContain('<span aria-hidden="true">→</span>')
    expect(hubs).toContain('aria-hidden="true" className="inline-block')
  })

  it('gives the kinetic hero one spaced accessible name', () => {
    expect(motion).toContain("aria-label={lines.map((l) => l.text).join(' ')}")
  })
})
