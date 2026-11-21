// SPDX-License-Identifier: AGPL-3.0-only
// Real-use measurement in the BROWSER (no runtime changes): the same dataset rows as scripts/real-use/runner.mjs, run in
// the unmodified application page (local docs/webchat or the live GitHub Pages URL) in headless Chromium, the way a user
// works: the row's context is opened as a work file (the page's "Open work" input, i.e. restoreInstances), the row's
// tab is clicked, the text is typed into the chat box and Enter is pressed; the page's own turn (watchdog, engine worker,
// SOP-BERT reader) answers. The context objects are created by the same Node setup as the Node runner
// (scripts/mass-eval/area-setup.mjs), so both runs start from the same area state.
// Conversation context: the Node runner gives the reader only the row's `previous` text. In the page the previous turn
// is whatever was typed last, so before each row the runner types the row's previous text when it has one, otherwise an
// authored request (which the reader context never treats as a previous phrase), then reopens the work file.
// Returns records in the Node runner's shape (+ `browser`: wall time, stage timings, watchdog, worker restarts).
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {PSYS2} from './paths.mjs';

const imp=p=>import(path.join(PSYS2,p));
const {NATIVE_AREAS}=await imp('src/dialog/app-reader-context.mjs');
const {snapshotNativeInstances}=await imp('src/dialog/instance-persistence.mjs');
const {createFacts}=await imp('src/knowledge/facts.mjs');
const {createKnowledgeSource}=await imp('src/loaders/knowledge-source.mjs');
const {createSetupCache,TAB}=await imp('scripts/mass-eval/area-setup.mjs');
const {diffObservations}=await imp('scripts/mass-eval/judge.mjs');
const {openBrowserReaderRoute}=await imp('scripts/lib/browser-reader-route.mjs');

const WEBCHAT=path.join(PSYS2,'docs/webchat');
const DEPLOYMENT=JSON.parse(readFileSync(path.join(WEBCHAT,'models/sop-bert/deployment.json'),'utf8'));
const BUNDLE=path.join(WEBCHAT,DEPLOYMENT.artifactBase);
export const RESET_TEXT='@reset std.request .';   // an authored request: no reader, no state change, and never a reader "previous"

function siteKnowledge(){
 const root=path.join(WEBCHAT,'catalog'),commit=existsSync(root)?readdirSync(root).find(n=>/^[0-9a-f]{40}$/.test(n)):null;
 return commit?createFacts({source:createKnowledgeSource(path.join(root,commit))}):null;
}
const props=o=>{const m={};for(const i of o.inputs??[]){if(['selected','index','version'].includes(i.key))continue;m[i.key]=i.values.length===1?i.values[0]:i.values;}return m;};
const KEEP=['kind','name','label','title','text','colour','color','fill','stroke','size','x','y','width','height','shape','layout','from','to','values','labels','value','style','facing','pose','count','parent','group','variant','drawing','line','dash','font','opacity','rotation','z'];
const brief=o=>{const p=props(o),out={id:o.id,kind:o.kind};for(const k of Object.keys(p))if(KEEP.includes(k)||Object.keys(out).length<14)out[k]=typeof p[k]==='string'?p[k].slice(0,80):Array.isArray(p[k])?p[k].slice(0,8):p[k];return out;};

// In the page: wraps the session's send once so the runner can read each turn's reply (the page itself is unchanged).
const INSTALL=`(()=>{const c=window.psys2.engineClient,s=c.session;if(s.__ru)return true;const send=s.send.bind(s);window.__ru={turns:[]};
 s.send=async function(text,opts){const t0=performance.now(),k0=c.stats.starts,rec={text,t0};window.__ru.turns.push(rec);
  try{const r=await send(text,opts);rec.ms=performance.now()-t0;rec.reply=r;return r;}catch(e){rec.ms=performance.now()-t0;rec.error={name:e?.name,reason:e?.reason??null,stage:e?.stage??null,message:String(e?.message??e).slice(0,300)};throw e;}};
 s.__ru=true;return true;})()`;
