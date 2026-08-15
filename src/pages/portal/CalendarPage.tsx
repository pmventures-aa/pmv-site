import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError } from '../../lib/api'
import { PageHeader, EmptyState } from '../../components/ui'
import { Dialog, DialogTrigger, DialogContent } from '../../components/kit/Dialog'
import { CalendarSubscribePanel } from '../../components/kit/AddToCalendar'
import { CalendarGrid, type CalendarMode } from '../../components/calendar/CalendarGrid'
import { CalendarEventDetailPanel } from '../../components/calendar/CalendarEventDetail'
import type { CalendarEventItem } from '../../../shared/calendarWorkspace'
import { dayKey } from '../../../shared/calendarWorkspace'

function visibleRange(mode: CalendarMode, date: Date): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (mode === 'month') {
    const from = new Date(date.getFullYear(), date.getMonth(), 1)
    from.setDate(from.getDate() - 7)
    const to = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    to.setDate(to.getDate() + 7)
    return { from: key(from), to: key(to) }
  }
  if (mode === 'week') {
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay())
    from.setDate(from.getDate() - 7)
    const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (6 - date.getDay()))
    to.setDate(to.getDate() + 7)
    return { from: key(from), to: key(to) }
  }
  if (mode === 'day') {
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)
    const to = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 2)
    return { from: key(from), to: key(to) }
  }
  const to = new Date()
  to.setDate(to.getDate() + 60)
  return { from: key(new Date()), to: key(to) }
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<CalendarMode>('month')
  const [date, setDate] = useState(() => new Date())
  const [selected, setSelected] = useState<CalendarEventItem | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const range = useMemo(() => visibleRange(mode, date), [mode, date])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ events: CalendarEventItem[] }>(`/portal/calendar/events?from=${range.from}&to=${range.to}`)
      setEvents(res.events ?? [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { void load() }, [load])

  async function cancelEvent() {
    if (!selected) return
    setCancelling(true)
    try {
      await api.patch(`/portal/calendar/events/${selected.id}`, { status: 'cancelled' })
      toast.success('Event cancelled.')
      setSelected(null)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel this event.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        subtitle="Everything coming up — appointments, deadlines, and visits in one view."
        action={(
          <RequestAppointmentDialog onCreated={() => void load()} />
        )}
      />
      <CalendarSubscribePanel feedPath="/portal/calendar/feed" />

      <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
        {loading && events.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">Loading your calendar…</p>
        ) : events.length === 0 ? (
          <EmptyState label="Nothing scheduled in this view yet." />
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
              busy={cancelling}
              onCancel={selected.status === 'cancelled' || selected.status === 'completed' ? undefined : cancelEvent}
              links={selected.sourcePath ? [{ label: 'Open this work', to: selected.sourcePath }] : []}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RequestAppointmentDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!title.trim() || !startsAt) {
      toast.error('Add a title and choose a date and time.')
      return
    }
    setBusy(true)
    try {
      await api.post('/portal/calendar', { title: title.trim(), starts_at: startsAt })
      toast.success('Appointment requested. Pinnacle will confirm shortly.')
      setOpen(false)
      setTitle('')
      setStartsAt('')
      onCreated()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not request an appointment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-navy-950 transition hover:bg-gold-300 disabled:opacity-60">
          <CalendarPlus size={15} /> Request appointment
        </button>
      </DialogTrigger>
      <DialogContent title="Request an appointment" description="Tell Pinnacle a time that works for you — we will confirm or suggest an alternative.">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">What is this about?</span>
            <input className="w-full min-h-10 rounded-md border border-white/12 bg-white/[.04] px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-gold/50 focus:outline-none" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Review my tax return" maxLength={300} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Preferred date and time</span>
            <input type="datetime-local" className="w-full min-h-10 rounded-md border border-white/12 bg-white/[.04] px-3 text-sm text-slate-100 [color-scheme:dark] focus:border-gold/50 focus:outline-none" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-md border border-white/12 px-3 text-xs font-semibold text-slate-300 hover:text-white">Cancel</button>
            <button type="button" disabled={busy} onClick={() => void submit()} className="min-h-10 rounded-md bg-gold px-4 text-xs font-bold text-navy-950 hover:bg-gold-300 disabled:opacity-60">
              {busy ? 'Sending...' : 'Request appointment'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
