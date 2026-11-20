import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serialize } from '../src/vendor/sopworld/sopworld.mjs';
import { performGesture } from './fixtures/editor-gesture.mjs';
import { observeNativeInstanceWorlds, restoreNativeInstances, snapshotNativeInstances } from '../src/dialog/instance-persistence.mjs';
import { createDrawingHost, initialDrawingState } from '../worlds/art.draw/declared-host.mjs';
import { emptyDrawingState, drawingAreaStateWorld } from '../worlds/art.draw/sop-drawing.mjs';
import { drawingObjects } from './drawing-state.mjs';
import { canonicalDrawingState, DRAWING_STATE_SCHEMA, drawingStateWorld, toNativeDrawingState } from '../worlds/art.draw/canonical-state.mjs';

const domain='art.draw';
const drawing = session => session.isession.state[domain];
const control = (session,operation,args={}) => performGesture(session,{view:'draw',operation,args});

// The Drawing tab is the SOP area over worlds/art.draw/area.sop: its state is w.drawing facts plus view runtime.
const groupCode = session => drawing(session).sop.match(/w\.drawing\.group .*?code=(\S+)/)?.[1];
async function groupedScene(session){
 const house=(await control(session,'drawing.object.make',{kind:'house',x:180,y:240})).receipt.changed[0];
 const square=(await control(session,'drawing.object.make',{kind:'square',x:400,y:240})).receipt.changed[0];
 const grouped=await control(session,'drawing.object.group',{ids:[house,square]});
 assert.equal(grouped.ok,true,''+grouped.receipt.reason);
 return {house,square,group:groupCode(session),grouped};
}

test('Drawing authority commits grouped objects, part edits and movement as SOP facts across undo and save/load',async()=>{
 const session={isession:{state:{[domain]:emptyDrawingState()}}};
 const {house,square,group}=await groupedScene(session);
 assert.ok(group,'the group is a w.drawing.group fact');
 const partChange=await control(session,'drawing.part.change',{id:house,index:0,color:'#224466'});
 assert.equal(partChange.ok,true,''+partChange.receipt.reason);
 assert.deepEqual(Object.keys(drawing(session)).sort(),['runtime','sop']);
 const facts=()=>drawingAreaStateWorld(drawing(session));
 const object=code=>facts().ofType('w.drawing.object').find(fact=>fact.attrs.code[0]===code);
 const original=object(house);
 const moved=await control(session,'drawing.object.place',{ids:[house],x:650,y:280});
 assert.equal(moved.ok,true);
 assert.equal(object(house).id,original.id,'movement revises the same fact');
 assert.equal(object(house).attrs.x[0],'650');
 const groupFact=facts().ofType('w.drawing.group').find(fact=>fact.attrs.code[0]===group);
 assert.deepEqual(groupFact.attrs.member,[ '$'+object(house).id,'$'+object(square).id ]);
 assert.ok(facts().ofType('w.drawing.part').some(wire=>wire.attrs.object[0]==='$'+original.id&&wire.attrs.colour?.[0]==='"#224466"'));
 assert.equal((await control(session,'undo')).ok,true);
 assert.equal(object(house).attrs.x[0],original.attrs.x[0]);
 assert.equal((await control(session,'redo')).ok,true);
 assert.equal(object(house).attrs.x[0],'650');
 const [exported]=await snapshotNativeInstances(session,{worlds:[domain]});
 assert.equal(exported.wires,drawing(session).sop);
 assert.match(exported.wires,/w\.drawing\.group /);assert.match(exported.wires,/w\.drawing\.part /);
 assert.doesNotMatch(exported.wires,/std\.instance\.snapshot|has\.history|has\.future/);
 const restored={isession:{state:{}}};
 await restoreNativeInstances(restored,[exported]);
 assert.equal(drawing(restored).sop,exported.wires);
 assert.equal(typeof exported.runtime,'string');
 assert.deepEqual(drawing(restored).runtime,drawing(session).runtime);
 assert.deepEqual(drawingObjects(drawing(restored)),drawingObjects(drawing(session)));
 const [observed]=await observeNativeInstanceWorlds(restored,{worlds:[domain]});
 assert.equal(observed.authoritative,true);
 assert.equal(observed.instanceId,exported.instanceId);
 assert.deepEqual(observed.observation.objects.filter(o=>o.sourceType==='art.draw.object').map(o=>o.id),[house,square]);
 // Ungrouping removes only the group; members keep their identities and part edits.
 assert.equal((await control(restored,'drawing.object.ungroup',{id:group})).ok,true);
 assert.doesNotMatch(drawing(restored).sop,/w\.drawing\.group /);
 assert.deepEqual(drawingObjects(drawing(restored)).map(o=>o.id),[house,square]);
 assert.match(drawing(restored).sop,/w\.drawing\.part .*colour="#224466"/);
});

test('Drawing observation names the group and its members and the edited parts',async()=>{
 const session={isession:{state:{[domain]:emptyDrawingState()}}};
 const {square,group,grouped}=await groupedScene(session);
 assert.ok(grouped.receipt.changed.includes(group),'the new group is reported changed (its members too: they are now observed under it)');
 // Part edits address an object's own drawn parts (a group has members, not parts).
 const partChange=await control(session,'drawing.part.change',{id:square,index:0,color:'#224466'});
 assert.equal(partChange.ok,true,''+partChange.receipt.reason);
 const [observed]=await observeNativeInstanceWorlds(session,{worlds:[domain]});
 assert.ok(observed.observation.objects.some(object=>object.id===group));
 assert.ok(observed.observation.objects.some(object=>object.id===square&&object.in===group));
 assert.ok(observed.observation.objects.some(object=>object.sourceType==='art.draw.part'));
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
