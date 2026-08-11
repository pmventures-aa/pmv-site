import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Logo } from '../ui'
import { Icon } from '../kit/Icon'
import { btnOutline, btnPrimary } from './ui'

const navItems=[{to:'/about',label:'About'},{to:'/professionals',label:'Professional Network'},{to:'/service-area',label:'Service Area'},{to:'/contact',label:'Contact'}]
const serviceLinks=[
  {to:'/services/property-field',label:'Property Care & Field Services',body:'Cleaning, deep cleaning, inspections, turnovers, eviction support, REO, preservation, vendors, and field work.'},
  {to:'/services/mobile-documents',label:'Documents & Mobile Services',body:'Document preparation, filing support, courthouse runs, courier, mobile notary, and signing support.'},
  {to:'/services/business-operations',label:'Business & Operational Support',body:'Administrative help, consulting, POS and payments, systems, process improvement, and project support.'},
]
const CLIENT_LOGIN='/portal/login'
const CLIENT_SIGNUP='/portal/signup?source=header'

export function Header(){
  const[open,setOpen]=useState(false);const[servicesOpen,setServicesOpen]=useState(false);const linkCls=({isActive}:{isActive:boolean})=>`${isActive?'text-gold':'hover:text-gold'} font-semibold transition-colors duration-200`
  return <header className="sticky top-0 z-30 border-b border-white/[.07] bg-navy-950/90 backdrop-blur-xl">
    <div className="container-pmv flex h-[68px] items-center justify-between gap-4"><Link to="/" aria-label="Pinnacle Management Ventures home" className="shrink-0 transition-opacity hover:opacity-90"><Logo/></Link>
      <nav className="hidden items-center gap-6 text-sm text-slate-300 xl:flex" aria-label="Primary navigation"><div className="group relative"><Link to="/services" className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-gold">Services <Icon name="chevronDown" size={13}/></Link><div className="invisible absolute left-1/2 top-full w-[720px] -translate-x-1/2 pt-5 opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100"><div className="rounded-xl border border-white/10 bg-navy-950 p-2 shadow-[0_24px_70px_rgba(0,0,0,.38)]"><div className="grid grid-cols-3">{serviceLinks.map(item=><Link key={item.to} to={item.to} className="group/item rounded-lg border-r border-white/[.07] p-5 last:border-r-0 hover:bg-white/[.03]"><p className="text-sm font-bold text-white group-hover/item:text-gold">{item.label}</p><p className="mt-2 text-xs leading-5 text-slate-400">{item.body}</p></Link>)}</div><Link to="/services" className="flex items-center justify-between border-t border-white/[.07] px-5 py-3 text-xs font-bold uppercase tracking-[.12em] text-slate-400 hover:text-gold"><span>Explore All Capabilities</span><span>→</span></Link></div></div></div>{navItems.map(item=><NavLink key={item.to} to={item.to} className={linkCls}>{item.label}</NavLink>)}</nav>
      <div className="hidden items-center gap-2 xl:flex"><a href={CLIENT_LOGIN} className={btnOutline}>Client Sign In</a><a href={CLIENT_SIGNUP} className={btnPrimary}>Request a Service</a></div>
      <button onClick={()=>setOpen(o=>!o)} className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-white transition hover:border-gold/50 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 xl:hidden" aria-label={open?'Close menu':'Open menu'} aria-expanded={open}><Icon name={open?'close':'menu'} size={18}/></button>
    </div>
    {open&&<div className="border-t border-white/[.07] bg-navy-950 px-5 py-5 xl:hidden"><nav className="flex flex-col text-sm text-slate-300" aria-label="Mobile navigation"><button type="button" onClick={()=>setServicesOpen(v=>!v)} className="flex items-center justify-between border-b border-white/[.07] py-3 text-left font-bold text-white"><span>Services</span><Icon name="chevronDown" size={14} className={servicesOpen?'rotate-180 transition':'transition'}/></button>{servicesOpen&&<div className="border-b border-white/[.07] py-2">{serviceLinks.map(item=><Link key={item.to} to={item.to} onClick={()=>setOpen(false)} className="block rounded-lg py-3"><span className="font-bold text-white">{item.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.body}</span></Link>)}<Link to="/services" onClick={()=>setOpen(false)} className="block py-3 text-sm font-bold text-gold">See All Services →</Link></div>}{navItems.map(item=><NavLink key={item.to} to={item.to} className="border-b border-white/[.07] py-3 font-semibold hover:text-gold" onClick={()=>setOpen(false)}>{item.label}</NavLink>)}<div className="mt-5 grid gap-2 sm:grid-cols-2"><a href={CLIENT_LOGIN} className={btnOutline}>Client Sign In</a><a href={CLIENT_SIGNUP} className={btnPrimary}>Request a Service</a></div></nav></div>}
  </header>
}
