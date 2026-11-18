import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serialize, serializeInstanceState } from '../src/vendor/sopworld/sopworld.mjs';
import { invokeNativeControl } from '../src/dialog/native-tool-controls.mjs';
import { observeNativeInstanceWorlds, restoreNativeInstances, snapshotNativeInstances, NATIVE_INSTANCE_SCHEMA } from '../src/dialog/instance-persistence.mjs';
import { nativeObservationObjects } from '../src/dialog/instance-facts.mjs';
import { CATALOG_PIN } from '../src/knowledge/catalog-pin.mjs';
import { createCanonicalDrawingHost, createDrawingHost, initialDrawingState } from '../worlds/art.draw/declared-host.mjs';
import { canonicalDrawingState, DRAWING_STATE_SCHEMA, drawingStateWorld, toNativeDrawingState } from '../worlds/art.draw/canonical-state.mjs';

const domain='art.draw';
const drawing = session => session.isession.state[domain];
const control = (session,operation,args={}) => invokeNativeControl(session,{view:'draw',operation,args});

test('Drawing authority commits editable grouped vectors and movement as typed SOP facts across undo and save/load',async()=>{
 const session={isession:{state:{[domain]:initialDrawingState()}}};
 const house=(await control(session,'drawing.object.make',{kind:'house',x:180,y:240})).receipt.changed[0];
 const square=(await control(session,'drawing.object.make',{kind:'square',x:400,y:240})).receipt.changed[0];
 const group=(await control(session,'drawing.object.group',{ids:[house,square]})).receipt.changed[0];
 const vectorChange=await control(session,'drawing.part.change',{id:group,index:0,color:'#224466'});
 assert.equal(vectorChange.ok,true,''+vectorChange.receipt.reason);
 assert.deepEqual(Object.keys(drawing(session)).sort(),['runtime','sop']);
 const original=drawingStateWorld(drawing(session)).ofType('art.draw.state.object').find(fact=>fact.attrs.id[0]===JSON.stringify(group));
 const moved=await control(session,'drawing.object.place',{ids:[group],x:650,y:280});
 assert.equal(moved.ok,true);
 const live=drawingStateWorld(drawing(session));
 assert.equal(live.get(original.id).attrs.x[0],'650');
 assert.ok(live.ofType('art.draw.state.vector').some(wire=>wire.attrs.c?.[0]==='"#224466"'));
 assert.ok(live.ofType('art.draw.state.point').length);
 assert.equal((await control(session,'undo')).ok,true);
 assert.equal(drawingStateWorld(drawing(session)).get(original.id).attrs.x[0],original.attrs.x[0]);
 assert.equal((await control(session,'redo')).ok,true);
 const native=toNativeDrawingState(drawing(session));
 const [exported]=await snapshotNativeInstances(session,{worlds:[domain]});
 assert.equal(exported.wires,drawing(session).sop);
 assert.match(exported.wires,/art\.draw\.state\.vector/);
 assert.doesNotMatch(exported.wires,/std\.instance\.snapshot|has\.history|has\.future/);
 const restored={isession:{state:{}}};
 await restoreNativeInstances(restored,[exported]);
 assert.equal(drawing(restored).sop,exported.wires);
 assert.equal(typeof exported.runtime,'string');
 assert.deepEqual(drawing(restored).runtime,drawing(session).runtime);
 assert.deepEqual(toNativeDrawingState(drawing(restored)).objects,native.objects);
 const [observed]=await observeNativeInstanceWorlds(restored,{worlds:[domain]});
 assert.equal(observed.authoritative,true);
 assert.equal(observed.instanceId,exported.instanceId);
 assert.ok(observed.observation.objects.some(object=>object.id===square&&object.in===group));
 assert.ok(observed.observation.objects.some(object=>object.sourceType==='art.draw.part'));
});

test('Drawing loads verified legacy native archives into typed authority without losing scene data or history',async()=>{
 const native=initialDrawingState(),instanceId='drawing.legacy';
 const host=createDrawingHost({state:native,instanceId});
 const invoke=(operation,args)=>invokeToolCommand(host,{invocation:crypto.randomUUID(),operation,args,expectedVersion:host.observe().version});
 const [square]=invoke('drawing.object.make',{kind:'square',x:125,y:135}).changed;
 invoke('drawing.object.place',{ids:[square],x:300,y:200});
 native.scenes.push({id:'scene1',kind:'practice',region:null,members:[square],fresh:false});
 const old=serializeInstanceState({instanceId,world:domain,schemaVersion:NATIVE_INSTANCE_SCHEMA,revision:4,
  objects:nativeObservationObjects(host.observe()),projection:native,metadata:{knowledge:{version:CATALOG_PIN.commit},projection:'native-host-data/1'}});
 const restored={isession:{state:{}}};
 await restoreNativeInstances(restored,[{instanceId,world:domain,revision:4,wires:old}]);
 const state=drawing(restored);
 assert.equal(typeof state.sop,'string');
 assert.deepEqual(toNativeDrawingState(state),native);
 const reopened=createCanonicalDrawingHost({state,instanceId});
 const nativeUndo=invokeToolCommand(reopened,{operation:'drawing.undo',args:{},invocation:'drawing.legacy.undo',expectedVersion:reopened.observe().version});
 assert.equal(nativeUndo.status,'changed');
 assert.equal(toNativeDrawingState(drawing(restored)).objects[0].x,125);
 const [after]=await snapshotNativeInstances(restored,{worlds:[domain]});
 assert.equal(after.instanceId,instanceId);
 assert.ok(after.revision>4);
});

test('Drawing state schema matches the published file and canonical wire identities survive order changes',()=>{
 const schema=readFileSync(new URL('../worlds/art.draw/instance-schema.sop',import.meta.url),'utf8');
 assert.equal(schema,DRAWING_STATE_SCHEMA);
 const native=initialDrawingState(),host=createDrawingHost({state:native,instanceId:'drawing.ids'});
 for(let i=0;i<2;i++){
  const result=invokeToolCommand(host,{invocation:'make.'+i,operation:'drawing.object.make',args:{kind:'square'},expectedVersion:host.observe().version});
  assert.equal(result.status,'changed');
 }
 const identities=state=>Object.fromEntries(drawingStateWorld(canonicalDrawingState(state)).ofType('art.draw.state.object').map(wire=>[wire.attrs.id[0],wire.id]));
 const first=identities(native);
 native.objects.reverse();
 assert.deepEqual(identities(native),first);
 const carrier=canonicalDrawingState(native),world=drawingStateWorld(carrier);
 const obj=world.get(first['"o1"']);
 world.revise(obj.id,{x:425});
 const external={...carrier,sop:serialize([...world.wires.values()])};
 assert.equal(toNativeDrawingState(external).objects.find(object=>object.id==='o1').x,425);
 assert.throws(()=>canonicalDrawingState({...native,untypedOpaqueState:{objects:[]}}),/record-key/);
});
