export type UploadKind = 'png'|'jpeg'|'webp'|'gif'|'pdf'|'docx'|'text'

const MIME_KIND:Record<string,UploadKind>={
  'image/png':'png','image/jpeg':'jpeg','image/webp':'webp','image/gif':'gif','application/pdf':'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','text/plain':'text',
}

function ascii(bytes:Uint8Array,start:number,length:number){return String.fromCharCode(...bytes.slice(start,start+length))}
function starts(bytes:Uint8Array,values:number[]){return values.every((v,i)=>bytes[i]===v)}

export function validateUploadSignature(buffer:ArrayBuffer,claimedMime:string,allowed:UploadKind[]):{ok:true;kind:UploadKind}|{ok:false;error:string}{
  const kind=MIME_KIND[claimedMime.toLowerCase()]
  if(!kind||!allowed.includes(kind))return {ok:false,error:'This file type is not allowed.'}
  const bytes=new Uint8Array(buffer)
  if(!bytes.length)return {ok:false,error:'The uploaded file is empty.'}
  let valid=false
  switch(kind){
    case 'png':valid=starts(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);break
    case 'jpeg':valid=starts(bytes,[0xff,0xd8,0xff]);break
    case 'webp':valid=bytes.length>=12&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP';break
    case 'gif':valid=ascii(bytes,0,6)==='GIF87a'||ascii(bytes,0,6)==='GIF89a';break
    case 'pdf':valid=ascii(bytes,0,5)==='%PDF-';break
    // DOCX is an OPC ZIP container. This verifies the container signature;
    // downstream document processing never executes embedded content/macros.
    case 'docx':valid=starts(bytes,[0x50,0x4b,0x03,0x04])||starts(bytes,[0x50,0x4b,0x05,0x06]);break
    case 'text':{
      const sample=bytes.slice(0,Math.min(bytes.length,4096));valid=!sample.some(b=>b===0);break
    }
  }
  return valid?{ok:true,kind}:{ok:false,error:'The file contents do not match the declared file type.'}
}

export function safeUploadName(name:string,fallback='file'){
  const clean=name.replace(/[\\/\0-\x1f\x7f]/g,'_').replace(/\.\.+/g,'.').replace(/[^a-zA-Z0-9._ -]/g,'_').trim().slice(0,180)
  return clean||fallback
}
