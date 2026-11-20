#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// MASS evaluation of PSys2 over the labelled data (official-dataset + data drops announced DONE), at two levels:
//   oracle — the row's gold labels served as the reader output (gold cutter/reader through the real key-reader
//            pipeline: raw structure -> bridge -> capability compilation -> execution on the tab's SOP area);
//   e2e    — the deployed SOP-BERT reader (docs/webchat/models/sop-bert/deployment.json, ONNX in Node) reads the
//            text with context/previous; its reading is compared with the labels field by field and executed.
// Both are judged semantically on the instance-world diff (scripts/mass-eval/judge.mjs); failures get a layer and a
// missing-capability cause (scripts/mass-eval/causes.mjs), ranked by rows affected.
//
// usage:
//   node scripts/mass-eval.mjs                       # quick (default): stratified sample, about 1-3%, a few minutes
//   node scripts/mass-eval.mjs --rate 0.02 --min 25  # larger stratified sample
//   node scripts/mass-eval.mjs --per-tab 200         # random N per tab (spread over usage classes)
//   node scripts/mass-eval.mjs --full                # every row (occasional background job)
//   options: --workers N (default min(cpus-4, 16)) --levels oracle,e2e --seed S (default rotates hourly)
//            --out DIR (default ../management/benchmark/<date>-<commit>[-full]) --runtime-root <node_modules with onnxruntime-node>
//            --limit N (first N rows of the selection, for smoke runs) --copy-to DIR (also write the reports there, without failures.jsonl)
//            --management DIR (the management folder with data-drop/ and questions.md; default ../management)
import {fork,execSync} from 'node:child_process';
import {mkdirSync,writeFileSync,createWriteStream,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRows,stratifiedSample,usageClass} from './mass-eval/data.mjs';
import {writeReports} from './mass-eval/report.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),opt=(name,def)=>{const i=args.indexOf('--'+name);return i<0?def:args[i+1];},flag=name=>args.includes('--'+name);
const full=flag('full'),levels=opt('levels','oracle,e2e').split(','),workers=Number(opt('workers',Math.max(2,Math.min(os.cpus().length-4,16))));
const seed=opt('seed',String(Math.floor(Date.now()/3600000))),rate=Number(opt('rate',0.01)),min=Number(opt('min',20)),perTab=opt('per-tab',null);
const commit=execSync('git rev-parse --short HEAD',{cwd:ROOT}).toString().trim(),date=new Date().toISOString().slice(0,10);
const managementRoot=path.resolve(opt('management',path.join(ROOT,'../management')));
const out=path.resolve(opt('out',path.join(managementRoot,'benchmark',`${date}-${commit}${full?'-full':''}`)));
mkdirSync(out,{recursive:true});

const t0=Date.now();
const {rows,sources,batches}=loadRows({root:ROOT,managementRoot});
let selection,plan=null;
if(full){selection=rows;for(const r of rows)r.__weight=1;}
else ({sample:selection,plan}=stratifiedSample(rows,{rate,min,seed,perTab:perTab?Number(perTab):null}));
if(opt('limit',null))selection=selection.slice(0,Number(opt('limit')));
// Interleave tabs and classes so that every worker sees a mix (slow rows spread out).
selection=[...selection].sort((a,b)=>(a.id<b.id?-1:1));
process.stderr.write(`mass-eval: ${rows.length} rows loaded (${JSON.stringify(sources)}), ${selection.length} selected (${full?'full':perTab?'per-tab '+perTab:'stratified rate '+rate+' min '+min}, seed ${seed}), ${workers} workers, levels ${levels}\n`);

const results=[],resultsFile=createWriteStream(path.join(out,'results.jsonl'));
let next=0,done=0,lastReport=Date.now();const batch=4,startEval=Date.now();
const env={...process.env,MASS_EVAL_LEVELS:levels.join(','),...(opt('runtime-root',null)?{MASS_EVAL_RUNTIME_ROOT:opt('runtime-root')}:{})};
await new Promise((resolve,reject)=>{
 let alive=0;
 const feed=child=>{if(next>=selection.length){child.send({type:'stop'});return;}const rowsOut=selection.slice(next,next+batch);next+=batch;child.send({type:'rows',rows:rowsOut});};
 for(let i=0;i<Math.min(workers,Math.ceil(selection.length/batch));i++){
  const child=fork(path.join(ROOT,'scripts/mass-eval/worker.mjs'),[],{env,stdio:['ignore','ignore','pipe','ipc'],execArgv:['--max-old-space-size=6144']});
  alive++;let err='';child.stderr.on('data',d=>{err=(err+d).slice(-4000);});
  child.on('message',msg=>{
   if(msg.type==='ready')feed(child);
   else if(msg.type==='fatal'){reject(Error('worker failed: '+msg.error));}
   else if(msg.type==='results'){for(const r of msg.results){results.push(r);resultsFile.write(JSON.stringify(r)+'\n');}done+=msg.results.length;
    if(Date.now()-lastReport>15000){lastReport=Date.now();const s=(Date.now()-startEval)/1000;process.stderr.write(`  ${done}/${selection.length} rows, ${(done/s).toFixed(2)} rows/s\n`);}
    feed(child);}
  });
  child.on('exit',code=>{alive--;if(code&&code!==0&&next<selection.length)process.stderr.write(`worker exited ${code}: ${err.slice(-800)}\n`);if(!alive)resolve();});
 }
});
resultsFile.end();
const seconds=(Date.now()-t0)/1000,evalSeconds=(Date.now()-startEval)/1000;
const meta={date,commit,mode:full?'full':perTab?`per-tab ${perTab}`:`stratified (rate ${rate}, min ${min} per tab x usage class, >=3 per operation, >=5 per key family)`,seed,levels,workers,
 rowsLoaded:rows.length,sources,dropBatches:batches,selected:selection.length,evaluated:results.length,seconds,evalSeconds,rowsPerSecond:results.length/evalSeconds,
 reader:{manifest:path.basename(path.dirname(path.join(ROOT,'docs/webchat/models/sop-bert/deployment.json')))},plan,
 populationByTab:Object.fromEntries(['drawing','diagram','document','calendar','avatar'].map(w=>[w,rows.filter(r=>r.world===w).length])),
 populationByClass:rows.reduce((m,r)=>{const k=r.world+'|'+usageClass(r);m[k]=(m[k]??0)+1;return m;},{})};
writeReports(out,results,meta);
const copy=opt('copy-to',null);if(copy){mkdirSync(copy,{recursive:true});writeReports(path.resolve(copy),results,meta,{withFailures:false});}
process.stderr.write(`mass-eval: ${results.length} rows in ${seconds.toFixed(0)} s (${(results.length/evalSeconds).toFixed(2)} rows/s); reports in ${out}\n`);
