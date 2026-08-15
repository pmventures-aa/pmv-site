import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, FileText, HelpCircle, Users, CheckCircle, Clock } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Card, EmptyState, PageHeader, StatusBadge } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import {
  clientStageLabel,
  formatClientWhen,
  matterTypeLabel,
  milestoneStatusLabel,
  nextActionButtonLabel,
  nextActionHref,
  responsibilityBanner,
  matterPresentation,
} from '../../../shared/matterWorkspace'
import { propertyDisplayName } from '../../../shared/propertyProfile'

interface Matter {
  id: string
  title: string
  type: string | null
  status: string
  due_date: string | null
  target_date: string | null
  summary: string | null
  property_id: string | null
  created_at: string
  last_client_update_at: string | null
  client_stage: string | null
  responsibility_state: string | null
  next_action_type: string | null
  next_action_label: string | null
  next_action_due_at: string | null
  blocked_reason_client_safe: string | null
  completion_summary: string | null
  owner_name: string | null
}
interface Property { id: string; name: string | null; address: string; city: string | null; state: string | null }
interface Task { id: string; title: string; status: string; due_date: string | null }
interface Doc { id: string; file_name: string | null; category: string | null }
interface Update { id: string; body: string; created_at: string; author_name: string | null }
interface Party { matter_role: string; is_primary: number; display_name: string; email: string | null; party_type: string }
interface Ticket { id: string; subject: string; status: string }
interface Milestone { id: string; name: string; sequence: number; status: string; target_at: string | null; derived?: boolean }
interface DocRequest { id: string; title: string; status: string; signature_required: number }

