export type NetworkPerson = {
  id: string
  email: string
  full_name: string | null
  phone?: string | null
  status: string
  party_type: string | null
  vendor_category: string | null
  role_name?: string | null
  title: string | null
  network_status?: string | null
  availability_status?: string | null
  is_preferred_provider?: number
  service_area_summary?: string | null
  last_seen_at?: string | null
  tasks_assigned: number
  tasks_completed: number
  tasks_overdue: number
  dispatch_open?: number
  application_documents?: number
}

export type NetworkFilter = 'all' | 'providers' | 'internal' | 'active' | 'vetting' | 'available' | 'preferred' | 'loaded'
export type NetworkSort = 'name' | 'load' | 'seen' | 'completed' | 'preferred'
export type NetworkView = 'roster' | 'specialty' | 'coverage'

export const NETWORK_FILTERS: { id: NetworkFilter; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'providers', label: 'Providers' },
  { id: 'available', label: 'Available now' },
  { id: 'preferred', label: 'Preferred' },
  { id: 'vetting', label: 'In vetting' },
  { id: 'loaded', label: 'On a job' },
  { id: 'active', label: 'Active' },
  { id: 'internal', label: 'Internal' },
]

export function isProvider(person: NetworkPerson): boolean {
  return person.party_type === 'vendor'
}

export function openLoad(person: NetworkPerson): number {
  if (typeof person.dispatch_open === 'number') return Math.max(0, person.dispatch_open)
  return Math.max(0, Number(person.tasks_assigned || 0) - Number(person.tasks_completed || 0))
}

export function specialtyOf(person: NetworkPerson): string {
  return (person.vendor_category || person.role_name || person.title || '').trim() || 'Unspecified'
}

export function coverageOf(person: NetworkPerson): string {
  return (person.service_area_summary || '').trim() || 'Area not set'
}

export function matchesNetworkQuery(person: NetworkPerson, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const hay = [
    person.full_name,
    person.email,
    person.phone,
    person.vendor_category,
    person.role_name,
    person.title,
    person.service_area_summary,
    person.network_status,
    person.availability_status,
  ].join(' ').toLowerCase()
  return hay.includes(needle)
}

export function matchesNetworkFilter(person: NetworkPerson, filter: NetworkFilter): boolean {
  const provider = isProvider(person)
  if (filter === 'all') return true
  if (filter === 'internal') return !provider
  if (filter === 'providers') return provider
  if (!provider) return false
  if (filter === 'active') return person.network_status === 'active'
  if (filter === 'vetting') return person.network_status === 'vetting' || person.status === 'pending'
  if (filter === 'available') return person.availability_status === 'available' && person.network_status === 'active'
  if (filter === 'preferred') return !!person.is_preferred_provider
  if (filter === 'loaded') return openLoad(person) > 0
  return true
}

export function sortNetworkPeople(rows: NetworkPerson[], sort: NetworkSort): NetworkPerson[] {
  const copy = [...rows]
  copy.sort((a, b) => {
    if (sort === 'load') return openLoad(b) - openLoad(a) || nameKey(a).localeCompare(nameKey(b))
    if (sort === 'completed') return Number(b.tasks_completed || 0) - Number(a.tasks_completed || 0) || nameKey(a).localeCompare(nameKey(b))
    if (sort === 'preferred') return Number(b.is_preferred_provider || 0) - Number(a.is_preferred_provider || 0) || nameKey(a).localeCompare(nameKey(b))
    if (sort === 'seen') return seenMs(b) - seenMs(a) || nameKey(a).localeCompare(nameKey(b))
    return nameKey(a).localeCompare(nameKey(b))
  })
  return copy
}

export function uniqueFacets(rows: NetworkPerson[], kind: 'specialty' | 'coverage'): string[] {
  const set = new Set<string>()
  for (const row of rows) {
    const value = kind === 'specialty' ? specialtyOf(row) : coverageOf(row)
    if (value && value !== 'Unspecified' && value !== 'Area not set') set.add(value)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function groupNetworkPeople(rows: NetworkPerson[], by: 'specialty' | 'coverage'): { label: string; rows: NetworkPerson[] }[] {
  const map = new Map<string, NetworkPerson[]>()
  for (const row of rows) {
    const label = by === 'specialty' ? specialtyOf(row) : coverageOf(row)
    const list = map.get(label) || []
    list.push(row)
    map.set(label, list)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, group]) => ({ label, rows: group }))
}

export function networkEmailHref(
  p: (path: string) => string,
  person: { email?: string | null; name?: string | null },
): string {
  const q = new URLSearchParams({ tab: 'email', compose: '1' })
  if (person.email) q.set('to', person.email)
  if (person.name) q.set('name', person.name)
  return `${p('messages')}?${q.toString()}`
}

export function networkDispatchHref(p: (path: string) => string, vendorId: string): string {
  return `${p('field-work')}?dispatch=1&vendor=${encodeURIComponent(vendorId)}`
}

function nameKey(person: NetworkPerson): string {
  return (person.full_name || person.email || '').toLowerCase()
}

function seenMs(person: NetworkPerson): number {
  if (!person.last_seen_at) return 0
  const raw = person.last_seen_at.includes('T') ? person.last_seen_at : `${person.last_seen_at.replace(' ', 'T')}Z`
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? 0 : ms
}
