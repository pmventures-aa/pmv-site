import { chromium } from 'playwright-core'
import http from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
const DIST='/home/user/pmv-site/dist'
const MIME={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon','.jpg':'image/jpeg'}
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);let f=join(DIST,p);if(!existsSync(f)||statSync(f).isDirectory())f=join(DIST,'index.html');res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});res.end(readFileSync(f))})
await new Promise(r=>server.listen(0,r));const port=server.address().port
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'})
async function cap(name,w,h){const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2});const page=await ctx.newPage()
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}))
  await page.goto(`http://localhost:${port}/`,{waitUntil:'networkidle'})
  await page.evaluate(()=>{const svg=Array.from(document.querySelectorAll('svg')).find(s=>s.querySelector('line'));svg.parentElement.scrollIntoView({block:'center'})})
  await page.waitForTimeout(1300)
  const box=await page.evaluate(()=>{const svg=Array.from(document.querySelectorAll('svg')).find(s=>s.querySelector('line'));const r=svg.parentElement.getBoundingClientRect();return {y:r.y,h:r.height}})
  await page.screenshot({path:`${DIST}/../${name}`,clip:{x:0,y:Math.max(0,box.y-16),width:w,height:Math.min(box.h+32,h)}})
  const chk=await page.evaluate(()=>{const svg=Array.from(document.querySelectorAll('svg')).find(s=>s.querySelector('line'));const links=Array.from(svg.parentElement.querySelectorAll('a'));let a=1e9,z=-1e9;links.forEach(l=>{const r=l.getBoundingClientRect();a=Math.min(a,r.x);z=Math.max(z,r.right)});return {minX:Math.round(a),maxX:Math.round(z),vw:window.innerWidth,overflow:document.body.scrollWidth>window.innerWidth+2}})
  console.log(name,JSON.stringify(chk)); await ctx.close()}
await cap('.shot-constellation-desktop.png',1280,860)
await cap('.shot-constellation-mobile.png',390,844)
await b.close();server.close();console.log('done')
