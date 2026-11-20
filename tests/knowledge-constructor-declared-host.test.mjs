import{PINNED_CATALOG}from'./fixtures/pinned-catalog.mjs';
import test from'node:test';import assert from'node:assert/strict';
import{executeDeclaredRequest}from'../src/dialog/declared-execution.mjs';
import{nativeCreationCandidates}from'../src/dialog/native-binding-candidates.mjs';
import{createFacts}from'../src/knowledge/facts.mjs';import{createKnowledgeSource}from'../src/loaders/knowledge-source.mjs';
import{emptyDrawingState,projectDrawingArea}from'../worlds/art.draw/sop-drawing.mjs';import{existsSync}from'node:fs';import{readFile}from'node:fs/promises';
// The Drawing area reads its schemas and k.objects drawings from the catalog checkout beside the repository.
const CATALOG=PINNED_CATALOG,skip=existsSync(new URL('w.drawing/schema.sop',CATALOG))?false:'catalog checkout with w.drawing unavailable';
const objectsOf=state=>[...state.sop.matchAll(/^@\S+ w\.drawing\.object .*?\bcode=(\S+) drawing=("[^"]*"|\S+)/gm)].map(m=>({code:m[1],drawing:m[2].replace(/"/g,'')}));
const candidate=kind=>({request:'request',wires:'@source std.request.source text="fixture"\n@request std.request act=make mood=do source=$source\n@target std.request.target request=$request mode=new kind='+kind});
const bindingsFor=names=>({kinds:names.map(lemma=>({area:'drawing',type:'drawn',lemma,canonical:'fixture.kind.'+lemma,nativeFamilyBinding:{operation:'drawing.object.make',sourceType:'art.draw.object'}})),properties:[]});
const setup=()=>{const state=emptyDrawingState(),events=[],facts=createFacts({source:createKnowledgeSource(new URL('./fixtures/catalog/',import.meta.url).pathname)}),knowledge={thing:word=>facts.thing(word),readText:file=>readFile(new URL(file,CATALOG),'utf8')};return {state,events,session:{isession:{state:{'art.draw':state}},engine:{knowledge,onWorldActivity:event=>events.push(event)}}};};
test('catalog constructors share actual declaration-driven knowledge preparation with UI controls',{skip},async()=>{
 const {state,session,events}=setup(),names=['apple','chair','castle'],bindings=bindingsFor(names);
 for(const name of names){const result=await executeDeclaredRequest(session,candidate('fixture.kind.'+name),'fixture',{bindings,view:'draw'});assert.equal(result.statuses[0],'supported',JSON.stringify(result));assert.equal(result.trace.binding.operation,'drawing.catalog.make');assert.equal(result.trace.effectVerification.status,'verified',JSON.stringify(result.trace.effectVerification));const object=objectsOf(state).at(-1);assert.equal(object.drawing,name);assert.ok((projectDrawingArea(state).svg.match(new RegExp('data-select="'+object.code+'"','g'))??[]).length>1,'drawn from its k.objects parts');assert.match(result.trace.controlIntent,/drawing.catalog.make/);}
 assert.equal(objectsOf(state).length,3);assert.ok(events.some(event=>event.service==='thing'&&event.phase==='end'&&event.available));assert.ok(events.some(event=>event.operation==='drawing.catalog.make'&&event.phase==='end'&&event.status==='changed'));
});
test('an existing primitive constructor remains preferred and requires no knowledge lookup',{skip},async()=>{
 const {state,session}=setup();session.engine.knowledge={thing(){throw Error('primitive must not load catalog');}};
 const result=await executeDeclaredRequest(session,candidate('fixture.kind.circle'),'fixture',{bindings:bindingsFor(['circle']),view:'draw'});assert.equal(result.statuses[0],'supported');assert.equal(result.trace.binding.operation,'drawing.object.make');assert.equal(objectsOf(state)[0].drawing,'circle');assert.equal(result.trace.effectVerification.status,'verified');
});
test('recognized missing native bindings report an integration gap rather than a reader failure',{skip},async()=>{
 const {state,session}=setup(),result=await executeDeclaredRequest(session,candidate('fixture.unknown'),'fixture',{bindings:bindingsFor(['circle']),view:'draw'});assert.equal(result.statuses[0],'unsupported');assert.equal(result.trace.reason,'native-binding-gap');assert.match(result.text,/understood/);assert.equal(objectsOf(state).length,0);
});
test('a knowledge preparation failure cannot mutate the scene or claim a reader failure',{skip},async()=>{
 const {state,session}=setup();session.engine.knowledge={thing(){throw Error('fixture unavailable');}};
 const result=await executeDeclaredRequest(session,candidate('fixture.kind.apple'),'fixture',{bindings:bindingsFor(['apple']),view:'draw'});assert.equal(result.statuses[0],'unsupported');assert.equal(result.trace.reason,'native-knowledge-unavailable');assert.equal(objectsOf(state).length,0);
});
test('compatible catalog constructors are selected for an unfamiliar declared family without domain names',()=>{
 const bindings={kinds:[{area:'novel',lemma:'unlisted',canonical:'example.unlisted',nativeFamilyBinding:{operation:'create.basic'}}]},operations=[{id:'create.basic',act:'make',on:'example.item',params:{kind:{type:'string',enum:['basic']}}},{id:'create.catalog',act:'make',on:'example.item',knowledgeInputs:[{argument:'entry',load:'resolve'}],params:{entry:{type:'string',required:true}}},{id:'other.catalog',act:'make',on:'unrelated.item',knowledgeInputs:[{argument:'entry',load:'resolve'}],params:{entry:{type:'string'}}}];
 assert.deepEqual(nativeCreationCandidates(bindings,operations,'novel').map(candidate=>candidate.operation.id),['create.catalog']);
});

