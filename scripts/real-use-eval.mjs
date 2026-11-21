#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// OFFICIAL REAL-USE TEST (owner, 2026-11-20; replaces the retired test-split metrics).
// Two plain random ~1% samples of the official TRAINING dataset (all tabs) are run on every invocation:
//   A — fixed seed (saved list), to compare readers/runtimes on identical rows;
//   B — a fresh random seed drawn anew each run (recorded in meta/report, never reused), so nothing is tuned to one set.
// Each row is run through the full application
// path with the DEPLOYED reader (text -> SOP-BERT reader -> compiler -> tool -> new area state), exactly the engine
// path of mass-eval's end-to-end level, and every result is recorded (reply, objects created/changed/removed, a
// before|after PNG for drawing/diagram). Usefulness is then judged on the actual result by reviewers (agents or
// humans) with scripts/real-use/JUDGING.md, never by a string judge; this script aggregates the judgments.
//
// Judging is two-stage: Stage A (scripts/real-use/stage-a.mjs) decides the unambiguous rows deterministically and tags
// the layer; Stage B judges only the undecided rows from compact records (reader wires, compiled wires, diff, reply,
// thumbnail grids) with scripts/real-use/JUDGING.md.
// usage:
//   node scripts/real-use-eval.mjs                         # sample + run + PNGs + judge cards + report (one command)
//   node scripts/real-use-eval.mjs --inherit <prev run dir> # also copy judgments of rows whose outcome is unchanged
//   node scripts/real-use-eval.mjs --report <run dir>      # only rebuild REPORT.md from <run dir>/judgments.jsonl
//   options: --rate 0.01 --seed real-use-v1 (sample A) --seed-b S (only to reproduce an old B) --workers 16 --out DIR (default ../management/real-use/<date>-<bundle>)
//            --limit N (smoke) --runtime-root <node_modules with onnxruntime-node>
//            --tabs drawing,diagram (only these tabs) --no-b (only the fixed suite A) --mode fast|thinking (answer mode, default fast)
//   node scripts/real-use-eval.mjs --browser [URL] ...     # Stage-A pass in the browser: the same rows typed into the application page
//            (headless Chromium, scripts/real-use/browser-runner.mjs; URL default = local docs/webchat; --profile DIR keeps a warm profile;
//            --cpu-profile adds the engine worker's CPU profile of each turn: top self-time functions)
import {fork} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';import path from 'node:path';
import {PSYS2,TOOL} from './real-use/paths.mjs';
import {loadTrain,randomSample,realUseClass,tierOf} from './real-use/sample.mjs';
import {writeReport} from './real-use/report.mjs';

const args=process.argv.slice(2),opt=(n,d)=>{const i=args.indexOf('--'+n);return i<0?d:args[i+1];};
// --mode fast|thinking: the chat's answer mode for every row (browser: the toggle; Node: the same placement mode). Default fast, as the page.
if(opt('mode',null))process.env.REAL_USE_MODE=opt('mode');
if(opt('report',null)){writeReport(path.resolve(opt('report')));process.exit(0);}
const dep=JSON.parse(readFileSync(path.join(PSYS2,'docs/webchat/models/sop-bert/deployment.json'),'utf8'));
const bundle=dep.manifestSha256.slice(0,8),date=new Date().toISOString().slice(0,10);
const rate=Number(opt('rate',0.01)),seed=opt('seed','real-use-v1'),workers=Number(opt('workers',Math.max(2,Math.min(os.cpus().length-4,16))));
const out=path.resolve(opt('out',path.join(PSYS2,'../management/real-use',`${date}-${bundle}`)));
for(const d of ['svg','png','cards'])mkdirSync(path.join(out,d),{recursive:true});

