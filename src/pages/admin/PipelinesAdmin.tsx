import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, Tag } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import { KanbanBoard, StageSelect, type KanbanColumn } from '../../components/admin/Kanban'
import { useAppPath } from '../../lib/basePath'

interface LeadRecord {
  id: string
  name: string
  email: string
  phone: string | null
  company_name: string | null
  record_type: 'person' | 'business'
  lifecycle_stage: string
  source: string | null
  service_name: string | null
  owner_name: string | null
  owner_email: string | null
  message: string
  status: string
  created_at: string
  updated_at: string | null
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

const LEAD_COLUMNS: KanbanColumn[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'lost', label: 'Lost' },
]

const MODULE_TABS = [
  { key: 'inquiries', label: 'Leads & Prospects' },
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

function lifecycleTone(stage: string): 'gold' | 'green' | 'blue' | 'slate' | 'red' {
  if (stage === 'opportunity') return 'gold'
  if (stage === 'prospect') return 'blue'
  if (stage === 'lost') return 'red'
  if (stage === 'converted') return 'green'
  return 'slate'
}

export default function PipelinesAdmin() {
  const p = useAppPath()
  const [tab, setTab] = useState<ModuleKey>('inquiries')
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [items, setItems] = useState<PipelineItem[]>([])
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [loading, setLoading] = useState(true)
  const [recordType, setRecordType] = useState('')
  const [lifecycle, setLifecycle] = useState('')

  const load = useCallback(async (which: ModuleKey) => {
    setLoading(true)
    try {
      if (which === 'inquiries') {
        const params = new URLSearchParams()
        if (recordType) params.set('record_type', recordType)
        if (lifecycle) params.set('lifecycle_stage', lifecycle)
        const res = await api.get<{ records: LeadRecord[] }>(`/admin/crm/records?${params.toString()}`)
        setLeads(res.records)
        setColumns(LEAD_COLUMNS)
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
  }, [recordType, lifecycle])

  useEffect(() => { load(tab) }, [tab, load])

  async function moveLead(item: LeadRecord, status: string) {
    setLeads((cur) => cur.map((lead) => lead.id === item.id ? { ...lead, status } : lead))
    try {
      await api.patch(`/admin/crm/records/${item.id}`, { status })
    } catch {
      toast.error('Could not update pipeline stage.')
      await load('inquiries')
    }
  }

  async function convertLead(item: LeadRecord) {
    if (!window.confirm(`Convert ${item.name} to a client?`)) return
    try {
      const result = await api.post<{ client_user_id: string }>(`/admin/inquiries/${item.id}/convert`)
      toast.success(`${item.name} is now a client.`)
      setLeads((cur) => cur.filter((lead) => lead.id !== item.id))
      window.location.href = p(`clients/${result.client_user_id}`)
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

  const pipelineColumns = useMemo(() => columns, [columns])

  return (
    <div>
      <PageIntro
        kicker="Workflow"
        title="Pipelines"
        subtitle="Use the pipeline for movement and prioritization. Open any lead, person, business, or client record for the full relationship history."
        action={tab === 'inquiries' ? <Link to={p('inquiries')} className="text-sm font-medium text-gold hover:underline">Open CRM records →</Link> : undefined}
      />

      <div className="mb-5 flex gap-1.5 overflow-x-auto border-b border-white/10">
        {MODULE_TABS.map((item) => (
          <button key={item.key} onClick={() => setTab(item.key)} className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${tab === item.key ? 'border-gold text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'inquiries' && <div className="mb-5 flex flex-wrap items-center gap-3">
        <select className="rounded-md border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white" value={recordType} onChange={(e) => setRecordType(e.target.value)}><option value="">People + businesses</option><option value="person">People</option><option value="business">Businesses</option></select>
        <select className="rounded-md border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white" value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}><option value="">All lifecycle stages</option><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="opportunity">Opportunity</option><option value="lost">Lost</option></select>
        <span className="text-xs text-slate-500">{leads.length} visible records</span>
      </div>}

      {loading ? <p className="text-sm text-slate-400">Loading…</p> : tab === 'inquiries' ? (
        leads.length === 0 ? <Panel><p className="text-sm text-slate-400">No CRM records match this view.</p></Panel> : <KanbanBoard
          columns={pipelineColumns}
          items={leads}
          getStatus={(lead) => lead.status}
          onMove={moveLead}
          renderCard={(lead) => <div>
            <div className="flex items-start justify-between gap-2"><Link to={p(`leads/${lead.id}`)} className="font-semibold text-white hover:text-gold">{lead.name}</Link><Tag tone={lifecycleTone(lead.lifecycle_stage)}>{lead.lifecycle_stage}</Tag></div>
            <p className="mt-1 text-xs text-slate-400">{lead.record_type === 'business' ? 'Business' : lead.company_name || 'Person'} · {lead.email}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">{lead.source && <span>Source: {lead.source}</span>}{lead.service_name && <span>{lead.service_name}</span>}{(lead.owner_name || lead.owner_email) && <span>Owner: {lead.owner_name || lead.owner_email}</span>}</div>
            {lead.message && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{lead.message}</p>}
            <div className="mt-3 flex items-center justify-between gap-2"><Link to={p(`leads/${lead.id}`)} className="text-xs font-semibold text-gold hover:underline">Open profile</Link>{lead.status === 'qualified' && <button onClick={() => convertLead(lead)} className="text-xs font-semibold text-emerald-300 hover:underline">Convert</button>}</div>
            <StageSelect value={lead.status} columns={pipelineColumns} onChange={(status) => moveLead(lead, status)} />
          </div>}
        />
      ) : items.length === 0 ? <Panel><p className="text-sm text-slate-400">Nothing here yet.</p></Panel> : <KanbanBoard
        columns={columns}
        items={items}
        getStatus={(i) => i.status}
        onMove={moveItem}
        renderCard={(i) => <div>
          <Link to={p(`clients/${i.client_user_id}`)} className="font-medium text-white hover:text-gold">{i.client_name || i.client_email}</Link>
          <p className="mt-0.5 text-xs text-slate-400">
            {tab === 'service_applications' && (i.service_name ?? i.service_key)}
            {tab === 'matters' && (i.title ?? i.type ?? 'Matter')}
            {tab === 'tasks' && (i.title ?? 'Task')}
            {tab === 'funding' && `${money(i.amount_requested_cents)} requested`}
          </p>
          {tab === 'service_applications' && <div className="mt-2 flex flex-wrap gap-1.5">{i.is_unassigned ? <Tag tone="red">Unassigned</Tag> : <Tag tone="slate">{i.assigned_rep_name || i.assigned_rep_email || 'Assigned team'}</Tag>}{!!i.may_require_attorney_coordination && <Tag tone="gold">Attorney coordination review</Tag>}</div>}
          {tab === 'service_applications' && i.submitted_at && <p className="mt-2 text-[11px] text-slate-500">Submitted {new Date(i.submitted_at).toLocaleString()}</p>}
          {tab === 'funding' && i.use_of_funds && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{i.use_of_funds}</p>}
          <StageSelect value={i.status} columns={columns} onChange={(status) => moveItem(i, status)} />
        </div>}
      />}
    </div>
  )
}
