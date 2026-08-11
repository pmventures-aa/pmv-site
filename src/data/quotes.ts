export interface Quote {
  text: string
  author: string
  theme: 'kindness' | 'business' | 'service' | 'progress' | 'perspective'
  prompt?: string
}

// Pinnacle Briefings intentionally avoid a live quote API. A third-party feed
// would add latency, availability risk, questionable attribution, and copy that
// has little relationship to the work. This library mixes original operating
// principles with a small set of short public-domain lines that have enduring
// relevance to service, judgment, and execution.
export const quotes: Quote[] = [
  { text: 'Make the next step obvious enough that nobody has to chase it.', author: 'Pinnacle Field Note', theme: 'service', prompt: 'What can you make easier to act on today?' },
  { text: 'The handoff is part of the work. Own it until the next person can actually move.', author: 'Pinnacle Operating Principle', theme: 'business', prompt: 'Which handoff needs a cleaner owner?' },
  { text: 'A client should never need an org chart to figure out who is responsible.', author: 'Pinnacle Service Standard', theme: 'service', prompt: 'Where can one accountable voice replace three?' },
  { text: 'Speed matters. Clarity keeps speed from becoming rework.', author: 'Pinnacle Project Rule', theme: 'progress', prompt: 'What deserves five minutes of clarification before action?' },
  { text: 'Do not hide a blocker in a status update. Surface it while there is still time to solve it.', author: 'Pinnacle Field Note', theme: 'business', prompt: 'What needs to be raised earlier?' },
  { text: 'A good system should reduce anxiety, not simply record activity.', author: 'Pinnacle Builder Note', theme: 'perspective', prompt: 'Which workflow can feel calmer for the person using it?' },
  { text: 'Document the decision, the owner, and the next move. The rest is commentary.', author: 'Pinnacle Operating Principle', theme: 'business', prompt: 'What decision is currently living only in someone’s head?' },
  { text: 'The best follow-up is specific enough to make a reply easy.', author: 'Pinnacle Service Standard', theme: 'service', prompt: 'Can your next message be answered in one sentence?' },
  { text: 'Treat every unresolved item like borrowed attention. Return it quickly.', author: 'Pinnacle Field Note', theme: 'progress', prompt: 'What open loop can you close before it gets expensive?' },
  { text: 'Professional does not have to mean cold. Clear, prepared, and human is stronger.', author: 'Pinnacle Service Standard', theme: 'kindness', prompt: 'Where can you add warmth without adding noise?' },
  { text: 'When the work crosses teams, coordination becomes a deliverable.', author: 'Pinnacle Operating Principle', theme: 'business', prompt: 'Which cross-team dependency needs active ownership?' },
  { text: 'If the client has to ask what happens next, the process is not finished yet.', author: 'Pinnacle Service Standard', theme: 'service', prompt: 'What next step should be visible before you close the conversation?' },
  { text: 'Protect focus by deciding what not to do today.', author: 'Pinnacle Field Note', theme: 'perspective', prompt: 'Which low-value task can wait?' },
  { text: 'Good operations are quiet: the right information appears before someone needs to ask for it.', author: 'Pinnacle Builder Note', theme: 'business', prompt: 'What information can you surface earlier?' },
  { text: 'The most useful update answers three questions: what changed, what it means, and what happens next.', author: 'Pinnacle Project Rule', theme: 'service', prompt: 'Does your next update answer all three?' },
  { text: 'Escalation is not failure. Late escalation is.', author: 'Pinnacle Project Rule', theme: 'progress', prompt: 'What deserves attention before it becomes urgent?' },
  { text: 'Trust compounds when small commitments are kept without reminders.', author: 'Pinnacle Service Standard', theme: 'business', prompt: 'Which small promise can you close today?' },
  { text: 'Leave every record useful to the next person who opens it.', author: 'Pinnacle Operating Principle', theme: 'service', prompt: 'Would a teammate understand the story without calling you?' },
  { text: 'Do not confuse motion with progress. Move the constraint.', author: 'Pinnacle Field Note', theme: 'progress', prompt: 'What is actually preventing the outcome?' },
  { text: 'A thoughtful no is better service than an unowned maybe.', author: 'Pinnacle Service Standard', theme: 'kindness', prompt: 'Where would a clear answer create relief?' },
  { text: 'Before adding another tool, fix the handoff between the tools you already have.', author: 'Pinnacle Builder Note', theme: 'business', prompt: 'Which system boundary creates duplicate work?' },
  { text: 'Measure what helps someone decide, not what is easiest to count.', author: 'Pinnacle Management Note', theme: 'perspective', prompt: 'Which metric should lead to an action?' },
  { text: 'The client experience is the sum of what happens between milestones.', author: 'Pinnacle Service Standard', theme: 'service', prompt: 'What happens in the quiet middle of this engagement?' },
  { text: 'A clean close matters as much as a strong start.', author: 'Pinnacle Project Rule', theme: 'progress', prompt: 'What should be confirmed, delivered, or archived before this is done?' },
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin', theme: 'business', prompt: 'What can move from discussion to finished today?' },
  { text: 'Nothing great was ever achieved without enthusiasm.', author: 'Ralph Waldo Emerson', theme: 'progress', prompt: 'Where would more energy change the quality of the work?' },
  { text: 'Waste no more time arguing what a good person should be. Be one.', author: 'Marcus Aurelius', theme: 'perspective', prompt: 'What does the right action look like without another meeting?' },
  { text: 'No act of kindness, no matter how small, is ever wasted.', author: 'Aesop', theme: 'kindness', prompt: 'Whose day can you make easier with a small action?' },
  { text: 'It is not that we have a short time to live, but that we waste much of it.', author: 'Seneca', theme: 'perspective', prompt: 'What deserves your best hour today?' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain', theme: 'progress', prompt: 'What is the smallest useful first move?' },
  { text: 'What you do speaks so loudly that I cannot hear what you say.', author: 'Ralph Waldo Emerson', theme: 'service', prompt: 'Which action will demonstrate the standard better than another promise?' },
  { text: 'Lost time is never found again.', author: 'Benjamin Franklin', theme: 'progress', prompt: 'Which delay can you remove now?' },
]

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function quoteFromSeed(seed: string): Quote {
  return quotes[hashSeed(seed) % quotes.length]
}

export function quoteOfTheDay(date: Date = new Date()): Quote {
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000)
  return quotes[dayOfYear % quotes.length]
}
