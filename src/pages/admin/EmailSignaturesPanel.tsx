import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { toast } from '../../components/kit/toast'
import { useAuth } from '../../lib/auth'
import {
  liveLetterheadHtml,
  rosterLabel,
  signatureLabel,
  type EmailSignature,
  type SignatureRosterPerson,
} from '../../lib/emailSignatures'
import { SignaturePreview } from './SignatureLetterhead'

export function EmailSignaturesPanel({
  signatures,
  roster = [],
  canManageRoster = false,
  templates,
  onClose,
  onChanged,
}: {
  signatures: EmailSignature[]
  roster?: SignatureRosterPerson[]
  canManageRoster?: boolean
  templates?: { company: string; support: string; personal: string }
  onClose: () => void
  onChanged: () => void
}) {
  const { user } = useAuth()
  const [selectedId, setSelectedId] = useState(signatures[0]?.id || roster[0]?.signature_id || roster[0]?.user_id || '')
  const selected = signatures.find((s) => s.id === selectedId) || null
  const selectedPerson = roster.find((row) => row.signature_id === selectedId || row.user_id === selectedId) || null
  const [name, setName] = useState(selected?.name || '')
  const [html, setHtml] = useState(selected?.html || '')
  const [personName, setPersonName] = useState('')
  const [personTitle, setPersonTitle] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [personPhone, setPersonPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [showHtml, setShowHtml] = useState(false)

  const branded = selected?.kind === 'personal' || selected?.kind === 'support' || selected?.kind === 'company' || !!selectedPerson

  useEffect(() => {
    const row = signatures.find((s) => s.id === selectedId)
    const person = roster.find((item) => item.signature_id === selectedId || item.user_id === selectedId)
    if (row) {
      setName(row.name)
      setHtml(row.html)
      setPersonName(row.person_name || row.name || '')
      setPersonTitle(row.person_title || '')
      setPersonEmail(row.person_email || '')
      setPersonPhone(row.person_phone || '')
      return
    }
    if (person) {
      setName(person.full_name || person.email)
      setHtml(person.html || '')
      setPersonName(person.full_name || '')
      setPersonTitle(person.title || '')
      setPersonEmail(person.email)
      setPersonPhone(person.phone || '')
    }
  }, [selectedId, signatures, roster])

  const previewHtml = useMemo(() => {
    if (!branded) return html
    const kind = selected?.kind || 'personal'
    if (kind === 'company') return liveLetterheadHtml('company')
    if (kind === 'support') return liveLetterheadHtml('support', {
      name: personName,
      title: personTitle,
      email: personEmail,
      phone: personPhone,
    })
    return liveLetterheadHtml('personal', {
      name: personName,
      title: personTitle,
      email: personEmail,
      phone: personPhone,
    })
  }, [branded, html, selected?.kind, personName, personTitle, personEmail, personPhone])

  const firm = signatures.filter((s) => !s.owner_user_id)
  const mine = signatures.filter((s) => s.owner_user_id === user?.id)
  const staff = roster.filter((row) => row.party_type !== 'vendor' && row.user_id !== user?.id)
  const vendors = roster.filter((row) => row.party_type === 'vendor')

  async function save() {
    setBusy(true)
    try {
      if (selected?.kind === 'personal' || selectedPerson) {
        const ownerId = selected?.owner_user_id || selectedPerson?.user_id
        if (!ownerId) throw new Error('missing owner')
        if (selected && selected.kind !== 'custom') {
          await api.patch(`/admin/email-signatures/${selected.id}`, {
            name: (personName || name).trim(),
            person: { name: personName, title: personTitle, email: personEmail, phone: personPhone },
          })
        } else {
          await api.post(`/admin/email-signatures/roster/${ownerId}`, {
            person: { name: personName, title: personTitle, email: personEmail, phone: personPhone },
          })
        }
      } else if (selected) {
        await api.patch(`/admin/email-signatures/${selected.id}`, { name: name.trim(), html: branded ? previewHtml : html })
      }
      toast.success('Signature saved')
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save signature')
    } finally { setBusy(false) }
  }

  async function createCustom() {
    setBusy(true)
    try {
      const r = await api.post<{ signature: EmailSignature }>('/admin/email-signatures', {
        name: 'Custom signature',
        kind: 'custom',
        html: templates?.company || selected?.html || '<p></p>',
      })
      toast.success('Signature added')
      setSelectedId(r.signature.id)
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add signature')
    } finally { setBusy(false) }
  }

  function restoreLetterhead() {
    if (selected?.kind === 'support' || selected?.kind === 'personal' || selectedPerson) {
      setHtml(previewHtml)
      return
    }
    if (!selected || !templates) return
    setHtml(templates.company)
  }

  async function remove() {
    if (!selected) return
    setBusy(true)
    try {
      await api.del(`/admin/email-signatures/${selected.id}`)
      toast.success('Signature removed')
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove signature')
    } finally { setBusy(false) }
  }

  const fieldCls = 'h-10 w-full rounded-md border border-[#ddd6c8] bg-white px-3 font-serif text-[15px] text-[#0a1728] outline-none focus:border-[#c9a227]'

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f4ee] text-[#0a1728]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#e4dfd4] bg-white px-4 py-2.5">
        <p className="min-w-0 flex-1 font-serif text-[17px] text-[#0a1728]">Signatures</p>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-[#ddd6c8] bg-white px-3 py-1.5 text-sm font-medium text-[#3d4a5c] hover:bg-[#f4f1ea]" onClick={() => void createCustom()}>
          <Plus size={14}/>New
        </button>
        <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-[#7b8492] hover:bg-black/[.05]" onClick={onClose} aria-label="Close signatures">
          <X size={16} />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b border-[#e4dfd4] bg-white lg:border-b-0 lg:border-r">
          <NavGroup label="Firm">
            {firm.map((s) => (
              <NavItem key={s.id} active={selectedId === s.id} title={signatureLabel(s, user?.id)} hint="Firm letterhead" onClick={() => setSelectedId(s.id)} />
            ))}
          </NavGroup>
          <NavGroup label="Mine">
            {mine.map((s) => (
              <NavItem key={s.id} active={selectedId === s.id} title={signatureLabel(s, user?.id)} hint={s.kind === 'custom' ? 'Custom' : 'Your branded signature'} onClick={() => setSelectedId(s.id)} />
            ))}
          </NavGroup>
          {canManageRoster && staff.length > 0 && (
            <NavGroup label="Staff">
              {staff.map((row) => (
                <NavItem
                  key={row.user_id}
                  active={selectedId === (row.signature_id || row.user_id)}
                  title={rosterLabel(row)}
                  hint={row.title || row.email}
                  onClick={() => setSelectedId(row.signature_id || row.user_id)}
                />
              ))}
            </NavGroup>
          )}
          {canManageRoster && vendors.length > 0 && (
            <NavGroup label="Vendors">
              {vendors.map((row) => (
                <NavItem
                  key={row.user_id}
                  active={selectedId === (row.signature_id || row.user_id)}
                  title={rosterLabel(row)}
                  hint={row.title || row.email}
                  onClick={() => setSelectedId(row.signature_id || row.user_id)}
                />
              ))}
            </NavGroup>
          )}
        </aside>
        <section className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
          {!selected && !selectedPerson ? (
            <p className="text-sm text-[#5b6573]">No signatures yet.</p>
          ) : (
            <>
              {branded && selected?.kind !== 'company' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7b8492]">Name
                    <input className={`${fieldCls} mt-1.5`} value={personName} onChange={(e) => setPersonName(e.target.value)} />
                  </label>
                  <label className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7b8492]">Title
                    <input className={`${fieldCls} mt-1.5`} value={personTitle} onChange={(e) => setPersonTitle(e.target.value)} placeholder="Principal, Field vendor…" />
                  </label>
                  <label className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7b8492]">Email
                    <input className={`${fieldCls} mt-1.5`} value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} />
                  </label>
                  <label className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7b8492]">Phone
                    <input className={`${fieldCls} mt-1.5`} value={personPhone} onChange={(e) => setPersonPhone(e.target.value)} />
                  </label>
                </div>
              ) : (
                <input
                  className={fieldCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Signature name"
                />
              )}
              <div className="rounded-md border border-[#e4dfd4] bg-white p-6">
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-[.16em] text-[#9a7838]">Letterhead as sent</p>
                <SignaturePreview
                  signature={selected || {
                    id: selectedPerson?.user_id || 'roster',
                    name: personName || selectedPerson?.email || 'Signature',
                    slug: null,
                    kind: 'personal',
                    html: previewHtml,
                    owner_user_id: selectedPerson?.user_id || null,
                    is_default: 0,
                    sort_order: 30,
                  }}
                  html={previewHtml}
                />
                <p className="mt-4 max-w-[36rem] text-[11px] leading-[16px] text-[#8b939e]">
                  The crest travels inside the email. Name, title, and contact lines are text on the Pinnacle letterhead.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="inline-flex items-center gap-2 rounded-md bg-[#c9a227] px-3 py-1.5 text-sm font-semibold text-[#07111f] disabled:opacity-50" disabled={busy || !(personName || name).trim()} onClick={() => void save()}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
                {templates && (
                  <button type="button" className="inline-flex items-center gap-2 rounded-md border border-[#ddd6c8] bg-white px-3 py-1.5 text-sm font-medium text-[#3d4a5c]" disabled={busy} onClick={restoreLetterhead}>
                    <RotateCcw size={14} />Restore letterhead
                  </button>
                )}
                {selected?.kind === 'custom' && (
                  <button type="button" className="text-sm font-medium text-[#5b6573] hover:underline" onClick={() => setShowHtml((v) => !v)}>
                    {showHtml ? 'Hide HTML' : 'Advanced HTML'}
                  </button>
                )}
                {selected && selected.kind !== 'personal' && (
                  <button type="button" className="ml-auto inline-flex items-center gap-2 text-sm font-medium text-[#9a4a3c]" disabled={busy} onClick={() => void remove()}>
                    <Trash2 size={14} />Delete
                  </button>
                )}
              </div>
              {showHtml && selected?.kind === 'custom' && (
                <textarea
                  className="min-h-[180px] rounded-md border border-[#ddd6c8] bg-white p-3 font-mono text-xs text-[#0a1728] outline-none focus:border-[#c9a227]"
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-[#eeeae2] py-2">
      <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[.16em] text-[#9a7838]">{label}</p>
      {children}
    </div>
  )
}

function NavItem({
  active,
  title,
  hint,
  onClick,
}: {
  active: boolean
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-4 py-2.5 text-left ${active ? 'bg-[#f7f4ee]' : 'hover:bg-[#fbfaf6]'}`}
    >
      <p className="truncate font-serif text-[15px] text-[#0a1728]">{title}</p>
      <p className="mt-0.5 truncate text-[10px] uppercase tracking-[.14em] text-[#7b8492]">{hint}</p>
    </button>
  )
}
