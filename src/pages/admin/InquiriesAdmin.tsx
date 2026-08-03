import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { PageIntro, Panel, EmptyState } from '../../components/admin/ui'

interface Inquiry {
  id: string
  name: string
  email: string
  phone: string | null
  service_name: string | null
  message: string
  status: string
  created_at: string
}

export default function InquiriesAdmin() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ inquiries: Inquiry[] }>('/admin/inquiries')
      setInquiries(res.inquiries)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(id: string, status: string) {
    await api.patch(`/admin/inquiries/${id}`, { status })
    await load()
  }

  return (
    <div>
      <PageIntro kicker="Website" title="Request Service Inquiries" subtitle="Submissions from the public contact form." />
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : inquiries.length === 0 ? (
        <Panel>
          <EmptyState label="No inquiries yet." />
        </Panel>
      ) : (
        <Panel className="divide-y divide-white/5 !p-0">
          {inquiries.map((i) => (
            <div key={i.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-white">
                  {i.name} <span className="font-normal text-slate-400">— {i.email}</span>
                </p>
                {i.phone && <p className="text-xs text-slate-500">{i.phone}</p>}
                {i.service_name && <p className="mt-1 text-xs text-gold">{i.service_name}</p>}
                <p className="mt-2 max-w-xl text-sm text-slate-300">{i.message}</p>
                <p className="mt-2 text-xs text-slate-500">{new Date(i.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</p>
              </div>
              <select
                className="rounded-md border border-white/10 bg-navy-900 px-2 py-1 text-xs text-white"
                value={i.status}
                onChange={(e) => setStatus(i.id, e.target.value)}
              >
                {['new', 'contacted', 'closed'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </Panel>
      )}
    </div>
  )
}
