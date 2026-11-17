// One source-selected diagnostic run, not an acceptance suite or a calibration fit.
import {readFileSync,writeFileSync,createReadStream,createWriteStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {createGunzip} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadActualReplayReader} from './lib/actual-reader-provider.mjs';
import {seedFunctionalContext} from './functional-context-seeding.mjs';
import {FUNCTIONAL_NATIVE_BINDINGS} from './lib/functional-native-bindings.mjs';
import {prepareFunctionalFixture} from './lib/functional-fixture-policy.mjs';
import {summarizeReaderStages} from './lib/reader-stage-counts.mjs';
import {NATIVE_AREAS} from '../src/dialog/app-reader-context.mjs';
const [specPath,corpusPath,encodedPath,output]=process.argv.slice(2);
if(!output)throw Error('usage: diagnose-training-pipeline.mjs READER_SPEC SOURCE_TRAIN ENCODED_TRAIN_GZ OUTPUT_PREFIX');
const sha=x=>createHash('sha256').update(x).digest('hex'),tabs={drawing:'draw',diagram:'diagram',document:'editor',calendar:'calendar'};
const input=readFileSync(corpusPath),all=input.toString().trim().split('\n').map(JSON.parse),selected=[];
// Round-robin over annotation versions and request multiplicity; hash order is independent of model output.
for(const area of Object.keys(tabs)){
 const buckets=new Map();
 for(const row of all.filter(r=>r.world===area)){
  const key=(row.source_path.includes('haiku-v1')?'v1':'v2')+':'+Math.min(2,row.annotations.length);
  if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(row);
 }
 for(const bucket of buckets.values())bucket.sort((a,b)=>sha(a.id).localeCompare(sha(b.id)));
 let n=0;while(n<25){let added=false;for(const key of [...buckets.keys()].sort()){const row=buckets.get(key).shift();if(row){selected.push(row);added=true;if(++n===25)break;}}if(!added)break;}
}
if(selected.length!==100||selected.some(r=>r.split!=='train'))throw Error('expected-100-training-source-messages');
const ids=new Set(selected.map(r=>r.id)),labels=new Map(selected.map(r=>[r.id,[]]));
for await(const line of createInterface({input:createReadStream(encodedPath).pipe(createGunzip()),crlfDelay:Infinity})){
 const r=JSON.parse(line),id=r.source_path+':'+r.source_id;if(ids.has(id))labels.get(id).push(r);
}
if([...labels.values()].some(rows=>!rows.length))throw Error('training-source-not-in-actual-encoded-training');
writeFileSync(output+'.selection.json',JSON.stringify({source:corpusPath,sourceSha256:sha(input),encoded:encodedPath,selection:'25 per area, round-robin annotation version and 0/1/multiple requests, source-id hash order; no outcome selection',ids:[...ids]},null,2)+'\n');
const spec=JSON.parse(readFileSync(specPath)),deploy=JSON.parse(readFileSync('docs/webchat/models/sop-bert/deployment.json'));
spec.runtimeIdentity={...deploy.runtimeIdentity,backendSha256:spec.runtimeIdentity.backendSha256};
const actual=await loadActualReplayReader(spec),manifest=JSON.parse(readFileSync(spec.artifactRoot+'/manifest.json')),config=JSON.parse(manifest.configJSON),rows=[],groups=new Map(),started=performance.now();
const sink=createWriteStream(output+'.rows.jsonl',{flags:'wx'});
const group=(reason,row,detail)=>{let g=groups.get(reason);if(!g){g={cause:reason,rows:0,examples:[]};groups.set(reason,g);}g.rows++;if(g.examples.length<3)g.examples.push({id:row.id,text:row.source.text,detail});};
try{for(const [index,row]of selected.entries()){
 const t=performance.now(),tab=tabs[row.world],area=NATIVE_AREAS[tab],state={};
 // Each native host supplies its own defaults. Its public snapshot carries the actual native state.
 const defaults=row.world==='drawing'?(await import('../worlds/art.draw/declared-host.mjs')).initialDrawingState():row.world==='diagram'?(await import('../worlds/diagram.sketch/declared-host.mjs')).initialDiagramState():row.world==='document'?(await import('../worlds/docs.editor/declared-host.mjs')).initialDocumentState():{people:[],rooms:[],meetings:[]};
 state[area.world]=defaults;state['ui.shell']={activeTab:tab};
 const host=await area.create({state:state[area.world],instanceId:'diagnostic-'+index}),fixture=prepareFunctionalFixture(row.world,row.context??{}),setup=await seedFunctionalContext({context:fixture.context,host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS[row.world],invocationPrefix:'training-'+index});
 const before=JSON.stringify(state),beforeObjects=host.observe().objects,session={isession:{state},newEngineJournal:[]};
 let measured,error;try{measured=await actual.run(session,row.source.text,{area:row.world,host,previous:row.context?.previous??null});}catch(e){error=String(e.message);}
 const reply=measured?.reply,measurement=measured?.measurement,stages=summarizeReaderStages(measurement,config),reasons=new Map(),add=(name,detail)=>{if(!reasons.has(name))reasons.set(name,[]);if(reasons.get(name).length<8)reasons.get(name).push(detail);};
 const gold=labels.get(row.id).sort((a,b)=>a.requestIndex-b.requestIndex),reads=(measurement?.diagnostics??[]).filter(e=>e.component==='key-reader');
 if(!setup.ok)add('context: training objects cannot all be instantiated',setup.failures);
 if(fixture.limitations.length)add('context: previous turn is text only, not an executed history',fixture.limitations);
 if(error)add('runtime: exception',error);
 const expectedCount=row.annotations.length;
 if(stages.cutter.spanCount!==expectedCount)add('model: request segmentation differs from training',{expected:expectedCount,actual:stages.cutter.spanCount});
 const headMismatches=[];let headCompared=0;
 for(const [ri,trained]of gold.entries()){
  if(trained.diagnostics?.some(d=>d.reason==='v1-target-type-unknown-masked'))add('training: target family was masked as unknown',{request:ri});
  const read=reads[ri]?.result;if(!read)continue;
  for(const key of trained.coveredKeys??[]){
   if(config.registry[key]?.role!=='global'||!Array.isArray(config.banks[key]))continue;
   const pick=read.auxiliary?.selectedLogits?.find(s=>s.key===key&&s.query===0);if(!pick)continue;
   const expected=trained.globals[key],actualClass=config.banks[key][pick.index];headCompared++;
   if(expected?actualClass?.state!=='value'||JSON.stringify(actualClass.value)!==JSON.stringify(expected.value):actualClass?.state!=='absent')headMismatches.push({request:ri,key,expected:expected?.value??'<absent>',actual:actualClass});
  }
 }
 if(headMismatches.length)add('model: supervised categorical heads differ from training',headMismatches.slice(0,8));
 for(const issue of stages.reasons){
  const name=issue.reason;
  if(issue.stage==='pipeline'&&['provider-unresolved','incomplete-provider-coverage','incomplete-request-cut'].includes(name))continue;
  const family=issue.stage==='key-reader'?'reader output':issue.stage==='cutter'?'cutter':issue.stage==='packet-adapter'?'packet conversion':'binding / graph conversion';
  add(family+': '+name,{key:issue.key,path:issue.path,underlying:issue.underlying});
 }
 const operations=host.bindings(),expectedActs=row.annotations.map(a=>a.act??a.answers?.act).filter(Boolean),effectOps=(reply?.effects??[]).map(e=>operations.find(op=>op.id===e.operation)),effectActs=effectOps.map(op=>op?.act??'<unknown>');
 const changed=JSON.stringify(session.isession.state)!==before,after=(await area.create({state:session.isession.state[area.world],instanceId:'after-'+index})).observe(),created=after.objects.filter(o=>!beforeObjects.some(b=>b.id===o.id));
 const wantsEffect=row.annotations.some(a=>(a.mood??a.answers?.mood)==='do'&&!a.negated&&!a.answers?.negated);
 if(wantsEffect&&!changed)add('execution: action requested but no state change',{reply:reply?.text,reason:reply?.trace?.reason,routing:reply?.trace?.readerRouting?.reason});
 if(effectActs.some(act=>!expectedActs.includes(act)))add('effect: observed action differs from annotated action',{expectedActs,effectActs});
 const expectedKinds=row.annotations.filter(a=>(a.act??a.answers?.act)==='make').map(a=>a.target?.kind??a.answers?.kind).filter(k=>typeof k==='string');
 const nativeKinds=new Set(operations.flatMap(op=>op.params.kind?.enum??[]));
 if(created.length&&expectedKinds.length&&expectedKinds.every(k=>nativeKinds.has(k))&&created.some(o=>!expectedKinds.includes(o.kind)))add('effect: created native kind differs from annotation',{expectedKinds,actualKinds:created.map(o=>o.kind)});
 if(reply?.trace?.partial)add('execution: only part of the request applied',reply.trace.uncertainty);
 const route=reply?.trace?.readerRouting;
 if(route?.model?.eligible===false)add('admission / routing: proposal not executable',{reason:route.reason,score:route.admission?.score});
 const record={id:row.id,area:row.world,text:row.source.text,sourcePath:row.source_path,trainingSamples:gold.length,expectedRequests:expectedCount,readerInvoked:!!measurement,setupComplete:setup.ok,setupFailures:setup.failures,defaulted:fixture.defaulted,headCompared,headMismatches,stages,expectedActs,effectActs,changed,createdKinds:created.map(o=>o.kind),reply:reply?.text,causes:[...reasons].map(([cause,detail])=>({cause,detail})),seconds:(performance.now()-t)/1000,semanticVerdict:changed?'effect-observed-not-full-intent-verified':wantsEffect?'no-requested-effect':'no-action-requested'};
 rows.push(record);sink.write(JSON.stringify(record)+'\n');for(const [reason,detail]of reasons)group(reason,row,detail);
 if((index+1)%10===0)console.log(JSON.stringify({completed:index+1,total:selected.length,seconds:Math.round((performance.now()-started)/1000),changed:rows.filter(r=>r.changed).length}));
}}finally{await new Promise(resolve=>sink.end(resolve));}
const seconds=(performance.now()-started)/1000,summary={format:'psys2.training-pipeline-diagnosis/1',complete:true,model:spec.manifestSha256,epoch:manifest.selectedEpoch,messages:rows.length,trainingSamples:rows.reduce((n,r)=>n+r.trainingSamples,0),seconds,meanSeconds:seconds/rows.length,readerInvoked:rows.filter(r=>r.readerInvoked).length,changed:rows.filter(r=>r.changed).length,setupComplete:rows.filter(r=>r.setupComplete).length,categoricalHeadMismatchRows:rows.filter(r=>r.headMismatches.length).length,groups:[...groups.values()].sort((a,b)=>b.rows-a.rows),scope:'100 preselected actual training messages through installed q8 model, real native observed context and normal routing/execution. Setup failures are retained and still inferred, never excluded. Model-vs-training differences under altered context are diagnostics, not a pure training accuracy estimate. Effects are observed, not automatically semantic successes. No fixes applied during the run.'};
writeFileSync(output+'.summary.json',JSON.stringify(summary,null,2)+'\n');
const esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
writeFileSync(output+'.md','# Training pipeline diagnosis\n\n'+summary.scope+'\n\n'+JSON.stringify(Object.fromEntries(Object.entries(summary).filter(([k])=>!['groups','scope','format'].includes(k))),null,2)+'\n\n| Cause (overlapping) | Messages | Example |\n|---|---:|---|\n'+summary.groups.map(g=>'| '+esc(g.cause)+' | '+g.rows+' | '+esc(g.examples[0]?.text??'')+' |').join('\n')+'\n');
console.log(JSON.stringify({complete:true,messages:rows.length,seconds,meanSeconds:summary.meanSeconds,changed:summary.changed,setupComplete:summary.setupComplete,groups:summary.groups.map(({cause,rows})=>({cause,rows}))}));
