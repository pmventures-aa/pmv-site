import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, PageHeader, EmptyState } from '../../components/ui'

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

  useEffect(() => {
    api
      .get<{ team: TeamMember[] }>('/portal/team')
      .then((r) => setTeam(r.team))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Your Pinnacle team" title="My Team" subtitle="The people assigned to your account." />
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : team.length === 0 ? (
        <Card>
          <EmptyState label="No one's been assigned yet — we'll introduce your team shortly." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {team.map((m) => (
            <Card key={m.id}>
              <p className="text-base font-semibold text-white">{m.full_name || m.email}</p>
              <p className="mt-1 text-sm text-gold">{m.title || (m.staff_role ? ROLE_LABELS[m.staff_role] ?? m.staff_role : 'Team member')}</p>
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
          ))}
        </div>
      )}
    </div>
  )
}
