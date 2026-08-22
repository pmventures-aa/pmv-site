// The work itself, told in colour.
//
// shared/journeyColor.ts colours a CLIENT's journey. This colours the day's
// journey: the six hubs in the HQ sidebar, in the order work actually moves
// through them. Money arrives, someone is served, the work gets delivered,
// people do it, the numbers explain it, and administration holds it all up.
//
// The hues run warm to cool along that path. Revenue is the warmest because it
// is where a relationship starts; Administration is the coolest because it is
// the quiet floor underneath. Standing anywhere in HQ, the temperature of the
// page says which half of the business you are in.
//
// Same rule as the client journey: colour is never the only signal. Every hub
// keeps its name and its icon, so nothing here is load-bearing on hue alone.

export type SectionHue = 'coral' | 'gold' | 'sea' | 'green' | 'violet' | 'slate'

export interface SectionMeta {
  hue: SectionHue
  /** Why this hub sits where it does on the warm-to-cool run. */
  note: string
}

// Keyed by the `section` strings in src/components/layout/nav.ts. A hub that is
// renamed there without being renamed here simply falls back to slate rather
// than breaking, which is the right failure for decoration.
const SECTIONS: Record<string, SectionMeta> = {
  Revenue: { hue: 'coral', note: 'Warmest: where a relationship, and the money, starts.' },
  Service: { hue: 'gold', note: 'The client-facing surface, in the brand accent.' },
  Delivery: { hue: 'sea', note: 'The work getting done. Fresh, in motion.' },
  People: { hue: 'green', note: 'Everyone in the system, staff and providers.' },
  Intelligence: { hue: 'violet', note: 'Reporting and automation: a step back from the work.' },
  Administration: { hue: 'slate', note: 'Coolest: the quiet floor everything stands on.' },
}

export const SECTION_ORDER = ['Revenue', 'Service', 'Delivery', 'People', 'Intelligence', 'Administration'] as const

export function sectionHue(section: string | null | undefined): SectionHue {
  return SECTIONS[section ?? '']?.hue ?? 'slate'
}

export function sectionNote(section: string | null | undefined): string {
  return SECTIONS[section ?? '']?.note ?? ''
}

export function isKnownSection(section: string | null | undefined): boolean {
  return Boolean(section && section in SECTIONS)
}

// Written out whole. A class Tailwind cannot find in source compiles to
// nothing, and an interpolated one is invisible to its scanner.

const TEXT: Record<SectionHue, string> = {
  coral: 'text-coral-300',
  gold: 'text-gold/85',
  sea: 'text-sea-300',
  green: 'text-emerald-300',
  violet: 'text-violet-300',
  slate: 'text-slate-400',
}

const RAIL: Record<SectionHue, string> = {
  coral: 'bg-coral-400/60',
  gold: 'bg-gold/60',
  sea: 'bg-sea-400/60',
  green: 'bg-emerald-400/60',
  violet: 'bg-violet-400/60',
  slate: 'bg-white/20',
}

const GLOW: Record<SectionHue, string> = {
  coral: 'border-coral-400/25 bg-coral-400/[.05]',
  gold: 'border-gold/25 bg-gold/[.05]',
  sea: 'border-sea-400/25 bg-sea-400/[.05]',
  green: 'border-emerald-400/25 bg-emerald-400/[.05]',
  violet: 'border-violet-400/25 bg-violet-400/[.05]',
  slate: 'border-white/12 bg-white/[.03]',
}

export function sectionTextClass(section: string | null | undefined): string {
  return TEXT[sectionHue(section)]
}

export function sectionRailClass(section: string | null | undefined): string {
  return RAIL[sectionHue(section)]
}

export function sectionGlowClass(section: string | null | undefined): string {
  return GLOW[sectionHue(section)]
}

export const ALL_SECTION_CLASSES: string[] = [
  ...Object.values(TEXT), ...Object.values(RAIL), ...Object.values(GLOW),
]
