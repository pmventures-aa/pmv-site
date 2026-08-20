import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync(new URL('../src/pages/portal/Properties.tsx', import.meta.url), 'utf8')

// Phase 2 of the client-portal engagement work: properties render as an
// animated visual card grid (not a thin list), with an obvious request action.
describe('client portal property cards', () => {
  it('renders properties as a responsive, animated card grid', () => {
    expect(src).toContain('motion.ul')
    expect(src).toContain('pmvStagger')
    expect(src).toContain('pmvFadeUp')
    expect(src).toContain('sm:grid-cols-2')
    // Each card lifts on hover for a living feel.
    expect(src).toContain('hover:-translate-y-0.5')
  })

  it('gives the client an obvious way to start a request', () => {
    expect(src).toContain('Start a request')
    expect(src).toContain("p('support')")
  })
})
