import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarEventItem } from '../../../shared/calendarWorkspace'
import {
  calendarDayLabel,
  calendarEventStatusLabel,
  calendarEventTone,
  calendarEventTypeLabel,
  calendarTimeLabel,
  calendarWindowLabel,
  dayKey,
  dayKeyOfIso,
  monthGridDayKeys,
  sortCalendarEvents,
  weekDayKeys,
  type Tone,
} from '../../../shared/calendarWorkspace'

export type CalendarMode = 'month' | 'week' | 'day' | 'agenda'

const MODES: { key: CalendarMode; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
  { key: 'agenda', label: 'Agenda' },
]

export const CALENDAR_TONE_CLASS: Record<Tone, string> = {
  gold: 'bg-gold/10 text-gold border-gold/25',
  green: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',
  blue: 'bg-sky-400/10 text-sky-300 border-sky-400/25',
  slate: 'bg-white/5 text-slate-300 border-white/15',
  red: 'bg-rose-400/10 text-rose-300 border-rose-400/25',
}

export function CalendarEventChip({
  event,
  onClick,
  compact = false,
}: { event: CalendarEventItem; onClick?: (event: CalendarEventItem) => void; compact?: boolean }) {
  const tone = calendarEventTone(event.eventType)
  const inner = (
    <>
      <span className={`inline-flex w-1.5 shrink-0 self-stretch rounded-sm ${CALENDAR_TONE_CLASS[tone].split(' ')[0]}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold leading-tight text-white">
          {!compact && <span className="text-slate-400">{calendarTimeLabel(event.startsAt)} · </span>}
          {event.title}
        </span>
        {(event.matterTitle || event.clientName) && (
          <span className="mt-0.5 block truncate text-[10px] leading-tight text-slate-400">
            {event.matterTitle || event.clientName}
          </span>
        )}
      </span>
    </>
  )
  const cls = `flex w-full items-center gap-1.5 overflow-hidden rounded-md border px-1.5 py-1 text-left ${CALENDAR_TONE_CLASS[tone]}`
  if (onClick) {
    return (
      <button type="button" onClick={() => onClick(event)} className={`${cls} cursor-pointer transition hover:brightness-110`} title={event.title}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}

function ShiftControls({
  onPrev, onNext, onToday, onDateChange, date, showToday = true,
}: { onPrev: () => void; onNext: () => void; onToday: () => void; onDateChange?: (date: Date) => void; date: Date; showToday?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onPrev} className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-white/[.02] text-slate-300 transition hover:border-gold/35 hover:text-gold" aria-label="Previous">
          <ChevronLeft size={15} />
        </button>
        <button type="button" onClick={onNext} className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-white/[.02] text-slate-300 transition hover:border-gold/35 hover:text-gold" aria-label="Next">
          <ChevronRight size={15} />
        </button>
      </div>
      {showToday && (
        <button type="button" onClick={onToday} className="min-h-8 rounded-md border border-white/12 bg-white/[.03] px-3 text-xs font-semibold text-slate-200 transition hover:border-gold/40 hover:text-gold">
          Today
        </button>
      )}
      {onDateChange && (
        <input
          type="date"
          value={dayKey(date)}
          onChange={(e) => { if (e.target.value) onDateChange(new Date(`${e.target.value}T12:00:00`)) }}
          className="min-h-8 rounded-md border border-white/12 bg-white/[.03] px-2 text-xs font-semibold text-slate-200 focus:border-gold/50 focus:outline-none [color-scheme:dark]"
          aria-label="Jump to date"
        />
      )}
    </div>
  )
}

// ---- Month view ----

function MonthView({ events, currentDate, onSelectEvent, onJumpToDay }: { events: CalendarEventItem[]; currentDate: Date; onSelectEvent?: (e: CalendarEventItem) => void; onJumpToDay?: (date: Date) => void }) {
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>()
    for (const ev of events) {
      const key = dayKeyOfIso(ev.startsAt)
      const list = map.get(key) || []
      list.push(ev)
      map.set(key, list)
    }
    for (const list of map.values()) sortCalendarEvents(list)
    return map
  }, [events])
  const keys = useMemo(() => monthGridDayKeys(currentDate), [currentDate])
  const todayKey = dayKey(new Date())
  const monthKey = dayKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1))

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/[.03]">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
        <div key={d} className="bg-navy-900 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">{d}</div>
      ))}
      {keys.map((key) => {
        const inMonth = key.startsWith(monthKey.slice(0, 7))
        const list = byDay.get(key) || []
        const visible = list.slice(0, 3)
        const more = list.length - visible.length
        return (
          <div key={key} className={`flex min-h-[86px] flex-col gap-1 bg-white/[.015] p-1.5 ${inMonth ? '' : 'opacity-45'}`}>
            <div className="flex items-center justify-between">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${key === todayKey ? 'bg-gold text-navy-950' : 'text-slate-300'}`}>
                {Number(key.slice(8))}
              </span>
              {list.length > 0 && (
                <button type="button" onClick={() => onJumpToDay?.(new Date(`${key}T12:00:00`))} className="text-[9px] font-semibold text-slate-500 hover:text-gold" aria-label={`Show all events on day ${key}`}>
                  {list.length} event{list.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
            <div className="space-y-1">
              {visible.map((ev) => <CalendarEventChip key={ev.id} event={ev} onClick={onSelectEvent} compact />)}
              {more > 0 && (
                <button type="button" onClick={() => onJumpToDay?.(new Date(`${key}T12:00:00`))} className="px-1 text-[10px] font-semibold text-slate-400 hover:text-gold">
                  +{more} more
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---- Day list (shared by Week and Day views) ----

function DayList({ events, dayKeyValue, onSelectEvent, header }: { events: CalendarEventItem[]; dayKeyValue: string; onSelectEvent?: (e: CalendarEventItem) => void; header?: ReactNode }) {
  const list = useMemo(() => sortCalendarEvents(events.filter((ev) => dayKeyOfIso(ev.startsAt) === dayKeyValue)), [events, dayKeyValue])
  return (
    <div className="flex min-w-0 flex-col">
      {header}
      {list.length === 0 ? (
        <p className="px-2 py-6 text-center text-[11px] text-slate-600">No events</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((ev) => <CalendarEventChip key={ev.id} event={ev} onClick={onSelectEvent} />)}
        </div>
      )}
    </div>
  )
}

function WeekView({ events, currentDate, onSelectEvent }: { events: CalendarEventItem[]; currentDate: Date; onSelectEvent?: (e: CalendarEventItem) => void }) {
  const keys = useMemo(() => weekDayKeys(currentDate), [currentDate])
  const todayKey = dayKey(new Date())
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {keys.map((key) => (
        <DayList
          key={key}
          events={events}
          dayKeyValue={key}
          onSelectEvent={onSelectEvent}
          header={(
            <div className={`mb-2 rounded-md border px-2 py-1.5 ${key === todayKey ? 'border-gold/30 bg-gold/[.06]' : 'border-white/10 bg-white/[.02]'}`}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{key.slice(5)}</p>
              <p className={`text-xs font-bold ${key === todayKey ? 'text-gold' : 'text-slate-200'}`}>{calendarDayLabel(key)}</p>
            </div>
          )}
        />
      ))}
    </div>
  )
}

function DayView({ events, currentDate, onSelectEvent }: { events: CalendarEventItem[]; currentDate: Date; onSelectEvent?: (e: CalendarEventItem) => void }) {
  const key = dayKey(currentDate)
  const todayKey = dayKey(new Date())
  return (
    <DayList
      events={events}
      dayKeyValue={key}
      onSelectEvent={onSelectEvent}
      header={(
        <div className={`mb-3 rounded-lg border px-3 py-2 ${key === todayKey ? 'border-gold/30 bg-gold/[.06]' : 'border-white/10 bg-white/[.02]'}`}>
          <p className="text-sm font-bold text-white">{calendarDayLabel(key)}</p>
          <p className="text-xs text-slate-400">{key}</p>
        </div>
      )}
    />
  )
}

// ---- Agenda view ----

function AgendaView({ events, currentDate, onSelectEvent }: { events: CalendarEventItem[]; currentDate: Date; onSelectEvent?: (e: CalendarEventItem) => void }) {
  const groups = useMemo(() => {
    const sorted = sortCalendarEvents(events)
    const map = new Map<string, CalendarEventItem[]>()
    for (const ev of sorted) {
      const key = dayKeyOfIso(ev.startsAt)
      const list = map.get(key) || []
      list.push(ev)
      map.set(key, list)
    }
    const todayKey = dayKey(new Date())
    const startKey = dayKey(currentDate)
    return Array.from(map.entries())
      .filter(([key]) => key >= startKey)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, list]) => ({ key, list, isToday: key === todayKey }))
  }, [events, currentDate])

  return (
    <div className="divide-y divide-white/[.06] rounded-lg border border-white/10 bg-white/[.02]">
      {groups.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">No events in this range.</p>}
      {groups.map(({ key, list, isToday }) => (
        <div key={key} className="px-4 py-3">
          <p className={`mb-2 text-[11px] font-bold uppercase tracking-wide ${isToday ? 'text-gold' : 'text-slate-400'}`}>
            {calendarDayLabel(key)} · {key}
          </p>
          <div className="space-y-1.5">
            {list.map((ev) => (
              <div key={ev.id} className="flex flex-wrap items-center gap-2">
                <span className="w-32 shrink-0 text-xs font-semibold tabular-nums text-slate-300">{calendarWindowLabel(ev.startsAt, ev.endsAt)}</span>
                <div className="min-w-0 flex-1">
                  <CalendarEventChip event={ev} onClick={onSelectEvent} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Main component ----

export function CalendarGrid({
  events,
  mode,
  onModeChange,
  date,
  onDateChange,
  onSelectEvent,
}: {
  events: CalendarEventItem[]
  mode: CalendarMode
  onModeChange: (mode: CalendarMode) => void
  date: Date
  onDateChange: (date: Date) => void
  onSelectEvent?: (event: CalendarEventItem) => void
}) {
  const [internalDate, setInternalDate] = useState(() => date)

  function shift(days: number) {
    const next = new Date(internalDate.getFullYear(), internalDate.getMonth(), internalDate.getDate() + days)
    setInternalDate(next)
    onDateChange(next)
  }
  function today() {
    const now = new Date()
    setInternalDate(now)
    onDateChange(now)
  }
  function jumpTo(key: string) {
    const next = new Date(`${key}T12:00:00`)
    setInternalDate(next)
    onDateChange(next)
  }

  const headerLabel = useMemo(() => {
    if (mode === 'month') return internalDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    if (mode === 'week') return `${calendarDayLabel(dayKey(new Date(internalDate.getFullYear(), internalDate.getMonth(), internalDate.getDate() - internalDate.getDay())))} – ${calendarDayLabel(dayKey(new Date(internalDate.getFullYear(), internalDate.getMonth(), internalDate.getDate() + (6 - internalDate.getDay()))))}`
    if (mode === 'day') return internalDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    return `${calendarDayLabel(dayKey(internalDate))} onward`
  }, [mode, internalDate])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ShiftControls date={internalDate} onPrev={() => shift(-1)} onNext={() => shift(1)} onToday={today} onDateChange={(d) => { setInternalDate(d); onDateChange(d) }} showToday={mode !== 'agenda'} />
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[.02] p-0.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onModeChange(m.key)}
              className={`min-h-7 rounded px-2.5 text-xs font-semibold transition ${mode === m.key ? 'bg-gold text-navy-950' : 'text-slate-300 hover:text-gold'}`}
              aria-pressed={mode === m.key}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <h2 className="text-sm font-bold text-slate-200">{headerLabel}</h2>

      {mode === 'month' && <MonthView events={events} currentDate={internalDate} onSelectEvent={onSelectEvent} onJumpToDay={(d) => { onModeChange('day'); setInternalDate(d); onDateChange(d) }} />}
      {mode === 'week' && <WeekView events={events} currentDate={internalDate} onSelectEvent={onSelectEvent} />}
      {mode === 'day' && <DayView events={events} currentDate={internalDate} onSelectEvent={onSelectEvent} />}
      {mode === 'agenda' && <AgendaView events={events} currentDate={internalDate} onSelectEvent={onSelectEvent} />}
    </div>
  )
}

export { calendarEventTypeLabel, calendarEventStatusLabel }
