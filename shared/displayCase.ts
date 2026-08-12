const PRESERVE = new Set([
  'ACH', 'API', 'DBA', 'EIN', 'HQ', 'ID', 'LLC', 'LLP', 'LP', 'PMV', 'POS', 'REO', 'RON', 'SLA', 'SMS', 'SSN', 'URL', 'W-9',
])

function titleWord(word: string): string {
  if (!word) return word
  const upper = word.toUpperCase()
  if (PRESERVE.has(upper)) return upper
  return word
    .split(/([-'])/)
    .map((part) => part === '-' || part === "'" ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

/** Normalizes names and short record titles without changing emails or free-form notes. */
export function toDisplayCase(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').split(' ').map(titleWord).join(' ')
}

export function humanizeLabel(value: unknown): string {
  if (typeof value !== 'string') return ''
  return toDisplayCase(value.replace(/[_-]+/g, ' '))
}
