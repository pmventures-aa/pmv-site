// Shared Calendar / Scheduling workspace.
// Pure helpers shared by the Hono API layer and both React surfaces
// (HQ calendar + Client Portal calendar). No I/O here so it is unit-testable.

export const CALENDAR_EVENT_TYPES = [
  'appointment',
  'consultation',
  'follow_up',
  'task_deadline',
  'document_deadline',
  'signature_deadline',
  'invoice_due',
  'payment_follow_up',
  'matter_deadline',
  'property_inspection',
  'field_visit',
  'vendor_appointment',
  'client_meeting',
  'internal_meeting',
  'phone_call',
  'virtual_meeting',
  'reminder',
  'custom',
] as const

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number]

export const CALENDAR_EVENT_STATUSES = ['proposed', 'confirmed', 'completed', 'cancelled'] as const
export type CalendarEventStatus = (typeof CALENDAR_EVENT_STATUSES)[number]

export const CALENDAR_LOCATION_TYPES = ['virtual', 'phone', 'office', 'field', 'client_location', 'other'] as const
export type CalendarLocationType = (typeof CALENDAR_LOCATION_TYPES)[number]

export const CALENDAR_VISIBILITY = ['client', 'internal'] as const
export type CalendarVisibility = (typeof CALENDAR_VISIBILITY)[number]

// Unified calendar item — the shape every calendar surface consumes.
// `derived` marks entries computed from a domain table (task/invoice/…)
// rather than a stored calendar_events row; those are read-only.
export interface CalendarEventItem {
  id: string
  derived?: boolean
  title: string
  description?: string | null
  startsAt: string
  endsAt?: string | null
  allDay?: boolean
  timezone?: string | null
  eventType: CalendarEventType
  status: CalendarEventStatus
  locationType?: CalendarLocationType | null
  locationName?: string | null
  address?: string | null
  meetingUrl?: string | null
  phoneNumber?: string | null
  assignedUserId?: string | null
  clientUserId?: string | null
  clientName?: string | null
  matterId?: string | null
  matterTitle?: string | null
  businessId?: string | null
  propertyId?: string | null
  propertyLabel?: string | null
  vendorUserId?: string | null
  vendorName?: string | null
  taskId?: string | null
  invoiceId?: string | null
  envelopeId?: string | null
  documentId?: string | null
  visibility: CalendarVisibility
  clientVisible: boolean
  // Deep link target (portal or HQ route path, without basePath prefix).
  sourcePath?: string | null
}

const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  appointment: 'Appointment',
  consultation: 'Consultation',
  follow_up: 'Follow-up',
  task_deadline: 'Task deadline',
  document_deadline: 'Document deadline',
  signature_deadline: 'Signature deadline',
  invoice_due: 'Invoice due',
  payment_follow_up: 'Payment follow-up',
  matter_deadline: 'Matter deadline',
  property_inspection: 'Property inspection',
  field_visit: 'Field visit',
  vendor_appointment: 'Vendor appointment',
  client_meeting: 'Client meeting',
  internal_meeting: 'Internal meeting',
  phone_call: 'Phone call',
  virtual_meeting: 'Virtual meeting',
  reminder: 'Reminder',
  custom: 'Event',
}

export function calendarEventTypeLabel(type?: string | null): string {
  if (!type) return 'Event'
  return EVENT_TYPE_LABELS[type as CalendarEventType] ?? type.replace(/_/g, ' ')
}

export function isCalendarEventType(value: string | null | undefined): value is CalendarEventType {
  return !!value && (CALENDAR_EVENT_TYPES as readonly string[]).includes(value)
}

export function isCalendarEventStatus(value: string | null | undefined): value is CalendarEventStatus {
  return !!value && (CALENDAR_EVENT_STATUSES as readonly string[]).includes(value)
}

export function isCalendarLocationType(value: string | null | undefined): value is CalendarLocationType {
  return !!value && (CALENDAR_LOCATION_TYPES as readonly string[]).includes(value)
}

export function isCalendarVisibility(value: string | null | undefined): value is CalendarVisibility {
  return !!value && (CALENDAR_VISIBILITY as readonly string[]).includes(value)
}

export type Tone = 'gold' | 'green' | 'blue' | 'slate' | 'red'

