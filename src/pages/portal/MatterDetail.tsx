import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, FileText, HelpCircle, Users } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import { useAppPath } from '../../lib/basePath'
import { Card, EmptyState, PageHeader, StatusBadge } from '../../components/ui'
import { inputCls } from '../auth/AuthLayout'
import { toast } from '../../components/kit/toast'
import { matterStatusLabel, matterTypeLabel } from '../../../shared/matterWorkspace'
import { propertyDisplayName } from '../../../shared/propertyProfile'

interface Matter {
  id: string
  title: string
  type: string | null
  status: string
  due_date: string | null
  summary: string | null
  property_id: string | null
  created_at: string
}
interface Property { id: string; name: string | null; address: string; city: string | null; state: string | null }
interface Task { id: string; title: string; status: string; due_date: string | null }
interface Doc { id: string; file_name: string | null; category: string | null }
interface Update { id: string; body: string; created_at: string; author_name: string | null }
interface Party { matter_role: string; is_primary: number; display_name: string; email: string | null; party_type: string }
interface Ticket { id: string; subject: string; status: string }

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
      }>(`/portal/matters/${id}`)
      setMatter(res.matter)
      setProperty(res.property)
      setTasks(res.tasks)
      setDocuments(res.documents)
      setUpdates(res.updates)
      setParties(res.parties)
      setTickets(res.tickets)
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

  if (loading) return <Card><p className="text-sm text-slate-400">Loading project…</p></Card>
  if (!matter) return <Card><EmptyState label="This project could not be found." /></Card>

  const tone = matter.status === 'closed' ? 'green' : matter.status === 'blocked' ? 'red' : matter.status === 'in_progress' ? 'blue' : 'gold'

  return (
    <div>
      <Link to={p('matters')} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-gold">
        <ArrowLeft size={14} /> All projects
      </Link>
      <PageHeader
        eyebrow={matterTypeLabel(matter.type)}
        title={matter.title}
        subtitle={matter.due_date ? `Due ${new Date(`${matter.due_date}T12:00:00`).toLocaleDateString()}` : `Opened ${new Date(matter.created_at).toLocaleDateString()}`}
        action={<StatusBadge tone={tone}>{matterStatusLabel(matter.status)}</StatusBadge>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          {matter.summary && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What this is</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{matter.summary}</p>
            </Card>
          )}

          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updates</p>
            <form onSubmit={postUpdate} className="mt-3 space-y-2">
              <textarea className={`${inputCls} min-h-[72px]`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note Pinnacle should see on this project." />
              <button type="submit" disabled={busy || !note.trim()} className="btn-gold disabled:opacity-60">{busy ? 'Posting…' : 'Post update'}</button>
            </form>
            <ul className="mt-3 divide-y divide-white/10 border-t border-white/10">
              {updates.length === 0 ? <li className="py-3 text-sm text-slate-500">No updates yet.</li> : updates.map((u) => (
                <li key={u.id} className="py-2.5">
                  <p className="text-sm leading-6 text-slate-200">{u.body}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{u.author_name || 'Pinnacle'} · {new Date(u.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          </Card>

          {tasks.length > 0 && (
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks</p>
              <ul className="mt-3 divide-y divide-white/10">
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
            {parties.length === 0 ? <p className="mt-3 text-sm text-slate-500">People on this project will show here.</p> : (
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
            {documents.length === 0 ? <div className="p-3"><EmptyState label="No files on this project." /></div> : (
              <ul className="divide-y divide-white/10">
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
