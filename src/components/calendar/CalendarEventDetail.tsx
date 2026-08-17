import { useAppPath } from '../../lib/basePath'
import { AddToCalendarButton } from '../kit/AddToCalendar'
import {
  calendarDayLabel,
  calendarEventStatusLabel,
  calendarEventStatusTone,
  calendarEventTone,
  calendarEventTypeLabel,
  calendarLocationLabel,
  calendarWindowLabel,
  dayKeyOfIso,
  type CalendarEventItem,
} from '../../../shared/calendarWorkspace'
import type { Tone } from '../../../shared/calendarWorkspace'
import { CALENDAR_TONE_CLASS } from './CalendarGrid'
import type { CalendarEvent } from '../../../shared/ics'

export interface CalendarEventLink {
  label: string
  to: string
}

export interface CalendarInviteState {
  recipient_type: string
  recipient_name: string | null
  send_status: string
  last_status: string | null
  last_error_code: string | null
}

const INVITE_TONE: Record<string, string> = {
  SENT: 'text-emerald-300',
  PENDING: 'text-amber-300',
  FAILED: 'text-rose-300',
}

export function CalendarEventDetailPanel({
  event,
  links = [],
  onCancel,
  onConfirm,
  busy = false,
  invites,
}: {
  event: CalendarEventItem
  links?: CalendarEventLink[]
  onCancel?: () => void
  onConfirm?: () => void
  busy?: boolean
  invites?: CalendarInviteState[] | null
}) {
  const p = useAppPath()
  const tone: Tone = calendarEventTone(event.eventType)
  const statusTone: Tone = calendarEventStatusTone(event.status)
  const canCancel = onCancel && event.status !== 'cancelled' && event.status !== 'completed'

  const icsEvent: CalendarEvent = {
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    durationMinutes: event.endsAt
      ? Math.max(15, Math.round((new Date(event.endsAt.replace(' ', 'T')).getTime() - new Date(event.startsAt.replace(' ', 'T')).getTime()) / 60000))
      : 60,
    description: event.description || undefined,
    location: event.address || event.locationName || undefined,
  }

  const rows: { label: string; value: React.ReactNode }[] = []
  if (event.clientName) rows.push({ label: 'Client', value: <span>{event.clientName}</span> })
  if (event.vendorName) rows.push({ label: 'Vendor', value: <span>{event.vendorName}</span> })
  if (event.matterTitle) rows.push({ label: 'Matter', value: <span>{event.matterTitle}</span> })
  if (event.propertyLabel) rows.push({ label: 'Property', value: <span>{event.propertyLabel}</span> })

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className={`mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${CALENDAR_TONE_CLASS[tone].split(' ')[0]}`} aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-white">{event.title}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
              <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-medium ${CALENDAR_TONE_CLASS[tone]}`}>{calendarEventTypeLabel(event.eventType)}</span>
              <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-medium ${CALENDAR_TONE_CLASS[statusTone]}`}>{calendarEventStatusLabel(event.status)}</span>
              {event.derived && <span className="text-slate-600">auto</span>}
            </p>
          </div>
        </div>
        <AddToCalendarButton event={icsEvent} />
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">When</dt>
          <dd className="text-right text-slate-200">
            {calendarDayLabel(dayKeyOfIso(event.startsAt))} · {calendarWindowLabel(event.startsAt, event.endsAt)}
            {event.allDay ? ' (all day)' : ''}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Where</dt>
          <dd className="text-right text-slate-200">
            {event.address || event.locationName || calendarLocationLabel(event.locationType)}
          </dd>
        </div>
        {event.meetingUrl && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Meeting</dt>
            <dd><a href={event.meetingUrl} target="_blank" rel="noreferrer" className="text-gold underline decoration-gold/40 underline-offset-2 hover:text-gold-300">{event.meetingUrl}</a></dd>
          </div>
        )}
        {event.phoneNumber && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</dt>
            <dd className="text-right text-slate-200">{event.phoneNumber}</dd>
          </div>
        )}
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap justify-between gap-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{row.label}</dt>
            <dd className="text-right text-slate-200">{row.value}</dd>
          </div>
        ))}
      </dl>

      {event.description && (
        <div className="rounded-md border border-white/10 bg-white/[.03] p-3 text-sm leading-6 text-slate-300">{event.description}</div>
      )}

      {invites && invites.length > 0 && (
        <div className="rounded-md border border-white/10 bg-white/[.02] p-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">Calendar invites</p>
          <ul className="space-y-1 text-xs">
            {invites.map((iv) => (
              <li key={iv.recipient_type} className="flex items-center justify-between gap-2">
                <span className="text-slate-300">{iv.recipient_type === 'CLIENT' ? 'Client' : 'Vendor'}{iv.recipient_name ? ` · ${iv.recipient_name}` : ''}</span>
                <span className={`font-semibold ${INVITE_TONE[iv.send_status] ?? 'text-slate-400'}`}>
                  {iv.send_status === 'SENT' ? (iv.last_status === 'CANCELLED' ? 'Cancelled' : 'Sent') : iv.send_status === 'PENDING' ? 'Pending' : 'Failed'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(links.length > 0 || canCancel || onConfirm) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a key={link.to} href={p(link.to)} className="inline-flex items-center rounded-md border border-white/12 bg-white/[.025] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-gold/45 hover:text-gold">
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {onConfirm && event.status !== 'confirmed' && event.status !== 'completed' && event.status !== 'cancelled' && (
              <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-60">
                {busy ? 'Working...' : 'Confirm'}
              </button>
            )}
            {canCancel && (
              <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center rounded-md border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/20 disabled:opacity-60">
                {busy ? 'Working...' : 'Cancel this event'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
