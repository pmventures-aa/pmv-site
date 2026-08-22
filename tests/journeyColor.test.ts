import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ALL_JOURNEY_CLASSES,
  JOURNEY_LENGTH,
  JOURNEY_STAGES,
  isJourneyStage,
  journeyChipClass,
  journeyHint,
  journeyHue,
  journeyLabel,
  journeyProgress,
  journeyStage,
} from '../shared/journeyColor'
import { LIFECYCLE_STAGES } from '../shared/lifecycle'

describe('the journey covers the lifecycle exactly', () => {
  it('has one stage for every lifecycle stage, and no extras', () => {
    expect(JOURNEY_STAGES.map((s) => s.key).sort()).toEqual([...LIFECYCLE_STAGES].sort())
  })

  it('warms as the relationship deepens', () => {
    expect(journeyHue('lead')).toBe('slate')
    expect(journeyHue('prospect')).toBe('sea')
    expect(journeyHue('opportunity')).toBe('gold')
    expect(journeyHue('converted')).toBe('green')
  })

  it('gives every stage a label and a plain-English hint', () => {
    for (const stage of JOURNEY_STAGES) {
      expect(stage.label.length).toBeGreaterThan(0)
      expect(stage.hint.length).toBeGreaterThan(0)
      expect(journeyHint(stage.key)).toBe(stage.hint)
    }
  })
})

// A lost lead did not travel further than a converted one. Putting it at the
// end of the rail would be a lie about what happened to it.
describe('lost sits outside the journey, not at the end of it', () => {
  it('has no step and no progress', () => {
    expect(journeyStage('lost').step).toBeNull()
    expect(journeyProgress('lost')).toBeNull()
  })

  it('does not lengthen the rail', () => {
    expect(JOURNEY_LENGTH).toBe(4)
    expect(JOURNEY_STAGES.filter((s) => s.step !== null)).toHaveLength(4)
  })
})

describe('progress along the rail', () => {
  it('advances and ends at one', () => {
    expect(journeyProgress('lead')).toBeCloseTo(0.25)
    expect(journeyProgress('prospect')).toBeCloseTo(0.5)
    expect(journeyProgress('opportunity')).toBeCloseTo(0.75)
    expect(journeyProgress('converted')).toBe(1)
  })

  it('never goes backwards through the declared order', () => {
    const steps = JOURNEY_STAGES.filter((s) => s.step !== null).map((s) => s.step as number)
    expect(steps).toEqual([...steps].sort((a, b) => a - b))
  })
})

describe('unknown input', () => {
  it('falls back to lead rather than throwing', () => {
    expect(journeyStage(null).key).toBe('lead')
    expect(journeyStage(undefined).key).toBe('lead')
    expect(journeyHue('nonsense')).toBe('slate')
  })

  // Falling back to the LEAD colour is a safe default; silently relabelling an
  // unknown stage as "Lead" would be a lie, so the label defers to lifecycle.
  it('still labels an unrecognized stage honestly', () => {
    expect(journeyLabel('re_engaged')).toBe('Re Engaged')
    expect(isJourneyStage('re_engaged')).toBe(false)
    expect(isJourneyStage('converted')).toBe(true)
  })
})

// Tailwind scans source for whole class strings. A class assembled at runtime
// compiles to nothing and renders an unstyled chip, so every string has to be
// written out literally.
describe('the classes survive the Tailwind scan', () => {
  it('emits no class built by interpolation', () => {
    const src = readFileSync(new URL('../shared/journeyColor.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/`[^`]*\$\{[^}]*\}[^`]*(bg|text|border)-/)
  })

  it('names a real palette colour in every class it can emit', () => {
    const tailwind = readFileSync(new URL('../tailwind.config.js', import.meta.url), 'utf8')
    const custom = new Set(['sea', 'coral', 'gold', 'navy', 'sand'])
    for (const cls of ALL_JOURNEY_CLASSES) {
      for (const token of cls.split(/\s+/)) {
        const family = /^(?:bg|text|border)-([a-z]+)/.exec(token)?.[1]
        if (family && custom.has(family)) expect(tailwind).toContain(`${family}:`)
      }
    }
  })

  it('gives each stage a distinct chip, so the colour actually carries meaning', () => {
    const chips = JOURNEY_STAGES.map((s) => journeyChipClass(s.key))
    expect(new Set(chips).size).toBe(JOURNEY_STAGES.length)
  })
})

// The palette existed and was never spent: gold 1500 uses, sea 18, coral 12,
// sand 0. Spending it is the point of this module.
describe('it actually spends the unused accents', () => {
  it('puts sea and coral to work rather than reaching for gold again', () => {
    const hues = JOURNEY_STAGES.map((s) => s.hue)
    expect(hues).toContain('sea')
    expect(new Set(hues).size).toBe(JOURNEY_STAGES.length)
  })
})

describe('colour is never the only signal', () => {
  const chip = readFileSync(new URL('../src/components/admin/JourneyChip.tsx', import.meta.url), 'utf8')

  it('always prints the stage name beside the colour', () => {
    expect(chip).toContain('{journeyLabel(stage)}')
  })

  it('describes the rail for a screen reader', () => {
    expect(chip).toContain('role="img"')
    expect(chip).toContain('aria-label={`Journey:')
  })
})

describe('HQ uses the shared model instead of its own', () => {
  it('drops the one-off tone map that used to live in LeadDetail', () => {
    const detail = readFileSync(new URL('../src/pages/admin/LeadDetail.tsx', import.meta.url), 'utf8')
    expect(detail).not.toContain('function lifecycleTone')
    expect(detail).toContain('<JourneyChip stage={r.lifecycle_stage} />')
    expect(detail).toContain('<JourneyRail stage={r.lifecycle_stage} />')
  })

  it('colours the stage in global search too', () => {
    const search = readFileSync(new URL('../src/components/admin/GlobalSearch.tsx', import.meta.url), 'utf8')
    expect(search).toContain('<JourneyChip stage={r.lifecycle_stage} />')
  })
})
