import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Check, CircleAlert, MapPin, UserRound } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Card, EmptyState, PageHeader, StatusBadge } from '../../components/ui'
import { toast } from '../../components/kit/toast'
import {
  CHECKLIST_CATEGORIES, issueStatusLabel, supplyStockLabel, supplyStockTone,
  type ChecklistCategory,
} from '../../../shared/strWorkspace'

interface PortalTurnover {
  turnover: {
    id: string
    status: string
    client_status: string
    client_description: string
    tone: 'gold' | 'green' | 'blue' | 'slate' | 'red'
    turnover_date: string
    checkout_at: string | null
    required_complete_at: string | null
    completed_at: string | null
    package_label: string
    package_badge: string | null
    source: string
    property: { id: string; nickname: string | null; address: string; city: string | null; state: string | null; bedrooms: number | null; bathrooms: string | null; max_guests: number | null; platform: string | null }
    provider_name: string
  }
  checklist: { id: string; category: string; label: string; required: boolean; status: string; not_applicable_reason: string | null }[]
  checklist_summary: { required: number; completed: number; not_applicable: number }
  photos: { id: string; label: string | null; file_name: string | null; size_bytes: number | null; captured_at: string | null; url: string }[]
  issues: { id: string; issue_type: string; issue_type_label: string; severity: string; severity_label: string; client_summary: string | null; status: string; affects_guest_readiness: boolean; requires_client_action: boolean; created_at: string | null }[]
  supplies: { name: string; flag: string }[]
  needs_client_action: boolean
}

