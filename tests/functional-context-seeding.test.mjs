import {test} from 'node:test';import assert from 'node:assert/strict';
import {seedFunctionalContext} from '../scripts/functional-context-seeding.mjs';
import {createDiagramArea,emptyDiagramState} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {createDocumentArea,emptyDocumentArea} from '../worlds/docs.editor/sop-document.mjs';
import {createCalendarArea,emptyCalendarArea} from '../worlds/time.calendar/sop-calendar.mjs';
import {createDrawingArea,emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {createNativeToolHost} from '../worlds/native-tool-host.mjs';
// What the SOP areas show: observed objects of a source type and the typed value of one of their inputs.
const objectsOf=(host,type)=>host.observe().objects.filter(o=>o.sourceType===type);
const value=(object,key)=>{const raw=object?.inputs?.find(i=>i.key===key)?.values?.[0];return raw===undefined?undefined:JSON.parse(raw);};
const labels=(host,type,key)=>objectsOf(host,type).map(o=>value(o,key));
const createDiagram=(instanceId)=>createDiagramArea({state:emptyDiagramState(),instanceId}),createDocument=(instanceId)=>createDocumentArea({state:emptyDocumentArea(),instanceId}),createCalendar=(instanceId)=>createCalendarArea({state:emptyCalendarArea(),instanceId});
const name={from:'name'},field=key=>({from:'field',key});
const diagramMapping={id:'invented.diagram-circle-alias',kind:'round-node',nativeKind:'circle',operation:'diagram.node.make',arguments:{kind:{from:'kind'}},setters:[{operation:'diagram.node.change',arguments:{ids:{from:'createdIds'},label:name}}]};
const meetingMapping={id:'invented.meeting',kind:'meeting',operation:'calendar.meeting.add',arguments:{id:name,title:name,start:field('start'),duration:field('duration'),participants:field('participants'),room:field('room')}};
test('empty context is complete in every area without inventing native objects',async()=>{
 for(const area of ['drawing','diagram','document','calendar']){const result=await seedFunctionalContext({context:{existing:[],previous:null}});assert.equal(result.ok,true,area);assert.equal(result.counters.calls,0);assert.equal(result.counters.seeded,0);}
});
test('reviewed exact kind alias and declared setter preserve names with one make per item',async()=>{
 const host=await createDiagram('seed.diagram'),context={existing:[{name:'First',kind:'round-node'},{name:'Second',kind:'round-node'}]};
 const result=await seedFunctionalContext({context,host,kindMappings:[diagramMapping]});assert.equal(result.ok,true,JSON.stringify(result.failures));assert.equal(result.counters.seeded,2);assert.equal(result.counters.calls,4);assert.deepEqual(labels(host,'diagram.sketch.node','label'),['First','Second']);assert.equal(result.receipts.filter(r=>r.operation==='diagram.node.make').length,2);assert.equal(new Set(result.items.map(i=>i.native.source)).size,2);assert.ok(result.items.every(i=>i.calls===2));assert.deepEqual(context.existing.map(i=>i.name),['First','Second']);
 const unknown=await seedFunctionalContext({context:{existing:[{name:'Alias',kind:'round node'}]},host,kindMappings:[diagramMapping]});assert.equal(unknown.ok,false);assert.equal(unknown.counters.calls,0);assert.equal(unknown.failures[0].reason,'missing-kind-mapping');
});
test('missing Calendar timing and Document content cannot be supplied by invented defaults',async()=>{
 const calendar=await createCalendar('seed.calendar'),document=await createDocument('seed.document'),calendarBefore=JSON.stringify(calendar.observe()),documentBefore=JSON.stringify(document.observe());
 const meeting=await seedFunctionalContext({context:{existing:[{name:'Meeting',kind:'meeting'}]},host:calendar,kindMappings:[{...meetingMapping,arguments:{id:name,title:name}}]});assert.equal(meeting.counters.calls,0);assert.deepEqual(meeting.failures.filter(f=>f.reason==='missing-native-argument').map(f=>f.parameter).sort(),['duration','participants','room','start']);assert.equal(JSON.stringify(calendar.observe()),calendarBefore);
 const doc=await seedFunctionalContext({context:{existing:[{name:'Draft',kind:'document'}]},host:document,kindMappings:[{kind:'document',operation:'document.write',arguments:{title:name}}]});assert.equal(doc.ok,false);assert.ok(doc.failures.some(f=>f.reason==='missing-native-argument'&&f.parameter==='blocks'));assert.equal(JSON.stringify(document.observe()),documentBefore);
 const drawing=await seedFunctionalContext({context:{existing:[{name:'Dot',kind:'circle'}]},kindMappings:[]});assert.equal(drawing.failures[0].reason,'missing-native-create-host');
});
test('Document is seeded only with supplied native content and declared title mapping',async()=>{
 const host=await createDocument('seed.document.complete'),blocks=[{kind:'paragraph',text:'Invented context content.'}],mapping={kind:'document',operation:'document.write',arguments:{title:name,blocks:field('blocks')}};
 const result=await seedFunctionalContext({context:{existing:[{name:'Draft',kind:'document',blocks}]},host,kindMappings:[mapping]});assert.equal(result.ok,true,JSON.stringify(result.failures));assert.equal(result.counters.calls,1);assert.deepEqual(labels(host,'docs.editor.document','title'),['Draft']);assert.ok(labels(host,'docs.editor.text','text').includes('Invented context content.'));assert.equal(result.items[0].native.sourceType,'docs.editor.document');
});
test('Calendar uses actual explicit attributes, preserves resources and respects policy failure',async()=>{
 // The area's declared overlap policy (scheduling-policy.sop) refuses a second meeting of the same person at the same time.
 const state=emptyCalendarArea(),host=await createCalendarArea({state,instanceId:'seed.calendar.policy'});
 const person={kind:'person',operation:'calendar.person.add',arguments:{id:name,label:name}},context={existing:[{name:'Person',kind:'person'},{name:'Meeting',kind:'meeting',start:1000,duration:100,participants:['Person'],room:null},{name:'Clash',kind:'meeting',start:1050,duration:100,participants:['Person'],room:null}]};
 const result=await seedFunctionalContext({context,host,kindMappings:[person,meetingMapping]});assert.equal(result.ok,false);assert.equal(result.counters.seeded,2);assert.equal(result.counters.failed,1);assert.equal(result.counters.calls,3);assert.equal(result.partial,true);assert.ok(result.failures[0].nativeReason);assert.equal(objectsOf(host,'time.calendar.person').length,1);assert.deepEqual(labels(host,'time.calendar.meeting','title'),['Meeting']);assert.deepEqual(Object.keys(state).sort(),['runtime','sop']);
});
test('unmapped attributes, unpreserved names and arbitrary literals fail before mutation',async()=>{
 const host=await createDiagram('seed.preflight');
 for(const [item,mapping]of [[{name:'First',kind:'round-node',colour:'red'},diagramMapping],[{name:'First',kind:'round-node'},{...diagramMapping,setters:[]}],[{name:'First',kind:'round-node'},{...diagramMapping,arguments:{kind:{from:'kind'},n:{literal:2}}}]]){const result=await seedFunctionalContext({context:{existing:[item]},host,kindMappings:[mapping]});assert.equal(result.ok,false);assert.equal(result.counters.calls,0);assert.equal(objectsOf(host,'diagram.sketch.node').length,0);}
 const previous=await seedFunctionalContext({context:{existing:[],previous:'An earlier turn'}});assert.equal(previous.ok,false);assert.equal(previous.failures[0].reason,'previous-context-not-replayed');
});
test('failed declared setter reports partial setup and never correlates an unnamed object as seeded',async()=>{
 const state={objects:[]},operations=[{id:'toy.make',act:'make',on:'toy.object',params:{kind:{type:'string',required:true},n:{type:'integer',default:1}}},{id:'toy.change',act:'change',on:'toy.object',params:{ids:{type:'array',required:true},label:{type:'string',required:true}}}],host=createNativeToolHost({state,instanceId:'seed.partial',scope:'toy',operations,handlers:{'toy.make':(ctx,a)=>{assert.equal(a.n,1);ctx.state.objects.push({id:'native',kind:a.kind});return {status:'supported',changed:['native']};},'toy.change':()=>({status:'missing',code:'setter-denied'})},view:s=>s.objects.map(o=>({...o,sourceType:'toy.object'}))});
 const mapping={kind:'toy',operation:'toy.make',arguments:{kind:{from:'kind'}},setters:[{operation:'toy.change',arguments:{ids:{from:'createdIds'},label:name}}]},result=await seedFunctionalContext({context:{existing:[{name:'Named',kind:'toy'}]},host,kindMappings:[mapping]});assert.equal(result.ok,false);assert.equal(result.partial,true);assert.equal(result.counters.partialItems,1);assert.equal(result.counters.seeded,0);assert.equal(result.counters.calls,2);assert.equal(result.items.length,0);assert.equal(state.objects.length,1);assert.equal(result.failures[0].nativeReason,'setter-denied');
});

import {FUNCTIONAL_NATIVE_BINDINGS} from '../scripts/lib/functional-native-bindings.mjs';
test('matrix setup declarations use the native shape family and preserve labels',async()=>{
 const host=await createDiagram('matrix.mapping');
 const kinds=host.bindings().find(op=>op.id==='diagram.node.make').params.kind.enum;
 assert.deepEqual(FUNCTIONAL_NATIVE_BINDINGS.diagram.map(m=>m.kind),kinds);
 const result=await seedFunctionalContext({host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.diagram,context:{existing:[{name:'Arbitrary title',kind:kinds.at(-1)}]}});
 assert.equal(result.ok,true);assert.equal(result.counters.calls,2);assert.deepEqual(labels(host,'diagram.sketch.node','label'),['Arbitrary title']);
});
test('matrix setup mappings retain missing content and times as failures',async()=>{
 for(const [area,host,kind]of [['document',await createDocument('matrix.doc'),'document'],['calendar',await createCalendar('matrix.calendar'),'meeting']]){
 const result=await seedFunctionalContext({host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS[area],context:{existing:[{name:'Example',kind}]}});
 assert.equal(result.ok,false);assert.equal(result.counters.calls,0);assert.ok(result.failures.some(f=>f.reason==='missing-native-argument'));}
 assert.ok(FUNCTIONAL_NATIVE_BINDINGS.drawing.length>0);
});

test('matrix Drawing setup preserves actual native names and kinds without a reader',async()=>{
 const host=await createDrawingArea({state:emptyDrawingState(),instanceId:'matrix.drawing'});
 const result=await seedFunctionalContext({host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.drawing,context:{existing:[{name:'Named circle',kind:'circle'},{name:'Named tree',kind:'tree'}]}});
 assert.equal(result.ok,true);assert.equal(result.counters.calls,2);const made=objectsOf(host,'art.draw.object').filter(o=>!o.in);assert.deepEqual(made.map(o=>value(o,'name')),['Named circle','Named tree']);assert.deepEqual(made.map(o=>o.kind),['circle','tree']);
});

import {prepareFunctionalFixture,FUNCTIONAL_FIXTURE_POLICY_HASH} from '../scripts/lib/functional-fixture-policy.mjs';
test('versioned fixture defaults preserve safe Calendar IDs and human labels without world-truth claims',async()=>{
 const context={existing:[{kind:'person',name:'Alex Smith'},{kind:'room',name:'Main Room'},{kind:'meeting',name:'Planning meeting'}],previous:'Earlier unsupported turn'};
 const fixture=prepareFunctionalFixture('calendar',context),host=await createCalendar('fixture.calendar');
 assert.equal(fixture.semanticallyLimited,true);assert.equal(fixture.defaulted.length,4);assert.equal(fixture.policy.sha256,FUNCTIONAL_FIXTURE_POLICY_HASH);assert.equal(fixture.limitations[0].reason,'previous-context-not-replayed');assert.equal(context.existing[2].start,undefined);
 const result=await seedFunctionalContext({context:fixture.context,host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.calendar});// The SOP calendar admits a meeting without participants or room; the defaulted start and duration stay recorded as fixture defaults, not world truth.
 assert.equal(result.ok,true,JSON.stringify(result.failures));assert.equal(result.counters.calls,3);assert.ok(result.items.every(i=>/^[a-z0-9-]+$/.test(i.native.id)));assert.deepEqual(result.items.map(i=>i.name),context.existing.map(i=>i.name));
 assert.deepEqual(fixture.defaulted.filter(d=>d.index===2).map(d=>d.field),['start','duration','participants','room']);
 assert.deepEqual(prepareFunctionalFixture('calendar',context).context,fixture.context);
});
test('fixture representation and empty-content defaults are explicit and overwritten setup objects refuse',async()=>{
 const diagram=prepareFunctionalFixture('diagram',{existing:[{kind:'node',name:'Lead'}]});assert.equal(diagram.context.existing[0].kind,'rectangle');assert.equal(diagram.defaulted[0].sourceKind,'node');assert.equal(diagram.original.existing[0].kind,'node');
 const fixture=prepareFunctionalFixture('document',{existing:[{kind:'document',name:'First'},{kind:'document',name:'Second'}]}),host=await createDocument('fixture.docs');
 assert.equal(fixture.defaulted.length,2);const result=await seedFunctionalContext({context:fixture.context,host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.document});assert.equal(result.ok,false);assert.ok(result.failures.some(f=>f.reason==='multiple-singleton-context-objects'));assert.equal(result.counters.calls,0);
});
test('Document fixture parent preparation uses actual native IDs and preserves all child siblings',async()=>{
 const input={existing:[{kind:'section',name:'Results'},{kind:'paragraph',name:'Evidence'},{kind:'quote',name:'Citation'}]},fixture=prepareFunctionalFixture('document',input),host=await createDocument('fixture.children');
 assert.equal(fixture.policy.version,2);assert.equal(fixture.context.existing.length,4);assert.equal(fixture.defaulted.filter(d=>d.field==='parentDocument').length,1);assert.equal(input.existing.length,3);
 const result=await seedFunctionalContext({context:fixture.context,host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.document});assert.equal(result.ok,true,JSON.stringify(result.failures));assert.equal(result.counters.calls,4);assert.equal(result.items.length,4);const children=host.observe().objects.filter(o=>['docs.editor.block','docs.editor.section'].includes(o.sourceType));assert.deepEqual(children.map(o=>value(o,'name')),['Results','Evidence','Citation']);assert.equal(new Set(result.items.map(i=>i.native.source)).size,4);const document=objectsOf(host,'docs.editor.document')[0];assert.ok(children.every(o=>value(o,'parent')===document.id));const containers=objectsOf(host,'docs.editor.text');assert.equal(containers.length,3);assert.ok(containers.every(o=>children.some(b=>b.id===o.in)&&value(o,'text')===''));
});
test('Document fixture references declared parents and refuses missing or ambiguous ones without hidden replacement',async()=>{
 const context={existing:[{kind:'paragraph',name:'Child',text:'Supplied content',parent:'Existing title'},{kind:'document',name:'Existing title',blocks:[]}]},fixture=prepareFunctionalFixture('document',context),host=await createDocument('fixture.existing');
 assert.equal(fixture.defaulted.some(d=>d.field==='parentDocument'),false);const result=await seedFunctionalContext({context:fixture.context,host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.document});assert.equal(result.ok,true,JSON.stringify(result.failures));assert.equal(result.counters.calls,2);
 const missing=await seedFunctionalContext({context:{existing:[{kind:'paragraph',name:'Orphan',parent:'Absent',text:''}]},host,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.document});assert.equal(missing.ok,false);assert.equal(missing.counters.calls,0);assert.ok(missing.failures.some(f=>f.reason==='unresolved-context-object'));
 const multiple=prepareFunctionalFixture('document',{existing:[{kind:'document',name:'A'},{kind:'document',name:'B'},{kind:'paragraph',name:'Child'}]}),other=await createDocument('fixture.multiple'),otherBefore=JSON.stringify(other.observe());const partial=await seedFunctionalContext({context:multiple.context,host:other,kindMappings:FUNCTIONAL_NATIVE_BINDINGS.document});assert.equal(partial.ok,false);assert.equal(partial.partial,false);assert.equal(partial.counters.calls,0);assert.ok(partial.failures.some(f=>f.reason==='multiple-singleton-context-objects'));assert.equal(JSON.stringify(other.observe()),otherBefore);
});
test('contextObject references refuse ambiguous live names without guessing an ID',async()=>{
 const state={objects:[],next:1},operations=[{id:'fixture.make',act:'make',on:'fixture.object',params:{name:{type:'string',required:true},parent:{type:'string'}}}],host=createNativeToolHost({state,instanceId:'fixture.ambiguous',scope:'all',operations,handlers:{'fixture.make':(ctx,a)=>{const id='o'+ctx.state.next++;ctx.state.objects.push({id,kind:'item',name:a.name});return {status:'supported',changed:[id]};}},view:s=>s.objects.map(o=>({...o,sourceType:'fixture.object'}))});
 const mappings=[{kind:'parent',operation:'fixture.make',arguments:{name:{from:'name'}}},{kind:'child',operation:'fixture.make',arguments:{name:{from:'name'},parent:{from:'contextObject',key:'parent',sourceType:'fixture.object'}}}],result=await seedFunctionalContext({host,kindMappings:mappings,context:{existing:[{kind:'parent',name:'Same'},{kind:'parent',name:'Same'},{kind:'child',name:'Child',parent:'Same'}]}});
 assert.equal(result.ok,false);assert.equal(result.partial,true);assert.equal(result.counters.calls,2);assert.equal(state.objects.length,2);assert.equal(result.failures[0].reason,'unresolved-context-object');
});
