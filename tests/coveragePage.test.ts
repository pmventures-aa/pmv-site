import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// A dedicated /coverage subpage (kept off the homepage, which stays short):
// remote nationwide vs. hands-on South Florida, plus the vetted-network answer
// for field work elsewhere.
describe('coverage subpage', () => {
  const page = read('../src/pages/public/Coverage.tsx')
  const main = read('../src/main.tsx')
  const footer = read('../src/components/public/Footer.tsx')
  const home = read('../src/pages/Home.tsx')

  it('is routed at /coverage as its own lazy page', () => {
    expect(main).toContain("import('./pages/public/Coverage')")
    expect(main).toContain('path="/coverage"')
  })

  it('presents both coverage modes and the out-of-area answer', () => {
    expect(page).toMatch(/Remote/i)
    expect(page).toMatch(/South Florida/i)
    expect(page).toMatch(/vetted (local )?provider/i)
    expect(page).toContain('What do you need done?')
  })

  it('uses the shared motion primitives and stays reduced-motion aware', () => {
    expect(page).toContain('KineticHeading')
    expect(page).toContain('SectionTransition')
  })

  it('is linked from the footer and the homepage network section', () => {
    expect(footer).toContain('to="/coverage"')
    expect(home).toContain('to="/coverage"')
  })
})
