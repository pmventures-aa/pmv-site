import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Webhook } from 'lucide-react'
import { api, ApiError } from '../../../lib/api'
import { useAppPath } from '../../../lib/basePath'
import { useCapabilities } from '../../../lib/capabilities'
import { Panel, btnPrimary, btnSecondary } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'

export type ResendWebhookStatus = {
  api_key_configured: boolean
  inbound_domain: string
  endpoint: string
  webhook: {
    id: string
    endpoint: string
    status: string
    events: string[]
    missing_events: string[]
  } | null
  listed_count: number
  env_signing_secret_configured: boolean
  stored_signing_secret_configured: boolean
  signing_secret_configured: boolean
  ready: boolean
  needs_create: boolean
  needs_update: boolean
  needs_secret: boolean
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2 text-xs leading-5">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      <span className={ok ? 'text-slate-300' : 'text-amber-100'}>{label}</span>
    </div>
  )
}

export function ResendWebhookPanel({ compact = false }: { compact?: boolean }) {
  const caps = useCapabilities()
  const p = useAppPath()
  const [status, setStatus] = useState<ResendWebhookStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    try {
      setStatus(await api.get<ResendWebhookStatus>('/admin/resend-webhook'))
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true)
      else toast.error(err instanceof ApiError ? err.message : 'Could not read Resend webhooks.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function setup() {
    setBusy(true)
    try {
      const result = await api.post<{ action: string; status: ResendWebhookStatus }>('/admin/resend-webhook')
      setStatus(result.status)
      if (result.action === 'created') toast.success('Resend webhook created. Replies and delivery events can now reach HQ.')
      else if (result.action === 'updated') toast.success('Resend webhook updated with the events HQ needs.')
      else if (result.action === 'recreated') toast.success('Resend webhook recreated and the signing secret was stored.')
      else toast.success('Resend webhook is already connected.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the Resend webhook.')
    } finally {
      setBusy(false)
    }
  }

  if (forbidden) return null
  if (loading && !status) {
    return compact ? null : <Panel><p className="text-sm text-slate-400">Checking Resend webhooks…</p></Panel>
  }
  if (!status) return null
  if (compact && status.ready) return null

  const canSetup = caps.can_manage_settings
  const actionLabel = status.needs_create
    ? 'Create webhook'
    : status.needs_update
      ? 'Update webhook'
      : status.needs_secret
        ? 'Reconnect webhook'
        : 'Refresh status'

  return (
    <Panel className={compact ? '!border-amber-400/25 !bg-amber-400/[.04]' : ''}>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[.03] text-gold">
          <Webhook size={16} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Resend webhooks</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
            Resend can show an empty Webhooks page until HQ creates one. This registers
            {' '}<code className="text-slate-300">{status.endpoint}</code>
            {' '}for delivery tracking and inbound replies (<code className="text-slate-300">email.received</code>).
            The signing secret is stored here so callbacks work without a Cloudflare Pages secret.
          </p>
        </div>
      </div>

      <div className="grid max-w-3xl gap-2 sm:grid-cols-2">
        <StatusDot ok={status.api_key_configured} label={status.api_key_configured ? 'Resend API key is configured' : 'Resend API key is missing in Cloudflare secrets'} />
        <StatusDot ok={Boolean(status.inbound_domain)} label={`Receiving domain: ${status.inbound_domain}`} />
        <StatusDot
          ok={!status.needs_create}
          label={status.webhook
            ? `Webhook ${status.webhook.status} in Resend (${status.listed_count} total)`
            : status.listed_count === 0
              ? 'Resend has no webhooks yet'
              : 'No webhook points at this site yet'}
        />
        <StatusDot
          ok={!status.needs_update && !status.needs_create}
          label={status.webhook?.missing_events.length
            ? `Missing events: ${status.webhook.missing_events.join(', ')}`
            : 'Delivery and inbound events are subscribed'}
        />
        <StatusDot
          ok={status.signing_secret_configured}
          label={status.stored_signing_secret_configured
            ? 'Signing secret stored in HQ'
            : status.env_signing_secret_configured
              ? 'Signing secret set in Cloudflare'
              : 'Signing secret is not stored yet'}
        />
        <StatusDot ok={status.ready} label={status.ready ? 'Ready for delivery tracking and threaded replies' : 'Not ready until the webhook exists and a signing secret is stored'} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canSetup ? (
          <button type="button" className={btnPrimary} disabled={busy || !status.api_key_configured} onClick={() => void setup()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {busy ? 'Talking to Resend…' : actionLabel}
          </button>
        ) : (
          <Link to={p('settings')} className={btnPrimary}>Open Settings to create the webhook</Link>
        )}
        <button type="button" className={btnSecondary} disabled={busy} onClick={() => { setLoading(true); void load() }}>
          Refresh status
        </button>
      </div>
    </Panel>
  )
}
