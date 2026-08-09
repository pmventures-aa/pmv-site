import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { KanbanBoard, StageSelect, type KanbanColumn } from '../../components/admin/Kanban'
import { useAppPath } from '../../lib/basePath'

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

interface PipelineItem {
  id: string
  client_user_id: string
  client_name: string | null
  client_email: string
  status: string
  created_at: string
  submitted_at?: string | null
  title?: string
  type?: string
  service_key?: string
  service_name?: string
  assigned_rep_name?: string | null
  assigned_rep_email?: string | null
  is_unassigned?: number
  may_require_attorney_coordination?: number
  amount_requested_cents?: number | null
  use_of_funds?: string | null
}

const INQUIRY_COLUMNS: KanbanColumn[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'lost', label: 'Lost' },
]

const MODULE_TABS = [
  { key: 'inquiries', label: 'Inquiries' },
  { key: 'service_applications', label: 'Service Applications' },
  { key: 'matters', label: 'Matters' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'funding', label: 'Funding' },
] as const

type ModuleKey = (typeof MODULE_TABS)[number]['key']

const PATCH_PATH: Record<'matters' | 'tasks' | 'funding', string> = {
  matters: '/portal/matters',
  tasks: '/portal/tasks',
  funding: '/portal/funding',
}

function money(cents?: number | null): string {
  return typeof cents === 'number' ? `$${(cents / 100).toLocaleString()}` : '—'
}

export default function PipelinesAdmin() {
  const p = useAppPath()
  const [tab, setTab] = useState<ModuleKey>('inquiries')
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [items, setItems] = useState<PipelineItem[]>([])
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (which: ModuleKey) => {
    setLoading(true)
    try {
      if (which === 'inquiries') {
        const res = await api.get<{ inquiries: Inquiry[] }>('/admin/inquiries')
        setInquiries(res.inquiries)
        setColumns(INQUIRY_COLUMNS)
      } else {
        const res = await api.get<{ statuses: string[]; items: PipelineItem[] }>(`/admin/pipeline/${which}`)
        setItems(res.items)
        setColumns(res.statuses.map((status) => ({ key: status, label: status.replace(/_/g, ' ') })))
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load pipeline.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  async function moveInquiry(item: Inquiry, status: string) {
    setInquiries((cur) => cur.map((i) => i.id === item.id ? { ...i, status } : i))
    try {
      await api.patch(`/admin/inquiries/${item.id}`, { status })
    } catch {
      toast.error('Could not update inquiry.')
      await load('inquiries')
    }
  }

  async function convertInquiry(item: Inquiry) {
    try {
      await api.post(`/admin/inquiries/${item.id}/convert`)
      toast.success(`${item.name} is now a client.`)
      setInquiries((cur) => cur.filter((i) => i.id !== item.id))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not convert this lead.')
    }
  }

  async function moveItem(item: PipelineItem, status: string) {
    setItems((cur) => cur.map((i) => i.id === item.id ? { ...i, status } : i))
    try {
      if (tab === 'service_applications') {
        await api.patch(`/portal/service-applications/${item.id}/status`, { status })
      } else {
        const path = PATCH_PATH[tab as keyof typeof PATCH_PATH]
        await api.patch(`${path}/${item.id}`, { status })
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update status.')
      await load(tab)
    }
  }

  const inquiryColumns = useMemo(() => columns, [columns])

  return (
    <div>
      <PageIntro
        kicker="Workflow"
        title="Pipelines"
        subtitle="Drag a card to move it to the next stage. Service Applications now tracks submitted applications separately from ongoing service enrollment."
      />

      <div className="mb-5 flex gap-1.5 overflow-x-auto border-b border-white/10">
        {MODULE_TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === item.key ? 'border-gold text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : tab === 'inquiries' ? (
        inquiries.length === 0 ? <Panel><p className="text-sm text-slate-400">No inquiries yet.</p></Panel> : (
          <KanbanBoard
            columns={inquiryColumns}
            items={inquiries}
            getStatus={(i) => i.status}
            onMove={moveInquiry}
            renderCard={(i) => (
              <div>
                <p className="font-medium text-white">{i.name}</p>
                <p className="text-xs text-slate-400">{i.email}</p>
                {i.service_name && <p className="mt-1 text-xs text-gold">{i.service_name}</p>}
                <p className="mt-2 line-clamp-2 text-xs text-slate-400">{i.message}</p>
                <button onClick={() => convertInquiry(i)} className="mt-2 block text-xs font-semibold text-gold hover:underline">Convert to Client</button>
                <StageSelect value={i.status} columns={inquiryColumns} onChange={(status) => moveInquiry(i, status)} />
              </div>
            )}
          />
        )
      ) : items.length === 0 ? (
        <Panel><p className="text-sm text-slate-400">Nothing here yet.</p></Panel>
      ) : (
        <KanbanBoard
          columns={columns}
          items={items}
          getStatus={(i) => i.status}
          onMove={moveItem}
          renderCard={(i) => (
            <div>
              <Link to={p(`clients/${i.client_user_id}`)} className="font-medium text-white hover:text-gold">{i.client_name || i.client_email}</Link>
              <p className="mt-0.5 text-xs text-slate-400">
                {tab === 'service_applications' && (i.service_name ?? i.service_key)}
                {tab === 'matters' && (i.title ?? i.type ?? 'Matter')}
                {tab === 'tasks' && (i.title ?? 'Task')}
                {tab === 'funding' && `${money(i.amount_requested_cents)} requested`}
              </p>
              {tab === 'service_applications' && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {i.is_unassigned ? <Tag tone="red">Unassigned</Tag> : <Tag tone="slate">{i.assigned_rep_name || i.assigned_rep_email || 'Assigned team'}</Tag>}
                  {!!i.may_require_attorney_coordination && <Tag tone="gold">Attorney coordination review</Tag>}
                </div>
              )}
              {tab === 'service_applications' && i.submitted_at && <p className="mt-2 text-[11px] text-slate-500">Submitted {new Date(i.submitted_at).toLocaleString()}</p>}
              {tab === 'funding' && i.use_of_funds && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{i.use_of_funds}</p>}
              <StageSelect value={i.status} columns={columns} onChange={(status) => moveItem(i, status)} />
            </div>
          )}
        />
      )}
    </div>
  )
}
