import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {snapshotNativeInstances,restoreNativeInstances} from '../src/dialog/instance-persistence.mjs';
import {readInstanceState,serializeInstanceState} from '../src/vendor/sopworld/sopworld.mjs';
import {NATIVE_AREAS,createAreaHost} from '../src/dialog/app-reader-context.mjs';
import {nativeObservationObjects} from '../src/dialog/instance-facts.mjs';
import {initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {initialCalendarState} from '../worlds/time.calendar/declared-host.mjs';
import {initialDocumentState} from '../worlds/docs.editor/declared-host.mjs';
import {initialAvatarState} from '../worlds/ui.avatar/declared-host.mjs';
const session=()=>({isession:{state:{}},engine:{loader:{readFile:(world,file)=>readFile(new URL(`../worlds/${world}/${file}`,import.meta.url),'utf8')}}});
let sequence=0;
function invoke(host,operation,args){const receipt=host.invoke({invocation:'archive.'+(++sequence),expectedVersion:host.observe().version,operation,args});assert.equal(receipt.status,'changed',JSON.stringify(receipt));return receipt;}
async function populated(){
 const s=session();Object.assign(s.isession.state,{'art.draw':initialDrawingState(),'diagram.sketch':initialDiagramState(),'time.calendar':initialCalendarState(),'docs.editor':initialDocumentState(),'ui.avatar':initialAvatarState()});
 s.nativeInstanceIds=Object.fromEntries(Object.values(NATIVE_AREAS).map(a=>[a.world,'stable.'+a.world]));
 const hosts={};for(const [key,area] of Object.entries(NATIVE_AREAS))hosts[key]=await createAreaHost(area,{state:s.isession.state[area.world],instanceId:s.nativeInstanceIds[area.world],loader:s.engine.loader});
 invoke(hosts.draw,'drawing.object.make',{kind:'triangle',name:'Peak',x:123,y:200,color:'#112233'});
 const made=invoke(hosts.diagram,'diagram.node.make',{kind:'circle',n:2});const ids=made.after.objects.map(o=>o.id);invoke(hosts.diagram,'diagram.link.make',{from:ids[0],to:ids[1]});
 for(const kind of ['person','room','calendar'])invoke(hosts.calendar,`calendar.${kind}.add`,{id:kind,label:kind});
 invoke(hosts.calendar,'calendar.meeting.add',{id:'event',title:'Planning',start:1000,duration:100,participants:['person'],room:'room',calendar:'calendar',notes:'Exact notes'});
 invoke(hosts.editor,'document.write',{title:'Notes',blocks:[{kind:'heading',text:'Heading',level:2},{kind:'paragraph',text:'Body'}]});
 invoke(hosts.avatar,'avatar.face.expression',{expression:'happy'});
 return {s,hosts};
}
test('five actual native hosts restore exact projections, stable identities and explicit relations from SOP',async()=>{
 const {s,hosts}=await populated(),records=await snapshotNativeInstances(s),target=session();
 assert.equal(records.length,5);await restoreNativeInstances(target,records);
 assert.deepEqual(target.isession.state,s.isession.state);assert.deepEqual(target.nativeInstanceIds,s.nativeInstanceIds);
 for(const record of records){const archive=readInstanceState(record.wires);assert.deepEqual(archive.projection,s.isession.state[record.world]);assert.equal(archive.instanceId,s.nativeInstanceIds[record.world]);assert.equal(archive.revision,0);assert.ok(target.instanceWorlds[record.world]);}
 const diagram=readInstanceState(records.find(r=>r.world==='diagram.sketch').wires).objects.find(o=>o.attributes.kind[0]==='link');assert.ok(diagram.relations.from.length);assert.ok(diagram.relations.to.length);
 const meeting=readInstanceState(records.find(r=>r.world==='time.calendar').wires).objects.find(o=>o.id==='event');assert.deepEqual(meeting.relations.participants,['person']);assert.deepEqual(meeting.relations.room,['room']);assert.deepEqual(meeting.relations.calendar,['calendar']);
 const repeated=await snapshotNativeInstances(target);for(const record of repeated)assert.deepEqual(readInstanceState(record.wires),readInstanceState(records.find(r=>r.world===record.world).wires));
 invoke(hosts.draw,'drawing.object.make',{kind:'circle',name:'Moon',x:25,y:30,color:'#223344'});
 const edited=await snapshotNativeInstances(s);assert.equal(edited.find(r=>r.world==='art.draw').revision,1);assert.equal(edited.find(r=>r.world==='art.draw').instanceId,'stable.art.draw');for(const r of edited.filter(r=>r.world!=='art.draw'))assert.equal(r.revision,0);
 const area=NATIVE_AREAS.draw;const restoredHost=await createAreaHost(area,{state:target.isession.state[area.world],instanceId:target.nativeInstanceIds[area.world]});assert.deepEqual(nativeObservationObjects(restoredHost.observe()),readInstanceState(records.find(r=>r.world===area.world).wires).objects);
});
for(const corruption of ['malformed','semantic mismatch','projection mismatch','dangling relation','knowledge pin conflict'])test(`${corruption} refuses the whole archive batch before adoption`,async()=>{
 const {s}=await populated(),records=await snapshotNativeInstances(s),bad=records.at(-1),archive=readInstanceState(bad.wires);
 const target=session();target.isession.state={sentinel:{keep:true}};target.nativeInstanceIds={sentinel:'original'};target.nativeInstanceRevisions={sentinel:12};target.nativeInstanceSnapshots={sentinel:'original'};target.instanceWorlds={sentinel:{keep:true}};
 const prior={state:structuredClone(target.isession.state),ids:structuredClone(target.nativeInstanceIds),revisions:structuredClone(target.nativeInstanceRevisions),snapshots:structuredClone(target.nativeInstanceSnapshots),world:target.instanceWorlds.sentinel};
 let wires;
 if(corruption==='malformed')wires='this is not a SOP archive';
 else if(corruption==='semantic mismatch'){archive.objects[0].attributes.kind=['changed semantics'];wires=serializeInstanceState(archive);}
 else if(corruption==='projection mismatch'){archive.projection.meetings[0].title='Changed only in projection';wires=serializeInstanceState(archive);}
 else if(corruption==='dangling relation'){
  // Start with a valid serialized archive, then corrupt its local reference token.
  archive.objects[0].relations.probe=[archive.objects[0].id];const valid=serializeInstanceState(archive);wires=valid.replace(/(\bprobe\s*=\s*)[^;\n]+/,'$1$missing.local.object');assert.notEqual(wires,valid,'test must corrupt an actual relation token');
 }else{archive.metadata.knowledge.version='incompatible-pin';wires=serializeInstanceState(archive);}
 const batch=[...records.slice(0,-1),{...bad,wires}];await assert.rejects(restoreNativeInstances(target,batch));
 assert.deepEqual(target.isession.state,prior.state);assert.deepEqual(target.nativeInstanceIds,prior.ids);assert.deepEqual(target.nativeInstanceRevisions,prior.revisions);assert.deepEqual(target.nativeInstanceSnapshots,prior.snapshots);assert.equal(target.instanceWorlds.sentinel,prior.world);assert.deepEqual(Object.keys(target.instanceWorlds),['sentinel']);
});
