import type { ReactNode } from 'react'

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy-950 transition-all duration-200 hover:-translate-y-px hover:bg-gold-400 hover:shadow-[0_8px_24px_rgba(212,175,55,.12)] disabled:translate-y-0 disabled:opacity-60'
export const btnOutline =
  'inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100 transition-all duration-200 hover:-translate-y-px hover:border-gold hover:bg-gold/[.035] hover:text-gold disabled:translate-y-0 disabled:opacity-60'
export const panelCls = 'rounded-md border border-white/10 bg-white/[0.02] transition-colors duration-200'
export const inputCls =
  'w-full min-h-10 rounded-md border border-white/10 bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-gold/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950'

// Every HQ page starts with this header. The trailing border + bottom margin
// give a consistent horizon line between page title and page body across
// every route so pages stop feeling like they each invented their own layout.
export function PageIntro({ kicker, title, subtitle, action, leading }: { kicker:string; title:string; subtitle?:string; action?:ReactNode; leading?:ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
      <div className="flex items-start gap-4">
        {leading}
        <div>
          <p className="eyebrow">{kicker}</p>
          <h1 className="mt-1.5 font-display text-2xl font-medium text-white sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function Panel({ className='', children }: { className?:string; children:ReactNode }) { return <div className={`${panelCls} p-5 ${className}`}>{children}</div> }
export function EmptyState({ label }: { label:string }) { return <div className="rounded-md border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">{label}</div> }
export function Skeleton({ className='' }: { className?:string }) { return <div className={`animate-pulse rounded bg-white/10 ${className}`}/> }
export function SkeletonStatCard(){return <Panel className="p-5"><Skeleton className="h-3 w-24"/><Skeleton className="mt-3 h-8 w-16"/></Panel>}
export function SkeletonTable({rows=4,cols=4}:{rows?:number;cols?:number}){return <div className="space-y-3">{Array.from({length:rows}).map((_,r)=><div key={r} className="flex gap-4">{Array.from({length:cols}).map((_,c)=><Skeleton key={c} className="h-4 flex-1"/>)}</div>)}</div>}
export function NoAccess({label='this section'}:{label?:string}){return <Panel className="max-w-lg"><p className="text-sm font-medium text-white">You don't have access to {label}.</p><p className="mt-2 text-sm text-slate-400">Ask an admin to grant you access from Settings → Staff &amp; Permissions.</p></Panel>}

export type Tone='gold'|'green'|'blue'|'slate'|'red'
const toneMap:Record<Tone,string>={gold:'bg-gold/10 text-gold border-gold/25',green:'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',blue:'bg-sky-400/10 text-sky-300 border-sky-400/25',slate:'bg-white/5 text-slate-300 border-white/15',red:'bg-rose-400/10 text-rose-300 border-rose-400/25'}
export function Tag({children,tone='slate'}:{children:ReactNode;tone?:Tone}){return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneMap[tone]}`}>{children}</span>}
export function StatCard({label,value}:{label:string;value:ReactNode}){return <div className="group relative overflow-hidden rounded-md border border-white/10 bg-white/[.02] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-gold/20 hover:bg-white/[.035] hover:shadow-[0_16px_40px_rgba(0,0,0,.16)]"><div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition group-hover:via-gold/50"/><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 font-display text-3xl font-medium text-white">{value}</p></div>}
