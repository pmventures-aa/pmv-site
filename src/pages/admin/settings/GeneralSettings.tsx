import { useEffect, useState } from 'react'
import { api, ApiError } from '../../../lib/api'
import { Panel, NoAccess, inputCls, btnPrimary } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'
import { ResendWebhookPanel } from './ResendWebhookPanel'
import { ProcessorReviewLoginPanel } from './ProcessorReviewLoginPanel'
import { INVITE_TTL_PRESETS, INVITE_TTL_SETTING_KEY, parseInviteTtlHours } from '../../../../shared/inviteTtl'

const FIRM_FIELDS: { key: string; label: string; type?: string; help?: string }[] = [
  { key: 'firm_notify_email', label: 'Notification email', type: 'email', help: 'Fallback recipient when a client has no assigned representative.' },
  { key: 'business_name', label: 'Business name' },
  { key: 'business_phone', label: 'Business phone', type: 'tel' },
  { key: 'business_address', label: 'Business address', help: 'Also used as the physical postal address in marketing email footers. Marketing sends are blocked if this is blank.' },
  { key: 'business_hours', label: 'Business hours', help: 'e.g. “Mon–Fri, 9am–5pm ET”' },
]

const APPLICATION_FIELDS: { key: string; label: string; help: string; multiline?: boolean }[] = [
  { key: 'service_application_contact_line', label: 'Application PDF contact line', help: 'Appears in the footer of every generated Application for Services PDF.' },
  { key: 'service_application_disclaimer', label: 'Standard service application disclaimer', multiline: true, help: 'Central compliance copy shown at review and printed on every generated application PDF.' },
  { key: 'eviction_scope_disclaimer', label: 'Eviction scope / attorney coordination disclaimer', multiline: true, help: 'This is the exact place to finalize PMV’s eviction scope language. It appears in the Property Management eviction module and flagged PDFs.' },
]

export default function GeneralSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    api.get<{ settings: { key: string; value: string }[] }>('/admin/settings')
      .then((r) => {
        const map: Record<string, string> = {}
        for (const row of r.settings) map[row.key] = row.value
        setSettings(map)
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true)
        else toast.error(err instanceof ApiError ? err.message : 'Could not load settings.')
      })
      .finally(() => setLoading(false))
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

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>
  if (forbidden) return <NoAccess label="General settings" />

  return (
    <form onSubmit={save} className="space-y-5">
      <Panel>
        <h3 className="mb-4 text-sm font-semibold text-white">Firm details</h3>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          {FIRM_FIELDS.map((f) => (
            <label key={f.key} className={f.key === 'business_address' || f.key === 'business_hours' ? 'sm:col-span-2' : ''}>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{f.label}</span>
              <input className={inputCls} type={f.type ?? 'text'} value={settings[f.key] ?? ''} onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))} />
              {f.help && <span className="mt-1 block text-xs leading-relaxed text-slate-500">{f.help}</span>}
            </label>
          ))}
        </div>
      </Panel>

      <Panel>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Communications &amp; marketing</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Marketing emails automatically use the Business address above and append a PMV unsubscribe footer. The unsubscribe page suppresses that email address across lead and client CRM records.
          </p>
        </div>
        <label className="block max-w-3xl">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Public site URL for unsubscribe links</span>
          <input className={inputCls} type="url" placeholder="https://www.pinnaclemanagementventures.com" value={settings.marketing_public_base_url ?? ''} onChange={(e) => setSettings((s) => ({ ...s, marketing_public_base_url: e.target.value }))} />
          <span className="mt-1 block text-xs leading-relaxed text-slate-500">Optional. If blank, Pinnacle uses https://www.pinnaclemanagementventures.com.</span>
        </label>
      </Panel>

      <ProcessorReviewLoginPanel />

      <ResendWebhookPanel />

      <Panel>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Invitation links</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">Company-wide lifetime for private invite tokens (clients, staff, providers, and trusted contacts). New invites and resent links use this setting. Existing unused links keep their original expiry until they are resent.</p>
        </div>
        <label className="block max-w-sm">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Link expires after</span>
          <select
            className={inputCls}
            value={INVITE_TTL_PRESETS.some((item) => item.hours === parseInviteTtlHours(settings[INVITE_TTL_SETTING_KEY])) ? String(parseInviteTtlHours(settings[INVITE_TTL_SETTING_KEY])) : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'custom') return
              setSettings((s) => ({ ...s, [INVITE_TTL_SETTING_KEY]: e.target.value }))
            }}
          >
            {INVITE_TTL_PRESETS.map((item) => <option key={item.hours} value={item.hours}>{item.label}</option>)}
            <option value="custom">Custom hours</option>
          </select>
        </label>
        <label className="mt-3 block max-w-sm">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Hours</span>
          <input
            className={inputCls}
            type="number"
            min={1}
            max={8760}
            value={settings[INVITE_TTL_SETTING_KEY] ?? '24'}
            onChange={(e) => setSettings((s) => ({ ...s, [INVITE_TTL_SETTING_KEY]: e.target.value }))}
          />
        </label>
      </Panel>

      <Panel>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Application &amp; compliance copy</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">These are central template values. Change them here once and future intake screens and generated Application for Services PDFs use the new copy.</p>
        </div>
        <div className="max-w-3xl space-y-4">
          {APPLICATION_FIELDS.map((f) => (
            <label key={f.key}>
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{f.label}</span>
              {f.multiline ? <textarea className={`${inputCls} min-h-[120px] resize-y`} value={settings[f.key] ?? ''} onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))} /> : <input className={inputCls} value={settings[f.key] ?? ''} onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))} />}
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">{f.help}</span>
            </label>
          ))}
        </div>
      </Panel>

      <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
  )
}
