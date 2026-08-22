import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The intake used to ask everything about the work on ONE screen: the location
// toggle, the address block, every catalog question, the timing grid, and a
// notes box, stacked. That is the screen that made the form feel long. It is
// now one question per screen, and which screens exist depends on the answers.

const wizard = readFileSync(new URL('../src/components/public/ScopeWizard.tsx', import.meta.url), 'utf8')

describe('one screen asks one thing', () => {
  it('has a screen per question rather than a single details step', () => {
    for (const key of ['work', 'place', 'specifics', 'timing', 'details', 'contact']) {
      expect(wizard).toContain(`currentKey==='${key}'`)
    }
    expect(wizard).not.toContain('showDetailsStep')
  })

  it('asks the timing question in its own words, on its own screen', () => {
    expect(wizard).toContain("{currentKey==='timing' && <div>")
    expect(wizard).toContain('{TIMING_QUESTION}')
  })
})

// A flow that shows an empty screen is worse than a long one.
describe('the flow shortens itself', () => {
  it('builds the step list from the answers instead of fixed indices', () => {
    expect(wizard).toContain('const stepKeys = useMemo')
    expect(wizard).toContain("if (showLocationToggle || showAddress) keys.push('place')")
    expect(wizard).toContain("if (activeQuestions.length) keys.push('specifics')")
  })

  it('drops the hard-coded three-step total', () => {
    expect(wizard).not.toContain('const totalSteps = 3')
    expect(wizard).toContain('const displayTotal = stepKeys.length')
  })

  it('names every screen for the progress rail', () => {
    expect(wizard).toContain('const STEP_NAMES: Record<StepKey,string>')
    expect(wizard).toContain('const stepNames = stepKeys.map((key)=>STEP_NAMES[key])')
  })
})

describe('validation follows the screen, not an index', () => {
  it('checks only what the current screen asked', () => {
    expect(wizard).toContain('function validate(key:StepKey)')
    expect(wizard).toContain("if(key==='timing'&&!form.timing)")
    expect(wizard).toContain("if(key==='place'&&form.location_type==='onsite'")
  })

  it('cannot walk past the last screen', () => {
    expect(wizard).toContain('Math.min(stepKeys.length-1,value+1)')
  })
})

// A locked entry has no picker screen, so starting at index 1 skipped the
// first real question entirely.
describe('an entry-locked flow starts on its first real question', () => {
  it('starts at zero when an entry locked the job', () => {
    expect(wizard).toContain('((initialJob&&!entry)?1:0)')
  })

  it('keeps the this-request banner on every locked screen', () => {
    expect(wizard).toContain('{locked && entry && <div')
  })

  it('still offers a way back to the picker from the first screen', () => {
    expect(wizard).toContain('setLocked(false);setStep(0)')
  })
})

describe('the card takes less room', () => {
  it('narrows now that no screen holds two question blocks at once', () => {
    expect(wizard).toContain("max-w-3xl")
    expect(wizard).not.toContain("max-w-5xl")
  })
})
