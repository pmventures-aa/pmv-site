import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { PageIntro, Panel, inputCls, btnPrimary } from '../../components/admin/ui'
import { toast } from '../../components/kit/toast'

export default function SettingsAdmin() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get<{ settings: { key: string; value: string }[] }>('/admin/settings').then((r) => {
      const map: Record<string, string> = {}
      for (const row of r.settings) map[row.key] = row.value
      setSettings(map)
    })
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.patch('/admin/settings', settings)
      toast.success('Settings saved.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save settings.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageIntro kicker="Firm settings" title="Settings" subtitle="Global configuration for the Pinnacle console." />
      <Panel>
        <form onSubmit={save} className="max-w-md space-y-4">
          <label>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Notification email</span>
            <input
              className={inputCls}
              type="email"
              value={settings.firm_notify_email ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, firm_notify_email: e.target.value }))}
            />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  )
}
