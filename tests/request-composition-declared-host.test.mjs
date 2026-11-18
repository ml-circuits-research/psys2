import {readReaderSource} from '../src/dialog/reader-source.mjs';
import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import test from'node:test';import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{parse,SCHEMA_TYPES}from'../src/vendor/sopworld/sopworld.mjs';
import{routeNewEngine}from'../src/dialog/reader-routing.mjs';import{initialDrawingState}from'../worlds/art.draw/declared-host.mjs';
import{inspectRequestCompositionPolicy,requestCompositionPolicy}from'../src/dialog/request-composition-policy.mjs';
const full='make a circle; make a house',cuts=[[0,13],[15,27]],bindings={format:'sop.structural-bindings/1',properties:[],families:[],kinds:['circle','house'].map(lemma=>({area:'drawing',type:'drawn',lemma,canonical:'fixture.'+lemma,nativeFamilyBinding:{operation:'drawing.object.make',sourceType:'art.draw.object'}}))};
const proposal=(kind,index)=>({candidates:[{request:'r',wires:'@s std.request.source text='+JSON.stringify(full)+'\n@r std.request act=make mood=do source=$s\n@t std.request.target request=$r mode=new kind=fixture.'+kind}],coverage:{complete:true,graphProposal:true,executable:false},failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.8},composition:{range:cuts[index],sourceCuts:cuts,index,explicitDependencies:[]}});
test('ordered declared requests use real state sequentially and retain one undo group',async()=>{
 const state=initialDrawingState(),session={isession:{state:{'ui.shell':{activeTab:'draw'},'art.draw':state}},engine:{requestReader:{bindings:()=>bindings,registry:()=>({}),provenance:()=>({modelSha256:'a'.repeat(64)}),propose(){throw Error('the composed route must consume the actual yielded proposals');},async *proposeRequests(sourceSop){assert.equal(readReaderSource(sourceSop),full);yield proposal('circle',0);assert.equal(toNativeDrawingState(state).objects.length,1);yield proposal('house',1);}}}};
 const result=await routeNewEngine(session,full,{language:'en',view:'draw'});assert.deepEqual(result.statuses,['supported','supported'],JSON.stringify(result));assert.deepEqual(toNativeDrawingState(state).objects.map(o=>o.kind),['circle','house']);assert.equal(result.trace.composition.policy.order,'source');assert.equal(result.trace.composition.total,2);assert.equal(result.trace.composition.undoGroup,1);assert.equal(session.newEngineUndo.length,1);assert.equal(toNativeDrawingState(session.newEngineUndo[0].before['art.draw']).objects.length,0);assert.equal(toNativeDrawingState(session.newEngineUndo[0].after['art.draw']).objects.length,2);assert.equal(result.trace.readerRouting.proposalCandidates.length,4);assert.equal(inspectRequestCompositionPolicy().world.get('composition.default').type,'app.request.composition.policy');
});
test('one refused component retains the real successful effect and one partial undo record',async()=>{
 const state=initialDrawingState(),session={isession:{state:{'ui.shell':{activeTab:'draw'},'art.draw':state}},engine:{requestReader:{bindings:()=>bindings,registry:()=>({}),provenance:()=>({modelSha256:'a'.repeat(64)}),propose(){throw Error('fixture unexpectedly used');},async *proposeRequests(sourceSop){assert.equal(readReaderSource(sourceSop),full);yield proposal('circle',0);yield proposal('unbound',1);}}}};
 const result=await routeNewEngine(session,full,{language:'en',view:'draw'});assert.deepEqual(result.statuses,['supported','unsupported']);assert.equal(result.trace.partial,true);assert.equal(result.trace.composition.supported,1);assert.deepEqual(toNativeDrawingState(state).objects.map(o=>o.kind),['circle']);assert.equal(session.newEngineUndo.length,1);assert.equal(toNativeDrawingState(session.newEngineUndo[0].before['art.draw']).objects.length,0);assert.equal(toNativeDrawingState(session.newEngineUndo[0].after['art.draw']).objects.length,1);assert.ok(result.trace.composition.steps[1].trace.reason);
 assert.ok(result.text.includes('"make a house"'),result.text);
 assert.deepEqual(toNativeDrawingState(result.state['art.draw']).objects.map(o=>o.kind),['circle']);
});
test('request composition retains independent schema and policy sources',async()=>{
 assert.deepEqual(requestCompositionPolicy(),{enabled:true,order:'source',dependencies:'preserve',undo:'turn',world:'app.request.composition',declaration:'composition.default'});
 const {schema,source,world,facts,dependencies}=inspectRequestCompositionPolicy();
 assert.equal(await fs.readFile(new URL('../'+schema.source,import.meta.url),'utf8'),schema.wires);
 assert.equal(await fs.readFile(new URL('../worlds/app.project/request-composition-policy.sop',import.meta.url),'utf8'),source);
 assert.ok(parse(schema.wires).every(wire=>SCHEMA_TYPES.has(wire.type)));
 assert.deepEqual(dependencies,['app.request.composition']);
 const [importEntry,factEntry]=world.toJSON().log;
 assert.deepEqual(importEntry.wires.map(wire=>wire.type),['core.use']);
 assert.equal(factEntry.wires[0].type,'app.request.composition.policy');
 assert.equal(factEntry.wires.filter(wire=>wire.type==='core.rule').length,2);
 assert.deepEqual(parse(facts),factEntry.wires);
});


