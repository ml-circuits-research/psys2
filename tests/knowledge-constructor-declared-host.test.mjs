import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import test from'node:test';import assert from'node:assert/strict';
import{executeDeclaredRequest}from'../src/dialog/declared-execution.mjs';
import{nativeCreationCandidates}from'../src/dialog/native-binding-candidates.mjs';
import{createFacts}from'../src/knowledge/facts.mjs';import{createKnowledgeSource}from'../src/loaders/knowledge-source.mjs';
import{initialDrawingState}from'../worlds/art.draw/declared-host.mjs';import{drawingPartsOf}from'../worlds/art.draw/part-tools.mjs';
const candidate=kind=>({request:'request',wires:'@source std.request.source text="fixture"\n@request std.request act=make mood=do source=$source\n@target std.request.target request=$request mode=new kind='+kind});
const bindingsFor=names=>({kinds:names.map(lemma=>({area:'drawing',type:'drawn',lemma,canonical:'fixture.kind.'+lemma,nativeFamilyBinding:{operation:'drawing.object.make',sourceType:'art.draw.object'}})),properties:[]});
const setup=()=>{const state=initialDrawingState(),events=[],knowledge=createFacts({source:createKnowledgeSource(new URL('./fixtures/catalog/',import.meta.url).pathname)});return {state,events,session:{isession:{state:{'art.draw':state}},engine:{knowledge,onWorldActivity:event=>events.push(event)}}};};
test('catalog constructors share actual declaration-driven knowledge preparation with UI controls',async()=>{
 const {state,session,events}=setup(),names=['apple','chair','castle'],bindings=bindingsFor(names);
 for(const name of names){const result=await executeDeclaredRequest(session,candidate('fixture.kind.'+name),'fixture',{bindings,view:'draw'});assert.equal(result.statuses[0],'supported',JSON.stringify(result));assert.equal(result.trace.binding.operation,'drawing.catalog.make');assert.equal(result.trace.effectVerification.status,'verified');const object=toNativeDrawingState(state).objects.at(-1);assert.equal(object.semanticKind,name);assert.equal(object.origin.representation,'knowledge-vector-parts');assert.ok(drawingPartsOf(object).length>1);assert.ok(Number.isFinite(object.x)&&Number.isFinite(object.y)&&object.size>0);assert.match(result.trace.controlIntent,/drawing.catalog.make/);}
 assert.equal(toNativeDrawingState(state).objects.length,3);assert.ok(events.some(event=>event.service==='thing'&&event.phase==='end'&&event.available));assert.ok(events.some(event=>event.operation==='drawing.catalog.make'&&event.phase==='end'&&event.status==='changed'));
});
test('an existing primitive constructor remains preferred and requires no knowledge lookup',async()=>{
 const {state,session}=setup();session.engine.knowledge={thing(){throw Error('primitive must not load catalog');}};
 const result=await executeDeclaredRequest(session,candidate('fixture.kind.circle'),'fixture',{bindings:bindingsFor(['circle']),view:'draw'});assert.equal(result.statuses[0],'supported');assert.equal(result.trace.binding.operation,'drawing.object.make');assert.equal(toNativeDrawingState(state).objects[0].kind,'circle');assert.equal(result.trace.effectVerification.status,'verified');
});
test('recognized missing native bindings report an integration gap rather than a reader failure',async()=>{
 const {state,session}=setup(),result=await executeDeclaredRequest(session,candidate('fixture.unknown'),'fixture',{bindings:bindingsFor(['circle']),view:'draw'});assert.equal(result.statuses[0],'unsupported');assert.equal(result.trace.reason,'native-binding-gap');assert.match(result.text,/understood/);assert.equal(toNativeDrawingState(state).objects.length,0);
});
test('a knowledge preparation failure cannot mutate the scene or claim a reader failure',async()=>{
 const {state,session}=setup();session.engine.knowledge={thing(){throw Error('fixture unavailable');}};
 const result=await executeDeclaredRequest(session,candidate('fixture.kind.apple'),'fixture',{bindings:bindingsFor(['apple']),view:'draw'});assert.equal(result.statuses[0],'unsupported');assert.equal(result.trace.reason,'native-knowledge-unavailable');assert.equal(toNativeDrawingState(state).objects.length,0);
});
test('compatible catalog constructors are selected for an unfamiliar declared family without domain names',()=>{
 const bindings={kinds:[{area:'novel',lemma:'unlisted',canonical:'example.unlisted',nativeFamilyBinding:{operation:'create.basic'}}]},operations=[{id:'create.basic',act:'make',on:'example.item',params:{kind:{type:'string',enum:['basic']}}},{id:'create.catalog',act:'make',on:'example.item',knowledgeInputs:[{argument:'entry',load:'resolve'}],params:{entry:{type:'string',required:true}}},{id:'other.catalog',act:'make',on:'unrelated.item',knowledgeInputs:[{argument:'entry',load:'resolve'}],params:{entry:{type:'string'}}}];
 assert.deepEqual(nativeCreationCandidates(bindings,operations,'novel').map(candidate=>candidate.operation.id),['create.catalog']);
});
