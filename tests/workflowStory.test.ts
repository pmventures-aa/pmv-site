import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Public-site redesign, Phase C: the request-to-resolved workflow told as a
// scroll story - a gold spine that fills as the reader moves down and stages
// that light as they arrive. Replaces the orbital diagram on the home page.
describe('workflow story', () => {
  const comp = read('../src/components/public/WorkflowStory.tsx')
  const home = read('../src/pages/Home.tsx')
  const services = read('../src/pages/public/ServicesOverview.tsx')

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

  it('is reused on the services page in place of the static workflow image', () => {
    expect(services).toContain('<WorkflowStory')
    expect(services).not.toContain('request-to-completion')
  })

  it('is reused on the service hub pages in place of ProcessJourney', () => {
    const hubs = read('../src/pages/public/ServiceHubs.tsx')
    expect(hubs).toContain('<WorkflowStory')
    expect(hubs).not.toContain('ProcessJourney')
  })

  it('carries the brief five-stage sequence from one shared source', () => {
    expect(comp).toContain('export const PMV_WORKFLOW')
    for (const key of ['request', 'coordination', 'execution', 'documentation', 'completion']) {
      expect(comp).toContain(`key: '${key}'`)
    }
    // Both surfaces pull from the shared constant, not their own copies.
    expect(home).toContain('PMV_WORKFLOW')
    expect(services).toContain('PMV_WORKFLOW')
  })
})
