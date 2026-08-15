import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, List, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Panel, Tag, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { LeadConversionDialog } from '../../components/admin/LeadConversionDialog'
import { toast } from '../../components/kit/toast'
import { KanbanBoard, StageSelect, type KanbanColumn } from '../../components/admin/Kanban'
import { useAppPath } from '../../lib/basePath'
import { leadEmailHref } from '../../lib/engagements'
import { useAuth } from '../../lib/auth'
import {
  LEAD_BOARD_STAGES,
  ageLabel,
  compareLeadsByUrgency,
  isLeadStale,
  leadBoardLabel,
  leadBoardPatch,
  leadBoardStage,
  type LeadBoardStage,
} from '../../../shared/leadPipeline'
import { crmInviteName, crmRecordLine } from '../../../shared/crmRecord'

export interface LeadRecord {
  id: string
  name: string
  email: string
  phone: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  job_title: string | null
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

const BOARD_COLUMNS: KanbanColumn[] = LEAD_BOARD_STAGES.map((stage) => ({
  key: stage.key,
  label: stage.label,
  hint: stage.hint,
}))

type FocusKey = 'all' | 'followup' | 'ready' | 'mine'
type ViewKey = 'board' | 'list'

const emptyDraft = {
  record_type: 'person' as 'person' | 'business',
  first_name: '',
  last_name: '',
  company_name: '',
  job_title: '',
  email: '',
  phone: '',
  source: '',
  message: '',
}

function Chip({ label, active, onClick, tone = 'slate' }: { label: string; active: boolean; onClick: () => void; tone?: 'red' | 'gold' | 'slate' }) {
  const activeCls = tone === 'red' ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
    : tone === 'gold' ? 'border-gold/50 bg-gold/10 text-gold'
      : 'border-white/20 bg-white/[.05] text-white'
  return (
    <button type="button" onClick={onClick} className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${active ? activeCls : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200'}`}>
      {label}
    </button>
  )
}

export function LeadPipelineBoard({
  leads,
  loading,
  onLeadsChange,
  onRefresh,
}: {
  leads: LeadRecord[]
  loading: boolean
  onLeadsChange: (next: LeadRecord[] | ((current: LeadRecord[]) => LeadRecord[])) => void
  onRefresh: () => Promise<unknown>
}) {
  const p = useAppPath()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [recordType, setRecordType] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [hideLost, setHideLost] = useState(true)
  const [focus, setFocus] = useState<FocusKey>('all')
  const [view, setView] = useState<ViewKey>(() => (typeof window !== 'undefined' && window.localStorage.getItem('pmv_lead_pipeline_view') === 'list' ? 'list' : 'board'))
  const [showAdd, setShowAdd] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [sendInvite, setSendInvite] = useState(false)
  const [creating, setCreating] = useState(false)
  const [conversionTarget, setConversionTarget] = useState<LeadRecord | null>(null)
  const movingRef = useRef(new Set<string>())

  const ownerOptions = useMemo(() => Array.from(new Set(leads.map((lead) => lead.owner_name || lead.owner_email).filter(Boolean) as string[])).sort(), [leads])
  const sourceOptions = useMemo(() => Array.from(new Set(leads.map((lead) => lead.source).filter(Boolean) as string[])).sort(), [leads])
  const staleCount = useMemo(() => leads.filter((lead) => leadBoardStage(lead) !== 'lost' && isLeadStale(lead)).length, [leads])
  const readyCount = useMemo(() => leads.filter((lead) => leadBoardStage(lead) === 'ready').length, [leads])
  const mineCount = useMemo(() => {
    const email = user?.email?.toLowerCase()
    if (!email) return 0
    return leads.filter((lead) => (lead.owner_email || '').toLowerCase() === email && leadBoardStage(lead) !== 'lost').length
  }, [leads, user?.email])

  const visibleLeads = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const myEmail = user?.email?.toLowerCase() || ''
    return leads.filter((lead) => {
      const stage = leadBoardStage(lead)
      if (hideLost && stage === 'lost') return false
      if (recordType && lead.record_type !== recordType) return false
      if (ownerFilter && (lead.owner_name || lead.owner_email) !== ownerFilter) return false
      if (sourceFilter && lead.source !== sourceFilter) return false
      if (focus === 'followup' && (stage === 'lost' || !isLeadStale(lead))) return false
      if (focus === 'ready' && stage !== 'ready') return false
      if (focus === 'mine' && (lead.owner_email || '').toLowerCase() !== myEmail) return false
      if (!needle) return true
      return [lead.name, lead.email, lead.company_name, lead.first_name, lead.last_name, lead.job_title, lead.service_name, lead.source, lead.owner_name, lead.owner_email, lead.message].some((value) => String(value || '').toLowerCase().includes(needle))
    }).sort(compareLeadsByUrgency)
  }, [leads, query, recordType, ownerFilter, sourceFilter, hideLost, focus, user?.email])

