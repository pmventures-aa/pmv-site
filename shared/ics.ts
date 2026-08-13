export interface CalendarEvent {
  id: string
  title: string
  startsAt: string
  durationMinutes?: number
  description?: string
  location?: string
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function toIcsDate(value: string): string {
  const normalized = value.trim().replace(' ', 'T')
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return normalized.replace(/[-:]/g, '').replace(/\.\d+Z?$/, '').replace('T', '').slice(0, 15).padEnd(15, '0')
  }
  return `${parsed.getFullYear()}${pad(parsed.getMonth() + 1)}${pad(parsed.getDate())}T${pad(parsed.getHours())}${pad(parsed.getMinutes())}${pad(parsed.getSeconds())}`
}

export function addMinutesIcs(start: string, minutes: number): string {
  const parsed = new Date(start.trim().replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return toIcsDate(start)
  parsed.setMinutes(parsed.getMinutes() + minutes)
  return `${parsed.getFullYear()}${pad(parsed.getMonth() + 1)}${pad(parsed.getDate())}T${pad(parsed.getHours())}${pad(parsed.getMinutes())}${pad(parsed.getSeconds())}`
}

export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line
  const parts = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  return parts.join('\r\n')
}

export function buildIcs(events: CalendarEvent[], calendarName = 'Pinnacle'): string {
  const stamp = toIcsDate(new Date().toISOString().slice(0, 19))
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pinnacle Management Ventures//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(calendarName)}`),
  ]
  for (const event of events) {
    const start = toIcsDate(event.startsAt)
    const end = addMinutesIcs(event.startsAt, event.durationMinutes ?? 60)
    lines.push(
      'BEGIN:VEVENT',
      foldIcsLine(`UID:${event.id}@pinnaclemanagementventures.com`),
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      foldIcsLine(`SUMMARY:${escapeIcsText(event.title || 'Pinnacle appointment')}`),
    )
    if (event.description) lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(event.description)}`))
    if (event.location) lines.push(foldIcsLine(`LOCATION:${escapeIcsText(event.location)}`))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}
