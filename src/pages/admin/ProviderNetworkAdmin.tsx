import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BriefcaseBusiness, LayoutGrid, LocateFixed, MailPlus, MapPinned, Search, ShieldCheck, Star, UserRoundCheck } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnOutline, type Tone } from '../../components/admin/ui'
import { Avatar } from '../../components/kit/Avatar'
import { PresenceDot } from '../../components/kit/PresenceDot'
import { toast } from '../../components/kit/toast'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { usePresence } from '../../lib/presence'
import {
  NETWORK_FILTERS,
  canDispatchPerson,
  coverageOf,
  groupNetworkPeople,
  isProvider,
  matchesNetworkFilter,
  matchesNetworkQuery,
  networkDispatchHref,
  networkEmailHref,
  openLoad,
  sortNetworkPeople,
  specialtyOf,
  uniqueFacets,
  type NetworkFilter,
  type NetworkPerson,
  type NetworkSort,
  type NetworkView,
} from '../../lib/networkRoster'
import { FieldLiveMap, type FieldMapPin } from '../../components/admin/FieldLiveMap'
import { DispatchFeeSettingsPanel } from '../../components/admin/DispatchFeeSettingsPanel'
import { useAuth } from '../../lib/auth'
import { locationAgeLabel, locationFreshness } from '../../../shared/operations'
import { useGeolocationPermission } from '../../lib/useGeolocationPermission'
import { useLiveLocationShare } from '../../lib/useLiveLocationShare'

type NetworkMapPerson = {
  user_id: string
  full_name: string | null
  email: string
  party_type: string | null
  vendor_category: string | null
  title: string | null
  assignment_id: string | null
  assignment_title: string | null
  assignment_status: string | null
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  source: string | null
  sharing_active: number | null
  updated_at: string | null
  last_seen_at: string | null
}

function statusTone(status?: string | null): Tone {
  if (status === 'active' || status === 'available') return 'green'
  if (status === 'vetting' || status === 'limited' || status === 'pending') return 'gold'
  if (status === 'inactive' || status === 'unavailable' || status === 'paused') return 'red'
  return 'blue'
}