  const columns = useMemo(() => hideLost ? BOARD_COLUMNS.filter((column) => column.key !== 'lost') : BOARD_COLUMNS, [hideLost])
  const filtersOn = Boolean(query || recordType || ownerFilter || sourceFilter || !hideLost || focus !== 'all')

  async function moveLead(item: LeadRecord, stage: string) {
    const next = stage as LeadBoardStage
    if (leadBoardStage(item) === next || movingRef.current.has(item.id)) return
    const patch = leadBoardPatch(next)
    movingRef.current.add(item.id)
    const previous = { status: item.status, lifecycle_stage: item.lifecycle_stage, updated_at: item.updated_at }
    onLeadsChange((current) => current.map((lead) => lead.id === item.id ? { ...lead, ...patch, updated_at: new Date().toISOString() } : lead))
    try {
      await api.patch(`/admin/crm/records/${item.id}`, patch)
      toast.success(`Moved ${item.name} to ${leadBoardLabel(next)}.`)
    } catch {
      onLeadsChange((current) => current.map((lead) => lead.id === item.id ? { ...lead, ...previous } : lead))
      toast.error('Could not update pipeline stage.')
    } finally {
      movingRef.current.delete(item.id)
    }
  }

  async function createLead() {
    const email = draft.email.trim().toLowerCase()
    const first = draft.first_name.trim()
    const last = draft.last_name.trim()
    const company = draft.company_name.trim()
    const name = draft.record_type === 'business' ? company : `${first} ${last}`.trim()
    if (!email) { toast.error('Enter an email address.'); return }
    if (!name) { toast.error(draft.record_type === 'business' ? 'Enter a business name.' : 'Enter a first name.'); return }
    setCreating(true)
    try {
      const result = await api.post<{ id: string }>('/admin/crm/records', {
        record_type: draft.record_type,
        first_name: first || undefined,
        last_name: last || undefined,
        company_name: company || undefined,
        job_title: draft.job_title.trim() || undefined,
        name,
        email,
        phone: draft.phone.trim() || undefined,
        source: draft.source.trim() || 'Pipeline',
        lifecycle_stage: 'lead',
        status: 'new',
        message: draft.message.trim() || undefined,
      })
      let inviteSent = false
      if (sendInvite) {
        try {
          const invite = await api.post<{ email_status: string; email_error?: string }>('/admin/invitations', {
            invite_type: 'client',
            email,
            full_name: crmInviteName({ ...draft, name }),
            lead_id: result.id,
          })
          inviteSent = invite.email_status === 'sent'
          if (!inviteSent) toast.error(`Lead created, but the invitation email was not sent. ${invite.email_error || ''}`)
        } catch (err) {
          toast.error(err instanceof ApiError ? `Lead created, but the invitation could not be sent: ${err.message}` : 'Lead created, but the invitation could not be sent.')
        }
      }
      toast.success(inviteSent ? `${name} is in New leads and a client invitation was emailed.` : `${name} is in New leads.`)
      setDraft(emptyDraft)
      setSendInvite(false)
      setShowAdd(false)
      await onRefresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the lead.')
    } finally {
      setCreating(false)
    }
  }

