import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Mail, Pencil, Play, Loader2, PauseCircle, PlayCircle } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { toast } from '../../components/kit/toast'
import { Card, PageHeader, StatusBadge, SkeletonRows, type Tone } from '../../components/ui'
import type { HqEmailTemplate } from '../../lib/hqEmailTemplates'

// The single place an owner can see and control the post-signup journey: the
// immediate welcome letter plus the 14-day client discovery sequence. The
// sequence itself is driven by a DB trigger (every new client is enrolled the
// moment their account is created) and a daily automation that sends each due
// step. This page does not re-implement any of that - it surfaces the live
// state and links straight to the two control surfaces (Templates for copy,
// Automation Center for the schedule) so nothing lives in a place you cannot
// find.

interface AutomationRow {
  key: string
  label: string
  cadence?: string
  description?: string
  enabled: boolean
  next_run_at: string | null
  last_run: { status?: string; started_at?: string; items_processed?: number } | null
}
interface DeliveryRow {
  user_id: string
  email: string
  full_name: string | null
  step_key: string
  status: string
  sent_at: string | null
}
type StatusCount = { status: string; count: number }

const NURTURE_KEY = 'client_nurture'
const WELCOME_SLUG = 'account_welcome_client'

const fmt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : 'Not yet')
const stepDay = (slug: string) => {
  const m = /nurture_day(\d+)_/.exec(slug)
  return m ? Number(m[1]) : 999
}
const prettyStep = (key: string) => key.replace(/^day\d+_/, '').replace(/_/g, ' ')
function deliveryTone(status: string): Tone {
  const s = status.toLowerCase()
  if (s === 'sent' || s === 'delivered') return 'green'
  if (s === 'failed' || s === 'bounced') return 'red'
  if (s === 'skipped') return 'slate'
  return 'blue'
}

