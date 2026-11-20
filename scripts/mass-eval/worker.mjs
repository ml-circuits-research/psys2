// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation worker process: one runner (one area base per tab and context, one gold provider, one deployed reader),
// evaluates the rows the parent sends and answers with compact records.
import {createRunner} from './runner.mjs';
import {judgeRow,setKindTable,setPropertyTable} from './judge.mjs';
import {completeBindings} from '../../src/dialog/declared-bindings.mjs';
import {classify,compareReading} from './causes.mjs';
import {trainerRequest} from './gold-reader.mjs';
import {usageClass,rowKeys,rowActs} from './data.mjs';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const levels=(process.env.MASS_EVAL_LEVELS??'oracle,e2e').split(',');
const runtimeRoot=process.env.MASS_EVAL_RUNTIME_ROOT||undefined;
// Library code logs to the console in places; the parent only reads IPC messages.
console.log=()=>{};console.warn=()=>{};console.info=()=>{};
let runner;
try{runner=await createRunner({levels,runtimeRoot});}catch(e){process.send({type:'fatal',error:String(e?.stack??e).slice(0,2000)});process.exit(1);}
setKindTable(runner.bindings);setPropertyTable(await completeBindings(runner.bindings));
const inventory=JSON.parse(readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname),'../../official-dataset/inventory.json'),'utf8'));
const ok=v=>v==='success'||v==='plausible';
const short=s=>typeof s==='string'?s.slice(0,240):s;

async function evaluate(row){
 const base={id:row.id,world:row.world,text:row.text,uclass:usageClass(row),operation:row.operation??'-',source:row.source??'-',keys:rowKeys(row),acts:rowActs(row),weight:row.__weight??1,
  needs:(row.requests??[]).flatMap(r=>(r.needs??[]).map(n=>n.frame??n.key??'?'))};
 const out={...base,levels:{}};
 let oracleOk=null;
 for(const level of levels){
  if(row.__levels&&!row.__levels.includes(level))continue;
  const t0=performance.now();let run,verdict,cause=null,reading=null;
  try{run=await runner.run(row,level);verdict=judgeRow(row,run);}
  catch(e){run={error:String(e?.message??e)};verdict={verdict:'error',detail:String(e?.message??e).slice(0,200),checks:[]};}
  if(level==='e2e'&&!row.__expect){
   const gold=(row.requests??[]).map(r=>trainerRequest(r,row.world,inventory,[]));
   const primary=(run.proposals??[]).filter(p=>p&&!p.__retry);
   const predicted=primary.flatMap(p=>p.raw?.requests??[]);
   reading=compareReading(gold,predicted);
  }
  if(!ok(verdict.verdict))cause=classify(row,run,verdict,{level,oracleOk,readerDiff:reading});
  if(level==='oracle')oracleOk=ok(verdict.verdict);
  out.levels[level]={verdict:verdict.verdict,ms:Math.round(performance.now()-t0),routeMs:Math.round(run.ms??0),
   ...(cause?{layer:cause.layer,cause:cause.cause,causeDetail:cause.detail??null,allCauses:cause.all,underlying:cause.underlying,setupIncomplete:!!cause.setupIncomplete}:{}),
   failedChecks:(verdict.failed??verdict.soft??[]).slice(0,4).map(c=>({name:c.name,detail:c.detail})),
   reason:run.reply?.trace?.reason??null,reply:short(run.reply?.text),statuses:run.reply?.statuses??null,diff:verdict.diff,
   failures:[...new Set((run.proposals??[]).filter(Boolean).flatMap(p=>(p.failures??[]).map(f=>f.reason+(f.path?.length?':'+f.path.join('.'):''))))].slice(0,6),
   setupFailures:(run.setup?.failures??[]).slice(0,4),
   ...(reading?{reading:{exact:reading.exact,first:reading.first,fields:reading.fields,constraints:reading.constraints,requestCount:reading.requestCount}}:{})};
 }
 return out;
}

process.on('message',async msg=>{
 if(msg.type==='rows'){
  const results=[];
  for(const row of msg.rows){try{results.push(await evaluate(row));}catch(e){results.push({id:row.id,world:row.world,fatal:String(e?.message??e)});}}
  process.send({type:'results',results});
 }else if(msg.type==='stop')process.exit(0);
});
process.send({type:'ready'});
