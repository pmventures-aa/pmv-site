import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand, Faq, panelCls, ServiceList, SplitFeatures } from '../components/public/ui'
import { AmbientGlow, Marquee, Reveal, ServiceRotator, StaggerOnMount, staggerItem } from '../components/public/motion'
import { services } from '../data/services'
import { usePageMeta } from '../lib/usePageMeta'

const categories = ['Consulting', 'POS Transitions', 'Operations', 'Funding', 'Property Support', 'Mobile Services']

export default function Home() {
  usePageMeta(
    'Home',
    'Professional services, business consulting, POS and payment technology transition support, operations, property support, and mobile services.',
  )

  const professionalServices = services.slice(0, 4)
  const supportingServices = services.slice(4)

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />

      <section className="relative container-pmv pt-16 pb-20 sm:pt-24">
        <AmbientGlow />
        <div className="relative grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-16">
          <StaggerOnMount>
            <motion.p variants={staggerItem} className="eyebrow">Professional Services &amp; Business Consulting</motion.p>
            <motion.h1 variants={staggerItem} className="mt-4 font-display text-5xl font-medium leading-[1.05] tracking-tight text-white sm:text-6xl">
              Professional support.
              <br />
              <span className="italic text-gold">One call away.</span>
            </motion.h1>
            <motion.p variants={staggerItem} className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
              From business operations and technology transitions to property support and hands-on professional services, Pinnacle helps organize the work, coordinate the people involved, and keep important projects moving.
            </motion.p>
            <motion.div variants={staggerItem} className="mt-8 flex flex-wrap gap-3">
              <Link to="/contact" className={btnPrimary}>Discuss Your Project</Link>
              <Link to="/services" className={btnOutline}>Explore Professional Services</Link>
            </motion.div>
            <motion.p variants={staggerItem} className="mt-5 text-sm text-slate-400">
              Need one task handled? We can help with that too. Need ongoing support? We can build around that.
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

      <Marquee items={categories} />

      <section className="container-pmv py-16">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">How can Pinnacle help?</p>
          <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Start with the problem, not a service menu</h2>
          <p className="mt-4 text-slate-300">
            You do not need to know exactly what to ask for. Tell us what is changing, what is stuck, or what needs to get done, and we can help map the right engagement.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.35fr_1fr_1fr]">
          <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }} className="rounded-md border border-gold/30 bg-gold/[0.06] p-7">
            <p className="eyebrow">Business &amp; Consulting</p>
            <h3 className="mt-3 font-display text-2xl font-medium text-white">Projects, systems, transitions, and operations</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Consulting, POS and payment technology transitions, vendor coordination, implementation support, administrative operations, and funding guidance.
            </p>
            <Link to="/services/consulting" className="mt-5 inline-block text-sm font-semibold text-gold hover:underline">Explore consulting →</Link>
          </motion.div>

          <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }} className={panelCls}>
            <p className="eyebrow">Property</p>
            <h3 className="mt-3 font-display text-xl font-medium text-white">Owner support in the field</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">Property coordination, inspections, vendor follow-up, and practical local support.</p>
            <Link to="/services/property-management" className="mt-5 inline-block text-sm font-semibold text-gold hover:underline">Property services →</Link>
          </motion.div>

          <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.2 }} className={panelCls}>
            <p className="eyebrow">Mobile &amp; Documents</p>
            <h3 className="mt-3 font-display text-xl font-medium text-white">When something needs to happen today</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">Mobile notary and document courier services for straightforward, time-sensitive needs.</p>
            <Link to="/services/mobile-notary" className="mt-5 inline-block text-sm font-semibold text-gold hover:underline">Mobile services →</Link>
          </motion.div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-navy-900/55">
        <div className="container-pmv py-16">
          <Reveal className="max-w-3xl">
            <p className="eyebrow">Featured Consulting Specialty</p>
            <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Changing your POS or payment technology?</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              Switching systems can mean coordinating vendors, hardware, customer records, recurring billing, reporting, training, testing, and a go-live plan. Pinnacle can help manage the moving pieces so your team is not left figuring it out alone.
            </p>
          </Reveal>
          <div className="mt-10">
            <SplitFeatures
              items={[
                ['Plan the move', 'Review requirements, current systems, vendors, authorized data, dependencies, and the implementation timeline.'],
                ['Coordinate implementation', 'Keep vendors, internal teams, data preparation, hardware, testing, and training moving toward the same launch.'],
                ['Support the cutover', 'Track readiness, open issues, post-launch follow-up, and the operational details that can get lost after signing.'],
              ]}
            />
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/services/merchant-services" className={btnPrimary}>Explore POS Transition Consulting</Link>
            <Link to="/contact" className={btnOutline}>Discuss a Transition</Link>
          </div>
        </div>
      </section>

      <section className="container-pmv py-16">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Flexible engagements</p>
          <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">One task, one project, or ongoing support</h2>
          <p className="mt-4 text-slate-300">
            Pinnacle is built to meet clients where the work actually is. Some needs are quick. Others need someone consistently keeping the project organized.
          </p>
        </Reveal>
        <div className="mt-10">
          <SplitFeatures
            items={[
              ['One-time professional services', 'Defined tasks and short-term support when you need something specific handled.'],
              ['Project-based consulting', 'A scoped engagement for transitions, implementations, operational projects, and multi-step initiatives.'],
              ['Ongoing advisory & support', 'Continued coordination and professional support for businesses that need a reliable extension of their team.'],
            ]}
          />
        </div>
      </section>

      <section id="services" className="container-pmv py-16">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Professional Services</p>
          <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Built around the way businesses actually work</h2>
        </Reveal>
        <div className="mt-10">
          <ServiceList items={professionalServices} />
        </div>

        <Reveal className="mt-14 max-w-2xl">
          <p className="eyebrow">Additional support</p>
          <h2 className="mt-3 font-display text-2xl font-medium text-white sm:text-3xl">Property, field, and mobile services</h2>
        </Reveal>
        <div className="mt-8">
          <ServiceList items={supportingServices} />
        </div>
      </section>

      <section id="why" className="container-pmv py-16">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Why Pinnacle</p>
          <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Too many vendors. One point of coordination.</h2>
          <p className="mt-4 text-slate-300">
            Pinnacle does not have to sell every product involved in your project to help manage the work. We can sit alongside your existing vendors and internal team, helping keep responsibilities, communication, and next steps clear.
          </p>
        </Reveal>
        <div className="mt-10">
          <SplitFeatures
            items={[
              ['Practical support', 'Clear next steps, organized follow-through, and help turning a complicated project into manageable work.'],
              ['Independent coordination', 'We can work across software providers, processors, lenders, contractors, vendors, and your own staff when authorized.'],
              ['Secure client experience', 'Client communication, documents, and status tracking can continue through Pinnacle’s secure portal.'],
            ]}
          />
        </div>
      </section>

      <section className="container-pmv py-16">
        <Reveal className={`${panelCls} lg:flex lg:items-center lg:justify-between lg:gap-10`}>
          <div className="max-w-2xl">
            <p className="eyebrow">How pricing works</p>
            <h2 className="mt-3 font-display text-2xl font-medium text-white sm:text-3xl">Scoped around the work, not a generic rate card</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Engagements may be one-time, project-based, or ongoing depending on the scope. After we understand what needs to happen, we will define the work and provide clear pricing before the engagement begins.
            </p>
          </div>
          <div className="mt-6 lg:mt-0">
            <Link to="/contact" className={btnPrimary}>Discuss your project</Link>
          </div>
        </Reveal>
      </section>

      <section className="container-pmv py-16">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Questions</p>
          <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">Frequently asked</h2>
        </Reveal>
        <div className="mt-10">
          <Faq
            items={[
              ['Do I need to know exactly which service I need?', 'No. Start with the situation. Tell us what is changing, what is not working, or what needs to happen, and we can help map the right type of support.'],
              ['Can Pinnacle manage a project involving other vendors?', 'Yes, when authorized by the client. A major part of our consulting model is helping coordinate communication, responsibilities, milestones, and follow-up across the parties involved.'],
              ['Can you help if I am switching POS or payment systems?', 'Yes. Pinnacle can help with requirements, vendor coordination, authorized data preparation, migration planning, implementation tracking, testing, training coordination, cutover planning, and post-launch follow-up.'],
              ['Do you offer ongoing consulting?', 'Yes. Depending on the need, engagements may be scoped as a defined project or as ongoing advisory and operational support.'],
              ['Are services available outside Florida?', 'Consulting, operational support, and other remote professional services can be delivered more broadly. Mobile, property, and other on-site services are focused on South Florida.'],
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Tell us what you’re trying to accomplish"
        body="Whether you are changing systems, cleaning up an operational problem, coordinating a property need, or simply need something handled, start with the situation and we’ll help map the next step."
        primary={{ to: '/contact', label: 'Discuss Your Project' }}
        secondary={{ to: '/services', label: 'Explore Services' }}
      />

      <section className="border-b border-white/10">
        <div className="container-pmv flex flex-col items-center justify-between gap-3 py-6 text-sm text-slate-400 sm:flex-row">
          <span>Pinnacle team member?</span>
          <a href="https://hq.pinnaclemanagementventures.com/login" className="inline-flex items-center gap-1.5 font-medium text-gold hover:underline">
            Agent / Employee Login →
          </a>
        </div>
      </section>

      <Footer />
    </div>
  )
}
