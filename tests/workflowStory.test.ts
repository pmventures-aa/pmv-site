import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Public-site redesign, Phase C: the request-to-resolved workflow told as a
// scroll story - gold connectors that draw between the stage markers as the
// reader moves down and rings that complete as each stage arrives. The
// connectors live only in the gaps so the path never crosses the digits.
// Replaces the orbital diagram on the home page.
describe('workflow story', () => {
  const comp = read('../src/components/public/WorkflowStory.tsx')
  const home = read('../src/pages/Home.tsx')
  const services = read('../src/pages/public/ServicesOverview.tsx')

  it('is a scroll-driven story whose connectors draw between stages', () => {
    expect(comp).toContain('whileInView')
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
