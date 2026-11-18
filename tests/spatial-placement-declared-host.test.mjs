import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import {test} from 'node:test';
import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse,str} from '../src/vendor/sopworld/sopworld.mjs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {invokeNativeControl} from '../src/dialog/native-tool-controls.mjs';
import {createDrawingHost,initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {createDiagramHost,initialDiagramState} from '../worlds/diagram.sketch/declared-host.mjs';
import {createAvatarHost} from '../worlds/ui.avatar/declared-host.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindings=JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8'));
const text='Add the new object near the existing object.';
const scopeFor=(area,lemma)=>bindings.kinds.find(row=>row.area===area&&row.lemma===lemma)?.canonical;
const graph=(area,subject,anchor,act='make',relation='near')=>({request:'r',wires:[
 `@source std.request.source text=${JSON.stringify(text)}`,
 '@r std.request act='+act+' mood=do source=$source',
 '@subject std.request.target request=$r mode='+(act==='make'?'new':'existing')+' kind='+scopeFor(area,subject),
 '@anchor std.request.target request=$r mode=existing kind='+scopeFor(area,anchor),
 '@near std.request.constraint request=$r target=$subject concept=place operator=relation relation='+relation+' goal=$anchor polarity=positive character=requirement',
].join('\n')});
const selected=(wire,key)=>str(wire?.attrs[key]?.[0]);
const parseResult=reply=>{
 const wires=parse(reply.trace.placement),summary=wires.find(wire=>wire.type==='std.placement.result');
 const get=key=>wires.find(wire=>'$'+wire.id===selected(summary,key));
 const measurements=option=>(option.attrs.evidence??[]).map(reference=>wires.find(wire=>'$'+wire.id===reference)).filter(Boolean);
 return {summary,call:get('call'),choice:get('choice'),options:wires.filter(wire=>wire.type==='std.placement.option'),measurements};
};
const observedBox=(host,id)=>host.observeSpatial().boxes.find(box=>box.entity===id);
const makeCall=(host,operation,args)=>invokeToolCommand(host,{operation,args,invocation:crypto.randomUUID(),expectedVersion:host.observe().version});

function sessionFor(view,world,state,read) {
 const activities=[],session={isession:{state:{[world]:state,'ui.shell':{activeTab:view}}},engine:{
  onWorldActivity:event=>activities.push(event),requestReader:{
   bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
   propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[read],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}}),
  },
 }};
 return {session,activities,control:(operation,args)=>invokeNativeControl(session,{view,operation,args}),run:()=>routeNewEngine(session,text,{view})};
}

