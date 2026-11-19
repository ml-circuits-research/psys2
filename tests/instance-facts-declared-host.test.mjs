import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeObservationObjects,compareInstanceObjects} from '../src/dialog/instance-facts.mjs';
import {createNativeToolHost} from '../worlds/native-tool-host.mjs';
import {createDrawingHost,initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {createDiagramHost,initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {createCalendarHost,initialCalendarState} from '../worlds/time.calendar/declared-host.mjs';
import {createDocumentHost,initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {createAvatarArea,emptyAvatarState} from '../worlds/ui.avatar/sop-avatar.mjs';
let sequence=0;
const invoke=(host,operation,args)=>{const r=invokeToolCommand(host,{invocation:'facts.'+(++sequence),expectedVersion:host.observe().version,operation,args});assert.equal(r.status,'changed',JSON.stringify(r));return r;};
test('actual observations from five independent native hosts become exact instance facts',async()=>{
 const drawing=createDrawingHost({state:initialDrawingState(),instanceId:'facts.draw'});
 invoke(drawing,'drawing.object.make',{kind:'triangle',name:'Peak',x:123,y:200,color:'#112233'});
 const diagram=await createDiagramHost({state:initialDiagramState(),instanceId:'facts.diagram'});
 invoke(diagram,'diagram.node.make',{kind:'rectangle'});
 const calendar=createCalendarHost({state:initialCalendarState(),instanceId:'facts.calendar'});
 invoke(calendar,'calendar.calendar.add',{id:'work',label:'Work'});
 invoke(calendar,'calendar.meeting.add',{id:'event',title:'Plan',start:1000,duration:100,participants:[],room:null,calendar:'work',notes:'Exact notes'});
 const docs=createDocumentHost({state:initialDocumentState(),instanceId:'facts.docs'});
 invoke(docs,'document.write',{title:'Notes',blocks:[{kind:'heading',text:'Heading',level:2},{kind:'paragraph',text:'Body'}]});
 const avatar=await createAvatarArea({state:emptyAvatarState(),instanceId:'facts.avatar'});
 for(const host of [drawing,diagram,calendar,docs,avatar]){
  const observation=host.observe(),objects=nativeObservationObjects(observation);
  assert.ok(objects.length);assert.deepEqual(compareInstanceObjects(objects,observation),{ok:true});
  for(const row of observation.objects){const fact=objects.find(o=>o.id===row.id);assert.equal(fact.type,row.sourceType);assert.deepEqual(fact.attributes.kind,[row.kind]);}
  const changed=structuredClone(objects);changed[0].attributes.kind=['changed semantic kind'];assert.equal(compareInstanceObjects(changed,observation).ok,false);
 }
 const text=nativeObservationObjects(docs.observe()).find(o=>o.type==='docs.editor.text');assert.ok(text.relations.parent.length);
 const item=nativeObservationObjects(drawing.observe()).find(o=>o.attributes.x?.[0]===123);assert.equal(item.metadata,undefined);assert.equal(item.attributes.x[0],123);assert.equal(drawing.observe().objects.find(o=>o.id===item.id).inputs.find(i=>i.key==='x').unit,'canvas.pixel');
});
function toy(){return createNativeToolHost({state:{},instanceId:'unfamiliar',scope:'all',operations:[],handlers:{},view:()=>[
 {id:'z',kind:'vessel',sourceType:'novel.vessel',members:['b','a'],relations:{focus:['a']},flag:false,inputs:[{key:'label',binding:'novel.label',values:['"a"']},{key:'payload',binding:'novel.payload',values:['{"items":[false,null,2.5,{"x":"a"}]}']},{key:'focus',binding:'novel.focus',values:['"a"']}]},
 {id:'b',kind:'cell',sourceType:'novel.cell',inputs:[]},{id:'a',kind:'cell',sourceType:'novel.cell',inputs:[]}]});}
test('unfamiliar sixth host retains nested values and explicit ordered references without guessing',()=>{
 const observation=toy().observe(),objects=nativeObservationObjects(observation),vessel=objects[2];
 assert.deepEqual(objects.map(o=>o.id),['a','b','z']);assert.deepEqual(vessel.attributes.label,['a']);assert.deepEqual(vessel.relations,{focus:['a'],members:['b','a']});
 assert.equal(Object.hasOwn(vessel.attributes,'focus'),false);assert.equal(vessel.metadata,undefined);
 assert.deepEqual(vessel.attributes.payload,[{items:[false,null,2.5,{x:'a'}]}]);assert.deepEqual(vessel.attributes.flag,[false]);
 const reincarnated=structuredClone(observation);reincarnated.version='9';for(const row of reincarnated.objects){row.version='9';row.source+='new';for(const input of row.inputs){input.version='9';input.source=row.source;}}
 assert.deepEqual(compareInstanceObjects(objects,reincarnated),{ok:true});
});
test('incomplete, unsupported, dangling and changed semantic observations are rejected',()=>{
 const original=toy().observe(),expected=nativeObservationObjects(original);
 for(const mutate of [o=>o.complete=false,o=>o.objects[0].inputs[0].values=['unquoted reference'],o=>o.objects[0].relations.focus=['missing'],o=>o.objects[0].inputs[0].values=['"changed"']]){
  const observation=structuredClone(original);mutate(observation);assert.equal(compareInstanceObjects(expected,observation).ok,false);
 }
});

test('binding descriptions are not semantic object state; typed values and relations remain exact',()=>{
 const observation=toy().observe(),objects=nativeObservationObjects(observation),withDescriptions=structuredClone(objects);
 withDescriptions.find(o=>o.id==='z').metadata={inputs:{label:[{binding:'novel.label',unit:'invented.unit'}]}};
 assert.deepEqual(compareInstanceObjects(withDescriptions,observation),{ok:true});
 const rebound=structuredClone(observation);rebound.objects[0].inputs[0].binding='another.declared.binding';assert.deepEqual(compareInstanceObjects(objects,rebound),{ok:true});
 for(const change of [o=>o.attributes.label=[1],o=>o.attributes.flag=[true],o=>o.attributes.payload[0].items[2]=3,o=>o.relations.members.reverse()]){
  const changed=structuredClone(withDescriptions);change(changed.find(o=>o.id==='z'));assert.equal(compareInstanceObjects(changed,observation).ok,false);
 }
 const unrelatedMetadata=structuredClone(withDescriptions);unrelatedMetadata[0].metadata={unexpected:'not a binding description'};assert.equal(compareInstanceObjects(unrelatedMetadata,observation).ok,false);
});
