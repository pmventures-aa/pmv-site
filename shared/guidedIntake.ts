// Conversational scaffolding for the intake questionnaires.
//
// The forms already had steps and a progress bar. What they lacked was the
// thing that makes a form feel like a conversation: a line between screens
// that repeats back what the person just said, in their words, before asking
// the next question.
//
//   "How can we help?"
//   -> "Thanks. Get eyes on a property, in Boca Raton, FL."
//   -> "And when are you looking for this back by?"
//
// One rule governs everything here, and it is the reason this is a module
// rather than a handful of template literals: an acknowledgement may only
// REPEAT what the person supplied. It never adds a fact they did not give -
// no price, no date, no coverage area, no availability, and no promise that
// the timing they asked for is a timing we will meet. Echoing "as soon as
// possible" is restating their need; saying we will be there is a commitment
// the form has no standing to make. Every phrase below is built from an input
// value or omitted entirely.

export const OPENING_QUESTION = 'How can we help?'
export const TIMING_QUESTION = 'And when are you looking for this back by?'

export interface IntakeAnswers {
  /** The option they picked, in the exact words the picker showed them. */
  workLabel?: string | null
  city?: string | null
  state?: string | null
  locationType?: 'onsite' | 'remote' | null
  timing?: string | null
  /** Their name, when a step has already collected it. */
  firstName?: string | null
}

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Where the work happens, as a phrase that can be dropped into a sentence.
 * Returns null when they have not said yet, so callers can leave it out
 * instead of printing an empty slot.
 */
export function placePhrase(answers: IntakeAnswers): string | null {
  if (answers.locationType === 'remote') return 'handled remotely'
  const city = clean(answers.city)
  const state = clean(answers.state).toUpperCase().slice(0, 2)
  if (city && state) return `in ${city}, ${state}`
  if (city) return `in ${city}`
  if (state) return `in ${state}`
  return null
}

// The picker's timing options, restated as a clause that reads inside a
// sentence. Anything unrecognized falls through to a plain lowercase of what
// they chose, so a new option added to the picker degrades to something
// readable rather than disappearing.
const TIMING_PHRASES: Record<string, string> = {
  'As soon as possible': 'as soon as possible',
  'Within 2-3 business days': 'within 2-3 business days',
  'This week': 'this week',
  'I have a specific date': 'on a specific date',
  'Flexible / planning ahead': 'on a flexible timeline',
}

export function timingPhrase(answers: IntakeAnswers): string | null {
  const timing = clean(answers.timing)
  if (!timing) return null
  return TIMING_PHRASES[timing] ?? timing.toLowerCase()
}

/**
 * The receipt: what they have told us so far, as one readable clause.
 *
 * The work label is reproduced verbatim rather than grammatically inflected.
 * The picker mixes imperative labels ("Get eyes on a property") with gerunds
 * ("Moving data between systems"), and no amount of lowercasing makes both
 * read correctly inside an invented sentence frame. Quoting them back as-is
 * is both more honest and better prose.
 */
export function summarizeSoFar(answers: IntakeAnswers): string | null {
  const parts = [clean(answers.workLabel), placePhrase(answers), timingPhrase(answers)]
    .filter((part): part is string => Boolean(part))
  return parts.length ? parts.join(', ') : null
}

export type IntakeBeat = 'opening' | 'details' | 'contact' | 'review'

/**
 * The line shown above the current step. Each one closes the previous
 * question and opens the next, so the form reads forward instead of feeling
 * like three unrelated screens.
 */
export function acknowledgement(beat: IntakeBeat, answers: IntakeAnswers): string {
  const name = clean(answers.firstName)
  const thanks = name ? `Thanks, ${name}.` : 'Thanks.'

  if (beat === 'opening') {
    return 'Pick what fits. The next screen only asks what that kind of work needs.'
  }

  if (beat === 'details') {
    const work = clean(answers.workLabel)
    // Their answer, then the question this screen is really asking.
    return work
      ? `${thanks} ${work}. A few details specific to that, and then we will ask when you need it.`
      : `${thanks} A few details, and then we will ask when you need it.`
  }

  const summary = summarizeSoFar(answers)

  // The portal's onboarding ends by confirming a workspace, not by collecting
  // a reply address - the person is already signed in.
  if (beat === 'review') {
    return summary
      ? `${thanks} ${summary}. Confirm this and your portal is set up around it.`
      : `${thanks} Confirm this and your portal is set up around it.`
  }

  return summary
    ? `${thanks} ${summary}. Last thing: where should a real person reply?`
    : `${thanks} Last thing: where should a real person reply?`
}
