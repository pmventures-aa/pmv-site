import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'

interface CatalogItem {
  key: string
  name: string
  description: string
  category: string
}
interface Enrolled {
  service_key: string
  name: string
  status: string
}

const STATUS_TONE: Record<string, 'gold' | 'green' | 'blue' | 'slate' | 'red'> = {
  requested: 'gold',
  submitted: 'blue',
  active: 'green',
  completed: 'green',
  declined: 'red',
}

// Enrolled services that have their own dedicated workspace elsewhere in the portal.
const SERVICE_MODULE_LINKS: Record<string, { to: string; label: string }> = {
  funding: { to: '/portal/funding', label: 'View your funding applications →' },
  property_management: { to: '/portal/property', label: 'View your properties →' },
}

export default function Services() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [enrolled, setEnrolled] = useState<Enrolled[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [cat, mine] = await Promise.all([
      api.get<{ services: CatalogItem[] }>('/portal/services-catalog'),
      api.get<{ services: Enrolled[] }>('/portal/services'),
    ])
    setCatalog(cat.services)
    setEnrolled(mine.services)
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const enrolledKeys = new Set(enrolled.map((e) => e.service_key))

  return (
    <div>
      <PageHeader eyebrow="Your services" title="My Services" subtitle="Manage what Pinnacle is helping you with." />

      <Card className="mb-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Enrolled</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : enrolled.length === 0 ? (
          <EmptyState label="No services enrolled yet — start a journey below." />
        ) : (
          <ul className="space-y-3">
            {enrolled.map((e) => {
              const link = SERVICE_MODULE_LINKS[e.service_key]
              return (
                <li key={e.service_key} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
                  <div>
                    <span className="block text-sm font-medium text-white">{e.name}</span>
                    {link && (
                      <Link to={link.to} className="mt-1 inline-block text-xs text-gold hover:underline">
                        {link.label}
                      </Link>
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
        <p className="mb-4 text-sm text-slate-400">A few quick questions so we can route your request to the right specialist.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog
            .filter((c) => !enrolledKeys.has(c.key))
            .map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div>
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{c.description}</p>
                </div>
                <Link to={`/portal/services/${c.key}/apply`} className="btn-outline shrink-0 !px-4 !py-1.5 text-xs">
                  Start
                </Link>
              </div>
            ))}
          {catalog.length > 0 && catalog.every((c) => enrolledKeys.has(c.key)) && (
            <p className="text-sm text-slate-500">You're enrolled in every available service.</p>
          )}
        </div>
      </Card>
    </div>
  )
}
