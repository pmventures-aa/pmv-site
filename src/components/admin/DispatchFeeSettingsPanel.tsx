import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { Panel, inputCls, btnPrimary } from './ui'
import { toast } from '../kit/toast'
import type { VendorFeeSettings } from '../../../shared/vendorFeeAdjustment'

export function DispatchFeeSettingsPanel({ className = '' }: { className?: string }) {
  const [settings, setSettings] = useState<VendorFeeSettings | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ settings: VendorFeeSettings }>('/admin/dispatch-fee-settings')
      setSettings(res.settings)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load dispatch fee settings.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      const res = await api.patch<{ settings: VendorFeeSettings }>('/admin/dispatch-fee-settings', {
        enabled: settings.enabled,
        max_adjustment_cents: settings.maxAdjustmentCents,
        down_only: settings.downOnly,
      })
      setSettings(res.settings)
      toast.success('Dispatch fee settings saved.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save dispatch fee settings.')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return null

  return (
    <Panel className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Locally adjusted provider fees</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Like Snapdocs, Pinnacle can nudge the offered provider payout up or down (max ${settings.maxAdjustmentCents / 100}) based on recent payouts near the job ZIP.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label>
          <span className="mb-1 block text-xs text-slate-500">Max adjustment</span>
          <select
            className={inputCls}
            value={String(settings.maxAdjustmentCents)}
            onChange={(e) => setSettings({ ...settings, maxAdjustmentCents: Number(e.target.value) })}
          >
            <option value="500">$5</option>
            <option value="1000">$10</option>
            <option value="1500">$15</option>
            <option value="2000">$20</option>
          </select>
        </label>
        <label className="flex items-end gap-2 rounded-xl border border-white/10 p-3 text-sm text-slate-300 sm:col-span-2">
          <input
            type="checkbox"
            checked={settings.downOnly}
            onChange={(e) => setSettings({ ...settings, downOnly: e.target.checked })}
          />
          Only reduce fees when local payouts are lower (never auto-increase)
        </label>
      </div>
      <button type="button" className={`${btnPrimary} mt-4`} disabled={saving} onClick={() => void save()}>
        Save fee settings
      </button>
    </Panel>
  )
}
