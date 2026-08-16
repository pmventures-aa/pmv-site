import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ViewTransitionLink } from '../../components/public/ViewTransitionLink'
import { Header } from '../../components/public/Header'
import { Footer } from '../../components/public/Footer'
import { api, ApiError } from '../../lib/api'
import { btnOutline, btnPrimary } from '../../components/public/ui'
import { usePageMeta } from '../../lib/usePageMeta'

type RequestData={public_token:string;job_type:string;service_key:string|null;guide_slug:string|null;location_type:string;city:string|null;state:string|null;postal_code:string|null;timing:string;details:string|null;contact_name:string;email:string;phone:string|null;status:string;response_due_at:string;estimate_low_cents:number|null;estimate_high_cents:number|null;estimate_basis:string|null;preferred_slot_at:string|null;created_at:string}
type Response={request:RequestData;job_label:string;signup_url:string;account_status?:'reserved'|'existing'|'none'}
type BookingSlot={id:string;job_type:string;starts_at:string;ends_at:string;remaining:number}
type Booking={id:string;starts_at:string;ends_at:string;status:'confirmed'}
const dollars=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100)
const slotLabel=(slot:BookingSlot|Booking)=>`${new Date(slot.starts_at).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} to ${new Date(slot.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`

function readSetupUrl(token:string){
  try{return sessionStorage.getItem(`pmv_scope_setup_${token}`)}catch{return null}
}

