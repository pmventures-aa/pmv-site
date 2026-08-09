import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import { Card, PageHeader, StatusBadge, EmptyState } from '../../components/ui'

interface Invoice {
  id: string
  amount_cents: number
  currency: string
  status: string
  due_date: string | null
  created_at: string
}

export default function Billing() {
  const { user } = useAuth()
  const isStaff = user?.role === 'staff' || user?.role === 'admin'
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ invoices: Invoice[] }>('/portal/billing')
      setInvoices(res.invoices)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function markPaid(id: string) {
    await api.patch(`/portal/billing/${id}`, { status: 'paid' })
    await load()
  }

  const openTotal = invoices.filter((i) => i.status === 'open').reduce((s, i) => s + i.amount_cents, 0)

  return (
    <div>
      <PageHeader eyebrow="Billing" title="Invoices" subtitle="Your billing history with Pinnacle Management Ventures." />

      <div className="mb-6 grid max-w-xs">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Open balance</p>
          <p className="mt-2 text-3xl font-bold text-white">${(openTotal / 100).toLocaleString()}</p>
        </Card>
      </div>

      <Card className="overflow-x-auto !p-0">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="p-6">
            <EmptyState label="No invoices yet." />
          </div>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Due</th>
                <th className="px-5 py-3 font-medium">Status</th>
                {isStaff && <th className="px-5 py-3 font-medium">Action</th>}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3 text-slate-200">${(inv.amount_cents / 100).toLocaleString()}</td>
                  <td className="px-5 py-3 text-slate-200">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3">
                    <StatusBadge tone={inv.status === 'paid' ? 'green' : inv.status === 'void' ? 'slate' : 'gold'}>{inv.status}</StatusBadge>
                  </td>
                  {isStaff && (
                    <td className="px-5 py-3">
                      {inv.status === 'open' && (
                        <button onClick={() => markPaid(inv.id)} className="text-xs font-medium text-gold hover:underline">
                          Mark paid
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
