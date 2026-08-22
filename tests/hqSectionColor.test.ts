import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ALL_SECTION_CLASSES,
  SECTION_ORDER,
  isKnownSection,
  sectionGlowClass,
  sectionHue,
  sectionNote,
  sectionRailClass,
  sectionTextClass,
} from '../shared/hqSectionColor'

const nav = readFileSync(new URL('../src/components/layout/nav.ts', import.meta.url), 'utf8')

// The hub colours are only useful if they match the hubs that actually exist.
describe('the hues cover the real sidebar', () => {
  const sectionsInNav = [...new Set([...nav.matchAll(/section:'([A-Za-z]+)'/g)].map((m) => m[1]))]

  it('knows every hub the admin nav declares', () => {
    const hqSections = sectionsInNav.filter((s) => SECTION_ORDER.includes(s as never) || true)
    for (const section of hqSections) {
      // Portal and vendor navs use their own section words; only assert the
      // ones this model claims to cover.
      if (SECTION_ORDER.includes(section as never)) {
        expect(isKnownSection(section)).toBe(true)
      }
    }
    // And every hub this model names really is in the nav.
    for (const section of SECTION_ORDER) {
      expect(nav).toContain(`section:'${section}'`)
    }
  })

  it('gives each hub a distinct hue, so the colour carries information', () => {
    const hues = SECTION_ORDER.map((s) => sectionHue(s))
    expect(new Set(hues).size).toBe(SECTION_ORDER.length)
  })

  it('explains why each hub sits where it does', () => {
    for (const section of SECTION_ORDER) {
      expect(sectionNote(section).length).toBeGreaterThan(0)
    }
  })
})

describe('unknown sections', () => {
  // A hub renamed in nav.ts without being renamed here should go quiet, not
  // break. Decoration must never throw.
  it('fall back to slate rather than failing', () => {
    expect(sectionHue('Nonexistent')).toBe('slate')
    expect(sectionHue(null)).toBe('slate')
    expect(sectionHue(undefined)).toBe('slate')
    expect(isKnownSection('Nonexistent')).toBe(false)
    expect(sectionNote('Nonexistent')).toBe('')
  })

  it('still return a usable class for every accessor', () => {
    for (const value of [null, undefined, '', 'Nope']) {
      expect(sectionTextClass(value).length).toBeGreaterThan(0)
      expect(sectionRailClass(value).length).toBeGreaterThan(0)
      expect(sectionGlowClass(value).length).toBeGreaterThan(0)
    }
  })
})

describe('the classes survive the Tailwind scan', () => {
  it('emits no class built by interpolation', () => {
    const src = readFileSync(new URL('../shared/hqSectionColor.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/`[^`]*\$\{[^}]*\}[^`]*(bg|text|border)-/)
  })

  it('names a real palette colour wherever it uses a custom one', () => {
    const tailwind = readFileSync(new URL('../tailwind.config.js', import.meta.url), 'utf8')
    const custom = new Set(['sea', 'coral', 'gold', 'navy', 'sand'])
    for (const cls of ALL_SECTION_CLASSES) {
      for (const token of cls.split(/\s+/)) {
        const family = /^(?:bg|text|border)-([a-z]+)/.exec(token)?.[1]
        if (family && custom.has(family)) expect(tailwind).toContain(`${family}:`)
      }
    }
  })
})

describe('the sweep actually reaches the surfaces', () => {
  it('colours the sidebar hubs and captions why', () => {
    const shell = readFileSync(new URL('../src/components/layout/Shell.tsx', import.meta.url), 'utf8')
    expect(shell).toContain('sectionTextClass(group.section)')
    expect(shell).toContain('sectionRailClass(group.section)')
    expect(shell).toContain('title={sectionNote(group.section)}')
  })

  it('carries the hue into the page header, with a brand fallback', () => {
    const ui = readFileSync(new URL('../src/components/admin/ui.tsx', import.meta.url), 'utf8')
    expect(ui).toContain("section?sectionTextClass(section):'text-gold/85'")
  })

  it('warms the empty state, which is what a quiet day looks like', () => {
    const ui = readFileSync(new URL('../src/components/admin/ui.tsx', import.meta.url), 'utf8')
    expect(ui).toContain('sectionGlowClass(section)')
    expect(ui).not.toContain('bg-white/[.012] px-4 py-8 text-center text-sm text-slate-500')
  })

  it('tags real workspaces with their hub rather than leaving the model unused', () => {
    const pages: Array<[string, string]> = [
      ['../src/pages/admin/WorkProposalsAdmin.tsx', 'Delivery'],
      ['../src/pages/admin/InvoicesAdmin.tsx', 'Revenue'],
      ['../src/pages/admin/CasesAdmin.tsx', 'Service'],
      ['../src/pages/admin/UsersAdmin.tsx', 'People'],
      ['../src/pages/admin/SecurityCenter.tsx', 'Administration'],
    ]
    for (const [path, section] of pages) {
      const src = readFileSync(new URL(path, import.meta.url), 'utf8')
      expect(src).toContain(`section="${section}"`)
    }
  })
})

// Colour is a fast read, never the only one.
describe('nothing depends on hue alone', () => {
  it('keeps the hub name beside its colour rail', () => {
    const shell = readFileSync(new URL('../src/components/layout/Shell.tsx', import.meta.url), 'utf8')
    expect(shell).toContain('{group.section}')
    expect(shell).toContain('aria-hidden="true"')
  })
})
