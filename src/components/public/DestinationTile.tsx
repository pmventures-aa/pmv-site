import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../kit/Icon'

export function DestinationTile({
  eyebrow,
  title,
  body,
  to,
  linkLabel,
  icon,
  index = 0,
}: {
  eyebrow:string
  title:string
  body:string
  to:string
  linkLabel:string
  icon:IconName
  index?:number
}) {
  const reduce=useReducedMotion()
  return <motion.article
    initial={reduce?undefined:{opacity:0,y:22}}
    whileInView={{opacity:1,y:0}}
    viewport={{once:true,margin:'-70px'}}
    transition={{duration:.45,delay:index*.07,ease:'easeOut'}}
    whileHover={reduce?undefined:{y:-6}}
    className="group relative isolate overflow-hidden rounded-md border border-white/10 bg-white/[.025] p-6 transition-colors duration-300 hover:border-gold/25 hover:bg-white/[.045]"
  >
    <motion.div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" initial={reduce?undefined:{scaleX:.15,opacity:.15}} whileInView={{scaleX:1,opacity:.8}} viewport={{once:true}} transition={{duration:.75,delay:.12+index*.07}}/>
    <div aria-hidden="true" className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gold/[.055] blur-2xl transition-transform duration-500 group-hover:scale-125"/>
    <div className="relative flex min-h-[255px] flex-col">
      <div className="flex items-start justify-between gap-4"><p className="eyebrow">{eyebrow}</p><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[.035] text-gold transition-all duration-300 group-hover:-translate-y-1 group-hover:border-gold/25 group-hover:bg-gold/10"><Icon name={icon} size={19}/></span></div>
      <h3 className="mt-6 font-display text-2xl font-medium leading-tight text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
      <Link to={to} className="mt-auto inline-flex items-center gap-2 pt-7 text-sm font-semibold text-gold">
        <span>{linkLabel}</span><Icon name="arrowRight" size={15} className="transition-transform duration-300 group-hover:translate-x-1.5"/>
      </Link>
    </div>
  </motion.article>
}
