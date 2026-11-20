// Direct manipulation in the real demo page (the built docs/webchat, served with a per-request delay like a hosted
// catalog): on Drawing, Add from the chooser, Add from knowledge, double-click Add, dragging one object, dragging a
// multiple selection, a resize handle, an inspector colour and a part drag; on Diagram, Add node, dragging a node, its
// resize handle and an inspector colour. Every gesture must run as its declared native command (host.tool -> worker
// -> the area's rules), change the instance world as dropped, write its sentence into the chat log, never be refused
// as busy, and finish within GESTURE_MS (default 2500 ms; about 0.1-0.8 s measured on an idle machine). The limit applies to the page's own time in
// its native commands (performance.now around session.tool), not to the harness's simulated mouse moves and polling, and is scaled by the CPU load
// factor (tests/fixtures/load-aware.mjs) because the full gate runs every test file at once; the wall time of a gesture may be at most twice that.
// Regression for the 2026-11-20 report: a drag showed the busy veil and the object jumped back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {openBrowserReaderRoute} from '../scripts/lib/browser-reader-route.mjs';
import {emptyDrawingState,projectDrawingArea} from '../worlds/art.draw/sop-drawing.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {loadAwareLimit} from './fixtures/load-aware.mjs';

const chrome=process.env.CHROME??'/usr/bin/chromium';
const skip=await access(chrome).then(()=>false,()=>'Chromium unavailable');
const LIMIT=Number(process.env.GESTURE_MS??2500);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const centre=b=>[(b.x0+b.x1)/2,(b.y0+b.y1)/2];
const near=(a,b,tolerance=15)=>Math.hypot(a[0]-b[0],a[1]-b[1])<tolerance;

// Records every native command the page sends (its SOP, result, sentence and time) and the area states it returns.
const RECORD=`(()=>{window.__calls=[];const c=window.psys2.engineClient,call=c.call.bind(c);
 c.call=async(k,a,...r)=>{const rec={k,open:true};window.__calls.push(rec);try{return await call(k,a,...r);}finally{rec.open=false;}};
 const s=window.psys2.session,tool=s.tool.bind(s);
 s.tool=async(sop,o)=>{const t0=performance.now(),rec={k:'tool',sop,open:true};window.__calls.push(rec);
  try{const r=await tool(sop,o);Object.assign(rec,{ok:r.ok,status:r.receipt?.status,message:r.message,text:r.intentRecord?.text,states:Object.fromEntries(Object.entries(r.state??{}).map(([k,v])=>[k,v?.sop]))});return r;}
  catch(e){rec.error=String(e?.message??e);throw e;}finally{rec.open=false;rec.ms=performance.now()-t0;}};})()`;

