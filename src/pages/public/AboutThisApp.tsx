import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { btnOutline, btnPrimary } from '../../components/public/ui'
import { Reveal } from '../../components/public/motion'
import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { usePageMeta } from '../../lib/usePageMeta'

// Public, unauthenticated description of the Pinnacle application, written for
// the Google OAuth verification review.
//
// The first submission was rejected twice over: the home page was behind a
// login, and it did not explain the purpose of the app. Both came from
// pointing the consent screen at Pinnacle HQ, which is a sign-in form. This
// page exists so the answer is unambiguous: no authentication, on the verified
// domain, and it describes the application and the Google Calendar connection
// in plain terms rather than marketing copy.
//
// It is deliberately NOT the marketing home page. A reviewer needs to read
// what the software does; a visitor needs to book a service. Those are
// different jobs and one page doing both serves neither.

const SCOPES = [
  {
    id: 'https://www.googleapis.com/auth/calendar.readonly',
    label: 'See and download your calendars',
    what: 'Reads only free/busy periods: the start and end times of blocks when the staff member is already occupied. Google returns no event titles, descriptions, guests, or locations from this request, and Pinnacle does not ask for them.',
    why: 'So the public booking page never offers an appointment time the staff member cannot actually attend.',
  },
  {
    id: 'https://www.googleapis.com/auth/calendar.events',
    label: 'View and edit events on your calendars',
    what: 'Creates one calendar event when a consultation is booked, and deletes that same event if the consultation is cancelled. No attendees are added, so Google does not email anyone on the staff member’s behalf. No other events are read or changed.',
    why: 'So a confirmed booking appears on the calendar the staff member actually works from, and a cancellation clears the hold.',
  },
]

const STEPS = [
  ['A visitor opens the booking page', 'They see only appointment times that are genuinely open. No account is required to book.'],
  ['Pinnacle checks the connected calendar', 'Free/busy data decides which times to show. It is never displayed to the visitor and is never stored.'],
  ['The visitor confirms a time', 'Pinnacle records the booking, emails a confirmation, and creates a video meeting when the visitor chooses a video call.'],
  ['The booking reaches the staff calendar', 'A single event is written to the connected Google Calendar so the appointment is visible outside Pinnacle.'],
]

export default function AboutThisApp() {
  usePageMeta(
    'About the Pinnacle Application',
    'What the Pinnacle Management Ventures scheduling application does, and exactly how it uses Google Calendar data.',
  )

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main>
        <section className="container-pmv py-14 sm:py-20">
          <Reveal className="max-w-3xl">
            <p className="eyebrow">About this application</p>
            <h1 className="pmv-h1 mt-4">Pinnacle Management Ventures</h1>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              Pinnacle Management Ventures is a professional services company. This page describes the software we
              operate at pinnaclemanagementventures.com, what it does, and precisely how it uses Google Calendar data.
              No sign-in is required to read any of it.
            </p>
          </Reveal>
        </section>

        <section className="container-pmv border-t border-white/10 py-14">
          <Reveal className="max-w-3xl">
            <h2 className="font-display text-2xl font-medium text-white sm:text-3xl">What the application does</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              The application lets a member of the public request a service or book a consultation without creating an
              account, and lets Pinnacle staff manage that work through to completion. It handles intake, scheduling,
              documents, and communication in one place.
            </p>
            <p className="mt-4 text-base leading-7 text-slate-400">
              The part that uses Google is scheduling. A Pinnacle staff member may connect their own Google Calendar so
              that consultation times offered to the public reflect when they are genuinely free, and so confirmed
              bookings appear on the calendar they already work from.
            </p>
          </Reveal>
        </section>

        <section className="container-pmv border-t border-white/10 py-14">
          <Reveal className="max-w-3xl">
            <h2 className="font-display text-2xl font-medium text-white sm:text-3xl">How a booking works</h2>
          </Reveal>
          <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {STEPS.map(([title, body], i) => (
              <Reveal key={title} className="grid gap-3 py-6 sm:grid-cols-[48px_minmax(180px,.65fr)_1fr] sm:items-start">
                <span className="font-display text-sm font-bold text-gold/70">0{i + 1}</span>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-sm leading-6 text-slate-400">{body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="container-pmv border-t border-white/10 py-14">
          <Reveal className="max-w-3xl">
            <h2 className="font-display text-2xl font-medium text-white sm:text-3xl">Google Calendar access</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Only a signed-in Pinnacle staff member can connect a calendar, through Google&rsquo;s own consent screen,
              to their own account. Two scopes are requested and each is used for one purpose.
            </p>
          </Reveal>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {SCOPES.map((scope) => (
              <Reveal key={scope.id} className="rounded-xl border border-white/10 bg-white/[.025] p-6">
                <p className="text-sm font-bold text-white">{scope.label}</p>
                <p className="mt-2 break-all font-mono text-[11px] leading-5 text-gold/80">{scope.id}</p>
                <p className="mt-4 text-sm leading-6 text-slate-400"><span className="font-semibold text-slate-200">What it accesses. </span>{scope.what}</p>
                <p className="mt-3 text-sm leading-6 text-slate-400"><span className="font-semibold text-slate-200">Why it is needed. </span>{scope.why}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="container-pmv border-t border-white/10 py-14">
          <Reveal className="max-w-3xl">
            <h2 className="font-display text-2xl font-medium text-white sm:text-3xl">What we do with the data</h2>
            <ul className="mt-5 space-y-3 text-base leading-7 text-slate-400">
              <li><span className="font-semibold text-slate-200">Not shared.</span> Google user data is never sold, never transferred to a third party, never used for advertising, and never used to train machine learning or artificial intelligence models.</li>
              <li><span className="font-semibold text-slate-200">Not stored.</span> Free/busy periods are held in a cache for at most two minutes and never written to our database. Calendar event content is never stored.</li>
              <li><span className="font-semibold text-slate-200">Not visible to anyone else.</span> Availability is used to decide which times to display. It is never shown to a visitor, a client, or another staff member.</li>
              <li><span className="font-semibold text-slate-200">Encrypted.</span> The access and refresh tokens Google issues are encrypted at rest.</li>
              <li><span className="font-semibold text-slate-200">Removable at any time.</span> Disconnecting in Pinnacle HQ revokes the grant with Google and deletes the stored tokens. Access can also be removed directly at myaccount.google.com/permissions.</li>
            </ul>
            <p className="mt-6 text-base leading-7 text-slate-400">
              Pinnacle&rsquo;s use and transfer of information received from Google APIs adheres to the Google API
              Services User Data Policy, including its Limited Use requirements.
            </p>
          </Reveal>
        </section>

        <section className="container-pmv border-t border-white/10 py-14">
          <Reveal className="flex flex-wrap items-center gap-3">
            <ViewTransitionLink to="/privacy" className={btnPrimary}>Privacy Policy</ViewTransitionLink>
            <ViewTransitionLink to="/terms" className={btnOutline}>Terms of Service</ViewTransitionLink>
            <ViewTransitionLink to="/consultation" className={btnOutline}>See the booking page</ViewTransitionLink>
          </Reveal>
          <Reveal className="mt-6 text-sm leading-6 text-slate-500">
            <p>Pinnacle Management Ventures · orders@pinnaclemanagementventures.com</p>
          </Reveal>
        </section>
      </main>
      <Footer />
    </div>
  )
}