export default function ProviderNetworkAdmin() {
  const { user } = useAuth()
  const p = useAppPath()
  const [rows, setRows] = useState<NetworkPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<NetworkFilter>('all')
  const [specialty, setSpecialty] = useState('')
  const [coverage, setCoverage] = useState('')
  const [sort, setSort] = useState<NetworkSort>('name')
  const [view, setView] = useState<NetworkView>('roster')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [mapPeople, setMapPeople] = useState<NetworkMapPerson[]>([])
  const [viewerUserId, setViewerUserId] = useState('')
  const geoPerm = useGeolocationPermission()
  const autoStartedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, map] = await Promise.all([
        api.get<{ employees: NetworkPerson[] }>('/admin/employees'),
        api.get<{ people: NetworkMapPerson[]; viewer_user_id: string }>('/admin/network-map'),
      ])
      setRows(r.employees || [])
      setMapPeople(map.people || [])
      setViewerUserId(map.viewer_user_id || '')
      setError('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The provider network could not load.')
    } finally {
      setLoading(false)
    }
  }, [])

  const { sharing, start: startLocationSharing, stop: stopLocationSharing } = useLiveLocationShare({ onChanged: load })

  useEffect(() => { void load() }, [load])
  useLiveRefresh(load)

  const specialties = useMemo(() => uniqueFacets(rows, 'specialty'), [rows])
  const areas = useMemo(() => uniqueFacets(rows, 'coverage'), [rows])

  const filtered = useMemo(() => {
    const next = rows.filter((row) => {
      if (!matchesNetworkQuery(row, query)) return false
      if (!matchesNetworkFilter(row, filter)) return false
      if (specialty && specialtyOf(row) !== specialty) return false
      if (coverage && coverageOf(row) !== coverage) return false
      return true
    })
    return sortNetworkPeople(next, sort)
  }, [rows, query, filter, specialty, coverage, sort])

  const presence = usePresence(filtered.map((row) => row.id), 'admin')
  const providers = rows.filter(isProvider)
  const groups = view === 'roster' ? null : groupNetworkPeople(filtered, view === 'specialty' ? 'specialty' : 'coverage')
  const meId = viewerUserId || user?.id || ''
  const visibleIds = useMemo(() => {
    const s = new Set(filtered.map((row) => row.id))
    if (meId) s.add(meId) // never let team/filter chips exclude the viewer's own marker
    return s
  }, [filtered, meId])
  const mapPins = useMemo<FieldMapPin[]>(() => mapPeople.flatMap((person) => {
    if (!visibleIds.has(person.user_id) || person.lat == null || person.lng == null) return []
    const freshness = locationFreshness(person.updated_at, person.sharing_active)
    const isMe = person.user_id === meId
    return [{
      id: `network-${person.user_id}`,
      kind: isMe ? 'me' : person.party_type === 'vendor' ? 'vendor' : 'staff',
      label: `${person.full_name || person.email}${isMe ? ' (me)' : ''}`,
      sublabel: `${freshness === 'live' ? 'Live' : locationAgeLabel(person.updated_at)}${person.assignment_title ? ` · ${person.assignment_title}` : ''}`,
      lat: person.lat,
      lng: person.lng,
      href: person.assignment_id ? `field-work/${person.assignment_id}` : `network/${person.user_id}/profile`,
      stale: freshness !== 'live',
      lastSeenAt: person.updated_at,
      sharingActive: person.sharing_active == null ? null : Boolean(person.sharing_active),
    }]
  }), [mapPeople, user?.id, viewerUserId, visibleIds])
  const noLocationCount = useMemo(
    () => filtered.filter((row) => !mapPeople.some((person) => person.user_id === row.id && person.lat != null && person.lng != null)).length,
    [filtered, mapPeople],
  )

  // Auto-start silently when the browser already remembers this device has
  // granted permission. Never re-prompts, never spins up a watch if the
  // caller already has one running. Runs once per mount.
  useEffect(() => {
    if (autoStartedRef.current) return
    if (geoPerm.permission !== 'granted') return
    if (sharing !== 'idle') return
    autoStartedRef.current = true
    startLocationSharing()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoPerm.permission])

  async function patchRow(row: NetworkPerson, patch: Partial<Pick<NetworkPerson, 'availability_status' | 'is_preferred_provider'>>) {
    setBusyId(row.id)
    try {
      await api.patch(`/admin/employees/${row.id}/network`, {
        ...(row.network_status ? { network_status: row.network_status } : {}),
        availability_status: patch.availability_status ?? row.availability_status ?? 'available',
        is_preferred_provider: patch.is_preferred_provider ?? !!row.is_preferred_provider,
        service_area_summary: row.service_area_summary || '',
      })
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...patch } : item))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not update this contact.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageIntro
        kicker="Professional network operations"
        title="Network & Dispatch"
        subtitle="Find the right notary, field pro, or internal contact by specialty, coverage, availability, and current load, then dispatch or email without leaving HQ."
        action={
          <div className="flex flex-wrap gap-2">
            {sharing === 'live' ? (
              <button type="button" onClick={() => void stopLocationSharing()} className={btnOutline}><LocateFixed size={14} /> Stop my live location</button>
            ) : (
              <button type="button" disabled={sharing === 'starting'} onClick={startLocationSharing} className={`${btnOutline} disabled:opacity-50`}><LocateFixed size={14} /> {sharing === 'starting' ? 'Locating me…' : 'Share my live location'}</button>
            )}
            <Link to={p('field-work')} className={btnOutline}><MapPinned size={14} /> Dispatch board</Link>
            <Link to={p('invitations')} className="btn-gold"><MailPlus size={15} /> Invite provider</Link>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={BriefcaseBusiness} label="Network providers" value={providers.length} />
        <Metric icon={UserRoundCheck} label="Available now" value={providers.filter((r) => r.availability_status === 'available' && r.network_status === 'active').length} />
        <Metric icon={ShieldCheck} label="In vetting" value={providers.filter((r) => r.network_status === 'vetting' || r.status === 'pending').length} />
        <Metric icon={MapPinned} label="Open dispatch" value={providers.reduce((n, r) => n + openLoad(r), 0)} />
      </div>

      <DispatchFeeSettingsPanel className="mb-4" />

      {((geoPerm.permission === 'prompt' && !geoPerm.ctaHidden) || geoPerm.permission === 'revoked') && sharing !== 'live' && (
        <div className="mb-3 flex flex-col gap-3 rounded-lg border border-gold/25 bg-gold/[.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            {geoPerm.permission === 'revoked' ? (
              <>
                <p className="text-sm font-bold text-white">Location access was turned off</p>
                <p className="mt-1 text-xs text-slate-300">This device previously granted location. It has since been revoked in browser or OS settings, so HQ can no longer see you or match nearby assignments. Re-allow to resume.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-white">Enable location for Field & Dispatch</p>
                <p className="mt-1 text-xs text-slate-300">Pinnacle uses your location to show you correctly on dispatch maps, improve nearby assignment matching, and support field check-in. We ask once and reuse your choice after.</p>
              </>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => { geoPerm.request(); startLocationSharing() }} className={btnOutline}><LocateFixed size={14} /> {geoPerm.permission === 'revoked' ? 'Re-enable location' : 'Allow location'}</button>
            {geoPerm.permission === 'prompt' && <button type="button" onClick={geoPerm.hideCta} className="rounded-md px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white">Not now</button>}
          </div>
        </div>
      )}
      {geoPerm.permission === 'denied' && sharing !== 'live' && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[.02] p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">Location is off. Your marker will not appear until this device grants location permission for HQ.</p>
          <a href="https://support.google.com/chrome/answer/142065" target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-gold hover:underline">Enable in browser settings</a>
        </div>
      )}

      <FieldLiveMap
        pins={mapPins}
        className="mb-2"
        title="Team live and last-known map"
        emptyLabel="No one has shared a location yet. Use Share my live location here, or have an agent or provider open an active assignment to establish their last-known pin."
      />
      <p className="mb-4 text-[11px] text-slate-500">
        Live means a location was actively shared within five minutes. Older pins are labeled last active. {noLocationCount} visible contact{noLocationCount === 1 ? '' : 's'} have no saved location.
      </p>

      <Panel className="mb-4 !p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 text-slate-500" aria-hidden="true">
            <Search size={14} />
          </span>
          <input
            className={`${inputCls} min-w-0 flex-1`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, specialty, area, or phone"
            aria-label="Search the network"
          />
          <select className={`${inputCls} w-auto max-w-[160px] shrink-0`} value={sort} onChange={(e) => setSort(e.target.value as NetworkSort)} aria-label="Sort roster">
            <option value="name">Sort: name</option>
            <option value="load">Sort: open load</option>
            <option value="preferred">Sort: preferred</option>
            <option value="seen">Sort: last seen</option>
            <option value="completed">Sort: completed</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {NETWORK_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${filter === item.id ? 'border-gold/35 bg-gold/[.07] text-gold' : 'border-white/10 text-slate-400 hover:text-white'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {(specialties.length > 0 || areas.length > 0) && (
          <div className="mt-3 flex flex-col gap-2 lg:flex-row">
            {specialties.length > 0 && (
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Specialty</span>
                <select className={inputCls} value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                  <option value="">All specialties</option>
                  {specialties.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            )}
            {areas.length > 0 && (
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Coverage</span>
                <select className={inputCls} value={coverage} onChange={(e) => setCoverage(e.target.value)}>
                  <option value="">All coverage areas</option>
                  {areas.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{loading ? 'Loading network…' : `${filtered.length} of ${rows.length} contact${rows.length === 1 ? '' : 's'}`}</p>
          <div className="flex gap-1 rounded-md border border-white/10 p-0.5">
            {([
              ['roster', 'Roster'],
              ['specialty', 'By specialty'],
              ['coverage', 'By coverage'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold ${view === id ? 'bg-white/[.08] text-white' : 'text-slate-500 hover:text-white'}`}
              >
                {id === 'roster' ? <LayoutGrid size={12} /> : null}
                {label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-rose-400/20 bg-rose-400/[.04] p-4 text-sm text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="btn-outline">Retry</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading network…</p>
      ) : filtered.length === 0 ? (
        <Panel><EmptyState label={rows.length === 0 ? 'No professional contacts yet. Invite a provider to start the roster.' : 'No matching professional contacts.'} /></Panel>
      ) : view === 'roster' ? (
        <RosterTable rows={filtered} presence={presence} p={p} busyId={busyId} onPatch={patchRow} />
      ) : (
        <div className="space-y-4">
          {groups?.map((group) => (
            <Panel key={group.label} className="!p-0">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">{group.label}</p>
                  <p className="text-[11px] text-slate-500">{group.rows.length} contact{group.rows.length === 1 ? '' : 's'} · {group.rows.filter((r) => r.availability_status === 'available').length} available</p>
                </div>
              </div>
              <RosterTable rows={group.rows} presence={presence} p={p} busyId={busyId} onPatch={patchRow} nested />
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}

function RosterTable({
  rows, presence, p, busyId, onPatch, nested = false,
}: {
  rows: NetworkPerson[]
  presence: ReturnType<typeof usePresence>
  p: (path: string) => string
  busyId: string | null
  onPatch: (row: NetworkPerson, patch: Partial<Pick<NetworkPerson, 'availability_status' | 'is_preferred_provider'>>) => void
  nested?: boolean
}) {
  return (
    <>
      <div className={`divide-y divide-white/5 xl:hidden ${nested ? '' : 'overflow-hidden rounded-lg border border-white/10'}`}>
        {rows.map((row) => (
          <article key={row.id} className="bg-navy-900/40 p-4">
            <PersonHead row={row} presence={presence[row.id]} p={p} />
            <PersonMeta row={row} />
            <PersonActions row={row} p={p} busy={busyId === row.id} onPatch={onPatch} />
          </article>
        ))}
      </div>
      <div className={`hidden overflow-x-auto xl:block ${nested ? '' : 'rounded-lg border border-white/10'}`}>
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-[.14em] text-slate-500">
              <th className="px-5 py-3 font-medium">Contact</th>
              <th className="px-5 py-3 font-medium">Specialty</th>
              <th className="px-5 py-3 font-medium">Coverage</th>
              <th className="px-5 py-3 font-medium">Availability</th>
              <th className="px-5 py-3 font-medium">Load</th>
              <th className="px-5 py-3 font-medium">Dispatch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="px-5 py-3"><PersonHead row={row} presence={presence[row.id]} p={p} compact /></td>
                <td className="px-5 py-3 text-slate-300">{specialtyOf(row)}</td>
                <td className="px-5 py-3 text-slate-400">{coverageOf(row)}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone={statusTone(isProvider(row) ? row.network_status : 'active')}>{isProvider(row) ? (row.network_status || 'active') : 'Internal'}</Tag>
                    {!!row.is_preferred_provider && <Star size={12} className="fill-gold text-gold" />}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <p className="tabular-nums text-slate-200">{openLoad(row)} open</p>
                  <p className="text-[11px] text-slate-500">{row.tasks_completed} done{row.tasks_overdue > 0 ? ` · ${row.tasks_overdue} overdue` : ''}{row.application_documents ? ` · ${row.application_documents} docs` : ''}</p>
                </td>
                <td className="px-5 py-3"><PersonActions row={row} p={p} busy={busyId === row.id} onPatch={onPatch} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PersonHead({ row, presence, p, compact = false }: { row: NetworkPerson; presence?: ReturnType<typeof usePresence>[string]; p: (path: string) => string; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar userId={row.id} name={row.full_name || row.email} size={compact ? 32 : 40} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <PresenceDot entry={presence} size={7} />
          <Link to={p(`network/${row.id}/profile`)} className="truncate font-semibold text-white hover:text-gold">
            {row.full_name || row.email}
          </Link>
        </div>
        <p className="truncate text-xs text-slate-500">{row.email}{row.phone ? ` · ${row.phone}` : ''}</p>
      </div>
    </div>
  )
}

function PersonMeta({ row }: { row: NetworkPerson }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Tag>{specialtyOf(row)}</Tag>
      <Tag>{coverageOf(row)}</Tag>
      <Tag tone={statusTone(isProvider(row) ? row.network_status : 'active')}>{isProvider(row) ? (row.network_status || 'active') : 'Internal'}</Tag>
      <Tag tone={statusTone(row.availability_status)}>{row.availability_status || 'availability not set'}</Tag>
      {!!row.is_preferred_provider && <Tag tone="gold">Preferred</Tag>}
      <Tag>{openLoad(row)} open</Tag>
      {row.tasks_overdue > 0 && <Tag tone="red">{row.tasks_overdue} overdue</Tag>}
    </div>
  )
}

function PersonActions({
  row, p, busy, onPatch,
}: {
  row: NetworkPerson
  p: (path: string) => string
  busy: boolean
  onPatch: (row: NetworkPerson, patch: Partial<Pick<NetworkPerson, 'availability_status' | 'is_preferred_provider'>>) => void
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 xl:mt-0">
      {canDispatchPerson(row) && (
        <Link to={networkDispatchHref(p, row.id)} className="text-xs font-semibold text-gold hover:underline">Dispatch</Link>
      )}
      <Link to={networkEmailHref(p, { email: row.email, name: row.full_name })} className="text-xs font-semibold text-slate-400 hover:text-gold hover:underline">Email</Link>
      <Link to={p(`network/${row.id}/profile`)} className="text-xs font-semibold text-slate-400 hover:text-gold hover:underline">Profile</Link>
      {isProvider(row) && (
        <>
          <select
            className={`${inputCls} w-auto max-w-[140px] py-1 text-xs`}
            disabled={busy}
            value={row.availability_status || 'available'}
            onChange={(e) => onPatch(row, { availability_status: e.target.value })}
            aria-label={`Availability for ${row.full_name || row.email}`}
          >
            <option value="available">Available</option>
            <option value="limited">Limited</option>
            <option value="unavailable">Unavailable</option>
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => onPatch(row, { is_preferred_provider: row.is_preferred_provider ? 0 : 1 })}
            className="text-xs font-semibold text-slate-400 hover:text-gold"
          >
            {row.is_preferred_provider ? 'Unstar' : 'Prefer'}
          </button>
        </>
      )}
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof BriefcaseBusiness; label: string; value: number }) {
  return (
    <Panel className="!p-4">
      <Icon size={16} className="text-gold" />
      <p className="mt-3 text-2xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </Panel>
  )
}
