import type { Env } from './types'
import { uuid } from './crypto'

export interface BrandingProfileRow {
  id:string;name:string;description?:string|null;status:string;is_default:number;logo_file_id?:string|null;primary_color:string;secondary_color:string;accent_color?:string|null;background_color?:string|null;text_color?:string|null;heading_font_family?:string|null;body_font_family?:string|null;email_header_html?:string|null;email_footer_html?:string|null;legal_disclaimer?:string|null;pdf_header_text?:string|null;pdf_footer_text?:string|null;pdf_margin_top?:number;pdf_margin_right?:number;pdf_margin_bottom?:number;pdf_margin_left?:number;custom_css?:string|null;email_settings_json?:string|null;pdf_settings_json?:string|null
}
export interface CommunicationTemplateRow {
  id:string;name:string;template_key:string;template_type:string;status:string;branding_profile_id?:string|null;subject_template:string;preheader_template?:string|null;body_html:string;body_text?:string|null;custom_css?:string|null;variable_schema_json?:string|null;conditional_rules_json?:string|null
}

export function safeJson<T>(raw:unknown,fallback:T):T{try{return typeof raw==='string'&&raw?JSON.parse(raw) as T:fallback}catch{return fallback}}
function esc(s:unknown){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function tokenValue(vars:Record<string,unknown>,key:string){return key.split('.').reduce<any>((v,k)=>v&&typeof v==='object'?v[k]:undefined,vars)}

export function renderTemplateString(input:string,vars:Record<string,unknown>,escapeValues=false):string{
  let out=String(input||'')
  out=out.replace(/{{#if\s+([\w.]+)}}([\s\S]*?){{\/if}}/g,(_,key,body)=>tokenValue(vars,key)?body:'')
  out=out.replace(/{{#unless\s+([\w.]+)}}([\s\S]*?){{\/unless}}/g,(_,key,body)=>tokenValue(vars,key)?'':body)
  out=out.replace(/{{{\s*([\w.]+)\s*}}}/g,(_,key)=>String(tokenValue(vars,key)??''))
  out=out.replace(/{{\s*([\w.]+)\s*}}/g,(_,key)=>escapeValues?esc(tokenValue(vars,key)):String(tokenValue(vars,key)??''))
  return out
}

export async function resolveBrandingProfile(env:Env,id?:string|null):Promise<BrandingProfileRow|null>{
  if(id){const row=await env.DB.prepare("SELECT * FROM branding_profiles WHERE id=? AND status='active'").bind(id).first<BrandingProfileRow>();if(row)return row}
  return env.DB.prepare("SELECT * FROM branding_profiles WHERE status='active' ORDER BY is_default DESC,updated_at DESC LIMIT 1").first<BrandingProfileRow>()
}

async function fontFaces(env:Env,brand:BrandingProfileRow):Promise<string>{
  const families=[brand.heading_font_family,brand.body_font_family].filter(Boolean) as string[]
  if(!families.length)return ''
  try{
    const rows=await env.DB.prepare(`SELECT id,family_name,font_weight,font_style,mime_type FROM custom_font_assets WHERE active=1 AND family_name IN (${families.map(()=>'?').join(',')})`).bind(...families).all<any>()
    return (rows.results||[]).map((f:any)=>`@font-face{font-family:'${String(f.family_name).replace(/'/g,'')}';src:url('https://mail.pinnaclemanagementventures.com/api/brand-fonts/${encodeURIComponent(f.id)}') format('${String(f.mime_type||'').includes('woff2')?'woff2':String(f.mime_type||'').includes('woff')?'woff':String(f.mime_type||'').includes('opentype')?'opentype':'truetype'}');font-weight:${Number(f.font_weight||400)};font-style:${f.font_style==='italic'?'italic':'normal'};}` ).join('')
  }catch{return ''}
}

export async function renderBrandedEmail(env:Env,args:{brand?:BrandingProfileRow|null;subject:string;preheader?:string|null;bodyHtml:string;templateCss?:string|null}):Promise<string>{
  const brand=args.brand||await resolveBrandingProfile(env)
  const email=brand?safeJson<any>(brand.email_settings_json,{}):{}
  const primary=brand?.primary_color||'#C9A227',navy=brand?.secondary_color||'#06111F',bg=brand?.background_color||'#F7F4EC',ink=brand?.text_color||'#172033',accent=brand?.accent_color||'#E7D7A3'
  const heading=brand?.heading_font_family||'Georgia, serif',body=brand?.body_font_family||'Inter, Arial, sans-serif'
  const width=Math.max(480,Math.min(760,Number(email.maxWidth||640))),pad=Math.max(16,Math.min(56,Number(email.padding||32))),radius=Math.max(0,Math.min(24,Number(email.buttonRadius||10)))
  const faces=brand?await fontFaces(env,brand):''
  const header=brand?.email_header_html||`<div style="font-family:${heading};font-size:24px;font-weight:700;color:#fff">Pinnacle Management Ventures</div><div style="margin-top:5px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${accent}">Professional Support</div>`
  const footer=brand?.email_footer_html||`<p style="margin:0">Pinnacle Management Ventures</p><p style="margin:6px 0 0">pinnaclemanagementventures.com</p>`
  const custom=[brand?.custom_css,args.templateCss].filter(Boolean).join('\n')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}body{margin:0;background:${bg};color:${ink};font-family:${body};-webkit-font-smoothing:antialiased}.pmv-shell{width:100%;background:${bg};padding:30px 14px}.pmv-card{max-width:${width}px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden}.pmv-head{background:${email.headerBackground||navy};padding:${pad}px}.pmv-body{padding:${pad}px;font-size:15px;line-height:1.7}.pmv-body h1,.pmv-body h2,.pmv-body h3{font-family:${heading};color:${navy};line-height:1.2}.pmv-body a.pmv-button{display:inline-block;background:${primary};color:${email.buttonTextColor||navy};text-decoration:none;font-weight:700;padding:${Number(email.buttonPaddingY||12)}px ${Number(email.buttonPaddingX||20)}px;border-radius:${radius}px}.pmv-foot{padding:${Math.max(18,pad-6)}px;background:${email.footerBackground||'#F2EEE4'};font-size:12px;line-height:1.6;color:#667085}${custom}</style></head><body><div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(args.preheader||args.subject)}</div><div class="pmv-shell"><div class="pmv-card"><div class="pmv-head">${header}</div><div class="pmv-body">${args.bodyHtml}</div><div class="pmv-foot">${footer}</div></div></div></body></html>`
}

export async function resolveTemplate(env:Env,eventType:string,explicitTemplateId?:string|null):Promise<CommunicationTemplateRow|null>{
  if(explicitTemplateId){const row=await env.DB.prepare("SELECT * FROM communication_templates WHERE id=? AND status='active'").bind(explicitTemplateId).first<CommunicationTemplateRow>();if(row)return row}
  const assigned=await env.DB.prepare(`SELECT t.* FROM template_assignments a JOIN communication_templates t ON t.id=a.communication_template_id WHERE a.event_type=? AND a.enabled=1 AND t.status='active' ORDER BY a.priority ASC,a.updated_at DESC LIMIT 1`).bind(eventType).first<CommunicationTemplateRow>().catch(()=>null)
  if(assigned)return assigned
  return env.DB.prepare("SELECT * FROM communication_templates WHERE template_type=? AND status='active' ORDER BY updated_at DESC LIMIT 1").bind(eventType).first<CommunicationTemplateRow>()
}

export async function renderCommunication(env:Env,args:{eventType:string;vars:Record<string,unknown>;explicitTemplateId?:string|null;brandingProfileId?:string|null;fallbackSubject:string;fallbackBodyHtml:string}):Promise<{subject:string;html:string;template:CommunicationTemplateRow|null;brand:BrandingProfileRow|null}>{
  const template=await resolveTemplate(env,args.eventType,args.explicitTemplateId)
  const brand=await resolveBrandingProfile(env,template?.branding_profile_id||args.brandingProfileId)
  const subject=renderTemplateString(template?.subject_template||args.fallbackSubject,args.vars,false)
  const preheader=template?.preheader_template?renderTemplateString(template.preheader_template,args.vars,false):subject
  const body=renderTemplateString(template?.body_html||args.fallbackBodyHtml,args.vars,true)
  const html=await renderBrandedEmail(env,{brand,subject,preheader,bodyHtml:body,templateCss:template?.custom_css})
  return {subject,html,template,brand}
}

export async function snapshotBrandingProfile(env:Env,profileId:string,actorUserId:string|null,changeNote?:string|null){
  const profile=await env.DB.prepare('SELECT * FROM branding_profiles WHERE id=?').bind(profileId).first<any>()
  if(!profile)return null
  const current=await env.DB.prepare('SELECT COALESCE(MAX(version_number),0) n FROM branding_profile_versions WHERE branding_profile_id=?').bind(profileId).first<any>()
  const id=uuid(),version=Number(current?.n||0)+1
  await env.DB.prepare('INSERT INTO branding_profile_versions(id,branding_profile_id,version_number,snapshot_json,change_note,created_by_user_id) VALUES(?,?,?,?,?,?)').bind(id,profileId,version,JSON.stringify(profile),changeNote||null,actorUserId).run()
  return {id,version}
}

export async function snapshotCommunicationTemplate(env:Env,templateId:string,actorUserId:string|null,changeNote?:string|null){
  const t=await env.DB.prepare('SELECT * FROM communication_templates WHERE id=?').bind(templateId).first<any>()
  if(!t)return null
  const current=await env.DB.prepare('SELECT COALESCE(MAX(version_number),0) n FROM communication_template_versions WHERE communication_template_id=?').bind(templateId).first<any>()
  const id=uuid(),version=Number(current?.n||0)+1
  await env.DB.prepare(`INSERT INTO communication_template_versions(id,communication_template_id,version_number,subject_template,preheader_template,body_html,body_text,custom_css,editor_json,variable_schema_json,conditional_rules_json,branding_profile_id,attach_audit_certificate,change_note,created_by_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,templateId,version,t.subject_template,t.preheader_template,t.body_html,t.body_text,t.custom_css,t.editor_json,t.variable_schema_json,t.conditional_rules_json,t.branding_profile_id,t.attach_audit_certificate||0,changeNote||null,actorUserId).run()
  return {id,version}
}
