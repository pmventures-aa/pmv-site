import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'
import { useAppPath } from '../../lib/basePath'
import { displayValue, type IntakeValue } from '../../lib/intake'

interface CatalogItem {
  key: string
  name: string
  description: string
  category: string
  intake_intro?: string | null
  estimated_minutes?: number
}
interface Enrolled {
  service_key: string
  name: string
  status: string
}
interface ApplicationAnswer {
  question_key: string
  question_label: string
  step_label: string | null
  step_order: number
  sort_order: number
  value: IntakeValue
}
interface Application {
  id: string
  service_key: string
  service_name: string
  service_description: string | null
  status: string
  current_step: number
  submission_source: string
  submitted_at: string | null
  created_at: string
  updated_at: string
  answers: ApplicationAnswer[]
}

const STATUS_TONE: Record<string, 'gold' | 'green' | 'blue' | 'slate' | 'red'> = {
  draft: 'gold',
  requested: 'gold',
  submitted: 'blue',
  in_review: 'blue',
  approved: 'green',
  active: 'green',
  completed: 'green',
  closed: 'slate',
  declined: 'red',
}

const APPLICATION_LABEL: Record<string, string> = {
  draft: 'In progress',
  submitted: 'Application received',
  in_review: 'In review',
  approved: 'Approved',
  declined: 'Declined',
  closed: 'Closed',
}

const SERVICE_MODULE_LINKS: Record<string, { to: string; label: string }> = {
  funding: { to: 'funding', label: 'View your funding workspace →' },
  property_management: { to: 'property-management', label: 'View your properties →' },
}

export default function Services() {
  const p = useAppPath()
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [enrolled, setEnrolled] = useState<Enrolled[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [cat, mine, apps] = await Promise.all([
      api.get<{ services: CatalogItem[] }>('/portal/services-catalog'),
      api.get<{ services: Enrolled[] }>('/portal/services'),
      api.get<{ applications: Application[] }>('/portal/service-applications'),
    ])
    setCatalog(cat.services)
    setEnrolled(mine.services)
    setApplications(apps.applications)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const enrolledKeys = useMemo(() => new Set(enrolled.map((e) => e.service_key)), [enrolled])
  const draftsByService = useMemo(() => {
    const map = new Map<string, Application>()
    for (const app of applications) if (app.status === 'draft' && !map.has(app.service_key)) map.set(app.service_key, app)
    return map
  }, [applications])

  return (
    <div>
      <PageHeader eyebrow="Your services" title="My Services" subtitle="Pick up where you left off, review submitted applications, and manage active services." />

      {applications.length > 0 && (
        <Card className="mb-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Applications</h2>
              <p className="mt-1 text-sm text-slate-400">Your submitted answers stay visible here. Internal staff documents do not.</p>
            </div>
          </div>
          <div className="space-y-3">
            {applications.map((app) => (
              <div key={app.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{app.service_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {app.status === 'draft'
                        ? `Last saved ${new Date(app.updated_at).toLocaleString()}`
                        : `Submitted ${new Date(app.submitted_at || app.created_at).toLocaleString()}`}
                    </p>
                    {app.status === 'draft' && app.submission_source === 'staff_assigned' && (
                      <p className="mt-1 text-xs font-medium text-sky-300">Started by your Pinnacle team: review and sign to submit</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={STATUS_TONE[app.status] ?? 'slate'}>{APPLICATION_LABEL[app.status] ?? app.status.replace(/_/g, ' ')}</StatusBadge>
                    {app.status === 'draft' && (
                      <Link to={p(`services/${app.service_key}/apply`)} className="btn-outline !px-3 !py-1.5 text-xs">{app.submission_source === 'staff_assigned' ? 'Review & sign' : 'Resume'}</Link>
                    )}
                  </div>
                </div>

                {app.status !== 'draft' && app.answers.length > 0 && (
                  <details className="mt-3 rounded-lg border border-white/10 bg-navy-950/35 px-3 py-2.5">
                    <summary className="cursor-pointer select-none text-xs font-medium text-gold">Review submitted answers</summary>
                    <dl className="mt-3 space-y-2.5">
                      {app.answers.map((answer) => (
                        <div key={`${app.id}-${answer.question_key}`} className="grid gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-4">
                          <dt className="text-xs text-slate-500">{answer.question_label}</dt>
                          <dd className="whitespace-pre-wrap text-sm text-slate-200">{displayValue(answer.value).replace('|', ' · ')}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Active &amp; enrolled services</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : enrolled.length === 0 ? (
          <EmptyState label="No active services yet: start a journey below." />
        ) : (
          <ul className="space-y-3">
            {enrolled.map((e) => {
              const link = SERVICE_MODULE_LINKS[e.service_key]
              return (
                <li key={e.service_key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3">
                  <div>
                    <span className="block text-sm font-medium text-white">{e.name}</span>
                    {link && (
                      <Link to={p(link.to)} className="mt-1 inline-block text-xs text-gold hover:underline">{link.label}</Link>
                    )}
                  </div>
                  <StatusBadge tone={STATUS_TONE[e.status] ?? 'slate'}>{e.status.replace(/_/g, ' ')}</StatusBadge>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-white">Start a new journey</h2>
        <p className="mb-4 text-sm text-slate-400">Choose what you need help with. Your progress saves automatically if you need to come back later.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog
            .filter((c) => !enrolledKeys.has(c.key))
            .map((c) => {
              const draft = draftsByService.get(c.key)
              return (
                <div key={c.key} className="group flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:-translate-y-0.5 hover:border-gold/25 hover:bg-white/[0.045]">
                  <div>
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.description}</p>
                    {c.estimated_minutes && <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">About {c.estimated_minutes} min</p>}
                  </div>
                  <Link to={p(`services/${c.key}/apply`)} className="btn-outline shrink-0 !px-4 !py-1.5 text-xs">
                    {draft ? 'Resume' : 'Start'}
                  </Link>
                </div>
              )
            })}
          {!loading && catalog.length > 0 && catalog.every((c) => enrolledKeys.has(c.key)) && (
            <p className="text-sm text-slate-500">You're already enrolled in every available service.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
