import { useCallback, useEffect, useState } from 'react'
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

export default function Services() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [enrolled, setEnrolled] = useState<Enrolled[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [cat, mine] = await Promise.all([
      api.get<{ services: CatalogItem[] }>('/portal/services-catalog'),
      api.get<{ services: Enrolled[] }>('/portal/services'),
    ])
    setCatalog(cat.services)
    setEnrolled(mine.services)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const enrolledKeys = new Set(enrolled.map((e) => e.service_key))

  async function enroll(key: string) {
    setBusyKey(key)
    try {
      await api.post('/portal/services', { service_key: key })
      await load()
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Your services" title="Services" subtitle="Manage what Pinnacle is helping you with." />

      <Card className="mb-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Enrolled</h2>
        {enrolled.length === 0 ? (
          <EmptyState label="No services enrolled yet — add one below." />
        ) : (
          <ul className="space-y-3">
            {enrolled.map((e) => (
              <li key={e.service_key} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
                <span className="text-sm font-medium text-white">{e.name}</span>
                <StatusBadge tone={e.status === 'active' ? 'green' : e.status === 'completed' ? 'blue' : 'gold'}>
                  {e.status.replace(/_/g, ' ')}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-white">Add a service</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog
            .filter((c) => !enrolledKeys.has(c.key))
            .map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div>
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{c.description}</p>
                </div>
                <button
                  disabled={busyKey === c.key}
                  onClick={() => enroll(c.key)}
                  className="btn-outline shrink-0 !px-4 !py-1.5 text-xs disabled:opacity-60"
                >
                  {busyKey === c.key ? 'Adding…' : 'Add'}
                </button>
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