// Summarizes the last turn in the page (a reply carries large traces; only what the record needs is returned).
const SUMMARY=`(()=>{const c=window.psys2.engineClient,t=window.__ru.turns.at(-1)??null,r=t?.reply??null,act=r?.trace?.worldActivity??[];
 const stages=[];for(let i=0;i<act.length;i++){const a=act[i];stages.push({label:a.label,phase:a.phase,node:(a.nodeIds??[])[0]??null,at:a.time,durationMs:a.durationMs??null});}
 const proposals=act.filter(a=>a.label==='Reader proposal'||a.label==='Reader request proposal').flatMap(a=>(a.proposals??[]).slice(0,1).map(p=>p.request));
 return {turn:t?{text:t.text,ms:t.ms,error:t.error??null}:null,reply:r?{text:r.text??null,statuses:r.statuses??null,reason:r.trace?.reason??null,knownBad:r.knownBad??null,perf:r.perf??null,
  effects:(r.effects??[]).slice(0,8).map(e=>({op:e.operation??e.op??e.kind??e.type??null,args:e.args?JSON.stringify(e.args).slice(0,200):undefined})),readerHost:r.trace?.readerHost?{state:r.trace.readerHost.state,diagnosticCount:r.trace.readerHost.diagnosticCount}:null}:null,
  stages,proposals,perf:(globalThis.__psys2Perf??[]).at(-1)??null,perfCount:(globalThis.__psys2Perf??[]).length,stats:{starts:c.stats.starts,kills:c.stats.kills.length,lastKill:c.stats.kills.at(-1)??null,crashes:c.stats.crashes,refused:c.stats.refused},
  reader:c.info?.reader?.state??null,lastBot:[...document.querySelectorAll('.p2-msg.bot, .p2-msg.is-bot, [data-role=bot]')].at(-1)?.textContent?.slice(0,300)??null};})()`;

