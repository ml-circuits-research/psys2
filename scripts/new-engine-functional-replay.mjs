// Development-only functional matrix through the sole application reader/coordinator.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {routeNewEngine as runNewEngine} from '../src/dialog/reader-routing.mjs';
import {createDrawingHost,initialDrawingState as drawing} from '../worlds/art.draw/declared-host.mjs';
import {createDiagramHost,initialDiagramState as diagram} from '../worlds/diagram.sketch/declared-host.mjs';
import {createDocumentHost,initialDocumentState as document} from '../worlds/docs.editor/declared-host.mjs';
import {initialChartState as charts} from '../worlds/data.charts/declared-host.mjs';
import {createCalendarHost} from '../worlds/time.calendar/declared-host.mjs';
import {seedFunctionalContext} from './functional-context-seeding.mjs';
import {FUNCTIONAL_NATIVE_BINDINGS} from './lib/functional-native-bindings.mjs';
const path='training/eval/functional-matrix/dev-rows.jsonl',raw=readFileSync(path,'utf8'),input=raw.trim().split('\n').map(JSON.parse);
const tabs={drawing:'draw',diagram:'diagram',document:'editor',calendar:'calendar'},rows=[];
for(const row of input){
 const state={'art.draw':drawing(),'diagram.sketch':diagram(),'docs.editor':document(),'data.charts':charts(),'time.calendar':{people:[],rooms:[],meetings:[]},'ui.shell':{activeTab:tabs[row.world]}};
 const instanceId=`functional-setup-${createHash('sha256').update(row.id).digest('hex').slice(0,24)}`;
 const host=row.world==='drawing'?createDrawingHost({state:state['art.draw'],instanceId}):row.world==='diagram'?await createDiagramHost({state:state['diagram.sketch'],instanceId}):row.world==='document'?createDocumentHost({state:state['docs.editor'],instanceId}):row.world==='calendar'?createCalendarHost({state:state['time.calendar'],instanceId}):null;
 const setup=await seedFunctionalContext({context:row.context??{},host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS[row.world]??[],invocationPrefix:instanceId});
 const setupComplete=setup.ok;
 // Retain setup correlation without duplicating each full native state per receipt.
 setup.receipts=setup.receipts.map(r=>({invocation:r.invocation,operation:r.operation,status:r.status,reason:r.reason,code:r.code,changed:r.changed,replayed:r.replayed}));
 if(setup.observation)setup.observation={instanceId:setup.observation.instanceId,version:setup.observation.version,scope:setup.observation.scope,complete:setup.observation.complete,objects:setup.observation.objects.map(o=>({id:o.id,source:o.source,sourceType:o.sourceType,version:o.version,kind:o.kind}))};
 // Failed/partial setup is not an application trial and cannot earn an honest verdict.
 if(!setupComplete){rows.push({id:row.id,area:row.world,classes:row.classes,text:row.text,verdict:'excluded-setup',setupComplete:false,contextInstantiated:setup.counters.seeded>0,setup,readerInvoked:false,annotation:row.requests});continue;}
 const session={isession:{state},newEngineJournal:[]},before=JSON.stringify(state);
 let reply,error;
 try{reply=await runNewEngine(session,row.text,{language:'en'});}catch(e){error=String(e?.message??e);}
 const unchanged=before===JSON.stringify(state),refused=reply?.statuses?.length>0&&reply.statuses.every(s=>s==='unsupported');
 const honest=!error&&refused&&unchanged&&reply.effects?.length===0&&reply.text?.trim()&&reply.trace?.legacy===false;
 const verdict=honest?'honest':error||reply?.trace?.legacy!==false?'wrong':'needs-review';
 rows.push({readerRouting:reply?.trace?.readerRouting??null,id:row.id,area:row.world,classes:row.classes,text:row.text,verdict,setupComplete,contextInstantiated:setup.counters.seeded>0,setup,readerInvoked:true,unchanged,reason:reply?.trace?.reason??null,reply:reply?.text??null,error,annotation:row.requests});
}
const verdicts=['right','partly','honest','wrong','needs-review'],summary=Object.fromEntries(verdicts.map(v=>[v,rows.filter(r=>r.verdict===v).length]));
const declared=JSON.parse(readFileSync('training/eval/functional-matrix/matrix.json','utf8')),areas=Object.keys(tabs),cells={};
for(const name of Object.keys(declared).sort())cells[name]=Object.fromEntries(areas.map(area=>{const selected=rows.filter(r=>r.area===area&&r.classes.includes(name));return [area,{...Object.fromEntries(verdicts.map(v=>[v,selected.filter(r=>r.verdict===v).length])),setupIncomplete:selected.filter(r=>!r.setupComplete).length,total:selected.length}];}));
const scope='Actual sole-reader replay after declared native context creation. Setup uses native make operations and declared setters/defaults, never a reader or invented content/times. Missing capabilities, missing fields, previous-turn context and partial setup exclude a row before reader invocation. Setup calls/receipts/observations remain separate from model effects; no-effect comparison starts after successful setup. Honest counts apply only to eligible rows and do not imply semantic understanding.';
writeFileSync('training/results/new-engine-functional.json',JSON.stringify({source:{path,sha256:createHash('sha256').update(raw).digest('hex')},scope,summary,setupSummary:{eligible:rows.filter(r=>r.setupComplete).length,excluded:rows.filter(r=>!r.setupComplete).length,calls:rows.reduce((n,r)=>n+r.setup.counters.calls,0),seeded:rows.reduce((n,r)=>n+r.setup.counters.seeded,0),partial:rows.filter(r=>r.setup.partial).length,failuresByReason:rows.reduce((out,r)=>{for(const [reason,n]of Object.entries(r.setup.counters.failuresByReason))out[reason]=(out[reason]??0)+n;return out;},{})},cells,rows},null,2)+'\n');
const table='| Class | '+areas.join(' | ')+' |\n|---|'+areas.map(()=>'---').join('|')+'|\n'+Object.entries(cells).map(([name,cell])=>'| '+name+' | '+areas.map(area=>verdicts.map(v=>cell[area][v]).join('/')+` (${cell[area].setupIncomplete} incomplete)`).join(' | ')+' |').join('\n');
writeFileSync('training/results/new-engine-functional.md','# Sole-engine functional matrix\n\n'+scope+'\n\nCells: right / partly / honest / wrong / needs-review; excluded setup count in parentheses. Rows may belong to several classes.\n\n'+table+'\n');
console.log(JSON.stringify({summary,rows:rows.length,setupIncomplete:rows.filter(r=>!r.setupComplete).length}));
if(summary.wrong||summary['needs-review'])process.exitCode=1;
