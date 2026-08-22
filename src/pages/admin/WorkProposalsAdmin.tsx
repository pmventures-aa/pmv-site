import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, EmptyState, Tag, StatCard, SkeletonTable, btnPrimary, btnOutline, inputCls, type Tone } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'
import {
  formatCents,
  hqNeedsToAct,
  isEditable,
  proposalKindLabel,
  proposalStatusHint,
  proposalStatusLabel,
  proposalStatusTone,
  proposalTotalCents,
  type ProposalLine,
} from '../../../shared/vendorProposals'

interface Proposal {
  id: string
  kind: string
  service_key: string
  client_user_id: string
  vendor_user_id: string
  title: string | null
  summary: string | null
  site_label: string | null
  site_address: string | null
  site_city: string | null
  site_state: string | null
  site_postal_code: string | null
  scheduled_at: string | null
  respond_by: string | null
  offer_cents: number | null
  offer_notes: string | null
  status: string
  status_effective?: string
  sent_at: string | null
  responded_at: string | null
  vendor_response_note: string | null
  released_at: string | null
  field_assignment_id: string | null
  withdraw_reason: string | null
  total_cents: number
  created_at: string
  client_name: string | null
  client_email: string | null
  vendor_name: string | null
  vendor_email: string | null
}

interface Item { id: string; label: string; detail: string | null; quantity: number | null; unit: string | null; amount_cents: number }
interface ClientOption { id: string; full_name: string | null; email: string }
interface StaffOption { id: string; full_name: string | null; email: string; party_type?: string | null }

const TONE_MAP: Record<string, Tone> = { neutral: 'slate', info: 'blue', active: 'sea', success: 'green', warn: 'gold', danger: 'red' }

function tagTone(status: string): Tone {
  return TONE_MAP[proposalStatusTone(status)] ?? 'slate'
}

function shownStatus(p: Proposal): string {
  return p.status_effective || p.status
}

