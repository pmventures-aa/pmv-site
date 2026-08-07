import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Header } from '../components/public/Header'
import { Footer } from '../components/public/Footer'
import { btnOutline, btnPrimary, CtaBand, ServiceList, SplitFeatures } from '../components/public/ui'
import { AmbientGlow, Marquee, Reveal, ServiceRotator, StaggerOnMount, staggerItem } from '../components/public/motion'
import { services } from '../data/services'

const categories = ['Consulting', 'Funding', 'Property', 'Notary', 'Inspections', 'Admin']

export default function Home() {
  return (
    <div className="min-h-screen bg-navy-950">
      <Header />

      {/* Hero */}
      <section className="relative container-pmv pt-16 pb-20 sm:pt-24">
        <AmbientGlow />
        <div className="relative grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-start lg:gap-16">
          <StaggerOnMount>
            <motion.p variants={staggerItem} className="eyebrow">Professional Services &amp; Business Support</motion.p>
            <motion.h1
              variants={staggerItem}
              className="mt-4 font-display text-5xl font-medium leading-[1.05] tracking-tight text-white sm:text-6xl"
            >
              Professional support.
              <br />
              <span className="italic text-gold">Wherever business takes&nbsp;you.</span>
            </motion.h1>
            <motion.p variants={staggerItem} className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              From consulting and funding to property management, mobile notary, and administrative support —
              Pinnacle Management Ventures connects you with the professional resources to move forward with
              confidence.
            </motion.p>
            <motion.div variants={staggerItem} className="mt-8 flex flex-wrap gap-3">
              <Link to="/contact" className={btnPrimary}>Request Service</Link>
              <Link to="/services" className={btnOutline}>Explore Our Services</Link>
            </motion.div>
          </StaggerOnMount>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
          >
            <ServiceRotator items={services} />
          </motion.div>
        </div>
      </section>

      <Marquee items={categories} />

      {/* Services */}
      <section id="services" className="container-pmv py-16">
        <Reveal className="max-w-2xl">
          <p className="eyebrow">Start Your Journey</p>
          <h2 className="mt-3 font-display text-3xl font-medium text-white sm:text-4xl">
            Choose your path to professional support
          </h2>
          <p className="mt-4 text-slate-300">
            Whatever your business needs, Pinnacle Management Ventures has a service designed to help you move
            forward.
          </p>
        </Reveal>
        <div className="mt-10">
          <ServiceList items={services} />
        </div>
      </section>

      {/* Why */}
      <section id="why" className="container-pmv py-16">
        <Reveal className="max-w-2xl">
          <h2 className="font-display text-3xl font-medium text-white sm:text-4xl">Why Pinnacle</h2>
        </Reveal>
        <div className="mt-10">
          <SplitFeatures
            items={[
              ['One team, many services', 'Consulting to funding to property support, coordinated by people who know your account.'],
              ['Secure client portal', 'Encrypted messaging, document exchange, and status tracking — never sensitive data over email.'],
              ['Clear, compliant guidance', 'Straight answers and honest disclosures — no guarantees we can’t stand behind.'],
            ]}
          />
        </div>
      </section>

      <CtaBand
        title="Let's find the right solution for your business"
        body="Whether you need consulting, funding, property management, or professional services, Pinnacle Management Ventures is ready to help you move forward."
        primary={{ to: '/contact', label: 'Request Service' }}
        secondary={{ to: '/contact', label: 'Schedule an Appointment' }}
      />

      {/* Staff access */}
      <section className="border-b border-white/10">
        <div className="container-pmv flex flex-col items-center justify-between gap-3 py-6 text-sm text-slate-400 sm:flex-row">
          <span>Pinnacle team member?</span>
          <a
            href="https://hq.pinnaclemanagementventures.com/login"
            className="inline-flex items-center gap-1.5 font-medium text-gold hover:underline"
          >
            Agent / Employee Login →
          </a>
        </div>
      </section>

      <Footer />
    </div>
  )
}
