import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, EmptyState, PageHeader, StatusBadge, SkeletonRows } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'

interface Section { key: string; label: string }
type Mode = 'none' | 'view' | 'edit'
interface TrustedContact {
  id: string
  email: string
  full_name: string | null
  relationship_label: string | null
  status: string
  permissions: Record<string, Mode>
  invite_status: string | null
  expires_at: string | null
  accepted_at: string | null
  revoked_at: string | null
  invited_at: string | null
}

const EDITABLE_SECTIONS = new Set(['business_profile', 'tasks'])

function statusTone(status: string | null): 'green' | 'red' | 'gold' | 'slate' {
  if (status === 'accepted' || status === 'active') return 'green'
  if (status === 'expired' || status === 'revoked') return 'red'
  if (status === 'pending') return 'gold'
  return 'slate'
}

function statusLabel(contact: TrustedContact) {
  if (contact.status === 'active') return 'Active'
  if (contact.status === 'revoked') return 'Revoked'
  if (contact.invite_status === 'expired') return 'Expired'
  return 'Invitation pending'
}

export default function TrustedContacts() {
  const [contacts, setContacts] = useState<TrustedContact[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [editing, setEditing] = useState<TrustedContact | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', relationship_label: '', permissions: {} as Record<string, Mode> })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<{ trusted_contacts: TrustedContact[]; sections: Section[] }>('/portal/trusted-contacts')
      setContacts(r.trusted_contacts)
      setSections(r.sections)
    } catch {
      toast.error('Could not load Trusted Contacts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const activeCount = useMemo(() => contacts.filter((c) => c.status === 'active').length, [contacts])
  const pendingCount = useMemo(() => contacts.filter((c) => c.status === 'invited' && c.invite_status === 'pending').length, [contacts])

  function startInvite() {
    const permissions: Record<string, Mode> = {}
    for (const s of sections) permissions[s.key] = 'none'
    setForm({ full_name: '', email: '', relationship_label: '', permissions })
    setEditing(null)
    setShowInvite(true)
  }

  function startEdit(c: TrustedContact) {
    setEditing(c)
    setForm({ full_name: c.full_name || '', email: c.email, relationship_label: c.relationship_label || '', permissions: { ...c.permissions } })
    setShowInvite(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (editing) {
        await api.patch(`/portal/trusted-contacts/${editing.id}`, { relationship_label: form.relationship_label, permissions: form.permissions })
        toast.success('Trusted Contact access updated.')
      } else {
        const r = await api.post<{ email_status: string; error?: string }>('/portal/trusted-contacts/invite', form)
        if (r.email_status === 'sent') toast.success(`Invitation sent to ${form.email}.`)
        else toast.error(`Invitation created, but email delivery failed. ${r.error || ''}`)
      }
      setShowInvite(false)
      setEditing(null)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save this Trusted Contact.')
    } finally {
      setBusy(false)
    }
  }

  async function resend(c: TrustedContact) {
    try {
      await api.post(`/portal/trusted-contacts/${c.id}/resend`, {})
      toast.success(`A new 24-hour invitation was sent to ${c.email}.`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not resend this invitation.')
    }
  }

  async function revoke(c: TrustedContact) {
    try {
      await api.post(`/portal/trusted-contacts/${c.id}/revoke`, {})
      toast.success('Trusted Contact access revoked.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not revoke access.')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Delegated account access"
        title="Trusted Contacts"
        subtitle="Invite someone and choose which sections they can view or edit."
        action={<button className="btn-gold" onClick={startInvite}>+ Invite trusted contact</button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:max-w-md">
        <Card className="!p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Active</p><p className="mt-0.5 text-xl font-semibold text-white">{activeCount}</p></Card>
        <Card className="!p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">Pending</p><p className="mt-0.5 text-xl font-semibold text-white">{pendingCount}</p></Card>
      </div>

      {showInvite && (
        <Card className="mb-7 border-gold/20">
          <form onSubmit={save}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="eyebrow">{editing ? 'Edit delegated access' : 'New invitation'}</p><h2 className="mt-1 text-lg font-semibold text-white">{editing ? editing.full_name || editing.email : 'Invite a Trusted Contact'}</h2></div>
              <button type="button" className="text-sm text-slate-400 hover:text-white" onClick={() => { setShowInvite(false); setEditing(null) }}>Cancel</button>
            </div>
            {!editing && (
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <label><span className="mb-1 block text-xs text-slate-400">Full name</span><input className={inputCls} required value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} /></label>
                <label><span className="mb-1 block text-xs text-slate-400">Email</span><input className={inputCls} type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
                <label><span className="mb-1 block text-xs text-slate-400">Relationship</span><input className={inputCls} placeholder="Bookkeeper, spouse, assistant" value={form.relationship_label} onChange={(e) => setForm((f) => ({ ...f, relationship_label: e.target.value }))} /></label>
              </div>
            )}
            {editing && <label className="mt-5 block max-w-sm"><span className="mb-1 block text-xs text-slate-400">Relationship</span><input className={inputCls} value={form.relationship_label} onChange={(e) => setForm((f) => ({ ...f, relationship_label: e.target.value }))} /></label>}

            <div className="mt-4 overflow-hidden rounded-md border border-white/10">
              <div className="grid grid-cols-[1fr_82px_82px] border-b border-white/10 bg-white/[0.025] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span>Portal section</span><span className="text-center">View</span><span className="text-center">Edit</span></div>
              {sections.map((s) => {
                const mode = form.permissions[s.key] || 'none'
                const editable = EDITABLE_SECTIONS.has(s.key)
                return (
                  <div key={s.key} className="grid grid-cols-[1fr_82px_82px] items-center border-b border-white/5 px-4 py-3 last:border-0">
                    <span className="text-sm text-slate-200">{s.label}</span>
                    <label className="grid place-items-center"><input type="checkbox" aria-label={`View ${s.label}`} checked={mode === 'view' || mode === 'edit'} onChange={(e) => setForm((f) => ({ ...f, permissions: { ...f.permissions, [s.key]: e.target.checked ? 'view' : 'none' } }))} /></label>
                    {editable ? <label className="grid place-items-center"><input type="checkbox" aria-label={`Edit ${s.label}`} checked={mode === 'edit'} onChange={(e) => setForm((f) => ({ ...f, permissions: { ...f.permissions, [s.key]: e.target.checked ? 'edit' : (mode === 'edit' ? 'view' : mode) } }))} /></label> : <span className="text-center text-xs text-slate-600" title="This section is currently delegated view-only">View only</span>}
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">Edit access currently supports Business Profile and Tasks. Other sections are delegated view-only until a scoped write workflow is added. Trusted Contacts never receive internal staff notes, audit information, banking details, or sections you do not explicitly grant.</p>
            <button type="submit" disabled={busy} className="btn-gold mt-5 disabled:opacity-60">{busy ? 'Saving…' : editing ? 'Save access' : 'Send 24-hour invitation'}</button>
          </form>
        </Card>
      )}

      {loading ? <Card><SkeletonRows rows={3} cols={3} /></Card> : contacts.length === 0 ? (
        <Card><EmptyState label="No Trusted Contacts yet. Invite someone only when you want them to have delegated access to your account." /></Card>
      ) : (
        <div className="space-y-3">
          {contacts.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{c.full_name || c.email}</h3><StatusBadge tone={statusTone(c.status === 'active' ? 'accepted' : c.invite_status)}>{statusLabel(c)}</StatusBadge></div>
                  <p className="mt-1 text-sm text-slate-400">{c.email}{c.relationship_label ? ` · ${c.relationship_label}` : ''}</p>
                  {c.status === 'invited' && c.expires_at && <p className="mt-1 text-xs text-slate-500">Invitation {c.invite_status === 'expired' ? 'expired' : `expires ${new Date(c.expires_at).toLocaleString()}`}.</p>}
                </div>
                {c.status !== 'revoked' && <div className="flex flex-wrap gap-2"><button className="btn-outline !px-3 !py-2 text-xs" onClick={() => startEdit(c)}>Edit access</button>{c.status === 'invited' && <button className="btn-outline !px-3 !py-2 text-xs" onClick={() => resend(c)}>Resend</button>}<button className="rounded-md border border-rose-400/20 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-400/10" onClick={() => revoke(c)}>Revoke</button></div>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">{sections.filter((s) => c.permissions[s.key] && c.permissions[s.key] !== 'none').map((s) => <span key={s.key} className="rounded-sm border border-white/10 bg-white/[0.025] px-2 py-0.5 text-[11px] text-slate-300">{s.label}: <strong className="font-medium text-gold">{c.permissions[s.key]}</strong></span>)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
