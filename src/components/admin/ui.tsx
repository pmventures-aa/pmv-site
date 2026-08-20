import type { ReactNode } from 'react'
import { RotateCw } from 'lucide-react'

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-md bg-gold px-3 py-1.5 text-sm font-semibold text-navy-950 transition hover:bg-gold-400 disabled:opacity-60'
export const btnOutline =
  'inline-flex items-center justify-center gap-2 rounded-md border border-white/12 bg-white/[.025] px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-gold/45 hover:bg-gold/[.045] hover:text-gold disabled:opacity-60'
export const btnSecondary = btnOutline
export const panelCls = 'surface-panel rounded-lg'
export const inputCls =
  'pmv-hq-control w-full min-h-9 rounded-md border border-white/12 bg-white/[.045] px-3 py-1.5 text-sm font-medium leading-5 text-slate-100 placeholder:font-normal placeholder:text-slate-500 transition focus:border-gold/55 focus:bg-white/[.065] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/15'

export function PageIntro({ kicker, title, subtitle, action, leading }: { kicker:string; title:string; subtitle?:string; action?:ReactNode; leading?:ReactNode }) {
  function refresh() {
    window.dispatchEvent(new CustomEvent('pmv:refresh', { detail: { source: 'manual' } }))
  }
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/[.08] pb-3">
      <div className="flex items-start gap-3">
        {leading}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold/85">{kicker}</p>
          <h1 className="mt-1 text-xl font-bold tracking-[-.02em] text-white">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        <button type="button" onClick={refresh} className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-white/[.02] text-slate-400 transition hover:border-gold/35 hover:bg-gold/[.04] hover:text-gold" title="Refresh this page" aria-label={`Refresh ${title}`}>
          <RotateCw size={14} />
        </button>
      </div>
    </div>
  )
}

export function Panel({ className='', children }: { className?:string; children:ReactNode }) { return <div className={`${panelCls} p-4 ${className}`}>{children}</div> }
export function EmptyState({ label }: { label:string }) { return <div className="rounded-md border border-dashed border-white/10 bg-white/[.012] px-4 py-8 text-center text-sm text-slate-500">{label}</div> }
export function Skeleton({ className='' }: { className?:string }) { return <div className={`animate-pulse rounded-md bg-white/[.07] ${className}`}/> }
export function SkeletonStatCard(){return <Panel className="p-4"><Skeleton className="h-3 w-24"/><Skeleton className="mt-3 h-6 w-16"/></Panel>}
export function SkeletonTable({rows=4,cols=4}:{rows?:number;cols?:number}){return <div className="space-y-2">{Array.from({length:rows}).map((_,r)=><div key={r} className="flex gap-3">{Array.from({length:cols}).map((_,c)=><Skeleton key={c} className="h-3.5 flex-1"/>)}</div>)}</div>}
export function NoAccess({label='this section'}:{label?:string}){return <Panel className="max-w-lg"><p className="text-sm font-bold text-white">Access Restricted</p><p className="mt-2 text-sm text-slate-400">You do not have access to {label}. Ask an administrator to update your permissions in Settings.</p></Panel>}

// Mobile-friendly data tables. Wide admin tables (min-w 560-980px) clip their
// trailing columns when scrolled on a phone, so each one pairs a card list for
// narrow screens (CardList + DataCard + CardRow) with the full table on md+
// (wrap the existing table in TableScroll). Keeping the desktop table markup
// untouched means only the mobile presentation changes.
export function TableScroll({ className='', minW, children }: { className?:string; minW?:string; children:ReactNode }) {
  return <div className={`hidden overflow-x-auto rounded-lg border border-white/10 md:block ${className}`}>{minW?<div className={minW}>{children}</div>:children}</div>
}
export function CardList({ className='', children }: { className?:string; children:ReactNode }) {
  return <ul className={`space-y-2.5 md:hidden ${className}`}>{children}</ul>
}
export function DataCard({ accent, onClick, className='', children }: { accent?:'gold'|'sea'|'coral'|'green'|'red'|'rose'; onClick?:()=>void; className?:string; children:ReactNode }) {
  const rail=accent?`relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 ${STAT_ACCENT[accent==='rose'?'red':accent]}`:''
  const interactive=onClick?'w-full cursor-pointer text-left transition hover:border-gold/35 hover:bg-white/[.04]':''
  const cls=`rounded-lg border border-white/10 bg-white/[.02] p-4 ${rail} ${interactive} ${className}`
  return onClick?<li><button type="button" onClick={onClick} className={cls}>{children}</button></li>:<li className={cls}>{children}</li>
}
// A label/value row inside a DataCard, echoing the column header the value would
// have carried in the desktop table so no context is lost on mobile.
export function CardRow({ label, children, className='' }: { label:string; children:ReactNode; className?:string }) {
  return <div className={`flex justify-between gap-3 text-xs ${className}`}><span className="shrink-0 uppercase tracking-wide text-slate-500">{label}</span><span className="min-w-0 text-right text-slate-300">{children}</span></div>
}

export type Tone='gold'|'green'|'blue'|'slate'|'red'|'sea'|'coral'
const toneMap:Record<Tone,string>={gold:'bg-gold/10 text-gold border-gold/25',green:'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',blue:'bg-sky-400/10 text-sky-300 border-sky-400/25',slate:'bg-white/[.035] text-slate-300 border-white/10',red:'bg-rose-400/10 text-rose-300 border-rose-400/25',sea:'bg-sea-400/10 text-sea-300 border-sea-400/25',coral:'bg-coral-400/10 text-coral-300 border-coral-400/25'}
export function Tag({children,tone='slate'}:{children:ReactNode;tone?:Tone}){return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide ${toneMap[tone]}`}>{children}</span>}
// Optional accent rail tints a card in a stat row; default keeps the plain card.
const STAT_ACCENT:Record<'gold'|'sea'|'coral'|'green'|'red',string>={gold:'before:bg-gold',sea:'before:bg-sea-400',coral:'before:bg-coral-400',green:'before:bg-emerald-400',red:'before:bg-rose-400'}
export function StatCard({label,value,accent}:{label:string;value:ReactNode;accent?:keyof typeof STAT_ACCENT}){const rail=accent?`relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 ${STAT_ACCENT[accent]}`:'';return <div className={`rounded-lg border border-white/[.08] bg-white/[.02] px-4 py-3 ${rail}`}><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{label}</p><p className="mt-1.5 text-2xl font-bold tracking-[-.03em] text-white tabular-nums">{value}</p></div>}
