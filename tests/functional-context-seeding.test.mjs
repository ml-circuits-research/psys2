import {test} from 'node:test';import assert from 'node:assert/strict';
import {seedFunctionalContext} from '../scripts/functional-context-seeding.mjs';
import {createDiagramHost,initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {createDocumentHost,initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {createCalendarHost} from '../worlds/time.calendar/declared-host.mjs';
import {createNativeToolHost} from '../worlds/native-tool-host.mjs';
const name={from:'name'},field=key=>({from:'field',key});
const diagramMapping={id:'invented.diagram-circle-alias',kind:'round-node',nativeKind:'circle',operation:'diagram.node.make',arguments:{kind:{from:'kind'}},setters:[{operation:'diagram.node.change',arguments:{ids:{from:'createdIds'},label:name}}]};
const meetingMapping={id:'invented.meeting',kind:'meeting',operation:'calendar.meeting.add',arguments:{id:name,title:name,start:field('start'),duration:field('duration'),participants:field('participants'),room:field('room')}};
test('empty context is complete in every area without inventing native objects',async()=>{
 for(const area of ['drawing','diagram','document','calendar']){const result=await seedFunctionalContext({context:{existing:[],previous:null}});assert.equal(result.ok,true,area);assert.equal(result.counters.calls,0);assert.equal(result.counters.seeded,0);}
});
test('reviewed exact kind alias and declared setter preserve names with one make per item',async()=>{
 const state=initialDiagramState(),host=await createDiagramHost({state,instanceId:'seed.diagram'}),context={existing:[{name:'First',kind:'round-node'},{name:'Second',kind:'round-node'}]};
 const result=await seedFunctionalContext({context,host,kindMappings:[diagramMapping]});assert.equal(result.ok,true,JSON.stringify(result.failures));assert.equal(result.counters.seeded,2);assert.equal(result.counters.calls,4);assert.deepEqual(state.shapes.map(o=>o.label),['First','Second']);assert.equal(result.receipts.filter(r=>r.operation==='diagram.node.make').length,2);assert.equal(new Set(result.items.map(i=>i.native.source)).size,2);assert.ok(result.items.every(i=>i.calls===2));assert.deepEqual(context.existing.map(i=>i.name),['First','Second']);
 const unknown=await seedFunctionalContext({context:{existing:[{name:'Alias',kind:'round node'}]},host,kindMappings:[diagramMapping]});assert.equal(unknown.ok,false);assert.equal(unknown.counters.calls,0);assert.equal(unknown.failures[0].reason,'missing-kind-mapping');
});
test('missing Calendar timing and Document content cannot be supplied by invented defaults',async()=>{
 const calendar=createCalendarHost({instanceId:'seed.calendar'}),document=createDocumentHost({state:initialDocumentState(),instanceId:'seed.document'});
 const meeting=await seedFunctionalContext({context:{existing:[{name:'Meeting',kind:'meeting'}]},host:calendar,kindMappings:[{...meetingMapping,arguments:{id:name,title:name}}]});assert.equal(meeting.counters.calls,0);assert.deepEqual(meeting.failures.filter(f=>f.reason==='missing-native-argument').map(f=>f.parameter).sort(),['duration','participants','room','start']);assert.equal(calendar.observe().objects.length,0);
 const doc=await seedFunctionalContext({context:{existing:[{name:'Draft',kind:'document'}]},host:document,kindMappings:[{kind:'document',operation:'document.write',arguments:{title:name}}]});assert.equal(doc.ok,false);assert.ok(doc.failures.some(f=>f.reason==='missing-native-argument'&&f.parameter==='blocks'));assert.equal(document.observe().objects.length,0);
 const drawing=await seedFunctionalContext({context:{existing:[{name:'Dot',kind:'circle'}]},kindMappings:[]});assert.equal(drawing.failures[0].reason,'missing-native-create-host');
});
test('Document is seeded only with supplied native content and declared title mapping',async()=>{
 const state=initialDocumentState(),host=createDocumentHost({state,instanceId:'seed.document.complete'}),blocks=[{kind:'paragraph',text:'Invented context content.'}],mapping={kind:'document',operation:'document.write',arguments:{title:name,blocks:field('blocks')}};
 const result=await seedFunctionalContext({context:{existing:[{name:'Draft',kind:'document',blocks}]},host,kindMappings:[mapping]});assert.equal(result.ok,true,JSON.stringify(result.failures));assert.equal(result.counters.calls,1);assert.equal(state.title,'Draft');assert.equal(state.blocks[0].text,'Invented context content.');assert.equal(result.items[0].native.sourceType,'docs.editor.document');
});
test('Calendar uses actual explicit attributes, preserves resources and respects policy failure',async()=>{
 const state={people:[],rooms:[],meetings:[]},host=createCalendarHost({state,instanceId:'seed.calendar.policy',validate:s=>s.meetings.length?{ok:false,code:'invented-policy-deny'}:{ok:true}});
 const person={kind:'person',operation:'calendar.person.add',arguments:{id:name,label:name}},context={existing:[{name:'Person',kind:'person'},{name:'Meeting',kind:'meeting',start:1000,duration:100,participants:['Person'],room:null}]};
 const result=await seedFunctionalContext({context,host,kindMappings:[person,meetingMapping]});assert.equal(result.ok,false);assert.equal(result.counters.seeded,1);assert.equal(result.counters.failed,1);assert.equal(result.counters.calls,2);assert.equal(result.partial,true);assert.equal(result.failures[0].nativeReason,'invented-policy-deny');assert.equal(state.people.length,1);assert.equal(state.meetings.length,0);
});
test('unmapped attributes, unpreserved names and arbitrary literals fail before mutation',async()=>{
 const state=initialDiagramState(),host=await createDiagramHost({state,instanceId:'seed.preflight'});
 for(const [item,mapping]of [[{name:'First',kind:'round-node',colour:'red'},diagramMapping],[{name:'First',kind:'round-node'},{...diagramMapping,setters:[]}],[{name:'First',kind:'round-node'},{...diagramMapping,arguments:{kind:{from:'kind'},n:{literal:2}}}]]){const result=await seedFunctionalContext({context:{existing:[item]},host,kindMappings:[mapping]});assert.equal(result.ok,false);assert.equal(result.counters.calls,0);assert.equal(state.shapes.length,0);}
 const previous=await seedFunctionalContext({context:{existing:[],previous:'An earlier turn'}});assert.equal(previous.ok,false);assert.equal(previous.failures[0].reason,'previous-context-not-replayed');
});
test('failed declared setter reports partial setup and never correlates an unnamed object as seeded',async()=>{
 const state={objects:[]},operations=[{id:'toy.make',act:'make',on:'toy.object',params:{kind:{type:'string',required:true},n:{type:'integer',default:1}}},{id:'toy.change',act:'change',on:'toy.object',params:{ids:{type:'array',required:true},label:{type:'string',required:true}}}],host=createNativeToolHost({state,instanceId:'seed.partial',scope:'toy',operations,handlers:{'toy.make':(ctx,a)=>{assert.equal(a.n,1);ctx.state.objects.push({id:'native',kind:a.kind});return {status:'supported',changed:['native']};},'toy.change':()=>({status:'missing',code:'setter-denied'})},view:s=>s.objects.map(o=>({...o,sourceType:'toy.object'}))});
 const mapping={kind:'toy',operation:'toy.make',arguments:{kind:{from:'kind'}},setters:[{operation:'toy.change',arguments:{ids:{from:'createdIds'},label:name}}]},result=await seedFunctionalContext({context:{existing:[{name:'Named',kind:'toy'}]},host,kindMappings:[mapping]});assert.equal(result.ok,false);assert.equal(result.partial,true);assert.equal(result.counters.partialItems,1);assert.equal(result.counters.seeded,0);assert.equal(result.counters.calls,2);assert.equal(result.items.length,0);assert.equal(state.objects.length,1);assert.equal(result.failures[0].nativeReason,'setter-denied');
});

import {FUNCTIONAL_NATIVE_BINDINGS} from '../scripts/lib/functional-native-bindings.mjs';
test('matrix setup declarations use the native shape family and preserve labels',async()=>{
 const state=initialDiagramState(),host=await createDiagramHost({state,instanceId:'matrix.mapping'});
 const kinds=host.bindings().find(op=>op.id==='diagram.node.make').params.kind.enum;
 assert.deepEqual(FUNCTIONAL_NATIVE_BINDINGS.diagram.map(m=>m.kind),kinds);
 const result=await seedFunctionalContext({host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.diagram,context:{existing:[{name:'Arbitrary title',kind:kinds.at(-1)}]}});
 assert.equal(result.ok,true);assert.equal(result.counters.calls,2);assert.equal(state.shapes[0].label,'Arbitrary title');
});
test('matrix setup mappings retain missing content and times as failures',async()=>{
 for(const [area,host,kind]of [['document',createDocumentHost({instanceId:'matrix.doc'}),'document'],['calendar',createCalendarHost({instanceId:'matrix.calendar'}),'meeting']]){
 const result=await seedFunctionalContext({host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS[area],context:{existing:[{name:'Example',kind}]}});
 assert.equal(result.ok,false);assert.equal(result.counters.calls,0);assert.ok(result.failures.some(f=>f.reason==='missing-native-argument'));}
 assert.ok(FUNCTIONAL_NATIVE_BINDINGS.drawing.length>0);
});

import {createDrawingHost,initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
test('matrix Drawing setup preserves actual native names and kinds without a reader',async()=>{
 const state=initialDrawingState(),host=createDrawingHost({state,instanceId:'matrix.drawing'});
 const result=await seedFunctionalContext({host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.drawing,context:{existing:[{name:'Named circle',kind:'circle'},{name:'Named tree',kind:'tree'}]}});
 assert.equal(result.ok,true);assert.equal(result.counters.calls,2);assert.deepEqual(state.objects.map(o=>o.name),['Named circle','Named tree']);assert.deepEqual(state.objects.map(o=>o.kind),['circle','tree']);
});