function when(iso: string | null): string {
  if (!iso) return 'Not set'
  const ms = Date.parse(iso.includes('T') || iso.includes(' ') ? iso : `${iso}T00:00:00Z`)
  if (!Number.isFinite(ms)) return iso
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function siteText(p: Proposal): string {
  const cityState = [p.site_city, p.site_state].filter(Boolean).join(', ')
  const parts = [p.site_address, cityState, p.site_postal_code].filter(Boolean)
  return [p.site_label, parts.join(' ')].filter(Boolean).join(' - ') || 'Not specified'
}

// ---------------------------------------------------------------- compose

interface DraftLine { label: string; detail: string; quantity: string; unit: string; amount: string }

const EMPTY_LINE: DraftLine = { label: '', detail: '', quantity: '', unit: '', amount: '' }

function toLines(rows: DraftLine[]): ProposalLine[] {
  return rows
    .filter((row) => row.label.trim())
    .map((row) => ({
      label: row.label.trim(),
      detail: row.detail.trim() || null,
      quantity: row.quantity.trim() ? Number(row.quantity) : null,
      unit: row.unit.trim() || null,
      amount_cents: Math.round((Number(row.amount) || 0) * 100),
    }))
}

function ComposeForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [providers, setProviders] = useState<StaffOption[]>([])
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<DraftLine[]>([{ ...EMPTY_LINE }])
  const [form, setForm] = useState({
    kind: 'field',
    service_key: 'mobile_notary',
    client_user_id: '',
    vendor_user_id: '',
    title: '',
    summary: '',
    site_label: '',
    site_address: '',
    site_city: '',
    site_state: '',
    site_postal_code: '',
    scheduled_at: '',
    respond_by: '',
    offer: '',
    offer_notes: '',
  })

  useEffect(() => {
    api.get<{ clients: ClientOption[] }>('/admin/clients')
      .then((r) => setClients(r.clients ?? []))
      .catch(() => toast.error('Could not load clients.'))
    api.get<{ staff: StaffOption[] }>('/admin/staff-directory')
      .then((r) => setProviders((r.staff ?? []).filter((s) => s.party_type === 'vendor')))
      .catch(() => toast.error('Could not load providers.'))
  }, [])

  const lines = useMemo(() => toLines(rows), [rows])
  const explicitCents = form.offer.trim() ? Math.round(Number(form.offer) * 100) : null
  const total = proposalTotalCents(lines, explicitCents)

  function setRow(index: number, patch: Partial<DraftLine>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function submit() {
    if (!form.service_key.trim()) return toast.error('Enter the service for this work.')
    if (!form.client_user_id) return toast.error('Choose the client this work is for.')
    if (!form.vendor_user_id) return toast.error('Choose the provider you are offering it to.')
    setSaving(true)
    try {
      const res = await api.post<{ proposal: Proposal }>('/admin/vendor-proposals', {
        ...form,
        offer_cents: explicitCents,
        scheduled_at: form.scheduled_at || null,
        respond_by: form.respond_by || null,
        items: lines,
      })
      toast.success('Draft saved. Review it, then send it to the provider.')
      onDone(res.proposal.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the proposal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel className="space-y-4">
      <div>
        <p className="text-sm font-bold text-white">New work proposal</p>
        <p className="mt-1 text-xs text-slate-400">Saved as a draft first. Nothing reaches the provider until you send it.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1 block text-xs text-slate-400">Work type</span>
          <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, service_key: e.target.value === 'ron' ? 'ron' : form.service_key })}>
            <option value="field">Field visit</option>
            <option value="ron">Remote online notarization</option>
          </select>
        </label>
        <label><span className="mb-1 block text-xs text-slate-400">Service</span>
          <input className={inputCls} placeholder="mobile_notary, property_management, ron" value={form.service_key} onChange={(e) => setForm({ ...form, service_key: e.target.value })}/>
        </label>
        <label><span className="mb-1 block text-xs text-slate-400">Client</span>
          <select className={inputCls} value={form.client_user_id} onChange={(e) => setForm({ ...form, client_user_id: e.target.value })}>
            <option value="">Choose a client</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
          </select>
        </label>
        <label><span className="mb-1 block text-xs text-slate-400">Provider</span>
          <select className={inputCls} value={form.vendor_user_id} onChange={(e) => setForm({ ...form, vendor_user_id: e.target.value })}>
            <option value="">Choose a provider</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </label>
      </div>

      <label className="block"><span className="mb-1 block text-xs text-slate-400">Title the provider sees</span>
        <input className={inputCls} placeholder="Estate signing, Boca Raton" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/>
      </label>

      <label className="block"><span className="mb-1 block text-xs text-slate-400">Scope of work</span>
        <textarea className={`${inputCls} min-h-28`} placeholder="What the provider is being asked to do, what to bring, who they will meet, and anything that would change whether they take it." value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })}/>
      </label>

      {form.kind === 'field' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="mb-1 block text-xs text-slate-400">Site label</span><input className={inputCls} placeholder="Client home" value={form.site_label} onChange={(e) => setForm({ ...form, site_label: e.target.value })}/></label>
          <label><span className="mb-1 block text-xs text-slate-400">Street address</span><input className={inputCls} value={form.site_address} onChange={(e) => setForm({ ...form, site_address: e.target.value })}/></label>
          <label><span className="mb-1 block text-xs text-slate-400">City</span><input className={inputCls} value={form.site_city} onChange={(e) => setForm({ ...form, site_city: e.target.value })}/></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="mb-1 block text-xs text-slate-400">State</span><input className={inputCls} value={form.site_state} onChange={(e) => setForm({ ...form, site_state: e.target.value })}/></label>
            <label><span className="mb-1 block text-xs text-slate-400">ZIP</span><input className={inputCls} value={form.site_postal_code} onChange={(e) => setForm({ ...form, site_postal_code: e.target.value })}/></label>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1 block text-xs text-slate-400">Scheduled for</span><input type="datetime-local" className={inputCls} value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}/></label>
        <label><span className="mb-1 block text-xs text-slate-400">Respond by</span><input type="datetime-local" className={inputCls} value={form.respond_by} onChange={(e) => setForm({ ...form, respond_by: e.target.value })}/></label>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Itemized scope</p>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_90px_90px_110px_auto]">
              <input className={inputCls} placeholder="What this line covers" value={row.label} onChange={(e) => setRow(index, { label: e.target.value })}/>
              <input className={inputCls} placeholder="Qty" value={row.quantity} onChange={(e) => setRow(index, { quantity: e.target.value })}/>
              <input className={inputCls} placeholder="Unit" value={row.unit} onChange={(e) => setRow(index, { unit: e.target.value })}/>
              <input className={inputCls} placeholder="Amount" value={row.amount} onChange={(e) => setRow(index, { amount: e.target.value })}/>
              <button type="button" className={btnOutline} onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} aria-label="Remove line">Remove</button>
            </div>
          ))}
        </div>
        <button type="button" className={`${btnOutline} mt-2`} onClick={() => setRows((prev) => [...prev, { ...EMPTY_LINE }])}>Add line</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1 block text-xs text-slate-400">Flat offer (overrides the lines)</span><input className={inputCls} placeholder="Leave blank to use the line total" value={form.offer} onChange={(e) => setForm({ ...form, offer: e.target.value })}/></label>
        <label><span className="mb-1 block text-xs text-slate-400">Pay notes</span><input className={inputCls} placeholder="Travel included, print fees billed separately" value={form.offer_notes} onChange={(e) => setForm({ ...form, offer_notes: e.target.value })}/></label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
        <p className="text-sm text-slate-300">Offered total <span className="font-bold text-white tabular-nums">{formatCents(total)}</span></p>
        <div className="flex gap-2">
          <button type="button" className={btnOutline} onClick={onCancel}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={saving} onClick={() => void submit()}>{saving ? 'Saving' : 'Save draft'}</button>
        </div>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------- detail