export default function ScopeConfirmation(){
  usePageMeta('Request Received | Pinnacle Management Ventures','Review your Pinnacle request, response promise, planning estimate, and client workspace options.')
  const [params]=useSearchParams();const token=params.get('request')||''
  const [data,setData]=useState<Response|null>(null);const [error,setError]=useState('');const [slots,setSlots]=useState<BookingSlot[]>([]);const [slotsLoading,setSlotsLoading]=useState(false);const [slotId,setSlotId]=useState('');const [bookingBusy,setBookingBusy]=useState(false);const [booking,setBooking]=useState<Booking|null>(null)
  const [setupUrl,setSetupUrl]=useState<string|null>(null)
  useEffect(()=>{
    if(!token){setError('This request link is incomplete.');return}
    setSetupUrl(readSetupUrl(token))
    api.get<Response>(`/scope-requests/${encodeURIComponent(token)}`).then(response=>{
      setData(response)
      if(response.request.estimate_low_cents!=null){
        setSlotsLoading(true)
        api.get<{slots:BookingSlot[]}>(`/public-booking-slots?job_type=${encodeURIComponent(response.request.job_type)}`).then(x=>{setSlots(x.slots);setSlotId(x.slots[0]?.id||'')}).catch(()=>setSlots([])).finally(()=>setSlotsLoading(false))
      }
    }).catch(err=>setError(err instanceof ApiError?err.message:'We could not load this request.'))
  },[token])
  async function book(){if(!slotId)return setError('Choose an available appointment.');setBookingBusy(true);setError('');try{const response=await api.post<{booking:Booking}>(`/scope-requests/${encodeURIComponent(token)}/book`,{slot_id:slotId});setBooking(response.booking)}catch(err){setError(err instanceof ApiError?err.message:'We could not confirm that appointment.')}finally{setBookingBusy(false)}}

  const accountStatus=data?.account_status||(setupUrl?'reserved':'none')

  return <div className="min-h-screen bg-navy-950"><Header/><main className="container-pmv py-12 sm:py-16">{error&&!data?<div className="mx-auto max-w-xl rounded-2xl border border-red-400/20 bg-red-400/[.05] p-7 text-red-100"><h1 className="text-2xl font-bold">We could not open that request.</h1><p className="mt-3 text-sm">{error}</p><ViewTransitionLink to="/scope-request" className={`${btnPrimary} mt-6`}>Start a new request</ViewTransitionLink></div>:!data?<p className="text-sm text-slate-400">Loading your request…</p>:<div className="mx-auto max-w-5xl"><div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><section className="rounded-2xl border border-white/10 bg-white/[.025] p-6 sm:p-8"><p className="eyebrow">Request received</p><h1 className="mt-3 font-display text-4xl font-bold tracking-[-.035em] text-white">A person will take it from here.</h1><p className="mt-4 text-lg leading-8 text-slate-300">We received your request for {data.job_label}. Pinnacle will review the scope and reply within <strong className="text-white">two business hours</strong>.</p><div className="mt-7 grid gap-4 border-y border-white/10 py-6 sm:grid-cols-2"><div><p className="text-[11px] font-bold uppercase tracking-[.13em] text-slate-500">Location</p><p className="mt-2 text-sm text-white">{data.request.location_type==='remote'?'Remote / nationwide':[data.request.city,data.request.state,data.request.postal_code].filter(Boolean).join(', ')}</p></div><div><p className="text-[11px] font-bold uppercase tracking-[.13em] text-slate-500">Timing</p><p className="mt-2 text-sm text-white">{data.request.timing}</p></div>{data.request.details&&<div className="sm:col-span-2"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-slate-500">What you told us</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">{data.request.details}</p></div>}</div>{data.request.estimate_low_cents!=null&&data.request.estimate_high_cents!=null&&<div className="mt-6 rounded-xl border border-gold/25 bg-gold/[.055] p-5"><p className="text-xs font-bold uppercase tracking-[.13em] text-gold">Immediate planning estimate</p><p className="mt-2 font-display text-3xl font-bold text-white">{dollars(data.request.estimate_low_cents)}–{dollars(data.request.estimate_high_cents)}</p><p className="mt-2 text-xs leading-5 text-slate-400">{data.request.estimate_basis}. Final pricing is confirmed after access, condition, location, and any added work are verified.</p></div>}</section><aside className="space-y-5"><WorkspaceCard accountStatus={accountStatus} setupUrl={setupUrl} signupUrl={data.signup_url}/>{data.request.estimate_low_cents!=null&&<div className="rounded-2xl border border-white/10 bg-white/[.02] p-6"><h2 className="text-lg font-bold text-white">Book an available appointment</h2><p className="mt-2 text-xs leading-5 text-slate-400">These times are published from live Pinnacle capacity. A successful booking is confirmed immediately.</p>{booking?<p className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/[.06] p-3 text-sm text-emerald-200"><strong className="block">Appointment confirmed</strong><span className="mt-1 block">{slotLabel(booking)}</span></p>:slotsLoading?<p className="mt-4 text-xs text-slate-500">Checking appointment capacity…</p>:slots.length?<><select className="input mt-4" value={slotId} onChange={e=>setSlotId(e.target.value)}>{slots.map(slot=><option key={slot.id} value={slot.id}>{slotLabel(slot)}{slot.remaining>1?` · ${slot.remaining} openings`:''}</option>)}</select>{error&&<p className="mt-3 text-xs text-red-200">{error}</p>}<button type="button" className="btn-outline mt-3 w-full" disabled={bookingBusy} onClick={()=>void book()}>{bookingBusy?'Confirming…':'Confirm This Appointment'}</button></>:<div className="mt-4 rounded-lg border border-white/10 p-3 text-xs leading-5 text-slate-400">No online appointments are published for this service right now. Your request is still active; call or text <a className="font-bold text-gold" href="tel:+15613887879">(561) 388-7879</a> for scheduling.</div>}</div>}</aside></div><div className="mt-7 flex flex-wrap gap-3"><ViewTransitionLink to="/services" className={btnOutline}>Explore Services</ViewTransitionLink><a href="tel:+15613887879" className={btnOutline}>Call (561) 388-7879</a></div></div>}</main><Footer/></div>
}

function WorkspaceCard({accountStatus,setupUrl,signupUrl}:{accountStatus:string;setupUrl:string|null;signupUrl:string}){
  if(accountStatus==='existing'){
    return <div className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/[.08] to-transparent p-6"><p className="eyebrow">Workspace ready</p><h2 className="mt-3 text-2xl font-bold text-white">Your client workspace is already reserved.</h2><p className="mt-3 text-sm leading-6 text-slate-400">This request is attached to your existing Pinnacle login. Signing in is what turns a lead into a prospect; starting a service application moves you into the application phase.</p><a href="/portal/login" className={`${btnPrimary} mt-6 w-full`}>Open My Workspace</a></div>
  }
  if(accountStatus==='reserved'){
    return <div className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/[.08] to-transparent p-6"><p className="eyebrow">Workspace reserved</p><h2 className="mt-3 text-2xl font-bold text-white">Your client login is waiting.</h2><p className="mt-3 text-sm leading-6 text-slate-400">We reserved a Pinnacle workspace for this request. You are still a lead until you set a password and sign in. After that you become a prospect, and starting a service application moves you into the application phase.</p>{setupUrl?<a href={setupUrl} className={`${btnPrimary} mt-6 w-full`}>Set My Password</a>:<p className="mt-6 rounded-lg border border-white/10 bg-white/[.03] p-3 text-xs leading-5 text-slate-300">Check the email we just sent for your setup link. If it is not there, look in spam or call <a className="font-bold text-gold" href="tel:+15613887879">(561) 388-7879</a>.</p>}<p className="mt-3 text-center text-[11px] text-slate-500">No need to enter this request again.</p></div>
  }
  return <div className="rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/[.08] to-transparent p-6"><p className="eyebrow">Keep the work together</p><h2 className="mt-3 text-2xl font-bold text-white">Create your client workspace.</h2><p className="mt-3 text-sm leading-6 text-slate-400">Your name, contact details, service, and request are already connected. Create the account to receive updates, share documents, and keep completion records in one place.</p><a href={signupUrl} className={`${btnPrimary} mt-6 w-full`}>Create My Workspace</a><p className="mt-3 text-center text-[11px] text-slate-500">No need to enter this request again.</p></div>
}
