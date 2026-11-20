// Phrase log format 4 (spec 06 "Phrase log"): one compact entry per turn — asked, read (the reader's requests and the admitted
// std.request reading as SOP), compiled (the dispatched circuit, or the stage and reason of a refusal), happened (the reply and the
// SOP diff of the instance world), feedback. Diagnostics only on request. The browser part types three turns into the real demo
// page on the Drawing tab and reads the file the "Export JSON" button saves; without Chromium it is skipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {openBrowserReaderRoute} from '../scripts/lib/browser-reader-route.mjs';
import {turnOf,refusalOf,rawReadingSop,toJSON,exportRecords} from '../docs/webchat/ui/phrase-log.mjs';
import {sopChanges} from '../docs/webchat/ui/state-diff.mjs';
import {readBatch} from '../scripts/ingest-failures.mjs';

const chrome=process.env.CHROME??'/usr/bin/chromium';
const skip=await access(chrome).then(()=>false,()=>'Chromium unavailable');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const world=sop=>JSON.stringify({sop,runtime:{}});

test('the turn record: reader requests and reading as SOP, the dispatched circuit, the SOP diff; refusals name their stage',()=>{
 const raw=[{span:'make the boat red',target:{determiner:'definite',kind:'boat',mode:'existing'},constraints:[{key:'drawn.colour',value:'red',value_span:'red',operator:'eq'}],act:'change'}];
 assert.equal(rawReadingSop(raw),'@r0 std.request span="make the boat red" act=change\n@r0.target std.request.target request=$r0 determiner=definite kind=boat mode=existing\n@r0.constraint0 std.request.constraint request=$r0 key=drawn.colour value=red value_span=red operator=eq');
 const before={'art.draw':world('@o1 w.drawing.object kind=w.drawing.object world=w.drawing code=o1 drawing=boat x=1\n@o2 w.drawing.object code=o2 drawing=lake\n')};
 const after={'art.draw':world('@o1 w.drawing.object kind=w.drawing.object world=w.drawing code=o1 drawing=boat x=1 colour="#ff0000"\n@o3 w.drawing.object code=o3 drawing=sun\n')};
 assert.deepEqual(sopChanges(before,after),['~ w.drawing.object code=o1 drawing=boat x=1 colour="#ff0000" (was colour=∅)','+ w.drawing.object code=o3 drawing=sun','- w.drawing.object code=o2 drawing=lake']);
 const sop='@capability.result std.capability.result status=compiled call=$c\n@c std.capability.call operation="drawing.object.change"';
 const ok=turnOf({text:'Updated the boat.',statuses:['supported'],trace:{reading:{wires:'@r0 std.request act=change'},compiledSop:sop,readerRouting:{selected:'sop-bert',reason:'best-effort-model-proposal',rawReading:raw,admission:{mode:'uncalibrated-best-effort',uncertain:true,alternatives:[{wires:'@r0 std.request act=change'},{wires:'@r0 std.request act=make\n@t0 std.request.target kind=k.objects.boat request=$r0'}]}}}},{changes:['+ x']});
 assert.equal(ok.read.sop,'@r0 std.request act=change');
 assert.match(ok.read.cut,/^@r0 std\.request /);
 assert.deepEqual(ok.read.via,['admission: admitted (uncalibrated-best-effort, uncertain) — best-effort-model-proposal','alternative not used: std.request act=make; std.request.target kind=k.objects.boat']);
 assert.deepEqual(ok.compiled,{kind:'capability',sop});
 assert.deepEqual(ok.happened,{reply:'Updated the boat.',changes:['+ x']});
 const reader={text:'I could not identify an action to apply. Nothing changed.',statuses:['unsupported'],trace:{reason:'reading',readerRouting:{selected:null,reason:'incomplete-model-coverage',rawReading:raw,unresolved:[{reason:'provider-unresolved',detail:{reason:'presence-class-inconsistent',key:'request.target.fill'}}]}}};
 assert.deepEqual(turnOf(reader).compiled,{refused:{stage:'reader',reason:'incomplete-model-coverage',detail:'provider-unresolved:presence-class-inconsistent:request.target.fill'}});
 const admitted={selected:'sop-bert'};
 assert.equal(refusalOf({statuses:['unsupported'],trace:{readerRouting:admitted,reason:'target',compiledSop:'@capability.result std.capability.result status=refused',reading:{}}}).stage,'grounding');
 assert.equal(refusalOf({statuses:['unsupported'],trace:{readerRouting:admitted,reason:'native-binding-gap',compiledSop:'@capability.result std.capability.result status=refused'}}).stage,'binding');
 assert.equal(refusalOf({statuses:['unsupported'],trace:{readerRouting:admitted,reason:'no-declared-action'}}).stage,'routing');
 assert.equal(refusalOf({statuses:['unsupported'],trace:{readerRouting:admitted,reason:'unverified-selector-effect',compiledSop:sop,receipt:{status:'changed'},effectVerification:{status:'mismatch',reason:'x'}}}).stage,'execution');
 // the learning scripts read format 4 back as records
 const doc=JSON.parse(toJSON([{id:'a',text:'make the boat red',tab:'draw',time:'t',mode:'typed',source:'human',segments:[],feedback:{vote:'down',reasons:['wrong-value'],wanted:'a red boat'},failure:{reasons:['disliked']},turn:{read:ok.read,compiled:ok.compiled,happened:ok.happened}}],{includeDiagnostics:true}));
 assert.deepEqual(doc.entries[0].feedback,{vote:'down',reasons:['wrong-value'],wanted:'a red boat'});
 const [r]=exportRecords(doc);
 assert.deepEqual([r.text,r.tab,r.status,r.detail.answer,r.feedback.wanted],['make the boat red','draw','supported','Updated the boat.','a red boat']);
 assert.deepEqual(readBatch(JSON.stringify(doc)).map(e=>[e.text,e.expected]),[['make the boat red','a red boat']]);
});

