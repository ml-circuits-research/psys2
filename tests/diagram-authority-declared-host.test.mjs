import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse,serializeInstanceState,str} from '../src/vendor/sopworld/sopworld.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {observeNativeInstanceWorlds,restoreNativeInstances,snapshotNativeInstances} from '../src/dialog/instance-persistence.mjs';
import {nativeObservationObjects} from '../src/dialog/instance-facts.mjs';
import {CATALOG_PIN} from '../src/knowledge/catalog-pin.mjs';
import {createDiagramHost,initialCanonicalDiagramState,initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {diagramStateWorld,toNativeDiagramState} from '../worlds/diagram.sketch/canonical-state.mjs';
import {edgeAppearance} from '../worlds/diagram.sketch/arrows.mjs';
import {workFile,readWorkFile} from '../docs/webchat/ui/work-files.mjs';

const world='diagram.sketch',view='diagram';
const session=state=>({engine:{},isession:{state:state?{[world]:state}:{}}});
const native=s=>toNativeDiagramState(s.isession.state[world]);
const control=(s,operation,args={})=>performGesture(s,{view,operation,args});
const committed=async(s,operation,args)=>{
 const result=await control(s,operation,args);
 assert.equal(result.receipt?.status,'changed',JSON.stringify(result.receipt??result));
 return result.receipt;
};
const type=kind=>'diagram.sketch.state.'+kind;
const at=(wire,key)=>str(wire.attrs[key]?.[0]);

test('Diagram owns effective styles, named graph joins and actual chart series across work files and Undo',async()=>{
 const s=session(initialCanonicalDiagramState());
 const [a]=(await committed(s,'diagram.node.make',{kind:'rectangle',x:200,y:200,label:'North'})).changed;
 const [b]=(await committed(s,'diagram.node.make',{kind:'circle',x:400,y:200,label:'South'})).changed;
 await committed(s,'diagram.node.change',{ids:[a],value:5});
 await committed(s,'diagram.node.change',{ids:[b],value:7});
 const [link]=(await committed(s,'diagram.link.make',{from:a,to:b})).changed;
 const appearance={colour:'red',style:'dotted',arrow:'both',width:3.5,label:'Route'};
 const edited=await committed(s,'diagram.link.change',{ids:[link],...appearance});
 const edge=edited.after.objects.find(row=>row.id===link);
 for(const [key,value] of Object.entries(appearance))assert.deepEqual(edge.inputs.find(input=>input.key===key).values,[JSON.stringify(value)]);
 await committed(s,'diagram.group.make',{name:'Regions',ids:[a,b]});
 const [linked]=(await committed(s,'diagram.group.chart',{id:'Regions',type:'bar'})).changed;
 const [standalone]=(await committed(s,'chart.make',{
  type:'bar',title:'Repeated observations',labels:['Repeat','Repeat'],
  datasets:[{label:'Series A',data:[4,4],color:null},{label:'Series B',data:[7,7],color:'#112233'}],
 })).changed;
 await committed(s,'diagram.node.make',{kind:'square',x:650,y:350,label:'Independent'});
 const before=structuredClone(s.isession.state[world]),current=native(s),facts=diagramStateWorld(before);
 const linkFact=facts.ofType(type('edge'))[0],group=facts.ofType(type('group'))[0];
 assert.equal(at(linkFact,'from'),a);
 assert.equal(at(linkFact,'to'),b);
 assert.equal(at(linkFact,'style'),appearance.style);
 assert.equal(facts.schema(type('edge')).keys.from.by,'id');
 assert.equal(facts.schema(type('edge')).keys.from.strict,'true');
 assert.deepEqual(group.attrs.member.map(str),[a,b]);
 assert.equal(at(group,'chart'),linked);
 assert.ok(facts.ofType(type('chart')).some(row=>at(row,'id')===standalone));
 assert.equal(facts.ofType(type('point')).length,6);
 assert.equal(facts.ofType(type('category')).filter(row=>at(row,'label')==='Repeat').length,2);
 assert.deepEqual(edgeAppearance(current.edges[0]),{...Object.fromEntries(Object.entries(appearance).filter(([k])=>k!=='colour')),color:'red'});
 assert.deepEqual(Object.keys(before),['sop','runtime']);
 assert.doesNotMatch(before.sop,/compositionHistory=|toolStep=|chartTools=/);

 const [record]=await snapshotNativeInstances(s,{worlds:[world]});
 const [observed]=await observeNativeInstanceWorlds(s,{worlds:[world]});
 assert.equal(observed.authoritative,true);
 assert.equal(observed.wires,record.wires);
 assert.equal(record.wires,before.sop);
 assert.match(record.runtime,/psys2\.native-runtime\/1/);
 const restored=session();
 await restoreNativeInstances(restored,readWorkFile(JSON.stringify(workFile('diagram-test',[record])),'diagram-test'));
 assert.deepEqual(restored.isession.state[world],before);
 assert.deepEqual(native(restored),current);
 assert.deepEqual(await snapshotNativeInstances(restored,{worlds:[world]}),[record]);

 restored.engine.nativeBindings={kinds:[
  {area:'diagram',lemma:'square',canonical:'canonical.square',nativeFamilyBinding:{operation:'diagram.node.make'}},
  {area:'diagram',lemma:'circle',canonical:'canonical.circle',nativeFamilyBinding:{operation:'diagram.node.make'}},
 ]};
 const program='@r std.request act=make mood=do source=$s @s std.request.source text="Add a circle near the square."'+
  ' @new std.request.target request=$r mode=new kind=canonical.circle @anchor std.request.target request=$r mode=existing kind=canonical.square'+
  ' @near std.request.constraint request=$r target=$new goal=$anchor concept=place operator=relation relation=near polarity=positive character=requirement';
 const reply=await routeNewEngine(restored,program,{view,language:'en'});
 assert.equal(reply.statuses[0],'supported',JSON.stringify(reply.trace));
 assert.equal(reply.trace.geometryVerified,true);
 assert.equal(native(restored).shapes.length,current.shapes.length+1);
 assert.ok((await control(restored,'undo')).ok);
 assert.deepEqual(restored.isession.state[world],before);
 assert.deepEqual(native(restored),current);
 const corrupt=record.wires.replace(/ from="[^"]+"/,' from="missing node"');
 assert.notEqual(corrupt,record.wires);
 await assert.rejects(restoreNativeInstances(restored,[{...record,wires:corrupt}]));
 assert.deepEqual(restored.isession.state[world],before);
 await committed(restored,'diagram.group.ungroup',{id:'Regions'});
 const detached=diagramStateWorld(restored.isession.state[world]).ofType(type('projection'))[0];
 assert.equal(at(detached,'status'),'detached');
 assert.equal(at(detached,'priorGroup'),'Regions');
 assert.equal(detached.attrs.linkedMember,undefined);
 assert.deepEqual(native(restored).chartTools.charts.find(chart=>chart.id===linked).datasets[0].data,[5,7]);
});

test('Diagram admits old archives using the old observation contract and returns effective styles in SOP',async()=>{
 const instanceId='legacy.diagram',revision=4,projection=initialDiagramState();
 const host=await createDiagramHost({state:projection,instanceId});
 const place=(operation,args)=>invokeToolCommand(host,{operation,args,invocation:crypto.randomUUID(),expectedVersion:host.observe().version});
 const [a,b]=place('diagram.node.make',{kind:'rectangle',n:2}).changed;
 const [id]=place('diagram.link.make',{from:a,to:b}).changed;
 const objects=nativeObservationObjects(host.observe());
 assert.deepEqual(Object.keys(objects.find(object=>object.id===id).attributes),['kind','predicate']);
 const archive={instanceId,world,revision,schemaVersion:'psys2.native-instance/1',objects,projection,
  metadata:{projection:'native-host-data/1',knowledge:{repository:CATALOG_PIN.repo,version:CATALOG_PIN.commit}}};
 const target=session();
 await restoreNativeInstances(target,[{world,instanceId,revision,wires:serializeInstanceState(archive)}]);
 const state=native(target),visible=state.edges.find(edge=>edge.id===id);
 assert.deepEqual(edgeAppearance(visible),{style:'solid',arrow:'forward',label:null,color:null,width:2});
 const [record]=await snapshotNativeInstances(target,{worlds:[world]});
 assert.ok(parse(record.wires).some(wire=>wire.type===type('edge')&&at(wire,'style')==='solid'));
 const corrupt=structuredClone(archive);
 corrupt.objects.find(object=>object.id===id).attributes.style=['solid'];
 await assert.rejects(restoreNativeInstances(target,[{world,instanceId,revision,wires:serializeInstanceState(corrupt)}]),/instance-projection-mismatch/);
 assert.deepEqual(native(target),state);
});
