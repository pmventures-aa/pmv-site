export interface Quote {
  text: string
  author: string
  theme: 'kindness' | 'business' | 'service' | 'progress' | 'perspective'
}

// Short, encouraging lines for the front door of every signed-in experience.
// "Pinnacle reminder" entries are original house copy so we never put invented
// words in a real person's mouth. The list intentionally mixes business focus,
// kindness, service, perspective, and steady progress.
export const quotes: Quote[] = [
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin', theme: 'business' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt', theme: 'progress' },
  { text: 'Quality means doing it right when no one is looking.', author: 'Henry Ford', theme: 'business' },
  { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney', theme: 'progress' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', author: 'Robert Collier', theme: 'progress' },
  { text: 'Alone we can do so little; together we can do so much.', author: 'Helen Keller', theme: 'service' },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James', theme: 'perspective' },
  { text: 'No act of kindness, no matter how small, is ever wasted.', author: 'Aesop', theme: 'kindness' },
  { text: 'Great things are done by a series of small things brought together.', author: 'Vincent van Gogh', theme: 'progress' },
  { text: 'Nothing will work unless you do.', author: 'Maya Angelou', theme: 'business' },
  { text: 'Try to be a rainbow in someone’s cloud.', author: 'Maya Angelou', theme: 'kindness' },
  { text: 'Kindness and good work are both remembered long after the transaction.', author: 'Pinnacle reminder', theme: 'kindness' },
  { text: 'Make the next step clear, useful, and easy for the person on the other side.', author: 'Pinnacle reminder', theme: 'service' },
  { text: 'A calm process is a competitive advantage.', author: 'Pinnacle reminder', theme: 'business' },
  { text: 'Good service is simply making someone’s day a little easier.', author: 'Pinnacle reminder', theme: 'service' },
  { text: 'Progress does not have to be loud to be meaningful.', author: 'Pinnacle reminder', theme: 'progress' },
  { text: 'Take care of the details, but never lose sight of the person.', author: 'Pinnacle reminder', theme: 'service' },
  { text: 'A thoughtful response can change the entire tone of someone’s day.', author: 'Pinnacle reminder', theme: 'kindness' },
  { text: 'Build trust in the small moments. The big moments follow.', author: 'Pinnacle reminder', theme: 'business' },
  { text: 'Leave the work, the client, and the team better than you found them.', author: 'Pinnacle reminder', theme: 'service' },
  { text: 'The best systems create more room for good judgment and human connection.', author: 'Pinnacle reminder', theme: 'business' },
  { text: 'When the path feels complicated, make the next right step simple.', author: 'Pinnacle reminder', theme: 'perspective' },
  { text: 'Consistency builds confidence.', author: 'Pinnacle reminder', theme: 'business' },
  { text: 'A little patience and a little kindness can solve more than urgency ever will.', author: 'Pinnacle reminder', theme: 'kindness' },
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

// Kept for compatibility with any older surface that still wants a true
// calendar-day quote. New dashboard welcomes use quoteFromSeed() with a
// per-login session nonce instead.
export function quoteOfTheDay(date: Date = new Date()): Quote {
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000)
  return quotes[dayOfYear % quotes.length]
}