// 1. sample (saved list)
const all=loadTrain();
const seedB=opt('seed-b',`fresh-${Date.now()}-${Math.floor(Math.random()*1e9)}`);
let setA=randomSample(all,{rate,seed}),setB=randomSample(all,{rate,seed:seedB});
// The fixed suite A is the SAVED id list of an earlier run when one is given (--fixed-from DIR, or the --inherit DIR),
// so a changed dataset build does not silently change A; rows no longer in the dataset are reported.
const fixedFrom=opt('fixed-from',opt('inherit',null));let missingA=[];
if(fixedFrom&&existsSync(path.join(path.resolve(fixedFrom),'sample.jsonl'))){const byIdAll=new Map(all.map(r=>[r.id,r]));
 const ids=readFileSync(path.join(path.resolve(fixedFrom),'sample.jsonl'),'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(r=>(r.setsAll??r.sets??[]).includes('A')).map(r=>r.id);
 missingA=ids.filter(id=>!byIdAll.has(id));setA=ids.filter(id=>byIdAll.has(id)).map(id=>byIdAll.get(id));}
if(opt('tabs',null)){const tabs=new Set(opt('tabs').split(','));setA=setA.filter(r=>tabs.has(r.world));setB=setB.filter(r=>tabs.has(r.world));}
if(args.includes('--no-b'))setB=[];
if(opt('limit',null)){setA=setA.slice(0,Number(opt('limit')));setB=setB.slice(0,Number(opt('limit')));}
const sets=new Map();for(const r of setA)sets.set(r.id,['A']);for(const r of setB)sets.set(r.id,[...(sets.get(r.id)??[]),'B']);
const byId=new Map([...setA,...setB].map(r=>[r.id,r]));let rows=[...byId.values()];
const ORDER=['drawing','diagram','document','calendar','avatar'];
writeFileSync(path.join(out,'sample.jsonl'),rows.map(r=>JSON.stringify({id:r.id,sets:sets.get(r.id),world:r.world,class:realUseClass(r),tier:tierOf(r),source:r.source,style:r.style,text:r.text,context:r.context,requests:r.requests})).join('\n')+'\n');
process.stderr.write(`real-use: ${all.length} training rows, A ${setA.length} (seed ${seed}) + B ${setB.length} (fresh seed ${seedB}) = ${rows.length} distinct rows, bundle ${bundle}, ${workers} workers -> ${out}\n`);

// 2. run through the full app path
const t0=Date.now(),results=new Map();
// --reuse-results: keep the rows an interrupted run already recorded in <out>/results.jsonl (same --seed-b and --out).
if(args.includes('--reuse-results')&&existsSync(path.join(out,'results.jsonl')))for(const l of readFileSync(path.join(out,'results.jsonl'),'utf8').split('\n').filter(Boolean)){const r=JSON.parse(l);if(byId.has(r.id))results.set(r.id,r);}
const resFile=createWriteStream(path.join(out,'results.jsonl'));for(const r of results.values())resFile.write(JSON.stringify(r)+'\n');
const queue=[...rows].filter(r=>!results.has(r.id)).sort((a,b)=>a.id<b.id?-1:1);let next=0,done=0;
const browserAt=args.indexOf('--browser');
if(browserAt>=0&&queue.length){
 // Browser pass: one page, rows typed in order (sequential: the page runs one turn at a time, like a user).
 const url=args[browserAt+1]&&!args[browserAt+1].startsWith('--')?args[browserAt+1]:null;
 const {createBrowserRealUseRunner}=await import('./real-use/browser-runner.mjs');
 const {stageA,initStageA}=await import('./real-use/stage-a.mjs');
 const runner=await createBrowserRealUseRunner({url,cpuProfile:args.includes('--cpu-profile'),profileDir:opt('profile',null)?path.resolve(opt('profile')):null,scratch:path.join(out,'browser-tmp')});
 initStageA(runner.bindings);
 writeFileSync(path.join(out,'browser-session.json'),JSON.stringify({url:runner.url,version:runner.version,startupMs:runner.startupMs,readerReadyMs:runner.readerReadyMs},null,1));
 const safe=id=>id.replace(/[^A-Za-z0-9._-]+/g,'_');
 try{for(const row of queue){let r;
  try{r=await runner.run(row);}catch(e){r={error:'harness:'+String(e?.message??e).slice(0,300)};}
  const {svgBefore,svgAfter,__stageA,...rest}=r;
  if(__stageA){try{rest.stageA=stageA(row,__stageA,r.setupFailures);}catch(e){rest.stageA={error:String(e?.message??e).slice(0,200)};}}
  if(svgAfter){const f=safe(row.id);writeFileSync(path.join(out,'svg',f+'.before.svg'),svgBefore??'');writeFileSync(path.join(out,'svg',f+'.after.svg'),svgAfter);rest.svg=f;}
  const rec={id:row.id,...rest};results.set(row.id,rec);resFile.write(JSON.stringify(rec)+'\n');
  if(++done%20===0)process.stderr.write(`  ${done}/${queue.length} rows (browser), ${((Date.now()-t0)/1000).toFixed(0)} s\n`);}}
 finally{writeFileSync(path.join(out,'browser-console.json'),JSON.stringify(runner.logs.console.slice(-500)));await runner.close();}
 queue.length=0;
}
if(queue.length)await new Promise((resolve,reject)=>{let alive=0;
 const feed=c=>{if(next>=queue.length){c.send({type:'stop'});return;}c.send({type:'rows',rows:queue.slice(next,next+3)});next+=3;};
 for(let i=0;i<Math.min(workers,Math.ceil(queue.length/3));i++){
  const c=fork(path.join(TOOL,'worker.mjs'),[],{env:{...process.env,REAL_USE_OUT:out,...(opt('runtime-root',null)?{REAL_USE_RUNTIME_ROOT:opt('runtime-root')}:{})},stdio:['ignore','ignore','pipe','ipc'],execArgv:['--max-old-space-size=6144']});
  alive++;let err='';c.stderr.on('data',d=>{err=(err+d).slice(-3000);});
  c.on('message',m=>{if(m.type==='ready')feed(c);else if(m.type==='fatal')reject(Error(m.error));else if(m.type==='results'){for(const r of m.results){results.set(r.id,r);resFile.write(JSON.stringify(r)+'\n');}done+=m.results.length;if(done%60<3)process.stderr.write(`  ${done}/${queue.length} rows, ${((Date.now()-t0)/1000).toFixed(0)} s\n`);feed(c);}});
  c.on('exit',code=>{alive--;if(code)process.stderr.write(`worker exit ${code}: ${err.slice(-600)}\n`);if(!alive)resolve();});
 }});
resFile.end();
process.stderr.write(`real-use: ran ${results.size} rows in ${((Date.now()-t0)/1000).toFixed(0)} s\n`);

// 3. PNGs (drawing/diagram first; any tab whose area projects an SVG)
const {renderPairs}=await import('./real-use/render.mjs');
const items=rows.map(r=>results.get(r.id)).filter(r=>r?.svg).map(r=>({svg:r.svg,title:rows.find(x=>x.id===r.id).text}));
const chunks=Array.from({length:Math.min(6,items.length)},(_,i)=>items.filter((_,j)=>j%6===i));
const pngs=(await Promise.all(chunks.map(c=>renderPairs(out,c)))).reduce((a,b)=>a+b,0);
process.stderr.write(`real-use: ${pngs} PNGs\n`);

// 4. Stage A (deterministic, computed in the workers) -> judgments-a.jsonl; Stage B cards for the undecided rows only.
// Stage B scope: every undecided row of the fixed sample A, and the undecided rows of a seeded random subsample of B
// (--judge-b N, default 300; B's percentages are reported on that subsample). Stage B judgments of rows whose outcome
// is unchanged since an earlier run (--inherit DIR) are copied.
const sig=(row,r)=>createHash('sha256').update(JSON.stringify([row.text,row.context,r.reply,(r.created??[]).map(({id,...o})=>o),r.changed?.map(c=>[c.kind,c.keys,c.after]),r.removed?.map(o=>o.kind)])).digest('hex').slice(0,16);
const short=v=>JSON.stringify(v).replace(/\\"/g,'').replace(/"/g,'').slice(0,200);
const {rng}=await import('./real-use/sample.mjs');
const {replyPattern,replyDecision}=await import('./real-use/stage-a.mjs');
const judgeB=Number(opt('judge-b',300)),bIds=setB.map(r=>r.id).sort(),rb=rng(parseInt(createHash('sha256').update('judge-b:'+seedB).digest('hex').slice(0,8),16));
for(let i=bIds.length-1;i>0;i--){const j=Math.floor(rb()*(i+1));[bIds[i],bIds[j]]=[bIds[j],bIds[i]];}
const bSub=new Set(bIds.slice(0,judgeB));writeFileSync(path.join(out,'b-judge-subsample.json'),JSON.stringify([...bSub].sort()));
const inherited=new Map();
if(opt('inherit',null)){const prev=path.resolve(opt('inherit'));const sigs=new Map();
 if(existsSync(path.join(prev,'signatures.json')))for(const [id,s]of Object.entries(JSON.parse(readFileSync(path.join(prev,'signatures.json'),'utf8'))))sigs.set(id,s);
 if(existsSync(path.join(prev,'judgments-b.jsonl')))for(const l of readFileSync(path.join(prev,'judgments-b.jsonl'),'utf8').split('\n').filter(Boolean)){const j=JSON.parse(l);inherited.set(j.id+'|'+sigs.get(j.id),j);}}
const signatures={},decidedA=[],judgedB=[],cards=[];
const wires=q=>`${q.act}/${q.mood} ${q.target?.type??''}:${q.target?.mode??''} ${q.target?.kind??q.target?.name_span??''} ${(q.constraints??[]).map(c=>c.key+'='+c.value).join(',')}`;
for(const row of [...rows].sort((a,b)=>ORDER.indexOf(a.world)-ORDER.indexOf(b.world)||(a.id<b.id?-1:1))){
 const r=results.get(row.id)??{error:'no result'},s=sig(row,r);signatures[row.id]=s;
 const d=replyDecision(row,r);if(r.stageA)r.stageA.replyPattern=replyPattern(r);if(d){decidedA.push({id:row.id,...d});continue;}
 if(!sets.get(row.id).includes('A')&&!bSub.has(row.id))continue;
 const inh=inherited.get(row.id+'|'+s);if(inh){judgedB.push({...inh,inherited:true});continue;}
 cards.push([`### ${row.id}`,`sets=${sets.get(row.id).join('+')} tab=${row.world} class=${realUseClass(row)} tier=${tierOf(row)}`,
  `TEXT: ${row.text}`,
  `CONTEXT: ${(row.context?.existing??[]).map(o=>o.kind+(o.name&&o.name.toLowerCase()!==o.kind?':'+o.name:'')).join(', ')||'(empty)'}${row.context?.previous?` | PREVIOUS: ${short(row.context.previous)}`:''}`,
  r.setupFailures?.length?`SETUP-FAILED: ${short(r.setupFailures)}`:null,
  `GOLD: ${(row.requests??[]).map(wires).join(' || ')||'-'}`,
  `READER: ${(r.reading??[]).map(wires).join(' || ')||'-'}${r.stageA?.reading?.exact===false?`  (differs: ${r.stageA.reading.first})`:''}`,
  `COMPILED: ${(r.compiled??[]).map(c=>c.op+(c.args?' '+c.args.replace(/"/g,''):'')).join(' ; ')||'-'}`,
  `REPLY: ${r.reply??'(none)'}${r.error?' ERROR: '+r.error:''}  [${(r.statuses??[]).join(',')}${r.reason?' '+r.reason:''}]`,
  `DIFF: +${(r.created??[]).map(short).join(' ; ')||'-'} | ~${(r.changed??[]).map(c=>`${c.kind}${c.name?' '+c.name:''} ${short(c.before)} -> ${short(c.after)}`).join(' ; ')||'-'} | x${(r.removed??[]).map(short).join(' ; ')||'-'}`,
  `STAGE-A: reply=${replyPattern(r)} judge=${r.stageA?.judge?.verdict??'?'}${r.stageA?.judge?.failed?.length?' failed='+r.stageA.judge.failed.join(','):''}${r.stageA?.cause?' cause='+r.stageA.cause.layer+': '+r.stageA.cause.cause:''}`,
  r.svg?`PNG: png/${r.svg}.png`:null].filter(Boolean).join('\n'));
}
writeFileSync(path.join(out,'signatures.json'),JSON.stringify(signatures));
writeFileSync(path.join(out,'judgments-a.jsonl'),decidedA.map(j=>JSON.stringify(j)).join('\n')+'\n');
if(judgedB.length)writeFileSync(path.join(out,'judgments-b.jsonl'),judgedB.map(j=>JSON.stringify(j)).join('\n')+'\n');
// Stage B batches of 90 records (one shared rubric, scripts/real-use/JUDGING.md); the PNGs of a batch are tiled into
// contact sheets (8 per sheet, numbered) so a reviewer looks at a few images per batch instead of one per row.
const {execFileSync}=await import('node:child_process');
const per=90;for(let i=0;i*per<cards.length;i++){
 const name=`batch-${String(i+1).padStart(2,'0')}`,part=cards.slice(i*per,(i+1)*per),withPng=part.map(c=>/PNG: (png\/\S+)/.exec(c)?.[1]).filter(Boolean);
 const sheets=[];for(let k=0;k*8<withPng.length;k++){const f=`cards/${name}-sheet-${k+1}.png`,list=withPng.slice(k*8,k*8+8);
  try{execFileSync('montage',[...list.flatMap((p,j)=>['-label',`#${k*8+j+1}`,path.join(out,p)]),'-tile','2x4','-geometry','620x227+4+4','-pointsize','16',path.join(out,f)]);sheets.push([f,list]);}catch(e){process.stderr.write('montage failed: '+e.message+'\n');}}
 const idx=new Map(sheets.flatMap(([f,list])=>list.map((p,j)=>[p,`${f} #${sheets.findIndex(x=>x[0]===f)*8+j+1}`])));
 writeFileSync(path.join(out,'cards',name+'.md'),part.map(c=>c.replace(/PNG: (png\/\S+)/,(m,p)=>idx.has(p)?`${m}  (sheet: ${idx.get(p)})`:m)).join('\n\n')+'\n');
}
const judged=[...decidedA,...judgedB];
writeFileSync(path.join(out,'meta.json'),JSON.stringify({test:'official real-use test',date,runner:browserAt>=0?'browser':'node',bundle,manifestSha256:dep.manifestSha256,rate,seed,seedB,sizeA:setA.length,fixedFrom,missingA:missingA.length,sizeB:setB.length,trainingRows:all.length,sampled:rows.length,ran:results.size,pngs,stageADecided:decidedA.length,inheritedJudgments:judgedB.length,judgeB,toJudge:cards.length,seconds:(Date.now()-t0)/1000},null,1));
process.stderr.write(`real-use: Stage A decided ${decidedA.length}, ${judgedB.length} Stage B judgments inherited, ${cards.length} rows to judge in ${out}/cards (rubric: scripts/real-use/JUDGING.md), append judgments to judgments-b.jsonl, then: node scripts/real-use-eval.mjs --report ${out}\n`);
writeReport(out);
