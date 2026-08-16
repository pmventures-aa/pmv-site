import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, Copy, Loader2, Plus, RotateCcw, Save, Search, Send, Trash2, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { toast } from '../../components/kit/toast'
import { SessionWho } from '../../components/kit/WhoSection'
import { RichTextComposer } from '../../components/admin/RichTextComposer'
import { HQ_EMAIL_CATEGORY_LABEL, type HqEmailTemplate } from '../../lib/hqEmailTemplates'
import { LetterheadCrest } from '../../components/admin/LetterheadCrest'
import { FIRM_NAME, FIRM_TAGLINE } from '../../../shared/letterhead'
import { emailVariablesByCategory, isKnownEmailVariable, extractAllReferencedTokens } from '../../../shared/emailVariables'

const CATEGORY_ORDER = ['account', 'invite', 'billing', 'nurture', 'field', 'notification', 'custom'] as const

type Draft = {
  name: string
  description: string
  enabled: number
  wrap_letterhead: number
  subject: string
  preheader: string
  eyebrow: string
  title: string
  body_html: string
  cta_label: string
  cta_url_token: string
  security_note: string
}

function toDraft(row: HqEmailTemplate): Draft {
  return {
    name: row.name,
    description: row.description || '',
    enabled: row.enabled,
    wrap_letterhead: row.wrap_letterhead,
    subject: row.subject,
    preheader: row.preheader || '',
    eyebrow: row.eyebrow || '',
    title: row.title || '',
    body_html: row.body_html,
    cta_label: row.cta_label || '',
    cta_url_token: row.cta_url_token || 'action_url',
    security_note: row.security_note || '',
  }
}