for(const editor of [
 {view:'draw',area:'drawing',world:'art.draw',make:'drawing.object.make',place:'drawing.object.place',initial:initialDrawingState,host:createDrawingHost,anchor:'house',target:'fish'},
 {view:'diagram',area:'diagram',world:'diagram.sketch',make:'diagram.node.make',place:'diagram.node.place',initial:initialDiagramState,host:createDiagramHost,anchor:'rectangle',target:'circle'},
])test(editor.area+' compiles the same owned request after a manual anchor move, applies exact geometry and undoes both creations',async()=>{
 const {view,area,world,make,place,initial,host,anchor,target}=editor;
 const candidate=graph(area,target,anchor),{session,activities,control,run}=sessionFor(view,world,initial(),candidate);
 const placed=await control(make,{kind:anchor,x:275,y:300});
 const anchorId=placed.receipt.changed[0],anchorBefore=structuredClone(session.isession.state[world]),first=await run();
 assert.equal(first.statuses[0],'supported',first.trace.error??first.trace.reason);
 const compiled=parseResult(first),newId=first.trace.receipt.changed[0];
 assert.equal(compiled.call.type,make);
 assert.equal(selected(compiled.call,'kind'),target);
 assert.equal(selected(compiled.choice,'anchor'),anchorId);
 assert.equal(selected(compiled.choice,'direction'),'right');
 assert.equal(compiled.options.length,4);
 assert.ok(compiled.measurements(compiled.choice).some(wire=>wire.type==='k.spatial2d.measurement'&&selected(wire,'kind')==='near'));
 assert.equal(first.trace.geometryVerified,true);
 const observed=await host({state:session.isession.state[world],instanceId:'independent.first'});
 assert.equal(observedBox(observed,newId).min_x-observedBox(observed,anchorId).max_x,12);
 assert.ok(activities.some(event=>event.operation==='std.placement'&&event.nodeIds.includes('execution:placement-policy')&&event.sop===first.trace.placement));
 assert.equal(activities.findLast(event=>event.operation===make&&event.phase==='start').sop,first.trace.controlIntent);
 assert.equal((await control('undo',{})).ok,true);
 assert.deepEqual(session.isession.state[world],anchorBefore);

 const moved=await control(place,{ids:[anchorId],x:475,y:300});
 assert.equal(moved.ok,true);
 const movedState=structuredClone(session.isession.state[world]),second=await run();
 assert.equal(second.statuses[0],'supported',second.trace.error??second.trace.reason);
 const replay=parseResult(second),after=await host({state:session.isession.state[world],instanceId:'independent.second'});
 assert.equal(Number(selected(replay.call,'x'))-Number(selected(compiled.call,'x')),200);
 assert.equal(observedBox(after,second.trace.receipt.changed[0]).min_x-observedBox(after,anchorId).max_x,12);
 assert.notEqual(selected(replay.summary,'revision'),selected(compiled.summary,'revision'));
 assert.equal((await control('undo',{})).ok,true);
 assert.deepEqual(session.isession.state[world],movedState);
});

test('Drawing uses a less crowded orientation and refuses a compiled call after live geometry changes',async()=>{
 const world='art.draw',make='drawing.object.make',place='drawing.object.place',candidate=graph('drawing','fish','house');
 const {session,control,run}=sessionFor('draw',world,initialDrawingState(),candidate);
 const anchor=(await control(make,{kind:'house',x:400,y:350})).receipt.changed[0];
 const blocker=(await control(make,{kind:'square',x:592,y:350})).receipt.changed[0];
 const result=await run(),{choice,options,measurements}=parseResult(result);
 assert.equal(result.statuses[0],'supported',result.trace.error??result.trace.reason);
 assert.equal(selected(choice,'anchor'),anchor);
 assert.equal(selected(choice,'direction'),'left');
 const blocked=options.find(option=>selected(option,'direction')==='right');
 assert.ok(Number(blocked.attrs.cost[0])>0);
 assert.ok(measurements(blocked).some(wire=>selected(wire,'object')===blocker&&selected(wire,'metric')==='overlap_area'));
 assert.equal((await control('undo',{})).ok,true);

 // Mutate through the same concrete tool a manual movement uses, after compile.
 const board=session.isession.state[world],external=createDrawingHost({state:board,instanceId:'manual.move'});
 session.engine.onWorldActivity=event=>{
  if(event.operation==='std.placement'&&event.phase==='end'&&event.status==='compiled'){
   assert.equal(makeCall(external,place,{ids:[anchor],x:350,y:350}).status,'changed');
  }
 };
 const stale=await run();
 assert.equal(stale.statuses[0],'unsupported');
 assert.equal(stale.trace.reason,'stale-observation');
 assert.deepEqual(toNativeDrawingState(board).objects.map(object=>object.id),[anchor,blocker]);
 assert.equal(toNativeDrawingState(board).objects[0].x,350);
});

test('Drawing checks hard frame containment before ranking alternatives',async()=>{
 const {control,run}=sessionFor('draw','art.draw',initialDrawingState(),graph('drawing','fish','house'));
 await control('drawing.object.make',{kind:'house',x:840,y:350});
 const result=await run(),{choice,options,measurements}=parseResult(result);
 assert.equal(result.statuses[0],'supported',result.trace.error??result.trace.reason);
 assert.equal(selected(choice,'direction'),'left');
 const outside=options.find(option=>selected(option,'direction')==='right');
 assert.equal(selected(outside,'status'),'rejected');
 assert.ok(measurements(outside).some(wire=>selected(wire,'hard')==='true'&&selected(wire,'metric')==='containment'));
 assert.equal(result.trace.geometryVerified,true);
});

