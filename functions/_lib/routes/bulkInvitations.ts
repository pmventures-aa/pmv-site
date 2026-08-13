import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireNamedPermission } from '../capabilities'
import { createInvite, sendInviteEmail, recordInviteEmailResult, type InviteType } from '../invites'
import { stageVendorProfile, VendorInviteConflict } from '../vendorStaging'

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
      let stagedUserId:string|null=null
      if(inviteType==='vendor'){
        const staged=await stageVendorProfile(c.env,{email,fullName:clean(raw.full_name,160),vendorCategory:clean(raw.vendor_category,120),companyName:clean(raw.company_name,200)})
        stagedUserId=staged.userId
      }
      const invite=await createInvite(c.env,{inviteType,email,fullName:clean(raw.full_name,160),invitedByUserId:actor.id,stagedUserId,metadata:{vendor_category:clean(raw.vendor_category,120)||undefined,company_name:clean(raw.company_name,200)||undefined,lead_id:clean(raw.lead_id,120)||undefined}})
      try{
        const providerId=await sendInviteEmail(c.env,{id:invite.id,invite_type:inviteType,email,full_name:clean(raw.full_name,160)||null},invite.token,invite.expiresAt)
        await recordInviteEmailResult(c.env,invite.id,{status:'sent',providerId})
        results.push({email,status:'sent'})
      }catch(err){
        await recordInviteEmailResult(c.env,invite.id,{status:'failed',error:err instanceof Error?err.message:'send failed'})
        results.push({email,status:'failed',error:err instanceof Error?err.message:'send failed'})
      }
    }catch(err){
      results.push({email,status:'failed',error:err instanceof VendorInviteConflict||err instanceof Error?err.message:'send failed'})
    }
  }
  return c.json({ok:true,results,sent:results.filter(r=>r.status==='sent').length,failed:results.filter(r=>r.status!=='sent').length})
})
