// The real demo page places with Z3: the service worker makes it cross-origin isolated from the first visit (one
// reload), the engine worker loads Z3 at start-up, and both a default placement ("draw a lake") and a relation
// ("draw a boat in the lake") report provider=z3. A page kept from isolating (its one-time reload already used)
// falls back to the internal search and says why in the trace. Requests are typed into the chat input on the Drawing
// tab. The Z3 files come from the library checkout next to this repository (a local mirror of the library site,
// intercepted at the browser's network layer), so the test needs no network; without Chromium or that checkout it
// is skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openBrowserReaderRoute} from '../scripts/lib/browser-reader-route.mjs';
import {Z3_BASE} from '../src/dialog/placement-search-provider.mjs';
import {z3Version} from '../src/vendor/sopworld/smt-z3.mjs';

const chrome=process.env.CHROME??'/usr/bin/chromium';
const mirror=fileURLToPath(new URL(`../../soplang-words-lib/docs/vendor/z3-solver-${z3Version}/`,import.meta.url));
const has=path=>access(path).then(()=>true,()=>false);
const skip=!await has(chrome)?'Chromium unavailable':!await has(mirror+'z3-built.wasm.gz')?'Z3 mirror unavailable (needs ../soplang-words-lib)':false;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const TYPES={'.js':'text/javascript','.mjs':'text/javascript','.gz':'application/octet-stream'};
const GUARD='psys2.reloadedForIsolation';

test('every Drawing placement in the demo page is solved by Z3 when isolated, by the disclosed internal search otherwise',{skip,timeout:300000},async()=>{
 // The first page keeps its one-time isolation reload used, so it stays not isolated.
 const browser=await openBrowserReaderRoute({chrome,timeoutMs:120000,initScripts:[`try{sessionStorage.setItem('${GUARD}','1')}catch{}`]}),fetched={};
 try{
  browser.on(async m=>{
   if(m.method!=='Fetch.requestPaused')return;
   const {requestId,request}=m.params,name=request.url.slice(Z3_BASE.length).split('?')[0];
   fetched[name]=(fetched[name]??0)+1;
   try{
    const body=await readFile(mirror+name);
    await browser.call('Fetch.fulfillRequest',{requestId,responseCode:200,body:body.toString('base64'),responseHeaders:[
     {name:'Content-Type',value:TYPES[name.slice(name.lastIndexOf('.'))]??'application/octet-stream'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Cache-Control',value:'max-age=600'}]},m.sessionId);
   }catch{await browser.call('Fetch.failRequest',{requestId,errorReason:'FileNotFound'},m.sessionId).catch(()=>{});}
  });
  await browser.call('Fetch.enable',{patterns:[{urlPattern:Z3_BASE+'*'}]});
  const workers=()=>Promise.all(browser.targets().filter(t=>t.type==='worker').map(t=>browser.evaluateIn(t.sessionId,'self.crossOriginIsolated')));
  const status=()=>browser.evaluate(`window.psys2.engineClient.call('placementSearchStatus')`);
  const turn=async text=>{
   const last=await browser.evaluate('Math.max(0,...window.psys2.worldActivity.list().map(a=>a.id??0))');
   await browser.evaluate(`(()=>{const t=document.querySelector('textarea.p2-text');t.focus();t.value='';})()`);
   await browser.input('insertText',{text});
   await browser.input('dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
   await browser.input('dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await delay(150);
   for(let i=0;i<1200&&await browser.evaluate('window.psys2.busy');i++)await delay(50);
   return browser.evaluate(`(()=>{const events=window.psys2.worldActivity.list().filter(a=>(a.id??0)>${last}&&a.operation==='std.placement');
    const ms=[...document.querySelectorAll('.p2-msg')],m=ms[ms.length-1],t=[...m.querySelectorAll('button.p2-linkbtn')].find(x=>x.textContent==='Trace');
    if(t&&t.getAttribute('aria-expanded')!=='true')t.click();
    const sec=[...m.querySelectorAll('.p2-trace-sec')].find(s=>s.querySelector('h4')?.textContent==='Placement search');
    return {solved:events.filter(a=>a.phase==='end'&&/^(Compiled|Solved)/.test(a.label)&&a.status==='compiled').at(-1)??null,start:events.filter(a=>a.phase==='start').at(-1)??null,
     effect:events.find(a=>a.label==='Observe placement effect')??null,trace:sec?.textContent??''};})()`);
  };
  const scene=async()=>{
   await browser.evaluate(`window.psys2.showTab('draw')`);await delay(500);
   const lake=await turn('draw a lake');
   assert.ok(lake.solved,JSON.stringify(lake));
   const boat=await turn('draw a boat in the lake');
   assert.ok(boat.solved&&boat.effect,JSON.stringify(boat));
   assert.equal(boat.effect.status,'verified');
   const water=boat.start.participants.find(p=>p.entity!==boat.effect.bounds.entity),b=boat.effect.bounds;
   assert.ok(b.min_x>=water.min_x&&b.max_x<=water.max_x&&b.min_y>=water.min_y&&b.max_y<=water.max_y,JSON.stringify({water,b}));
   return {lake,boat};
  };

  // Not isolated: the internal search places both, and the trace says why Z3 did not.
  assert.equal(await browser.evaluate('crossOriginIsolated'),false);
  const plain=await scene();
  assert.equal(plain.lake.solved.provider,'internal');
  assert.equal(plain.boat.solved.provider,'internal');
  assert.match(plain.boat.trace,/internal search \(std\.problem\).*not cross-origin isolated/);
  assert.deepEqual(fetched,{});

  // A first visit in a new tab session: the page reloads itself once and is isolated, page and worker; Z3 loads at start-up.
  await browser.removeInitScripts();
  await browser.evaluate(`sessionStorage.removeItem('${GUARD}')`);
  await browser.reload();
  assert.equal(await browser.evaluate('crossOriginIsolated'),true);
  assert.deepEqual([...new Set(await workers())],[true]);
  let s;for(let i=0;i<300;i++){s=await status();if(['ready','unavailable'].includes(s.state))break;await delay(100);}
  assert.equal(s.state,'ready',JSON.stringify(s));
  assert.equal(s.warmedBy,'startup');
  const isolated=await scene();
  assert.equal(isolated.lake.solved.provider,'z3');
  assert.equal(isolated.boat.solved.provider,'z3');
  assert.match(isolated.boat.trace,/Z3 \(std\.problem\).*ready, loaded in \d+ ms \(started by the start-up\)/);
  // Each Z3 file was fetched once (the module, the loader and the WebAssembly).
  assert.deepEqual(fetched,{'z3-api.mjs':1,'z3-built.js':1,'z3-built.wasm.gz':1});
  assert.deepEqual(browser.logs.console.filter(x=>x.type==='exception'),[]);
 }finally{await browser.close();}
});