function fmt(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function toneForIssue(severity: string): 'gold' | 'green' | 'blue' | 'slate' | 'red' {
  if (severity === 'high' || severity === 'critical') return 'red'
  if (severity === 'medium') return 'gold'
  return 'slate'
}

export default function TurnoverReport() {
  const { id } = useParams<{ id: string }>()
  const p = useAppPath()
  const [data, setData] = useState<PortalTurnover | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<PortalTurnover>(`/portal/str/turnovers/${id}`)
      setData(res)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load this turnover.')
      setData(null)
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function respond(issueId: string, decision: 'approved' | 'declined') {
    setBusy(issueId)
    try {
      await api.post(`/portal/str/issues/${issueId}/respond`, { decision })
      toast.success(decision === 'approved' ? 'Additional work approved.' : 'Request declined.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record your decision.')
    } finally { setBusy(null) }
  }

  if (loading) return <Card><p className="text-sm text-slate-400">Loading turnover…</p></Card>
  if (!data) return <Card><EmptyState label="This turnover could not be found." /></Card>

  const t = data.turnover
  const completedPct = t.status === 'guest_ready' || t.status === 'completed'
    ? 100
    : data.checklist_summary.required > 0
      ? Math.round(((data.checklist_summary.completed + data.checklist_summary.not_applicable) / data.checklist_summary.required) * 100)
      : 0
  const pendingDecisions = data.issues.filter((i) => i.requires_client_action)

  return (
    <div>
      <Link to={p('str/turnovers')} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-gold">
        <ArrowLeft size={14} /> All turnovers
      </Link>
      <PageHeader
        eyebrow={`Turnover · ${t.package_label}${t.package_badge ? ` · ${t.package_badge}` : ''}`}
        title={t.property.nickname || t.property.address}
        subtitle={[t.property.address, [t.property.city, t.property.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
        action={<StatusBadge tone={t.tone}>{t.client_status}</StatusBadge>}
      />

      {data.needs_client_action && (
        <div className="mb-4 rounded-md border border-gold/25 bg-gold/[.06] px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><CircleAlert size={15} className="text-gold" /> Your decision is needed on additional work</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">A request below is waiting for your approval. Nothing is charged until you approve it.</p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <div className="mt-3 flex items-center gap-4">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[.08]">
                <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${completedPct}%` }} />
              </div>
              <span className="text-xs font-semibold tabular-nums text-slate-300">{completedPct}%</span>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{t.client_description}</p>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3 border-b border-white/[.06] py-1.5"><dt className="text-slate-500">Turnover date</dt><dd className="text-slate-200">{t.turnover_date}</dd></div>
              <div className="flex justify-between gap-3 border-b border-white/[.06] py-1.5"><dt className="text-slate-500">Checkout</dt><dd className="text-slate-200">{fmt(t.checkout_at)}</dd></div>
              <div className="flex justify-between gap-3 border-b border-white/[.06] py-1.5"><dt className="text-slate-500">Ready by</dt><dd className="text-slate-200">{fmt(t.required_complete_at)}</dd></div>
              <div className="flex justify-between gap-3 border-b border-white/[.06] py-1.5"><dt className="text-slate-500">Completed</dt><dd className="text-slate-200">{fmt(t.completed_at)}</dd></div>
            </dl>
          </Card>

          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property</p>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2 text-slate-300"><MapPin size={13} className="text-slate-500" />{t.property.address}</div>
              <div className="flex items-center gap-2 text-slate-300"><UserRound size={13} className="text-slate-500" />{t.provider_name}</div>
              <div className="text-slate-300">{t.property.bedrooms != null ? `${t.property.bedrooms} bed${t.property.bedrooms === 1 ? '' : 's'}` : '–'} · {t.property.bathrooms || '–'} bath{t.property.bathrooms === '1' ? '' : 's'} · up to {t.property.max_guests ?? '–'} guests</div>
              <div className="text-slate-300">{t.property.platform || 'Direct'}</div>
            </dl>
          </Card>

          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist</p>
            {data.checklist.length === 0 ? (
              <div className="mt-3"><EmptyState label="No checklist items were set up for this turnover." /></div>
            ) : (
              <div className="mt-3 space-y-4">
                {CHECKLIST_CATEGORIES.filter((c: ChecklistCategory) => data.checklist.some((i) => i.category === c)).map((cat) => {
                  const items = data.checklist.filter((i) => i.category === cat)
                  return (
                    <div key={cat}>
                      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{cat}</p>
                      <ul className="mt-1.5 divide-y divide-white/[.06]">
                        {items.map((i) => (
                          <li key={i.id} className="flex items-start justify-between gap-3 py-1.5">
                            <span className="text-sm text-slate-200">
                              {i.status === 'complete' && <Check size={14} className="mr-1.5 inline text-emerald-400" />}
                              {i.status === 'not_applicable' && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-slate-500" />}
                              {i.label}
                              {i.required && <span className="ml-1.5 text-[10px] font-semibold uppercase text-slate-600">required</span>}
                              {i.status === 'not_applicable' && i.not_applicable_reason && <span className="block text-xs text-slate-500">– {i.not_applicable_reason}</span>}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">
                              {i.status === 'complete' ? 'Done' : i.status === 'not_applicable' ? 'N/A' : 'Pending'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {data.photos.length > 0 && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completion photos</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {data.photos.map((photo) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-md border border-white/[.08] bg-white/[.02]">
                    <img src={photo.url} alt={photo.label || 'Turnover photo'} loading="lazy" className="h-28 w-full object-cover" />
                    <span className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-slate-400 group-hover:text-gold"><Camera size={11} />{photo.label || 'Photo'}</span>
                  </a>
                ))}
              </div>
            </Card>
          )}

          {data.issues.length > 0 && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issues & additional work</p>
              <ul className="mt-3 space-y-3">
                {data.issues.map((issue) => (
                  <li key={issue.id} className="rounded-md border border-white/[.08] bg-white/[.02] px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={toneForIssue(issue.severity)}>{issue.issue_type_label}</StatusBadge>
                      <span className="text-xs text-slate-500">{issue.severity_label} · {issueStatusLabel(issue.status)}</span>
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-slate-300">{issue.client_summary || 'A condition was flagged during this turnover.'}</p>
                    {issue.requires_client_action && issue.status === 'open' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={() => respond(issue.id, 'approved')} disabled={busy === issue.id} className="btn-gold disabled:opacity-60">{busy === issue.id ? 'Saving…' : 'Approve'}</button>
                        <button onClick={() => respond(issue.id, 'declined')} disabled={busy === issue.id} className="btn-outline disabled:opacity-60">{busy === issue.id ? 'Saving…' : 'Decline'}</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {pendingDecisions.length > 0 && (
                <p className="mt-3 text-xs leading-5 text-slate-500">Approving adds the agreed amount to your next turnover invoice. Declining means the work will not be billed. Tell your Pinnacle contact if the issue itself still needs attention.</p>
              )}
            </Card>
          )}

          {data.supplies.length > 0 && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplies checked during this turnover</p>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {data.supplies.map((s, idx) => (
                  <li key={`${s.name}-${idx}`} className="flex items-center justify-between gap-3">
                    <span className="text-slate-200">{s.name}</span>
                    <StatusBadge tone={supplyStockTone(s.flag)}>{supplyStockLabel(s.flag)}</StatusBadge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-3">
          <Card className="!p-0">
            <div className="border-b border-white/10 px-3 py-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your Pinnacle contact</p></div>
            <div className="p-3 text-sm text-slate-200">{t.provider_name}</div>
          </Card>
          <Card className="!p-0">
            <div className="border-b border-white/10 px-3 py-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing</p></div>
            <div className="space-y-1 p-3 text-sm text-slate-300">
              <p>{t.package_label}{t.source === 'reservation' ? ' · reservation' : ''}</p>
              <p className="text-xs text-slate-500">Invoices for turnovers appear in Billing.</p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}
