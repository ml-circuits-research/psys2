// Development-only functional matrix through the sole application reader/coordinator.
import {readFileSync,writeFileSync,openSync,writeSync,closeSync,statfsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createDrawingArea,emptyDrawingState as drawing} from '../worlds/art.draw/sop-drawing.mjs';
import {createDiagramArea,emptyDiagramState as diagram} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {createDocumentArea,emptyDocumentArea as document} from '../worlds/docs.editor/sop-document.mjs';
import {createCalendarArea,emptyCalendarArea as calendar} from '../worlds/time.calendar/sop-calendar.mjs';
import {initialChartState as charts} from '../worlds/data.charts/declared-host.mjs';
import {seedFunctionalContext} from './functional-context-seeding.mjs';
import {FUNCTIONAL_NATIVE_BINDINGS} from './lib/functional-native-bindings.mjs';
import {prepareFunctionalFixture} from './lib/functional-fixture-policy.mjs';
import {loadActualReplayReader} from './lib/actual-reader-provider.mjs';
import {summarizeReaderStages,rankStageReasons,rankLeafReasons} from './lib/reader-stage-counts.mjs';
const args=process.argv.slice(2);if(args.length!==2)throw Error('usage: reader-stage-replay.mjs SPEC OUTPUT_PREFIX');
const [specPath,output]=args,specBytes=readFileSync(specPath),spec=JSON.parse(specBytes),baseline=JSON.parse(readFileSync('training/results/browser-reader-functional.json'));
const path='training/eval/functional-matrix/dev-rows.jsonl',source=readFileSync(path),sha=x=>createHash('sha256').update(x).digest('hex');
if(sha(source)!==baseline.source.sha256)throw Error('matrix-source-changed');
const input=source.toString('utf8').trim().split('\n').map(JSON.parse),expected=baseline.rows.filter(r=>r.readerInvoked).map(r=>r.id),prepared=[],tabs={drawing:'draw',diagram:'diagram',document:'editor',calendar:'calendar'};
if(expected.length!==301||new Set(expected).size!==301)throw Error('invalid-frozen-cohort');
for(const row of input){
 const state={'art.draw':drawing(),'diagram.sketch':diagram(),'docs.editor':document(),'data.charts':charts(),'time.calendar':calendar(),'ui.shell':{activeTab:tabs[row.world]}};
 const instanceId=`functional-setup-${createHash('sha256').update(row.id).digest('hex').slice(0,24)}`;
 const host=row.world==='drawing'?await createDrawingArea({state:state['art.draw'],instanceId}):row.world==='diagram'?await createDiagramArea({state:state['diagram.sketch'],instanceId}):row.world==='document'?await createDocumentArea({state:state['docs.editor'],instanceId}):row.world==='calendar'?await createCalendarArea({state:state['time.calendar'],instanceId}):null;
 const fixture=prepareFunctionalFixture(row.world,row.context??{});
 const setup=await seedFunctionalContext({context:fixture.context,host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS[row.world]??[],invocationPrefix:instanceId});

 if(setup.ok)prepared.push({id:row.id,area:row.world,classes:row.classes,text:row.text,state,host,limited:fixture.semanticallyLimited});
}
if(JSON.stringify(prepared.map(r=>r.id))!==JSON.stringify(expected))throw Error('setup-cohort-changed');
const actual=await loadActualReplayReader(spec),manifest=JSON.parse(readFileSync(spec.artifactRoot+'/manifest.json')),config=JSON.parse(manifest.configJSON);
const space=()=>{const s=statfsSync('.');if(s.bavail*s.bsize<48*1024*1024)throw Error('stage-report-storage-reserve');};space();
const fd=openSync(output+'.rows.jsonl','wx'),rows=[];let bytes=0;
try{for(const row of prepared){
 const session={isession:{state:row.state},newEngineJournal:[]},before=JSON.stringify(row.state);let measured,error=null;
 try{measured=await actual.run(session,row.text,{area:row.area,host:row.host});}catch(e){error=String(e?.message??e);}
 const record={id:row.id,area:row.area,classes:row.classes,sourceSha256:sha(row.text),semanticallyLimited:row.limited,stages:summarizeReaderStages(measured?.measurement,config),error,unchanged:JSON.stringify(session.isession.state)===before,routingReason:measured?.reply?.trace?.readerRouting?.reason??null};
 const line=JSON.stringify(record)+'\n';bytes+=Buffer.byteLength(line);if(bytes>16000000)throw Error('compact-output-budget');writeSync(fd,line);rows.push(record);
 if(rows.length%25===0)space();if(rows.length%25===0)console.log(JSON.stringify({completed:rows.length,total:prepared.length,bytes}));
}}finally{closeSync(fd);}
if(sha(readFileSync(path))!==baseline.source.sha256||sha(readFileSync(specPath))!==sha(specBytes))throw Error('input-changed-during-run');
const summary={format:'psys2.reader-stage-replay/1',complete:true,source:{path,sha256:sha(source),rows:input.length},cohort:{count:rows.length,excluded:input.length-rows.length,idsSha256:sha(JSON.stringify(expected)),matchesBrowserEligibleOrder:true},reader:actual.verified,scope:'Actual Node CPU route, same frozen model/cohort/setup; not browser numerical equivalence, semantic accuracy, fullCAL or admission. No annotation answers enter inference. Stage unavailable differs from zero; reason row counts may overlap.',rowsSha256:sha(readFileSync(output+'.rows.jsonl')),bytes,totals:{cutterAvailable:rows.filter(r=>r.stages.cutter.available).length,cutterComplete:rows.filter(r=>r.stages.cutter.complete).length,cutterSpans:rows.reduce((n,r)=>n+(r.stages.cutter.spanCount??0),0),keyRequests:rows.reduce((n,r)=>n+r.stages.requests.length,0),rawAvailable:rows.filter(r=>r.stages.raw.available).length,rawComplete:rows.filter(r=>r.stages.raw.complete).length,emptyReadings:rows.filter(r=>r.stages.pipeline.emptyReading).length,nonemptyGraphs:rows.filter(r=>r.stages.pipeline.nonemptyGraph).length,errors:rows.filter(r=>r.error).length,stateChanges:rows.filter(r=>!r.unchanged).length},reasons:rankStageReasons(rows),underlyingReasons:rankLeafReasons(rows)};
writeFileSync(output+'.summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary.totals));
