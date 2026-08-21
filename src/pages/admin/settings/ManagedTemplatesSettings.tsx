import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Bold, Copy, ExternalLink, Eye, Heading, Italic, Link2, List, ListOrdered, Pencil, Plus, Save, Send, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../../lib/api'
import { Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline, btnSecondary } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'
import { VariableInsertMenu } from '../../../components/admin/VariableInsertMenu'
import { RichText } from '../../../components/RichText'
import { buildEmailPreviewVars, resolveTemplateTokens, extractTemplateTokens, isKnownEmailVariable } from '../../../../shared/emailVariables'
import type { ManagedAgreementSection } from '../../../../shared/providerAgreementContent'

interface TemplateSummary {
  id: string
  template_key: string
  name: string
  category: string
  description: string | null
  status: string
  draft_version: number
  published_version: number | null
  published_version_label: string | null
  has_unpublished_changes: number
  updated_at: string
}

interface TemplateVersion {
  id: string
  version_number: number
  version_label: string
  change_note: string | null
  published_at: string | null
  created_at: string
}

interface TemplateDetail extends TemplateSummary {
  sections: ManagedAgreementSection[]
}

const CATEGORIES = [
  ['agreement', 'Agreement'],
  ['document', 'Document'],
  ['email', 'Email'],
  ['operations', 'Operations'],
] as const

const blankCreate = { name: '', category: 'document', description: '', template_key: '' }

const fmtBtn = 'grid h-7 w-7 place-items-center rounded text-slate-400 transition hover:bg-white/[.06] hover:text-white'

function usedBy(template: { template_key: string; category: string }) {
  if (template.template_key === 'provider-agreement') return 'Provider application and public agreement page'
  if (template.category === 'agreement') return 'Published agreements and acceptance records'
  if (template.category === 'email') return 'Reusable HQ email copy'
  if (template.category === 'operations') return 'Internal operating copy'
  return 'HQ document library'
}

