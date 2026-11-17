import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarHost,initialCalendarState} from '../worlds/time.calendar/declared-host.mjs';
import {createAvatarHost,initialAvatarState} from '../worlds/ui.avatar/declared-host.mjs';
import {describeNativeControl} from '../src/dialog/native-control-intent.mjs';
import {nativeObservationObjects} from '../src/dialog/instance-facts.mjs';
const invoke=(host,operation,args)=>host.invoke({invocation:crypto.randomUUID(),expectedVersion:host.observe().version,operation,args});
const input=(host,id,key)=>host.observe().objects.find(row=>row.id===id)?.inputs.find(row=>row.key===key)?.values;
test('calendar event selection is native, observed and reversible without changing event data',()=>{
 const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'selection-calendar'});
 for(const id of ['first','second'])assert.equal(invoke(host,'calendar.event.add',{id,title:id,start:id==='first'?0:1000,duration:100}).status,'changed');
 const events=structuredClone(state.meetings),before=host.observe(),operation=host.bindings().find(row=>row.id==='calendar.event.select');
 const intent=describeNativeControl({operation,args:{id:'first'},before});assert.match(intent.text,/Select|Pick/i);assert.ok(intent.wires.length);
 assert.equal(invoke(host,operation.id,{id:'first'}).status,'changed');assert.equal(state.selectedEvent,'first');assert.deepEqual(input(host,'first','selected'),['true']);assert.deepEqual(input(host,'second','selected'),['false']);assert.deepEqual(state.meetings,events);
 assert.ok(nativeObservationObjects(host.observe()).some(row=>row.attributes.selected?.[0]===true));
 const snapshot=structuredClone(state);assert.equal(invoke(host,operation.id,{id:'missing'}).status,'refused');assert.deepEqual(state,snapshot);
 assert.equal(invoke(host,operation.id,{id:null}).status,'changed');assert.equal(state.selectedEvent,null);assert.deepEqual(input(host,'first','selected'),['false']);
 assert.equal(invoke(host,operation.id,{id:'first'}).status,'changed');assert.equal(invoke(host,'calendar.meeting.remove',{id:'first'}).status,'changed');assert.equal(state.selectedEvent,null);
});
test('avatar part selection is native and observed, including absent drawable slots',()=>{
 const state=initialAvatarState(),host=createAvatarHost({state,instanceId:'selection-avatar'}),before=host.observe(),operation=host.bindings().find(row=>row.id==='avatar.part.select');
 const face=structuredClone(state.face),intent=describeNativeControl({operation,args:{id:'eyes'},before});assert.match(intent.text,/Select|Pick/i);assert.ok(intent.wires.length);
 assert.equal(invoke(host,operation.id,{id:'eyes'}).status,'changed');assert.equal(state.selectedSlot,'eyes');assert.deepEqual(input(host,'eyes','selected'),['true']);assert.deepEqual(input(host,'face','selectedSlot'),[JSON.stringify('eyes')]);assert.deepEqual(state.face,face);
 assert.ok(nativeObservationObjects(host.observe()).some(row=>row.attributes.selected?.[0]===true));
 const snapshot=structuredClone(state);assert.equal(invoke(host,operation.id,{id:'not-a-slot'}).status,'refused');assert.deepEqual(state,snapshot);
 assert.equal(invoke(host,operation.id,{id:null}).status,'changed');assert.equal(state.selectedSlot,null);assert.deepEqual(input(host,'eyes','selected'),['false']);
 const slot=host.capabilities().slots.find(row=>row.variants.length&&!(state.face.slots[row.id]&&state.face.slots[row.id]!=='none'));
 if(slot){assert.equal(invoke(host,operation.id,{id:slot.id}).status,'changed');assert.deepEqual(input(host,'face','selectedSlot'),[JSON.stringify(slot.id)]);}
});

// Reconstruct the published pre-selection archive contract without optional selection
// projection keys or their observation attributes/bindings. Other fields remain exact.
import {readFile} from 'node:fs/promises';
import {snapshotNativeInstances,restoreNativeInstances} from '../src/dialog/instance-persistence.mjs';
import {readInstanceState,serializeInstanceState} from '../src/vendor/sopworld/sopworld.mjs';
const archiveSession=()=>({isession:{state:{}},engine:{loader:{readFile:(world,file)=>readFile(new URL(`../worlds/${world}/${file}`,import.meta.url),'utf8')}}});
test('published archives lacking optional selection fields restore and resnapshot byte-exactly',async()=>{
 const source=archiveSession();source.isession.state={'time.calendar':initialCalendarState(),'ui.avatar':initialAvatarState()};
 const host=createCalendarHost({state:source.isession.state['time.calendar'],instanceId:'old-calendar'});
 assert.equal(invoke(host,'calendar.event.add',{id:'legacy-event',title:'Published event',start:0,duration:100}).status,'changed');
 const records=(await snapshotNativeInstances(source)).map(record=>{
  const archive=readInstanceState(record.wires);delete archive.projection.selectedEvent;delete archive.projection.selectedSlot;
  for(const object of archive.objects)for(const key of ['selected','selectedSlot']){delete object.attributes[key];if(object.metadata?.inputs)delete object.metadata.inputs[key];}
  return {...record,wires:serializeInstanceState(archive)};
 });
 const target=archiveSession();await restoreNativeInstances(target,records);
 for(const state of Object.values(target.isession.state)){assert.equal(Object.hasOwn(state,'selectedEvent'),false);assert.equal(Object.hasOwn(state,'selectedSlot'),false);}
 const repeated=await snapshotNativeInstances(target);assert.deepEqual(repeated,records);
 const calendar=createCalendarHost({state:target.isession.state['time.calendar'],instanceId:'selected-calendar'});
 assert.equal(invoke(calendar,'calendar.event.select',{id:'legacy-event'}).status,'changed');assert.deepEqual(input(calendar,'legacy-event','selected'),['true']);
 const avatar=createAvatarHost({state:target.isession.state['ui.avatar'],instanceId:'selected-avatar'});
 assert.equal(invoke(avatar,'avatar.part.select',{id:'eyes'}).status,'changed');assert.deepEqual(input(avatar,'eyes','selected'),['true']);
 const selected=await snapshotNativeInstances(target),restored=archiveSession();await restoreNativeInstances(restored,selected);
 assert.equal(restored.isession.state['time.calendar'].selectedEvent,'legacy-event');assert.equal(restored.isession.state['ui.avatar'].selectedSlot,'eyes');
});
