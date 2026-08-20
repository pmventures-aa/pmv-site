import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Public-site redesign, Phase B: a connected-service constellation on the home
// page - PMV's capabilities arranged around a single point of contact.
describe('service constellation', () => {
  const comp = read('../src/components/public/ServiceConstellation.tsx')
  const home = read('../src/pages/Home.tsx')

  it('is used on the home page in place of the static network image', () => {
    expect(home).toContain('ServiceConstellation')
    expect(home).not.toContain('one-network-nationwide-coverage')
  })

  it('centers the hub through motion x/y, not a Tailwind translate that the animated transform would wipe', () => {
    // Regression guard: motion.div elements that also animate scale must not rely
    // on -translate-x/y-1/2 (Framer overwrites transform), so centering rides on style x/y.
    expect(comp).toContain("x: '-50%', y: '-50%'")
    expect(comp).not.toContain('-translate-x-1/2 -translate-y-1/2')
  })

  it('maps the SVG connectors 1:1 onto the box so lines meet the hub', () => {
    expect(comp).toContain('preserveAspectRatio="none"')
  })

  it('honors reduced motion', () => {
    expect(comp).toContain('useReducedMotion')
  })
})
