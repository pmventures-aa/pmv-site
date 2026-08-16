import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand, MotionStage } from '../components/public/ui'
import { AmbientGlow, Reveal, StaggerGroup, StaggerOnMount, staggerItem } from '../components/public/motion'
import { ViewTransitionLink } from '../components/public/ViewTransitionLink'
import { usePageMeta } from '../lib/usePageMeta'
import { usePublicVisitor } from '../lib/publicContext'
import type { OperatingWorld } from '../../shared/workspace'
import { HeroGuideRail } from '../components/public/HeroGuideRail'
import { ScopeWizard } from '../components/public/ScopeWizard'
import { CaseStudyStrip, PublicMetricsBand } from '../components/public/Proof'
import { CLIENT_LOGIN, GET_HELP, founder, howItWorks, pathways, portalHighlights, useCases, whyPinnacle } from '../data/publicSite'

const WORLD_BY_PATHWAY: Record<string, OperatingWorld> = { business: 'business', property: 'property', personal: 'documents' }
const WORLD_LABEL: Record<string, string> = { property: 'Property', documents: 'Document', business: 'Business', funding: 'Funding' }

function worldFromQuery(to: string): OperatingWorld | '' {
  const match = to.match(/[?&]world=([a-z]+)/)
  if (!match) return ''
  const value = match[1]
  if (value === 'property' || value === 'business' || value === 'documents' || value === 'funding') return value
  return ''
}