export default function ManagedTemplatesSettings() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<TemplateDetail | null>(null)
  const [versions, setVersions] = useState<TemplateVersion[]>([])
  const [versionLabel, setVersionLabel] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState(blankCreate)
  const [showArchived, setShowArchived] = useState(false)
  const [preview, setPreview] = useState(false)
  const bodyRefs = useRef<Record<number, HTMLTextAreaElement | null>>({})
  const previewVars = useMemo(() => buildEmailPreviewVars(), [])

  // Every {{token}} referenced across the draft that the registry does not know
  // about. These resolve to empty strings on send, so we warn rather than block.
  const unknownTokens = useMemo(() => {
    if (!draft) return [] as string[]
    const seen = new Set<string>()
    for (const section of draft.sections) {
      for (const token of [...extractTemplateTokens(section.title), ...extractTemplateTokens(section.body)]) {
        if (!isKnownEmailVariable(token)) seen.add(token)
      }
    }
    return Array.from(seen)
  }, [draft])

  // Insert a {{token}} at the caret in a section body (or append if the field is
  // not focused), then restore focus and caret just past the inserted token.
  function insertToken(index: number, token: string) {
    editBody(index, (body, start) => ({ value: body.slice(0, start) + token + body.slice(start), caret: start + token.length }))
  }

  // Shared caret-aware edit for a section body: transform receives the current
  // body and selection and returns the new body plus where to leave the caret.
  // The formatting toolbar and variable insert both go through this so the
  // markdown-subset stays the single stored format (no HTML is ever stored).
  function editBody(index: number, transform: (body: string, start: number, end: number) => { value: string; caret: number }) {
    const el = bodyRefs.current[index]
    setDraft((current) => {
      if (!current) return current
      const body = current.sections[index].body
      const focused = el && document.activeElement === el
      const start = focused ? el.selectionStart : body.length
      const end = focused ? el.selectionEnd : body.length
      const { value, caret } = transform(body, start, end)
      requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(caret, caret) } })
      return { ...current, sections: current.sections.map((section, position) => position === index ? { ...section, body: value } : section) }
    })
  }
  // Wrap the selection with an inline marker (**bold**, *italic*).
  function wrapSelection(index: number, marker: string) {
    editBody(index, (body, start, end) => {
      const sel = body.slice(start, end) || 'text'
      return { value: body.slice(0, start) + marker + sel + marker + body.slice(end), caret: start + marker.length + sel.length + marker.length }
    })
  }
  // Prefix the line the caret sits on (headings, list items).
  function prefixLine(index: number, prefix: string) {
    editBody(index, (body, start) => {
      const lineStart = body.lastIndexOf('\n', start - 1) + 1
      return { value: body.slice(0, lineStart) + prefix + body.slice(lineStart), caret: start + prefix.length }
    })
  }
  function insertLink(index: number) {
    const url = window.prompt('Link URL (https://…)')?.trim()
    if (!url) return
    editBody(index, (body, start, end) => {
      const sel = body.slice(start, end) || 'link text'
      const md = `[${sel}](${url})`
      return { value: body.slice(0, start) + md + body.slice(end), caret: start + md.length }
    })
  }

  const loadList = useCallback(async () => {
    const result = await api.get<{ templates: TemplateSummary[] }>('/admin/managed-templates')
    setTemplates(result.templates || [])
    setSelectedId((current) => {
      const next = result.templates || []
      if (current && next.some((item) => item.id === current)) return current
      return next.find((item) => item.status !== 'archived')?.id || next[0]?.id || ''
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    loadList().catch((error) => toast.error(error instanceof ApiError ? error.message : 'Could not load templates.')).finally(() => setLoading(false))
  }, [loadList])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    api.get<{ template: TemplateDetail; versions: TemplateVersion[] }>(`/admin/managed-templates/${selectedId}`)
      .then(({ template, versions: nextVersions }) => {
        setDraft(template)
        setVersions(nextVersions || [])
        setVersionLabel(new Date().toISOString().slice(0, 10))
        setChangeNote('')
      })
      .catch((error) => toast.error(error instanceof ApiError ? error.message : 'Could not open this template.'))
      .finally(() => setLoading(false))
  }, [selectedId])

  function updateSection(index: number, key: 'title' | 'body', value: string) {
    setDraft((current) => current ? { ...current, sections: current.sections.map((section, position) => position === index ? { ...section, [key]: value } : section) } : current)
  }
  function moveSection(index: number, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current
      const next = index + direction
      if (next < 0 || next >= current.sections.length) return current
      const sections = [...current.sections]
      ;[sections[index], sections[next]] = [sections[next], sections[index]]
      return { ...current, sections }
    })
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const result = await api.post<{ id: string }>('/admin/managed-templates', createForm)
      toast.success('Template created as a draft.')
      setCreating(false)
      setCreateForm(blankCreate)
      await loadList()
      setSelectedId(result.id)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not create this template.')
    } finally {
      setBusy(false)
    }
  }

  async function saveDraft() {
    if (!draft) return
    setBusy(true)
    try {
      await api.patch(`/admin/managed-templates/${draft.id}/draft`, {
        name: draft.name, description: draft.description, sections: draft.sections, version_label: versionLabel, change_note: changeNote,
      })
      toast.success('Draft saved as a new version. The live copy has not changed.')
      await loadList()
      const result = await api.get<{ template: TemplateDetail; versions: TemplateVersion[] }>(`/admin/managed-templates/${draft.id}`)
      setDraft(result.template)
      setVersions(result.versions || [])
    } catch (error) { toast.error(error instanceof ApiError ? error.message : 'Could not save this draft.') }
    finally { setBusy(false) }
  }

  async function publish() {
    if (!draft || !confirm('Publish the current saved version? Anyone who uses this template will see this copy.')) return
    setBusy(true)
    try {
      const result = await api.post<{ version_label: string }>(`/admin/managed-templates/${draft.id}/publish`, {})
      toast.success(`Published version ${result.version_label}.`)
      await loadList()
      const next = await api.get<{ template: TemplateDetail; versions: TemplateVersion[] }>(`/admin/managed-templates/${draft.id}`)
      setDraft(next.template)
      setVersions(next.versions || [])
    } catch (error) { toast.error(error instanceof ApiError ? error.message : 'Could not publish this template.') }
    finally { setBusy(false) }
  }

  async function duplicate() {
    if (!draft) return
    setBusy(true)
    try {
      const result = await api.post<{ id: string }>(`/admin/managed-templates/${draft.id}/duplicate`, { name: `${draft.name} copy` })
      toast.success('Duplicated as a new draft.')
      await loadList()
      setSelectedId(result.id)
    } catch (error) { toast.error(error instanceof ApiError ? error.message : 'Could not duplicate this template.') }
    finally { setBusy(false) }
  }

  async function setStatus(status: 'draft' | 'published' | 'archived') {
    if (!draft) return
    setBusy(true)
    try {
      await api.patch(`/admin/managed-templates/${draft.id}`, { status })
      toast.success(status === 'archived' ? 'Template archived.' : 'Template restored.')
      await loadList()
    } catch (error) { toast.error(error instanceof ApiError ? error.message : 'Could not update this template.') }
    finally { setBusy(false) }
  }

  const visible = templates.filter((template) => showArchived || template.status !== 'archived')

  if (loading && !draft && !templates.length) return <Panel><p className="text-sm text-slate-400">Loading editable templates…</p></Panel>

  return <div className="grid gap-5 2xl:grid-cols-[320px_minmax(0,1fr)]">
    <Panel className="self-start">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">Template library</p>
          <h3 className="mt-2 text-lg font-extrabold text-white">Master copy</h3>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setCreating((value) => !value)}><Plus size={14} />{creating ? 'Close' : 'New'}</button>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-400">Save a draft first. Publishing is what changes the live copy people see and accept.</p>
      {creating && (
        <form onSubmit={createTemplate} className="mt-4 space-y-3 rounded-xl border border-gold/20 bg-gold/[.04] p-3">
          <label><span className="mb-1 block text-[11px] font-bold text-slate-400">Name</span><input className={inputCls} required value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="Client services agreement" /></label>
          <label><span className="mb-1 block text-[11px] font-bold text-slate-400">Category</span>
            <select className={inputCls} value={createForm.category} onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label><span className="mb-1 block text-[11px] font-bold text-slate-400">Key <span className="font-normal text-slate-600">(optional)</span></span><input className={inputCls} value={createForm.template_key} onChange={(e) => setCreateForm((f) => ({ ...f, template_key: e.target.value }))} placeholder="auto from name" /></label>
          <label><span className="mb-1 block text-[11px] font-bold text-slate-400">Purpose</span><textarea className={inputCls} rows={2} value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} /></label>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</button>
        </form>
      )}
      <button type="button" className="mt-3 text-[11px] font-semibold text-slate-500 hover:text-gold" onClick={() => setShowArchived((value) => !value)}>{showArchived ? 'Hide archived' : 'Show archived'}</button>
      <div className="mt-3 space-y-2">
        {visible.length ? visible.map((template) => (
          <button type="button" key={template.id} onClick={() => setSelectedId(template.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === template.id ? 'border-gold/30 bg-gold/[.06]' : 'border-white/[.08] hover:border-white/20'}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-white">{template.name}</p>
              <Tag tone={template.status === 'published' ? 'green' : template.status === 'archived' ? 'red' : 'gold'}>{template.status}</Tag>
            </div>
            <p className="mt-1 text-[11px] capitalize text-slate-500">{template.category} · {template.template_key}</p>
            <p className="mt-1 text-xs text-slate-500">Live: {template.published_version_label || 'Not yet'}{template.has_unpublished_changes ? ' · Draft changes' : ''}</p>
          </button>
        )) : <EmptyState label="No templates in this view." />}
      </div>
    </Panel>

    {draft && <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">Editable master</p>
          <h3 className="mt-2 text-xl font-extrabold text-white">{draft.name}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Used by: {usedBy(draft)}. Edits stay private until you publish a saved version.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnOutline} onClick={() => setPreview((v) => !v)}>{preview ? <><Pencil size={14} /> Edit</> : <><Eye size={14} /> Preview</>}</button>
          {draft.template_key === 'provider-agreement' && <a className={btnOutline} href="/provider-agreement" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Public copy</a>}
          <button type="button" className={btnOutline} disabled={busy} onClick={() => void duplicate()}><Copy size={14} /> Duplicate</button>
          {draft.template_key !== 'provider-agreement' && (
            draft.status === 'archived'
              ? <button type="button" className={btnOutline} disabled={busy} onClick={() => void setStatus('draft')}>Restore</button>
              : <button type="button" className={btnOutline} disabled={busy} onClick={() => void setStatus('archived')}>Archive</button>
          )}
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label><span className="mb-1 block text-xs font-bold text-slate-400">Template name</span><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label><span className="mb-1 block text-xs font-bold text-slate-400">Version label</span><input className={inputCls} value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="YYYY-MM-DD" /></label>
        <label><span className="mb-1 block text-xs font-bold text-slate-400">Key</span><input className={inputCls} value={draft.template_key} readOnly /></label>
        <label><span className="mb-1 block text-xs font-bold text-slate-400">Category</span><input className={`${inputCls} capitalize`} value={draft.category} readOnly /></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-400">Purpose</span><textarea className={inputCls} rows={3} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      </div>

      {versions.length > 0 && (
        <div className="mt-6 rounded-xl border border-white/[.08] bg-white/[.018] p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Version history</p>
          <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
            {versions.map((version) => (
              <div key={version.id} className="flex items-start justify-between gap-3 text-xs text-slate-400">
                <p><span className="font-semibold text-slate-200">v{version.version_number}</span> {version.version_label}{version.change_note ? ` · ${version.change_note}` : ''}</p>
                <span className="shrink-0">{version.published_at ? `Live ${new Date(version.published_at).toLocaleDateString()}` : new Date(version.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {unknownTokens.length > 0 && !preview && (
        <div className="mt-6 rounded-lg border border-amber-400/25 bg-amber-400/[.05] px-4 py-3 text-xs leading-5 text-amber-200/90">
          Unrecognized variables: {unknownTokens.map((t) => `{{${t}}}`).join(', ')}. These render as empty text when the template is used. Pick from the Insert variable menu to avoid typos.
        </div>
      )}

      {preview ? (
        <div className="mt-7 rounded-xl border border-white/[.08] bg-navy-950/40 p-5">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[.14em] text-gold/70">Preview with sample values</p>
          <div className="space-y-6">{draft.sections.map((section, index) => (
            <section key={`${section.id}-${index}`}>
              <h4 className="mb-2 font-display text-base font-bold text-white">{resolveTemplateTokens(section.title, previewVars) || `Section ${index + 1}`}</h4>
              <RichText source={resolveTemplateTokens(section.body, previewVars)} className="text-sm leading-7 text-slate-300" />
            </section>
          ))}</div>
        </div>
      ) : (
        <div className="mt-7 space-y-4">{draft.sections.map((section, index) => (
          <section key={`${section.id}-${index}`} className="rounded-xl border border-white/[.08] bg-white/[.018] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Section {String(index + 1).padStart(2, '0')}</p>
              <div className="flex gap-1">
                <button type="button" aria-label="Move section up" className={btnSecondary} onClick={() => moveSection(index, -1)} disabled={index === 0}><ArrowUp size={13} /></button>
                <button type="button" aria-label="Move section down" className={btnSecondary} onClick={() => moveSection(index, 1)} disabled={index === draft.sections.length - 1}><ArrowDown size={13} /></button>
                <button type="button" aria-label="Delete section" className={btnSecondary} onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, position) => position !== index) })}><Trash2 size={13} /></button>
              </div>
            </div>
            <input className={`${inputCls} mt-3 font-bold`} value={section.title} onChange={(e) => updateSection(index, 'title', e.target.value)} placeholder="Section title" />
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[.02] p-0.5">
                <button type="button" title="Bold" aria-label="Bold" className={fmtBtn} onClick={() => wrapSelection(index, '**')}><Bold size={13} /></button>
                <button type="button" title="Italic" aria-label="Italic" className={fmtBtn} onClick={() => wrapSelection(index, '*')}><Italic size={13} /></button>
                <button type="button" title="Heading" aria-label="Heading" className={fmtBtn} onClick={() => prefixLine(index, '# ')}><Heading size={13} /></button>
                <button type="button" title="Bullet list" aria-label="Bullet list" className={fmtBtn} onClick={() => prefixLine(index, '- ')}><List size={13} /></button>
                <button type="button" title="Numbered list" aria-label="Numbered list" className={fmtBtn} onClick={() => prefixLine(index, '1. ')}><ListOrdered size={13} /></button>
                <button type="button" title="Link" aria-label="Link" className={fmtBtn} onClick={() => insertLink(index)}><Link2 size={13} /></button>
              </div>
              <VariableInsertMenu onInsert={(token) => insertToken(index, token)} className="ml-auto" />
            </div>
            <textarea ref={(el) => { bodyRefs.current[index] = el }} className={`${inputCls} mt-1.5 min-h-44 font-mono text-xs leading-6`} value={section.body} onChange={(e) => updateSection(index, 'body', e.target.value)} placeholder="Section text. Use the toolbar to format, or type **bold**, *italic*, # Heading, - bullet." />
            <p className="mt-2 text-[11px] text-slate-600">Formatting: **bold**, *italic*, # Heading, ## Subheading, - bullet, 1. numbered, [label](https://link). Blank line separates paragraphs. Insert {'{{variables}}'} from the menu; they fill in when the template is used.</p>
          </section>
        ))}</div>
      )}
      {!preview && <button type="button" className={`${btnOutline} mt-4`} onClick={() => setDraft({ ...draft, sections: [...draft.sections, { id: `section-${draft.sections.length + 1}`, title: '', body: '' }] })}><Plus size={14} /> Add section</button>}
      <label className="mt-6 block"><span className="mb-1 block text-xs font-bold text-slate-400">Internal change note</span><input className={inputCls} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="What changed and why?" /></label>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void saveDraft()}><Save size={14} /> {busy ? 'Saving…' : 'Save new draft version'}</button>
        <button type="button" className={btnOutline} disabled={busy} onClick={() => void publish()}><Send size={14} /> Publish saved version</button>
      </div>
    </Panel>}
  </div>
}
