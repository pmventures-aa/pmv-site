import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { currentSessionId, revokeSession, revokeUserSessions } from '../session'
import { logAudit, actorGeo, actorIp, actorUserAgent } from '../auditLog'

export const securitySessionRoutes = new Hono<AppEnv>()

function deviceLabel(ua: string | null) {
  const value = ua || ''
  const platform = /iPhone/i.test(value) ? 'iPhone' : /iPad/i.test(value) ? 'iPad' : /Android/i.test(value) ? 'Android' : /Macintosh|Mac OS X/i.test(value) ? 'Mac' : /Windows/i.test(value) ? 'Windows PC' : /Linux/i.test(value) ? 'Linux device' : 'Unknown device'
  const browser = /Edg\//i.test(value) ? 'Edge' : /CriOS|Chrome\//i.test(value) ? 'Chrome' : /FxiOS|Firefox\//i.test(value) ? 'Firefox' : /Safari\//i.test(value) ? 'Safari' : 'Browser'
  return `${browser} on ${platform}`
}

async function isOwner(c: any) {
  const user = c.get('user')
  if (user.role !== 'admin') return false
  const row = await c.env.DB.prepare('SELECT is_owner FROM team_members WHERE user_id=?').bind(user.id).first() as {is_owner:number}|null
  return !!row?.is_owner
}

securitySessionRoutes.get('/security/sessions', requireStaff, async (c) => {
  const user = c.get('user')
  const currentId = await currentSessionId(c.env, c.req.raw)
  const owner = await isOwner(c)
  const scope = owner && c.req.query('scope') === 'all' ? 'all' : 'mine'
  if (currentId) {
    const geo = actorGeo(c.req.raw)
    const ua = c.req.header('User-Agent') || null
    await c.env.DB.prepare(
      `UPDATE auth_sessions SET device_label=?,user_agent=?,ip_address=?,city=?,region=?,country=?,last_seen_at=datetime('now') WHERE id=? AND user_id=?`,
    ).bind(deviceLabel(ua), ua?.slice(0,1000)||null, actorIp(c.req.raw), geo.city||null, geo.region||null, geo.country||null, currentId, user.id).run().catch(()=>undefined)
  }
  const sessions = scope === 'all'
    ? await c.env.DB.prepare(
      `SELECT s.*,u.full_name,u.email,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id
       WHERE s.created_at>=datetime('now','-30 days') ORDER BY CASE WHEN s.revoked_at IS NULL AND s.expires_at>datetime('now') THEN 0 ELSE 1 END,s.last_seen_at DESC LIMIT 500`,
    ).all<any>()
    : await c.env.DB.prepare(
      `SELECT s.*,u.full_name,u.email,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id
       WHERE s.user_id=? AND s.created_at>=datetime('now','-30 days') ORDER BY CASE WHEN s.revoked_at IS NULL AND s.expires_at>datetime('now') THEN 0 ELSE 1 END,s.last_seen_at DESC LIMIT 100`,
    ).bind(user.id).all<any>()

  const [failed, exports, privileged] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='login_failed' AND created_at>=datetime('now','-24 hours')").first<{n:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) n FROM data_export_events WHERE created_at>=datetime('now','-24 hours')").first<{n:number}>().catch(()=>({n:0})),
    c.env.DB.prepare("SELECT COUNT(*) n FROM audit_log WHERE action IN ('permission_changed','record_permanently_deleted','session_revoked','bulk_sessions_revoked') AND created_at>=datetime('now','-24 hours')").first<{n:number}>(),
  ])
  const rows = (sessions.results||[]).map((row:any)=>({ ...row, current: row.id===currentId, active: !row.revoked_at && new Date(row.expires_at).getTime()>Date.now() }))
  return c.json({ scope, owner, current_user_id:user.id, current_session_id:currentId, sessions:rows, summary:{ active_sessions:rows.filter((r:any)=>r.active).length, failed_logins_24h:failed?.n||0, exports_24h:(exports as any)?.n||0, privileged_events_24h:privileged?.n||0 } })
})

securitySessionRoutes.delete('/security/sessions/:id', requireStaff, async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')??''
  if(!id)return c.json({error:'session not found'},404)
  const row = await c.env.DB.prepare('SELECT user_id FROM auth_sessions WHERE id=?').bind(id).first<{user_id:string}>()
  if (!row) return c.json({error:'session not found'},404)
  const owner = await isOwner(c)
  if (row.user_id !== user.id && !owner) return c.json({error:'forbidden'},403)
  const currentId = await currentSessionId(c.env,c.req.raw)
  const result = await revokeSession(c.env,id,user.id,row.user_id===user.id?'user revoked session':'owner revoked session')
  if (result.revoked) await logAudit(c.env,{ actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'session_revoked',entityType:'auth_session',entityId:id,after:{target_user_id:row.user_id,current:id===currentId} })
  return c.json({ok:true,revoked:result.revoked,current:id===currentId})
})

securitySessionRoutes.post('/security/sessions/revoke-others', requireStaff, async (c) => {
  const user=c.get('user')
  const currentId=await currentSessionId(c.env,c.req.raw)
  await revokeUserSessions(c.env,user.id,user.id,currentId)
  await logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'bulk_sessions_revoked',entityType:'user',entityId:user.id,after:{preserved_session_id:currentId}})
  return c.json({ok:true})
})

securitySessionRoutes.post('/security/users/:id/revoke-sessions', requireStaff, async (c) => {
  const user=c.get('user')
  if (!(await isOwner(c))) return c.json({error:'owner accounts only'},403)
  const target=c.req.param('id')??''
  if(!target)return c.json({error:'user not found'},404)
  if (target===user.id) return c.json({error:'use Revoke other sessions for your own account'},400)
  await revokeUserSessions(c.env,target,user.id,null)
  await logAudit(c.env,{actorUserId:user.id,actorIp:actorIp(c.req.raw),actorUserAgent:actorUserAgent(c.req.raw),actorGeo:actorGeo(c.req.raw),action:'bulk_sessions_revoked',entityType:'user',entityId:target})
  return c.json({ok:true})
})