export function EmailTemplatesPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [templates, setTemplates] = useState<HqEmailTemplate[]>([])
  const [sampleVars, setSampleVars] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState(searchParams.get('template') || '')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [mobileEditing, setMobileEditing] = useState(() => !!(searchParams.get('template') || searchParams.get('slug')))

  const selected = templates.find((row) => row.id === selectedId) || templates[0] || null

  const load = useCallback(async (preferId?: string) => {
    setLoading(true)
    try {
      const r = await api.get<{ templates: HqEmailTemplate[]; sample_vars: Record<string, string> }>('/admin/email-templates')
      setTemplates(r.templates)
      setSampleVars(r.sample_vars || {})
      const wanted = preferId || searchParams.get('template') || searchParams.get('slug')
      const match = r.templates.find((row) => row.id === wanted || row.slug === wanted) || r.templates[0]
      if (match) {
        setSelectedId(match.id)
        setDraft(toDraft(match))
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load email templates.')
    } finally {
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => { void load() }, [load])

  function select(row: HqEmailTemplate) {
    setSelectedId(row.id)
    setDraft(toDraft(row))
    setMobileEditing(true)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('tab', 'templates')
      next.set('template', row.id)
      next.delete('slug')
      return next
    }, { replace: true })
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = templates.filter((row) => {
      if (!q) return true
      return `${row.name} ${row.slug} ${row.description || ''} ${row.subject}`.toLowerCase().includes(q)
    })
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: HQ_EMAIL_CATEGORY_LABEL[category],
      rows: filtered.filter((row) => row.category === category),
    })).filter((group) => group.rows.length)
  }, [templates, query])

  async function save() {
    if (!selected || !draft) return
    setBusy(true)
    try {
      const r = await api.patch<{ template: HqEmailTemplate }>(`/admin/email-templates/${selected.id}`, draft)
      toast.success('Template saved. Outbound mail uses this copy immediately.')
      await load(r.template.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the template.')
    } finally { setBusy(false) }
  }

  async function createCustom() {
    setBusy(true)
    try {
      const r = await api.post<{ template: HqEmailTemplate }>('/admin/email-templates', {
        name: 'New letter',
        wrap_letterhead: 1,
        subject: 'Pinnacle update',
        body_html: '<p>Hi {{first_name}},</p><p>Write the letter here. Use the Color and Align tools just like compose.</p>',
      })
      toast.success('Template added')
      await load(r.template.id)
      setMobileEditing(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add a template.')
    } finally { setBusy(false) }
  }

  async function duplicate() {
    if (!selected) return
    setBusy(true)
    try {
      const r = await api.post<{ template: HqEmailTemplate }>(`/admin/email-templates/${selected.id}/duplicate`, {})
      toast.success('Copy created')
      await load(r.template.id)
      setMobileEditing(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not duplicate this template.')
    } finally { setBusy(false) }
  }

  async function restore() {
    if (!selected) return
    setBusy(true)
    try {
      const r = await api.post<{ template: HqEmailTemplate }>(`/admin/email-templates/${selected.id}/restore`, {})
      toast.success('Restored the Pinnacle default')
      await load(r.template.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not restore the default.')
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!selected || selected.is_system) return
    setBusy(true)
    try {
      await api.del(`/admin/email-templates/${selected.id}`)
      toast.success('Template removed')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove this template.')
    } finally { setBusy(false) }
  }

  async function sendTest() {
    if (!selected) return
    setBusy(true)
    try {
      await api.post(`/admin/email-templates/${selected.id}/test`, {})
      toast.success('Test letter sent to your HQ email')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send a test.')
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!selected || !draft || !showPreview) return
    const timer = window.setTimeout(() => {
      void api.post<{ preview: { html: string } }>(`/admin/email-templates/${selected.id}/preview`, { draft, vars: sampleVars })
        .then((r) => setPreviewHtml(r.preview.html))
        .catch(() => setPreviewHtml(''))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [draft, sampleVars, selected, showPreview])

  function insertToken(token: string) {
    if (!draft) return
    const chip = `{{${token}}}`
    setDraft({ ...draft, body_html: `${draft.body_html}${draft.body_html ? ' ' : ''}${chip}` })
  }

  const [pickerOpen, setPickerOpen] = useState(false)
  const referencedTokens = useMemo(() => {
    if (!draft) return [] as string[]
    return Array.from(new Set([
      ...extractAllReferencedTokens(draft.subject),
      ...extractAllReferencedTokens(draft.preheader),
      ...extractAllReferencedTokens(draft.title),
      ...extractAllReferencedTokens(draft.body_html),
      ...extractAllReferencedTokens(draft.cta_label),
      ...extractAllReferencedTokens(draft.security_note),
    ]))
  }, [draft])
  const unknownReferences = referencedTokens.filter((t) => !isKnownEmailVariable(t))
  const applicableSet = useMemo(() => new Set(selected?.tokens || []), [selected])

  async function uploadImage(file: File) {
    const res = await api.upload<{ ok: boolean; url: string }>('/admin/comms/images', file)
    return res.url
  }

  if (loading) return <p className="p-6 text-sm text-slate-400">Loading email templates…</p>
  if (!selected || !draft) {
    return (
      <div className="space-y-4">
        <SessionWho hint="Email templates are firm-wide. Saves apply to every letter HQ sends from this event." />
        <button type="button" onClick={() => void createCustom()} className="text-sm font-semibold text-gold">Add the first template</button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SessionWho hint="These letters go out as Pinnacle Management Ventures. Receiving stays on the Resend inbound domain." />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-white/10 lg:flex-row">
        <aside className={`${mobileEditing ? 'hidden' : 'flex'} min-h-0 w-full flex-1 shrink-0 flex-col border-b border-white/10 bg-navy-950 lg:flex lg:max-h-none lg:w-[280px] lg:flex-none lg:border-b-0 lg:border-r`}>
          <div className="flex items-center gap-2 border-b border-white/10 p-3">
            <input
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/[.04] px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-500"
              placeholder="Search templates"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" onClick={() => void createCustom()} className="grid h-8 w-8 place-items-center rounded-md bg-gold text-navy-950" title="New template">
              <Plus size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.category} className="border-b border-white/5 py-2">
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[.16em] text-gold/80">{group.label}</p>
                {group.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => select(row)}
                    className={`flex w-full flex-col px-3 py-2 text-left ${row.id === selected.id ? 'bg-white/[.06] text-white' : 'text-slate-400 hover:bg-white/[.03] hover:text-white'}`}
                  >
                    <span className="text-sm font-semibold">{row.name}</span>
                    <span className="mt-0.5 text-[11px] text-slate-500">{row.enabled ? 'Active' : 'Off'} · {row.is_system ? 'System' : 'Custom'}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <section className={`${mobileEditing ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col bg-[#f7f4ee] text-[#0a1728] lg:flex`}>
          <div className="flex shrink-0 items-center gap-2 border-b border-[#e4dfd4] bg-[#f7f4ee] px-3 py-2 lg:hidden">
            <button type="button" onClick={() => setMobileEditing(false)} className="inline-flex h-9 items-center gap-1 rounded-md border border-[#d8d0c1] bg-white px-2.5 text-sm font-semibold text-[#334155]">
              <ChevronLeft size={16} /> Templates
            </button>
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0a1728]">{selected.name}</p>
          </div>
          <div className="sticky top-0 z-10 flex shrink-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-[#e4dfd4] bg-white px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:static lg:flex-wrap lg:gap-2 lg:overflow-visible lg:px-4">
            <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex shrink-0 items-center gap-2 rounded-md bg-[#c9a227] px-4 py-1.5 text-sm font-semibold text-[#07111f] hover:bg-[#d9b84a] disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
            <button type="button" disabled={busy} onClick={() => void sendTest()} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[#5b6573] hover:bg-black/[.04]">
              <Send size={14} /> Test
            </button>
            <button type="button" disabled={busy} onClick={() => void duplicate()} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[#5b6573] hover:bg-black/[.04]">
              <Copy size={14} /> Duplicate
            </button>
            {selected.is_system ? (
              <button type="button" disabled={busy} onClick={() => void restore()} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[#5b6573] hover:bg-black/[.04]">
                <RotateCcw size={14} /> Restore default
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-[#9a3b32] hover:bg-black/[.04]">
                <Trash2 size={14} /> Delete
              </button>
            )}
            <label className="ml-auto flex shrink-0 items-center gap-2 text-[12px] font-semibold text-[#5b6573]">
              <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} />
              Live preview
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={`grid min-h-full ${showPreview ? 'xl:grid-cols-2' : ''}`}>
              <div>
                <div className="border-b border-[#eeeae2] bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <LetterheadCrest />
                    <div>
                      <p className="font-serif text-[15px] font-semibold text-[#0a1728]">{FIRM_NAME}</p>
                      <p className="text-[11px] tracking-[.04em] text-[#7b8492]">{FIRM_TAGLINE}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-[#5b6573]">{selected.description}</p>
                </div>
                <FieldRow label="Name">
                  <input className={fieldInput} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </FieldRow>
                <FieldRow label="Subject">
                  <input className={fieldInput} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                </FieldRow>
                <FieldRow label="Preheader">
                  <input className={fieldInput} value={draft.preheader} onChange={(e) => setDraft({ ...draft, preheader: e.target.value })} />
                </FieldRow>
                <FieldRow label="Eyebrow">
                  <input className={fieldInput} value={draft.eyebrow} onChange={(e) => setDraft({ ...draft, eyebrow: e.target.value })} />
                </FieldRow>
                <FieldRow label="Headline">
                  <input className={fieldInput} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </FieldRow>
                <FieldRow label="Button">
                  <input className={fieldInput} placeholder="Button label" value={draft.cta_label} onChange={(e) => setDraft({ ...draft, cta_label: e.target.value })} />
                </FieldRow>
                <div className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-[#eeeae2] bg-white px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-visible lg:px-4">
                  <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#c9a227] bg-[#c9a227] px-2.5 py-1 text-[11px] font-bold text-[#07111f] hover:bg-[#d9b84a]">
                    <Plus size={12}/> Insert Variable
                  </button>
                  <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#7b8492]">Common</span>
                  {(selected.tokens || []).map((token) => (
                    <button key={token} type="button" onClick={() => insertToken(token)} className="rounded-full border border-[#ddd6c8] bg-[#f7f4ee] px-2 py-0.5 font-mono text-[11px] text-[#0a1728] hover:border-[#c9a227]">
                      {`{{${token}}}`}
                    </button>
                  ))}
                  <label className="ml-auto flex shrink-0 items-center gap-2 text-[11px] font-semibold text-[#5b6573]">
                    <input type="checkbox" checked={!!draft.wrap_letterhead} onChange={(e) => setDraft({ ...draft, wrap_letterhead: e.target.checked ? 1 : 0 })} />
                    Pinnacle letterhead
                  </label>
                  <label className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-[#5b6573]">
                    <input type="checkbox" checked={!!draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked ? 1 : 0 })} />
                    Active
                  </label>
                </div>
                {unknownReferences.length > 0 && (
                  <div className="border-b border-[#eeeae2] bg-[#fff8e1] px-4 py-2 text-[11px] text-[#7a5b00]">
                    Unknown variables in this template: {unknownReferences.map((t) => `{{${t}}}`).join(', ')}. These render as empty strings when sent.
                  </div>
                )}
                <RichTextComposer
                  fill
                  surface="letter"
                  value={draft.body_html}
                  onChange={(html) => setDraft({ ...draft, body_html: html })}
                  onUploadImage={uploadImage}
                  placeholder="Write the letter. Color, align, fonts, and sizes work the same as compose and Document Hub."
                />
                <div className="border-t border-[#eeeae2] bg-white px-4 py-3">
                  <button type="button" className="text-[12px] font-semibold text-[#9a7838]" onClick={() => setShowAdvanced((v) => !v)}>
                    {showAdvanced ? 'Hide advanced fields' : 'Advanced fields'}
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 grid gap-3">
                      <label className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7b8492]">
                        Button URL token
                        <input className={`${fieldInput} mt-1 font-mono`} value={draft.cta_url_token} onChange={(e) => setDraft({ ...draft, cta_url_token: e.target.value })} />
                      </label>
                      <label className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7b8492]">
                        Security note
                        <textarea className={`${fieldInput} mt-1 min-h-20`} value={draft.security_note} onChange={(e) => setDraft({ ...draft, security_note: e.target.value })} />
                      </label>
                      <p className="font-mono text-[11px] text-[#7b8492]">slug: {selected.slug}</p>
                    </div>
                  )}
                </div>
              </div>
              {showPreview && (
                <div className="border-t border-[#eeeae2] bg-[#ece7dc] xl:border-l xl:border-t-0">
                  <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[#7b8492]">Preview with sample names</p>
                  <iframe title="Email preview" className="h-[50dvh] w-full bg-[#07111f] lg:h-[720px]" srcDoc={previewHtml || '<p style="padding:24px;font-family:sans-serif;color:#94a3b8">Saving a letter updates this preview.</p>'} />
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      {pickerOpen && (
        <VariablePicker
          onClose={() => setPickerOpen(false)}
          applicable={applicableSet}
          onInsert={(key) => { insertToken(key); setPickerOpen(false) }}
        />
      )}
    </div>
  )
}

function VariablePicker({ onClose, onInsert, applicable }: {
  onClose: () => void
  onInsert: (key: string) => void
  applicable: Set<string>
}) {
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    return emailVariablesByCategory().map((g) => ({
      ...g,
      items: g.items.filter((v) => !term
        || v.key.toLowerCase().includes(term)
        || v.label.toLowerCase().includes(term)
        || v.description.toLowerCase().includes(term)),
    })).filter((g) => g.items.length)
  }, [q])
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-navy-950/70 p-4" role="dialog" aria-modal="true" aria-label="Insert template variable">
      <div className="flex max-h-[86dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0d1220] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Search size={14} className="text-slate-400"/>
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            placeholder="Search variables (try 'invoice', 'property', 'client')"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close variable picker">
            <X size={16}/>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groups.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No variables match "{q}".</p>}
          {groups.map((group) => (
            <div key={group.category} className="border-b border-white/5">
              <p className="sticky top-0 z-10 border-b border-white/5 bg-[#0d1220]/95 px-4 py-2 text-[10px] font-bold uppercase tracking-[.16em] text-gold/80 backdrop-blur">{group.label}</p>
              <ul>
                {group.items.map((v) => {
                  const notApplicable = applicable.size > 0 && !applicable.has(v.key)
                  return (
                    <li key={v.key}>
                      <button
                        type="button"
                        onClick={() => onInsert(v.key)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/[.04]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-semibold text-white">{v.label}</span>
                            <span className="font-mono text-[11px] text-gold/80">{`{{${v.key}}}`}</span>
                            {notApplicable && <span className="rounded-full border border-amber-400/25 bg-amber-400/[.08] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">Not standard for this template</span>}
                          </div>
                          <p className="mt-0.5 text-[12px] leading-5 text-slate-400">{v.description}</p>
                          <p className="mt-1 text-[11px] text-slate-500">Example: {v.example}</p>
                        </div>
                        <Plus size={14} className="mt-1 shrink-0 text-gold"/>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 bg-black/20 px-4 py-2 text-[11px] text-slate-500">
          Variables render with real values when the email actually sends. Unknown or unresolved variables always render as an empty string so nothing like <span className="font-mono">{'{{token}}'}</span> leaks to a real recipient.
        </div>
      </div>
    </div>
  )
}

const fieldInput = 'min-h-9 w-full border-0 bg-transparent px-1 font-serif text-[15px] text-[#0a1728] outline-none placeholder:text-[#9aa3ae]'

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-stretch gap-1 border-b border-[#eeeae2] bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-0">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[.14em] text-[#7b8492] sm:w-[5.2rem] sm:text-[11px]">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
