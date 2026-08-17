import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { PageIntro, Panel, EmptyState, Tag, inputCls, btnPrimary } from '../../components/admin/ui'
import { Dialog, DialogContent } from '../../components/kit/Dialog'
import { CalendarGrid, type CalendarMode } from '../../components/calendar/CalendarGrid'
import { CalendarEventDetailPanel, type CalendarInviteState } from '../../components/calendar/CalendarEventDetail'
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_EVENT_STATUSES,
  CALENDAR_LOCATION_TYPES,
  dayKey,
  type CalendarEventItem,
} from '../../../shared/calendarWorkspace'

interface ClientOption { id: string; full_name: string | null; email: string; business_name: string | null }
interface StaffOption { id: string; full_name: string | null; email: string; party_type: string | null; vendor_category: string | null }

function visibleRange(mode: CalendarMode, date: Date): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (mode === 'month') {
    const from = new Date(date.getFullYear(), date.getMonth(), 1); from.setDate(from.getDate() - 7)
    const to = new Date(date.getFullYear(), date.getMonth() + 1, 0); to.setDate(to.getDate() + 7)
    return { from: key(from), to: key(to) }
  }
  if (mode === 'week') {
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay()); from.setDate(from.getDate() - 7)
    const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (6 - date.getDay())); to.setDate(to.getDate() + 7)
    return { from: key(from), to: key(to) }
  }
  if (mode === 'day') {
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)
    const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 2)
    return { from: key(from), to: key(to) }
  }
  const to = new Date(); to.setDate(to.getDate() + 60)
  return { from: key(new Date()), to: key(to) }
}

