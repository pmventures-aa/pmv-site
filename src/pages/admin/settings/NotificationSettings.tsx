import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { Panel, btnPrimary } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'

export default function NotificationSettings() {
  const [kinds, setKinds] = useState<string[]>([])
  const [muted, setMuted] = useState<Set<string>>(new Set())
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<{ kinds: string[]; muted_kinds: string[]; email_enabled: boolean; sound_enabled: boolean }>('/admin/notification-prefs')
      .then((r) => {
        setKinds(r.kinds)
        setMuted(new Set(r.muted_kinds))
        setEmailEnabled(r.email_enabled)
        setSoundEnabled(r.sound_enabled)
      })
      .catch(() => toast.error('Could not load notification preferences.'))
      .finally(() => setLoading(false))
  }, [])

  function toggle(kind: string) {
    setMuted((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  async function save() {
    setBusy(true)
    try {
      await api.patch('/admin/notification-prefs', {
        muted_kinds: Array.from(muted),
        email_enabled: emailEnabled,
        sound_enabled: soundEnabled,
      })
      toast.success('Notification preferences saved.')
    } catch {
      toast.error('Could not save preferences.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>

  return (
    <Panel className="max-w-2xl">
      <p className="mb-4 text-sm leading-relaxed text-slate-400">
        Choose which events show up in your activity feed and bell. Muted events are still logged for audit purposes. New service applications use the <strong className="font-semibold text-slate-200">service application submitted</strong> event below.
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
        Play a sound when a new notification arrives
      </label>
      <label className="mb-4 flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
        Also email me for events I haven't muted (requires firm-wide email delivery)
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {kinds.map((kind) => (
          <label key={kind} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${kind === 'service_application_submitted' ? 'border border-gold/20 bg-gold/5 text-slate-200' : 'text-slate-300'}`}>
            <input type="checkbox" checked={!muted.has(kind)} onChange={() => toggle(kind)} />
            {kind.replace(/_/g, ' ')}
          </label>
        ))}
      </div>
      <button onClick={save} disabled={busy} className={`${btnPrimary} mt-5`}>{busy ? 'Saving…' : 'Save preferences'}</button>
    </Panel>
  )
}
