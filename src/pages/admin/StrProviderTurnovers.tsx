import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, StatCard, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { useAppPath } from '../../lib/basePath'
import { money, strPackageShortLabel, turnoverStatusLabel, turnoverStatusTone } from '../../../shared/strWorkspace'

interface MineTurnover {
  id: string
  status: string
  turnover_date: string
  checkout_at: string | null
  required_complete_at: string | null
  property_address: string
  property_nickname: string | null
  access_instructions: string | null
  building_entry: string | null
  parking: string | null
  client_name: string | null
  service_package_key: string
  provider_payout_cents: number | null
  client_charge_cents: number | null
}

interface MineData {
  offers: MineTurnover[]
  today: MineTurnover[]
  upcoming: MineTurnover[]
  earnings_completed_cents: number
}

export default function StrProviderTurnovers() {
  const p = useAppPath()
  const [data, setData] = useState<MineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<MineData>('/admin/str/mine')
      setData(res)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load your turnovers.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function respond(id: string, decision: 'accept' | 'decline') {
    setBusyId(`${decision}-${id}`)
    try {
      await api.post(`/admin/str/turnovers/${id}/offer/${decision}`)
      toast.success(decision === 'accept' ? 'Offer accepted — you are assigned.' : 'Offer declined.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the offer.')
    } finally { setBusyId(null) }
  }

  if (loading && !data) return <Panel><p className="text-sm text-slate-400">Loading your turnovers…</p></Panel>

  const offers = data?.offers ?? []
  const today = data?.today ?? []
  const upcoming = data?.upcoming ?? []

  return (
    <div>
      <PageIntro
        kicker="STR Turnover & Property Support"
        title="My Turnovers"
        subtitle="Accept offers, manage today's work, and prepare for upcoming turnovers."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Earned (completed)" value={money(data?.earnings_completed_cents)} />
        <StatCard label="Today" value={today.length} />
        <StatCard label="Upcoming" value={upcoming.length} />
        <StatCard label="Offers" value={offers.length} />
      </div>

      {offers.length > 0 && (
        <Panel className="mb-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Offers awaiting your response</p>
          <ul className="space-y-2">
            {offers.map((t) => (
              <li key={t.id} className="rounded-lg border border-gold/25 bg-gold/[.05] p-3">
                <TurnoverCardHeader t={t} />
                <div className="mt-3 flex gap-2">
                  <button type="button" className={btnPrimary} disabled={busyId !== null} onClick={() => respond(t.id, 'accept')}>{busyId === `accept-${t.id}` ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Accept</button>
                  <button type="button" className={btnOutline} disabled={busyId !== null} onClick={() => respond(t.id, 'decline')}>{busyId === `decline-${t.id}` ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="mb-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Today</p>
        {today.length === 0 ? <EmptyState label="Nothing scheduled for today." /> : (
          <ul className="divide-y divide-white/[.07]">
            {today.map((t) => (
              <li key={t.id}>
                <Link to={p(`str/turnovers/${t.id}`)} className="flex flex-col gap-2 px-1 py-3 hover:bg-white/[.02] sm:flex-row sm:items-center sm:justify-between">
                  <TurnoverCardHeader t={t} />
                  <span className="flex items-center gap-2 sm:shrink-0">
                    <Tag tone={turnoverStatusTone(t.status)}>{turnoverStatusLabel(t.status)}</Tag>
                    <span className="text-xs font-semibold text-gold">{money(t.provider_payout_cents)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Upcoming</p>
        {upcoming.length === 0 ? <EmptyState label="No upcoming turnovers." /> : (
          <ul className="divide-y divide-white/[.07]">
            {upcoming.map((t) => (
              <li key={t.id}>
                <Link to={p(`str/turnovers/${t.id}`)} className="flex flex-col gap-2 px-1 py-3 hover:bg-white/[.02] sm:flex-row sm:items-center sm:justify-between">
                  <TurnoverCardHeader t={t} />
                  <Tag tone={turnoverStatusTone(t.status)}>{turnoverStatusLabel(t.status)}</Tag>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function TurnoverCardHeader({ t }: { t: MineTurnover }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-white">{t.property_nickname || t.property_address}</p>
      <p className="mt-0.5 text-xs text-slate-500">
        {t.turnover_date}{t.checkout_at ? ` · checkout ${t.checkout_at.slice(11, 16)}` : ''}{t.required_complete_at ? ` · ready by ${t.required_complete_at.slice(11, 16)}` : ''} · {strPackageShortLabel(t.service_package_key)}
      </p>
    </div>
  )
}
