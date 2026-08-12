import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useAppPath } from '../../lib/basePath'
import { AuthLayout, ErrorBanner, Field, inputCls } from './AuthLayout'
import { hqWorkspaceCopy } from '../../lib/workspace'

interface InviteResponse { invite:{ invite_type:string; email:string; full_name:string|null; status:string; expires_at:string; role_name?:string|null; metadata?:Record<string,unknown> } }

export default function StaffInvite(){
  const { token='' }=useParams()
  const navigate=useNavigate()
  const p=useAppPath()
  const { refresh }=useAuth()
  const [invite,setInvite]=useState<InviteResponse['invite']|null>(null)
  const [name,setName]=useState('')
  const [password,setPassword]=useState('')
  const [confirm,setConfirm]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState<string|null>(null)

  useEffect(()=>{
    api.get<InviteResponse>(`/invite/${encodeURIComponent(token)}`)
      .then(r=>{ if(r.invite.invite_type!=='staff') throw new Error('This is not a staff invitation.'); setInvite(r.invite); setName(r.invite.full_name||'') })
      .catch(e=>setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Could not load invitation.'))
      .finally(()=>setLoading(false))
  },[token])

  async function accept(e:React.FormEvent){
    e.preventDefault(); setError(null)
    if(password.length<10) return setError('Password must be at least 10 characters.')
    if(password!==confirm) return setError('Passwords do not match.')
    setBusy(true)
    try{
      await api.post(`/invite/${encodeURIComponent(token)}/accept-staff`,{full_name:name,password})
      await refresh()
      navigate(p(),{replace:true})
    }catch(err){ setError(err instanceof ApiError?err.message:'Could not activate this account.') }
    finally{ setBusy(false) }
  }

  const copy = hqWorkspaceCopy('employee', null, invite?.role_name || null)

  return <AuthLayout surface="staff" eyebrow={copy.loginEyebrow} title={invite?.role_name ? `Activate your ${invite.role_name} access` : 'Activate your Pinnacle access'} subtitle={copy.loginBody} sideLabel={copy.badge} sideTitle={copy.loginTitle} sideBody={copy.loginBody}>
    {loading?<p className="text-sm text-slate-400">Loading invitation…</p>:<><ErrorBanner message={error}/>{invite?.status==='pending'?<><div className="mb-5 rounded-xl border border-gold/20 bg-gold/[0.05] p-4"><p className="text-sm font-semibold text-white">{invite.role_name ? `${invite.role_name} invitation` : 'Private staff invitation'}</p><p className="mt-1 text-xs text-slate-400">For {invite.email}. Expires {new Date(invite.expires_at).toLocaleString()}.</p></div><form onSubmit={accept} className="space-y-4"><Field label="Full name"><input className={inputCls} required value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Email"><input className={inputCls} value={invite.email} readOnly/></Field><Field label="Create password"><input className={inputCls} type="password" required minLength={10} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field><Field label="Confirm password"><input className={inputCls} type="password" required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></Field><button className="btn-gold w-full disabled:opacity-60" disabled={busy}>{busy?'Activating…':'Activate account'}</button></form></>:invite&&<div className="rounded-xl border border-white/10 p-4 text-sm text-slate-300">This invitation is {invite.status}. Ask the Pinnacle Administrator for a new invitation if you still need access.</div>}</>}
  </AuthLayout>
}
