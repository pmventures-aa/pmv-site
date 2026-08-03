import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, PageHeader, EmptyState } from '../../components/ui'
import { describeActivity, timeAgo, type ActivityEvent } from '../../lib/activity'

export default function Notifications() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ events: ActivityEvent[] }>('/portal/notifications')
      .then((r) => setEvents(r.events))
      .finally(() => setLoading(false))
    api.post('/portal/notifications/mark-seen').catch(() => {})
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Updates" title="Notifications" subtitle="Everything happening on your account." />
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : events.length === 0 ? (
        <Card>
          <EmptyState label="Nothing yet — you'll see updates here as your work progresses." />
        </Card>
      ) : (
        <Card className="divide-y divide-white/5 !p-0">
          {events.map((e) => (
            <div key={e.id} className="px-5 py-4 text-sm">
              <p className="text-slate-200">{describeActivity(e)}</p>
              <p className="mt-1 text-xs text-slate-500">{timeAgo(e.created_at)}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
