import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Card, PageHeader } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'

interface Profile {
  business_name: string | null
  entity_type: string | null
  ein: string | null
  state: string | null
}

export default function BusinessProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState<Profile>({ business_name: '', entity_type: '', ein: '', state: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    api
      .get<{ profile: Profile | null }>('/portal/profile')
      .then((r) => {
        setProfile(r.profile)
        if (r.profile) setForm(r.profile)
        setLoadError(false)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

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

  return (
    <div>
      <PageHeader eyebrow="Your business" title="Business Profile" subtitle="Kept on file for every service you enroll in — update anytime." />
      <Card className="max-w-2xl">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : loadError ? (
          <div className="space-y-2 text-sm text-slate-400">
            <p>Couldn't load your business profile.</p>
            <button onClick={() => window.location.reload()} className="text-gold hover:underline">
              Try again
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Business name</span>
              <input
                className={inputCls}
                value={form.business_name ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Entity type</span>
              <input
                className={inputCls}
                placeholder="LLC, S-Corp, Sole Prop…"
                value={form.entity_type ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, entity_type: e.target.value }))}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">State</span>
              <input className={inputCls} value={form.state ?? ''} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">EIN</span>
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
          <p className="mt-4 text-xs text-slate-500">No business profile on file yet — fill in what you can above.</p>
        )}
      </Card>
    </div>
  )
}
