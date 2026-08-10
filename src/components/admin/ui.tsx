import type { ReactNode } from 'react'
import { RotateCw } from 'lucide-react'

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-navy-950 shadow-[0_10px_26px_rgba(201,162,39,.10)] transition-all duration-200 hover:-translate-y-px hover:bg-gold-400 hover:shadow-[0_14px_32px_rgba(201,162,39,.14)] disabled:translate-y-0 disabled:opacity-60'
export const btnOutline =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/[.015] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-all duration-200 hover:-translate-y-px hover:border-gold/45 hover:bg-gold/[.035] hover:text-gold disabled:translate-y-0 disabled:opacity-60'
export const panelCls = 'surface-panel rounded-xl transition-all duration-200'
export const inputCls =
  'w-full min-h-10 rounded-lg border border-white/10 bg-navy-900/80 px-3 py-2 text-sm text-white shadow-inner shadow-black/10 placeholder:text-slate-500 transition focus:border-gold/45 focus:bg-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/30 focus-visible:ring-offset-1 focus-visible:ring-offset-navy-950'

export function PageIntro({ kicker, title, subtitle, action, leading }: { kicker:string; title:string; subtitle?:string; action?:ReactNode; leading?:ReactNode }) {
  function refresh() {
    window.dispatchEvent(new CustomEvent('pmv:refresh', { detail: { source: 'manual' } }))
  }
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-5 border-b border-white/[.08] pb-6">
      <div className="flex items-start gap-4">
        {leading}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-gold/80">{kicker}</p>
          <h1 className="mt-2 font-display text-2xl font-medium tracking-tight text-white sm:text-[2rem]">{title}</h1>
          {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        <button type="button" onClick={refresh} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-gold/35 hover:bg-gold/[.04] hover:text-gold" title="Refresh this page" aria-label={`Refresh ${title}`}>
          <RotateCw size={14} />
        </button>
      </div>
    </div>
  )
}

export function Panel({ className='', children }: { className?:string; children:ReactNode }) { return <div className={`${panelCls} p-5 sm:p-6 ${className}`}>{children}</div> }
export function EmptyState({ label }: { label:string }) { return <div className="rounded-xl border border-dashed border-white/10 bg-white/[.012] px-6 py-12 text-center text-sm text-slate-500">{label}</div> }
export function Skeleton({ className='' }: { className?:string }) { return <div className={`animate-pulse rounded-md bg-white/[.07] ${className}`}/> }
export function SkeletonStatCard(){return <Panel className="p-5"><Skeleton className="h-3 w-24"/><Skeleton className="mt-4 h-8 w-16"/></Panel>}
export function SkeletonTable({rows=4,cols=4}:{rows?:number;cols?:number}){return <div className="space-y-3">{Array.from({length:rows}).map((_,r)=><div key={r} className="flex gap-4">{Array.from({length:cols}).map((_,c)=><Skeleton key={c} className="h-4 flex-1"/>)}</div>)}</div>}
export function NoAccess({label='this section'}:{label?:string}){return <Panel className="max-w-lg"><p className="text-sm font-semibold text-white">Access restricted</p><p className="mt-2 text-sm text-slate-400">You don't have access to {label}. Ask an admin to update your permissions in Settings.</p></Panel>}

export type Tone='gold'|'green'|'blue'|'slate'|'red'
const toneMap:Record<Tone,string>={gold:'bg-gold/10 text-gold border-gold/25',green:'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',blue:'bg-sky-400/10 text-sky-300 border-sky-400/25',slate:'bg-white/[.035] text-slate-300 border-white/10',red:'bg-rose-400/10 text-rose-300 border-rose-400/25'}
export function Tag({children,tone='slate'}:{children:ReactNode;tone?:Tone}){return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${toneMap[tone]}`}>{children}</span>}
export function StatCard({label,value}:{label:string;value:ReactNode}){return <div className="group relative overflow-hidden rounded-xl border border-white/[.08] bg-gradient-to-b from-white/[.035] to-white/[.015] p-5 shadow-[0_8px_24px_rgba(0,0,0,.10)] transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/20 hover:from-white/[.05] hover:shadow-[0_18px_38px_rgba(0,0,0,.16)]"><div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition group-hover:via-gold/45"/><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</p><p className="mt-3 font-display text-3xl font-medium tracking-tight text-white">{value}</p></div>}
