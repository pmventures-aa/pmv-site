import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../../lib/api'
import { Panel, Tag, EmptyState, NoAccess, inputCls, btnPrimary, btnOutline } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'

interface ServiceRow {
  key: string
  name: string
  description: string | null
  category: string | null
  sort_order: number
  active: number
  intake_intro: string | null
  estimated_minutes: number
  question_count: number
}

interface QuestionRow {
  id: string
  service_key: string
  question_key: string
  label: string
  help_text: string | null
  input_type: string
  options: string | null
  required: number
  step_label: string | null
  step_order: number
  sort_order: number
  condition_question_key: string | null
  condition_operator: string | null
  condition_value: string | null
  allow_multiple: number
}

const INPUT_TYPES = [
  ['text', 'Text'],
  ['textarea', 'Long text'],
  ['single_select', 'Single select / cards'],
  ['multi_select', 'Multi-select / chips'],
  ['toggle', 'Yes / No toggle'],
  ['number', 'Number'],
  ['currency', 'Currency'],
  ['date', 'Date'],
  ['datetime_window', 'Date + time window'],
  ['address', 'Address'],
  ['file', 'File upload'],
] as const

const CONDITION_OPERATORS = [
  ['==', 'equals'],
  ['!=', 'does not equal'],
  ['contains', 'contains'],
  ['not_contains', 'does not contain'],
  ['truthy', 'is yes / true'],
  ['falsy', 'is no / false'],
] as const

const EMPTY_NEW = {
  question_key: '',
  label: '',
  help_text: '',
  input_type: 'text',
  options: '',
  required: true,
  step_label: '',
  step_order: '1',
  sort_order: '10',
  condition_question_key: '',
  condition_operator: '==',
  condition_value: '',
  allow_multiple: false,
}

function validOptionsJson(raw: string): boolean {
  if (!raw.trim()) return true
  try { return Array.isArray(JSON.parse(raw)) } catch { return false }
}

function ServiceEditor({ service, onChanged }: { service: ServiceRow; onChanged: () => void }) {
  const [form, setForm] = useState({
    name: service.name,
    description: service.description ?? '',
    category: service.category ?? '',
    intake_intro: service.intake_intro ?? '',
    estimated_minutes: String(service.estimated_minutes || 3),
    sort_order: String(service.sort_order),
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setForm({
      name: service.name,
      description: service.description ?? '',
      category: service.category ?? '',
      intake_intro: service.intake_intro ?? '',
      estimated_minutes: String(service.estimated_minutes || 3),
      sort_order: String(service.sort_order),
    })
  }, [service])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.patch(`/admin/services/${service.key}`, {
        ...form,
        estimated_minutes: Math.max(1, Number(form.estimated_minutes) || 3),
        sort_order: Number(form.sort_order) || 0,
      })
      toast.success(`${service.name} settings saved.`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save service settings.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="grid gap-3 border-b border-white/10 bg-white/[0.015] px-5 py-4 sm:grid-cols-2">
      <label>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Service name</span>
        <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </label>
      <label>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Category</span>
        <input className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Portal description</span>
        <input className={inputCls} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Wizard intro</span>
        <textarea className={`${inputCls} min-h-[76px] resize-y`} value={form.intake_intro} onChange={(e) => setForm((f) => ({ ...f, intake_intro: e.target.value }))} />
      </label>
      <label>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estimated minutes</span>
        <input className={inputCls} type="number" min="1" max="30" value={form.estimated_minutes} onChange={(e) => setForm((f) => ({ ...f, estimated_minutes: e.target.value }))} />
      </label>
      <label>
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Catalog sort order</span>
        <input className={inputCls} type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className={`${btnOutline} text-xs`}>{busy ? 'Saving…' : 'Save service details'}</button>
      </div>
    </form>
  )
}

