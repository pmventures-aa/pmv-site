import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  OPENING_QUESTION,
  TIMING_QUESTION,
  acknowledgement,
  placePhrase,
  summarizeSoFar,
  timingPhrase,
} from '../shared/guidedIntake'

describe('the questions themselves', () => {
  it('opens with a plain question, not a form label', () => {
    expect(OPENING_QUESTION).toBe('How can we help?')
    expect(TIMING_QUESTION).toBe('And when are you looking for this back by?')
  })
})

describe('place', () => {
  it('reads as a clause, at whatever precision they have given', () => {
    expect(placePhrase({ city: 'Boca Raton', state: 'fl' })).toBe('in Boca Raton, FL')
    expect(placePhrase({ city: 'Boca Raton' })).toBe('in Boca Raton')
    expect(placePhrase({ state: 'FL' })).toBe('in FL')
  })

  it('says remote instead of inventing a place', () => {
    expect(placePhrase({ locationType: 'remote', city: 'Boca Raton' })).toBe('handled remotely')
  })

  // An empty slot in a sentence reads worse than no sentence.
  it('is absent when they have not said', () => {
    expect(placePhrase({})).toBeNull()
    expect(placePhrase({ city: '   ', state: '' })).toBeNull()
  })
})

describe('timing', () => {
  it('restates each picker option as a clause', () => {
    expect(timingPhrase({ timing: 'As soon as possible' })).toBe('as soon as possible')
    expect(timingPhrase({ timing: 'Within 2-3 business days' })).toBe('within 2-3 business days')
    expect(timingPhrase({ timing: 'I have a specific date' })).toBe('on a specific date')
    expect(timingPhrase({ timing: 'Flexible / planning ahead' })).toBe('on a flexible timeline')
  })

  it('degrades readably if the picker gains an option', () => {
    expect(timingPhrase({ timing: 'Next Quarter' })).toBe('next quarter')
    expect(timingPhrase({})).toBeNull()
  })
})

describe('the receipt', () => {
  it('joins only what they actually supplied', () => {
    expect(summarizeSoFar({
      workLabel: 'Get eyes on a property',
      city: 'Boca Raton',
      state: 'FL',
      timing: 'As soon as possible',
    })).toBe('Get eyes on a property, in Boca Raton, FL, as soon as possible')

    expect(summarizeSoFar({ workLabel: 'Moving data between systems' }))
      .toBe('Moving data between systems')
    expect(summarizeSoFar({})).toBeNull()
  })

  // The picker mixes imperatives with gerunds; inflecting either one into an
  // invented sentence frame produces broken English, so labels come back whole.
  it('quotes the work label verbatim rather than re-inflecting it', () => {
    expect(summarizeSoFar({ workLabel: 'Clean or make a property rent-ready' }))
      .toContain('Clean or make a property rent-ready')
    expect(summarizeSoFar({ workLabel: 'Switching a POS or payment provider' }))
      .toContain('Switching a POS or payment provider')
  })
})

describe('the between-screens line', () => {
  const answers = {
    workLabel: 'Get eyes on a property',
    city: 'Boca Raton',
    state: 'FL',
    timing: 'As soon as possible',
    firstName: 'Dana',
  }

  it('previews the next screen at the opening', () => {
    expect(acknowledgement('opening', {})).toContain('The next screen')
  })

  it('repeats the choice back and names what comes next', () => {
    const line = acknowledgement('details', { workLabel: 'Get eyes on a property' })
    expect(line).toContain('Get eyes on a property')
    expect(line).toContain('when you need it')
  })

  it('carries every prior answer into the last screen', () => {
    const line = acknowledgement('contact', answers)
    expect(line).toContain('Thanks, Dana.')
    expect(line).toContain('Get eyes on a property')
    expect(line).toContain('in Boca Raton, FL')
    expect(line).toContain('as soon as possible')
    expect(line).toContain('where should a real person reply')
  })

  it('confirms a workspace instead of asking for a reply address in the portal', () => {
    const line = acknowledgement('review', { workLabel: 'Property Management' })
    expect(line).toContain('Property Management')
    expect(line).toContain('your portal is set up around it')
    expect(line).not.toContain('reply')
  })

  it('uses a first name only when there is one', () => {
    expect(acknowledgement('contact', { workLabel: 'X' })).toContain('Thanks.')
    expect(acknowledgement('contact', { workLabel: 'X' })).not.toContain('Thanks,')
  })

  it('still reads as a sentence when they have told us nothing', () => {
    for (const beat of ['opening', 'details', 'contact', 'review'] as const) {
      const line = acknowledgement(beat, {})
      expect(line.length).toBeGreaterThan(0)
      expect(line).not.toContain('undefined')
      expect(line).not.toContain('null')
      expect(line).not.toMatch(/\s,|,\s*\./)
    }
  })
})

// The whole reason this lives in one module: an acknowledgement may only
// repeat what the person supplied. Echoing "as soon as possible" restates
// their need; promising it is a commitment the form cannot make.
describe('it never adds a fact the person did not give', () => {
  const everything = {
    workLabel: 'Get eyes on a property',
    city: 'Boca Raton',
    state: 'FL',
    timing: 'As soon as possible',
    firstName: 'Dana',
  }

  it('makes no promise about price, coverage, or turnaround', () => {
    const lines = (['opening', 'details', 'contact', 'review'] as const).map((beat) => acknowledgement(beat, everything))
    for (const line of lines) {
      expect(line).not.toMatch(/\$|guarantee|guaranteed|licensed|insured|vetted|bonded|background.checked/i)
      expect(line).not.toMatch(/\bwe will (be|arrive|get) there\b/i)
      expect(line).not.toMatch(/\b(today|tomorrow|same.day|within \d+ hours)\b/i)
    }
  })

  it('prints no place, and no timing, that was not supplied', () => {
    const line = acknowledgement('contact', { workLabel: 'Get eyes on a property' })
    expect(line).not.toMatch(/\bin [A-Z]/)
    expect(line).not.toMatch(/as soon as|this week|flexible/i)
  })
})

describe('both questionnaires use it', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

  it('drives the public intake, including the timing beat', () => {
    const wizard = read('src/components/public/ScopeWizard.tsx')
    expect(wizard).toContain("from '../../../shared/guidedIntake'")
    expect(wizard).toContain('{TIMING_QUESTION}')
    expect(wizard).toContain('OPENING_QUESTION:copy.pickerTitle')
    // The line is derived, not three hand-written strings.
    expect(wizard).not.toContain('A few quick details and you are almost done')
  })

  it('drives the portal onboarding too', () => {
    const wizard = read('src/pages/portal/OnboardingWizard.tsx')
    expect(wizard).toContain("from '../../../shared/guidedIntake'")
    expect(wizard).toContain('{guidedLine}')
  })
})
