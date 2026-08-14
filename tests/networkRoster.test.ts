import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  canDispatchPerson,
  groupNetworkPeople,
  matchesNetworkFilter,
  matchesNetworkQuery,
  networkDispatchHref,
  networkEmailHref,
  openLoad,
  sortNetworkPeople,
  uniqueFacets,
  type NetworkPerson,
} from '../src/lib/networkRoster'

function person(extra: Partial<NetworkPerson> = {}): NetworkPerson {
  return {
    id: extra.id || '1',
    email: extra.email || 'a@x.com',
    full_name: extra.full_name ?? 'Ada Notary',
    phone: extra.phone ?? '5615550100',
    status: extra.status || 'active',
    party_type: extra.party_type ?? 'vendor',
    vendor_category: extra.vendor_category ?? 'Mobile notary',
    role_name: extra.role_name ?? null,
    title: extra.title ?? null,
    network_status: extra.network_status ?? 'active',
    availability_status: extra.availability_status ?? 'available',
    is_preferred_provider: extra.is_preferred_provider ?? 0,
    service_area_summary: extra.service_area_summary ?? 'Palm Beach',
    last_seen_at: extra.last_seen_at ?? '2026-08-13 12:00:00',
    tasks_assigned: extra.tasks_assigned ?? 3,
    tasks_completed: extra.tasks_completed ?? 1,
    tasks_overdue: extra.tasks_overdue ?? 0,
    dispatch_open: extra.dispatch_open,
    application_documents: extra.application_documents ?? 2,
  }
}

describe('network roster matching', () => {
  it('searches name, specialty, area, and phone', () => {
    const ada = person()
    expect(matchesNetworkQuery(ada, 'palm')).toBe(true)
    expect(matchesNetworkQuery(ada, '561555')).toBe(true)
    expect(matchesNetworkQuery(ada, 'hvac')).toBe(false)
  })

  it('keeps available providers in the Snapdocs-style available filter', () => {
    expect(matchesNetworkFilter(person(), 'available')).toBe(true)
    expect(matchesNetworkFilter(person({ availability_status: 'unavailable' }), 'available')).toBe(false)
    expect(matchesNetworkFilter(person({ party_type: 'employee' }), 'providers')).toBe(false)
    expect(matchesNetworkFilter(person({ dispatch_open: 2 }), 'loaded')).toBe(true)
    expect(matchesNetworkFilter(person({ dispatch_open: 0, tasks_assigned: 1, tasks_completed: 1 }), 'loaded')).toBe(false)
  })

  it('sorts by open load and groups by specialty', () => {
    const rows = [
      person({ id: 'b', full_name: 'Bea', dispatch_open: 0, vendor_category: 'Inspector' }),
      person({ id: 'a', full_name: 'Ada', dispatch_open: 4, vendor_category: 'Mobile notary' }),
    ]
    expect(sortNetworkPeople(rows, 'load').map((r) => r.id)).toEqual(['a', 'b'])
    expect(uniqueFacets(rows, 'specialty')).toEqual(['Inspector', 'Mobile notary'])
    expect(groupNetworkPeople(rows, 'specialty').map((g) => g.label)).toEqual(['Inspector', 'Mobile notary'])
  })

  it('uses dispatch_open when present for load', () => {
    expect(openLoad(person({ dispatch_open: 5, tasks_assigned: 1, tasks_completed: 0 }))).toBe(5)
    expect(openLoad(person({ tasks_assigned: 4, tasks_completed: 1 }))).toBe(3)
  })

  it('allows active internal staff as dispatch providers', () => {
    expect(canDispatchPerson(person({ party_type: 'employee', status: 'active' }))).toBe(true)
    expect(canDispatchPerson(person({ status: 'suspended' }))).toBe(false)
  })
})

describe('network dispatch links', () => {
  const p = (path: string) => `/hq/${path}`
  it('opens compose and field dispatch for a provider', () => {
    expect(networkEmailHref(p, { email: 'ada@x.com', name: 'Ada' })).toBe(
      '/hq/messages?tab=email&compose=1&to=ada%40x.com&name=Ada',
    )
    expect(networkDispatchHref(p, 'v1')).toBe('/hq/field-work?dispatch=1&vendor=v1')
  })
})

describe('Network page search chrome', () => {
  const source = readFileSync(new URL('../src/pages/admin/ProviderNetworkAdmin.tsx', import.meta.url), 'utf8')

  it('keeps the search icon beside the field instead of overlapping placeholder text', () => {
    expect(source).toContain('Search name, specialty, area, or phone')
    expect(source).not.toContain('pl-9')
    expect(source).toContain('place-items-center rounded-md border')
  })
})
