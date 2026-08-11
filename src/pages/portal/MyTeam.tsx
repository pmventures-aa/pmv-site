import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { Card, PageHeader, EmptyState } from '../../components/ui'
import { Avatar } from '../../components/kit/Avatar'
import { PresenceDot } from '../../components/kit/PresenceDot'
import { usePresence, humanizePresence, humanizeLastSeen } from '../../lib/presence'

interface TeamMember {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  staff_role: string | null
  title: string | null
}

const ROLE_LABELS: Record<string, string> = {
  representative: 'Representative',
  billing_specialist: 'Billing Specialist',
  funding_specialist: 'Funding Specialist',
  affiliate_paralegal: 'Paralegal',
  accountant: 'Accountant',
  enrolled_agent: 'Enrolled Agent',
  property_manager: 'Property Manager',
  support_specialist: 'Support Specialist',
  auditor_readonly: 'Auditor',
  pinnacle_admin: 'Pinnacle Team',
}

export default function MyTeam() {
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<{ team: TeamMember[] }>('/portal/team')
      .then((r) => {
        setTeam(r.team)
        setLoadError(false)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const memberIds = useMemo(() => team.map((m) => m.id), [team])
  const presence = usePresence(memberIds, 'portal')

  return (
    <div>
      <PageHeader eyebrow="Your Pinnacle team" title="My Team" subtitle="The people assigned to your account." />
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : loadError ? (
        <Card>
          <div className="space-y-2 text-sm text-slate-400">
            <p>Couldn't load your team.</p>
            <button onClick={load} className="text-gold hover:underline">
              Try again
            </button>
          </div>
        </Card>
      ) : team.length === 0 ? (
        <Card>
          <EmptyState label="No one's been assigned yet: we'll introduce your team shortly." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {team.map((m) => {
            const entry = presence[m.id]
            return (
            <Card key={m.id}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar userId={m.id} name={m.full_name} size={44} />
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-navy-900 p-0.5">
                    <PresenceDot entry={entry} size={10} />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-white">{m.full_name || m.email}</p>
                  <p className="text-sm text-gold">{m.title || (m.staff_role ? ROLE_LABELS[m.staff_role] ?? m.staff_role : 'Team member')}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {humanizePresence(entry?.status)}{entry?.last_seen_at ? ` · ${humanizeLastSeen(entry.last_seen_at)}` : ''}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-400">
                <a href={`mailto:${m.email}`} className="block hover:text-gold">
                  {m.email}
                </a>
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="block hover:text-gold">
                    {m.phone}
                  </a>
                )}
              </div>
            </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
