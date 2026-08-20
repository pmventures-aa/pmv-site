import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Public-site redesign, Phase C: the request-to-resolved workflow told as a
// scroll story - a gold spine that fills as the reader moves down and stages
// that light as they arrive. Replaces the orbital diagram on the home page.
describe('workflow story', () => {
  const comp = read('../src/components/public/WorkflowStory.tsx')
  const home = read('../src/pages/Home.tsx')

  it('is a scroll-driven story with a progress spine', () => {
    expect(comp).toContain('useScroll')
    expect(comp).toContain('scaleY')
  })

  it('honors reduced motion', () => {
    expect(comp).toContain('useReducedMotion')
  })

  it('drives the home page workflow section and replaces OrbitalFlow', () => {
    expect(home).toContain('<WorkflowStory')
    expect(home).not.toContain('OrbitalFlow')
  })

  it('carries the brief five-stage sequence', () => {
    for (const key of ['request', 'coordination', 'execution', 'documentation', 'completion']) {
      expect(home).toContain(`key: '${key}'`)
    }
  })
})