async function openPage(){
 const b=await openBrowserReaderRoute({chrome,timeoutMs:180000,latencyMs:20});
 await b.viewport(1400,900);await b.evaluate(RECORD);
 const ev=e=>b.evaluate(e);
 const idle=async()=>{await wait(80);for(const end=Date.now()+30000;Date.now()<end;){if(!await ev('window.psys2.isBusy()||window.__calls.some(c=>c.k==="tool"&&c.open)'))return;await wait(30);}};
 const settle=async()=>{for(let quiet=0,end=Date.now()+150000;quiet<4&&Date.now()<end;){await wait(400);quiet=await ev('window.__calls.some(c=>c.open)||window.psys2.isBusy()')?0:quiet+1;}};
 const mouse=(type,p,extra={})=>b.input('dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',...extra});
 const drag=async(a,z,modifiers=0)=>{await mouse('mouseMoved',a,{button:'none'});await mouse('mousePressed',a,{clickCount:1,buttons:1,modifiers});for(let i=1;i<=6;i++){await mouse('mouseMoved',{x:a.x+(z.x-a.x)*i/6,y:a.y+(z.y-a.y)*i/6},{buttons:1,modifiers});await wait(16);}await mouse('mouseReleased',z,{clickCount:1,modifiers});};
 const click=async(p,modifiers=0)=>{await mouse('mousePressed',p,{clickCount:1,buttons:1,modifiers});await mouse('mouseReleased',p,{clickCount:1,modifiers});};
 const button=(scope,text)=>ev(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope+' button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.offsetParent);if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click();})()`);
 const choose=(selector,value)=>ev(`(()=>{const s=document.querySelector(${JSON.stringify(selector)});if(!s)throw Error('Missing control '+${JSON.stringify(selector)});s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 // One gesture: the native commands it sent, each applied, with its sentence in the chat, within the limit.
 const gestures=[];
 const gesture=async(name,act,expect)=>{
  const n=await ev('window.__calls.length'),t=Date.now();await act();await idle();const ms=Date.now()-t;
  const calls=await ev(`window.__calls.slice(${n}).filter(c=>c.k==='tool').map(({states,...c})=>c)`);
  const chat=await ev(`[...document.querySelectorAll('.p2-msg')].map(m=>m.textContent)`);
  gestures.push({name,ms,own:Math.round(calls.reduce((sum,c)=>sum+(c.ms??0),0)),calls});
  assert.ok(calls.length,name+': no native command was sent');
  for(const c of calls){
   assert.equal(c.error,undefined,name+': '+c.sop+' failed: '+c.error);
   assert.equal(c.ok,true,name+': '+c.sop+' refused: '+c.message);
   assert.ok(c.text&&chat.some(line=>line.includes(c.text)),name+': no chat line for '+c.sop);
  }
  const own=Math.round(calls.reduce((sum,c)=>sum+(c.ms??0),0)),limit=loadAwareLimit(LIMIT),timing=`${JSON.stringify(calls.map(c=>[c.sop,Math.round(c.ms)]))}`;
  assert.ok(own<limit,`${name}: native commands took ${own} ms (limit ${limit} ms) ${timing}`);
  assert.ok(ms<2*limit,`${name}: gesture took ${ms} ms wall time (limit ${2*limit} ms) ${timing}`);
  try{await expect();}catch(error){error.message=name+': '+error.message+' '+JSON.stringify(calls.map(c=>c.sop));throw error;}
 };
 return {b,ev,idle,settle,drag,click,button,choose,gesture,gestures};
}

test('Drawing: add, drag, multi-drag, resize, colour and part drag apply as dropped, each as a native command with its sentence',{skip,timeout:600000},async()=>{
 // The projection of the returned state, computed here with the same area module the page runs.
 await performGesture({isession:{state:{'art.draw':emptyDrawingState()}},engine:{}},{view:'draw',operation:'drawing.object.make',args:{kind:'house'}});
 const page=await openPage(),{b,ev,idle,drag,click,button,choose,gesture}=page;
 try{
  await ev(`window.psys2.showTab('draw')`);
  await ev(`new Promise(r=>{const t=setInterval(()=>{const b=document.querySelector('.dr-toolbar button');if(b&&!b.disabled){clearInterval(t);r();}},100);})`);
  await page.settle();
  const sop=()=>ev(`window.__calls.filter(c=>c.states?.['art.draw']!==undefined).at(-1)?.states['art.draw']??''`);
  const boxes=async()=>projectDrawingArea({sop:await sop(),runtime:{}}).boxes??{};
  const pt=async([x,y])=>ev(`(()=>{const c=document.querySelector('.dr-canvas').getBoundingClientRect(),s=Math.min(c.width/1000,c.height/700);return {x:c.x+(c.width-1000*s)/2+${x}*s,y:c.y+(c.height-700*s)/2+${y}*s};})()`);
  const part=()=>ev(`['Part X','Part Y'].map(l=>Number(document.querySelector('.dr-root [aria-label="'+l+'"]').value))`);
  let bx;
  await gesture('Add chooser shape',async()=>{await button('.dr-root','Add');await button('.dr-root','house');},async()=>assert.equal(Object.keys(bx=await boxes()).length,1));
  await gesture('Add from knowledge',async()=>{await button('.dr-root','Add');await ev(`(()=>{const i=document.querySelector('.dr-root [aria-label="Find a word in knowledge"]');i.value='bicycle';})()`);await button('.dr-root','Add from knowledge');},
   async()=>assert.equal(Object.keys(bx=await boxes()).length,2));
  await gesture('Double-click add',async()=>{const p=await pt([850,150]);await ev(`document.querySelector('.dr-canvas').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:${p.x},clientY:${p.y}}))`);await wait(50);await button('.dr-root','sun');},
   async()=>{bx=await boxes();const ids=Object.keys(bx);assert.equal(ids.length,3);assert.ok(near(centre(bx[ids[2]]),[850,150],120),JSON.stringify(bx[ids[2]]));});
  const [house,bicycle]=Object.keys(bx);
  const from=centre(bx[house]),to=[from[0]-200,from[1]-120];
  await gesture('Drag one object',async()=>{await drag(await pt(from),await pt(to));},async()=>{const c=centre((await boxes())[house]);assert.ok(near(c,to),`dropped at ${to}, now ${c}`);});
  const a=centre((await boxes())[house]),c2=centre((await boxes())[bicycle]);
  await gesture('Select two objects',async()=>{await click(await pt(a));await idle();await click(await pt(c2),2);},async()=>{});
  await gesture('Drag a multiple selection',async()=>{await drag(await pt(a),await pt([a[0]+60,a[1]+40]));},async()=>{
   const nb=await boxes();assert.ok(near(centre(nb[house]),[a[0]+60,a[1]+40]),JSON.stringify(nb[house]));assert.ok(near(centre(nb[bicycle]),[c2[0]+60,c2[1]+40]),JSON.stringify(nb[bicycle]));});
  await gesture('Select one object',async()=>{await click(await pt([980,680]));await idle();await click(await pt(centre((await boxes())[house])));},async()=>{});
  const hb=(await boxes())[house];
  await gesture('Resize handle',async()=>{await drag(await pt([hb.x1,hb.y1]),await pt([hb.x1+60,hb.y1+60]));},async()=>{const nb=(await boxes())[house];assert.ok(Math.abs((nb.x1-nb.x0)-(hb.x1-hb.x0+60))<15,JSON.stringify({nb,hb}));});
  await gesture('Inspector colour',async()=>{await choose('.dr-root [aria-label="Named colour"]','red');},async()=>assert.match((await sop()).split('\n').find(l=>l.includes(`code=${house} `))??'',/colou?r="?(red|#ff0000)/i));
  await gesture('Select a part',async()=>{await ev(`(()=>{const s=document.querySelector('.dr-root [aria-label="Object part"]');s.value=[...s.options].find(o=>o.value!=='').value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);},async()=>{});
  const p0=await part();
  await gesture('Drag a part',async()=>{await drag(await pt(p0),await pt([p0[0]+30,p0[1]+20]));},async()=>{const p1=await part();assert.ok(near(p1,[p0[0]+30,p0[1]+20],3),`part ${p0} -> ${p1}`);});
  const errors=(b.logs.console??[]).filter(l=>l.type==='error'||l.level==='error');
  assert.deepEqual(errors,[],'no console errors');
 }finally{console.log(JSON.stringify(page.gestures.map(g=>[g.name,g.ms,g.own]))); await b.close();}
});

