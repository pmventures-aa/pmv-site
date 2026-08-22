import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { api, ApiError } from '../../lib/api'
import { usePageMeta } from '../../lib/usePageMeta'
import { WEEKDAY_INITIALS, firstOfMonth, monthGrid, shiftMonth } from '../../../shared/dayBlocking'

// Public consultation booking.
//
// Slot instants arrive from the API in UTC and are rendered in the VISITOR's
// own timezone, not the host's. Someone booking from Denver should see the
// time they will actually take the call, with the zone named so there is no
// ambiguity about what they picked.

interface Slot { startsAt: string; endsAt: string }
interface SlotDay { dateKey: string; slots: Slot[] }
interface ScheduleInfo {
  slug: string
  name: string
  description: string | null
  timezone: string
  slotMinutes: number
  locationType: string
  minNoticeMinutes: number
  maxAdvanceDays: number
}
interface AvailabilityResponse {
  bookable: boolean
  schedule: ScheduleInfo | null
  range?: { from: string; to: string }
  days: SlotDay[]
}
interface BookingResponse {
  booking: { ref: string; startsAt: string; endsAt: string; timezone: string; whenLabel: string; manageUrl: string }
}

const viewerZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

const zoneLabel = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date(iso))
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
}

// Day headings come from a slot instant rather than the dateKey, so the label
// matches the timezone the times beside it are rendered in.
const dayHeading = (day: SlotDay) => {
  const first = day.slots[0]
  if (!first) return day.dateKey
  return new Date(first.startsAt).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

const longLabel = (iso: string) =>
  `${new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} at ${timeLabel(iso)} ${zoneLabel(iso)}`

export default function Consultation() {
  // /book is a short link to share; /consultation is the address the site
  // links internally. Both render this page, and the canonical pins them to
  // one so they do not compete as separate pages for the same content.
  usePageMeta(
    'Book a Consultation | Pinnacle Management Ventures',
    'Pick a time that works and speak with someone about what you need.',
    { canonicalPath: '/consultation' },
  )

  const [data, setData] = useState<AvailabilityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<Slot | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', topic: '' })
  const [meetingFormat, setMeetingFormat] = useState<'virtual' | 'phone'>('virtual')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [booked, setBooked] = useState<BookingResponse['booking'] | null>(null)
  const [activeDay, setActiveDay] = useState<string | null>(null)

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      setData(await api.get<AvailabilityResponse>('/consultation/availability'))
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'We could not load available times.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const days = useMemo(() => (data?.days ?? []).filter((d) => d.slots.length > 0), [data])

  // Open on the next available day rather than an empty right-hand column.
  // Re-runs after a 409 reload, and keeps the current day if it survived.
  useEffect(() => {
    if (!days.length) { setActiveDay(null); return }
    setActiveDay((current) => (current && days.some((d) => d.dateKey === current)) ? current : days[0].dateKey)
  }, [days])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const response = await api.post<BookingResponse>('/consultation/book', {
        startsAt: selected.startsAt,
        name: form.name,
        email: form.email,
        phone: form.phone,
        topic: form.topic,
        meetingFormat,
      })
      setBooked(response.booking)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'We could not complete that booking.'
      setError(message)
      // Someone else took the slot between render and submit. Refresh the grid
      // and drop the stale selection so the next tap is against live data.
      if (err instanceof ApiError && err.status === 409) {
        setSelected(null)
        void load()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main className="container-pmv py-12 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="eyebrow">Consultation</p>
          <h1 className="pmv-h1 mt-3">Book a time to talk.</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
            Pick a time that works for you and tell us briefly what you need. A person from Pinnacle
            will be on the call.
          </p>

          {booked ? (
            <BookedPanel booking={booked} />
          ) : loading ? (
            <LoadingPanel />
          ) : loadError ? (
            <FallbackPanel message={loadError} onRetry={() => void load()} />
          ) : !data?.bookable || !days.length ? (
            <FallbackPanel message="Online booking is not open right now." />
          ) : selected ? (
            <form onSubmit={submit} className="mt-9">
              <button
                type="button" onClick={() => setSelected(null)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-gold"
              >
                <ChevronLeft className="h-4 w-4" /> Pick a different time
              </button>
              <div className="mt-4 rounded-2xl border border-gold/25 bg-gold/[.05] px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">Your time</p>
                <p className="mt-1 font-display text-xl font-bold text-white">{longLabel(selected.startsAt)}</p>
              </div>

              <div className="mt-5 grid gap-4 rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:grid-cols-2 sm:p-7">
                <label className="text-xs font-bold text-slate-300">
                  Your name
                  <input
                    className="input mt-2" autoComplete="name" required autoFocus
                    value={form.name} onChange={(e) => set('name', e.target.value)}
                  />
                </label>
                <label className="text-xs font-bold text-slate-300">
                  Email
                  <input
                    className="input mt-2" type="email" autoComplete="email" required
                    value={form.email} onChange={(e) => set('email', e.target.value)}
                  />
                </label>
                {data.schedule?.locationType === 'virtual' && (
                  <fieldset className="sm:col-span-2">
                    <legend className="text-xs font-bold text-slate-300">How would you like to meet?</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {([['virtual', 'Video call'], ['phone', 'Phone call']] as const).map(([value, text]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={meetingFormat === value}
                          onClick={() => setMeetingFormat(value)}
                          className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition ${
                            meetingFormat === value
                              ? 'border-gold bg-gold/[.12] text-white'
                              : 'border-white/10 bg-white/[.025] text-slate-300 hover:border-gold/40 hover:text-white'
                          }`}
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {meetingFormat === 'virtual'
                        ? 'We will email you a video link with your confirmation.'
                        : 'We will call the number below at your chosen time.'}
                    </p>
                  </fieldset>
                )}
                <label className="text-xs font-bold text-slate-300 sm:col-span-2">
                  Phone {meetingFormat === 'phone' ? '' : '(optional)'}
                  <input
                    className="input mt-2" type="tel" autoComplete="tel"
                    required={meetingFormat === 'phone'}
                    value={form.phone} onChange={(e) => set('phone', e.target.value)}
                  />
                </label>
                <label className="text-xs font-bold text-slate-300 sm:col-span-2">
                  What would you like to cover? (optional)
                  <textarea
                    className="input mt-2 min-h-24" rows={3}
                    value={form.topic} onChange={(e) => set('topic', e.target.value)}
                  />
                </label>
                {error && <p role="alert" className="text-sm text-red-200 sm:col-span-2">{error}</p>}
                <button type="submit" disabled={busy} className="btn-gold min-h-12 sm:col-span-2">
                  {busy ? 'Booking...' : 'Confirm Booking'}
                </button>
              </div>
            </form>
          ) : (
            <SlotPicker
              days={days}
              activeDay={activeDay}
              onPickDay={setActiveDay}
              onPickSlot={setSelected}
              slotMinutes={data.schedule?.slotMinutes ?? 30}
            />
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}

/**
 * Date first, then that day's times.
 *
 * The previous version rendered every open slot on one page. Against the live
 * schedule that is eighty buttons in a single scroll, which is a wall rather
 * than a choice. Every scheduling tool people already know works the other
 * way round: a month to pick a day, then the handful of times on it.
 *
 * The month grid comes from shared/dayBlocking, the same helper the HQ time-off
 * calendar uses, so both calendars agree on what a month looks like.
 */
function SlotPicker({
  days, activeDay, onPickDay, onPickSlot, slotMinutes,
}: {
  days: SlotDay[]
  activeDay: string | null
  onPickDay: (dateKey: string) => void
  onPickSlot: (slot: Slot) => void
  slotMinutes: number
}) {
  const byDay = useMemo(() => new Map(days.map((d) => [d.dateKey, d])), [days])
  const firstKey = days[0]?.dateKey ?? ''
  const [month, setMonth] = useState(() => firstOfMonth(activeDay || firstKey || '2026-01-01'))

  // Follow the selection when it moves to another month, so "next available"
  // never lands the user on a grid that does not contain it.
  useEffect(() => {
    if (activeDay) setMonth(firstOfMonth(activeDay))
  }, [activeDay])

  const grid = useMemo(() => monthGrid(month), [month])
  const openDay = activeDay ? byDay.get(activeDay) : undefined
  const lastKey = days[days.length - 1]?.dateKey ?? firstKey
  const canGoBack = month > firstOfMonth(firstKey)
  const canGoForward = month < firstOfMonth(lastKey)

  return (
    <div className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button" disabled={!canGoBack} onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="rounded-lg p-2 text-slate-400 transition hover:text-gold disabled:opacity-25"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="font-display text-base font-bold text-white">{grid.label}</p>
          <button
            type="button" disabled={!canGoForward} onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="rounded-lg p-2 text-slate-400 transition hover:text-gold disabled:opacity-25"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {WEEKDAY_INITIALS.map((initial, i) => (
            <span key={i} className="py-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-600">{initial}</span>
          ))}
          {grid.weeks.flat().map((dateKey, i) => {
            if (!dateKey) return <span key={`pad-${i}`} />
            const open = byDay.has(dateKey)
            const active = dateKey === activeDay
            return (
              <button
                key={dateKey}
                type="button"
                disabled={!open}
                onClick={() => onPickDay(dateKey)}
                aria-pressed={active}
                aria-label={`${dateKey}${open ? `, ${byDay.get(dateKey)?.slots.length} times available` : ', no times'}`}
                className={`min-h-11 rounded-xl border text-sm font-bold tabular-nums transition ${
                  active
                    ? 'border-gold bg-gold/[.14] text-white'
                    : open
                      ? 'border-gold/25 bg-gold/[.05] text-slate-100 hover:border-gold/60 hover:bg-gold/[.10]'
                      : 'cursor-not-allowed border-transparent text-slate-700'
                }`}
              >
                {Number(dateKey.slice(8))}
              </button>
            )
          })}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Highlighted days have openings. Each call is {slotMinutes} minutes.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-5 sm:p-6">
        {openDay ? (
          <>
            <p className="font-display text-base font-bold text-white">{dayHeading(openDay)}</p>
            <p className="mt-1 text-xs text-slate-400">Times in your timezone ({viewerZone()}).</p>
            {/* Capped height so a long day scrolls inside the card instead of
                stretching the page past the calendar beside it. */}
            <div className="mt-4 grid max-h-[22rem] gap-2 overflow-y-auto pr-1">
              {openDay.slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => onPickSlot(slot)}
                  className="min-h-11 shrink-0 rounded-xl border border-white/12 bg-white/[.03] px-4 text-sm font-semibold text-slate-200 transition hover:border-gold hover:bg-gold/[.10] hover:text-white"
                >
                  {timeLabel(slot.startsAt)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Pick a highlighted day to see its times.</p>
        )}
      </div>
    </div>
  )
}

function LoadingPanel() {
  return (
    <div className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]" role="status" aria-label="Loading available times">
      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-6">
        <div className="mx-auto h-4 w-32 animate-pulse rounded bg-white/[.07]" />
        <div className="mt-5 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-white/[.05]" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-white/[.07]" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-white/[.05]" />
          ))}
        </div>
      </div>
    </div>
  )
}

function BookedPanel({ booking }: { booking: BookingResponse['booking'] }) {
  return (
    <div className="mt-10 rounded-2xl border border-gold/25 bg-gold/[.05] p-7">
      <p className="eyebrow">Booking confirmed</p>
      <p className="mt-3 font-display text-3xl font-bold text-white">{longLabel(booking.startsAt)}</p>
      <p className="mt-4 text-sm leading-6 text-slate-300">
        A confirmation is on its way to your email. We will send joining details before the call.
      </p>
      <p className="mt-4 text-sm leading-6 text-slate-400">
        Need to change it? Use{' '}
        <a href={`/consultation/booking?ref=${encodeURIComponent(booking.ref)}`} className="text-gold underline">
          your booking page
        </a>
        , or call (561) 388-7879.
      </p>
    </div>
  )
}

function FallbackPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-white/[.025] p-7">
      <h2 className="text-xl font-bold text-white">{message}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        Call (561) 388-7879 or email orders@pinnaclemanagementventures.com and we will find a time
        that works.
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline mt-5 min-h-11">
          Try Again
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Manage an existing booking, addressed only by its token.
// ---------------------------------------------------------------------------

interface BookingDetail {
  ref: string
  name: string
  topic: string | null
  startsAt: string
  endsAt: string
  timezone: string
  status: string
  whenLabel: string
  meetingUrl: string | null
}

export function ConsultationBooking() {
  usePageMeta('Your Consultation | Pinnacle Management Ventures', 'Review or cancel your booked consultation.')

  const ref = useMemo(() => new URLSearchParams(window.location.search).get('ref') || '', [])
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  useEffect(() => {
    if (!ref) { setLoading(false); setError('This link is missing its booking reference.'); return }
    let active = true
    api.get<{ booking: BookingDetail }>(`/consultation/booking/${encodeURIComponent(ref)}`)
      .then((r) => { if (active) setBooking(r.booking) })
      .catch(() => { if (active) setError('We could not find that booking.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [ref])

  async function cancel() {
    setBusy(true)
    try {
      await api.post(`/consultation/booking/${encodeURIComponent(ref)}/cancel`, {})
      setBooking((b) => (b ? { ...b, status: 'cancelled', meetingUrl: null } : b))
      setConfirmingCancel(false)
    } catch {
      setError('We could not cancel that booking. Call (561) 388-7879 and we will take care of it.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main className="container-pmv py-12 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <p className="eyebrow">Your consultation</p>
          {loading ? (
            <p className="mt-6 text-sm text-slate-400">Loading your booking...</p>
          ) : error || !booking ? (
            <FallbackPanel message={error || 'We could not find that booking.'} />
          ) : (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.025] p-7">
              <h1 className="pmv-h1 text-3xl">{longLabel(booking.startsAt)}</h1>
              <p className="mt-3 text-sm text-slate-400">
                Booked for {booking.name}.{' '}
                {booking.status === 'cancelled' ? 'This booking is cancelled.' : 'This booking is confirmed.'}
              </p>
              {booking.topic && (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  <span className="font-bold text-white">Topic:</span> {booking.topic}
                </p>
              )}
              {booking.meetingUrl && (
                <a href={booking.meetingUrl} className="btn-gold mt-6 inline-flex min-h-12 items-center">
                  Join the Call
                </a>
              )}
              {booking.status === 'booked' && (
                <div className="mt-7 border-t border-white/10 pt-6">
                  {confirmingCancel ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-slate-300">Cancel this consultation?</p>
                      <button type="button" onClick={() => void cancel()} disabled={busy} className="btn-outline min-h-11">
                        {busy ? 'Cancelling...' : 'Yes, Cancel It'}
                      </button>
                      <button type="button" onClick={() => setConfirmingCancel(false)} className="text-sm text-slate-400 underline">
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmingCancel(true)} className="text-sm text-slate-400 underline">
                      Cancel this consultation
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