test('Drawing compiles a spatial move of an existing object and retains its appearance',async()=>{
 const {session,control,run}=sessionFor('draw','art.draw',initialDrawingState(),graph('drawing','fish','house','place'));
 const anchor=(await control('drawing.object.make',{kind:'house',x:300,y:300})).receipt.changed[0];
 const fish=(await control('drawing.object.make',{kind:'fish',x:120,y:300,color:'#112233',size:130})).receipt.changed[0];
 const board=session.isession.state['art.draw'],prior=structuredClone(board),result=await run();
 assert.equal(result.statuses[0],'supported',result.trace.error??result.trace.reason);
 const {call,choice}=parseResult(result);
 assert.equal(call.type,'drawing.object.place');
 assert.equal(selected(choice,'anchor'),anchor);
 assert.deepEqual(call.attrs.ids.map(str),[fish]);
 assert.equal(toNativeDrawingState(board).objects.find(o=>o.id===fish).color,'#112233');
 assert.equal(toNativeDrawingState(board).objects.find(o=>o.id===fish).size,130);
 assert.equal((await control('undo',{})).ok,true);
 assert.deepEqual(session.isession.state['art.draw'],prior);
});

test('Diagram projects group membership and moving rendered link endpoints with separate instances',async()=>{
 const host=await createDiagramHost({instanceId:'diagram.observed'});
 const first=makeCall(host,'diagram.node.make',{kind:'circle',x:160,y:140}).changed[0];
 const second=makeCall(host,'diagram.node.make',{kind:'rectangle',x:360,y:140}).changed[0];
 const group=makeCall(host,'diagram.group.make',{name:'Group',ids:[first,second]});
 assert.equal(group.status,'changed',group.reason);
 const link=makeCall(host,'diagram.link.make',{from:first,to:second}).changed[0],before=host.observeSpatial();
 assert.ok(before.relations.some(r=>r.kind==='member_of'&&r.subject===first&&r.object==='Group'));
 assert.ok(before.relations.some(r=>r.kind==='endpoint_of'&&r.subject===link&&r.object===second));
 assert.ok(before.boxes.find(box=>box.entity==='Group').min_x<=observedBox(host,first).min_x);
 const source=before.points.find(point=>point.entity===JSON.stringify([link,'from']));
 assert.ok(source);
 makeCall(host,'diagram.node.place',{ids:[first],x:215,y:220});
 const after=host.observeSpatial(),next=after.points.find(point=>point.entity===source.entity);
 assert.notEqual(next.x,source.x);
 assert.notEqual(next.revision,source.revision);
 assert.equal(after.observation.instanceId,'diagram.observed');
 assert.equal((await createDiagramHost({instanceId:'diagram.other'})).observeSpatial().boxes.length,0);
});

test('Avatar observes a visible attachment following a resized anchor without treating it as a peer',()=>{
 const host=createAvatarHost({instanceId:'avatar.observed'}),before=host.observeSpatial();
 const relation=before.relations.find(row=>row.kind==='anchored_to'&&row.subject==='hat'&&row.object==='head');
 assert.ok(relation);
 assert.deepEqual(before.occupants,[]);
 assert.equal(makeCall(host,'avatar.part.resize',{ids:['head'],scale:1.3}).status,'changed');
 const after=host.observeSpatial(),rider=after.boxes.find(row=>row.entity==='hat'),prior=before.boxes.find(row=>row.entity==='hat');
 assert.notEqual(rider.min_y,prior.min_y);
 assert.notEqual(rider.revision,prior.revision);
 assert.ok(after.relations.some(row=>row.subject===relation.subject&&row.object===relation.object&&row.kind===relation.kind));
 assert.equal(makeCall(host,'avatar.undo',{}).status,'changed');
 assert.equal(observedBox(host,'hat').min_y,prior.min_y);
});
