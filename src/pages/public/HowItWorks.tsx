import { Link } from 'react-router-dom'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { CtaBand, btnOutline, btnPrimary } from '../../components/public/ui'
import { Reveal } from '../../components/public/motion'
import { usePageMeta } from '../../lib/usePageMeta'
import { CLIENT_LOGIN, GET_HELP, howItWorks, principles } from '../../data/publicSite'

export default function HowItWorks() {
  usePageMeta(
    'How Pinnacle Works',
    'Tell us what is going on. Pinnacle reviews the matter, names who is handling it, and stays with the work through completion.',
  )

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main>
        <section className="pmv-hero-story relative overflow-hidden border-b border-white/10">
          <div className="pmv-hero-gold" aria-hidden="true" />
          <div className="container-pmv py-16 sm:py-20">
            <Reveal className="max-w-3xl">
              <p className="eyebrow">How It Works</p>
              <h1 className="mt-4 font-display text-4xl font-bold text-white sm:text-6xl">You do not need to diagnose the service first.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                Start with the situation. We review the matter, establish ownership, coordinate what is needed, and follow through until the agreed work is complete.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={GET_HELP} className={btnPrimary}>Tell Us What You Need Help With</Link>
                <Link to="/services" className={btnOutline}>Explore Services</Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="container-pmv py-16 sm:py-20">
          <div className="divide-y divide-white/10 border-y border-white/10">
            {howItWorks.map(([title, body], i) => (
              <Reveal key={title} className="grid gap-3 py-8 sm:grid-cols-[56px_minmax(200px,.7fr)_1fr] sm:items-start">
                <span className="font-display text-sm font-bold text-gold/70">0{i + 1}</span>
                <h2 className="font-display text-xl font-bold text-white">{title}</h2>
                <p className="text-sm leading-7 text-slate-400">{body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="border-y border-gold/15 bg-gold/[.04]">
          <div className="container-pmv py-14 sm:py-16">
            <Reveal className="max-w-3xl">
              <p className="eyebrow">The Pinnacle approach</p>
              <h2 className="mt-3 font-display text-3xl font-bold text-white">Four operating principles.</h2>
            </Reveal>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {principles.map(([title, body]) => (
                <Reveal key={title} className="border-t border-gold/25 pt-5">
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <CtaBand
          title="What Can We Help You Get Handled?"
          body="You do not have to know the correct service. Tell us what is going on."
          primary={{ to: GET_HELP, label: 'Tell Us What You Need Help With' }}
          secondary={{ to: CLIENT_LOGIN, label: 'Existing Client? Sign In' }}
        />
      </main>
      <Footer />
    </div>
  )
}
