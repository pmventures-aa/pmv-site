import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader, SkeletonRows } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { Avatar } from '../../components/kit/Avatar'
import { toast } from '../../components/kit/toast'

interface Profile {
  business_name: string | null
  entity_type: string | null
  ein: string | null
  state: string | null
}
interface Contact {
  full_name: string | null
  phone: string | null
  email: string | null
}

export default function BusinessProfile() {
  const { user, refresh } = useAuth()
  const p = useAppPath()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [form, setForm] = useState<Profile>({ business_name: '', entity_type: '', ein: '', state: '' })
  const [contactForm, setContactForm] = useState({ full_name: '', phone: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [savingContact, setSavingContact] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    api
      .get<{ profile: Profile | null; contact: Contact | null }>('/portal/profile')
      .then((r) => {
        setProfile(r.profile)
        if (r.profile) setForm(r.profile)
        setContact(r.contact)
        setContactForm({ full_name: r.contact?.full_name ?? user?.full_name ?? '', phone: r.contact?.phone ?? '' })
        setLoadError(false)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [user?.full_name])

  async function onSaveContact(e: React.FormEvent) {
    e.preventDefault()
    setSavingContact(true)
    try {
      await api.patch('/portal/profile', { full_name: contactForm.full_name.trim(), phone: contactForm.phone.trim() })
      toast.success('Contact information saved.')
      await refresh()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save your contact information.')
    } finally {
      setSavingContact(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.patch('/portal/profile', form)
      toast.success('Business profile saved.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save your profile.')
    } finally {
      setBusy(false)
    }
  }

  const email = contact?.email ?? user?.email ?? ''
  const emailChangeHref = `${p('support')}?category=general&subject=${encodeURIComponent('Email change request')}&details=${encodeURIComponent(`I'd like to change the email on my Pinnacle account from ${email} to: `)}`

  const label = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400'

  return (
    <div>
      <PageHeader eyebrow="Your profile" title="Account" subtitle="Your contact details and business information, on file for every service." />

      {user && (
        <Card className="mb-3 max-w-2xl">
          <div className="flex items-center gap-3">
            <Avatar userId={user.id} name={user.full_name} size={56} editable uploadPath="/me/avatar" />
            <div>
              <h2 className="text-sm font-semibold text-white">Profile photo</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Visible to you and to Pinnacle staff. PNG, JPEG, or WebP, up to 3MB.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Contact information */}
      <Card className="mb-3 max-w-2xl">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Contact information</h2>
        {loading ? (
          <div className="mt-4"><SkeletonRows rows={3} cols={2} /></div>
        ) : (
          <form onSubmit={onSaveContact} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={label}>Full name</span>
              <input className={inputCls} value={contactForm.full_name} onChange={(e) => setContactForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Your name" />
            </label>
            <label>
              <span className={label}>Phone</span>
              <input className={inputCls} type="tel" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" />
            </label>
            <div>
              <span className={label}>Email</span>
              <div className="flex min-h-[42px] items-center rounded-md border border-white/10 bg-white/[.02] px-3 text-sm text-slate-300">
                <Mail size={14} className="mr-2 shrink-0 text-slate-500" />
                <span className="truncate">{email || 'Not on file'}</span>
              </div>
              <Link to={emailChangeHref} className="mt-1.5 inline-block text-xs font-semibold text-gold hover:underline">
                Request an email change
              </Link>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Your email is your sign-in, so Pinnacle updates it for you after a quick verification.</p>
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={savingContact} className="btn-gold disabled:opacity-60">
                {savingContact ? 'Saving…' : 'Save contact info'}
              </button>
            </div>
          </form>
        )}
      </Card>

      {/* Business profile */}
      <Card className="max-w-2xl">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">Business profile</h2>
        {loading ? (
          <div className="mt-4"><SkeletonRows rows={5} cols={2} /></div>
        ) : loadError ? (
          <div className="mt-4 space-y-2 text-sm text-slate-400">
            <p>Couldn't load your business profile.</p>
            <button onClick={() => window.location.reload()} className="text-gold hover:underline">Try again</button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={label}>Business name</span>
              <input className={inputCls} value={form.business_name ?? ''} onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))} />
            </label>
            <label>
              <span className={label}>Entity type</span>
              <input className={inputCls} placeholder="LLC, S-Corp, Sole Prop…" value={form.entity_type ?? ''} onChange={(e) => setForm((f) => ({ ...f, entity_type: e.target.value }))} />
            </label>
            <label>
              <span className={label}>State</span>
              <input className={inputCls} value={form.state ?? ''} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            </label>
            <label>
              <span className={label}>EIN</span>
              <input className={inputCls} value={form.ein ?? ''} onChange={(e) => setForm((f) => ({ ...f, ein: e.target.value }))} />
            </label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
        {!loading && !loadError && !profile && (
          <p className="mt-4 text-xs text-slate-500">No business profile on file yet: fill in what you can above.</p>
        )}
      </Card>
    </div>
  )
}