test('three turns in the demo page export asked, read, compiled and happened per turn with SOP',{skip,timeout:600000},async()=>{
 const b=await openBrowserReaderRoute({chrome,timeoutMs:180000});
 try{
  await b.evaluate(`(()=>{window.__blobs=[];const o=URL.createObjectURL.bind(URL);URL.createObjectURL=x=>{window.__blobs.push(x);return o(x);};})()`);
  await b.evaluate(`window.psys2.showTab('draw')`);await delay(500);
  const texts=['draw a lake','draw a boat in the lake','make the boat red'];
  for(const text of texts){
   await b.evaluate(`(()=>{const t=document.querySelector('textarea.p2-text');t.focus();t.value='';})()`);
   await b.input('insertText',{text});
   await b.input('dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
   await b.input('dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await delay(200);
   for(let i=0;i<2400&&await b.evaluate('window.psys2.busy');i++)await delay(50);
   await delay(300);
  }
  await b.evaluate(`document.querySelector('button[aria-label="Settings"]').click()`);await delay(300);
  await b.evaluate(`document.querySelector('#p2-st-privacy')?.click()`);
  for(let i=0;i<100&&!await b.evaluate(`!!document.querySelector('.p2-plog-item')`);i++)await delay(100);
  const view=await b.evaluate(`(()=>{const d=document.querySelector('.p2-plog-item .p2-plog-turn');d.open=true;d.dispatchEvent(new Event('toggle'));return [...d.querySelectorAll('.p2-plog-part > b')].map(x=>x.textContent);})()`);
  assert.deepEqual(view.slice(0,4),['asked','read','compiled','happened'],'the log view shows the same four parts');
  await b.evaluate(`[...document.querySelectorAll('.p2-plog-actions button')].find(x=>x.textContent==='Export JSON').click()`);
  for(let i=0;i<50&&!await b.evaluate('window.__blobs.length');i++)await delay(100);
  const doc=JSON.parse(await b.evaluate('window.__blobs.at(-1).text()'));
  assert.equal(doc.format,'psys2-phrase-log/4');
  assert.equal(doc.diagnostics,undefined,'diagnostics are off by default');
  assert.deepEqual(doc.entries.map(e=>e.asked.text),texts);
  for(const e of doc.entries){
   const why=JSON.stringify(e).slice(0,2000);
   assert.equal(e.asked.tab,'draw',why);
   assert.match(e.read.cut??'',/@r0 std\.request /,why);
   assert.match(e.read.sop??'',/std\.request act=/,why);
   assert.equal(e.compiled.refused,undefined,why);
   assert.match(e.compiled.sop??'',/drawing\.object\.(make|change)/,why);
   assert.ok(e.happened.reply.length>0,why);
   assert.ok(e.happened.changes?.length>0,why);
  }
  const [lake,boat,red]=doc.entries;
  assert.match(lake.happened.changes.join('\n'),/^\+ w\.drawing\.object .*drawing=lake/m);
  assert.equal(boat.compiled.kind,'placement');
  assert.match(boat.read.cut,/key=drawn\.relation/);
  assert.match(boat.happened.solver,/^(z3|internal)$/);
  assert.match(boat.happened.changes.join('\n'),/^\+ w\.drawing\.object .*drawing=boat/m);
  assert.match(red.compiled.sop,/std\.capability\.call operation="drawing\.object\.change"/);
  assert.match(red.happened.changes.join('\n'),/^~ w\.drawing\.object .*drawing=boat.*\(was colou?r=∅\)/m);
  for(const k of ['budget','perf','events','segments','detail','longtasks'])assert.ok(!JSON.stringify(doc.entries).includes(`"${k}"`),`no ${k} in the entries`);
 }finally{await b.close();}
});
