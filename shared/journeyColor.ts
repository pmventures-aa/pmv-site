// The client journey, told in colour.
//
// Every stage of a relationship gets its own hue, and the hues warm as the
// relationship deepens: a cool, quiet slate for someone who has only just
// appeared, through sea and gold as they engage, to a warm coral when work is
// actually running, and a settled green when it is done. Glance at any list in
// HQ and the temperature of the row tells you how far along someone is before
// you have read a single word.
//
// Two reasons this is a module rather than colours chosen per screen:
//
//   1. The palette already existed and was never spent. tailwind.config.js
//      defines sea, coral, and sand with a comment saying they are there "so
//      the site gains warmth and variety without losing its brand" - and a
//      count across src put gold at 1500 uses, sea at 18, coral at 12, and
//      sand at 0. HQ reads as monochrome because one accent was doing all the
//      work, not because the brand lacks colour.
//
//   2. A journey told in colour only works if the same stage is the same
//      colour everywhere. One list using coral for "converted" and another
//      using green teaches the viewer nothing.
//
// Colour is never the only signal. Every surface that uses these also carries
// the stage's label, so the meaning survives colour blindness, greyscale
// printing, and a viewer who simply has not learned the scheme yet.

import { LIFECYCLE_STAGES, lifecycleLabel, type LifecycleStage } from './lifecycle'

/** Named accents from tailwind.config.js. */
export type JourneyHue = 'slate' | 'sea' | 'gold' | 'coral' | 'green' | 'rose'

export interface JourneyStageMeta {
  key: LifecycleStage
  label: string
  hue: JourneyHue
  /** Position along the journey, for progress rails. 'lost' sits outside it. */
  step: number | null
  /** What this stage means, in one plain line. */
  hint: string
}

// Warming left to right. 'lost' is deliberately off the scale rather than at
// the end of it: a lost lead did not travel further than a converted one.
export const JOURNEY_STAGES: JourneyStageMeta[] = [
  { key: 'lead', label: 'Lead', hue: 'slate', step: 1, hint: 'They have appeared. Nobody has spoken to them yet.' },
  { key: 'prospect', label: 'Prospect', hue: 'sea', step: 2, hint: 'A conversation is open.' },
  { key: 'opportunity', label: 'Application', hue: 'gold', step: 3, hint: 'They are applying for something specific.' },
  { key: 'converted', label: 'Converted', hue: 'green', step: 4, hint: 'They are a client. Work can run.' },
  { key: 'lost', label: 'Lost', hue: 'rose', step: null, hint: 'This one did not go ahead.' },
]

const BY_KEY = new Map(JOURNEY_STAGES.map((s) => [s.key, s]))

export const JOURNEY_LENGTH = JOURNEY_STAGES.filter((s) => s.step !== null).length

export function journeyStage(stage: string | null | undefined): JourneyStageMeta {
  return BY_KEY.get((stage || 'lead') as LifecycleStage) ?? BY_KEY.get('lead')!
}

export function journeyHue(stage: string | null | undefined): JourneyHue {
  return journeyStage(stage).hue
}

export function journeyLabel(stage: string | null | undefined): string {
  // Defers to lifecycleLabel so an unknown stage still renders readably
  // rather than silently becoming "Lead".
  return BY_KEY.has((stage || '') as LifecycleStage) ? journeyStage(stage).label : lifecycleLabel(stage)
}

export function journeyHint(stage: string | null | undefined): string {
  return journeyStage(stage).hint
}

/** 0 to 1 along the journey, or null for a stage that is off it. */
export function journeyProgress(stage: string | null | undefined): number | null {
  const step = journeyStage(stage).step
  return step === null ? null : step / JOURNEY_LENGTH
}

export function isJourneyStage(value: unknown): value is LifecycleStage {
  return typeof value === 'string' && BY_KEY.has(value as LifecycleStage)
}

// ---------------------------------------------------------------- classes
//
// Tailwind cannot see a class built at runtime, so every string below is
// written out whole. Splitting them into `bg-${hue}-400/10` would compile to
// nothing and silently render an unstyled chip.

const CHIP: Record<JourneyHue, string> = {
  slate: 'border-white/15 bg-white/[.05] text-slate-300',
  sea: 'border-sea-400/30 bg-sea-400/10 text-sea-300',
  gold: 'border-gold/30 bg-gold/10 text-gold',
  coral: 'border-coral-400/30 bg-coral-400/10 text-coral-300',
  green: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  rose: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
}

const RAIL: Record<JourneyHue, string> = {
  slate: 'bg-white/25',
  sea: 'bg-sea-400',
  gold: 'bg-gold',
  coral: 'bg-coral-400',
  green: 'bg-emerald-400',
  rose: 'bg-rose-400',
}

const DOT: Record<JourneyHue, string> = {
  slate: 'bg-slate-400',
  sea: 'bg-sea-400',
  gold: 'bg-gold',
  coral: 'bg-coral-400',
  green: 'bg-emerald-400',
  rose: 'bg-rose-400',
}

export function journeyChipClass(stage: string | null | undefined): string {
  return CHIP[journeyHue(stage)]
}

export function journeyRailClass(stage: string | null | undefined): string {
  return RAIL[journeyHue(stage)]
}

export function journeyDotClass(stage: string | null | undefined): string {
  return DOT[journeyHue(stage)]
}

/** Every class string the module can emit, for a build-time sanity check. */
export const ALL_JOURNEY_CLASSES: string[] = [
  ...Object.values(CHIP), ...Object.values(RAIL), ...Object.values(DOT),
]

export { LIFECYCLE_STAGES }