function ProposalDetail({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const navigate = useNavigate()
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ proposal: Proposal; items: Item[]; total_cents: number }>(`/admin/vendor-proposals/${id}`)
      setProposal(res.proposal)
      setItems(res.items)
      setTotal(res.total_cents)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load the proposal.')
    } finally {
      setLoaded(true)
    }
  }, [id])
  useEffect(() => { void load() }, [load])

  async function act(path: string, body: unknown, success: string) {
    setBusy(true)
    try {
      const res = await api.post<{ assignment_id?: string }>(`/admin/vendor-proposals/${id}/${path}`, body)
      toast.success(success)
      await load()
      onChanged()
      if (res.assignment_id) navigate(`../field-work/${res.assignment_id}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not go through.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <Panel><SkeletonTable rows={5} cols={2}/></Panel>
  if (!proposal) return <Panel><EmptyState label="That proposal is no longer available."/></Panel>

  const status = shownStatus(proposal)

  return (
    <Panel className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={tagTone(status)}>{proposalStatusLabel(status)}</Tag>
            <Tag>{proposalKindLabel(proposal.kind)}</Tag>
          </div>
          <p className="mt-2 text-base font-bold text-white">{proposal.title || proposal.service_key.replace(/_/g, ' ')}</p>
          <p className="mt-1 text-xs text-slate-400">{proposalStatusHint(status)}</p>
        </div>
        <button type="button" className={btnOutline} onClick={onClose}>Close</button>
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Provider</dt><dd className="text-right text-slate-200">{proposal.vendor_name || proposal.vendor_email || 'Unassigned'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Client</dt><dd className="text-right text-slate-200">{proposal.client_name || proposal.client_email || 'Unknown'}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">{proposal.kind === 'ron' ? 'Session' : 'Location'}</dt><dd className="text-right text-slate-200">{siteText(proposal)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Scheduled</dt><dd className="text-right text-slate-200">{when(proposal.scheduled_at)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Respond by</dt><dd className="text-right text-slate-200">{when(proposal.respond_by)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Offered</dt><dd className="text-right font-bold text-white tabular-nums">{formatCents(total)}</dd></div>
      </dl>

      {proposal.summary && (
        <div className="rounded-md border border-white/10 bg-white/[.02] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Scope of work</p>
          <p className="mt-1.5 whitespace-pre-line text-sm text-slate-300">{proposal.summary}</p>
        </div>
      )}

      {items.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Itemized</p>
          <ul className="divide-y divide-white/[.06]">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="text-slate-200">
                  {item.label}
                  {(item.quantity || item.detail) && (
                    <span className="mt-0.5 block text-xs text-slate-500">{[item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : '', item.detail].filter(Boolean).join(' - ')}</span>
                  )}
                </span>
                <span className="shrink-0 text-slate-300 tabular-nums">{formatCents(item.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {proposal.offer_notes && <p className="text-xs text-slate-400">{proposal.offer_notes}</p>}

      {proposal.vendor_response_note && (
        <div className="rounded-md border border-white/10 bg-white/[.02] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">What the provider said</p>
          <p className="mt-1.5 whitespace-pre-line text-sm text-slate-300">{proposal.vendor_response_note}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
        {proposal.status === 'draft' && (
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void act('send', {}, 'Sent to the provider.')}>Send to provider</button>
        )}
        {hqNeedsToAct(proposal.status) && (
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void act('release', {}, 'Released. The assignment is live.')}>Release into work</button>
        )}
        {(proposal.status === 'draft' || proposal.status === 'sent' || proposal.status === 'accepted') && (
          <button type="button" className={btnOutline} disabled={busy} onClick={() => void act('withdraw', {}, 'Withdrawn.')}>Withdraw</button>
        )}
        {proposal.field_assignment_id && (
          <button type="button" className={btnOutline} onClick={() => navigate(`../field-work/${proposal.field_assignment_id}`)}>Open the assignment</button>
        )}
        {isEditable(proposal.status) && <p className="self-center text-xs text-slate-500">Still a draft. Only you can see it.</p>}
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------- list

type Filter = 'release' | 'sent' | 'draft' | 'all'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'release', label: 'Needs release' },
  { key: 'sent', label: 'Awaiting response' },
  { key: 'draft', label: 'Drafts' },
  { key: 'all', label: 'All' },
]

export default function WorkProposalsAdmin() {
  const params = useParams()
  const navigate = useNavigate()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<Filter>('release')
  const [composing, setComposing] = useState(false)
  const selected = params.id ?? null

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ proposals: Proposal[] }>('/admin/vendor-proposals')
      setProposals(res.proposals ?? [])
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load work proposals.')
    } finally {
      setLoaded(true)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => ({
    release: proposals.filter((p) => p.status === 'accepted').length,
    sent: proposals.filter((p) => shownStatus(p) === 'sent').length,
    draft: proposals.filter((p) => p.status === 'draft').length,
  }), [proposals])

  const visible = useMemo(() => {
    if (filter === 'all') return proposals
    if (filter === 'release') return proposals.filter((p) => p.status === 'accepted')
    if (filter === 'draft') return proposals.filter((p) => p.status === 'draft')
    return proposals.filter((p) => shownStatus(p) === 'sent')
  }, [proposals, filter])

  return (
    <div className="space-y-4">
      <PageIntro
        kicker="Delivery"
        title="Work Proposals"
        subtitle="Offer detailed work to a provider. They accept, and it waits here until you release it into a live assignment."
        action={<button type="button" className={btnPrimary} onClick={() => setComposing((v) => !v)}>{composing ? 'Close' : 'New proposal'}</button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Accepted, needs release" value={counts.release} accent={counts.release ? 'gold' : undefined}/>
        <StatCard label="Awaiting a provider" value={counts.sent}/>
        <StatCard label="Drafts" value={counts.draft}/>
      </div>

      {composing && <ComposeForm onCancel={() => setComposing(false)} onDone={(id) => { setComposing(false); void load(); navigate(`../work-proposals/${id}`) }}/>}

      {selected && <ProposalDetail id={selected} onChanged={() => void load()} onClose={() => navigate('../work-proposals')}/>}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${filter === f.key ? 'border-gold/45 bg-gold/10 text-gold' : 'border-white/12 bg-white/[.025] text-slate-300 hover:text-gold'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!loaded ? <Panel><SkeletonTable rows={4} cols={4}/></Panel> : visible.length === 0 ? (
        <EmptyState label={filter === 'release' ? 'Nothing is waiting on you. Accepted proposals land here.' : 'Nothing here yet.'}/>
      ) : (
        <ul className="space-y-2">
          {visible.map((p) => {
            const status = shownStatus(p)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => navigate(`../work-proposals/${p.id}`)}
                  className="w-full rounded-lg border border-white/10 bg-white/[.02] p-4 text-left transition hover:border-gold/35 hover:bg-white/[.04]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone={tagTone(status)}>{proposalStatusLabel(status)}</Tag>
                      <span className="text-sm font-semibold text-white">{p.title || p.service_key.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-sm font-bold text-white tabular-nums">{formatCents(p.total_cents)}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {p.vendor_name || p.vendor_email || 'Unassigned provider'} · for {p.client_name || p.client_email || 'a client'} · {when(p.scheduled_at)}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