export default function AdminCalendar() {
  const { user } = useAuth()
  const [events, setEvents] = useState<CalendarEventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<CalendarMode>('month')
  const [date, setDate] = useState(() => new Date())
  const [selected, setSelected] = useState<CalendarEventItem | null>(null)
  const [selectedInvites, setSelectedInvites] = useState<CalendarInviteState[] | null>(null)
  const [busy, setBusy] = useState(false)

  const [eventType, setEventType] = useState('')
  const [status, setStatus] = useState('')
  const [visibility, setVisibility] = useState('')
  const [clientId, setClientId] = useState('')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [clients, setClients] = useState<ClientOption[]>([])
  const [staff, setStaff] = useState<StaffOption[]>([])

  const range = useMemo(() => visibleRange(mode, date), [mode, date])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to })
      if (eventType) params.set('event_type', eventType)
      if (status) params.set('status', status)
      if (visibility) params.set('visibility', visibility)
      if (clientId) params.set('client_user_id', clientId)
      if (mineOnly && user) params.set('assigned_user_id', user.id)
      else if (assignedUserId) params.set('assigned_user_id', assignedUserId)
      const res = await api.get<{ events: CalendarEventItem[] }>(`/admin/calendar/events?${params.toString()}`)
      setEvents(res.events ?? [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [range, eventType, status, visibility, clientId, assignedUserId, mineOnly, user])

  useEffect(() => {
    void load()
    api.get<{ clients: ClientOption[] }>('/admin/clients').then((r) => setClients(r.clients ?? [])).catch(() => {})
    api.get<{ staff: StaffOption[] }>('/admin/staff-directory').then((r) => setStaff(r.staff ?? [])).catch(() => {})
  }, [load])

  async function patchStatus(next: string) {
    if (!selected) return
    setBusy(true)
    try {
      await api.patch(`/admin/calendar/events/${selected.id}`, { status: next })
      toast.success(next === 'cancelled' ? 'Event cancelled.' : 'Event confirmed.')
      setSelected(null)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update this event.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    setSelectedInvites(null)
    // Derived rows (field:/care:) have no stored calendar_events id, so
    // there is no invite state to fetch for them.
    if (!selected || selected.id.includes(':')) return
    let active = true
    api.get<{ invites: CalendarInviteState[] }>(`/admin/calendar/events/${selected.id}/invites`)
      .then((r) => { if (active) setSelectedInvites(r.invites ?? []) })
      .catch(() => {})
    return () => { active = false }
  }, [selected])

  const hasFilters = !!(eventType || status || visibility || clientId || assignedUserId || mineOnly)

  const detailLinks = useMemo(() => {
    if (!selected) return []
    const links: { label: string; to: string }[] = []
    if (selected.clientUserId) links.push({ label: 'Open client', to: `/clients/${selected.clientUserId}` })
    if (selected.id.startsWith('field:')) links.push({ label: 'Open field work', to: `/field-work/${selected.id.slice(6)}` })
    return links
  }, [selected])

  const selectCls = `${inputCls} min-h-9`
  const optLabel = (o: { full_name: string | null; email: string }) => (o.full_name || o.email).slice(0, 40)

  return (
    <div className="space-y-4">
      <PageIntro
        kicker="Schedule"
        title="Calendar"
        subtitle="Every appointment, deadline, visit, and signature window across your book of business, unified from the domain records that own them."
        action={<CreateEventDialog clients={clients} staff={staff} onCreated={() => void load()} />}
      />

      <Panel className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Type</span>
            <select className={selectCls} value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">All types</option>
              {CALENDAR_EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Status</span>
            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              {CALENDAR_EVENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Visibility</span>
            <select className={selectCls} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="">All</option>
              <option value="client">Client-visible</option>
              <option value="internal">Internal only</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Client</span>
            <select className={selectCls} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Any client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{optLabel(c)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Assignee</span>
            <select className={selectCls} value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)}>
              <option value="">Any assignee</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{optLabel(s)}</option>)}
            </select>
          </label>
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-300">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="h-4 w-4 accent-gold" />
            Assigned to me
          </label>
          {hasFilters && (
            <button type="button" onClick={() => { setEventType(''); setStatus(''); setVisibility(''); setClientId(''); setAssignedUserId(''); setMineOnly(false) }} className="mb-2 text-xs font-semibold text-slate-500 hover:text-gold">
              Clear filters
            </button>
          )}
        </div>
      </Panel>

      <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
        {loading && events.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">Loading calendar…</p>
        ) : events.length === 0 ? (
          <EmptyState label="No events match this view. Adjust the range or filters." />
        ) : (
          <CalendarGrid
            events={events}
            mode={mode}
            onModeChange={setMode}
            date={date}
            onDateChange={setDate}
            onSelectEvent={setSelected}
          />
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent title="Event details" size="md">
          {selected && (
            <CalendarEventDetailPanel
              event={selected}
              busy={busy}
              links={detailLinks}
              invites={selectedInvites}
              onCancel={() => void patchStatus('cancelled')}
              onConfirm={() => void patchStatus('confirmed')}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateEventDialog({ clients, staff, onCreated }: { clients: ClientOption[]; staff: StaffOption[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    title: '',
    starts_at: '',
    ends_at: '',
    all_day: false,
    event_type: 'appointment',
    status: 'proposed',
    location_type: '',
    location_name: '',
    address: '',
    meeting_url: '',
    visibility: 'client',
    client_user_id: '',
    assigned_user_id: '',
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))

  async function submit() {
    if (!form.title.trim() || !form.starts_at) {
      toast.error('Add a title and a start date/time.')
      return
    }
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        starts_at: form.starts_at,
        ends_at: form.ends_at || null,
        all_day: form.all_day,
        event_type: form.event_type,
        status: form.status,
        visibility: form.visibility,
        location_type: form.location_type || null,
        location_name: form.location_name || null,
        address: form.address || null,
        meeting_url: form.meeting_url || null,
      }
      if (form.client_user_id) payload.client_user_id = form.client_user_id
      if (form.assigned_user_id) payload.assigned_user_id = form.assigned_user_id
      await api.post('/admin/calendar/events', payload)
      toast.success('Event created.')
      setOpen(false)
      setForm((f) => ({ ...f, title: '', starts_at: '', ends_at: '', location_name: '', address: '', meeting_url: '' }))
      onCreated()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create this event.')
    } finally {
      setBusy(false)
    }
  }

  const optLabel = (o: { full_name: string | null; email: string }) => (o.full_name || o.email).slice(0, 40)
  const field = (key: keyof typeof form) => ({
    value: form[key] as string | boolean,
    onChange: set(key) as unknown as (e: React.ChangeEvent<HTMLInputElement>) => void,
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button type="button" onClick={() => setOpen(true)} className={btnPrimary}>
        <Plus size={15} /> New event
      </button>
      <DialogContent title="Create event" description="Schedule an appointment, meeting, or visit. Linked events stay read-only in the calendar; edit them where they live." size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-400">Title</span>
            <input className={inputCls} value={form.title} onChange={set('title')} placeholder="e.g. Property inspection, Boca rental" maxLength={300} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Starts</span>
            <input type="datetime-local" className={`${inputCls} [color-scheme:dark]`} value={form.starts_at} onChange={set('starts_at')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Ends (optional)</span>
            <input type="datetime-local" className={`${inputCls} [color-scheme:dark]`} value={form.ends_at} onChange={set('ends_at')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Type</span>
            <select className={inputCls} value={form.event_type} onChange={set('event_type')}>
              {CALENDAR_EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Status</span>
            <select className={inputCls} value={form.status} onChange={set('status')}>
              {CALENDAR_EVENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Location type</span>
            <select className={inputCls} value={form.location_type} onChange={set('location_type')}>
              <option value="">No location set</option>
              {CALENDAR_LOCATION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Location name</span>
            <input className={inputCls} value={form.location_name} onChange={set('location_name')} placeholder="e.g. Pinnacle office" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-400">Address</span>
            <input className={inputCls} value={form.address} onChange={set('address')} placeholder="Street address, city, state" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-slate-400">Meeting link</span>
            <input className={inputCls} value={form.meeting_url} onChange={set('meeting_url')} placeholder="https://…" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Client (optional)</span>
            <select className={inputCls} value={form.client_user_id} onChange={set('client_user_id')}>
              <option value="">No client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{optLabel(c)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Assigned to (optional)</span>
            <select className={inputCls} value={form.assigned_user_id} onChange={set('assigned_user_id')}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{optLabel(s)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Visibility</span>
            <select className={inputCls} value={form.visibility} onChange={set('visibility')}>
              <option value="client">Visible to client</option>
              <option value="internal">Internal only</option>
            </select>
          </label>
          <label className="flex items-end gap-2 pb-1 text-xs font-medium text-slate-400">
            <input type="checkbox" checked={form.all_day} onChange={set('all_day') as unknown as (e: React.ChangeEvent<HTMLInputElement>) => void} className="h-4 w-4 accent-gold" />
            All day
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-white/12 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:text-white">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void submit()} className={btnPrimary}>
            {busy ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
