import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../kit/Icon'

export function DestinationTile({ eyebrow, title, body, to, linkLabel, icon, index=0 }: { eyebrow:string; title:string; body:string; to:string; linkLabel:string; icon:IconName; index?:number }) {
  const reduce=useReducedMotion()
  return <motion.article initial={reduce?undefined:{opacity:0,y:14}} whileInView={{opacity:1,y:0}} viewport={{once:true,margin:'-70px'}} transition={{duration:.38,delay:index*.045,ease:'easeOut'}} className="group border-t border-white/10 py-7 first:border-t-0 sm:py-8">
    <div className="grid gap-5 sm:grid-cols-[44px_minmax(180px,.65fr)_minmax(0,1fr)_auto] sm:items-start sm:gap-6">
      <span className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-gold"><Icon name={icon} size={17}/></span>
      <div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold/75">{eyebrow}</p><h3 className="mt-2 font-display text-2xl font-medium leading-tight text-white transition-colors group-hover:text-gold">{title}</h3></div>
      <p className="max-w-2xl text-sm leading-6 text-slate-400">{body}</p>
      <Link to={to} className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-slate-300 transition-colors hover:text-gold"><span>{linkLabel}</span><Icon name="arrowRight" size={14}/></Link>
    </div>
  </motion.article>
}
