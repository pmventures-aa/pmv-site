import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Card, PageHeader } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'

export default function SettingsAdmin() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
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
    setSaved(false)
    try {
      await api.patch('/admin/settings', settings)
      setSaved(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Firm settings" title="Settings" subtitle="Global configuration for the Pinnacle console." />
      <Card>
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
            <button type="submit" disabled={busy} className="btn-gold disabled:opacity-60">
              {busy ? 'Saving…' : 'Save settings'}
            </button>
            {saved && <span className="text-sm text-emerald-300">Saved.</span>}
          </div>
        </form>
      </Card>
    </div>
  )
}
