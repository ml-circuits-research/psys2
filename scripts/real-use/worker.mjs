// SPDX-License-Identifier: AGPL-3.0-only
// Official real-use test worker: one deployed-reader runner; runs the rows the parent sends; writes SVGs to disk.
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {createRealUseRunner} from './runner.mjs';
import {stageA,initStageA} from './stage-a.mjs';
console.log=()=>{};console.warn=()=>{};console.info=()=>{};
const out=process.env.REAL_USE_OUT;
let runner;
try{runner=await createRealUseRunner({...(process.env.REAL_USE_RUNTIME_ROOT?{runtimeRoot:process.env.REAL_USE_RUNTIME_ROOT}:{})});}
catch(e){process.send({type:'fatal',error:String(e?.stack??e).slice(0,2000)});process.exit(1);}
initStageA(runner.bindings);
const safe=id=>id.replace(/[^A-Za-z0-9._-]+/g,'_');
process.on('message',async msg=>{
 if(msg.type==='stop')process.exit(0);
 const results=[];
 for(const row of msg.rows){
  let r;
  try{r=await runner.run(row);}catch(e){r={error:'harness:'+String(e?.message??e).slice(0,300)};}
  const {svgBefore,svgAfter,__stageA,...rest}=r;
  if(__stageA){try{rest.stageA=stageA(row,__stageA,r.setupFailures);}catch(e){rest.stageA={error:String(e?.message??e).slice(0,200)};}}
  if(svgAfter){const f=safe(row.id);writeFileSync(path.join(out,'svg',f+'.before.svg'),svgBefore??'');writeFileSync(path.join(out,'svg',f+'.after.svg'),svgAfter);rest.svg=f;}
  results.push({id:row.id,...rest});
 }
 process.send({type:'results',results});
});
process.send({type:'ready'});
