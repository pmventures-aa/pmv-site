import { Building2, FileText, Home, Layers, MessageSquare, Receipt, Search, TicketCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '../../components/ui'

const nav = [
  [Home, 'Command Center'], [Building2, 'My Properties'], [TicketCheck, 'Requests & Cases'],
  [FileText, 'Documents'], [MessageSquare, 'Messages'], [Receipt, 'Billing'], [Layers, 'Services'],
] as const

const cases = [
  { title: 'Deep cleaning · 1840 Sunrise Blvd', meta: 'Assigned to Pinnacle Field Services', time: '1h 42m', tone: 'text-amber-300' },
  { title: 'Move-out inspection · Unit 4B', meta: 'Vendor scheduled · Tomorrow at 10:30 AM', time: 'Responded', tone: 'text-emerald-300' },
  { title: 'Eviction document preparation · Unit 2A', meta: 'Waiting on your lease upload', time: 'Client action', tone: 'text-gold' },
]

export default function ClientPortalDemo() {
  return <div className="min-h-screen bg-navy-radial text-white lg:flex">
    <aside className="hidden w-64 shrink-0 border-r border-white/[.07] bg-navy-950/75 p-4 lg:block">
      <Logo />
      <div className="mt-3 px-2"><span className="rounded-full border border-gold/20 bg-gold/[.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.12em] text-gold/80">Sample portal</span></div>
      <nav className="mt-8 space-y-1">{nav.map(([Icon,label], i) => <div key={label} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${i === 0 ? 'bg-white/[.07] text-white ring-1 ring-white/[.08]' : 'text-slate-400'}`}><span className="grid h-7 w-7 place-items-center rounded-md bg-white/[.02] text-gold"><Icon size={17}/></span>{label}</div>)}</nav>
      <div className="mt-8 border-t border-white/10 pt-4"><p className="text-sm font-medium">Jordan Matthews</p><p className="text-xs text-slate-500">Property owner · Sample</p></div>
    </aside>
    <main className="min-w-0 flex-1">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[.07] bg-navy-950/90 px-4 py-3 backdrop-blur lg:px-8"><div className="lg:hidden"><Logo /></div><span className="hidden text-xs text-slate-500 lg:block">Client Portal Preview</span><Link to="/portal/signup" className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-navy-950">Create client account</Link></div>
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-xl border border-gold/20 bg-gold/[.045] px-4 py-3 text-xs text-slate-300"><strong className="text-gold">Preview mode:</strong> This is a read-only sample showing the experience for a property owner using several Pinnacle services.</div>
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-gold/80">Tuesday, August 11</p><h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Good morning, Jordan.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Here’s what Pinnacle is handling, what needs your attention, and what’s coming next.</p></div><button className="btn-gold">+ Start a request</button></div>
        <section className="mt-7 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-gold/25 bg-gold/[.055] p-4"><p className="font-semibold">Start a request</p><p className="mt-1 text-xs leading-5 text-slate-400">Cleaning, inspections, eviction support, documents, REO work, and more.</p></div><div className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="font-semibold">Send documents</p><p className="mt-1 text-xs leading-5 text-slate-400">2 items are waiting for your review or upload.</p></div><div className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="font-semibold">Discover services</p><p className="mt-1 text-xs leading-5 text-slate-400">Add support without calling or creating another account.</p></div></section>
        <section className="mt-7 rounded-xl border border-white/10 bg-white/[.025] p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-gold/80">Live work</p><h2 className="mt-1 text-lg font-semibold">Active requests & cases</h2></div><span className="text-xs text-gold">View all →</span></div><div className="mt-4 divide-y divide-white/10">{cases.map(item => <div key={item.title} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.meta}</p></div><div className="sm:text-right"><p className={`text-xs font-medium tabular-nums ${item.tone}`}>{item.time}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-slate-600">Response SLA</p></div></div>)}</div></section>
        <section className="mt-7"><div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-gold/80">Property services</p><h2 className="mt-1 text-lg font-semibold">My Properties</h2></div><span className="text-xs text-gold">Open workspace →</span></div><div className="mt-3 grid gap-3 md:grid-cols-3">{[['1840 Sunrise Blvd','Occupied · 2 active requests'],['410 NE 7th Avenue','Turnover · cleaning scheduled'],['922 Palm Ridge Drive','REO · inspection complete']].map(([address,status]) => <div key={address} className="rounded-xl border border-white/10 bg-white/[.02] p-4"><Building2 size={18} className="text-gold"/><p className="mt-4 text-sm font-medium">{address}</p><p className="mt-1 text-xs text-slate-500">{status}</p></div>)}</div></section>
        <section className="mt-7 grid gap-5 lg:grid-cols-2"><div className="rounded-xl border border-white/10 bg-white/[.025] p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Next action</h2><FileText size={18} className="text-gold"/></div><p className="mt-4 text-sm">Upload the current lease for Unit 2A</p><p className="mt-1 text-xs leading-5 text-slate-500">Needed before Pinnacle can finish the eviction document package.</p><button className="btn-outline mt-4">Open documents</button></div><div className="rounded-xl border border-white/10 bg-white/[.025] p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Enabled services</h2><Search size={18} className="text-gold"/></div><div className="mt-4 flex flex-wrap gap-2">{['Property Management','Property Inspections','Document Preparation','Cleaning Services'].map(x => <span key={x} className="rounded-full border border-white/10 bg-white/[.03] px-3 py-1.5 text-xs text-slate-300">{x}</span>)}</div><p className="mt-5 text-xs text-gold">Explore additional services →</p></div></section>
      </div>
    </main>
  </div>
}
