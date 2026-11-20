// SPDX-License-Identifier: AGPL-3.0-only
// Renders before|after SVG pairs to small PNGs with one headless Chromium over CDP (the projection SVG of the area,
// i.e. the same primitives the app's tab renderer draws; the app adds only the crayon look).
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';

async function launch(chrome){
 const profile=mkdtempSync(path.join(os.tmpdir(),'real-use-chrome-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 const ws=await new Promise((res,rej)=>{let buf='';const t=setTimeout(()=>rej(Error('chrome start timeout')),30000);child.stderr.on('data',d=>{buf+=d;const m=/DevTools listening on (ws:\S+)/.exec(buf);if(m){clearTimeout(t);res(m[1]);}});});
 const socket=new WebSocket(ws);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let seq=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(Error(m.error.message)):p.res(m.result);}});
 const call=(method,params={},sessionId)=>new Promise((res,rej)=>{const id=++seq;pending.set(id,{res,rej});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 let sessionId=null;
 const page=async()=>{const {targetId}=await call('Target.createTarget',{url:'about:blank'});({sessionId}=await call('Target.attachToTarget',{targetId,flatten:true}));
  await call('Emulation.setDeviceMetricsOverride',{width:820,height:300,deviceScaleFactor:1,mobile:false},sessionId);};
 await page();
 return {call:(m,p)=>call(m,p,sessionId),reset:page,profile,close(){socket.close();child.kill('SIGKILL');try{rmSync(profile,{recursive:true,force:true});}catch{}}};
}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
export async function renderPairs(dir,items,{chrome=existsSync('/usr/bin/chromium')?'/usr/bin/chromium':'google-chrome'}={}){
 const b=await launch(chrome);let n=0;
 try{
  for(const {svg,title}of items){
   const before=readFileSync(path.join(dir,'svg',svg+'.before.svg'),'utf8'),after=readFileSync(path.join(dir,'svg',svg+'.after.svg'),'utf8');
   const fit=s=>s.replace(/<svg /,'<svg width="400" height="280" preserveAspectRatio="xMidYMid meet" ');
   const html=`<html><body style="margin:0;font:11px sans-serif;background:#fff"><div style="display:flex;gap:8px;padding:4px"><div><div>before</div><div style="border:1px solid #bbb;width:400px;height:270px;overflow:hidden">${fit(before)}</div></div><div><div>after: ${esc(title).slice(0,70)}</div><div style="border:1px solid #bbb;width:400px;height:270px;overflow:hidden">${fit(after)}</div></div></div></body></html>`;
   // A page that crashes or detaches is replaced; one bad SVG never stops the batch.
   const file=path.join(b.profile,'page.html');writeFileSync(file,html);
   for(let attempt=0;attempt<2;attempt++){
    try{
     await b.call('Page.navigate',{url:'file://'+file+'?'+(n+attempt)});
     await new Promise(r=>setTimeout(r,80));
     const {data}=await b.call('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:820,height:300,scale:1}});
     writeFileSync(path.join(dir,'png',svg+'.png'),Buffer.from(data,'base64'));n++;break;
    }catch(e){try{await b.reset();}catch{}}
   }
  }
 }finally{b.close();}
 return n;
}