test('Diagram: add node, drag a node, its resize handle and a colour apply as dropped, each as a native command with its sentence',{skip,timeout:600000},async()=>{
 const page=await openPage(),{b,ev,drag,click,button,choose,gesture}=page;
 try{
  await ev(`window.psys2.showTab('diagram')`);
  await ev(`new Promise(r=>{const t=setInterval(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Add node'&&e.offsetParent);if(b&&!b.disabled&&document.querySelector('.dg-node-chooser button')){clearInterval(t);r();}},100);})`);
  await page.settle();
  const svgRect=()=>ev(`(()=>{const r=document.querySelector('.dg-svg').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
  // the ids the diagram draws (a node's shape and label carry its id); no connection is made here
  const nodes=()=>ev(`[...new Set([...document.querySelectorAll('.dg-svg [data-select]')].map(e=>e.getAttribute('data-select')))]`);
  const rectOf=id=>ev(`[...document.querySelectorAll('.dg-svg [data-select="${id}"]')].map(e=>e.getBoundingClientRect()).reduce((a,r)=>({x0:Math.min(a.x0,r.left),y0:Math.min(a.y0,r.top),x1:Math.max(a.x1,r.right),y1:Math.max(a.y1,r.bottom)}),{x0:1e9,y0:1e9,x1:-1e9,y1:-1e9})`);
  const s=await svgRect(),place=async(fx,fy)=>{await button('','Add node');const kind=await ev(`new Promise((resolve,reject)=>{const end=Date.now()+30000,t=setInterval(()=>{const e=document.querySelector('.dg-node-chooser .dg-tools button');if(e){clearInterval(t);resolve(e.textContent.trim());}else if(Date.now()>end){clearInterval(t);reject(Error('the node chooser did not open'));}},50);})`);await button('.dg-node-chooser',kind);await click({x:s.x+s.w*fx,y:s.y+s.h*fy});};
  let before=await nodes();
  await gesture('Add node',()=>place(0.3,0.35),async()=>{const now=await nodes();assert.equal(now.length,before.length+1,JSON.stringify(now));before=now;});
  await gesture('Add a second node',()=>place(0.65,0.6),async()=>{const now=await nodes();assert.equal(now.length,before.length+1);before=now;});
  // A node's place is read from the instance world (its x and y), the drop converted to diagram units with the view
  // as it was when the drag began; the view itself stays where it was (the other node does not move on screen) and
  // the dragged node is where it was dropped.
  const id=before[0],other=before[1],c0=centre(await rectOf(id)),o0=centre(await rectOf(other));
  const placeOf=async()=>{const line=(await ev(`window.__calls.filter(c=>c.states?.['diagram.sketch']!==undefined).at(-1).states['diagram.sketch']`)).split('\n').find(l=>l.includes(`code=${id} `))??'';return ['x','y'].map(k=>Number(line.match(new RegExp(' '+k+'=(-?[0-9.]+)'))?.[1]));};
  const units=(p)=>ev(`(()=>{const e=document.querySelector('.dg-svg [data-select="${id}"]').parentNode,q=document.querySelector('.dg-svg').createSVGPoint();q.x=${p.x};q.y=${p.y};const u=q.matrixTransform(e.getScreenCTM().inverse());return [u.x,u.y];})()`);
  const xy0=await placeOf(),grab={x:c0[0],y:c0[1]},drop={x:c0[0]-100,y:c0[1]-60},[g0,d0]=[await units(grab),await units(drop)],want=[xy0[0]+d0[0]-g0[0],xy0[1]+d0[1]-g0[1]];
  await gesture('Drag a node',async()=>{await drag(grab,drop);},async()=>{const xy=await placeOf();assert.ok(near(xy,want,3),`from ${xy0} dropped at ${want}, now ${xy}`);
   const o1=centre(await rectOf(other)),c1=centre(await rectOf(id));assert.ok(near(o1,o0,2),`the view moved: the other node went from ${o0} to ${o1}`);assert.ok(near(c1,[drop.x,drop.y],6),`dropped at ${[drop.x,drop.y]}, shown at ${c1}`);});
  // A size is compared with the other node's, which any zoom scales alike.
  const ratio=async()=>{const [a,o]=[await rectOf(id),await rectOf(other)];return (a.x1-a.x0)/(o.x1-o.x0);};
  await gesture('Select the node',async()=>{const c=centre(await rectOf(id));await click({x:c[0],y:c[1]});},async()=>{});
  const k1=await ratio(),handle=await ev(`(()=>{const r=document.querySelector('[data-resize-node="${id}"]').getBoundingClientRect();return {x:(r.left+r.right)/2,y:(r.top+r.bottom)/2};})()`);
  await gesture('Resize a node',async()=>{await drag(handle,{x:handle.x+50,y:handle.y+30});},async()=>{const k2=await ratio();assert.ok(k2>k1*1.15,JSON.stringify({k1,k2}));});
  await gesture('Node colour',async()=>{const value=await ev(`[...document.querySelector('[aria-label="Node colour"]').options].map(o=>o.value).filter(Boolean)[1]`);await choose('[aria-label="Node colour"]',value);},async()=>{});
  const errors=(b.logs.console??[]).filter(l=>l.type==='error'||l.level==='error');
  assert.deepEqual(errors,[],'no console errors');
 }finally{console.log(JSON.stringify(page.gestures.map(g=>[g.name,g.ms,g.own]))); await b.close();}
});
