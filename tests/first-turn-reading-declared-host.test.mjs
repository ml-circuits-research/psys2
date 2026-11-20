// The first turn of a session: there is no previous message, but the observed objects are still a prior for the
// reader. When the reading conditioned on them is unusable, the same text read without them is the next
// hypothesis, exactly as on a later turn (where the previous message is dropped first). Before this, the
// re-reading hypotheses were only recorded when a previous message existed, so a sentence that was read on the
// second turn (through the literal re-reading) failed as the first turn of a new session.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {writeReaderSource} from '../src/dialog/reader-source.mjs';
import {createKeyReaderPipeline} from '../src/dialog/key-reader-pipeline.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {drawingObjects} from './drawing-state.mjs';

// The toy pipeline of tests/key-reader-pipeline.test.mjs: one cut, one request with exact ranges.
const model={sha256:'a'.repeat(64),tokenizerSha256:'b'.repeat(64),codecSha256:'c'.repeat(64),decoderVersion:1},source={sourceWorld:'fixture',moduleVersion:'1',sourceSnapshotSHA:'d'.repeat(64)};
const toyBindings={format:'sop.structural-bindings/1',kinds:[{area:'toy',type:'item',lemma:'widget',canonical:'fixture.widget',sourceWire:'fixture.widget',...source}],properties:[{area:'toy',key:'item.tint',canonical:'tint',valueKind:'string',sourceWire:'fixture.tint',...source}],units:[]};
const bindingsJSON=JSON.stringify(toyBindings),bindingsSha256=createHash('sha256').update(bindingsJSON).digest('hex');
const coverage={complete:true,truncated:false};
const toyRequest=()=>({trigger:'set',act:'change',mood:'do',target:{type:'item',mode:'existing',kind:'widget',kind_span:'widget'},constraints:[{key:'item.tint',value:'🟦',value_span:'🟦',operator:'eq',phase:'result',character:'requirement',polarity:'positive'}]});
const toyRanges=[{path:['trigger'],range:[0,3]},{path:['target','kind_span'],range:[4,10]},{path:['constraints','0','value_span'],range:[11,12]}];
async function toyPipeline(context){
 const calls=[];
 const cutter={async cut(text){calls.push(['cut',text]);return {source:{text,unit:'unicode-scalar'},spans:[[0,12]],coverage:{...coverage},unresolved:[],model:{...model}};}};
 const reader={async read(text,readContext){calls.push(['read',text,readContext]);return {source:{text,unit:'unicode-scalar'},request:toyRequest(),ranges:structuredClone(toyRanges),coverage:{...coverage},unresolved:[],model:{...model}};}};
 const pipeline=await createKeyReaderPipeline({cutter,reader,getContext:()=>({area:'toy',context}),cutterModel:model,readerModel:model,bindingsJSON,bindingsSha256});
 return {pipeline,calls};
}

test('a first turn with observed objects keeps the literal re-reading; the independent one would repeat the primary',async()=>{
 const existing=[{kind:'document'}];
 const {pipeline,calls}=await toyPipeline({existing,previous:null});
 const source=writeReaderSource('set widget 🟦');
 await pipeline.propose(source);
 assert.equal(await pipeline.proposeIndependent(source),null,'no previous message: the same reading is not made twice');
 const literal=await pipeline.proposeLiteral(source);
 assert.ok(literal,'the observed objects can be dropped on a first turn');
 assert.deepEqual(calls.at(-1),['read','set widget 🟦',{area:'toy',context:{existing:[],previous:null}}]);
 assert.equal(calls.filter(call=>call[0]==='read').length,2);
});

test('with no prior at all there is nothing to re-read without',async()=>{
 const {pipeline,calls}=await toyPipeline({existing:[],previous:null});
 const source=writeReaderSource('set widget 🟦');
 await pipeline.propose(source);
 assert.equal(await pipeline.proposeIndependent(source),null);
 assert.equal(await pipeline.proposeLiteral(source),null);
 assert.equal(calls.filter(call=>call[0]==='read').length,1);
});

test('a later turn with a previous message but no objects does not repeat the independent reading as a literal one',async()=>{
 const {pipeline,calls}=await toyPipeline({existing:[],previous:'earlier'});
 const source=writeReaderSource('set widget 🟦');
 await pipeline.propose(source);
 assert.ok(await pipeline.proposeIndependent(source));
 assert.equal(await pipeline.proposeLiteral(source),null);
 assert.equal(calls.filter(call=>call[0]==='read').length,2);
});

// The application route over the deployed bindings, as in tests/chat-creation-grounding.test.mjs.
const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindings=JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8'));
const registry=JSON.parse(JSON.parse(readFileSync(new URL(deployment.manifestPath,webchat),'utf8')).configJSON).registry;
const provenance={modelSha256:'a'.repeat(64),decoderVersion:1};
const at=(text,word)=>{const start=text.lastIndexOf(word);return [start,start+word.length];};
function reading(text,target,constraints){
 const trigger=text.split(' ')[0],ranges=[{path:['requests','0','trigger'],range:[0,trigger.length]}];
 if(target.kind_span)ranges.push({path:['requests','0','target','kind_span'],range:at(text,target.kind_span)});
 return {coverage:{complete:false,graphProposal:false,executable:false},candidates:[],failures:[{reason:'incomplete-provider-coverage'}],
  selectionScore:{definition:'psys2.model-minimum/1',value:0.6},
  raw:{source:{text,unit:'unicode-scalar'},requestCount:1,coverage:{complete:false,truncated:false},
   requests:[{span:text,act:'make',trigger,mood:'do',target:{determiner:'indefinite',mode:'new',...target},constraints}],ranges}};
}

test('the first turn of a session is re-read without the observed objects and says only what it dropped',async()=>{
 const text='draw a boat',calls=[];
 const state={'art.draw':emptyDrawingState(),'ui.shell':{activeTab:'draw'}};
 const session={isession:{state},engine:{onWorldActivity:()=>{},requestReader:{provenance:()=>provenance,bindings:()=>bindings,registry:()=>registry,
  // Conditioned on the observed objects, the reading carries a colour this text never states (no source range).
  propose:async()=>{calls.push('contextual');const read=reading(text,{type:'drawn'},[]);read.raw.requests[0].constraints=[{key:'drawn.colour',value:'blue',value_span:'blue',character:'requirement',operator:'eq',phase:'result',polarity:'positive'}];return read;},
  // First turn: no previous message, so the provider has no independent re-reading.
  proposeIndependent:async()=>{calls.push('independent');return null;},
  proposeLiteral:async()=>{calls.push('literal');return reading(text,{type:'drawn',kind:'boat',kind_span:'boat'},[]);},
 }}};
 const reply=await routeNewEngine(session,text,{view:'draw'});
 assert.deepEqual(calls,['contextual','independent','literal']);
 assert.equal(reply.statuses[0],'supported',reply.text);
 assert.deepEqual(drawingObjects(session.isession.state['art.draw']).map(object=>object.kind),['boat']);
 assert.match(reply.text,/without the objects on the page/);
 assert.doesNotMatch(reply.text,/previous one/);
 assert.deepEqual(reply.trace.readerRouting.contextRetry.attempts.map(attempt=>attempt.profile),['literal']);
});