export default function MatterDetail() {
  const { id } = useParams()
  const p = useAppPath()
  const [matter, setMatter] = useState<Matter | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [documents, setDocuments] = useState<Doc[]>([])
  const [updates, setUpdates] = useState<Update[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [documentRequests, setDocumentRequests] = useState<DocRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<{
        matter: Matter
        property: Property | null
        tasks: Task[]
        documents: Doc[]
        updates: Update[]
        parties: Party[]
        tickets: Ticket[]
        milestones: Milestone[]
        document_requests: DocRequest[]
      }>(`/portal/matters/${id}`)
      setMatter(res.matter)
      setProperty(res.property)
      setTasks(res.tasks)
      setDocuments(res.documents)
      setUpdates(res.updates)
      setParties(res.parties)
      setTickets(res.tickets)
      setMilestones(res.milestones || [])
      setDocumentRequests(res.document_requests || [])
    } finally { setLoading(false) }
  }, [id])
  useEffect(() => { void load() }, [load])

  async function postUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !note.trim()) return
    setBusy(true)
    try {
      await api.post(`/portal/matters/${id}/updates`, { body: note.trim() })
      setNote('')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not post that update.')
    } finally { setBusy(false) }
  }

  const presentation = useMemo(
    () => matter ? matterPresentation(
      matter.responsibility_state,
      matter.status,
      matter.blocked_reason_client_safe,
      matter.next_action_type,
      matter.next_action_label,
      matter.id,
    ) : null,
    [matter],
  )
  const openTask = tasks.find((task) => task.status !== 'done')
  const nextDue = formatClientWhen(matter?.next_action_due_at || openTask?.due_date || matter?.target_date || matter?.due_date)
  const lastUpdate = formatClientWhen(matter?.last_client_update_at || updates[0]?.created_at)

  if (loading) return <Card><p className="text-sm text-slate-400">Loading this work…</p></Card>
  if (!matter || !presentation) return <Card><EmptyState label="This work could not be found." /></Card>

  const banner = presentation.banner
  const tone = presentation.tone
  const actionTo = p(presentation.nextAction.href)
  const nextLabel = matter.next_action_label || presentation.nextAction.label

  return (
    <div>
      <Link to={p('matters')} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-gold">
        <ArrowLeft size={14} /> All work
      </Link>
      <PageHeader
        eyebrow={matterTypeLabel(matter.type)}
        title={matter.title}
        subtitle={[
          clientStageLabel(matter.client_stage, matter.status),
          matter.owner_name ? `Owner: ${matter.owner_name}` : 'Owner: Pinnacle will name a contact',
          lastUpdate ? `Updated ${lastUpdate}` : null,
          nextDue ? `Next ${nextDue}` : null,
        ].filter(Boolean).join(' · ')}
        action={<StatusBadge tone={tone}>{banner.label}</StatusBadge>}
      />

      {/* Status & Action Banner */}
      <div className={`mb-4 rounded-md border px-3 py-2.5 ${banner.state === 'client' ? 'border-gold/30 bg-gold/[.06]' : banner.state === 'third_party' ? 'border-rose-400/25 bg-rose-400/[.05]' : banner.state === 'none' ? 'border-emerald-400/25 bg-emerald-400/[.05]' : 'border-blue-400/25 bg-blue-400/[.05]'}`}>
        <p className="text-sm font-semibold text-white">{banner.label}</p>
        <p className="mt-1 text-sm leading-6 text-slate-300">{banner.body}</p>
        {banner.state === 'client' && nextLabel && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-200">{nextLabel}{nextDue ? ` · due ${nextDue}` : ''}</p>
            <Link to={actionTo} className="btn-gold">{presentation.nextAction.label}</Link>
          </div>
        )}
        {banner.state === 'third_party' && (
          <p className="mt-2 text-sm font-medium text-slate-200">Nothing is currently required from you.</p>
        )}
      </div>

      {matter.status === 'closed' && matter.completion_summary && (
        <Card className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completion</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{matter.completion_summary}</p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          {matter.summary && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overview</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{matter.summary}</p>
            </Card>
          )}

          {/* Timeline/Milestones */}
          {milestones.length > 0 && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4">Timeline</p>
              <ol className="space-y-3">
                {milestones.map((item, idx) => {
                  const isCompleted = item.status === 'completed'
                  const isCurrent = item.status === 'current'
                  const isBlocked = item.status === 'blocked'
                  return (
                    <li key={item.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        {isCompleted ? (
                          <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                        ) : isCurrent ? (
                          <Clock size={20} className="text-gold shrink-0" />
                        ) : isBlocked ? (
                          <div className="w-5 h-5 rounded-full border-2 border-red-400 shrink-0" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-600 shrink-0" />
                        )}
                        {idx < milestones.length - 1 && (
                          <div className={`w-0.5 h-8 mt-1 ${isCompleted ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        )}
                      </div>
                      <div className="pt-0.5">
                        <p className={`text-sm font-medium ${isCompleted ? 'text-emerald-300' : isCurrent ? 'text-gold' : 'text-slate-300'}`}>
                          {item.name}
                        </p>
                        {item.target_at && (
                          <p className="mt-0.5 text-xs text-slate-500">Target {formatClientWhen(item.target_at)}</p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Card>
          )}

          {/* Activity / Updates */}
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Updates</p>
            <form onSubmit={postUpdate} className="space-y-2 mb-4">
              <textarea className={`${inputCls} min-h-[72px]`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Send an update on this work. You do not need a separate message…" />
              <button type="submit" disabled={busy || !note.trim()} className="btn-gold disabled:opacity-60">{busy ? 'Sending…' : 'Send an update'}</button>
            </form>
            <ul className="divide-y divide-white/10 border-t border-white/10">
              {updates.length === 0 ? (
                <li className="py-3 text-sm text-slate-500">No updates yet.</li>
              ) : (
                updates.map((u) => (
                  <li key={u.id} className="py-2.5">
                    <p className="text-sm leading-6 text-slate-200">{u.body}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{u.author_name || 'Pinnacle'} · {new Date(u.created_at).toLocaleString()}</p>
                  </li>
                ))
              )}
            </ul>
          </Card>

          {tasks.length > 0 && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Tasks</p>
              <ul className="divide-y divide-white/10">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="text-slate-200">{t.title}</span>
                    <StatusBadge tone={t.status === 'done' ? 'green' : 'gold'}>{t.status.replace(/_/g, ' ')}</StatusBadge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-3">
          {property && (
            <Card>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Building2 size={13} /> Property</p>
              <Link to={p(`property-management/${property.id}`)} className="mt-3 block text-sm font-semibold text-white hover:text-gold">{propertyDisplayName(property)}</Link>
              <p className="mt-1 text-xs text-slate-500">{property.address}</p>
            </Card>
          )}
          <Card>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Users size={13} /> Who</p>
            {matter.owner_name && <p className="mt-3 text-sm text-white">Pinnacle contact · {matter.owner_name}</p>}
            {parties.length === 0 && !matter.owner_name ? <p className="mt-3 text-sm text-slate-500">People on this work will show here.</p> : (
              <ul className="mt-3 space-y-2">
                {parties.map((person, i) => (
                  <li key={`${person.display_name}-${i}`}>
                    <p className="text-sm text-white">{person.display_name}</p>
                    <p className="text-[11px] text-slate-500">{person.matter_role.replace(/_/g, ' ')}{person.email ? ` · ${person.email}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="!p-0">
            <div className="border-b border-white/10 px-3 py-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><HelpCircle size={13} /> Related requests</p>
            </div>
            {tickets.length === 0 ? <div className="p-3"><EmptyState label="No related requests." /></div> : (
              <ul className="divide-y divide-white/10">
                {tickets.map((t) => (
                  <li key={t.id}><Link to={p('support')} className="block px-3 py-2 text-sm text-slate-200 hover:bg-white/[.03]">{t.subject}</Link></li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="!p-0">
            <div className="border-b border-white/10 px-3 py-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><FileText size={13} /> Files</p>
            </div>
            {documents.length === 0 && documentRequests.length === 0 ? <div className="p-3"><EmptyState label="No files on this work." /></div> : (
              <ul className="divide-y divide-white/10">
                {documentRequests.map((req) => (
                  <li key={req.id}><Link to={p('documents')} className="block px-3 py-2 text-sm text-slate-200 hover:bg-white/[.03]">{req.title} · {req.status.replace(/_/g, ' ')}</Link></li>
                ))}
                {documents.map((d) => (
                  <li key={d.id}><Link to={p('documents')} className="block px-3 py-2 text-sm text-slate-200 hover:bg-white/[.03]">{d.file_name || d.category || 'Document'}</Link></li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}
