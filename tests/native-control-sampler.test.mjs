import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleNativeControl} from '../src/dialog/native-control-sampler.mjs';
import {createDrawingArea,emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {createDiagramArea,emptyDiagramState} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {createCalendarArea,emptyCalendarArea} from '../worlds/time.calendar/sop-calendar.mjs';
import {createDocumentArea,emptyDocumentArea} from '../worlds/docs.editor/sop-document.mjs';
import {createAvatarArea,emptyAvatarState} from '../worlds/ui.avatar/sop-avatar.mjs';
import {createNativeToolHost,nativeToken} from '../worlds/native-tool-host.mjs';
const randomSource=()=>{let seed=713;return ()=>((seed=(seed*16807)%2147483647)-1)/2147483646;};
const invoke=(host,p)=>invokeToolCommand(host,{invocation:crypto.randomUUID(),expectedVersion:host.observe().version,...p});
for(const [name,initial,create] of [
 ['Drawing',emptyDrawingState,createDrawingArea],['Diagram',emptyDiagramState,createDiagramArea],['Calendar',emptyCalendarArea,createCalendarArea],['Documents',emptyDocumentArea,createDocumentArea],['Avatar',emptyAvatarState,createAvatarArea],
])test(name+' dice samples real changing declared native actions on isolated clones',async()=>{
 const state=initial(),factory=({state})=>create({state,instanceId:'sample-'+name}),host=await factory({state}),random=randomSource();
 for(let n=0;n<5;n++){
  const baseline=structuredClone(state),version=host.observe().version,proposal=await sampleNativeControl({host,createHost:factory,state,random});
  assert.ok(proposal,name+' needs a real candidate');assert.deepEqual(state,baseline,'sampling does not mutate live state');assert.equal(host.observe().version,version);
  assert.ok(host.bindings().find(o=>o.id===proposal.operation).sample);assert.equal(invoke(host,proposal).status,'changed');
 }
});

test('an existing document is never replaced or cleared by dice',async()=>{
 const state=emptyDocumentArea(),factory=({state})=>createDocumentArea({state,instanceId:'preserved'}),host=await factory({state});
 invoke(host,{operation:'document.write',args:{title:'My work',blocks:[{kind:'paragraph',text:'Keep this exact content'}]}});
 const value=(object,key)=>object?.inputs.find(i=>i.key===key)?.values[0],observed=()=>host.observe().objects;
 const text=observed().find(o=>o.sourceType==='docs.editor.text'&&value(o,'text')==='"Keep this exact content"'),document=observed().find(o=>o.sourceType==='docs.editor.document'),random=randomSource();
 assert.ok(text);assert.equal(value(document,'title'),'"My work"');
 for(let n=0;n<12;n++){const proposal=await sampleNativeControl({host,createHost:factory,state,random});assert.ok(proposal);assert.notEqual(proposal.operation,'document.write');assert.equal(invoke(host,proposal).status,'changed');
  assert.ok(observed().some(o=>o.sourceType==='docs.editor.text'&&o.in===text.in&&value(o,'text')==='"Keep this exact content"'));assert.equal(value(observed().find(o=>o.id===document.id),'title'),'"My work"');}
});

const synthetic=({state,refuse=false,hidden=false})=>createNativeToolHost({state,instanceId:'unfamiliar',scope:'toy',operations:[{id:'crate.tint',act:'change',on:'example.crate',params:{id:{type:'string',required:true},tint:{type:'string',required:true,enum:['red','blue']}},sample:[{args:{id:{ref:{on:'example.crate'}},tint:{enum:true}}}]}],handlers:{'crate.tint':(ctx,a)=>{if(refuse)return {status:'missing',code:'policy-denied'};if(hidden)ctx.state.hidden++;else ctx.state.tint=a.tint;return {status:'supported',changed:['box']};}},view:s=>[{id:'box',kind:'crate',sourceType:'example.crate',inputs:[{key:'tint',binding:'crate.tint',values:[nativeToken(s.tint)]}]}]});
test('an unfamiliar world works from declarations and actual observations alone',async()=>{
 const state={tint:'red',hidden:0},factory=({state})=>synthetic({state}),host=factory({state});
 const proposal=await sampleNativeControl({host,createHost:factory,state,random:()=>.9});assert.deepEqual(proposal,{operation:'crate.tint',args:{id:'box',tint:'blue'}});assert.equal(state.tint,'red');
});
test('refused and merely hidden state changes produce no proposed success within bounded attempts',async()=>{
 for(const mode of ['refuse','hidden']){const state={tint:'red',hidden:0};let trials=0;const factory=({state})=>{trials++;return synthetic({state,[mode]:true});},host=synthetic({state});assert.equal(await sampleNativeControl({host,createHost:factory,state,random:()=>.9}),null);assert.equal(trials,48);assert.deepEqual(state,{tint:'red',hidden:0});}
});
