import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sampleNativeControl} from '../src/dialog/native-control-sampler.mjs';
import {createDrawingHost,initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {createDiagramHost,initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {createCalendarHost,initialCalendarState} from '../worlds/time.calendar/declared-host.mjs';
import {createDocumentHost,initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {createAvatarHost,initialAvatarState} from '../worlds/ui.avatar/declared-host.mjs';
import {createNativeToolHost,nativeToken} from '../worlds/native-tool-host.mjs';
const randomSource=()=>{let seed=713;return ()=>((seed=(seed*16807)%2147483647)-1)/2147483646;};
const invoke=(host,p)=>host.invoke({invocation:crypto.randomUUID(),expectedVersion:host.observe().version,...p});
for(const [name,initial,create] of [
 ['Drawing',initialDrawingState,createDrawingHost],['Diagram',initialDiagramState,createDiagramHost],['Calendar',initialCalendarState,createCalendarHost],['Documents',initialDocumentState,createDocumentHost],['Avatar',initialAvatarState,createAvatarHost],
])test(name+' dice samples real changing declared native actions on isolated clones',async()=>{
 const state=initial(),factory=({state})=>create({state,instanceId:'sample-'+name}),host=await factory({state}),random=randomSource();
 for(let n=0;n<5;n++){
  const baseline=structuredClone(state),version=host.observe().version,proposal=await sampleNativeControl({host,createHost:factory,state,random});
  assert.ok(proposal,name+' needs a real candidate');assert.deepEqual(state,baseline,'sampling does not mutate live state');assert.equal(host.observe().version,version);
  assert.ok(host.bindings().find(o=>o.id===proposal.operation).sample);assert.equal(invoke(host,proposal).status,'changed');
 }
});

test('an existing document is never replaced or cleared by dice',async()=>{
 const state=initialDocumentState(),factory=({state})=>createDocumentHost({state,instanceId:'preserved'}),host=factory({state});
 invoke(host,{operation:'document.write',args:{title:'My work',blocks:[{kind:'paragraph',text:'Keep this exact content'}]}});
 const id=state.blocks[0].id,random=randomSource();
 for(let n=0;n<12;n++){const proposal=await sampleNativeControl({host,createHost:factory,state,random});assert.ok(proposal);assert.notEqual(proposal.operation,'document.write');assert.equal(invoke(host,proposal).status,'changed');assert.equal(state.blocks.find(b=>b.id===id).text,'Keep this exact content');assert.equal(state.title,'My work');}
});

const synthetic=({state,refuse=false,hidden=false})=>createNativeToolHost({state,instanceId:'unfamiliar',scope:'toy',operations:[{id:'crate.tint',act:'change',on:'example.crate',params:{id:{type:'string',required:true},tint:{type:'string',required:true,enum:['red','blue']}},sample:[{args:{id:{ref:{on:'example.crate'}},tint:{enum:true}}}]}],handlers:{'crate.tint':(ctx,a)=>{if(refuse)return {status:'missing',code:'policy-denied'};if(hidden)ctx.state.hidden++;else ctx.state.tint=a.tint;return {status:'supported',changed:['box']};}},view:s=>[{id:'box',kind:'crate',sourceType:'example.crate',inputs:[{key:'tint',binding:'crate.tint',values:[nativeToken(s.tint)]}]}]});
test('an unfamiliar world works from declarations and actual observations alone',async()=>{
 const state={tint:'red',hidden:0},factory=({state})=>synthetic({state}),host=factory({state});
 const proposal=await sampleNativeControl({host,createHost:factory,state,random:()=>.9});assert.deepEqual(proposal,{operation:'crate.tint',args:{id:'box',tint:'blue'}});assert.equal(state.tint,'red');
});
test('refused and merely hidden state changes produce no proposed success within bounded attempts',async()=>{
 for(const mode of ['refuse','hidden']){const state={tint:'red',hidden:0};let trials=0;const factory=({state})=>{trials++;return synthetic({state,[mode]:true});},host=synthetic({state});assert.equal(await sampleNativeControl({host,createHost:factory,state,random:()=>.9}),null);assert.equal(trials,48);assert.deepEqual(state,{tint:'red',hidden:0});}
});
