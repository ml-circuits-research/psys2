// SPDX-License-Identifier: AGPL-3.0-only
// Evaluation only: run one or more rows (by id) at one level and print the reading, reply, diff and verdict.
// usage: node scripts/mass-eval/debug-row.mjs <oracle|e2e> <row id>...
import {createRunner,ROOT} from './runner.mjs';
import {loadRows} from './data.mjs';
import {judgeRow,diffObservations,setKindTable} from './judge.mjs';
import {classify} from './causes.mjs';
import path from 'node:path';
const [level,...ids]=process.argv.slice(2);
const {rows}=loadRows({root:ROOT,managementRoot:path.resolve(ROOT,'../management')});
const runner=await createRunner({levels:[level]});setKindTable(runner.bindings);
for(const id of ids){
 const row=rows.find(r=>r.id===id);if(!row){console.log('no row',id);continue;}
 const run=await runner.run(row,level),v=judgeRow(row,run),d=diffObservations(run.before,run.after,row.world);
 console.log('\n###',id,row.world,JSON.stringify(row.text));
 console.log('labels',JSON.stringify(row.requests));
 console.log('setup',JSON.stringify(run.setup.failures),'reply',run.reply?.statuses,run.reply?.trace?.reason,JSON.stringify(run.reply?.text));
 for(const p of run.proposals.filter(Boolean))console.log('proposal',p.__retry?'(retry)':'',JSON.stringify(p.raw?.requests),'failures',JSON.stringify((p.failures??[]).map(f=>f.reason+':'+(f.path??[]).join('.'))));
 for(const o of d.created)console.log('created',o.id,o.kind,o.inputs.map(x=>x.key+'='+x.values.join('|')).join(' ').slice(0,300));
 for(const c of d.changed)console.log('changed',c.object.id,c.object.kind,c.keys.join(','),c.object.inputs.filter(x=>c.keys.includes(x.key)).map(x=>x.key+'='+x.values.join('|')).join(' ').slice(0,300));
 for(const o of d.removed)console.log('removed',o.id,o.kind);
 console.log('verdict',v.verdict,JSON.stringify(v.checks));
 if(!['success','plausible'].includes(v.verdict))console.log('cause',JSON.stringify(classify(row,run,v,{level})));
}
if(process.env.TRACE_KEYS){const row=rows.find(r=>r.id===ids[0]);const run=await runner.run(row,level);const t=run.reply?.trace??{};console.log('trace keys',Object.keys(t).join(' '));for(const k of Object.keys(t))if(/unappl|skip|cover|partial|interp/i.test(k))console.log(k,JSON.stringify(t[k]).slice(0,800));}
