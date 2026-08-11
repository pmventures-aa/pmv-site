import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { useLiveRefresh } from '../../lib/liveRefresh'
import { PageIntro, Panel, Tag, EmptyState, inputCls, btnPrimary, btnOutline } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'

interface CRMRecord {
  id: string
  name: string
  email: string
  phone: string | null
  record_type: 'person' | 'business'
  first_name: string | null
  last_name: string | null
  company_name: string | null
  job_title: string | null
  source: string | null
  lifecycle_stage: string
  status: string
  email_status: string
  service_name: string | null
  owner_name: string | null
  owner_email: string | null
  tags: string | null
  list_count: number
  created_at: string
  updated_at: string | null
}

interface CRMList {
  id: string
  name: string
  description: string | null
  list_type: 'static' | 'dynamic'
  record_type: string
  filter_json: string | null
  member_count: number | null
  created_by_name: string | null
  created_at: string
}

interface ImportRow {
  id: string
  file_name: string | null
  record_type: string
  total_rows: number
  created_rows: number
  updated_rows: number
  skipped_rows: number
  created_by_name: string | null
  created_by_email: string
  created_at: string
}

interface Conversion {
  id: string
  inquiry_id: string
  client_user_id: string
  lead_name: string
  lead_email: string
  converted_by_name: string | null
  converted_by_email: string
  created_at: string
}

type Tab = 'records' | 'lists' | 'imports' | 'converted'

type DraftRecord = {
  record_type: 'person' | 'business'
  first_name: string
  last_name: string
  company_name: string
  email: string
  phone: string
  job_title: string
  source: string
  lifecycle_stage: string
  message: string
}

const emptyRecord: DraftRecord = {
  record_type: 'person', first_name: '', last_name: '', company_name: '', email: '', phone: '', job_title: '', source: '', lifecycle_stage: 'lead', message: '',
}