const EVENT_TONE: Record<CalendarEventType, Tone> = {
  appointment: 'blue',
  consultation: 'blue',
  follow_up: 'gold',
  task_deadline: 'gold',
  document_deadline: 'gold',
  signature_deadline: 'red',
  invoice_due: 'red',
  payment_follow_up: 'red',
  matter_deadline: 'red',
  property_inspection: 'blue',
  field_visit: 'blue',
  vendor_appointment: 'blue',
  client_meeting: 'gold',
  internal_meeting: 'slate',
  phone_call: 'slate',
  virtual_meeting: 'blue',
  reminder: 'gold',
  custom: 'slate',
}

export function calendarEventTone(type?: string | null): Tone {
  if (!type) return 'slate'
  return EVENT_TONE[type as CalendarEventType] ?? 'slate'
}

const STATUS_TONE: Record<CalendarEventStatus, Tone> = {
  proposed: 'gold',
  confirmed: 'green',
  completed: 'slate',
  cancelled: 'red',
}

export function calendarEventStatusTone(status?: string | null): Tone {
  if (!status) return 'slate'
  return STATUS_TONE[status as CalendarEventStatus] ?? 'slate'
}

export function calendarEventStatusLabel(status?: string | null): string {
  if (!status) return 'Not set'
  return (status as string).replace(/_/g, ' ')
}

const LOCATION_LABELS: Record<CalendarLocationType, string> = {
  virtual: 'Virtual meeting',
  phone: 'Phone call',
  office: 'Pinnacle office',
  field: 'Field / on-site',
  client_location: 'Client location',
  other: 'Other location',
}

export function calendarLocationLabel(type?: string | null): string {
  if (!type) return 'No location set'
  return LOCATION_LABELS[type as CalendarLocationType] ?? type.replace(/_/g, ' ')
}

// ---- Date helpers (all local-time math; inputs are ISO / 'YYYY-MM-DD HH:mm:ss' UTC) ----

export function parseCalendarDate(value: string): Date {
  const normalized = value.trim().replace(' ', 'T')
  const parsed = new Date(normalized.length <= 10 ? `${normalized}T12:00:00` : normalized)
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(value)
    return Number.isNaN(fallback.getTime()) ? new Date() : fallback
  }
  return parsed
}

export function toLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// Day key 'YYYY-MM-DD' in the browser's local timezone.
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function dayKeyOfIso(value: string): string {
  return dayKey(parseCalendarDate(value))
}

// Whether two ISO values land on the same local calendar day.
export function sameDay(a: string, b: string): boolean {
  return dayKeyOfIso(a) === dayKeyOfIso(b)
}

// Start of a week (Sunday) for the given date.
export function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  copy.setDate(copy.getDate() - copy.getDay())
  return copy
}

// 7 day keys starting on the Sunday containing `date`.
export function weekDayKeys(date: Date): string[] {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)))
}

// All day keys in the month containing `date` (calendar grid cells, with
// leading/trailing blanks from adjacent months filled so the grid is a
// full 6-row week grid when needed).
export function monthGridDayKeys(date: Date): string[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const first = new Date(year, month, 1)
  const gridStart = startOfWeek(first)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const trailing = new Date(year, month, daysInMonth)
  const gridEnd = new Date(trailing.getFullYear(), trailing.getMonth(), trailing.getDate() + (6 - trailing.getDay()))
  const keys: string[] = []
  const cursor = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate())
  while (cursor <= gridEnd) {
    keys.push(dayKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

// Compact time-of-day label for an ISO value (e.g. "9:30 AM").
export function calendarTimeLabel(value: string): string {
  const date = parseCalendarDate(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// Label for an event's start/end window ("9:30 AM", "9:30 AM – 10:00 AM").
export function calendarWindowLabel(start: string, end?: string | null): string {
  const from = calendarTimeLabel(start)
  if (!end) return from
  const to = calendarTimeLabel(end)
  return to === from ? from : `${from} – ${to}`
}

// Human-friendly "Today / Tomorrow / Mon, Jan 5" for a date key.
export function calendarDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  if (dayKey(today) === dateKey) return 'Today'
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (dayKey(tomorrow) === dateKey) return 'Tomorrow'
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (dayKey(yesterday) === dateKey) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// Sort a list of events by start time (stable for same-start).
export function sortCalendarEvents<T extends { startsAt: string; title: string }>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const da = parseCalendarDate(a.startsAt).getTime()
    const db = parseCalendarDate(b.startsAt).getTime()
    if (da !== db) return da - db
    return a.title.localeCompare(b.title)
  })
}

// Default duration (minutes) applied when a stored event has no ends_at.
export function defaultEventDurationMinutes(eventType?: string | null, allDay?: boolean): number {
  if (allDay) return 24 * 60
  if (eventType === 'phone_call') return 30
  if (eventType === 'consultation') return 60
  return 60
}