function QuestionCard({
  question,
  questions,
  onChanged,
}: {
  question: QuestionRow
  questions: QuestionRow[]
  onChanged: () => void
}) {
  const [draft, setDraft] = useState<QuestionRow>(question)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => setDraft(question), [question])

  async function save() {
    if (!validOptionsJson(draft.options ?? '')) {
      toast.error('Options must be valid JSON array syntax.')
      return
    }
    setBusy(true)
    try {
      await api.patch(`/admin/services/questions/${draft.id}`, {
        label: draft.label,
        help_text: draft.help_text ?? '',
        input_type: draft.input_type,
        options: draft.options ?? '',
        required: !!draft.required,
        step_label: draft.step_label ?? '',
        step_order: Number(draft.step_order) || 1,
        sort_order: Number(draft.sort_order) || 0,
        condition_question_key: draft.condition_question_key ?? '',
        condition_operator: draft.condition_question_key ? draft.condition_operator || '==' : null,
        condition_value: draft.condition_question_key ? draft.condition_value ?? '' : null,
        allow_multiple: !!draft.allow_multiple,
      })
      toast.success('Question updated.')
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update question.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    try {
      await api.del(`/admin/services/questions/${draft.id}`)
      toast.success('Question removed.')
      onChanged()
    } catch {
      toast.error('Could not remove question.')
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-navy-950/55">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">{draft.label}</p>
            {draft.required ? <Tag tone="gold">required</Tag> : <Tag>optional</Tag>}
            <Tag>{draft.input_type.replace(/_/g, ' ')}</Tag>
            {draft.condition_question_key && <Tag tone="blue">conditional</Tag>}
          </div>
          <p className="mt-1 text-xs text-slate-500">{draft.question_key} · Step {draft.step_order}: {draft.step_label || 'Unlabeled'}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-gold">{open ? 'Close' : 'Edit'}</span>
      </button>

      {open && (
        <div className="grid gap-3 border-t border-white/10 px-4 py-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Question</span>
            <input className={inputCls} value={draft.label} onChange={(e) => setDraft((q) => ({ ...q, label: e.target.value }))} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Help text</span>
            <textarea className={`${inputCls} min-h-[62px] resize-y`} value={draft.help_text ?? ''} onChange={(e) => setDraft((q) => ({ ...q, help_text: e.target.value }))} />
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Input type</span>
            <select className={inputCls} value={draft.input_type} onChange={(e) => setDraft((q) => ({ ...q, input_type: e.target.value }))}>
              {INPUT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Question key</span>
            <input className={`${inputCls} opacity-70`} value={draft.question_key} disabled />
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step label</span>
            <input className={inputCls} value={draft.step_label ?? ''} onChange={(e) => setDraft((q) => ({ ...q, step_label: e.target.value }))} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step #</span>
              <input className={inputCls} type="number" min="1" value={draft.step_order} onChange={(e) => setDraft((q) => ({ ...q, step_order: Number(e.target.value) }))} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order</span>
              <input className={inputCls} type="number" value={draft.sort_order} onChange={(e) => setDraft((q) => ({ ...q, sort_order: Number(e.target.value) }))} />
            </label>
          </div>

          {(draft.input_type === 'single_select' || draft.input_type === 'multi_select') && (
            <label className="sm:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Options JSON</span>
              <textarea
                className={`${inputCls} min-h-[100px] font-mono text-xs`}
                value={draft.options ?? ''}
                onChange={(e) => setDraft((q) => ({ ...q, options: e.target.value }))}
                placeholder={'["Option A","Option B"]'}
              />
              <span className="mt-1 block text-xs text-slate-500">
                Strings work for simple choices. Tier cards can use objects with value, label, description, and meta. Property Management tier fee placeholders live here.
              </span>
            </label>
          )}

          <div className="sm:col-span-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Conditional display</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                className={inputCls}
                value={draft.condition_question_key ?? ''}
                onChange={(e) => setDraft((q) => ({ ...q, condition_question_key: e.target.value || null }))}
              >
                <option value="">Always show</option>
                {questions.filter((q) => q.id !== draft.id).map((q) => <option key={q.id} value={q.question_key}>{q.label}</option>)}
              </select>
              <select
                className={inputCls}
                disabled={!draft.condition_question_key}
                value={draft.condition_operator ?? '=='}
                onChange={(e) => setDraft((q) => ({ ...q, condition_operator: e.target.value }))}
              >
                {CONDITION_OPERATORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input
                className={inputCls}
                disabled={!draft.condition_question_key || ['truthy', 'falsy'].includes(draft.condition_operator ?? '')}
                placeholder="Value"
                value={draft.condition_value ?? ''}
                onChange={(e) => setDraft((q) => ({ ...q, condition_value: e.target.value }))}
              />
            </div>
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={!!draft.required} onChange={(e) => setDraft((q) => ({ ...q, required: e.target.checked ? 1 : 0 }))} /> Required
            </label>
            {(draft.input_type === 'file' || draft.input_type === 'address') && (
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" checked={!!draft.allow_multiple} onChange={(e) => setDraft((q) => ({ ...q, allow_multiple: e.target.checked ? 1 : 0 }))} /> Allow multiple
              </label>
            )}
          </div>
          <div className="sm:col-span-2 flex items-center gap-3 border-t border-white/10 pt-3">
            <button type="button" disabled={busy} onClick={save} className={`${btnPrimary} text-xs`}>{busy ? 'Saving…' : 'Save question'}</button>
            <button type="button" onClick={remove} className="text-xs font-medium text-rose-300 hover:underline">Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionsEditor({ serviceKey, onChanged }: { serviceKey: string; onChanged: () => void }) {
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newQ, setNewQ] = useState({ ...EMPTY_NEW })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ questions: QuestionRow[] }>(`/admin/services/${serviceKey}/questions`)
      setQuestions(res.questions)
    } finally {
      setLoading(false)
    }
  }, [serviceKey])

  useEffect(() => { load() }, [load])

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault()
    if (!validOptionsJson(newQ.options)) {
      toast.error('Options must be a valid JSON array.')
      return
    }
    setBusy(true)
    try {
      await api.post(`/admin/services/${serviceKey}/questions`, {
        ...newQ,
        options: newQ.options || null,
        step_order: Number(newQ.step_order) || 1,
        sort_order: Number(newQ.sort_order) || 0,
        condition_question_key: newQ.condition_question_key || null,
        condition_operator: newQ.condition_question_key ? newQ.condition_operator : null,
        condition_value: newQ.condition_question_key ? newQ.condition_value : null,
      })
      toast.success('Question added.')
      setNewQ({ ...EMPTY_NEW })
      setShowNew(false)
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add question.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="px-5 py-4 text-sm text-slate-400">Loading questions…</p>

  return (
    <div className="border-t border-white/10 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-relaxed text-slate-500">Question type, required state, step grouping, options, uploads, and simple show-if rules all drive the live client wizard.</p>
        <button type="button" className={`${btnOutline} text-xs`} onClick={() => setShowNew((v) => !v)}>{showNew ? 'Cancel' : '+ Add question'}</button>
      </div>

      {showNew && (
        <form onSubmit={addQuestion} className="mb-4 grid gap-3 rounded-xl border border-gold/20 bg-gold/[0.035] p-4 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Question key</span>
            <input required className={inputCls} placeholder="e.g. current_processor" value={newQ.question_key} onChange={(e) => setNewQ((q) => ({ ...q, question_key: e.target.value }))} />
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Input type</span>
            <select className={inputCls} value={newQ.input_type} onChange={(e) => setNewQ((q) => ({ ...q, input_type: e.target.value }))}>
              {INPUT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Question</span>
            <input required className={inputCls} value={newQ.label} onChange={(e) => setNewQ((q) => ({ ...q, label: e.target.value }))} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Help text</span>
            <input className={inputCls} value={newQ.help_text} onChange={(e) => setNewQ((q) => ({ ...q, help_text: e.target.value }))} />
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step label</span>
            <input className={inputCls} value={newQ.step_label} onChange={(e) => setNewQ((q) => ({ ...q, step_label: e.target.value }))} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Step #</span>
              <input className={inputCls} type="number" min="1" value={newQ.step_order} onChange={(e) => setNewQ((q) => ({ ...q, step_order: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order</span>
              <input className={inputCls} type="number" value={newQ.sort_order} onChange={(e) => setNewQ((q) => ({ ...q, sort_order: e.target.value }))} />
            </label>
          </div>
          {(newQ.input_type === 'single_select' || newQ.input_type === 'multi_select') && (
            <label className="sm:col-span-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Options JSON</span>
              <textarea className={`${inputCls} min-h-[80px] font-mono text-xs`} placeholder={'["Yes","No"]'} value={newQ.options} onChange={(e) => setNewQ((q) => ({ ...q, options: e.target.value }))} />
            </label>
          )}
          <div className="sm:col-span-2 grid gap-2 sm:grid-cols-3">
            <select className={inputCls} value={newQ.condition_question_key} onChange={(e) => setNewQ((q) => ({ ...q, condition_question_key: e.target.value }))}>
              <option value="">Always show</option>
              {questions.map((q) => <option key={q.id} value={q.question_key}>{q.label}</option>)}
            </select>
            <select className={inputCls} disabled={!newQ.condition_question_key} value={newQ.condition_operator} onChange={(e) => setNewQ((q) => ({ ...q, condition_operator: e.target.value }))}>
              {CONDITION_OPERATORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input className={inputCls} disabled={!newQ.condition_question_key || ['truthy', 'falsy'].includes(newQ.condition_operator)} placeholder="Condition value" value={newQ.condition_value} onChange={(e) => setNewQ((q) => ({ ...q, condition_value: e.target.value }))} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={newQ.required} onChange={(e) => setNewQ((q) => ({ ...q, required: e.target.checked }))} /> Required</label>
            {(newQ.input_type === 'file' || newQ.input_type === 'address') && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={newQ.allow_multiple} onChange={(e) => setNewQ((q) => ({ ...q, allow_multiple: e.target.checked }))} /> Allow multiple</label>}
          </div>
          <div className="sm:col-span-2"><button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Adding…' : 'Add question'}</button></div>
        </form>
      )}

      {questions.length === 0 ? <EmptyState label="No intake questions yet." /> : (
        <div className="space-y-2">{questions.map((q) => <QuestionCard key={q.id} question={q} questions={questions} onChanged={load} />)}</div>
      )}
    </div>
  )
}

export default function ServiceCatalogSettings() {
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingService, setEditingService] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ key: '', name: '', description: '', category: '', intake_intro: '', estimated_minutes: '3', sort_order: '0' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ services: ServiceRow[] }>('/admin/services')
      setServices(res.services)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true)
      else toast.error(err instanceof ApiError ? err.message : 'Could not load the Service Catalog.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function createService(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/admin/services', {
        ...form,
        estimated_minutes: Math.max(1, Number(form.estimated_minutes) || 3),
        sort_order: Number(form.sort_order) || 0,
      })
      toast.success('Service created.')
      setForm({ key: '', name: '', description: '', category: '', intake_intro: '', estimated_minutes: '3', sort_order: '0' })
      setShowNew(false)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create service.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(service: ServiceRow) {
    try {
      await api.patch(`/admin/services/${service.key}`, { active: !service.active })
      toast.success(service.active ? 'Service retired.' : 'Service restored.')
      await load()
    } catch { toast.error('Could not update service.') }
  }

  if (forbidden) return <NoAccess label="the Service Catalog" />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-slate-400">
          This is the source of truth for client intake. Questions, steps, choice options, required fields, file uploads, and show-if rules update the live multi-step wizard without a code change.
        </p>
        <button className={btnOutline} onClick={() => setShowNew((v) => !v)}>{showNew ? 'Cancel' : '+ New service'}</button>
      </div>

      {showNew && (
        <Panel className="mb-5">
          <form onSubmit={createService} className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Key</span><input required className={inputCls} placeholder="e.g. vendor_transition" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} /></label>
            <label><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</span><input required className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Description</span><input className={inputCls} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Wizard intro</span><textarea className={`${inputCls} min-h-[72px]`} value={form.intake_intro} onChange={(e) => setForm((f) => ({ ...f, intake_intro: e.target.value }))} /></label>
            <label><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Category</span><input className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Minutes</span><input className={inputCls} type="number" min="1" value={form.estimated_minutes} onChange={(e) => setForm((f) => ({ ...f, estimated_minutes: e.target.value }))} /></label>
              <label><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Order</span><input className={inputCls} type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} /></label>
            </div>
            <div className="sm:col-span-2"><button disabled={busy} className={btnPrimary}>{busy ? 'Creating…' : 'Create service'}</button></div>
          </form>
        </Panel>
      )}

      {loading ? <p className="text-sm text-slate-400">Loading…</p> : services.length === 0 ? <Panel><EmptyState label="No services yet." /></Panel> : (
        <div className="space-y-3">
          {services.map((service) => (
            <Panel key={service.key} className="!p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{service.name}</p>
                    <Tag tone={service.active ? 'green' : 'red'}>{service.active ? 'active' : 'retired'}</Tag>
                    {service.category && <Tag>{service.category}</Tag>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{service.key} · {service.question_count} questions · about {service.estimated_minutes || 3} min</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => setEditingService((v) => v === service.key ? null : service.key)} className="text-xs font-medium text-slate-300 hover:text-white">{editingService === service.key ? 'Close details' : 'Service details'}</button>
                  <button onClick={() => setExpanded((v) => v === service.key ? null : service.key)} className="text-xs font-medium text-gold hover:underline">{expanded === service.key ? 'Hide questions' : 'Manage questions'}</button>
                  <button onClick={() => toggleActive(service)} className="text-xs font-medium text-slate-500 hover:text-rose-300">{service.active ? 'Retire' : 'Restore'}</button>
                </div>
              </div>
              {editingService === service.key && <ServiceEditor service={service} onChanged={load} />}
              {expanded === service.key && <QuestionsEditor serviceKey={service.key} onChanged={load} />}
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