test('authored continuation controls whether an unresolved clause blocks later effects and preserves undo',async()=>{
 const text='make a circle; make an unavailable object; make a house',sourceCuts=[[0,13],[15,41],[43,55]];
 const authored=inspectRequestCompositionPolicy().source;
 for(const action of ['advance','stop']){
  const policySource=authored.replace('after.unresolved=advance','after.unresolved='+action);
  const state=initialDrawingState(),events=[],seen=[],session={isession:{state:{'ui.shell':{activeTab:'draw'},'art.draw':state}},
   engine:{requestCompositionPolicySource:policySource,onWorldActivity:event=>events.push(event),requestReader:{
    bindings:()=>bindings,registry:()=>({}),provenance:()=>({modelSha256:'a'.repeat(64)}),
    propose(){throw Error('compound fixture must use observed cuts');},
    async *proposeRequests(sourceSop){
     assert.equal(readReaderSource(sourceSop),text);
     for(const [index,kind] of ['circle','unbound','house'].entries()){
      seen.push(index);
      const next=proposal(kind,0);
      next.candidates[0].wires=next.candidates[0].wires.replace(JSON.stringify(full),JSON.stringify(text));
      next.composition={index,range:sourceCuts[index],sourceCuts,explicitDependencies:[]};
      yield next;
     }
    },
   }}};
  const result=await routeNewEngine(session,text,{view:'draw'});
  const advanced=action==='advance';
  assert.deepEqual(seen,advanced?[0,1,2]:[0,1]);
  assert.deepEqual(toNativeDrawingState(session.isession.state['art.draw']).objects.map(object=>object.kind),advanced?['circle','house']:['circle'],JSON.stringify(result.trace));
  assert.equal(result.trace.composition.total,3);
  assert.deepEqual(result.trace.composition.deferred,advanced?[]:[sourceCuts[2]]);
  assert.equal(result.trace.composition.undoGroup,1);
  assert.ok(events.some(event=>event.operation==='app.request.composition.decision'&&event.wires.includes('previous=unresolved')&&event.wires.includes('action='+action)));
  if(!advanced)assert.match(result.text,/stopped before "make a house"/);
  const undo=await routeNewEngine(session,'@s std.request.source text="Undo" @r std.request act=undo mood=do source=$s',{view:'draw'});
  assert.deepEqual(undo.statuses,['supported']);
  assert.deepEqual(toNativeDrawingState(session.isession.state['art.draw']).objects,[]);
 }
});
