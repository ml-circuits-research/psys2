import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {CATALOG_PIN} from '../src/knowledge/catalog-pin.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {snapshotNativeInstances,restoreNativeInstances,observeNativeInstanceWorlds} from '../src/dialog/instance-persistence.mjs';
import {readInstanceState,serializeInstanceState,str,parse,serialize,SCHEMA_TYPES} from '../src/vendor/sopworld/sopworld.mjs';
import {NATIVE_AREAS,createAreaHost} from '../src/dialog/app-reader-context.mjs';
import {nativeObservationObjects} from '../src/dialog/instance-facts.mjs';
import {emptyDrawingState as initialDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {emptyDiagramState as initialDiagramState,diagramAreaStateWorld} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {emptyCalendarArea as initialCalendarState,calendarAreaStateWorld} from '../worlds/time.calendar/sop-calendar.mjs';
import {emptyDocumentArea as initialCanonicalDocumentState,documentAreaStateWorld} from '../worlds/docs.editor/sop-document.mjs';
import {emptyAvatarState as initialAvatarState} from '../worlds/ui.avatar/sop-avatar.mjs';
const session=()=>({isession:{state:{}},engine:{loader:{readFile:(world,file)=>readFile(new URL(`../worlds/${world}/${file}`,import.meta.url),'utf8')}}});
let sequence=0;
function invoke(host,operation,args){const receipt=invokeToolCommand(host,{invocation:'archive.'+(++sequence),expectedVersion:host.observe().version,operation,args});assert.equal(receipt.status,'changed',JSON.stringify(receipt));return receipt;}
async function populated(){
 const s=session();Object.assign(s.isession.state,{'art.draw':initialDrawingState(),'diagram.sketch':initialDiagramState(),'time.calendar':initialCalendarState(),'docs.editor':initialCanonicalDocumentState(),'ui.avatar':initialAvatarState()});
 s.nativeInstanceIds=Object.fromEntries(Object.values(NATIVE_AREAS).map(a=>[a.world,'stable.'+a.world]));
 const hosts={};for(const [key,area] of Object.entries(NATIVE_AREAS))hosts[key]=await createAreaHost(area,{state:s.isession.state[area.world],instanceId:s.nativeInstanceIds[area.world],loader:s.engine.loader});
 invoke(hosts.draw,'drawing.object.make',{kind:'triangle',name:'Peak',x:123,y:200,color:'#112233'});
 const made=invoke(hosts.diagram,'diagram.node.make',{kind:'circle',n:2});const ids=made.after.objects.map(o=>o.id);invoke(hosts.diagram,'diagram.link.make',{from:ids[0],to:ids[1]});
 for(const kind of ['person','room'])invoke(hosts.calendar,`calendar.${kind}.add`,{id:kind,label:kind});   // the calendar "calendar" is declared by the area
 invoke(hosts.calendar,'calendar.meeting.add',{id:'event',title:'Planning',start:1000,duration:100,participants:['person'],room:'room',calendar:'calendar',notes:'Exact notes'});
 invoke(hosts.editor,'document.write',{title:'Notes',blocks:[{kind:'heading',text:'Heading',level:2},{kind:'paragraph',text:'Body'}]});
 invoke(hosts.avatar,'avatar.face.expression',{expression:'happy'});
 return {s,hosts};
}
test('five actual native hosts restore exact projections, stable identities and explicit relations from SOP',async()=>{
 const {s,hosts}=await populated(),records=await snapshotNativeInstances(s),target=session();
 const drawingFacts=nativeObservationObjects(hosts.draw.observe());
 assert.equal(records.length,5);await restoreNativeInstances(target,records);
 assert.deepEqual(target.isession.state,s.isession.state);assert.deepEqual(target.nativeInstanceIds,s.nativeInstanceIds);
 for(const record of records){const area=Object.values(NATIVE_AREAS).find(a=>a.world===record.world);if(area.stateWorld){assert.equal(record.wires,s.isession.state[record.world].sop);assert.deepEqual(area.projectState(target.isession.state[record.world]),area.projectState(s.isession.state[record.world]));assert.doesNotMatch(record.wires,/std\.instance\./);}else{const archive=readInstanceState(record.wires);assert.deepEqual(archive.projection,s.isession.state[record.world]);assert.equal(archive.instanceId,s.nativeInstanceIds[record.world]);assert.equal(archive.revision,0);}assert.equal(record.instanceId,s.nativeInstanceIds[record.world]);assert.equal(record.revision,0);assert.ok(target.instanceWorlds[record.world]);}
 const diagram=diagramAreaStateWorld(target.isession.state['diagram.sketch']),edge=diagram.ofType('w.diagram.edge')[0];
 const nodes=diagram.ofType('w.diagram.node').map(node=>node.id);
 assert.ok(nodes.includes(edge.attrs.from[0].slice(1))&&nodes.includes(edge.attrs.to[0].slice(1)),'the restored edge joins restored nodes');
 const calendar=calendarAreaStateWorld({sop:records.find(r=>r.world==='time.calendar').wires}),meeting=calendar.ofType('w.meetings.meeting').find(o=>o.attrs.code[0]==='event'),identity=reference=>calendar.get(reference.slice(1)).attrs.code[0];assert.deepEqual(meeting.attrs.participant.map(identity),['person']);assert.deepEqual(meeting.attrs.room.map(identity),['room']);assert.deepEqual(meeting.attrs.calendar.map(identity),['calendar']);
 const repeated=await snapshotNativeInstances(target);for(const record of repeated){const original=records.find(r=>r.world===record.world);if(Object.values(NATIVE_AREAS).find(a=>a.world===record.world).stateWorld)assert.deepEqual(record,original);else assert.deepEqual(readInstanceState(record.wires),readInstanceState(original.wires));}
 invoke(hosts.draw,'drawing.object.make',{kind:'circle',name:'Moon',x:25,y:30,color:'#223344'});
 const edited=await snapshotNativeInstances(s);assert.equal(edited.find(r=>r.world==='art.draw').revision,1);assert.equal(edited.find(r=>r.world==='art.draw').instanceId,'stable.art.draw');for(const r of edited.filter(r=>r.world!=='art.draw'))assert.equal(r.revision,0);
 const area=NATIVE_AREAS.draw;const restoredHost=await createAreaHost(area,{state:target.isession.state[area.world],instanceId:target.nativeInstanceIds[area.world]});assert.deepEqual(nativeObservationObjects(restoredHost.observe()),drawingFacts);
});
// Every editor keeps an SOP area instance now: a corrupt Documents record (not SOP, a fact outside its instance schema,
// a reference to no thing, a value its schema refuses) refuses the whole batch before anything is adopted.
for(const corruption of ['malformed','foreign fact','dangling relation','refused value'])test(`${corruption} refuses the whole archive batch before adoption`,async()=>{
 const {s}=await populated(),records=await snapshotNativeInstances(s),bad=records.find(record=>record.world==='docs.editor');
 assert.ok(documentAreaStateWorld({sop:bad.wires}).ofType('w.document.block').length>0,'the record holds the written blocks');
 const target=session();target.isession.state={sentinel:{keep:true}};target.nativeInstanceIds={sentinel:'original'};target.nativeInstanceRevisions={sentinel:12};target.nativeInstanceSnapshots={sentinel:'original'};target.instanceWorlds={sentinel:{keep:true}};
 const prior={state:structuredClone(target.isession.state),ids:structuredClone(target.nativeInstanceIds),revisions:structuredClone(target.nativeInstanceRevisions),snapshots:structuredClone(target.nativeInstanceSnapshots),world:target.instanceWorlds.sentinel};
 const wires={malformed:'this is not a SOP archive','foreign fact':bad.wires+'\n@foreign.fact unexpected.thing value=1',
  'dangling relation':bad.wires.replace(/document=\$[^\s]+/,'document=$missing.document'),'refused value':bad.wires.replace(/form=paragraph/,'form=poem')}[corruption];
 assert.notEqual(wires,bad.wires,'the test corrupts the actual record');
 const batch=[...records.filter(record=>record!==bad),{world:bad.world,instanceId:bad.instanceId,revision:bad.revision,wires}];await assert.rejects(restoreNativeInstances(target,batch));
 assert.deepEqual(target.isession.state,prior.state);assert.deepEqual(target.nativeInstanceIds,prior.ids);assert.deepEqual(target.nativeInstanceRevisions,prior.revisions);assert.deepEqual(target.nativeInstanceSnapshots,prior.snapshots);assert.equal(target.instanceWorlds.sentinel,prior.world);assert.deepEqual(Object.keys(target.instanceWorlds),['sentinel']);
});
test('invalid canonical Calendar references refuse a mixed batch before any adoption',async()=>{
 const {s}=await populated(),records=await snapshotNativeInstances(s),calendar=records.find(record=>record.world==='time.calendar'),valid=calendar.wires;
 const broken=valid.replace(/participant=\$[^\s]+/,'participant=$missing.person');assert.notEqual(broken,valid);
 const target=session(),sentinel={keep:true};target.isession.state={sentinel};target.nativeInstanceIds={sentinel:'original'};target.nativeInstanceRevisions={sentinel:7};target.nativeInstanceSnapshots={sentinel:'unchanged'};target.instanceWorlds={sentinel};
 const prior={state:structuredClone(target.isession.state),ids:structuredClone(target.nativeInstanceIds),revisions:structuredClone(target.nativeInstanceRevisions),snapshots:structuredClone(target.nativeInstanceSnapshots)};
 await assert.rejects(restoreNativeInstances(target,[...records.filter(record=>record!==calendar),{...calendar,wires:broken}]));
 assert.deepEqual(target.isession.state,prior.state);assert.deepEqual(target.nativeInstanceIds,prior.ids);assert.deepEqual(target.nativeInstanceRevisions,prior.revisions);assert.deepEqual(target.nativeInstanceSnapshots,prior.snapshots);assert.deepEqual(Object.keys(target.instanceWorlds),['sentinel']);assert.equal(target.instanceWorlds.sentinel,sentinel);
});

test('inspection shares one host observation with its interface without adding native metadata to SOP facts',async()=>{
 const {s}=await populated(),before=structuredClone(s.isession.state);
 const records=await observeNativeInstanceWorlds(s,{includeHostInterface:true});assert.equal(records.length,5);
 for(const record of records){
  const area=Object.values(NATIVE_AREAS).find(area=>area.world===record.world),host=await createAreaHost(area,{state:s.isession.state[record.world],instanceId:record.instanceId,loader:s.engine.loader});
  assert.deepEqual(record.nativeInterface.operations,host.bindings());assert.deepEqual(record.nativeInterface.capabilities,host.capabilities?.()??null);assert.deepEqual(record.observation,host.observe());
  assert.ok(!record.wires.includes('nativeInterface'));assert.ok(record.nativeInterface.operations.length>0);
 }
 assert.deepEqual(s.isession.state,before);
});

test('five editor exports retain instance ownership across restore and temporary reasoning',async()=>{
 const {s}=await populated(),records=await snapshotNativeInstances(s),target=session();
 for(const record of records)assert.equal(parse(record.wires).some(node=>SCHEMA_TYPES.has(node.type)),false,record.world+' must not own schema declarations');
 await restoreNativeInstances(target,records);
 for(const record of records){
  const context=target.instanceWorlds[record.world],first=[...context.wires.values()][0];
  assert.ok(first,record.world+' has queryable concrete facts');
  assert.ok(context.ask('@subject '+first.type).length>0);
  assert.equal(context.load('@separation.subject '+first.type+'\n@separation.result separation.probe source=$separation.subject\n@separation.rule core.rule when=$separation.subject then=$separation.result').ok,true);
  assert.ok(context.ofType('separation.probe').length>0,'temporary reasoning evaluates the restored facts');
 }
 const after=await snapshotNativeInstances(target);
 for(const record of records){
  const current=after.find(row=>row.world===record.world);
  assert.equal(current.wires,record.wires,'reasoning context must not copy rules or deductions into '+record.world+' storage');
  assert.doesNotMatch(current.wires,/separation\./);
 }
});

test('canonical instance readers reject schema and rule ownership before evaluating carrier input',async()=>{
 const {s}=await populated();
 const injections=[
  '@injected.schema core.type of=unexpected.schema closed=true',
  '@injected.slot core.slot of=time.calendar.meeting key=injected kind=string',
  '@injected.pattern time.calendar.meeting\n@injected.result unexpected.result\n@injected.rule core.rule when=$injected.pattern then=$injected.result',
  '@injected.import core.use world=std.request',
  '@copied.word core.word text="some alias" means=sample.concept',
  '@copied.knowledge unrelated.knowledge value="A copied knowledge fact"',
 ];
 for(const area of Object.values(NATIVE_AREAS).filter(area=>area.stateWorld)){
  const carrier=s.isession.state[area.world],prior=carrier.sop,existing=area.stateWorld(carrier);
  const copiedDefinition=serialize([[...existing.matrix.values()].find(node=>node.type==='core.type')]);
  for(const injection of [...injections,copiedDefinition])assert.throws(()=>area.stateWorld({sop:prior+'\n'+injection}),undefined,area.world+' must reject instance-owned schema');
  assert.equal(carrier.sop,prior);
  const context=area.stateWorld(carrier);
  assert.equal(context.matrix.has('injected.schema'),false);
  assert.equal(context.matrix.has('injected.import'),false);
  assert.equal(context.ofType('unexpected.result').length,0);
 }
});
