import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand, panelCls, SplitFeatures } from '../components/public/ui'
import { AmbientGlow, Reveal, ServiceRotator, SpecialtyRotator, StaggerOnMount, staggerItem } from '../components/public/motion'
import { services } from '../data/services'
import { usePageMeta } from '../lib/usePageMeta'

const CLIENT_SIGNUP = 'https://client.pinnaclemanagementventures.com/signup'

const featuredSpecialties = [
  {
    eyebrow: 'Business & Operations Consulting',
    title: 'Hands-on help when the business has moving pieces.',
    body: 'Hands-on support for operations, vendor changes, systems, workflows, and complex business projects.',
    to: '/services/consulting',
    linkLabel: 'Learn more about Business & Operations Consulting',
    chips: ['Operations', 'Vendor changes', 'Systems & workflows'],
  },
  {
    eyebrow: 'POS & Payment Technology Transitions',
    title: 'Changing your POS or payment technology?',
    body: 'Pinnacle can coordinate vendors, authorized data preparation, hardware, recurring billing, testing, training, cutover planning, and post-launch follow-up.',
    to: '/services/merchant-services',
    linkLabel: 'Explore POS Transition Consulting',
    chips: ['POS changes', 'Payments', 'Implementation'],
  },
  {
    eyebrow: 'Property & Vendor Coordination',
    title: 'Local support when a property project needs follow-through.',
    body: 'Coordinate inspections, vendors, repair follow-up, access, documentation, and practical field needs without juggling every moving part yourself.',
    to: '/services/property-management',
    linkLabel: 'Explore Property Support',
    chips: ['Inspections', 'Vendor follow-up', 'Owner support'],
  },
  {
    eyebrow: 'Funding & Business Readiness',
    title: 'Get the business organized before the next financial move.',
    body: 'Support with funding readiness, records, projections, documentation, lender requests, and the operational details that can slow an opportunity down.',
    to: '/services/funding',
    linkLabel: 'Explore Funding Support',
    chips: ['Readiness', 'Documentation', 'Coordination'],
  },
]

export default function Home() {
  usePageMeta(
    'Home',
    'Professional services, business consulting, POS and payment technology transition support, operations, property support, and mobile services.',
  )

  const professionalServices = services.slice(0, 4)

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />

      <section className="relative container-pmv pb-16 pt-14 sm:pb-20 sm:pt-20">
        <AmbientGlow />
        <div className="relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-14">
          <StaggerOnMount>
            <motion.p variants={staggerItem} className="eyebrow">Professional Services &amp; Business Consulting</motion.p>
            <motion.h1 variants={staggerItem} className="mt-4 font-display text-5xl font-medium leading-[1.05] tracking-tight text-white sm:text-6xl">
              Professional support.
              <br />
              <span className="italic text-gold">One call away.</span>
            </motion.h1>
            <motion.p variants={staggerItem} className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
              Pinnacle helps businesses and property owners organize complicated work, coordinate the people involved, and keep important projects moving.
            </motion.p>
            <motion.div variants={staggerItem} className="mt-8 flex flex-wrap gap-3">
              <a href={CLIENT_SIGNUP} className={btnPrimary}>Get Started</a>
              <Link to="/services" className={btnOutline}>Explore Services</Link>
            </motion.div>
            <motion.p variants={staggerItem} className="mt-5 text-sm text-slate-400">
              Not sure what you need? Start with the situation. We’ll help map the right next step.
            </motion.p>
          </StaggerOnMount>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          >
            <ServiceRotator items={professionalServices} />
          </motion.div>
        </div>
      </section>

      <SpecialtyRotator items={featuredSpecialties} />

      <section className="container-pmv py-14 sm:py-16">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Choose a starting point</p>
          <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Simple ways to find the right help</h2>
          <p className="mt-4 text-slate-300">
            You do not need to sort through a long service menu. Start with the type of work in front of you.
          </p>
        </Reveal>

        <div className="mt-9 grid gap-4 lg:grid-cols-3">
          <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }} className={panelCls}>
            <p className="eyebrow">Business</p>
            <h3 className="mt-3 font-display text-2xl font-medium text-white">Business &amp; Operations Consulting</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Hands-on support for operations, vendor changes, systems, workflows, and complex business projects.
            </p>
            <Link to="/services/consulting" className="mt-5 inline-block text-sm font-semibold text-gold hover:underline">
              Learn more about Business &amp; Operations Consulting →
            </Link>
          </motion.div>

          <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }} className={panelCls}>
            <p className="eyebrow">Property</p>
            <h3 className="mt-3 font-display text-2xl font-medium text-white">Property &amp; Field Support</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Property coordination, inspections, vendor follow-up, project support, and practical local help for owners.
            </p>
            <Link to="/services/property-management" className="mt-5 inline-block text-sm font-semibold text-gold hover:underline">Explore Property Support →</Link>
          </motion.div>

          <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }} className={panelCls}>
            <p className="eyebrow">Mobile</p>
            <h3 className="mt-3 font-display text-2xl font-medium text-white">Mobile &amp; Document Services</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Mobile notary, document courier, and straightforward time-sensitive support when something needs to happen in the field.
            </p>
            <Link to="/services/mobile-notary" className="mt-5 inline-block text-sm font-semibold text-gold hover:underline">Explore Mobile Services →</Link>
          </motion.div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-navy-900/35">
        <div className="container-pmv py-14 sm:py-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">How Pinnacle works</p>
            <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">One task, one project, or ongoing support</h2>
            <p className="mt-4 text-slate-300">
              The engagement should fit the work. We can handle a defined need, coordinate a larger project, or stay involved as an ongoing extension of your team.
            </p>
          </Reveal>
          <div className="mt-9">
            <SplitFeatures
              items={[
                ['Tell us what is happening', 'Start with the problem, goal, transition, or task. You do not need to know the exact service name.'],
                ['We map the engagement', 'Pinnacle identifies the right scope, people, information, and next steps before work begins.'],
                ['Track it in one place', 'Once engaged, communication, applications, documents, status, and follow-up can continue through the secure client portal.'],
              ]}
            />
          </div>
        </div>
      </section>

      <section id="why" className="container-pmv py-14 sm:py-16">
        <Reveal className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="eyebrow">Why Pinnacle</p>
            <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Too many moving pieces. One point of coordination.</h2>
          </div>
          <div className="space-y-3 text-slate-300">
            <p>Pinnacle can work alongside your existing vendors, systems, contractors, lenders, processors, and internal team when authorized.</p>
            <p className="text-sm text-slate-400">The goal is simple: clear ownership, clear next steps, and less time spent chasing the work.</p>
            <Link to="/about" className="inline-block text-sm font-semibold text-gold hover:underline">How we work →</Link>
          </div>
        </Reveal>
      </section>

      <CtaBand
        title="Ready to get something moving?"
        body="Create your client account to start with Pinnacle, or contact us first if you want to talk through the situation."
        primary={{ to: '/portal/signup', label: 'Get Started' }}
        secondary={{ to: '/contact', label: 'Talk to Pinnacle' }}
      />

      <section className="border-b border-white/10">
        <div className="container-pmv flex flex-col items-center justify-between gap-3 py-6 text-sm text-slate-400 sm:flex-row">
          <span>Already working with Pinnacle?</span>
          <div className="flex flex-wrap items-center gap-4">
            <a href="https://client.pinnaclemanagementventures.com/login" className="font-medium text-gold hover:underline">Client Login →</a>
            <a href="https://hq.pinnaclemanagementventures.com/login" className="font-medium text-slate-400 hover:text-gold">Team Login →</a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