function formatDate(value: string) {
  return new Date(value.replace(' ', 'T') + (value.includes('T') ? '' : 'Z')).toLocaleDateString()
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '"') {
      if (quoted && next === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++
      row.push(cell); cell = ''
      if (row.some((v) => v.trim())) rows.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  row.push(cell)
  if (row.some((v) => v.trim())) rows.push(row)
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  const aliases: Record<string, string> = {
    firstname: 'first_name', first: 'first_name', lastname: 'last_name', last: 'last_name', company: 'company_name', business: 'company_name',
    business_name: 'company_name', title: 'job_title', type: 'record_type', lifecycle: 'lifecycle_stage', stage: 'lifecycle_stage', notes: 'message', note: 'message',
  }
  return rows.slice(1).map((values) => {
    const out: Record<string, string> = {}
    headers.forEach((raw, idx) => {
      const key = aliases[raw] || raw
      out[key] = (values[idx] || '').trim()
    })
    return out
  })
}

function lifecycleTone(stage: string): 'gold' | 'green' | 'blue' | 'slate' | 'red' {
  if (stage === 'opportunity') return 'gold'
  if (stage === 'prospect') return 'blue'
  if (stage === 'lost') return 'red'
  if (stage === 'converted') return 'green'
  return 'slate'
}

export default function CRMRecordsAdmin() {
  const p = useAppPath()
  const [tab, setTab] = useState<Tab>('records')
  const [records, setRecords] = useState<CRMRecord[]>([])
  const [lists, setLists] = useState<CRMList[]>([])
  const [imports, setImports] = useState<ImportRow[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [recordType, setRecordType] = useState('')
  const [lifecycle, setLifecycle] = useState('')
  const [pipelineStatus, setPipelineStatus] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState<DraftRecord>(emptyRecord)
  const [showImport, setShowImport] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('skip')
  const [busy, setBusy] = useState(false)
  const [newList, setNewList] = useState({ name: '', description: '', list_type: 'static' as 'static' | 'dynamic', record_type: 'all', lifecycle_stage: '', status: '' })
  const [listTarget, setListTarget] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      if (tab === 'records') {
        const params = new URLSearchParams()
        if (query.trim()) params.set('q', query.trim())
        if (recordType) params.set('record_type', recordType)
        if (lifecycle) params.set('lifecycle_stage', lifecycle)
        if (pipelineStatus) params.set('status', pipelineStatus)
        const res = await api.get<{ records: CRMRecord[] }>(`/admin/crm/records?${params.toString()}`)
        setRecords(res.records)
      } else if (tab === 'lists') {
        const res = await api.get<{ lists: CRMList[] }>('/admin/crm/lists')
        setLists(res.lists)
      } else if (tab === 'imports') {
        const res = await api.get<{ imports: ImportRow[] }>('/admin/crm/imports')
        setImports(res.imports)
      } else {
        const res = await api.get<{ conversions: Conversion[] }>('/admin/conversions')
        setConversions(res.conversions)
      }
    } catch (err) {
      if (!silent) toast.error(err instanceof ApiError ? err.message : 'Could not load CRM records.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [tab, query, recordType, lifecycle, pipelineStatus])

  useEffect(() => { const t = window.setTimeout(() => void load(), query ? 250 : 0); return () => window.clearTimeout(t) }, [load, query])
  const backgroundLoad = useCallback(() => load(true), [load])
  useLiveRefresh(backgroundLoad)

  const staticLists = useMemo(() => lists.filter((l) => l.list_type === 'static'), [lists])

  function toggle(id: string) {
    setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }

  async function createRecord(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const result = await api.post<{ id: string }>('/admin/crm/records', {
        ...draft,
        company_name: draft.company_name || undefined,
        phone: draft.phone || undefined,
        job_title: draft.job_title || undefined,
        source: draft.source || 'Manual entry',
      })
      toast.success('CRM record created.')
      setDraft(emptyRecord)
      setShowCreate(false)
      window.location.href = p(`leads/${result.id}/overview`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create lead.')
    } finally { setBusy(false) }
  }

  async function selectCsv(file: File | null) {
    setCsvFile(file)
    if (!file) { setCsvRows([]); return }
    try {
      const parsed = parseCsv(await file.text())
      setCsvRows(parsed)
      if (!parsed.length) toast.error('No data rows were found in that CSV.')
    } catch { toast.error('Could not read that CSV.') }
  }

  async function runImport() {
    if (!csvFile || !csvRows.length) return
    setBusy(true)
    try {
      const result = await api.post<{ created: number; updated: number; skipped: number; errors: any[] }>('/admin/crm/imports', {
        file_name: csvFile.name,
        record_type: 'person',
        duplicate_mode: duplicateMode,
        rows: csvRows,
      })
      toast.success(`Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`)
      setCsvFile(null); setCsvRows([]); setShowImport(false); setTab('records')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not import CSV.')
    } finally { setBusy(false) }
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const filter = newList.list_type === 'dynamic' ? {
        ...(newList.record_type !== 'all' ? { record_type: newList.record_type } : {}),
        ...(newList.lifecycle_stage ? { lifecycle_stage: newList.lifecycle_stage } : {}),
        ...(newList.status ? { status: newList.status } : {}),
      } : undefined
      await api.post('/admin/crm/lists', { ...newList, filter })
      setNewList({ name: '', description: '', list_type: 'static', record_type: 'all', lifecycle_stage: '', status: '' })
      toast.success('List created.')
      await load()
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not create list.') }
    finally { setBusy(false) }
  }

  async function addSelectedToList() {
    if (!listTarget || !selected.length) return
    setBusy(true)
    try {
      await api.post(`/admin/crm/lists/${listTarget}/members`, { inquiry_ids: selected })
      toast.success(`${selected.length} record${selected.length === 1 ? '' : 's'} added to list.`)
      setSelected([])
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Could not add records to list.') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <PageIntro
        kicker="CRM"
        title="Leads & Prospects"
        subtitle="People and businesses stay as durable records from first contact through conversion. Pipeline stage, lists, notes, and communication history travel with the relationship."
        action={<div className="flex gap-2"><button className={btnOutline} onClick={() => setShowImport((v) => !v)}>Import CSV</button><button className={btnPrimary} onClick={() => setShowCreate((v) => !v)}>+ Add record</button></div>}
      />

      <div className="mb-6 flex gap-6 border-b border-white/10">
        {([['records', 'Records'], ['lists', 'Lists & Segments'], ['imports', 'Imports'], ['converted', 'Converted']] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setSelected([]) }} className={`border-b-2 pb-3 text-sm font-medium transition ${tab === key ? 'border-gold text-white' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>{label}</button>
        ))}
      </div>

      {showCreate && (
        <Panel className="mb-6">
          <form onSubmit={createRecord}>
            <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-white">Add a CRM record</h2><p className="mt-1 text-sm text-slate-500">A person or business can live in the CRM before becoming a client.</p></div><select className={`${inputCls} !w-auto`} value={draft.record_type} onChange={(e) => setDraft((d) => ({ ...d, record_type: e.target.value as any }))}><option value="person">Person</option><option value="business">Business</option></select></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {draft.record_type === 'person' ? <><input className={inputCls} placeholder="First name" required value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} /><input className={inputCls} placeholder="Last name" value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} /><input className={inputCls} placeholder="Company" value={draft.company_name} onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))} /></> : <input className={inputCls} placeholder="Business name" required value={draft.company_name} onChange={(e) => setDraft((d) => ({ ...d, company_name: e.target.value }))} />}
              <input className={inputCls} type="email" placeholder="Email" required value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
              <input className={inputCls} placeholder="Phone" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
              <input className={inputCls} placeholder="Source, e.g. Referral" value={draft.source} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))} />
              <textarea className={`${inputCls} md:col-span-2 lg:col-span-3`} rows={2} placeholder="Initial notes / reason for interest" value={draft.message} onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))} />
            </div>
            <div className="mt-4 flex gap-2"><button className={btnPrimary} disabled={busy}>Create record</button><button type="button" className={btnOutline} onClick={() => setShowCreate(false)}>Cancel</button></div>
          </form>
        </Panel>
      )}

      {showImport && (
        <Panel className="mb-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold text-white">Import leads from CSV</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">Recognized columns include name, first_name, last_name, company_name, record_type, email, phone, job_title, website, industry, source, lifecycle_stage, status, service_key, notes/message.</p></div><input type="file" accept=".csv,text/csv" onChange={(e) => selectCsv(e.target.files?.[0] ?? null)} className="text-sm text-slate-300" /></div>
          {csvRows.length > 0 && <div className="mt-5"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-300"><strong className="text-white">{csvRows.length}</strong> data rows detected in {csvFile?.name}.</p><label className="flex items-center gap-2 text-sm text-slate-400">When email already exists<select className={`${inputCls} !w-auto`} value={duplicateMode} onChange={(e) => setDuplicateMode(e.target.value as any)}><option value="skip">Skip duplicate</option><option value="update">Update existing</option></select></label></div><div className="mt-4 overflow-x-auto border-y border-white/10"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr>{Object.keys(csvRows[0]).slice(0, 7).map((h) => <th key={h} className="px-3 py-2 font-medium">{h.replace(/_/g, ' ')}</th>)}</tr></thead><tbody>{csvRows.slice(0, 5).map((r, i) => <tr key={i} className="border-t border-white/5">{Object.keys(csvRows[0]).slice(0, 7).map((h) => <td key={h} className="max-w-48 truncate px-3 py-2 text-slate-300">{r[h] || 'Not provided'}</td>)}</tr>)}</tbody></table></div><button className={`${btnPrimary} mt-4`} disabled={busy} onClick={runImport}>{busy ? 'Importing…' : `Import ${csvRows.length} records`}</button></div>}
        </Panel>
      )}

      {tab === 'records' && <>
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_170px_150px]">
          <input className={inputCls} placeholder="Search name, email, company or phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className={inputCls} value={recordType} onChange={(e) => setRecordType(e.target.value)}><option value="">All record types</option><option value="person">People</option><option value="business">Businesses</option></select>
          <select className={inputCls} value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}><option value="">All lifecycle stages</option><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="opportunity">Opportunity</option><option value="lost">Lost</option></select>
          <select className={inputCls} value={pipelineStatus} onChange={(e) => setPipelineStatus(e.target.value)}><option value="">All pipeline stages</option><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="lost">Lost</option></select>
        </div>
        {selected.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-3 border-y border-gold/20 bg-gold/[0.04] px-4 py-3"><span className="text-sm font-medium text-white">{selected.length} selected</span><select className={`${inputCls} !w-auto min-w-52`} value={listTarget} onChange={(e) => setListTarget(e.target.value)}><option value="">Add to static list…</option>{staticLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><button className={`${btnOutline} !py-1.5`} disabled={!listTarget || busy} onClick={addSelectedToList}>Add to list</button><Link to={`${p('communications')}?leadIds=${encodeURIComponent(selected.join(','))}`} className={`${btnOutline} !py-1.5`}>Email selected</Link></div>}
        {loading ? <p className="text-sm text-slate-500">Loading records…</p> : records.length === 0 ? <EmptyState label="No CRM records match these filters." /> : <div className="overflow-hidden rounded-md border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/[0.025] text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-4 py-3"></th><th className="px-4 py-3 font-medium">Name / Company</th><th className="hidden px-4 py-3 font-medium md:table-cell">Lifecycle</th><th className="hidden px-4 py-3 font-medium lg:table-cell">Owner</th><th className="hidden px-4 py-3 font-medium xl:table-cell">Source</th><th className="px-4 py-3 font-medium">Last update</th></tr></thead><tbody>{records.map((r) => <tr key={r.id} className="border-t border-white/5 transition hover:bg-white/[0.025]"><td className="px-4 py-3"><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} /></td><td className="px-4 py-3"><Link to={p(`leads/${r.id}`)} className="font-semibold text-white hover:text-gold">{r.name}</Link><p className="mt-0.5 text-xs text-slate-500">{r.record_type === 'business' ? 'Business' : [r.job_title, r.company_name].filter(Boolean).join(' · ') || 'Person'} · {r.email}</p></td><td className="hidden px-4 py-3 md:table-cell"><Tag tone={lifecycleTone(r.lifecycle_stage)}>{r.lifecycle_stage}</Tag><span className="ml-2 text-xs text-slate-500">{r.status}</span></td><td className="hidden px-4 py-3 text-slate-400 lg:table-cell">{r.owner_name || r.owner_email || 'Unassigned'}</td><td className="hidden px-4 py-3 text-slate-400 xl:table-cell">{r.source || 'Not provided'}</td><td className="px-4 py-3 text-xs text-slate-500">{formatDate(r.updated_at || r.created_at)}</td></tr>)}</tbody></table></div>}
      </>}

      {tab === 'lists' && <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]"><Panel><h2 className="font-semibold text-white">New list or segment</h2><p className="mt-1 text-sm text-slate-500">Static lists contain selected records. Dynamic segments stay current as records match the filter.</p><form onSubmit={createList} className="mt-5 space-y-3"><input className={inputCls} placeholder="Name" required value={newList.name} onChange={(e) => setNewList((v) => ({ ...v, name: e.target.value }))} /><textarea className={inputCls} rows={2} placeholder="Description" value={newList.description} onChange={(e) => setNewList((v) => ({ ...v, description: e.target.value }))} /><select className={inputCls} value={newList.list_type} onChange={(e) => setNewList((v) => ({ ...v, list_type: e.target.value as any }))}><option value="static">Static list</option><option value="dynamic">Dynamic segment</option></select>{newList.list_type === 'dynamic' && <><select className={inputCls} value={newList.record_type} onChange={(e) => setNewList((v) => ({ ...v, record_type: e.target.value }))}><option value="all">People + businesses</option><option value="person">People only</option><option value="business">Businesses only</option></select><select className={inputCls} value={newList.lifecycle_stage} onChange={(e) => setNewList((v) => ({ ...v, lifecycle_stage: e.target.value }))}><option value="">Any lifecycle stage</option><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="opportunity">Opportunity</option><option value="lost">Lost</option></select><select className={inputCls} value={newList.status} onChange={(e) => setNewList((v) => ({ ...v, status: e.target.value }))}><option value="">Any pipeline stage</option><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="lost">Lost</option></select></>}<button className={`${btnPrimary} w-full`} disabled={busy}>Create {newList.list_type === 'dynamic' ? 'segment' : 'list'}</button></form></Panel><div>{loading ? <p className="text-sm text-slate-500">Loading lists…</p> : lists.length === 0 ? <EmptyState label="No lists or segments yet." /> : <div className="divide-y divide-white/5 border-y border-white/10">{lists.map((l) => <div key={l.id} className="flex items-center justify-between gap-4 py-4"><div><div className="flex items-center gap-2"><p className="font-semibold text-white">{l.name}</p><Tag tone={l.list_type === 'dynamic' ? 'blue' : 'slate'}>{l.list_type === 'dynamic' ? 'Dynamic' : 'Static'}</Tag></div><p className="mt-1 text-sm text-slate-500">{l.description || (l.list_type === 'dynamic' ? 'Updates automatically from CRM filters.' : 'Manual membership.')}</p></div><div className="text-right"><p className="text-sm text-slate-300">{l.member_count === null ? 'Live segment' : `${l.member_count} records`}</p><Link to={`${p('communications')}?list=${l.id}`} className="mt-1 inline-block text-xs font-medium text-gold hover:underline">Email this audience →</Link></div></div>)}</div>}</div></div>}

      {tab === 'imports' && (loading ? <p className="text-sm text-slate-500">Loading imports…</p> : imports.length === 0 ? <EmptyState label="No CRM imports yet." /> : <div className="overflow-hidden rounded-md border border-white/10"><table className="w-full text-left text-sm"><thead className="bg-white/[0.025] text-xs text-slate-500"><tr><th className="px-4 py-3">File</th><th className="px-4 py-3">Rows</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Imported by</th><th className="px-4 py-3">Date</th></tr></thead><tbody>{imports.map((i) => <tr key={i.id} className="border-t border-white/5"><td className="px-4 py-3 text-white">{i.file_name || 'CSV import'}</td><td className="px-4 py-3 text-slate-400">{i.total_rows}</td><td className="px-4 py-3 text-slate-400">{i.created_rows} new · {i.updated_rows} updated · {i.skipped_rows} skipped</td><td className="px-4 py-3 text-slate-400">{i.created_by_name || i.created_by_email}</td><td className="px-4 py-3 text-slate-500">{formatDate(i.created_at)}</td></tr>)}</tbody></table></div>)}

      {tab === 'converted' && (loading ? <p className="text-sm text-slate-500">Loading conversions…</p> : conversions.length === 0 ? <EmptyState label="No converted records yet." /> : <div className="divide-y divide-white/5 border-y border-white/10">{conversions.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold text-white">{c.lead_name}</p><p className="text-sm text-slate-500">{c.lead_email}</p></div><div className="text-right"><Link to={p(`clients/${c.client_user_id}`)} className="text-sm font-medium text-gold hover:underline">Open client profile →</Link><p className="mt-1 text-xs text-slate-500">Converted {formatDate(c.created_at)} by {c.converted_by_name || c.converted_by_email}</p></div></div>)}</div>)}
    </div>
  )
}
