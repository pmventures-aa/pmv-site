import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { Reveal } from '../../components/public/motion'
import { usePageMeta } from '../../lib/usePageMeta'
import { strPackageLabel } from '../../../shared/strWorkspace'

const STEPS = [
  { title: 'Get a quote', body: 'Tell us about the property, its size, and how often it turns over. You get a per-turnover price in writing - no surprise fees, no per-supply invoices.' },
  { title: 'We schedule & dispatch', body: 'Your reservation feed or calendar sync tells us when the guest leaves. A vetted Pinnacle provider is assigned and arrives with the checklist and the clock already running.' },
  { title: 'The checklist gets done', body: 'Every room on a tracked checklist, required photos, and a final walkthrough. Issues are flagged the moment they show up - with photos, not surprises later.' },
  { title: 'A gatekeeper verifies', body: 'No turnover is marked guest ready on trust alone. Pinnacle reviews the checklist, photos, and issues before your property is released to the next guest.' },
  { title: 'The report lands in your portal', body: 'Guest-ready status, checklist, photos, and any approved extras - all in one place. You know what happened without making a single call.' },
]

const PACKAGES = [
  {
    key: 'guest_ready' as const,
    tagline: 'The verified turnover, per reservation.',
    points: [
      'A tracked room-by-room checklist matched to your property',
      'Required completion photos of every key area',
      'Issues flagged with photos and a client-safe summary',
      'Independent verification before the property is released',
      'A guest-ready report in your portal',
    ],
    note: 'Flat per-turnover pricing quoted up front, based on your property size and package.',
  },
  {
    key: 'guest_ready_plus' as const,
    tagline: 'The verified turnover, plus approved extras handled.',
    points: [
      'Everything in Guest Ready',
      'Extra-condition work captured as an approved add-on, never a surprise charge',
      'Supply restock tracked to par with the current stock always visible',
      'Priority scheduling when a gap shows up',
    ],
    note: 'Ideal for hosts who want the middle-managed without the monthly retainer.',
    featured: true,
  },
  {
    key: 'managed' as const,
    tagline: 'Month-to-month support for the busy short-term rental.',
    points: [
      'Everything in Guest Ready+',
      'Reservation feeds auto-create turnovers from your iCal',
      'Supply par levels kept in stock automatically',
      'A monthly rate instead of per-turnover pricing',
    ],
    note: 'Best when every booking should just work without anyone thinking about it.',
  },
]

const FAQ = [
  ['What actually gets done during a turnover?', 'The checklist is built per property from a global standard: kitchen, bathrooms, bedrooms, living areas, laundry, supplies, and a final walkthrough. Your provider works the checklist, takes the required photos, and flags anything that needs your attention - with a photo and a plain-language summary.'],
  ['How do I know it actually happened?', 'Every turnover is reviewed by Pinnacle before it is marked guest ready. The checklist progress, completion photos, and any issues live in your portal, so the evidence is there before the next guest checks in.'],
  ['Can you connect to my Airbnb or VRBO calendar?', 'Yes. Connect your iCal feed once and we import the guest windows. Turnovers can even be auto-created from the feed when the profile is set up that way.'],
  ['What happens when something is broken or damaged?', 'It gets flagged during the turnover with photos. Standard conditions are handled in the work. Larger or excess conditions are sent to you for approval before we proceed - and any extra charge is itemized and approved before it appears on your bill.'],
  ['How is pricing decided?', 'Pricing comes from your property size, the package, and the number of turnovers. It is quoted in writing before you commit - no hidden per-supply fees, no surprise line items.'],
  ['Who does the work?', 'Vetted Pinnacle providers who operate under our checklist and verification process. You always see who is assigned and when the work happened.'],
]

