import type { Env } from './types'
import { REPORTS_BY_KEY, type ReportCtx } from './reportRegistry'
import { uuid } from './crypto'

function csvCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text
}
function reportCsv(result: {columns:{key:string;label:string}[];rows:Record<string,unknown>[]}) { const lines=[result.columns.map(c=>csvCell(c.label)).join(',')];for(const row of result.rows)lines.push(result.columns.map(c=>csvCell(row[c.key])).join(','));return `${lines.join('\r\n')}\r\n` }
function toBase64(text:string){const bytes=new TextEncoder().encode(text);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary)}
function normalizeTime(value: unknown) { const text=typeof value==='string'?value.trim():'';return /^([01]\d|2[0-3]):[0-5]\d$/.test(text)?text:'08:00' }

export function nextScheduledReportRun(kind:string|null,timeValue:string|null,dayValue:number|null,from=new Date()) {
  if(!kind)return null
  const [hour,minute]=normalizeTime(timeValue).split(':').map(Number)
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(from)
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]))
  const localNow=new Date(`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:00`)
  const localTarget=new Date(`${values.year}-${values.month}-${values.day}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`)
  if(kind==='weekly'){
    const desired=Math.min(Math.max(Number(dayValue)||1,0),6);const current=localNow.getDay();let add=(desired-current+7)%7;if(add===0&&localTarget<=localNow)add=7;localTarget.setDate(localTarget.getDate()+add)
  }else if(kind==='monthly'){
    const desired=Math.min(Math.max(Number(dayValue)||1,1),28);localTarget.setDate(desired);if(localTarget<=localNow){localTarget.setMonth(localTarget.getMonth()+1);localTarget.setDate(desired)}
  }else if(localTarget<=localNow)localTarget.setDate(localTarget.getDate()+1)
  const probe=new Date(localTarget.toLocaleString('en-US',{timeZone:'America/New_York'}));const offset=localTarget.getTime()-probe.getTime();return new Date(localTarget.getTime()+offset).toISOString()
}

async function sendReportEmail(env:Env,to:string,subject:string,html:string,fileName:string,csv:string,idempotencyKey:string) {
  if(!env.RESEND_API_KEY)throw new Error('RESEND_API_KEY is not configured')
  const from=env.RESEND_FROM_EMAIL||'Pinnacle Management Ventures <orders@pinnaclemanagementventures.com>'
  const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey.slice(0,256)},body:JSON.stringify({from,to,subject,html,attachments:[{filename:fileName,content:toBase64(csv)}],tags:[{name:'category',value:'scheduled_report'}]})})
  const payload=await res.json<any>().catch(()=>({}));if(!res.ok||!payload?.id)throw new Error(payload?.message||`Resend send failed (${res.status})`;return payload.id as string
}

async function visibleIdsForCreator(env:Env,userId:string){const user=await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(userId).first<{role:string}>();if(user?.role==='admin')return null;const rows=await env.DB.prepare('SELECT client_user_id FROM staff_assignments WHERE staff_user_id=?').bind(userId).all<{client_user_id:string}>();return(rows.results||[]).map(r=>r.client_user_id)}

export async function runScheduledReportTemplate(env:Env,template:any,trigger:'scheduled'|'manual'='scheduled') {
  const def=REPORTS_BY_KEY[String(template.report_key||'')];if(!def)throw new Error('unknown report')
  let filters:any={};try{filters=JSON.parse(template.filters_json||'{}')}catch{filters={}}
  const toDate=String(filters.to||new Date().toISOString().slice(0,10));const fromDate=String(filters.from||new Date(Date.now()-30*86400000).toISOString().slice(0,10))
  const ctx:ReportCtx={env,from:`${fromDate} 00:00:00`,to:`${toDate} 23:59:59`,clientIds:await visibleIdsForCreator(env,template.created_by)}
  const runId=uuid();let recipients:string[]=[];try{recipients=JSON.parse(template.recipients_json||'[]')}catch{recipients=[]};recipients=[...new Set(recipients.map(v=>String(v).trim().toLowerCase()).filter(v=>v.includes('@')))].slice(0,25)
  await env.DB.prepare("INSERT INTO scheduled_report_runs(id,template_id,status,recipients_json,run_at) VALUES (?,?,'pending',?,datetime('now'))").bind(runId,template.id,JSON.stringify(recipients)).run()
  try{
    const result=await def.run(ctx);const csv=reportCsv(result);const fileName=`${def.label.replace(/[^a-zA-Z0-9 _.-]/g,'').trim()||'report'}.csv`
    if(recipients.length){const html=`<p>Your scheduled Pinnacle management report <strong>${def.label}</strong> is attached.</p><p>Reporting window: ${fromDate} through ${toDate}. Rows generated: ${result.rows.length.toLocaleString()}.</p><p>This report was generated from Pinnacle HQ and should be handled according to your normal data-access procedures.</p>`;await Promise.all(recipients.map(to=>sendReportEmail(env,to,`Pinnacle report: ${def.label}`,html,fileName,csv,`pmv-report-${runId}-${to}`)))}
    const next=nextScheduledReportRun(template.schedule_kind,template.schedule_time,template.schedule_day)
    await env.DB.batch([env.DB.prepare("UPDATE scheduled_report_runs SET status='succeeded',rows_generated=?,finished_at=datetime('now') WHERE id=?").bind(result.rows.length,runId),env.DB.prepare("UPDATE report_templates SET last_run_at=datetime('now'),last_status='succeeded',last_error=NULL,next_run_at=? WHERE id=?").bind(next,template.id)])
    return{run_id:runId,rows:result.rows.length,recipients:recipients.length,status:'succeeded',trigger}
  }catch(err){const message=err instanceof Error?err.message:'scheduled report failed';const next=nextScheduledReportRun(template.schedule_kind,template.schedule_time,template.schedule_day);await env.DB.batch([env.DB.prepare("UPDATE scheduled_report_runs SET status='failed',error=?,finished_at=datetime('now') WHERE id=?").bind(message.slice(0,1000),runId),env.DB.prepare("UPDATE report_templates SET last_run_at=datetime('now'),last_status='failed',last_error=?,next_run_at=? WHERE id=?").bind(message.slice(0,1000),next,template.id)]);throw err}
}

export async function runDueScheduledReports(env:Env,limit=20){const due=await env.DB.prepare("SELECT * FROM report_templates WHERE enabled=1 AND schedule_kind IS NOT NULL AND next_run_at IS NOT NULL AND datetime(next_run_at)<=datetime('now') ORDER BY datetime(next_run_at) LIMIT ?").bind(limit).all<any>();let sent=0,failed=0,rows=0;for(const template of due.results||[]){try{const result=await runScheduledReportTemplate(env,template,'scheduled');sent++;rows+=result.rows}catch{failed++}}return{processed:(due.results||[]).length,sent,failed,skipped:0,rows_generated:rows}}
