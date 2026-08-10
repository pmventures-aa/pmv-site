import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { requireUser } from '../mid'

export const documentWorkspaceExtraRoutes = new Hono<AppEnv>()

async function requireStaff(c:any,next:any){
  return requireUser(c,async()=>{
    const u=c.get('user')
    if(u.role!=='admin'&&u.role!=='staff')return c.json({error:'forbidden'},403)
    return next()
  })
}

documentWorkspaceExtraRoutes.use('*',requireStaff)

documentWorkspaceExtraRoutes.get('/envelopes/:id/source',async c=>{
  if(!c.env.UPLOADS)return c.json({error:'Document storage is not configured.'},503)
  const row=await c.env.DB.prepare(`SELECT f.storage_key,f.mime_type,f.original_name FROM envelopes e JOIN document_files f ON f.id=e.source_file_id WHERE e.id=?`).bind(c.req.param('id')).first<any>()
  if(!row)return c.json({error:'source document not found'},404)
  const obj=await c.env.UPLOADS.get(row.storage_key)
  if(!obj)return c.json({error:'source document missing from storage'},404)
  return new Response(obj.body,{headers:{'Content-Type':row.mime_type||'application/pdf','Content-Disposition':`inline; filename="${String(row.original_name||'document.pdf').replace(/"/g,'')}"`,'Cache-Control':'private, no-store'}})
})

documentWorkspaceExtraRoutes.get('/community-documents',async c=>{
  const rows=await c.env.DB.prepare(`SELECT d.*,(SELECT COUNT(*) FROM internal_document_versions v WHERE v.document_id=d.id) version_count,(SELECT COUNT(*) FROM internal_document_shares s WHERE s.document_id=d.id AND s.revoked_at IS NULL) share_count FROM internal_documents d WHERE d.library_scope='community' AND d.status='active' ORDER BY COALESCE(d.community_category,'General'),d.title`).all()
  return c.json({documents:rows.results})
})

documentWorkspaceExtraRoutes.post('/community-documents/:id/publish',async c=>{
  const id=c.req.param('id'),b=await c.req.json<any>().catch(()=>({})),u=c.get('user')
  if(u.role!=='admin')return c.json({error:'Only administrators can publish or change Community Documents.'},403)
  const category=String(b.category||'General').trim().slice(0,100)||'General'
  const editable=b.editable===true?1:0
  const branded=b.branded===false?0:1
  await c.env.DB.prepare(`UPDATE internal_documents SET library_scope='community',community_category=?,is_editable=?,is_branded=?,published_at=COALESCE(published_at,?),updated_by_user_id=?,updated_at=? WHERE id=?`).bind(category,editable,branded,new Date().toISOString(),u.id,new Date().toISOString(),id).run()
  return c.json({ok:true})
})

documentWorkspaceExtraRoutes.post('/community-documents/:id/unpublish',async c=>{
  const id=c.req.param('id'),u=c.get('user')
  if(u.role!=='admin')return c.json({error:'Only administrators can unpublish Community Documents.'},403)
  await c.env.DB.prepare(`UPDATE internal_documents SET library_scope='workspace',published_at=NULL,updated_by_user_id=?,updated_at=? WHERE id=?`).bind(u.id,new Date().toISOString(),id).run()
  return c.json({ok:true})
})

documentWorkspaceExtraRoutes.post('/community-documents/:id/copy',async c=>{
  const source=await c.env.DB.prepare(`SELECT * FROM internal_documents WHERE id=? AND library_scope='community' AND status='active'`).bind(c.req.param('id')).first<any>()
  if(!source)return c.json({error:'community document not found'},404)
  const user=c.get('user'),id=crypto.randomUUID(),created=new Date().toISOString()
  if(source.document_type==='text'){
    const versionId=crypto.randomUUID()
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO internal_documents (id,title,description,folder,document_type,status,text_content,mime_type,tags_json,created_by_user_id,updated_by_user_id,created_at,updated_at,library_scope,is_editable,is_branded) VALUES (?,?,?,?, 'text','active',?,'text/plain',?,?,?,?,?,'workspace',1,?)`).bind(id,source.title,source.description,source.folder,source.text_content||'',source.tags_json||'[]',user.id,user.id,created,created,source.is_branded??1),
      c.env.DB.prepare(`INSERT INTO internal_document_versions (id,document_id,version_number,text_content,change_note,created_by_user_id,created_at) VALUES (?,?,1,?,'Created from Community Documents',?,?)`).bind(versionId,id,source.text_content||'',user.id,created)
    ])
  }else{
    await c.env.DB.prepare(`INSERT INTO internal_documents (id,title,description,folder,document_type,status,current_file_id,mime_type,original_name,tags_json,created_by_user_id,updated_by_user_id,created_at,updated_at,library_scope,is_editable,is_branded) VALUES (?,?,?,?, 'file','active',?,?,?,?,?,?,?,?,'workspace',1,?)`).bind(id,source.title,source.description,source.folder,source.current_file_id,source.mime_type,source.original_name,source.tags_json||'[]',user.id,user.id,created,created,source.is_branded??1).run()
  }
  return c.json({id},201)
})
