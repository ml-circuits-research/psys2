import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarHost,initialCalendarState} from '../worlds/time.calendar/declared-host.mjs';
const invoke=(h,operation,args)=>h.invoke({invocation:crypto.randomUUID(),operation,args,expectedVersion:h.observe().version});
test('first event initializes one real calendar atomically and later edits preserve it',()=>{
 const state=initialCalendarState(),h=createCalendarHost({state,instanceId:'single'});
 assert.equal(invoke(h,'calendar.event.add',{id:'first',title:'First event',start:1000,duration:100}).status,'changed');
 assert.equal(state.calendars.length,1);assert.equal(state.meetings[0].calendar,state.calendars[0].id);assert.equal(state.rooms.length,0);
 assert.equal(invoke(h,'calendar.event.add',{id:'second',title:'Second event',start:2000,duration:100}).status,'changed');
 assert.equal(state.calendars.length,1);assert.equal(state.meetings[1].calendar,state.meetings[0].calendar);
 const original=structuredClone(state.meetings[0]);invoke(h,'calendar.meeting.change',{id:'first',title:'Edited'});
 assert.deepEqual(state.meetings[0],{...original,title:'Edited'});
 assert.ok(h.bindings().filter(o=>o.sample).every(o=>['calendar.event.add','calendar.meeting.change'].includes(o.id)));
});
test('a policy refusal rolls back initialization together with the event',()=>{
 const state=initialCalendarState(),h=createCalendarHost({state,instanceId:'atomic',validate:()=>({ok:false,code:'policy-denied'})});
 assert.equal(invoke(h,'calendar.event.add',{id:'event',title:'No',start:1,duration:1}).status,'refused');assert.deepEqual(state,initialCalendarState());
});
test('legacy room and calendar associations survive ordinary event edits without reassignment',()=>{
 const state={calendars:[{id:'a',label:'A'},{id:'b',label:'B'}],rooms:[{id:'r',label:'Room'}],people:[],meetings:[{id:'e',title:'Legacy',start:1000,duration:100,participants:[],calendar:'b',room:'r'}]},h=createCalendarHost({state,instanceId:'legacy'}),resources=structuredClone({calendars:state.calendars,rooms:state.rooms});
 invoke(h,'calendar.meeting.change',{id:'e',title:'Edited',notes:'Exact note'});assert.equal(state.meetings[0].calendar,'b');assert.equal(state.meetings[0].room,'r');assert.deepEqual({calendars:state.calendars,rooms:state.rooms},resources);
});
test('default calendar identity avoids collisions with the requested event identity',()=>{
 const state=initialCalendarState(),h=createCalendarHost({state,instanceId:'collision'});
 assert.equal(invoke(h,'calendar.event.add',{id:'calendar',title:'Event',start:1,duration:1}).status,'changed');
 assert.equal(state.calendars[0].id,'calendar-1');assert.equal(state.meetings[0].id,'calendar');
});
