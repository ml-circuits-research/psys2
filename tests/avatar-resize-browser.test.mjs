// Real avatar UI and native tools; Chromium transport only comes from the shared probe.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {access,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openBrowserReaderRoute} from '../scripts/lib/browser-reader-route.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),chrome=process.env.CHROME??'/usr/bin/chromium';
let available=true;try{await access(chrome);}catch{available=false;}
const page=`<!doctype html><meta charset="utf-8"><style>body{margin:0}#avatar{width:1100px;height:700px}</style><div id="avatar"></div><script type="module">
import {createAvatar} from '/docs/webchat/ui/avatar.mjs';
import {createAvatarHost,initialAvatarState,avatarResizeScope} from '/worlds/ui.avatar/declared-host.mjs';
import {DEFAULT_FACE} from '/worlds/ui.avatar/default-face.mjs';
import {toNativeAvatarState} from '/worlds/ui.avatar/canonical-state.mjs';
import {describeNativeControl} from '/src/dialog/native-control-intent.mjs';
import {readNativeIntent} from '/src/dialog/native-intent-reader.mjs';
const state=initialAvatarState(),native=createAvatarHost({state,data:DEFAULT_FACE,instanceId:'avatar-browser'}),calls=[];let ui;
const host={persistent:false,motionSeed:1,asset:p=>p.startsWith('lib/')?'/src/'+p.slice(4):'/'+p,knowledgeUrl:()=>location.origin+'/unavailable-catalog',
 tool:async(operation,args)=>{const declaration=native.bindings().find(op=>op.id===operation),intent=describeNativeControl({operation:declaration,args,before:native.observe()}),decoded=readNativeIntent(intent.wires,{operation:declaration});const receipt=native.invoke({invocation:crypto.randomUUID(),expectedVersion:native.observe().version,operation:decoded.operation,args:decoded.args});calls.push({intent,receipt});ui.update(toNativeAvatarState(state));return {ok:receipt.status==='changed'||receipt.status==='unchanged',message:receipt.status,receipt};}};
ui=createAvatar(document.getElementById('avatar'),host,{editor:true});ui.update(toNativeAvatarState(state));ui.setVisible(true);
window.avatarTest={ui,get state(){return toNativeAvatarState(state);},carrier:state,native,calls,target:()=>native.capabilities().slots.filter(slot=>native.observe().objects.some(o=>o.id===slot.id)).sort((a,b)=>avatarResizeScope(DEFAULT_FACE,a.id).length-avatarResizeScope(DEFAULT_FACE,b.id).length)[0]?.id};
// The shared browser transport waits on this readiness interface, without starting an app/model.
window.psys2={engineClient:{info:{fixture:'actual-avatar-ui'},ready:async()=>{while(!document.querySelector('.p2-avatar-layer [data-avatar-slot]'))await new Promise(resolve=>setTimeout(resolve,10));}}};
</script>`;

