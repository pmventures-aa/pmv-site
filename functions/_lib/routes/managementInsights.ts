import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireStaff } from '../mid'
import { requireCapability } from '../capabilities'
import { visibleClientIds } from '../access'

export const managementInsightRoutes = new Hono<AppEnv>()

function scope(ids:string[]|null,column:string){
  if(ids===null)return{where:'1=1',params:[] as string[]}
  if(!ids.length)return{where:'1=0',params:[] as string[]}
  return{where:`${column} IN (${ids.map(()=>'?').join(',')})`,params:ids}
}

managementInsightRoutes.get('/management/scorecard', requireStaff, requireCapability('can_view_reports'), async(c)=>{
  const user=c.get('user');const ids=await visibleClientIds(c.env,user);const taskScope=scope(ids,'t.client_user_id');const matterScope=scope(ids,'m.client_user_id');const invoiceScope=scope(ids,'i.client_user_id');const leadScope=user.role==='admin'?'1=1':"ci.owner_staff_user_id=?";const leadParams=user.role==='admin'?[]:[user.id]
  const [employees,projects,pipeline,receivables,portfolio]=await Promise.all([
    c.env.DB.prepare(`
      SELECT u.id,COALESCE(u.full_name,u.email) employee,u.email,
        (SELECT COUNT(*) FROM staff_assignments sa WHERE sa.staff_user_id=u.id) assigned_clients,
        (SELECT COUNT(*) FROM client_tasks t WHERE t.assigned_staff_user_id=u.id AND t.status!='done') open_tasks,
        (SELECT COUNT(*) FROM client_tasks t WHERE t.assigned_staff_user_id=u.id AND t.status!='done' AND t.due_date IS NOT NULL AND date(t.due_date)<date('now')) overdue_tasks,
        (SELECT COUNT(*) FROM client_tasks t WHERE t.assigned_staff_user_id=u.id AND t.status='done' AND t.created_at>=datetime('now','-30 days')) completed_tasks_30d,
        (SELECT COUNT(*) FROM support_tickets st WHERE st.assigned_staff_user_id=u.id AND st.status='open') open_tickets,
        (SELECT COUNT(*) FROM activity_events a WHERE a.actor_user_id=u.id AND a.created_at>=datetime('now','-30 days')) interactions_30d,
        (SELECT COUNT(*) FROM email_log e WHERE e.sent_by_user_id=u.id AND e.created_at>=datetime('now','-30 days')) emails_30d,
        (SELECT ROUND(AVG((julianday(st.first_response_at)-julianday(st.created_at))*24),1) FROM support_tickets st WHERE st.assigned_staff_user_id=u.id AND st.first_response_at IS NOT NULL AND st.created_at>=datetime('now','-30 days')) avg_response_hours
      FROM users u WHERE u.role IN ('staff','admin') AND u.status='active' ORDER BY employee`,
    ).all<any>(),
    c.env.DB.prepare(`
      SELECT m.id,m.title,m.status,m.due_date,m.client_user_id,COALESCE(u.full_name,u.email) client,u.email,
        (SELECT COUNT(*) FROM client_tasks t WHERE t.matter_id=m.id AND t.status!='done') open_tasks,
        (SELECT COUNT(*) FROM client_tasks t WHERE t.matter_id=m.id AND t.status!='done' AND t.due_date IS NOT NULL AND date(t.due_date)<date('now')) overdue_tasks,
        (SELECT COALESCE(SUM(i.amount_cents),0) FROM invoices i WHERE i.client_user_id=m.client_user_id AND i.status='open') open_invoice_cents,
        (SELECT MAX(a.created_at) FROM activity_events a WHERE a.client_user_id=m.client_user_id) last_activity_at
      FROM matters m JOIN users u ON u.id=m.client_user_id WHERE m.status!='closed' AND ${matterScope.where} ORDER BY COALESCE(m.due_date,'9999-12-31'),m.created_at LIMIT 250`,
    ).bind(...matterScope.params).all<any>(),
    c.env.DB.prepare(`SELECT COALESCE(ci.lifecycle_stage,'unclassified') stage,COUNT(*) count,ROUND(AVG(julianday('now')-julianday(ci.created_at)),1) avg_age_days,SUM(CASE WHEN julianday('now')-julianday(ci.created_at)>=14 THEN 1 ELSE 0 END) aged_14d FROM contact_inquiries ci WHERE ci.client_user_id IS NULL AND ci.archived_at IS NULL AND ${leadScope} GROUP BY COALESCE(ci.lifecycle_stage,'unclassified') ORDER BY count DESC`).bind(...leadParams).all<any>(),
    c.env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN i.status='open' THEN i.amount_cents ELSE 0 END),0) open_cents,
      COALESCE(SUM(CASE WHEN i.status='open' AND i.due_date IS NOT NULL AND date(i.due_date)<date('now') THEN i.amount_cents ELSE 0 END),0) overdue_cents,
      COALESCE(SUM(CASE WHEN i.status='open' AND i.due_date IS NOT NULL AND date(i.due_date) BETWEEN date('now') AND date('now','+7 days') THEN i.amount_cents ELSE 0 END),0) due_7d_cents,
      COALESCE(SUM(CASE WHEN i.status='open' AND i.due_date IS NOT NULL AND date(i.due_date) BETWEEN date('now','+8 days') AND date('now','+30 days') THEN i.amount_cents ELSE 0 END),0) due_30d_cents,
      SUM(CASE WHEN i.status='open' THEN 1 ELSE 0 END) open_count
      FROM invoices i WHERE ${invoiceScope.where}`).bind(...invoiceScope.params).first<any>(),
    Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) n FROM matters m WHERE m.status!='closed' AND ${matterScope.where}`).bind(...matterScope.params).first<{n:number}>(),
      c.env.DB.prepare(`SELECT COUNT(*) n FROM client_tasks t WHERE t.status!='done' AND t.due_date IS NOT NULL AND date(t.due_date)<date('now') AND ${taskScope.where}`).bind(...taskScope.params).first<{n:number}>(),
      c.env.DB.prepare(`SELECT COUNT(*) n FROM support_tickets t WHERE t.status='open' AND ${scope(ids,'t.client_user_id').where}`).bind(...scope(ids,'t.client_user_id').params).first<{n:number}>(),
    ]),
  ])

  const employeeRows=(employees.results||[]).map((r:any)=>{
    const load=(Number(r.open_tasks)||0)+(Number(r.overdue_tasks)||0)*2+(Number(r.open_tickets)||0)*2+(Number(r.assigned_clients)||0)*0.5
    const workload_status=load>=24?'high':load>=12?'watch':'balanced'
    return{...r,load_index:Math.round(load*10)/10,workload_status}
  }).sort((a:any,b:any)=>b.load_index-a.load_index)
  const projectRows=(projects.results||[]).map((r:any)=>{
    const due=r.due_date?new Date(`${String(r.due_date).slice(0,10)}T23:59:59`).getTime():null;const daysDue=due?Math.ceil((due-Date.now())/86400000):null;const inactiveDays=r.last_activity_at?Math.floor((Date.now()-new Date(r.last_activity_at).getTime())/86400000):999
    const health=(Number(r.overdue_tasks)||0)>0||(daysDue!==null&&daysDue<0)?'at_risk':(daysDue!==null&&daysDue<=7)||inactiveDays>=14?'watch':'on_track'
    return{...r,health,days_to_due:daysDue,inactive_days:inactiveDays}
  })
  const [openMatters,overdueTasks,openTickets]=portfolio as any
  return c.json({
    generated_at:new Date().toISOString(),
    portfolio:{open_matters:openMatters?.n||0,overdue_tasks:overdueTasks?.n||0,open_tickets:openTickets?.n||0,open_receivables_cents:receivables?.open_cents||0},
    workload_capacity:employeeRows,project_health:projectRows,pipeline_aging:pipeline.results||[],receivables:receivables||{open_cents:0,overdue_cents:0,due_7d_cents:0,due_30d_cents:0,open_count:0},
  })
})
