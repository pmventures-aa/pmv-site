export interface Quote {
  text: string
  author: string
  tone: 'funny' | 'professional'
}

// A mix of genuine, correctly-attributed quotes and a few lighter,
// unattributed lines — never invented words put in a real person's mouth.
// Shown one per day on the portal dashboard (see QuoteOfTheDay.tsx).
export const quotes: Quote[] = [
  { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney', tone: 'professional' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt', tone: 'professional' },
  { text: "It's not the load that breaks you down, it's the way you carry it.", author: 'Lou Holtz', tone: 'professional' },
  { text: 'Quality means doing it right when no one is looking.', author: 'Henry Ford', tone: 'professional' },
  { text: 'The best way to predict the future is to create it.', author: 'Peter Drucker', tone: 'professional' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier', tone: 'professional' },
  { text: 'Opportunities don’t happen. You create them.', author: 'Chris Grosser', tone: 'professional' },
  { text: 'Efficiency is doing things right; effectiveness is doing the right things.', author: 'Peter Drucker', tone: 'professional' },
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin', tone: 'professional' },
  { text: 'A goal without a plan is just a wish.', author: 'Antoine de Saint-Exupéry', tone: 'professional' },
  { text: 'Small daily improvements are the key to staggering long-term results.', author: 'Anonymous', tone: 'professional' },
  { text: 'Progress, not perfection.', author: 'Anonymous', tone: 'professional' },

  { text: 'I used to think I was indecisive, but now I’m not so sure.', author: 'Anonymous', tone: 'funny' },
  { text: 'My favorite productivity hack is a deadline I’m mildly afraid of.', author: 'Anonymous', tone: 'funny' },
  { text: 'Behind every successful business is a spreadsheet nobody wants to open.', author: 'Anonymous', tone: 'funny' },
  { text: 'Coffee: because adulting requires backup.', author: 'Anonymous', tone: 'funny' },
  { text: 'I put the “pro” in procrastinate, and the “no” in “not today.”', author: 'Anonymous', tone: 'funny' },
  { text: 'A clean inbox is basically a myth, like unicorns or free parking.', author: 'Anonymous', tone: 'funny' },
  { text: 'Some days you’re the pigeon, some days you’re the statue. Log in anyway.', author: 'Anonymous', tone: 'funny' },
  { text: 'Nothing says “adult” like getting excited about a good invoice template.', author: 'Anonymous', tone: 'funny' },
  { text: 'Teamwork makes the dream work — and also makes it someone else’s turn.', author: 'Anonymous', tone: 'funny' },
  { text: 'My New Year’s resolution: reply to emails within the same fiscal quarter.', author: 'Anonymous', tone: 'funny' },
  { text: 'Business casual: the ancient art of looking prepared for a meeting you forgot about.', author: 'Anonymous', tone: 'funny' },
  { text: 'They say time is money. Mine is currently invested in this browser tab.', author: 'Anonymous', tone: 'funny' },
]

// Deterministic "quote of the day" — same quote all day, changes at
// midnight local time, no server round-trip needed.
export function quoteOfTheDay(date: Date = new Date()): Quote {
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000)
  return quotes[dayOfYear % quotes.length]
}
