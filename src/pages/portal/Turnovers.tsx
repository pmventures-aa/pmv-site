import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, DoorOpen, MapPin } from 'lucide-react'
import { api } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Card, EmptyState, PageHeader, StatusBadge } from '../../components/ui'
import { strPackageShortLabel, strPlatformLabel } from '../../../shared/strWorkspace'

interface TurnoverRow {
  id: string
  status: string
  client_status: string
  client_description: string
  package_label: string
  turnover_date: string
  checkout_at: string | null
  required_complete_at: string | null
  completed_at: string | null
  service_package_key: string
  source: string
  property_address: string
  property_nickname: string | null
  bedrooms: number | null
  bathrooms: string | null
  max_guests: number | null
  platform: string | null
  provider_name: string | null
}

const TONE: Record<string, 'gold' | 'green' | 'blue' | 'slate' | 'red'> = {
  scheduled: 'blue', offered: 'blue', accepted: 'blue',
  en_route: 'gold', in_progress: 'gold', verification_needed: 'gold',
  issue_reported: 'red', at_risk: 'red',
  guest_ready: 'green', completed: 'green', cancelled: 'slate',
}

function dateLabel(value: string | null): string {
  if (!value) return ''
  const d = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Turnovers() {
  const p = useAppPath()
  const [rows, setRows] = useState<TurnoverRow[] | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api.get<{ turnovers: TurnoverRow[] }>('/portal/str/turnovers')
      .then((r) => setRows(r.turnovers))
      .catch(() => setRows([]))
      .finally(() => setLoaded(true))
  }, [])

  const active = (rows ?? []).filter((t) => !['completed', 'cancelled'].includes(t.status))
  const past = (rows ?? []).filter((t) => ['completed', 'cancelled'].includes(t.status))

  return (
    <div>
      <PageHeader
        eyebrow="STR Turnover & Property Support"
        title="Turnovers"
        subtitle="Every scheduled turnover at your properties, with a guest-ready report when the work is done."
      />

      {!loaded ? (
        <Card><p className="text-sm text-slate-400">Loading turnovers…</p></Card>
      ) : rows && rows.length === 0 ? (
        <Card><EmptyState label="No turnovers yet. When Pinnacle schedules a turnover for one of your properties, it will appear here." /></Card>
      ) : (
        <div className="space-y-6">
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">Upcoming & in progress</p>
            <ul className="divide-y divide-white/[.08] rounded-md border border-white/[.08]">
              {active.map((t) => (
                <li key={t.id}>
                  <Link to={p(`str/turnovers/${t.id}`)} className="grid gap-2 px-4 py-3 hover:bg-white/[.03] sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{t.property_nickname || t.property_address}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><Calendar size={12} />{dateLabel(t.turnover_date)}</span>
                        {t.bedrooms != null && <span className="inline-flex items-center gap-1"><DoorOpen size={12} />{t.bedrooms} bed{t.bedrooms === 1 ? '' : 's'}</span>}
                        {t.platform ? <span className="inline-flex items-center gap-1"><MapPin size={12} />{strPlatformLabel(t.platform)}</span> : null}
                        <span>{t.package_label}</span>
                        {t.provider_name ? <span>· {t.provider_name}</span> : null}
                      </p>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{t.client_description}</p>
                    </div>
                    <span className="justify-self-start sm:justify-self-end"><StatusBadge tone={TONE[t.status] ?? 'slate'}>{t.client_status}</StatusBadge></span>
                  </Link>
                </li>
              ))}
              {active.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Nothing active right now.</li>}
            </ul>
          </section>

          {past.length > 0 && (
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">Completed & cancelled</p>
              <ul className="divide-y divide-white/[.08] rounded-md border border-white/[.08]">
                {past.map((t) => (
                  <li key={t.id}>
                    <Link to={p(`str/turnovers/${t.id}`)} className="grid gap-2 px-4 py-3 hover:bg-white/[.03] sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{t.property_nickname || t.property_address}</p>
                        <p className="mt-1 text-xs text-slate-500">{dateLabel(t.turnover_date)} · {t.package_label}</p>
                      </div>
                      <span className="justify-self-start sm:justify-self-end"><StatusBadge tone={TONE[t.status] ?? 'slate'}>{t.client_status}</StatusBadge></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="mt-6 rounded-md border border-gold/20 bg-gold/[.04] px-4 py-3">
        <p className="text-xs leading-6 text-slate-400">
          {strPackageShortLabel('guest_ready')} and {strPackageShortLabel('managed')} reports show the checklist, completion photos, and any flagged issues.
          Want coverage for another property? <Link to={p('support')} className="font-semibold text-gold hover:underline">Message your Pinnacle team</Link>.
        </p>
      </div>
    </div>
  )
}
