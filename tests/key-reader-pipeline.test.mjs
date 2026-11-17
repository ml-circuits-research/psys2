import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createKeyReaderPipeline} from '../src/dialog/key-reader-pipeline.mjs';
const model={sha256:'a'.repeat(64),tokenizerSha256:'b'.repeat(64),codecSha256:'c'.repeat(64),decoderVersion:1},source={sourceWorld:'fixture',moduleVersion:'1',sourceSnapshotSHA:'d'.repeat(64)};
const bindings={format:'sop.structural-bindings/1',kinds:[{area:'toy',type:'item',lemma:'widget',canonical:'fixture.widget',sourceWire:'fixture.widget',...source}],properties:[{area:'toy',key:'item.tint',canonical:'tint',valueKind:'string',sourceWire:'fixture.tint',...source}],units:[]};
const bindingsJSON=JSON.stringify(bindings),bindingsSha256=createHash('sha256').update(bindingsJSON).digest('hex');
const coverage={complete:true,truncated:false};
const request=()=>({trigger:'set',act:'change',mood:'do',target:{type:'item',mode:'existing',kind:'widget',kind_span:'widget'},constraints:[{key:'item.tint',value:'🟦',value_span:'🟦',operator:'eq',phase:'result',character:'requirement',polarity:'positive'}]});
const localRanges=[{path:['trigger'],range:[0,3]},{path:['target','kind_span'],range:[4,10]},{path:['constraints','0','value_span'],range:[11,12]}];
const setup=async({spans=[[0,12]],editCut=()=>{},editRead=()=>{},getContext=()=>({area:'toy',context:{native:'actual'}}),...overrides}={})=>{const calls=[];const cutter={async cut(text){calls.push(['cut',text]);const out={source:{text,unit:'unicode-scalar'},spans,coverage:{...coverage},unresolved:[],model:{...model}};editCut(out);return out;}};const reader={async read(text,context){calls.push(['read',text,context]);const out={source:{text,unit:'unicode-scalar'},request:request(),ranges:structuredClone(localRanges),coverage:{...coverage},unresolved:[],model:{...model}};editRead(out);return out;}};const pipeline=await createKeyReaderPipeline({cutter,reader,getContext,cutterModel:model,readerModel:model,bindingsJSON,bindingsSha256,...overrides});return {pipeline,calls};};
test('two-model pipeline receives only source and actual context and retains closed confidence gate',async()=>{
 const {pipeline,calls}=await setup();const out=await pipeline.propose('set widget 🟦');assert.equal(out.candidates.length,1,JSON.stringify(out.failures));assert.equal(out.coverage.executable,false);assert.equal(out.graphConfidence,null);assert.deepEqual(calls,[['cut','set widget 🟦'],['read','set widget 🟦',{area:'toy',context:{native:'actual'}}]]);assert.equal(out.raw.requests[0].span,'set widget 🟦');assert.equal(pipeline.provenance().models.reader.codecSha256,model.codecSha256);
});
test('Unicode adjacent cuts lift every explicit range without inventing dependencies',async()=>{
 const {pipeline}=await setup({spans:[[2,14],[14,26]]});const out=await pipeline.propose('😀 set widget 🟦set widget 🟦');assert.equal(out.raw.requests.length,2);assert.deepEqual(out.raw.ranges.find(r=>r.path.join('/')==='requests/1/constraints/0/value_span').range,[25,26]);assert.deepEqual(out.raw.ranges.find(r=>r.path.join('/')==='requests/0/span').range,[2,14]);assert.equal(out.candidates.length,0);assert.ok(out.failures.some(x=>x.reason==='request-dependencies-not-annotated'));
});
test('invalid or incomplete cutter output never invokes request-local reader',async()=>{
 for(const options of [{spans:[[0,8],[7,12]]},{spans:[[4,12],[0,3]]},{spans:[[0,13]]},{editCut:c=>{c.coverage.complete=false;}},{editCut:c=>{c.unresolved.push({reason:'I-after-O'});}},{editCut:c=>{c.source.text='different';}},{editCut:c=>{c.model.sha256='e'.repeat(64);}}]){const {pipeline,calls}=await setup(options),out=await pipeline.propose('set widget 🟦');assert.equal(out.candidates.length,0);assert.equal(calls.filter(x=>x[0]==='read').length,0);assert.equal(out.coverage.complete,false);}
});
test('unknown fields, overflow, unowned paths and misleading source ranges remain unresolved',async()=>{
 for(const editRead of [r=>{r.request.constraints[0].key='unknown.key';},r=>{r.unresolved.push({reason:'overflow'});},r=>{r.ranges[2].range=[0,3];},r=>{r.ranges.push({path:['missing'],range:[0,3]});},r=>{r.ranges.push(r.ranges[0]);},r=>{r.source.text='other';},r=>{r.request.valueMode='internal';},r=>{r.request.span='short';}]){const {pipeline}=await setup({editRead}),out=await pipeline.propose('set widget 🟦');assert.equal(out.candidates.length,0);assert.equal(out.coverage.complete,false);assert.ok(out.failures.length);}
 const {pipeline}=await setup({getContext:()=>({area:'toy',context:{},annotations:[]})});assert.equal((await pipeline.propose('set widget 🟦')).candidates.length,0);
});
test('no-request, missing models, exact binding hashes and work limits are distinct',async()=>{
 const empty=await setup({spans:[]});const no=await empty.pipeline.propose('hello');assert.equal(no.candidates[0].outcome,'no-request');assert.equal(no.coverage.executable,false);
 const missing=await setup({reader:null});assert.equal((await missing.pipeline.propose('hello')).failures[0].reason,'model-unavailable');
 const small=await setup({budget:1});assert.equal((await small.pipeline.propose('set widget 🟦')).failures[0].reason,'pipeline-budget');
 await assert.rejects(setup({bindingsSha256:'e'.repeat(64)}),/binding-hash/);
});
test('declared request iteration keeps original cuts and refreshes actual context after each yielded request',async()=>{
 let version=0;const {pipeline,calls}=await setup({spans:[[2,14],[14,26]],getContext:()=>({area:'toy',context:{version}})}),sequence=pipeline.proposeRequests('😀 set widget 🟦set widget 🟦');
 const first=(await sequence.next()).value;assert.equal(first.raw.requestCount,1);assert.equal(first.candidates.length,1,JSON.stringify(first.failures));assert.deepEqual(first.composition.range,[2,14]);version=1;
 const second=(await sequence.next()).value;assert.equal(second.candidates.length,1,JSON.stringify(second.failures));assert.deepEqual(second.raw.ranges.find(r=>r.path.join('/')==='requests/0/constraints/0/value_span').range,[25,26]);assert.deepEqual(calls.filter(c=>c[0]==='read').at(-1)[2],{area:'toy',context:{version:1}});assert.equal((await sequence.next()).done,true);assert.equal(calls.filter(c=>c[0]==='cut').length,1);assert.equal(calls.filter(c=>c[0]==='read').length,2,'only the two actually executed request proposals use the reader');
});