export default function Home() {
  const visitor = usePublicVisitor()
  usePageMeta(
    'Professional Support. One Call Away.',
    'Pinnacle Management Ventures helps businesses, property owners, and individuals get business, property, and administrative matters handled through one trusted point of contact.',
  )
  const heroCtaLabel = visitor.state.returning && visitor.state.world && visitor.state.world !== 'general'
    ? `Continue Your ${WORLD_LABEL[visitor.state.world] ?? 'Help'} Request`
    : 'Tell Us What You Need Help With'

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />
      <main>
        <section className="pmv-hero-story relative min-h-[calc(100vh-68px)] overflow-hidden border-b border-white/[.07]">
          <AmbientGlow />
          <div className="container-pmv relative z-10 grid min-h-[calc(100vh-68px)] gap-8 py-14 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-20">
            <StaggerOnMount>
              <motion.p variants={staggerItem} className="eyebrow">Nationwide professional support · South Florida field services</motion.p>
              <motion.h1 variants={staggerItem} className="pmv-h1 mt-6">
                <span className="block">Professional Support.</span>
                <span className="pmv-gold-text block">One Call Away.</span>
              </motion.h1>
              <motion.p variants={staggerItem} className="mt-7 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
                Business, property, and administrative matters handled through one trusted point of contact.
              </motion.p>
              <motion.p variants={staggerItem} className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
                Not sure which service you need? That is okay. Start with the situation and we will help determine the next step.
              </motion.p>
              <motion.div variants={staggerItem} className="mt-9 flex flex-wrap gap-3">
                <ViewTransitionLink to={GET_HELP} className={btnPrimary}>{heroCtaLabel}</ViewTransitionLink>
                <ViewTransitionLink to="/services" className={btnOutline}>Explore Services</ViewTransitionLink>
              </motion.div>
              <motion.p variants={staggerItem} className="mt-4 text-sm text-slate-500">
                Need a cleaning or inspection number first? <ViewTransitionLink to="/instant-quote" className="font-semibold text-gold hover:underline">Get an instant estimate</ViewTransitionLink>
              </motion.p>
            </StaggerOnMount>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.18 }} className="relative lg:min-h-[520px]">
              <HeroGuideRail />
            </motion.div>
          </div>
        </section>

        <section className="container-pmv py-16 sm:py-24">
          <Reveal className="grid gap-6 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <div>
              <p className="eyebrow">What brings you to Pinnacle?</p>
              <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">Three clear paths. One relationship.</h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-slate-400">
              Pinnacle&apos;s breadth is intentional. You do not need to diagnose the exact service before you contact us.
            </p>
          </Reveal>
          <StaggerGroup className="mt-12 grid border-y border-white/10 lg:grid-cols-3">
            {pathways.map((item, i) => (
              <motion.article key={item.key} variants={staggerItem} className="border-b border-white/10 py-10 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
                <p className="eyebrow">{item.label}</p>
                <span className="mt-2 block font-display text-xs text-gold/55">0{i + 1}</span>
                <h3 className="mt-5 font-display text-2xl font-bold leading-tight text-white sm:text-[1.85rem]">{item.title}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-400">{item.body}</p>
                <ul className="mt-5 space-y-1.5 text-sm text-slate-300">
                  {item.items.map((capability) => <li key={capability}>{capability}</li>)}
                </ul>
                <ViewTransitionLink to={item.to} onClick={() => visitor.setWorld(WORLD_BY_PATHWAY[item.key])} className="mt-6 inline-flex text-sm font-semibold text-gold hover:underline">Explore {item.label} →</ViewTransitionLink>
              </motion.article>
            ))}
          </StaggerGroup>
          <Reveal className="mt-8">
            <ViewTransitionLink to={GET_HELP} className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-gold">
              Doesn&apos;t fit neatly into one of these? Tell us what&apos;s going on. <span aria-hidden="true">→</span>
            </ViewTransitionLink>
          </Reveal>
        </section>

        <section className="border-y border-gold/15 bg-gradient-to-br from-gold/[.055] via-white/[.012] to-transparent">
          <div className="container-pmv grid gap-12 py-16 sm:py-20 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
            <Reveal>
              <p className="eyebrow">How Pinnacle works</p>
              <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">You do not have to know the service name first.</h2>
              <p className="mt-5 max-w-lg text-base leading-8 text-slate-400">
                Tell us what is going on. We review the matter, name who is handling it, and stay with the work through completion.
              </p>
              <ViewTransitionLink to="/how-it-works" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-gold">See the full process <span>→</span></ViewTransitionLink>
            </Reveal>
            <div className="divide-y divide-white/10 border-y border-white/10">
              {howItWorks.map(([title, body], i) => (
                <Reveal key={title} delay={i * 0.05} className="grid gap-3 py-6 sm:grid-cols-[44px_minmax(160px,.7fr)_1fr] sm:items-start">
                  <span className="font-display text-xs font-bold text-gold/60">0{i + 1}</span>
                  <h3 className="font-display text-sm font-bold text-white">{title}</h3>
                  <p className="text-sm leading-6 text-slate-400">{body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="container-pmv py-16 sm:py-24">
          <Reveal className="max-w-3xl">
            <p className="eyebrow">Why Pinnacle</p>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-[-.035em] text-white sm:text-5xl">One Relationship. Multiple Capabilities. Less Runaround.</h2>
          </Reveal>
          <div className="mt-10 grid gap-x-10 md:grid-cols-2">
            {whyPinnacle.map(([title, body]) => (
              <Reveal key={title} className="border-t border-gold/20 py-6">
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="border-y border-white/[.07] bg-navy-900/30">
          <div className="container-pmv py-16 sm:py-20">
            <Reveal>
              <p className="eyebrow">Real-world situations</p>
              <h2 className="mt-4 max-w-3xl font-display text-3xl font-bold tracking-[-.035em] text-white sm:text-5xl">Recognize the problem. We will help name the work.</h2>
            </Reveal>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              {useCases.map((item) => (
                <ViewTransitionLink key={item.title} to={item.to} onClick={() => { const w = worldFromQuery(item.to); if (w) visitor.setWorld(w) }} className="group rounded-lg border border-white/10 bg-white/[.02] px-5 py-5 transition hover:border-gold/40 hover:bg-white/[.04]">
                  <h3 className="font-display text-lg font-semibold text-white group-hover:text-gold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.body}</p>
                </ViewTransitionLink>
              ))}
            </div>
          </div>
        </section>

        <section className="container-pmv py-16 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <Reveal>
              <p className="eyebrow">Client portal</p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-[-.035em] text-white sm:text-5xl">Know What&apos;s Happening Without Having to Ask.</h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">
                Once you are a client, matters, documents, agreements, updates, billing, and your assigned Pinnacle contact live in one secure workspace.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-300">
                {portalHighlights.map((item) => (
                  <li key={item} className="flex items-start gap-2"><span className="mt-1 text-gold">✓</span>{item}</li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <ViewTransitionLink to={CLIENT_LOGIN} className={btnPrimary}>Existing Client? Sign In</ViewTransitionLink>
                <ViewTransitionLink to={GET_HELP} className={btnOutline}>Not a client yet?</ViewTransitionLink>
              </div>
            </Reveal>
            <Reveal>
              <div className="overflow-hidden rounded-xl border border-white/10 bg-navy-900/40 p-4 sm:p-6">
                <MotionStage />
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-white/[.07] bg-navy-900/30">
          <div className="container-pmv grid gap-10 py-16 sm:py-20 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <Reveal>
              <p className="eyebrow">Founder</p>
              <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">{founder.name}</h2>
              <p className="mt-2 text-sm font-semibold uppercase tracking-[.12em] text-gold">{founder.title}</p>
            </Reveal>
            <Reveal>
              <p className="text-base leading-8 text-slate-300">{founder.lead}</p>
              <p className="mt-4 text-base leading-8 text-slate-400">{founder.close}</p>
              <ViewTransitionLink to="/about" className="mt-6 inline-flex text-sm font-semibold text-gold hover:underline">About Pinnacle →</ViewTransitionLink>
            </Reveal>
          </div>
        </section>

        <section className="container-pmv py-16 sm:py-20">
          <Reveal className="grid gap-8 lg:grid-cols-2 lg:items-end">
            <div>
              <p className="eyebrow">The right support for the matter</p>
              <h2 className="mt-4 font-display text-3xl font-bold text-white sm:text-4xl">Direct when we can. Coordinated when it should be.</h2>
            </div>
            <p className="text-sm leading-7 text-slate-400">
              Pinnacle may provide the work directly, manage the matter, or work with licensed third-party professionals when specialized or regulated services are required. We name that up front. We are not a law firm, accounting firm, lender, or licensed property manager unless that provider is identified as such.
            </p>
          </Reveal>
        </section>

        <section className="border-y border-white/[.07]">
          <div className="container-pmv py-16 sm:py-20">
            <Reveal className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="eyebrow">Monthly plans</p>
                <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold text-white sm:text-4xl">When the work repeats, put it on a plan.</h2>
              </div>
              <ViewTransitionLink to="/care-plans" className="text-sm font-semibold text-gold hover:underline">See monthly plans →</ViewTransitionLink>
            </Reveal>
            <div className="mt-8 grid gap-3 lg:grid-cols-3">
              {[
                { name: 'Property Care', price: 'From $89/mo', to: '/care-plans?family=property' },
                { name: 'Ops-on-Call', price: 'From $199/mo', to: '/care-plans?family=ops' },
                { name: 'Legal & Notary Pass', price: 'From $99/mo', to: '/care-plans?family=legal' },
              ].map((plan) => (
                <ViewTransitionLink key={plan.name} to={plan.to} className="rounded-lg border border-white/10 bg-white/[.02] px-5 py-4 transition hover:border-gold/40">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold text-white">{plan.name}</h3>
                    <span className="text-sm font-bold text-gold">{plan.price}</span>
                  </div>
                </ViewTransitionLink>
              ))}
            </div>
          </div>
        </section>

        <section className="container-pmv py-16 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[.58fr_1.42fr] lg:items-start lg:gap-14">
            <Reveal>
              <p className="eyebrow">Start a request</p>
              <h2 className="mt-4 font-display text-3xl font-bold tracking-[-.035em] text-white sm:text-4xl">Two minutes. No account. Real reply.</h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">Tell us what needs to happen, where, and when. We reply with what Pinnacle handles directly, what a qualified provider covers, and what it will run.</p>
              <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-white"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />A real person replies within two business hours.</p>
            </Reveal>
            <ScopeWizard source="home" compact />
          </div>
        </section>

        <PublicMetricsBand />
        <CaseStudyStrip className="border-b border-white/10" />

        <CtaBand
          title="What Can We Help You Get Handled?"
          body="You do not have to know the correct service. Tell us what is going on and we will help determine the next step."
          primary={{ to: GET_HELP, label: 'Tell Us What You Need Help With' }}
          secondary={{ to: CLIENT_LOGIN, label: 'Existing Client? Sign In' }}
        />
      </main>
      <Footer />
    </div>
  )
}