test('constructor policy retains same-family alternatives and treats absence as evidence only where declared', () => {
 const operation=(id,overrides={})=>({id,act:'make',on:'fixture.item',params:{},...overrides});
 const load=[{argument:'entry',load:'fixture'}];
 const operations=[
  operation('new.mapped',{knowledgeInputs:load,params:{kind:{enum:['sprout']}}}),
  operation('new.catalog',{knowledgeInputs:load}),
  operation('new.second',{knowledgeInputs:load}),
  operation('new.blocked',{knowledgeInputs:load,requires:['prior-observation']}),
  operation('new.open-kind',{knowledgeInputs:load,params:{kind:{type:'string'}}}),
  operation('new.edit',{act:'change',knowledgeInputs:load}),
 ];
 const nativeFamilyBinding={operation:'new.mapped'};
 const leaf={area:'novel',lemma:'sprout',canonical:'fixture.sprout',nativeFamilyBinding};
 const family={area:'novel',type:'sprout',canonical:'fixture.family',nativeFamilyBinding};
 const missing={...leaf,nativeFamilyBinding:{operation:'new.missing'}};
 const names = bindings => nativeCreationCandidates(bindings,operations,'novel').map(({mapping,operation})=>[mapping.canonical,operation.id]);
 assert.deepEqual(names({kinds:[leaf,missing],families:[family]}),[
  ['fixture.sprout','new.mapped'],['fixture.sprout','new.catalog'],['fixture.sprout','new.second'],
  ['fixture.family','new.mapped'],
 ]);
 assert.deepEqual(names({kinds:[{...leaf,area:'other'}]}),[]);
 assert.deepEqual(names({kinds:[{...leaf,lemma:'unknown'}]}),[
  ['fixture.sprout','new.catalog'],['fixture.sprout','new.second'],
 ]);
});

test('constructor pairs derived for a frozen binding table are reused only while the declared operations and area stay the same',async()=>{
 const {freezeHostData}=await import('../worlds/native-tool-host.mjs');
 const bindings=freezeHostData({kinds:[{area:'novel',lemma:'catalog',canonical:'novel.catalog',nativeFamilyBinding:{operation:'create.catalog'}}],families:[],unresolved:[]});
 const operations=[{id:'create.catalog',act:'make',on:'novel.catalog',params:{}}];
 const first=nativeCreationCandidates(bindings,operations,'novel'),again=nativeCreationCandidates(bindings,structuredClone(operations),'novel');
 assert.deepEqual(again,first);assert.equal(first.length,1);assert.equal(again[0].mapping,first[0].mapping);
 assert.deepEqual(nativeCreationCandidates(bindings,[{...operations[0],id:'create.other'}],'novel'),[]);
 assert.deepEqual(nativeCreationCandidates(bindings,operations,'elsewhere'),[]);
});