test('avatar selection bounds and drag resize operate through exact native SOP for parts and the whole avatar',{skip:available?false:'Chromium unavailable',timeout:60000},async()=>{
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(pathname==='/'){res.setHeader('content-type','text/html');res.end(page);return;}
   if(pathname.startsWith('/unavailable-catalog')){res.statusCode=404;res.end();return;}
   const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep))throw Error('outside test root');
   res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.json')?'application/json':'text/plain');res.end(await readFile(file));
  }catch{res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 const settle=`await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));`;
 try{
  browser=await openBrowserReaderRoute({url:`http://127.0.0.1:${server.address().port}/`,workspace:path.dirname(root),chrome,timeoutMs:10000});
  await browser.viewport(1280,800);
  const selected=await browser.evaluate(`(async()=>{const t=avatarTest,select=document.querySelector('select[aria-label="Selection"]');select.value=t.target();select.dispatchEvent(new Event('change'));${settle}const sentinel=document.createElement('div');sentinel.id='attached-object-code';document.querySelector('.p2-avatar-inspector').append(sentinel);return {id:t.state.selectedSlot,handles:document.querySelectorAll('[data-resize-handle]').length,outline:document.querySelector('[data-selected-object-id]')?.getAttribute('data-selected-object-id'),text:document.querySelector('.p2-avatar-object-identity').textContent,code:document.querySelector('.p2-avatar-inspector').dataset.selectedNativeIds,labelFields:[...document.querySelectorAll('label')].filter(l=>/^Label\\b/.test(l.textContent)).length};})()`);
  assert.ok(selected.id);assert.equal(selected.handles,4);assert.equal(selected.outline,selected.id);assert.equal(selected.text,'Object ID: '+selected.id);assert.deepEqual(JSON.parse(selected.code),[selected.id]);assert.equal(selected.labelFields,0);
  const exact=await browser.evaluate(`(async()=>{const input=document.querySelector('input[aria-label="Selection scale"]');input.value='1.1234567890123';input.dispatchEvent(new Event('change'));${settle}const t=avatarTest;return {scale:t.state.face.adj[t.state.selectedSlot].s,wire:t.calls.at(-1).intent.wires,attached:!!document.getElementById('attached-object-code')};})()`);
  assert.equal(exact.scale,1.1234567890123);assert.match(exact.wire,/avatar\.part\.resize .*scale=1\.1234567890123$/);assert.equal(exact.attached,true);
  const start=await browser.evaluate(`(()=>{const handle=document.querySelector('[data-resize-handle="se"]'),outline=document.querySelector('[data-selected-object-id]'),h=handle.getBoundingClientRect(),b=outline.getBoundingClientRect();return {x:h.x+h.width/2,y:h.y+h.height/2,cx:b.x+b.width/2,cy:b.y+b.height/2,scale:avatarTest.state.face.adj[avatarTest.state.selectedSlot].s};})()`);
  await browser.input('dispatchMouseEvent',{type:'mouseMoved',x:start.x,y:start.y});
  await browser.input('dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:start.x,y:start.y});
  const end={x:start.cx+(start.x-start.cx)*1.08,y:start.cy+(start.y-start.cy)*1.08};
  await browser.input('dispatchMouseEvent',{type:'mouseMoved',buttons:1,...end});
  await browser.input('dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...end});
  const dragged=await browser.evaluate(`(async()=>{${settle}const t=avatarTest;return {id:t.state.selectedSlot,scale:t.state.face.adj[${JSON.stringify(selected.id)}].s,wire:t.calls.findLast(call=>call.intent.expected.operation==='avatar.part.resize').intent.wires,handles:document.querySelectorAll('[data-resize-handle]').length};})()`);
  assert.equal(dragged.id,selected.id);assert.ok(dragged.scale>start.scale&&dragged.scale<=1.5);assert.match(dragged.wire,/avatar\.part\.resize/);assert.equal(dragged.handles,4);
  const whole=await browser.evaluate(`(async()=>{const select=document.querySelector('select[aria-label="Selection"]');select.value='face';select.dispatchEvent(new Event('change'));${settle}const input=document.querySelector('input[aria-label="Selection scale"]');input.value='0.8123456789';input.dispatchEvent(new Event('change'));${settle}return {selected:avatarTest.state.selectedSlot,scale:avatarTest.state.face.adj.face.s,wire:avatarTest.calls.at(-1).intent.wires,transform:document.querySelector('.p2-avatar-layer:last-child [data-avatar-face]')?.getAttribute('transform'),handles:document.querySelectorAll('[data-resize-handle]').length,code:document.querySelector('.p2-avatar-inspector').dataset.selectedNativeIds};})()`);
  assert.equal(whole.selected,'face');assert.equal(whole.scale,.8123456789);assert.match(whole.wire,/avatar\.face\.resize id="face" scale=0\.8123456789$/);assert.match(whole.transform,/scale\(0\.8123456789\)/);assert.equal(whole.handles,4);assert.deepEqual(JSON.parse(whole.code),['face']);
  const wholeHandle=await browser.evaluate(`(()=>{const h=document.querySelector('[data-resize-handle="se"]').getBoundingClientRect(),b=document.querySelector('[data-selected-object-id]').getBoundingClientRect();return {x:h.x+h.width/2,y:h.y+h.height/2,cx:b.x+b.width/2,cy:b.y+b.height/2};})()`);
  const inward={x:wholeHandle.cx+(wholeHandle.x-wholeHandle.cx)*.9,y:wholeHandle.cy+(wholeHandle.y-wholeHandle.cy)*.9};
  await browser.input('dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:wholeHandle.x,y:wholeHandle.y});
  await browser.input('dispatchMouseEvent',{type:'mouseMoved',buttons:1,...inward});
  await browser.input('dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...inward});
  const shrunk=await browser.evaluate(`(async()=>{${settle}return {id:avatarTest.state.selectedSlot,scale:avatarTest.state.face.adj.face.s,operation:avatarTest.calls.at(-1).intent.expected.operation};})()`);
  assert.equal(shrunk.id,'face');assert.ok(shrunk.scale<whole.scale&&shrunk.scale>=.6);assert.equal(shrunk.operation,'avatar.face.resize');
  const identities=await browser.evaluate(`(async()=>{const before=JSON.stringify(avatarTest.state.face);document.querySelector('[aria-label="Identify avatar object IDs"]').click();${settle}const temporary=[...document.querySelectorAll('.p2-avatar-selection [data-object-id]')].map(n=>n.textContent),temporaryState={...avatarTest.state.idDisplay},temporaryWire=avatarTest.calls.at(-1).intent.wires;const checkbox=document.querySelector('[aria-label="Always show avatar object IDs"]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change'));${settle}return {temporary,temporaryState,temporaryWire,always:document.querySelector('[aria-label="Always show avatar object IDs"]').checked,native:avatarTest.state.idDisplay,wire:avatarTest.calls.at(-1).intent.wires,faceUnchanged:before===JSON.stringify(avatarTest.state.face),grip:!!document.querySelector('.p2-inspector-grip'),code:!!document.getElementById('attached-object-code')};})()`);
  assert.ok(identities.temporary.includes(selected.id));assert.equal(identities.temporaryState.mode,'temporary');assert.ok(Number.isSafeInteger(identities.temporaryState.expiresAt));assert.equal(identities.temporaryWire,'@show avatar.ids.show mode="temporary" duration=4000');assert.equal(identities.always,true);assert.deepEqual(identities.native,{mode:'always'});assert.equal(identities.wire,'@show avatar.ids.show mode="always" duration=4000');assert.equal(identities.faceUnchanged,true);assert.equal(identities.grip,true);assert.equal(identities.code,true);
  const command=await browser.evaluate(`(async()=>{await avatarTest.native.invoke({invocation:crypto.randomUUID(),expectedVersion:avatarTest.native.observe().version,operation:'avatar.ids.show',args:{mode:'temporary',duration:10}});avatarTest.ui.update(avatarTest.state);${settle}await new Promise(resolve=>setTimeout(resolve,25));const expired=document.querySelectorAll('.p2-avatar-selection [data-object-id]').length;return {expired,checkbox:document.querySelector('[aria-label="Always show avatar object IDs"]').checked,native:avatarTest.state.idDisplay};})()`);
  assert.equal(command.expired,0,'expiry is rendered from native expiresAt rather than button-local flags');assert.equal(command.checkbox,false);assert.equal(command.native.mode,'temporary');
  await browser.evaluate('avatarTest.ui.destroy()');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
