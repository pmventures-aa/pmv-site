import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, MapPin, MessageSquare, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { Panel, Tag, EmptyState, SkeletonTable } from '../../components/admin/ui'
import { pmvFadeUp, pmvStagger } from '../../lib/motionTheme'
import { hqWorkspaceCopy } from '../../lib/workspace'

interface Assignment {
  id: string
  title: string | null
  service_key: string
  vendor_user_id: string
  site_label: string | null
  site_address: string | null
  site_city: string | null
  site_state: string | null
  scheduled_at: string | null
  status: string
  client_name: string | null
}

const STATUS_PCT: Record<string, number> = {
  assigned: 15, traveling: 40, on_site: 60, documented: 80, signed: 92, completed: 100,
}
function statusMeta(status: string): { tone: 'gold' | 'blue' | 'green' | 'slate'; label: string; pct: number } {
  const pct = STATUS_PCT[status] ?? 30
  switch (status) {
    case 'assigned': return { tone: 'gold', label: 'Assigned', pct }
    case 'traveling': return { tone: 'blue', label: 'Traveling', pct }
    case 'on_site': return { tone: 'blue', label: 'On site', pct }
    case 'documented': return { tone: 'blue', label: 'Documented', pct }
    case 'signed': return { tone: 'blue', label: 'Signed', pct }
    case 'completed': return { tone: 'green', label: 'Completed', pct }
    case 'cancelled': return { tone: 'slate', label: 'Cancelled', pct: 0 }
    default: return { tone: 'slate', label: status.replace(/_/g, ' '), pct }
  }
}
function siteLine(a: Assignment): string {
  const address = [a.site_address, a.site_city, a.site_state].filter(Boolean).join(', ')
  return a.site_label && address ? `${a.site_label} · ${address}` : (a.site_label || address || 'Location to be confirmed')
}
function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function VendorHome() {
  const { user, workspace } = useAuth()
  const p = useAppPath()
  const copy = hqWorkspaceCopy(workspace.party_type, workspace.vendor_category, workspace.role_name)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api.get<{ assignments: Assignment[] }>('/admin/field-assignments')
      .then((r) => { if (active) setAssignments(r.assignments || []) })
      .catch(() => { if (active) setAssignments([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const mine = useMemo(() => assignments.filter((a) => a.vendor_user_id === user?.id), [assignments, user?.id])
  const activeList = useMemo(() => mine.filter((a) => a.status !== 'completed' && a.status !== 'cancelled'), [mine])
  const completedCount = mine.filter((a) => a.status === 'completed').length
  const nextScheduled = useMemo(
    () => activeList.filter((a) => a.scheduled_at).sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())[0] || null,
    [activeList],
  )
  const firstName = (user?.full_name || user?.email || 'there').trim().split(/\s+/)[0]

  const stats: Array<[string, string | number, typeof ClipboardList]> = [
    ['Active', activeList.length, ClipboardList],
    ['Completed', completedCount, CheckCircle2],
    ['Next', nextScheduled?.scheduled_at ? new Date(nextScheduled.scheduled_at).toLocaleDateString() : 'None set', CalendarClock],
  ]

  return (
    <motion.div className="space-y-5 pb-6" initial="hidden" animate="show" variants={pmvStagger}>
      {/* Welcome */}
      <motion.header variants={pmvFadeUp} className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-gold/[.08] via-white/[.02] to-transparent px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-gold/85">{copy.homeKicker}</p>
          <Tag>{copy.badge}</Tag>
        </div>
        <h1 className="mt-2 font-display text-2xl font-medium text-white">{greeting()}, {firstName}.</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{copy.homeSubtitle}</p>
      </motion.header>

      {/* Stats */}
      <motion.div variants={pmvFadeUp} className="grid grid-cols-3 gap-3">
        {stats.map(([label, value, Icon]) => (
          <Panel key={label} className="!p-4">
            <div className="flex items-center gap-1.5 text-slate-500"><Icon size={14} className="shrink-0" /><span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[.1em]">{label}</span></div>
            <p className="mt-2 truncate text-2xl font-semibold text-white">{value}</p>
          </Panel>
        ))}
      </motion.div>

      {/* Active assignments */}
      <motion.section variants={pmvFadeUp}>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500">Your work</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Active assignments</h2>
          </div>
          <Link to={p('field-work/mine')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold hover:underline">All assignments <ArrowRight size={13} /></Link>
        </div>
        {loading ? (
          <Panel><SkeletonTable rows={3} cols={2} /></Panel>
        ) : activeList.length === 0 ? (
          <Panel><EmptyState label="No active assignments right now. Pinnacle dispatches work to you here, and you'll see each job's progress as it moves." /></Panel>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {activeList.map((a) => {
              const meta = statusMeta(a.status)
              return (
                <li key={a.id} className="min-w-0">
                  <Link to={p(`field-work/${a.id}`)} className="group block h-full rounded-xl border border-white/10 bg-navy-900/60 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-gold/35 hover:shadow-[0_12px_30px_rgba(0,0,0,.28)]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate font-semibold text-white" title={a.title || a.service_key}>{a.title || a.service_key}</p>
                      <span className="shrink-0"><Tag tone={meta.tone}>{meta.label}</Tag></span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400"><MapPin size={12} className="shrink-0" /><span className="min-w-0 truncate">{siteLine(a)}</span></p>
                    {a.scheduled_at && <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock size={12} className="shrink-0" /><span className="min-w-0 truncate">{new Date(a.scheduled_at).toLocaleString()}</span></p>}
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[.08]">
                      <div className={`h-full rounded-full ${meta.tone === 'green' ? 'bg-emerald-400' : 'bg-gold'}`} style={{ width: `${meta.pct}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{meta.pct}% through this job</span>
                      <span className="inline-flex items-center gap-1 transition group-hover:text-gold">Open <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" /></span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </motion.section>

      {/* Quick actions */}
      <motion.section variants={pmvFadeUp} className="grid gap-3 sm:grid-cols-3">
        <QuickAction to={p('field-work/mine')} icon={ClipboardList} title="My assignments" note="View and work every job" />
        <QuickAction to={p('messages')} icon={MessageSquare} title="Inbox" note="Messages with Pinnacle" />
        <QuickAction to={p('security-center')} icon={ShieldCheck} title="Security" note="Devices and sign-in" />
      </motion.section>
    </motion.div>
  )
}

function QuickAction({ to, icon: Icon, title, note }: { to: string; icon: typeof ClipboardList; title: string; note: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.015] px-4 py-3 transition hover:border-gold/30 hover:bg-white/[.03]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[.03] text-slate-400 transition group-hover:text-gold"><Icon size={16} /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="truncate text-xs text-slate-500">{note}</p>
      </div>
      <ArrowRight size={14} className="ml-auto shrink-0 text-slate-600 transition group-hover:text-gold" />
    </Link>
  )
}
