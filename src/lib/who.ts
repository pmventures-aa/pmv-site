export type WhoPerson = {
  name?: string | null
  email?: string | null
  userId?: string | null
  role?: string | null
  href?: string | null
}

export type WhoRow = {
  label: string
  people?: WhoPerson[]
  text?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function whoDisplayName(person: WhoPerson): string {
  return (person.name || person.email || 'Unknown').trim() || 'Unknown'
}

export function whoAddress(person: WhoPerson): string {
  const email = (person.email || '').trim()
  const name = (person.name || '').trim()
  if (name && email) return `${name} <${email}>`
  return name || email || 'Unknown'
}

export function uniqueWhoPeople(people: WhoPerson[]): WhoPerson[] {
  const out: WhoPerson[] = []

  function keysOf(person: WhoPerson): string[] {
    const email = (person.email || '').trim().toLowerCase()
    const userId = (person.userId || '').trim()
    const keys = []
    if (userId) keys.push(`id:${userId}`)
    if (email) keys.push(`email:${email}`)
    if (!keys.length) keys.push(`name:${whoDisplayName(person).toLowerCase()}`)
    return keys
  }

  for (const person of people) {
    const keys = keysOf(person)
    const existing = out.find((p) => keysOf(p).some((k) => keys.includes(k)))
    if (existing) {
      if (!existing.name && person.name) existing.name = person.name
      if (!existing.email && person.email) existing.email = person.email
      if (!existing.userId && person.userId) existing.userId = person.userId
      if (!existing.role && person.role) existing.role = person.role
      if (!existing.href && person.href) existing.href = person.href
      continue
    }
    out.push({ ...person })
  }
  return out
}

export function parseWhoAddresses(raw: unknown): WhoPerson[] {
  if (!raw) return []
  let list: unknown[] = []
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) list = parsed
      else list = trimmed.split(/[,;]/)
    } catch {
      list = trimmed.split(/[,;]/)
    }
  } else if (Array.isArray(raw)) {
    list = raw
  } else {
    return []
  }

  const out: WhoPerson[] = []
  for (const item of list) {
    if (typeof item === 'object' && item && 'email' in item) {
      const rec = item as { email?: unknown; name?: unknown }
      const email = String(rec.email || '').trim()
      if (!EMAIL_RE.test(email)) continue
      const name = String(rec.name || '').trim()
      out.push({ email, name: name || null })
      continue
    }
    const s = String(item || '').trim()
    if (!s) continue
    const m = s.match(/^(.*)\s*<\s*([^>]+)\s*>\s*$/)
    const email = (m ? m[2] : s).trim()
    const name = m ? m[1].trim().replace(/^"|"$/g, '') : ''
    if (!EMAIL_RE.test(email)) continue
    out.push({ email, name: name || null })
  }
  return uniqueWhoPeople(out)
}

export function visibleWhoRows(rows: WhoRow[]): WhoRow[] {
  return rows
    .map((row) => ({
      ...row,
      people: row.people ? uniqueWhoPeople(row.people.filter((p) => p.name || p.email || p.userId)) : undefined,
      text: row.text?.trim() || null,
    }))
    .filter((row) => (row.people && row.people.length > 0) || !!row.text)
}
