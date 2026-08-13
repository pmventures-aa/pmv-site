import { useEffect, useState } from 'react'
import { api, ApiError } from '../../../lib/api'
import { Panel, btnPrimary, btnOutline } from '../../../components/admin/ui'
import { toast } from '../../../components/kit/toast'
import { PROCESSOR_REVIEW_EMAIL } from '../../../../shared/processorReviewLogin'

interface Status {
  exists: boolean
  email: string
  login_url: string
  status: string | null
  last_login_at: string | null
  service_count: number
}

interface Staged {
  email: string
  password: string
  login_url: string
  created: boolean
  services: string[]
}

export function ProcessorReviewLoginPanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [staged, setStaged] = useState<Staged | null>(null)
  const [busy, setBusy] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    api.get<Status>('/admin/processor-review-login')
      .then(setStatus)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true)
      })
  }, [])

  async function stage() {
    setBusy(true)
    try {
      const result = await api.post<Staged>('/admin/processor-review-login', {})
      setStaged(result)
      setStatus({
        exists: true,
        email: result.email,
        login_url: result.login_url,
        status: 'active',
        last_login_at: null,
        service_count: result.services.length,
      })
      toast.success(result.created ? 'Processor review login created.' : 'Processor review password reset.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not stage the processor review login.')
    } finally {
      setBusy(false)
    }
  }

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied.`)
  }

  if (forbidden) return null

  return (
    <Panel>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">Processor review login</h3>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
          Stages a temporary client portal user for Payment Cloud / Authorize.net underwriting. It receives every active service so Properties, Funding, Projects, Billing, Documents, and Requests all appear. It is a client login only. It cannot open HQ.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
        <span>Email: <strong className="font-medium text-white">{PROCESSOR_REVIEW_EMAIL}</strong></span>
        {status?.exists
          ? <span>{status.service_count} services assigned{status.last_login_at ? ` · last login ${new Date(status.last_login_at).toLocaleString()}` : ''}</span>
          : <span>Not staged yet</span>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => void stage()}>
          {busy ? 'Staging…' : status?.exists ? 'Reset password and refresh workspace' : 'Stage processor review login'}
        </button>
      </div>
      {staged && (
        <div className="mt-4 max-w-xl space-y-2 rounded-xl border border-gold/25 bg-gold/[.06] p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">Send these once. Staging again replaces the password.</p>
          <p className="text-slate-200">Login: {staged.login_url}</p>
          <p className="text-slate-200">Username: {staged.email}</p>
          <p className="font-mono text-white">{staged.password}</p>
          <p className="text-xs text-slate-500">{staged.services.length} client services enabled. Sample quotes, invoices, and properties are already in the workspace.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className={btnOutline} onClick={() => void copy(staged.login_url, 'Login URL')}>Copy login URL</button>
            <button type="button" className={btnOutline} onClick={() => void copy(staged.email, 'Username')}>Copy username</button>
            <button type="button" className={btnOutline} onClick={() => void copy(staged.password, 'Password')}>Copy password</button>
            <button type="button" className={btnOutline} onClick={() => void copy(
              `Login: ${staged.login_url}\nUsername: ${staged.email}\nPassword: ${staged.password}\nThis is a client portal login with every client service enabled. It cannot access HQ.`,
              'All credentials',
            )}>Copy all</button>
          </div>
        </div>
      )}
    </Panel>
  )
}