export default function JourneyAutomation() {
  const p = useAppPath()
  const [templates, setTemplates] = useState<HqEmailTemplate[]>([])
  const [automation, setAutomation] = useState<AutomationRow | null>(null)
  const [summary, setSummary] = useState<StatusCount[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'toggle' | 'run' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [tpl, center, campaign] = await Promise.all([
        api.get<{ templates: HqEmailTemplate[] }>('/admin/email-templates'),
        api.get<{ automations: AutomationRow[] }>('/admin/automation-center'),
        api.get<{ summary: StatusCount[]; deliveries: DeliveryRow[] }>('/admin/nurture-campaign'),
      ])
      setTemplates(tpl.templates || [])
      setAutomation((center.automations || []).find((a) => a.key === NURTURE_KEY) || null)
      setSummary(campaign.summary || [])
      setDeliveries(campaign.deliveries || [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the signup journey.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const welcome = useMemo(() => templates.find((t) => t.slug === WELCOME_SLUG) || null, [templates])
  const steps = useMemo(
    () => templates.filter((t) => t.category === 'nurture').sort((a, b) => stepDay(a.slug) - stepDay(b.slug)),
    [templates],
  )
  const enrolledActive = summary.find((s) => s.status === 'active')?.count ?? 0
  const editLink = (id: string) => `${p('messages')}?tab=templates&template=${id}`

  async function toggleEnabled() {
    if (!automation) return
    setBusy('toggle')
    try {
      await api.patch(`/admin/automation-center/${NURTURE_KEY}`, { enabled: !automation.enabled })
      toast.success(automation.enabled ? 'Journey paused. No further steps will send until resumed.' : 'Journey resumed.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the journey.')
    } finally { setBusy(null) }
  }

  async function runNow() {
    setBusy('run')
    try {
      const r = await api.post<{ sent?: number; processed?: number }>(`/admin/automation-center/${NURTURE_KEY}/run`, {})
      toast.success(`Ran the journey now - ${r.sent ?? 0} sent, ${r.processed ?? 0} processed.`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not run the journey.')
    } finally { setBusy(null) }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <PageHeader eyebrow="Lifecycle" title="Signup Journey" subtitle="The welcome letter and the 14-day client discovery sequence." />
        <Card><SkeletonRows rows={6} cols={3} /></Card>
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <PageHeader eyebrow="Lifecycle" title="Signup Journey" />
        <Card className="space-y-2 text-sm text-slate-400">
          <p>{error}</p>
          <button onClick={() => void load()} className="text-gold hover:underline">Try again</button>
        </Card>
      </div>
    )
  }

  const paused = automation ? !automation.enabled : false

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        eyebrow="Lifecycle"
        title="Signup Journey"
        subtitle="Every new client is enrolled automatically the moment their account is created: an immediate welcome letter, then a 14-day discovery sequence. Edit any letter's copy in Templates; pause or run the schedule here."
      />

      {/* Automation status + controls */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[.03] text-gold"><Bot size={18} /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-white">Client discovery sequence</h2>
                <StatusBadge tone={paused ? 'red' : 'green'}>{paused ? 'Paused' : 'Active'}</StatusBadge>
              </div>
              <p className="mt-0.5 text-sm text-slate-400">{automation?.cadence || 'Daily'} · Next run {fmt(automation?.next_run_at)} · Last run {fmt(automation?.last_run?.started_at)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void runNow()}
              disabled={busy !== null || paused}
              title={paused ? 'Resume the journey to run it' : 'Send any steps that are due right now'}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-gold/40 hover:text-gold disabled:opacity-50"
            >
              {busy === 'run' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run now
            </button>
            <button
              onClick={() => void toggleEnabled()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-gold/40 hover:text-gold disabled:opacity-50"
            >
              {busy === 'toggle' ? <Loader2 size={14} className="animate-spin" /> : paused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
              {paused ? 'Resume journey' : 'Pause journey'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(['active', 'completed', 'paused', 'unsubscribed'] as const).map((st) => {
            const count = summary.find((s) => s.status === st)?.count ?? 0
            return (
              <span key={st} className="rounded-sm border border-white/10 bg-white/[.02] px-2 py-1 text-slate-300">
                <span className="font-semibold text-white">{count}</span> {st}
              </span>
            )
          })}
        </div>
        <p className="text-xs text-slate-500">
          Schedule and pause controls also live in{' '}
          <Link to={p('automation-center')} className="text-gold hover:underline">Automation Center</Link>.
        </p>
      </Card>

      {/* Immediate welcome */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-gold/80">Day 0 · Immediately on signup</p>
        <StepCard
          badge="Welcome"
          name={welcome?.name || 'Account welcome (client)'}
          subject={welcome?.subject}
          enabled={welcome ? welcome.enabled === 1 : true}
          editHref={welcome ? editLink(welcome.id) : undefined}
          icon={<Mail size={16} />}
        />
      </div>

      {/* 14-day sequence */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-gold/80">14-day discovery sequence · {enrolledActive} enrolled</p>
        <div className="space-y-2">
          {steps.length === 0 ? (
            <Card className="text-sm text-slate-400">No nurture letters found.</Card>
          ) : steps.map((t) => (
            <StepCard
              key={t.id}
              badge={`Day ${stepDay(t.slug)}`}
              name={t.name}
              subject={t.subject}
              enabled={t.enabled === 1}
              editHref={editLink(t.id)}
            />
          ))}
        </div>
      </div>

      {/* Recent sends */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-gold/80">Recent sends</p>
        <Card className="overflow-x-auto !p-0">
          {deliveries.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No journey emails have sent yet.</p>
          ) : (
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Recipient</th>
                  <th className="px-3 py-2 font-medium">Step</th>
                  <th className="px-3 py-2 font-medium">Sent</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.slice(0, 40).map((d, i) => (
                  <tr key={`${d.user_id}-${d.step_key}-${i}`} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 text-slate-200">
                      <span className="block">{d.full_name || d.email}</span>
                      {d.full_name && <span className="block text-xs text-slate-500">{d.email}</span>}
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-300">{prettyStep(d.step_key)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-400">{fmt(d.sent_at)}</td>
                    <td className="px-3 py-2"><StatusBadge tone={deliveryTone(d.status)}>{d.status}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}

function StepCard({ badge, name, subject, enabled, editHref, icon }: {
  badge: string
  name: string
  subject?: string
  enabled: boolean
  editHref?: string
  icon?: React.ReactNode
}) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 inline-grid h-7 shrink-0 place-items-center rounded-sm border border-gold/25 bg-gold/[.06] px-2 text-[11px] font-bold uppercase tracking-wide text-gold/90">{badge}</span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-white">{icon}{name}</p>
          {subject && <p className="mt-0.5 truncate text-xs text-slate-400">Subject: {subject}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge tone={enabled ? 'green' : 'slate'}>{enabled ? 'Active' : 'Off'}</StatusBadge>
        {editHref && (
          <Link to={editHref} className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-gold/40 hover:text-gold">
            <Pencil size={12} /> Edit
          </Link>
        )}
      </div>
    </Card>
  )
}
