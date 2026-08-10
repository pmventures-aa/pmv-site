import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireClient } from '../mid'
import { answerForStorage, normalizeAnswer, type IntakeQuestion } from '../intake'
import { uuid } from '../crypto'

export const serviceOfferingApplicationRoutes = new Hono<AppEnv>()

const MAX_FILE_BYTES = 20 * 1024 * 1024
const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

type OfferingRow = {
  id:string
  service_key:string
  name:string
  description:string
  starting_price_cents:number|null
  pricing_label:string|null
  badge:string|null
  requirements_json:string|null
  client_note:string|null
  required_documents_json:string|null
  intake_prompts_json:string|null
  active:number
}

type ApplicationRow = {
  id:string
  client_user_id:string
  service_key:string
  status:string
  requested_offering_id:string|null
}

function parseList(raw:string|null|undefined):string[]{
  if(!raw)return []
  try{const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed.map(String).map(v=>v.trim()).filter(Boolean):[]}catch{return []}
}

function safeFileName(name:string):string{
  const cleaned=name.replace(/[\\/]/g,'-').replace(/[^a-zA-Z0-9._() -]/g,'').replace(/\s+/g,' ').trim().slice(0,120)
  return cleaned||'upload'
}

function offeringFromReferer(c:any):string{
  const ref=c.req.header('Referer')||''
  try{return new URL(ref).searchParams.get('offering')?.trim()||''}catch{return ''}
}

async function getOffering(c:any,id:string,serviceKey?:string,activeOnly=false):Promise<OfferingRow|null>{
  if(!id)return null
  const conditions=['id = ?']
  const values:any[]=[id]
  if(serviceKey){conditions.push('service_key = ?');values.push(serviceKey)}
  if(activeOnly)conditions.push('active = 1')
  return await c.env.DB.prepare(`SELECT * FROM service_offerings WHERE ${conditions.join(' AND ')}`).bind(...values).first() as OfferingRow|null
}

async function getDraft(c:any,applicationId:string):Promise<ApplicationRow|null>{
  const user=c.get('user')
  return await c.env.DB.prepare(`SELECT id,client_user_id,service_key,status,requested_offering_id FROM service_applications WHERE id=? AND client_user_id=? AND status='draft'`).bind(applicationId,user.id).first() as ApplicationRow|null
}

function syntheticQuestions(offering:OfferingRow):IntakeQuestion[]{
  const prompts=parseList(offering.intake_prompts_json)
  const docs=parseList(offering.required_documents_json)
  const questions:IntakeQuestion[]=[]
  prompts.forEach((label,index)=>questions.push({
    id:`offering:${offering.id}:prompt:${index+1}`,
    service_key:offering.service_key,
    question_key:`__offering_prompt_${String(index+1).padStart(2,'0')}`,
    label,
    help_text:'A short answer is fine. This is specific to the service option you selected.',
    input_type:'text',
    required:1,
    sort_order:(index+1)*10,
    step_label:`About ${offering.name}`,
    step_order:800,
    allow_multiple:0,
  }))
  docs.forEach((label,index)=>questions.push({
    id:`offering:${offering.id}:doc:${index+1}`,
    service_key:offering.service_key,
    question_key:`__offering_doc_${String(index+1).padStart(2,'0')}`,
    label,
    help_text:'Take a clear photo from your phone or choose an existing file. PDF, JPG, PNG, and common office files are supported.',
    input_type:'file',
    required:1,
    sort_order:(index+1)*10,
    step_label:`Documents for ${offering.name}`,
    step_order:810,
    allow_multiple:0,
  }))
  return questions
}