export default function StrTurnover() {
  usePageMeta(
    'Short-Term Rental Turnover Support - Pinnacle Management Ventures',
    'Verified STR turnovers in South Florida: tracked checklists, required photos, issue flagging, and a guest-ready report in your portal. Per-turnover pricing quoted in writing.',
  )

  return (
    <div className="pmv-care-plans min-h-screen bg-navy-950">
      <Header />
      <main>
        <section className="pmv-hero-story relative overflow-hidden border-b border-white/[.08]">
          <div className="pmv-hero-gold" aria-hidden="true" />
          <div className="container-pmv relative z-10 py-14 sm:py-20 lg:py-24">
            <Reveal distance={14}>
              <p className="eyebrow">STR Turnover &amp; Property Support</p>
              <h1 className="mt-4 max-w-4xl font-display text-4xl font-extrabold leading-[1.04] tracking-[-.03em] text-white sm:text-6xl">YOUR PROPERTY. GUEST READY. WITHOUT THE RUNAROUND.</h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
                One accountable team handles the turnover, verifies the work, and puts the proof in your portal - so the next guest walks into a property you know was checked, not a property you hope was.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/str-quote" className="rounded-lg bg-gold px-5 py-2.5 text-sm font-bold text-navy-950 hover:bg-gold-300">GET A TURNOVER QUOTE</Link>
                <Link to="/str-quote?managed=1" className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-gold/40 hover:text-gold">MANAGE MULTIPLE PROPERTIES? TALK WITH PINNACLE</Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-b border-white/[.08]">
          <div className="container-pmv py-14 sm:py-18">
            <Reveal className="max-w-3xl" distance={14}>
              <p className="eyebrow">How it works</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white sm:text-4xl">From checkout to check-in, one owned process.</h2>
              <p className="mt-4 text-base leading-7 text-slate-400">No chasing three vendors between a checkout and a check-in. The turnover is one engagement with a tracked checklist, a verified finish, and the evidence in your portal.</p>
            </Reveal>
            <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 0.05} distance={12}>
                  <li className="h-full rounded-2xl border border-white/10 bg-white/[.025] p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Step {String(index + 1).padStart(2, '0')}</p>
                    <h3 className="mt-3 font-display text-lg font-bold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{step.body}</p>
                  </li>
                </Reveal>
              ))}
              <Reveal delay={STEPS.length * 0.05} distance={12}>
                <li className="flex h-full flex-col justify-center rounded-2xl border border-gold/20 bg-gold/[.04] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Start here</p>
                  <h3 className="mt-3 font-display text-lg font-bold text-white">Ready for a guest-ready property?</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Get your turnover price in writing today.</p>
                  <Link to="/str-quote" className="mt-4 inline-flex text-sm font-bold text-gold hover:underline">Get a turnover quote →</Link>
                </li>
              </Reveal>
            </ol>
          </div>
        </section>

        <section id="packages" className="border-b border-white/[.08]">
          <div className="container-pmv py-14 sm:py-18">
            <Reveal className="max-w-3xl" distance={14}>
              <p className="eyebrow">Packages</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white sm:text-4xl">A verified turnover, in three shapes.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">Every package includes the tracked checklist, required photos, issue flagging, independent verification, and the portal report. Pricing is quoted in writing for your property - no hidden per-supply fees.</p>
            </Reveal>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {PACKAGES.map((pkg, index) => (
                <Reveal key={pkg.key} delay={index * 0.06} distance={15}>
                  <article className={`flex h-full flex-col rounded-2xl border p-6 ${pkg.featured ? 'border-gold/40 bg-gold/[.05]' : 'border-white/10 bg-white/[.02]'}`}>
                    {pkg.featured && <span className="mb-2 self-start rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.14em] text-gold">Most popular</span>}
                    <h3 className="font-display text-2xl font-bold text-white">{strPackageLabel(pkg.key)}</h3>
                    <p className="mt-1 text-sm text-slate-400">{pkg.tagline}</p>
                    <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-300">
                      {pkg.points.map((point) => (
                        <li key={point} className="flex gap-2"><span className="mt-1 text-gold">✓</span><span className="leading-6">{point}</span></li>
                      ))}
                    </ul>
                    <p className="mt-5 rounded-lg border border-white/10 bg-navy-950/40 p-3 text-[11px] leading-5 text-slate-400">{pkg.note}</p>
                    <Link to={pkg.key === 'managed' ? '/str-quote?managed=1' : '/str-quote'} className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-bold ${pkg.featured ? 'bg-gold text-navy-950 hover:bg-gold-300' : 'border border-white/15 text-white hover:border-gold/40 hover:text-gold'}`}>Get a quote</Link>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/[.08] bg-navy-900/30">
          <div className="container-pmv py-14 sm:py-18">
            <Reveal className="max-w-3xl" distance={14}>
              <p className="eyebrow">Your portal</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white sm:text-4xl">Proof, not promises.</h2>
              <p className="mt-4 text-base leading-7 text-slate-400">Every turnover shows up in your client portal the way your guests see the property: current status, the next step, the checklist, the photos, and any issue that needed you.</p>
            </Reveal>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {['Live status & next step', 'Tracked checklist progress', 'Completion photos per room', 'Issues flagged with approval'].map((feature) => (
                <Reveal key={feature} distance={12}>
                  <article className="h-full rounded-xl border border-white/10 bg-white/[.02] p-5 text-sm font-semibold text-white">{feature}</article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/[.08]">
          <div className="container-pmv py-14 sm:py-18">
            <Reveal className="max-w-3xl" distance={14}>
              <p className="eyebrow">Common questions</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white sm:text-4xl">Before you ask.</h2>
            </Reveal>
            <div className="mt-10 grid gap-3 lg:grid-cols-2">
              {FAQ.map(([q, a]) => (
                <Reveal key={q} distance={12}>
                  <article className="h-full rounded-xl border border-white/10 bg-white/[.02] p-5">
                    <h3 className="text-sm font-bold text-white">{q}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{a}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-gold/15 bg-gradient-to-br from-gold/[.05] via-transparent to-transparent">
          <div className="container-pmv py-14 sm:py-18">
            <Reveal className="mx-auto max-w-3xl text-center" distance={15}>
              <p className="eyebrow">Get started</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-[-.03em] text-white sm:text-4xl">Your next guest should never see your last turnover.</h2>
              <p className="mt-4 text-base leading-7 text-slate-400">Tell us about the property and how often it turns over. A real person replies within two business hours with your pricing in writing.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/str-quote" className="rounded-lg bg-gold px-6 py-3 text-sm font-bold text-navy-950 hover:bg-gold-300">GET A TURNOVER QUOTE</Link>
                <Link to="/contact" className="rounded-lg border border-white/15 px-6 py-3 text-sm font-bold text-white hover:border-gold/40 hover:text-gold">Talk to Pinnacle</Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
