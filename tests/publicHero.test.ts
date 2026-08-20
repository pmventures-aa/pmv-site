import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

// Public-site redesign, Phase A: a single motion library gains the two named
// primitives the brief calls for (KineticHeading, SectionTransition), and the
// homepage hero uses them around copy that is LOCKED verbatim.
describe('public homepage hero (Phase A)', () => {
  const home = read('../src/pages/Home.tsx')
  const motion = read('../src/components/public/motion.tsx')

  it('keeps the locked hero headline verbatim, split into its two lines', () => {
    expect(home).toContain("text: 'Professional Support.'")
    expect(home).toContain("text: 'One Call Away.'")
    // No rotating/replacement headline: the marquee line is the locked copy.
    expect(home).not.toMatch(/rotat(e|ing)Headline|headlineVariants/i)
  })

  it('keeps the locked hero subhead verbatim', () => {
    expect(home).toContain('Business, property, and administrative matters handled through one trusted point of contact.')
  })

  it('uses the brief primary CTA label', () => {
    expect(home).toContain("'What do you need done?'")
  })

  it('renders the headline through the KineticHeading primitive', () => {
    expect(home).toContain('<KineticHeading')
    expect(home).toContain("trigger=\"mount\"")
  })

  it('adds the named primitives to the single public motion library', () => {
    expect(motion).toContain('export function KineticHeading')
    expect(motion).toContain('export function SectionTransition')
    // Both must honor reduced motion.
    expect(motion).toMatch(/KineticHeading[\s\S]*useReducedMotion/)
  })
})