async function upsertOfferingSelection(c:any,applicationId:string,offering:OfferingRow){
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE service_applications SET requested_offering_id=?,updated_at=datetime('now') WHERE id=? AND status='draft'`).bind(offering.id,applicationId),
    c.env.DB.prepare(`INSERT INTO service_application_answers
      (id,application_id,question_id,question_key,question_label,step_label,step_order,sort_order,value_json,updated_at)
      VALUES (?,?,NULL,'__pmv_offering_selection','Selected offering','Service selection',0,0,?,datetime('now'))
      ON CONFLICT(application_id,question_key) DO UPDATE SET question_label=excluded.question_label,step_label=excluded.step_label,value_json=excluded.value_json,updated_at=datetime('now')`).bind(uuid(),applicationId,answerForStorage(offering.name)),
  ])
}

async function persistSyntheticAnswers(c:any,application:ApplicationRow,offering:OfferingRow,incoming:Record<string,unknown>){
  const questions=syntheticQuestions(offering).filter(q=>q.input_type!=='file')
  const byKey=new Map(questions.map(q=>[q.question_key,q]))
  const statements:D1PreparedStatement[]=[]
  for(const [key,raw] of Object.entries(incoming)){
    const q=byKey.get(key)
    if(!q)continue
    statements.push(c.env.DB.prepare(`INSERT INTO service_application_answers
      (id,application_id,question_id,question_key,question_label,step_label,step_order,sort_order,value_json,updated_at)
      VALUES (?,?,NULL,?,?,?,?,?,?,datetime('now'))
      ON CONFLICT(application_id,question_key) DO UPDATE SET question_label=excluded.question_label,step_label=excluded.step_label,step_order=excluded.step_order,sort_order=excluded.sort_order,value_json=excluded.value_json,updated_at=datetime('now')`).bind(
        uuid(),application.id,q.question_key,q.label,q.step_label??null,q.step_order,q.sort_order,answerForStorage(normalizeAnswer(raw)),
      ))
  }
  if(statements.length)await c.env.DB.batch(statements)
}

serviceOfferingApplicationRoutes.use('/service-applications/:serviceKey/start',requireClient,async(c,next)=>{
  if(c.req.method!=='POST')return next()
  const requested=offeringFromReferer(c)
  const serviceKey=c.req.param('serviceKey')||''
  if(requested&&!await getOffering(c,requested,serviceKey,true))return c.json({error:'That service option is no longer available.'},400)
  await next()
  if(!c.res.ok)return
  const original=c.res
  const data=await original.clone().json<any>().catch(()=>null)
  if(!data?.application?.id)return
  let offering:OfferingRow|null=null
  if(requested)offering=await getOffering(c,requested,serviceKey,true)
  else if(data.application.requested_offering_id)offering=await getOffering(c,data.application.requested_offering_id,serviceKey,false)
  if(!offering)return
  await upsertOfferingSelection(c,data.application.id,offering)
  data.application.requested_offering_id=offering.id
  data.offering={id:offering.id,name:offering.name,description:offering.description,pricingLabel:offering.pricing_label||undefined,badge:offering.badge||undefined,note:offering.client_note||undefined}
  data.questions=[...(data.questions||[]),...syntheticQuestions(offering)]
  data.answers={...(data.answers||{}),__pmv_offering_selection:offering.name}
  const headers=new Headers(original.headers);headers.set('Content-Type','application/json; charset=UTF-8');headers.delete('Content-Length')
  c.res=new Response(JSON.stringify(data),{status:original.status,headers})
})

serviceOfferingApplicationRoutes.use('/service-applications/:id',requireClient,async(c,next)=>{
  if(c.req.method!=='PATCH')return next()
  const cloned=c.req.raw.clone()
  const body=await cloned.json().catch(()=>({})) as {answers?:Record<string,unknown>}
  await next()
  if(!c.res.ok||!body.answers)return
  const application=await getDraft(c,c.req.param('id')||'')
  if(!application?.requested_offering_id)return
  const offering=await getOffering(c,application.requested_offering_id,application.service_key,false)
  if(offering)await persistSyntheticAnswers(c,application,offering,body.answers)
})

serviceOfferingApplicationRoutes.post('/service-applications/:id/files/:questionKey',requireClient,async(c,next)=>{
  const questionKey=c.req.param('questionKey')||''
  if(!questionKey.startsWith('__offering_doc_'))return next()
  const user=c.get('user')
  if(!c.env.UPLOADS)return c.json({error:'secure file storage is not configured'},503)
  const application=await getDraft(c,c.req.param('id')||'')
  if(!application?.requested_offering_id)return c.json({error:'offering-specific upload is not available for this application'},400)
  const offering=await getOffering(c,application.requested_offering_id,application.service_key,false)
  if(!offering)return c.json({error:'service option not found'},404)
  const question=syntheticQuestions(offering).find(q=>q.question_key===questionKey&&q.input_type==='file')
  if(!question)return c.json({error:'file upload is not valid for this service option'},400)
  const existing=await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM service_application_attachments WHERE application_id=? AND question_key=?`).bind(application.id,questionKey).first() as {n:number}|null
  if((existing?.n??0)>0)return c.json({error:'this document slot already has a file; remove it before replacing'},400)
  const contentType=(c.req.header('Content-Type')||'application/octet-stream').split(';')[0].trim().toLowerCase()
  if(!ALLOWED_UPLOAD_TYPES.has(contentType))return c.json({error:'unsupported file type'},400)
  const body=await c.req.raw.arrayBuffer()
  if(body.byteLength===0)return c.json({error:'empty upload'},400)
  if(body.byteLength>MAX_FILE_BYTES)return c.json({error:'file is too large — 20MB max'},413)
  const originalName=safeFileName(c.req.header('X-File-Name')||'upload')
  const docId=uuid(),linkId=uuid()
  const objectKey=`client-documents/${user.id}/applications/${application.id}/${docId}-${originalName}`
  await c.env.UPLOADS.put(objectKey,body,{httpMetadata:{contentType},customMetadata:{originalName,applicationId:application.id,questionKey,offeringId:offering.id}})
  try{
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO client_documents
        (id,client_user_id,category,file_name,r2_key,review_status,visibility,content_type,size_bytes,source,uploaded_by_user_id)
        VALUES (?,?,'service_application_attachment',?,?,'pending','client',?,?,'service_offering_upload',?)`).bind(docId,user.id,originalName,objectKey,contentType,body.byteLength,user.id),
      c.env.DB.prepare(`INSERT INTO service_application_attachments (id,application_id,document_id,question_key) VALUES (?,?,?,?)`).bind(linkId,application.id,docId,questionKey),
      c.env.DB.prepare(`INSERT INTO service_application_answers
        (id,application_id,question_id,question_key,question_label,step_label,step_order,sort_order,value_json,updated_at)
        VALUES (?,?,NULL,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(application_id,question_key) DO UPDATE SET question_label=excluded.question_label,step_label=excluded.step_label,value_json=excluded.value_json,updated_at=datetime('now')`).bind(uuid(),application.id,questionKey,question.label,question.step_label??null,question.step_order,question.sort_order,answerForStorage([originalName])),
      c.env.DB.prepare(`UPDATE service_applications SET updated_at=datetime('now') WHERE id=?`).bind(application.id),
    ])
  }catch(err){await c.env.UPLOADS.delete(objectKey).catch(()=>{});throw err}
  return c.json({ok:true,document:{id:linkId,document_id:docId,question_key:questionKey,file_name:originalName,content_type:contentType,size_bytes:body.byteLength,visibility:'client',created_at:new Date().toISOString()}},201)
})

serviceOfferingApplicationRoutes.use('/service-applications/:id/submit',requireClient,async(c,next)=>{
  if(c.req.method!=='POST')return next()
  const application=await getDraft(c,c.req.param('id')||'')
  if(!application?.requested_offering_id)return next()
  const offering=await getOffering(c,application.requested_offering_id,application.service_key,false)
  if(!offering)return c.json({error:'selected service option is unavailable'},400)
  const questions=syntheticQuestions(offering)
  const answerResult=await c.env.DB.prepare(`SELECT question_key,value_json FROM service_application_answers WHERE application_id=? AND question_key LIKE '__offering_prompt_%'`).bind(application.id).all()
  const answerRows=(answerResult.results??[]) as Array<{question_key:string;value_json:string}>
  const answerMap=new Map(answerRows.map(row=>[row.question_key,row.value_json]))
  const fileResult=await c.env.DB.prepare(`SELECT question_key,COUNT(*) AS n FROM service_application_attachments WHERE application_id=? AND question_key LIKE '__offering_doc_%' GROUP BY question_key`).bind(application.id).all()
  const fileRows=(fileResult.results??[]) as Array<{question_key:string;n:number}>
  const fileMap=new Map(fileRows.map(row=>[row.question_key,row.n]))
  const missing:string[]=[]
  for(const q of questions){
    if(q.input_type==='file'){if((fileMap.get(q.question_key)??0)<1)missing.push(q.label)}
    else{const raw=answerMap.get(q.question_key);if(!raw){missing.push(q.label);continue}try{const value=JSON.parse(raw);if(value===null||String(value).trim()==='')missing.push(q.label)}catch{if(!raw.trim())missing.push(q.label)}}
  }
  if(missing.length)return c.json({error:'Please complete the selected service requirements before submitting.',missing},400)
  return next()
})
