import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, Plus, Save, Send, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../../lib/api'
import { Panel, EmptyState, Tag, inputCls, btnPrimary, btnOutline, btnSecondary } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'
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
interface TemplateDetail extends TemplateSummary { sections: ManagedAgreementSection[] }

export default function ManagedTemplatesSettings() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<TemplateDetail | null>(null)
  const [versionLabel, setVersionLabel] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadList = useCallback(async () => {
    const result = await api.get<{ templates: TemplateSummary[] }>('/admin/managed-templates')
    setTemplates(result.templates || [])
    setSelectedId((current) => current || result.templates?.[0]?.id || '')
  }, [])

  useEffect(() => {
    setLoading(true)
    loadList().catch((error) => toast.error(error instanceof ApiError ? error.message : 'Could not load templates.')).finally(() => setLoading(false))
  }, [loadList])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    api.get<{ template: TemplateDetail }>(`/admin/managed-templates/${selectedId}`)
      .then(({ template }) => {
        setDraft(template)
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

  async function saveDraft() {
    if (!draft) return
    setBusy(true)
    try {
      await api.patch(`/admin/managed-templates/${draft.id}/draft`, {
        name: draft.name, description: draft.description, sections: draft.sections, version_label: versionLabel, change_note: changeNote,
      })
      toast.success('Draft saved as a new version. The public agreement has not changed.')
      await loadList()
      const result = await api.get<{ template: TemplateDetail }>(`/admin/managed-templates/${draft.id}`)
      setDraft(result.template)
    } catch (error) { toast.error(error instanceof ApiError ? error.message : 'Could not save this draft.') }
    finally { setBusy(false) }
  }

  async function publish() {
    if (!draft || !confirm('Publish the current saved version? New provider applicants will be asked to accept it.')) return
    setBusy(true)
    try {
      const result = await api.post<{ version_label: string }>(`/admin/managed-templates/${draft.id}/publish`, {})
      toast.success(`Published version ${result.version_label}.`)
      await loadList()
    } catch (error) { toast.error(error instanceof ApiError ? error.message : 'Could not publish this template.') }
    finally { setBusy(false) }
  }

  if (loading && !draft) return <Panel><p className="text-sm text-slate-400">Loading editable templates…</p></Panel>
  if (!templates.length) return <Panel><EmptyState label="No managed templates are available." /></Panel>

  return <div className="grid gap-5 2xl:grid-cols-[320px_minmax(0,1fr)]">
    <Panel className="self-start">
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">Template Library</p>
      <h3 className="mt-2 text-lg font-extrabold text-white">One source of truth</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">Save changes as a draft first. Publishing makes that exact version the one shown and accepted in the provider application.</p>
      <div className="mt-5 space-y-2">{templates.map((template) => <button type="button" key={template.id} onClick={() => setSelectedId(template.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === template.id ? 'border-gold/30 bg-gold/[.06]' : 'border-white/[.08] hover:border-white/20'}`}><div className="flex items-start justify-between gap-2"><p className="text-sm font-bold text-white">{template.name}</p><Tag tone={template.status === 'published' ? 'green' : 'gold'}>{template.status}</Tag></div><p className="mt-2 text-xs text-slate-500">Published: {template.published_version_label || 'Not yet'}{template.has_unpublished_changes ? ' · Draft changes' : ''}</p></button>)}</div>
    </Panel>

    {draft && <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">Editable Master Template</p><h3 className="mt-2 text-xl font-extrabold text-white">{draft.name}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Edits remain private until you explicitly publish a saved version. Prior acceptances keep their recorded version.</p></div>
        {draft.template_key === 'provider-agreement' && <a className={btnOutline} href="/provider-agreement" target="_blank" rel="noreferrer"><ExternalLink size={14}/> View Public Copy</a>}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold text-slate-400">Template Name</span><input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}/></label><label><span className="mb-1 block text-xs font-bold text-slate-400">Version Label</span><input className={inputCls} value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="YYYY-MM-DD"/></label><label className="sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-400">Purpose</span><textarea className={inputCls} rows={3} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })}/></label></div>

      <div className="mt-7 space-y-4">{draft.sections.map((section, index) => <section key={`${section.id}-${index}`} className="rounded-xl border border-white/[.08] bg-white/[.018] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[.14em] text-slate-500">Section {String(index + 1).padStart(2, '0')}</p><div className="flex gap-1"><button type="button" aria-label="Move section up" className={btnSecondary} onClick={() => moveSection(index, -1)} disabled={index === 0}><ArrowUp size={13}/></button><button type="button" aria-label="Move section down" className={btnSecondary} onClick={() => moveSection(index, 1)} disabled={index === draft.sections.length - 1}><ArrowDown size={13}/></button><button type="button" aria-label="Delete section" className={btnSecondary} onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, position) => position !== index) })}><Trash2 size={13}/></button></div></div><input className={`${inputCls} mt-3 font-bold`} value={section.title} onChange={(e) => updateSection(index, 'title', e.target.value)} placeholder="Section Title"/><textarea className={`${inputCls} mt-3 min-h-44 font-mono text-xs leading-6`} value={section.body} onChange={(e) => updateSection(index, 'body', e.target.value)} placeholder="Section text. Start list items with - "/><p className="mt-2 text-[11px] text-slate-600">Separate paragraphs with a blank line. Start every item in a list with “- ”.</p></section>)}</div>
      <button type="button" className={`${btnOutline} mt-4`} onClick={() => setDraft({ ...draft, sections: [...draft.sections, { id: `section-${draft.sections.length + 1}`, title: '', body: '' }] })}><Plus size={14}/> Add Section</button>
      <label className="mt-6 block"><span className="mb-1 block text-xs font-bold text-slate-400">Internal Change Note</span><input className={inputCls} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="What changed and why?"/></label>
      <div className="mt-5 flex flex-wrap gap-2"><button type="button" className={btnPrimary} disabled={busy} onClick={() => void saveDraft()}><Save size={14}/> {busy ? 'Saving…' : 'Save New Draft Version'}</button><button type="button" className={btnOutline} disabled={busy} onClick={() => void publish()}><Send size={14}/> Publish Saved Version</button></div>
    </Panel>}
  </div>
}
