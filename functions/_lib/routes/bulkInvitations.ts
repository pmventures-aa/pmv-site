import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireNamedPermission } from '../capabilities'
import { createInvite, sendInviteEmail, type InviteType } from '../invites'

export const bulkInvitationRoutes = new Hono<AppEnv>()

const clean=(v:unknown,n=200)=>typeof v==='string'?v.trim().slice(0,n):''

bulkInvitationRoutes.post('/invitations/bulk', requireStaff, requireNamedPermission('manage_invitations'), async(c)=>{
  type Row={invite_type?:string;email?:string;full_name?:string;vendor_category?:string;company_name?:string;lead_id?:string}
  const body=await c.req.json<{rows?:Row[]}>().catch(()=>({rows:[]}))
  const rows=(body.rows||[]).slice(0,100)
  if(!rows.length)return c.json({error:'at least one invitation is required'},400)
  const actor=c.get('user')
  const results:Array<{email:string;status:string;error?:string}>=[]
  for(const raw of rows){
    const inviteType=(raw.invite_type==='vendor'?'vendor':'client') as InviteType
    const email=clean(raw.email,254).toLowerCase()
    if(!email.includes('@')){results.push({email,status:'invalid',error:'valid email required'});continue}
    try{
      const invite=await createInvite(c.env,{inviteType,email,fullName:clean(raw.full_name,160),invitedByUserId:actor.id,metadata:{vendor_category:clean(raw.vendor_category,120)||undefined,company_name:clean(raw.company_name,200)||undefined,lead_id:clean(raw.lead_id,120)||undefined}})
      await sendInviteEmail(c.env,{id:invite.id,invite_type:inviteType,email,full_name:clean(raw.full_name,160)||null},invite.token,invite.expiresAt)
      results.push({email,status:'sent'})
    }catch(err){results.push({email,status:'failed',error:err instanceof Error?err.message:'send failed'})}
  }
  return c.json({ok:true,results,sent:results.filter(r=>r.status==='sent').length,failed:results.filter(r=>r.status!=='sent').length})
})