  function setViewMode(next: ViewKey) {
    setView(next)
    window.localStorage.setItem('pmv_lead_pipeline_view', next)
  }

  function clearFilters() {
    setQuery('')
    setRecordType('')
    setOwnerFilter('')
    setSourceFilter('')
    setHideLost(true)
    setFocus('all')
  }

  function card(lead: LeadRecord) {
    const stale = isLeadStale(lead) && leadBoardStage(lead) !== 'lost'
    const stage = leadBoardStage(lead)
    return (
      <div className={`pmv-kanban-card ${stale ? 'rounded-md ring-1 ring-rose-400/40' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <Link to={p(`leads/${lead.id}`)} className="font-bold text-white hover:text-gold">{lead.name}</Link>
          {stale && <Tag tone="red">Needs follow-up</Tag>}
        </div>
        <p className="mt-1 text-xs text-slate-400">{crmRecordLine(lead)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Tag tone={stale ? 'red' : 'slate'}>{ageLabel(lead.updated_at || lead.created_at)} idle</Tag>
          {lead.source && <Tag tone="slate">{lead.source}</Tag>}
        </div>
        <div className="mt-2 space-y-1 text-[11px] text-slate-500">
          {lead.service_name && <p>Interest: <span className="text-slate-300">{lead.service_name}</span></p>}
          <p>Owner: <span className="text-slate-300">{lead.owner_name || lead.owner_email || 'Unassigned'}</span></p>
        </div>
        {lead.message && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{lead.message}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to={leadEmailHref(p, { id: lead.id, email: lead.email, name: lead.name })} className="text-xs font-bold text-gold hover:underline">Email</Link>
          <Link to={`${p('quotes')}?new=1&email=${encodeURIComponent(lead.email)}&name=${encodeURIComponent(lead.name)}`} className="text-xs font-bold text-gold hover:underline">Quote</Link>
          <Link to={p(`leads/${lead.id}`)} className="text-xs font-bold text-gold hover:underline">Open</Link>
          {stage === 'ready' && <button type="button" onClick={() => setConversionTarget(lead)} className="text-xs font-bold text-emerald-300 hover:underline">Convert</button>}
        </div>
        <StageSelect value={stage} columns={BOARD_COLUMNS} onChange={(next) => void moveLead(lead, next)} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">Leads and prospects</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">New people start as leads. After you talk with them they become prospects. When they are qualified, convert them to a client.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={p('inquiries')} className={btnOutline}>All records</Link>
          <Link to={`${p('leads/new')}?from=pipelines`} className={btnOutline}>Full form</Link>
          <button type="button" onClick={() => setShowAdd((open) => !open)} className={btnPrimary}><Plus size={14} />{showAdd ? 'Close' : 'Add lead'}</button>
        </div>
      </div>

      {showAdd && (
        <form className="mb-4 space-y-3 rounded-xl border border-gold/20 bg-gold/[.04] p-4" onSubmit={(e) => { e.preventDefault(); void createLead() }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Add a lead</p>
              <p className="mt-0.5 text-xs text-slate-500">They land in New leads. Drag right as the relationship moves.</p>
            </div>
            <select className={`${inputCls} !min-h-10 w-auto min-w-[140px]`} value={draft.record_type} onChange={(e) => setDraft((current) => ({ ...current, record_type: e.target.value as 'person' | 'business' }))}>
              <option value="person">Person</option>
              <option value="business">Business</option>
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {draft.record_type === 'business' && <label className="sm:col-span-2"><span className="mb-1 block text-[11px] font-semibold text-slate-400">Business name</span><input className={inputCls} required placeholder="Practice or company" value={draft.company_name} onChange={(e) => setDraft((current) => ({ ...current, company_name: e.target.value }))} /></label>}
            <label><span className="mb-1 block text-[11px] font-semibold text-slate-400">{draft.record_type === 'business' ? 'Contact first name' : 'First name'}</span><input className={inputCls} required={draft.record_type === 'person'} placeholder="Jordan" value={draft.first_name} onChange={(e) => setDraft((current) => ({ ...current, first_name: e.target.value }))} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-slate-400">{draft.record_type === 'business' ? 'Contact last name' : 'Last name'}</span><input className={inputCls} placeholder="Lee" value={draft.last_name} onChange={(e) => setDraft((current) => ({ ...current, last_name: e.target.value }))} /></label>
            {draft.record_type === 'person' && <label><span className="mb-1 block text-[11px] font-semibold text-slate-400">Company</span><input className={inputCls} placeholder="Optional" value={draft.company_name} onChange={(e) => setDraft((current) => ({ ...current, company_name: e.target.value }))} /></label>}
            <label><span className="mb-1 block text-[11px] font-semibold text-slate-400">{draft.record_type === 'business' ? 'Contact title' : 'Job title'}</span><input className={inputCls} placeholder="Optional" value={draft.job_title} onChange={(e) => setDraft((current) => ({ ...current, job_title: e.target.value }))} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-slate-400">Email</span><input className={inputCls} type="email" required placeholder="name@example.com" value={draft.email} onChange={(e) => setDraft((current) => ({ ...current, email: e.target.value }))} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-slate-400">Phone</span><input className={inputCls} type="tel" placeholder="Optional" value={draft.phone} onChange={(e) => setDraft((current) => ({ ...current, phone: e.target.value }))} /></label>
            <label><span className="mb-1 block text-[11px] font-semibold text-slate-400">Source</span><input className={inputCls} placeholder="Referral, website, outbound" value={draft.source} onChange={(e) => setDraft((current) => ({ ...current, source: e.target.value }))} /></label>
            <label className="sm:col-span-2 xl:col-span-4"><span className="mb-1 block text-[11px] font-semibold text-slate-400">What they need</span><textarea className={`${inputCls} min-h-[72px]`} placeholder="Service interest and anything the next person should know." value={draft.message} onChange={(e) => setDraft((current) => ({ ...current, message: e.target.value }))} /></label>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/[.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-300">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#c9a227]" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
              <span>Email a client invitation after creating this lead.</span>
            </label>
            <button type="submit" disabled={creating} className={`${btnPrimary} shrink-0`}>{creating ? 'Adding…' : sendInvite ? 'Add lead and invite' : 'Add to New leads'}</button>
          </div>
        </form>
      )}

      <Panel className="mb-4 !p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip label="All" active={focus === 'all'} onClick={() => setFocus('all')} />
          <Chip label={staleCount ? `Needs follow-up (${staleCount})` : 'Needs follow-up'} active={focus === 'followup'} tone="red" onClick={() => setFocus('followup')} />
          <Chip label={readyCount ? `Ready to convert (${readyCount})` : 'Ready to convert'} active={focus === 'ready'} tone="gold" onClick={() => setFocus('ready')} />
          {user?.email && <Chip label={mineCount ? `Mine (${mineCount})` : 'Mine'} active={focus === 'mine'} onClick={() => setFocus('mine')} />}
          <span className="mx-1 h-4 w-px bg-white/10" />
          <button type="button" onClick={() => setViewMode('board')} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium ${view === 'board' ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/10 text-slate-400 hover:text-white'}`}><LayoutGrid size={12} /> Board</button>
          <button type="button" onClick={() => setViewMode('list')} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium ${view === 'list' ? 'border-gold/40 bg-gold/10 text-gold' : 'border-white/10 text-slate-400 hover:text-white'}`}><List size={12} /> List</button>
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 text-slate-500"><Search size={14} /></span>
          <input type="search" className={`${inputCls} min-w-0`} placeholder="Search name, email, company, service, source, or owner" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" onClick={() => setShowFilters((value) => !value)} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-xs font-bold ${showFilters||recordType||ownerFilter||sourceFilter||!hideLost?'border-gold/30 bg-gold/[.07] text-gold':'border-white/10 text-slate-400'}`}><SlidersHorizontal size={13}/><span className="hidden sm:inline">{showFilters?'Hide filters':'Filters'}</span></button>
        </div>
        <div className={`${showFilters ? 'grid' : 'hidden'} mt-2 gap-2 rounded-lg border border-white/[.07] bg-white/[.015] p-2 sm:grid sm:grid-cols-2 lg:grid-cols-4`}>
          <select className={`${inputCls} !min-h-10 w-full`} value={recordType} onChange={(e) => setRecordType(e.target.value)}><option value="">People and businesses</option><option value="person">People</option><option value="business">Businesses</option></select>
          <select className={`${inputCls} !min-h-10 w-full`} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}><option value="">All owners</option>{ownerOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <select className={`${inputCls} !min-h-10 w-full`} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}><option value="">All sources</option>{sourceOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select>
          <div className="flex items-center gap-2"><button type="button" onClick={() => setHideLost((value) => !value)} className={`min-h-10 flex-1 rounded-md border px-3 py-2 text-xs font-bold ${hideLost ? 'border-white/10 text-slate-400' : 'border-gold/30 bg-gold/[.07] text-gold'}`}>{hideLost ? 'Show lost' : 'Lost visible'}</button>{filtersOn && <button type="button" onClick={clearFilters} className="min-h-10 px-2 py-2 text-xs font-bold text-slate-500 hover:text-white">Clear</button>}</div>
        </div>
      </Panel>

      {loading ? <Panel><p className="text-sm text-slate-400">Loading leads and prospects…</p></Panel>
        : visibleLeads.length === 0 ? (
          <Panel>
            <p className="text-sm font-semibold text-white">Nothing matches this view.</p>
            <p className="mt-1 text-xs text-slate-500">Add a lead, or clear filters to see the full pipeline.</p>
          </Panel>
        ) : view === 'board' ? (
          <KanbanBoard columns={columns} items={visibleLeads} getStatus={(lead) => leadBoardStage(lead)} onMove={moveLead} sortItems={compareLeadsByUrgency} renderCard={card} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.025] text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Stage</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Owner</th>
                  <th className="hidden px-4 py-3 font-medium xl:table-cell">Idle</th>
                  <th className="px-4 py-3 font-medium">Next</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((lead) => {
                  const stage = leadBoardStage(lead)
                  const stale = isLeadStale(lead) && stage !== 'lost'
                  return (
                    <tr key={lead.id} className={`border-t border-white/5 transition hover:bg-white/[0.025] ${stale ? 'bg-rose-500/[.04]' : ''}`}>
                      <td className="px-4 py-3">
                        <Link to={p(`leads/${lead.id}`)} className="font-semibold text-white hover:text-gold">{lead.name}</Link>
                        <p className="mt-0.5 text-xs text-slate-500">{crmRecordLine(lead)}</p>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell"><Tag tone={stage === 'ready' ? 'gold' : stage === 'lost' ? 'red' : stage === 'prospects' ? 'blue' : 'slate'}>{leadBoardLabel(stage)}</Tag></td>
                      <td className="hidden px-4 py-3 text-slate-300 lg:table-cell">{lead.owner_name || lead.owner_email || 'Unassigned'}</td>
                      <td className="hidden px-4 py-3 xl:table-cell"><Tag tone={stale ? 'red' : 'slate'}>{ageLabel(lead.updated_at || lead.created_at)}</Tag></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={leadEmailHref(p, { id: lead.id, email: lead.email, name: lead.name })} className="text-xs font-bold text-gold hover:underline">Email</Link>
                          {stage === 'ready' && <button type="button" onClick={() => setConversionTarget(lead)} className="text-xs font-bold text-emerald-300 hover:underline">Convert</button>}
                          <StageSelect value={stage} columns={BOARD_COLUMNS} onChange={(next) => void moveLead(lead, next)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {conversionTarget && (
        <LeadConversionDialog
          leadId={conversionTarget.id}
          leadName={conversionTarget.name}
          onClose={() => setConversionTarget(null)}
          onConverted={(clientUserId) => {
            toast.success(`${conversionTarget.name} is now a client.`)
            onLeadsChange((current) => current.filter((lead) => lead.id !== conversionTarget.id))
            setConversionTarget(null)
            window.location.href = p(`clients/${clientUserId}`)
          }}
        />
      )}
    </div>
  )
}
