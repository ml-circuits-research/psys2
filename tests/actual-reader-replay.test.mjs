import {readReaderSource} from '../src/dialog/reader-source.mjs';
import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {observedReaderContext} from '../scripts/lib/reader-context-profile.mjs';
import {runtimeTreeIdentity,loadActualReplayReader} from '../scripts/lib/actual-reader-provider.mjs';
import {createDrawingArea,emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
test('reader context is actual native observation with declared display labels and sent history',async()=>{
 const host=await createDrawingArea({state:emptyDrawingState(),instanceId:'context-fixture'});
 const before=observedReaderContext('drawing',host.observe());assert.deepEqual(before.context.existing,[]);
 const kind=host.bindings()[0].params.kind.enum[0];
 const made=invokeToolCommand(host,{invocation:'make',expectedVersion:host.observe().version,operation:'drawing.object.make',args:{kind,name:'Named shape'}});
 assert.notEqual(made.status,'refused');
 const context=observedReaderContext('drawing',host.observe(),'Actual previous message');
 assert.equal(context.context.existing[0].name,'Named shape');assert.equal(context.context.existing[0].kind,kind);
 assert.equal(context.context.previous,'Actual previous message');assert.equal(context.context.observation,undefined);assert.equal(context.context.existing[0].native,undefined);assert.ok(host.observe().objects[0].source);
 assert.equal(context.context.existing[0].type,undefined);assert.equal(context.context.requests,undefined);
});
test('partial, ambiguous and malformed observed identity cannot become complete model context',()=>{
 const base={instanceId:'i',scope:'all',version:'0',complete:true,objects:[]};
 assert.throws(()=>observedReaderContext('drawing',{...base,complete:false}),/incomplete/);
 const o={id:'a',source:'a@1',sourceType:'art.draw.object',kind:'ellipse',version:'0',inputs:[{binding:'drawing.object.name',values:['"x"']},{binding:'drawing.object.name',values:['"y"']}]};
 assert.throws(()=>observedReaderContext('drawing',{...base,objects:[o]}),/ambiguous/);
 assert.throws(()=>observedReaderContext('drawing',{...base,objects:[{...o,version:undefined}]}));
});
test('runtime identity covers actual files and refuses unverified replay bootstrap',async()=>{
 const dir=await mkdtemp(new URL('../.test-reader-runtime-',import.meta.url).pathname);
 try{await mkdir(join(dir,'pkg'));await writeFile(join(dir,'pkg','code.mjs'),'export default 1;');
  const first=await runtimeTreeIdentity(dir);assert.equal(first.files,1);
  await writeFile(join(dir,'pkg','code.mjs'),'export default 2;');assert.notEqual((await runtimeTreeIdentity(dir)).sha256,first.sha256);
  await symlink('/etc/passwd',join(dir,'escape'));await assert.rejects(runtimeTreeIdentity(dir),/symlink/);
  await assert.rejects(loadActualReplayReader({}),/invalid-replay-reader-spec/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('measurement host supplies observed context, captures proposal and removes/restores admission',async()=>{
 const {createHash}=await import('node:crypto'),digest=x=>createHash('sha256').update(x).digest('hex');
 const dir=await mkdtemp(new URL('../.test-reader-host-',import.meta.url).pathname);
 try{
  const runtime=join(dir,'runtime'),artifacts=join(dir,'artifacts');await mkdir(runtime);await mkdir(artifacts);
  await writeFile(join(runtime,'ort.mjs'),'export const InferenceSession={}; export class Tensor {}');
  await writeFile(join(runtime,'tokenizer.mjs'),'export class BertTokenizer {}');
  await writeFile(join(artifacts,'manifest.json'),'{}');const tc=JSON.stringify({tokenizer_class:'BertTokenizer'});await writeFile(join(artifacts,'tokenizer_config.json'),tc);
  const tree=await runtimeTreeIdentity(runtime),backendIdentity={format:'psys2.node-reader-backend/1',runtimeTreeSha256:tree.sha256,node:process.version,platform:process.platform,arch:process.arch,ortModule:'ort.mjs',transformersModule:'tokenizer.mjs',options:{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1}};
  let seen,admissionDuring;
  const admission={untrusted:'must not execute'},session={engine:{requestReaderAdmission:admission},isession:{state:{'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}}},newEngineJournal:[]};
  const host=await createDrawingArea({state:session.isession.state['art.draw'],instanceId:'actual-context-fixture'});
  const reader=await loadActualReplayReader({format:'psys2.actual-reader-replay/1',artifactRoot:artifacts,manifestSha256:digest('{}'),runtimeRoot:runtime,runtimeTreeSha256:tree.sha256,ortModule:'ort.mjs',transformersModule:'tokenizer.mjs',runtimeIdentity:{backendSha256:digest(JSON.stringify(backendIdentity))},tokenizerConfig:{path:'tokenizer_config.json',sha256:digest(tc)}},{factory:async({getContext})=>({verified:{fixture:true},provider:{async propose(sourceSop){const text=readReaderSource(sourceSop);seen={text,...getContext()};admissionDuring=session.engine.requestReaderAdmission;return {coverage:{complete:false},candidates:[],failures:[{reason:'fixture-no-model'}]};}}})});
  const result=await reader.run(session,'A source message',{area:'drawing',host,previous:'Actual history'});
  assert.deepEqual(seen,{text:'A source message',area:'drawing',context:{existing:[],previous:'Actual history'}});
  assert.equal(admissionDuring,undefined);assert.equal(session.engine.requestReaderAdmission,admission);assert.equal(session.engine.requestReader,undefined);
  assert.equal(result.measurement.semanticCorrectness,null);assert.equal(result.measurement.observation.instanceId,'actual-context-fixture');assert.equal(result.measurement.proposal.failures[0].reason,'fixture-no-model');
  await assert.rejects(reader.probe('source',{area:'drawing',context:{},requests:[]}),/invalid-source-context/);
  const probe=await reader.probe('source',{area:'drawing',context:{existing:[],previous:null}});assert.equal(probe.semanticCorrectness,null);assert.equal(probe.executionEligible,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('explicit BERT role adapter accepts declared roles and rejects vocabulary/processor/config conflicts',async()=>{
 const {bertRuntimeConfiguration}=await import('../scripts/lib/actual-reader-provider.mjs');
 const names=['[PAD]','[UNK]','[CLS]','[SEP]','[MASK]'],profile={added_tokens:names.map((content,id)=>({content,id,special:true})),model:{unk_token:'[UNK]',vocab:Object.fromEntries(names.map((n,i)=>[n,i]))},post_processor:{special_tokens:Object.fromEntries(['[CLS]','[SEP]'].map(content=>[content,{ids:[names.indexOf(content)],tokens:[content]}]))}};
 assert.equal(bertRuntimeConfiguration(profile,{}).pad_token,'[PAD]');
 assert.throws(()=>bertRuntimeConfiguration(profile,{pad_token:'different'}),/conflicting/);
 for(const mutation of [p=>p.added_tokens.push(p.added_tokens[0]),p=>p.model.vocab['[PAD]']=99,p=>p.model.unk_token='other',p=>p.post_processor.special_tokens['[CLS]'].ids=[99]]){const p=structuredClone(profile);mutation(p);assert.throws(()=>bertRuntimeConfiguration(p,{}));}
});