// CPU profile of one turn in the engine worker (CDP Profiler): self time per function (file:line name), the top entries.
function summarizeProfile(profile,top=25){
 const self=new Map(),byId=new Map(profile.nodes.map(n=>[n.id,n]));const dt=new Map();
 for(let i=0;i<profile.samples.length;i++)dt.set(profile.samples[i],(dt.get(profile.samples[i])??0)+(profile.timeDeltas[i]??0));
 for(const [id,us] of dt){const f=byId.get(id)?.callFrame;if(!f)continue;const key=`${(f.url||'').replace(/^.*\/(lib|ui|vendor)\//,'$1/').replace(/\?v=\w+/,'')}:${f.lineNumber+1} ${f.functionName||'(anonymous)'}`;self.set(key,(self.get(key)??0)+us);}
 return [...self].sort((a,b)=>b[1]-a[1]).slice(0,top).map(([k,us])=>[k,Math.round(us/1000)]);
}
export async function createBrowserRealUseRunner({url=null,profileDir=null,scratch,timeoutMs=180000,cpuProfile=false,mode=process.env.REAL_USE_MODE??'fast'}={}){
 const knowledge=siteKnowledge();
 const bindings=JSON.parse(readFileSync(path.join(BUNDLE,'bindings.json'),'utf8'));
 const setup=createSetupCache({knowledge,bindings});
 mkdirSync(scratch,{recursive:true});
 const t0=Date.now();
 const route=await openBrowserReaderRoute({url:url??undefined,profileDir,timeoutMs});
 const startupMs=Date.now()-t0;
 const ev=x=>route.evaluate(x);
 await ev(INSTALL);
 // The chat's Fast | Thinking toggle, set the way a user sets it (a click when it shows the other mode).
 if(await ev(`!!document.querySelector('.p2-mode')`)&&await ev(`document.querySelector('.p2-mode').textContent.toLowerCase()`)!==mode)await ev(`(document.querySelector('.p2-mode').click(),true)`);
 // The page's own reader readiness (the first turn would wait for it otherwise).
 const readerReadyMs=await ev(`(async()=>{const t=performance.now();await window.psys2.engineClient.call('prepare');return performance.now()-t;})()`);
 const version=await ev('globalThis.__psys2Build?.version??null');
 const doc=await route.call('DOM.getDocument',{depth:0});
 const fileInput=async()=>(await route.call('DOM.querySelector',{nodeId:(await route.call('DOM.getDocument',{depth:0})).root.nodeId,selector:'input[type=file][aria-label="Open work file"]'})).nodeId;
 void doc;
 const idle=()=>ev(`(async()=>{const end=Date.now()+${timeoutMs};const c=window.psys2.engineClient;while(document.querySelector('.is-typing')||c.restarting){if(Date.now()>end)throw Error('page busy');await new Promise(r=>setTimeout(r,25));}return true;})()`);
 async function clickTab(tab){
  const active=await ev(`document.querySelector('#p2-tab-${tab}')?.getAttribute('aria-selected')`);
  if(active!=='true'){await ev(`document.querySelector('#p2-tab-${tab}').click()`);await ev(`(async()=>{const end=Date.now()+60000;while(document.querySelector('#p2-tab-${tab}')?.getAttribute('aria-selected')!=='true'){if(Date.now()>end)throw Error('tab switch');await new Promise(r=>setTimeout(r,25));}})()`);}
 }
 /** Types one message as a user (focus, insert text, Enter) and waits for the page's turn to end. */
 async function type(text){
  await idle();
  const n=await ev('(globalThis.__psys2Perf??[]).length');
  await ev(`(()=>{const t=document.querySelector('textarea.p2-text');t.focus();t.value='';t.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  await route.input('insertText',{text});
  const start=Date.now();
  for(const type of ['keyDown','keyUp'])await route.input('dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,...(type==='keyDown'?{text:'\r'}:{})});
  await ev(`(async()=>{const end=Date.now()+${timeoutMs};while((globalThis.__psys2Perf??[]).length<=${n}){if(Date.now()>end)throw Error('no answer');await new Promise(r=>setTimeout(r,20));}return true;})()`);
  const wallMs=Date.now()-start;
  await idle();
  return {wallMs,...await ev(SUMMARY)};
 }
 async function openWork(records){
  const file=path.join(scratch,'work.json');writeFileSync(file,JSON.stringify({format:'psys2.work-file/1',version,records}));
  const before=await ev(`document.querySelectorAll('.is-note').length`);
  await route.call('DOM.setFileInputFiles',{files:[file],nodeId:await fileInput()});
  const note=await ev(`(async()=>{const end=Date.now()+60000;while(document.querySelectorAll('.is-note').length<=${before}){if(Date.now()>end)throw Error('work file not opened');await new Promise(r=>setTimeout(r,20));}return [...document.querySelectorAll('.is-note')].at(-1).textContent;})()`);
  if(!/^Loaded \d+ saved world/.test(note))throw Error('work file: '+note.slice(0,200));
 }
 const carrier=s=>s&&typeof s==='object'?Object.fromEntries(['sop','runtime'].filter(k=>Object.hasOwn(s,k)).map(k=>[k,s[k]])):s;
 const observe=async(world,state)=>{state=carrier(state);const area=Object.values(NATIVE_AREAS).find(a=>a.world===world);const host=await area.create({state:JSON.parse(JSON.stringify(state)),instanceId:'real-use',...(knowledge?{knowledge}:{})});return host.observe();};

 async function run(row){
  const tab=TAB[row.world],area=NATIVE_AREAS[tab];
  const seeded=await setup(row.world,row.context?.existing??[]);
  const records=await snapshotNativeInstances({isession:{state:seeded.state},engine:{...(knowledge?{knowledge}:{})}},{worlds:[area.world]});
  await clickTab(tab);
  const statsBefore=await ev('({starts:window.psys2.engineClient.stats.starts,kills:window.psys2.engineClient.stats.kills.length})');
  const prior=await type(row.context?.previous??RESET_TEXT);
  await openWork(records);
  const beforeArea=await ev(`window.psys2.engineClient.session.state(${JSON.stringify(area.world)})`);
  const worker=cpuProfile?route.targets().find(t=>t.type==='worker'&&/engine-worker/.test(t.url)):null;
  if(worker){await route.call('Profiler.enable',{},worker.sessionId);await route.call('Profiler.setSamplingInterval',{interval:500},worker.sessionId);await route.call('Profiler.start',{},worker.sessionId);}
  const s=await type(row.text);
  let profile=null;if(worker){try{profile=summarizeProfile((await route.call('Profiler.stop',{},worker.sessionId)).profile);}catch(e){profile=[['profile-failed:'+String(e?.message??e).slice(0,100),0]];}}
  let solver=null;try{solver=await ev("window.psys2.engineClient.call('placementSearchStatus').then(x=>({state:x.state,mode:x.mode??null,counts:x.counts??null,error:x.error??null}))");}catch{/* older page */}
  const afterArea=await ev(`window.psys2.engineClient.session.state(${JSON.stringify(area.world)})`);
  const before=await observe(area.world,beforeArea),after=await observe(area.world,afterArea);
  const d=diffObservations(before,after,row.world);
  let svgBefore=null,svgAfter=null,renderError=null;
  try{svgBefore=area.projectState?.(carrier(beforeArea))?.svg??null;svgAfter=area.projectState?.(carrier(afterArea))?.svg??null;}catch(e){renderError=String(e?.message??e).slice(0,200);}
  const stopped=s.perf?.stopped??null,reply=s.reply;
  const error=s.turn?.error?`${s.turn.error.name}:${s.turn.error.reason??''}:${s.turn.error.stage??''}`:null;
  const reading=(s.proposals??[]).filter(r=>r?.act);
  const stages={};for(let i=1;i<s.stages.length;i++){const k=s.stages[i-1].label;stages[k]=(stages[k]??0)+(s.stages[i].at-s.stages[i-1].at);}
  return {__stageA:{before,after,reply:reply?{text:reply.text,statuses:reply.statuses,trace:{reason:reply.reason},effects:reply.effects}:{text:s.lastBot??null,statuses:[],trace:{reason:stopped},effects:[]},error,proposals:[]},
   compiled:reply?.effects??[],setupFailures:seeded.failures,
   contextSeeded:before.objects.filter(o=>/^art\.draw\.object$|^diagram\.sketch\.(node|link|group)$|^data\.charts\./.test(o.sourceType)).map(brief),
   reply:reply?.text??s.lastBot??null,statuses:reply?.statuses??null,reason:reply?.reason??stopped,error,ms:Math.round(s.turn?.ms??s.wallMs),
   created:d.created.map(brief),removed:d.removed.map(o=>({id:o.id,kind:o.kind,name:props(o).name??props(o).label})),
   changed:d.changed.map(c=>({id:c.object.id,kind:c.object.kind,name:props(c.object).name??props(c.object).label,keys:c.keys,before:Object.fromEntries(c.keys.map(k=>[k,props(c.before)[k]])),after:Object.fromEntries(c.keys.map(k=>[k,props(c.object)[k]]))})),
   selectionChanged:d.selection,
   reading:reading.map(r=>({act:r.act,mood:r.mood,target:r.target,constraints:(r.constraints??[]).map(c=>({key:c.key,value:c.value??c.value_span,op:c.operator,phase:c.phase}))})),
   failures:[],svgBefore,svgAfter,renderError,
   browser:{wallMs:s.wallMs,engineMs:s.turn?.ms??null,perf:s.perf,stopped,watchdog:stopped==='timeout',stages,
    workerStarts:s.stats.starts-statsBefore.starts,kills:s.stats.kills-statsBefore.kills,lastKill:s.stats.kills>statsBefore.kills?s.stats.lastKill:null,reader:s.reader,readerHost:reply?.readerHost??null,
    solver,priorTurn:{text:prior.turn?.text??null,wallMs:prior.wallMs,stopped:prior.perf?.stopped??null},...(profile?{cpuProfile:profile}:{})}};
 }
 return {run,bindings,startupMs,readerReadyMs,version,url:route.url,logs:route.logs,close:()=>route.close(),evaluate:ev};
}
