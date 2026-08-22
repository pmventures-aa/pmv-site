import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const home = readFileSync(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8')

// The guided wizard was already on the homepage, eighth of nine sections,
// below a hero that was a full viewport tall. The experience existed; nobody
// scrolled far enough to find it.

describe('the questions come first', () => {
  it('puts the wizard above the hero', () => {
    const wizardAt = home.indexOf('<ScopeWizard source="home" compact />')
    const heroAt = home.indexOf('pmv-hero-story')
    expect(wizardAt).toBeGreaterThan(-1)
    expect(heroAt).toBeGreaterThan(-1)
    expect(wizardAt).toBeLessThan(heroAt)
  })

  it('opens with a question rather than a statement', () => {
    expect(home).toContain('What do you need handled?')
    expect(home).toContain('Start here')
  })

  it('says it is short before asking anything', () => {
    // The reason people abandon a form is not knowing how long it is.
    expect(home).toContain('Answer a few short questions')
    expect(home).toContain('Two minutes, no account')
  })
})

describe('the hero keeps its place, not the whole screen', () => {
  it('no longer demands a full viewport', () => {
    // A 100vh hero above the wizard would put the questions off-screen for
    // every visitor, which is the problem being fixed.
    expect(home).not.toContain('min-h-[calc(100vh-68px)]')
  })

  it('is still there', () => {
    expect(home).toContain('pmv-hero-story')
    expect(home).toContain("text: 'Professional Support.'")
    expect(home).toContain("text: 'One Call Away.'")
  })
})

describe('one h1 on the page', () => {
  it('belongs to the question, and the hero heading steps down', () => {
    // Two h1s is an accessibility and SEO problem; the page's subject is now
    // the question, so the hero headline becomes an h2.
    const h1s = home.match(/<h1[\s>]/g) ?? []
    expect(h1s).toHaveLength(1)
    const h1At = home.indexOf('<h1')
    expect(home.slice(h1At, h1At + 120)).toContain('What do you need handled?')
  })

  it('closes the heading it opens', () => {
    expect(home.match(/<h1[\s>]/g) ?? []).toHaveLength((home.match(/<\/h1>/g) ?? []).length)
  })
})
