// Development-only functional matrix through the sole application reader/coordinator.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {routeNewEngine as runNewEngine} from '../src/dialog/reader-routing.mjs';
import {createDrawingArea,emptyDrawingState as drawing} from '../worlds/art.draw/sop-drawing.mjs';
import {createDiagramArea,emptyDiagramState as diagram} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {createDocumentArea,emptyDocumentArea as document} from '../worlds/docs.editor/sop-document.mjs';
import {createCalendarArea,emptyCalendarArea as calendar} from '../worlds/time.calendar/sop-calendar.mjs';
import {initialChartState as charts} from '../worlds/data.charts/declared-host.mjs';
import {seedFunctionalContext} from './functional-context-seeding.mjs';
import {FUNCTIONAL_NATIVE_BINDINGS} from './lib/functional-native-bindings.mjs';
import {prepareFunctionalFixture} from './lib/functional-fixture-policy.mjs';
import {loadActualReplayReader} from './lib/actual-reader-provider.mjs';
import {summarizeReaderStages,rankLeafReasons} from './lib/reader-stage-counts.mjs';
const args=process.argv.slice(2),specIndex=args.indexOf('--reader-spec'),outIndex=args.indexOf('--output-prefix'),browserMode=args.includes('--browser-route');
if(browserMode&&specIndex>=0)throw Error('one-reader-runtime-only');
if((specIndex>=0||browserMode)&&outIndex<0)throw Error('actual-reader-requires-separate-output-prefix');
const actual=specIndex<0?null:await loadActualReplayReader(JSON.parse(readFileSync(args[specIndex+1],'utf8'))),output=outIndex<0?'training/results/new-engine-functional':args[outIndex+1];
const browser=browserMode?await (await import('./lib/browser-reader-route.mjs')).openBrowserReaderRoute():null;
const config=actual?JSON.parse(JSON.parse(readFileSync(JSON.parse(readFileSync(args[specIndex+1])).artifactRoot+'/manifest.json')).configJSON):null;
const path='training/eval/functional-matrix/dev-rows.jsonl',raw=readFileSync(path,'utf8'),input=raw.trim().split('\n').map(JSON.parse);
const tabs={drawing:'draw',diagram:'diagram',document:'editor',calendar:'calendar'},rows=[];
for(const row of input){
 const state={'art.draw':drawing(),'diagram.sketch':diagram(),'docs.editor':document(),'data.charts':charts(),'time.calendar':calendar(),'ui.shell':{activeTab:tabs[row.world]}};
 const instanceId=`functional-setup-${createHash('sha256').update(row.id).digest('hex').slice(0,24)}`;
 const host=row.world==='drawing'?await createDrawingArea({state:state['art.draw'],instanceId}):row.world==='diagram'?await createDiagramArea({state:state['diagram.sketch'],instanceId}):row.world==='document'?await createDocumentArea({state:state['docs.editor'],instanceId}):row.world==='calendar'?await createCalendarArea({state:state['time.calendar'],instanceId}):null;
 const fixture=prepareFunctionalFixture(row.world,row.context??{});
 const setup=await seedFunctionalContext({context:fixture.context,host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS[row.world]??[],invocationPrefix:instanceId});
 const setupComplete=setup.ok;
 // Retain setup correlation without duplicating each full native state per receipt.
 setup.receipts=setup.receipts.map(r=>({invocation:r.invocation,operation:r.operation,status:r.status,reason:r.reason,code:r.code,changed:r.changed,replayed:r.replayed}));
 if(setup.observation)setup.observation={instanceId:setup.observation.instanceId,version:setup.observation.version,scope:setup.observation.scope,complete:setup.observation.complete,objects:setup.observation.objects.map(o=>({id:o.id,source:o.source,sourceType:o.sourceType,version:o.version,kind:o.kind}))};
 // Failed/partial setup is not an application trial and cannot earn an honest verdict.
 if(!setupComplete){rows.push({id:row.id,area:row.world,classes:row.classes,text:row.text,verdict:'excluded-setup',setupComplete:false,semanticallyLimited:fixture.semanticallyLimited,fixture,contextInstantiated:setup.counters.seeded>0,setup,readerInvoked:false,annotation:row.requests});continue;}
 const session={isession:{state},newEngineJournal:[]},before=JSON.stringify(state);
 let reply,error,readerMeasurement,browserUnchanged;
 try{if(browser){const measured=await browser.send({text:row.text,state,meta:{readerPrevious:null}});reply=measured.reply;browserUnchanged=measured.unchanged??JSON.stringify(measured.before)===JSON.stringify(measured.state);readerMeasurement={browser:true,readerHost:reply?.trace?.readerHost??null};if(measured.state)session.isession.state=measured.state;}else if(actual){const measured=await actual.run(session,row.text,{area:row.world,host});reply=measured.reply;readerMeasurement=measured.measurement;}else reply=await runNewEngine(session,row.text,{language:'en'});}catch(e){error=String(e?.message??e);}
 const unchanged=browser?browserUnchanged:before===JSON.stringify(session.isession.state),refused=reply?.statuses?.length>0&&reply.statuses.every(s=>s==='unsupported');
 const honest=!error&&refused&&unchanged&&reply.effects?.length===0&&reply.text?.trim()&&reply.trace?.legacy===false;
 const verdict=honest?'honest':error||reply?.trace?.legacy!==false?'wrong':'needs-review';
 rows.push({...(actual?{stages:summarizeReaderStages(readerMeasurement,config)}:{}),acted:reply?.statuses?.includes('supported')===true&&(!unchanged||reply?.trace?.assessment==='unchanged'),readerMeasurement,readerRouting:reply?.trace?.readerRouting??null,id:row.id,area:row.world,classes:row.classes,text:row.text,verdict,setupComplete,semanticallyLimited:fixture.semanticallyLimited,fixture,contextInstantiated:setup.counters.seeded>0,setup,readerInvoked:true,unchanged,reason:reply?.trace?.reason??null,reply:reply?.text??null,error,annotation:row.requests});
}
const verdicts=['right','partly','honest','wrong','needs-review'],summary=Object.fromEntries(verdicts.map(v=>[v,rows.filter(r=>r.verdict===v).length]));
const declared=JSON.parse(readFileSync('training/eval/functional-matrix/matrix.json','utf8')),areas=Object.keys(tabs),cells={};
for(const name of Object.keys(declared).sort())cells[name]=Object.fromEntries(areas.map(area=>{const selected=rows.filter(r=>r.area===area&&r.classes.includes(name));const eligible=selected.filter(r=>r.readerInvoked),acted=eligible.filter(r=>r.acted),unreviewed=acted.filter(r=>!['right','partly','wrong'].includes(r.verdict));return [area,{invoked:eligible.length,acted:acted.length,coverage:eligible.length?acted.length/eligible.length:null,unreviewedActed:unreviewed.length,errorRate:acted.length&&!unreviewed.length?acted.filter(r=>r.verdict==='wrong').length/acted.length:null,...Object.fromEntries(verdicts.map(v=>[v,selected.filter(r=>r.verdict===v).length])),setupIncomplete:selected.filter(r=>!r.setupComplete).length,total:selected.length}];}));
const scope='Actual sole-reader replay after declared native context creation. Setup uses native make operations and declared setters/defaults, never a reader. Missing Calendar times/resources and Document content use the explicitly versioned evaluation baseline, not inferred world truth. Missing capabilities, missing fields, partial setup exclude a row before reader invocation. Setup calls/receipts/observations remain separate from model effects; no-effect comparison starts after successful setup. Unreplayed previous context and defaulted values are separately marked semantically limited; they cannot justify a correct semantic verdict. Honest counts apply only to baseline-eligible rows and do not imply semantic understanding.';
const stageSummary=actual?{cutterComplete:rows.filter(r=>r.stages?.cutter.complete).length,rawComplete:rows.filter(r=>r.stages?.raw.complete).length,bound:rows.filter(r=>r.stages?.pipeline.nonemptyGraph).length,executed:rows.filter(r=>r.acted).length,reasons:rankLeafReasons(rows)}:null;
writeFileSync(output+'.json',JSON.stringify({stageSummary,reader:browser?.info??actual?.verified,source:{path,sha256:createHash('sha256').update(raw).digest('hex')},scope,summary,setupSummary:{eligible:rows.filter(r=>r.setupComplete).length,excluded:rows.filter(r=>!r.setupComplete).length,calls:rows.reduce((n,r)=>n+r.setup.counters.calls,0),seeded:rows.reduce((n,r)=>n+r.setup.counters.seeded,0),partial:rows.filter(r=>r.setup.partial).length,defaulted:rows.filter(r=>r.fixture.defaulted.length).length,semanticallyLimited:rows.filter(r=>r.semanticallyLimited).length,areas:Object.fromEntries(areas.map(area=>{const subset=rows.filter(r=>r.area===area);return [area,{total:subset.length,eligible:subset.filter(r=>r.setupComplete).length,excluded:subset.filter(r=>!r.setupComplete).length,defaulted:subset.filter(r=>r.fixture.defaulted.length).length,semanticallyLimited:subset.filter(r=>r.semanticallyLimited).length}];})),failuresByReason:rows.reduce((out,r)=>{for(const [reason,n]of Object.entries(r.setup.counters.failuresByReason))out[reason]=(out[reason]??0)+n;return out;},{})},cells,rows},null,2)+'\n');
const table='| Class | '+areas.join(' | ')+' |\n|---|'+areas.map(()=>'---').join('|')+'|\n'+Object.entries(cells).map(([name,cell])=>'| '+name+' | '+areas.map(area=>verdicts.map(v=>cell[area][v]).join('/')+` (${cell[area].setupIncomplete} incomplete)`).join(' | ')+' |').join('\n');
const coverageTable='| Class | '+areas.join(' | ')+' |\n|---|'+areas.map(()=>'---').join('|')+'|\n'+Object.entries(cells).map(([name,cell])=>'| '+name+' | '+areas.map(area=>{const c=cell[area];return `${c.acted}/${c.invoked} (${c.coverage===null?'n/a':(100*c.coverage).toFixed(1)+'%'}); error ${c.errorRate===null?'unreviewed / no actions':(100*c.errorRate).toFixed(1)+'%'}`;}).join(' | ')+' |').join('\n');
writeFileSync(output+'.md','# Sole-engine functional matrix\n\n'+scope+'\n\nCells: right / partly / honest / wrong / needs-review; excluded setup count in parentheses. Rows may belong to several classes.\n\n'+table+'\n\nCoverage and error among acted rows. Unreviewed effects are not assigned a zero error rate.\n\n'+coverageTable+'\n');
console.log(JSON.stringify({summary,rows:rows.length,setupIncomplete:rows.filter(r=>!r.setupComplete).length}));
if(browser)await browser.close();
if(summary.wrong||summary['needs-review'])process.exitCode=1;
