import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarArea,emptyCalendarArea} from '../worlds/time.calendar/sop-calendar.mjs';
import {createAvatarArea,emptyAvatarState} from '../worlds/ui.avatar/sop-avatar.mjs';
import {invokeToolCommand,describeNativeControl} from '../src/dialog/native-control-intent.mjs';
import {nativeObservationObjects} from '../src/dialog/instance-facts.mjs';
const invoke=(host,operation,args)=>invokeToolCommand(host,{invocation:crypto.randomUUID(),expectedVersion:host.observe().version,operation,args});
const input=(host,id,key)=>host.observe().objects.find(row=>row.id===id)?.inputs.find(row=>row.key===key)?.values;
test('calendar event selection is a view key observed on the SOP area and refuses an unknown event',async()=>{
 const state=emptyCalendarArea(),host=await createCalendarArea({state,instanceId:'selection-calendar'});
 for(const id of ['first','second'])assert.equal(invoke(host,'calendar.event.add',{id,title:id,start:id==='first'?0:1000,duration:100}).status,'changed');
 const operation=host.bindings().find(row=>row.id==='calendar.event.select'),intent=describeNativeControl({operation,args:{id:'first'},before:host.observe()});assert.match(intent.text,/Select|Pick/i);
 assert.equal(invoke(host,operation.id,{id:'first'}).status,'changed');assert.equal(state.runtime.view.selected,'first');
 assert.deepEqual(input(host,'first','selected'),['true']);assert.deepEqual(input(host,'second','selected'),['false']);
});
test('avatar part selection is a view key observed on the SOP area, and an unknown slot is refused',async()=>{
 const state=emptyAvatarState(),host=await createAvatarArea({state,instanceId:'selection-avatar'}),operation=host.bindings().find(row=>row.id==='avatar.part.select');
 const intent=describeNativeControl({operation,args:{id:'eyes'},before:host.observe()});assert.match(intent.text,/Select|Pick/i);assert.ok(intent.wires.length);
 assert.equal(invoke(host,operation.id,{id:'eyes'}).status,'changed');assert.equal(state.runtime.view.selected,'eyes');
 assert.deepEqual(input(host,'eyes','selected'),['true']);assert.deepEqual(input(host,'mouth','selected'),['false']);
 const snapshot=structuredClone(state);assert.equal(invoke(host,operation.id,{id:'not-a-slot'}).status,'refused');assert.deepEqual(state,snapshot);
});

