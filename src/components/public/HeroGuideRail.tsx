import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { WhiteGoldBrandMark } from '../ui'

const guides=[
  {eyebrow:'Property cleaning & turnover',title:'Get a property clean, documented, and ready for what comes next.',to:'/projects/property-cleaning-turnover'},
  {eyebrow:'South Florida field support',title:'Put a dependable person on the ground when you cannot be there.',to:'/projects/local-support-south-florida'},
  {eyebrow:'Eviction & property recovery',title:'Keep the lawful possession handoff and turnover work connected.',to:'/projects/eviction-turnover-support'},
  {eyebrow:'POS & payments',title:'Change providers without losing control of the transition.',to:'/projects/switching-pos-payment-providers'},
  {eyebrow:'Business operations',title:'Give a complex transition one accountable operating owner.',to:'/projects/managing-business-transition'},
  {eyebrow:'Administrative capacity',title:'Move recurring work off the owner’s desk without adding headcount.',to:'/projects/ongoing-administrative-support'},
]
export function HeroGuideRail(){
  const [index,setIndex]=useState(0);const reduce=useReducedMotion()
  useEffect(()=>{if(reduce)return;const id=window.setInterval(()=>setIndex(value=>(value+1)%guides.length),5200);return()=>window.clearInterval(id)},[reduce])
  const guide=guides[index]
  return <div className="relative flex min-h-[390px] items-end"><motion.div aria-hidden="true" className="absolute right-3 top-1 opacity-20" animate={reduce?undefined:{y:[0,-9,0],rotate:[-.3,.4,-.3]}} transition={{duration:10,repeat:Infinity,ease:'easeInOut'}}><WhiteGoldBrandMark size={210} decorative/></motion.div><div className="relative z-10 w-full rounded-2xl border border-white/10 bg-navy-950/70 p-6 backdrop-blur-xl sm:p-7"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-gold">Project guide {String(index+1).padStart(2,'0')}</p><div className="flex gap-1.5">{guides.map((_,i)=><button key={i} aria-label={`Show project guide ${i+1}`} onClick={()=>setIndex(i)} className={`h-1.5 rounded-full transition-all ${i===index?'w-7 bg-gold':'w-1.5 bg-white/20'}`}/>)}</div></div><AnimatePresence mode="wait"><motion.div key={guide.to} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.28}}><p className="mt-7 text-xs font-bold uppercase tracking-[.13em] text-slate-500">{guide.eyebrow}</p><h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-.03em] text-white">{guide.title}</h2><Link to={guide.to} className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-gold">Open this guide <span>→</span></Link></motion.div></AnimatePresence></div></div>
}
