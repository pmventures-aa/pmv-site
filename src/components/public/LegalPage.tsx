import type { ReactNode } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'

export interface LegalSection {
  id: string
  title: string
  content: ReactNode
}

export function LegalPage({ eyebrow='Legal', title, intro, updated, sections }: { eyebrow?:string;title:string;intro:string;updated:string;sections:LegalSection[] }) {
  return <div className="min-h-screen bg-navy-950 text-slate-100"><Header/><main>
    <section className="border-b border-white/10 bg-gradient-to-b from-navy-900/70 to-navy-950"><div className="container-pmv py-14 sm:py-18"><p className="eyebrow">{eyebrow}</p><h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold tracking-[-.03em] text-white sm:text-5xl">{title}</h1><p className="mt-5 max-w-3xl text-base leading-8 text-slate-300">{intro}</p><p className="mt-5 text-xs font-semibold uppercase tracking-[.12em] text-slate-500">Last Updated: {updated}</p></div></section>
    <div className="container-pmv grid gap-10 py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-16">
      <aside className="lg:sticky lg:top-24 lg:self-start"><p className="mb-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">On This Page</p><nav className="space-y-1.5">{sections.map((section,index)=><a key={section.id} href={`#${section.id}`} className="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-white/[.035] hover:text-gold"><span className="mr-2 text-[10px] text-gold/60">{String(index+1).padStart(2,'0')}</span>{section.title}</a>)}</nav></aside>
      <article className="min-w-0 max-w-4xl"><div className="space-y-10">{sections.map((section,index)=><section key={section.id} id={section.id} className="scroll-mt-28 border-b border-white/8 pb-10 last:border-0"><div className="mb-4 flex items-baseline gap-3"><span className="text-xs font-bold text-gold/65">{String(index+1).padStart(2,'0')}</span><h2 className="text-xl font-extrabold tracking-[-.015em] text-white sm:text-2xl">{section.title}</h2></div><div className="legal-copy text-sm leading-7 text-slate-300">{section.content}</div></section>)}</div>
        <div className="mt-10 rounded-xl border border-gold/15 bg-gold/[.045] p-5"><p className="text-sm font-bold text-white">Questions About These Terms?</p><p className="mt-2 text-sm leading-6 text-slate-400">Contact <a href="mailto:support@pinnaclemanagementventures.com" className="font-bold text-gold hover:text-gold-300">support@pinnaclemanagementventures.com</a>. For a transaction-specific question, your signed proposal, statement of work, engagement letter, order, or invoice may contain additional terms that control that engagement.</p></div>
      </article>
    </div>
  </main><Footer/></div>
}

export function P({children}:{children:ReactNode}){return <p className="mb-4 last:mb-0">{children}</p>}
export function UL({children}:{children:ReactNode}){return <ul className="mb-4 list-disc space-y-2 pl-5 marker:text-gold/70 last:mb-0">{children}</ul>}
export function Strong({children}:{children:ReactNode}){return <strong className="font-bold text-slate-100">{children}</strong>}
