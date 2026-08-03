import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { Card, PageHeader, EmptyState } from '../../components/ui'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'

export default function ActivityAdmin() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ events: ActivityEvent[] }>('/admin/activity')
      .then((r) => setEvents(r.events))
      .finally(() => setLoading(false))
    api.post('/admin/activity/mark-seen').catch(() => {})
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Firm-wide" title="Activity" subtitle="Everything happening across your clients and team." />
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : events.length === 0 ? (
        <Card>
          <EmptyState label="No activity yet." />
        </Card>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-white/5">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-4 px-5 py-4 text-sm">
                <div>
                  <p className="text-slate-200">{describeActivity(e)}</p>
                  {e.client_user_id && (
                    <Link to={`/admin/clients/${e.client_user_id}`} className="mt-1 inline-block text-xs text-gold hover:underline">
                      View client →
                    </Link>
                  )}
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{timeAgo(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
