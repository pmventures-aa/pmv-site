import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The brand book is only worth committing if it cannot quietly go stale. These
// tests pin every claim in docs/BRAND.md to the file that makes it true, so
// changing a brand colour, swapping a typeface, or deleting a logo without
// updating the document fails CI instead of leaving a confident lie in the
// repository.

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

/** Every source file that mentions the given asset filename. */
function referencesTo(filename: string): string[] {
  const roots = ['src', 'shared', 'functions']
  const hits: string[] = []
  const walk = (dir: URL) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
      if (entry.isDirectory()) walk(child)
      else if (/\.(ts|tsx|css|html)$/.test(entry.name) && readFileSync(child, 'utf8').includes(filename)) {
        hits.push(entry.name)
      }
    }
  }
  for (const root of roots) walk(new URL(`../${root}/`, import.meta.url))
  hits.push(...(read('index.html').includes(filename) ? ['index.html'] : []))
  return hits
}

const brand = read('docs/BRAND.md')
const tailwind = read('tailwind.config.js')
const indexHtml = read('index.html')

describe('the palette matches tailwind.config.js', () => {
  // Pulled out of the config rather than typed here, so this test cannot drift
  // from the config either.
  const hexesInConfig = new Set((tailwind.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((h) => h.toUpperCase()))
  const hexesInDoc = new Set((brand.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((h) => h.toUpperCase()))

  it('documents a real palette rather than a handful of colours', () => {
    expect(hexesInDoc.size).toBeGreaterThanOrEqual(20)
  })

  it('quotes no colour the config does not define', () => {
    const invented = [...hexesInDoc].filter((hex) => !hexesInConfig.has(hex))
    expect(invented).toEqual([])
  })

  it('omits no colour the config does define', () => {
    const missing = [...hexesInConfig].filter((hex) => !hexesInDoc.has(hex))
    expect(missing).toEqual([])
  })

  it('carries the signature gradient verbatim', () => {
    const gradient = 'radial-gradient(120% 120% at 50% 0%, #132B4D 0%, #081525 55%, #050E19 100%)'
    expect(tailwind).toContain(gradient)
    expect(brand).toContain(gradient)
  })
})

describe('the type matches what the page loads', () => {
  it('names both faces, and both are actually requested', () => {
    for (const face of ['DM Sans', 'Manrope']) {
      expect(brand).toContain(face)
      expect(indexHtml).toContain(face.replace(' ', '+'))
    }
  })

  it('lists the weights that are really loaded', () => {
    expect(indexHtml).toContain('DM+Sans:wght@400;500;600;700')
    expect(indexHtml).toContain('Manrope:wght@500;600;700;800')
    expect(brand).toContain('400, 500, 600, 700')
    expect(brand).toContain('500, 600, 700, 800')
  })
})

describe('every logo it names exists', () => {
  const paths = [...brand.matchAll(/`(public\/[A-Za-z0-9._-]+)`/g)].map((m) => m[1])

  it('references the whole set, not a sample', () => {
    expect(new Set(paths).size).toBeGreaterThanOrEqual(8)
  })

  it.each([...new Set(paths)])('%s is in the repository', (path) => {
    expect(existsSync(new URL(`../${path}`, import.meta.url))).toBe(true)
  })
})

describe('the claims about where each logo is used', () => {
  it('is right that the white-ground crest has no transparency', () => {
    // PNG colour type lives at byte 25; 6 is RGBA, 2 is RGB with no alpha.
    const solid = readFileSync(new URL('../public/logo-crest.png', import.meta.url))
    const transparent = readFileSync(new URL('../public/logo-crest-transparent.png', import.meta.url))
    expect(solid[25]).toBe(2)
    expect(transparent[25]).toBe(6)
    expect(brand).toContain('no transparency')
  })

  it('is right that the pale gold crest is unused', () => {
    // Actually walk the source tree. A claim that a file is dead is exactly
    // the kind that rots the moment someone starts using it.
    expect(referencesTo('logo-crest-white-gold.png')).toEqual([])
    expect(brand).toContain('Nothing in the site currently references this file')
  })

  it('is right that the other crests are in use', () => {
    // The mirror of the test above: if these ever go quiet, the "used by"
    // lines in the document have become fiction too.
    expect(referencesTo('logo-crest-on-dark.png').length).toBeGreaterThan(0)
    expect(referencesTo('logo-crest-transparent.png').length).toBeGreaterThan(0)
    expect(referencesTo('logo-crest-letterhead.png').length).toBeGreaterThan(0)
  })

  it('is right about the letterhead render size', () => {
    const letterhead = read('shared/letterhead.ts')
    expect(letterhead).toContain('CREST_LETTERHEAD_WIDTH = 73')
    expect(letterhead).toContain('CREST_LETTERHEAD_HEIGHT = 94')
    expect(brand).toContain('73 x 94')
  })
})

describe('the firm details are the ones the code sends', () => {
  const letterhead = read('shared/letterhead.ts')

  it('quotes the real name, phone, and site', () => {
    expect(letterhead).toContain("FIRM_NAME = 'Pinnacle Management Ventures'")
    expect(letterhead).toContain("FIRM_PHONE = '(561) 388-7879'")
    expect(brand).toContain('Pinnacle Management Ventures')
    expect(brand).toContain('(561) 388-7879')
    expect(brand).toContain('https://www.pinnaclemanagementventures.com')
  })
})

describe('the voice rules', () => {
  it('carry the content constraints the site is built against', () => {
    for (const rule of ['licensed', 'insured', 'vetted', 'bonded', 'background-checked', 'guaranteed outcome', 'emoji']) {
      expect(brand.toLowerCase()).toContain(rule.toLowerCase())
    }
  })

  it('practises what it preaches about emoji', () => {
    // Anything outside the Basic Multilingual Plane is an emoji or similar.
    expect(brand).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})
