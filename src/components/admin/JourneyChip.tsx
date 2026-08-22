import { JOURNEY_STAGES, journeyChipClass, journeyHint, journeyLabel, journeyRailClass, journeyStage } from '../../../shared/journeyColor'

// The client journey, wearing its colour.
//
// Colour is never the only signal here: the chip always carries the stage's
// label, and the rail is captioned. Someone who cannot see the difference
// between sea and coral, or who prints this in greyscale, loses nothing.

export function JourneyChip({ stage, className = '' }: { stage: string | null | undefined; className?: string }) {
  return (
    <span
      title={journeyHint(stage)}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide ${journeyChipClass(stage)} ${className}`}
    >
      {journeyLabel(stage)}
    </span>
  )
}

/**
 * How far along the relationship is, as four segments that fill and warm.
 * A lost lead fills nothing: it did not travel further than a converted one,
 * so showing it at the end of the rail would be a lie about what happened.
 */
export function JourneyRail({ stage }: { stage: string | null | undefined }) {
  const meta = journeyStage(stage)
  const steps = JOURNEY_STAGES.filter((s) => s.step !== null)

  return (
    <div>
      <div className="flex items-center gap-1" role="img" aria-label={`Journey: ${journeyLabel(stage)}. ${journeyHint(stage)}`}>
        {steps.map((s) => {
          const reached = meta.step !== null && s.step !== null && s.step <= meta.step
          return (
            <span
              key={s.key}
              className={`h-1.5 flex-1 rounded-full transition-colors ${reached ? journeyRailClass(s.key) : 'bg-white/[.08]'}`}
            />
          )
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        <span className="font-bold text-slate-200">{journeyLabel(stage)}.</span> {journeyHint(stage)}
      </p>
    </div>
  )
}
