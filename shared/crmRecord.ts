export function crmPersonName(record: { first_name?: string | null; last_name?: string | null }): string {
  return [record.first_name, record.last_name].map((part) => String(part || '').trim()).filter(Boolean).join(' ')
}

/** Name used on invitations and greetings: the person when we have one. */
export function crmInviteName(record: {
  record_type?: string | null
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  company_name?: string | null
}): string {
  const person = crmPersonName(record)
  if (record.record_type === 'business') return person || record.company_name || record.name || ''
  return person || record.name || record.company_name || ''
}

/** Secondary line for lists, cards, and search: contact stays visible on a business. */
export function crmRecordLine(record: {
  record_type?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  job_title?: string | null
  email?: string | null
}): string {
  const person = crmPersonName(record)
  if (record.record_type === 'business') {
    const contact = [record.job_title, person].filter(Boolean).join(' · ')
    return [contact || 'Business', record.email].filter(Boolean).join(' · ')
  }
  const org = record.job_title && record.company_name
    ? `${record.job_title} at ${record.company_name}`
    : record.company_name || record.job_title || 'Person'
  return [org, record.email].filter(Boolean).join(' · ')
}

export function parseContactName(value: unknown): { first_name?: string; last_name?: string } {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return {}
  const [first, ...rest] = raw.split(/\s+/)
  return { first_name: first, ...(rest.length ? { last_name: rest.join(' ') } : {}) }
}
