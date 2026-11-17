import {toNativeCalendarState} from '../worlds/time.calendar/canonical-state.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCalendarHost,initialCalendarState} from '../worlds/time.calendar/declared-host.mjs';
import {createCalendar,calendarObservationIssue} from '../worlds/time.calendar/calendar-tool.mjs';
import {compareCalendarObservations} from '../worlds/time.calendar/calendar-observation.mjs';

const policySource=readFileSync(new URL('../worlds/time.calendar/scheduling-policy.sop',import.meta.url),'utf8');
const invoke=(host,operation,args)=>host.invoke({invocation:globalThis.crypto.randomUUID(),expectedVersion:host.observe().version,operation,args});
const event=(id,extra={})=>({id,title:id,start:1000,duration:100,participants:[],room:null,...extra});

test('personal calendars and room bookings persist as visible declared objects without invented participants',()=>{
 const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'demo',policySource});
 assert.equal(invoke(host,'calendar.calendar.add',{id:'work',label:'Work',colour:'#2376bc'}).status,'changed');
 assert.equal(invoke(host,'calendar.calendar.add',{id:'personal',label:'Personal',colour:'#b46222'}).status,'changed');
 assert.equal(invoke(host,'calendar.room.add',{id:'oak',label:'Oak room',capacity:8,location:'Floor 2'}).status,'changed');
 assert.equal(invoke(host,'calendar.meeting.add',event('focus',{calendar:'work',notes:'Read the draft'})).status,'changed');
 assert.equal(invoke(host,'calendar.meeting.add',event('hold',{room:'oak'})).status,'changed');
 assert.equal(toNativeCalendarState(state).people.length,0);
 const restored=createCalendarHost({state:structuredClone(state),instanceId:'restored',policySource});
 const work=restored.observe().objects.find(o=>o.id==='work');
 assert.equal(work.sourceType,'time.calendar.calendar');
 assert.deepEqual(work.inputs.find(i=>i.key==='colour').values,['"#2376bc"']);
 const hold=restored.observe().objects.find(o=>o.id==='hold');
 assert.deepEqual(hold.inputs.find(i=>i.key==='participants').values,[]);
 assert.equal(toNativeCalendarState(state).meetings.find(m=>m.id==='focus').calendar,'work');
 assert.equal(calendarObservationIssue(createCalendar({instanceId:'native',...toNativeCalendarState(state)}).observe()),null);
});

test('SOP policy denies room and personal-calendar overlaps but permits adjacency and separate resources',()=>{
 for(const resource of ['room','calendar']){
  const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'demo',policySource});
  invoke(host,resource==='room'?'calendar.room.add':'calendar.calendar.add',{id:'a',label:'A'});
  invoke(host,resource==='room'?'calendar.room.add':'calendar.calendar.add',{id:'b',label:'B'});
  const selected={[resource]:'a'};
  assert.equal(invoke(host,'calendar.meeting.add',event('first',selected)).status,'changed');
  const before=structuredClone(state);
  const overlap=invoke(host,'calendar.meeting.add',event('overlap',{...selected,start:1050}));
  assert.equal(overlap.reason,'calendar-policy-denied');
  assert.deepEqual(state,before);
  assert.equal(invoke(host,'calendar.meeting.add',event('adjacent',{...selected,start:1100})).status,'changed');
  assert.equal(invoke(host,'calendar.meeting.add',event('separate',{[resource]:'b',start:1000})).status,'changed');
  const move=invoke(host,'calendar.meeting.move',{id:'adjacent',start:1099});
  assert.equal(move.reason,'calendar-policy-denied');
  assert.equal(toNativeCalendarState(state).meetings.find(m=>m.id==='adjacent').start,1100);
 }
});

test('resource deletion refuses while referenced, and metadata edits remain observable',()=>{
 const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'demo',policySource});
 invoke(host,'calendar.calendar.add',{id:'personal',label:'Personal',colour:'#112233'});
 invoke(host,'calendar.room.add',{id:'room',label:'Room',capacity:4});
 invoke(host,'calendar.meeting.add',event('meeting',{calendar:'personal',room:'room'}));
 for(const kind of ['calendar','room'])assert.equal(invoke(host,`calendar.${kind}.remove`,{id:kind==='room'?'room':'personal'}).reason,'missing_resource');
 const native=createCalendar({instanceId:'native',...toNativeCalendarState(state)}),before=native.observe();
 const changed=native.call({operationId:'recolour',expectedVersion:0,operation:'calendar.change',args:{id:'personal',colour:'#445566'}});
 assert.equal(changed.ok,true);
 assert.deepEqual(compareCalendarObservations(before,native.observe()).changes.map(c=>[c.id,c.fields]),[['personal',['colour']]]);
 assert.equal(invoke(host,'calendar.meeting.remove',{id:'meeting'}).status,'changed');
 assert.equal(invoke(host,'calendar.calendar.remove',{id:'personal'}).status,'changed');
 assert.equal(invoke(host,'calendar.room.remove',{id:'room'}).status,'changed');
});

test('new resource and event fields validate atomically and global identities cannot collide',()=>{
 const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'demo',policySource});
 invoke(host,'calendar.calendar.add',{id:'work',label:'Work'});
 const before=structuredClone(state);
 for(const [op,args]of [
  ['calendar.calendar.add',{id:'bad',label:'Bad',colour:'blue'}],
  ['calendar.room.add',{id:'room',label:'Room',capacity:0}],
  ['calendar.room.add',{id:'work',label:'Collision'}],
  ['calendar.meeting.add',event('missing',{calendar:'missing'})],
  ['calendar.meeting.add',event('unassigned')],
  ['calendar.meeting.add',event('bad-notes',{calendar:'work',notes:1})],
 ]){
  assert.equal(invoke(host,op,args).status,'refused',op);
  assert.deepEqual(state,before);
 }
});

test('legacy snapshots remain valid and native personal-calendar changes retain conditional undo',()=>{
 const legacy={people:[{id:'p',label:'P'}],rooms:[],meetings:[event('old',{participants:['p']})]};
 assert.equal(createCalendarHost({state:legacy,instanceId:'legacy'}).observe().objects.length,2);
 const native=createCalendar({instanceId:'native'}),before=native.observe();
 assert.equal(native.call({operationId:'add',expectedVersion:0,operation:'calendar.add',args:{id:'personal',label:'Personal'}}).ok,true);
 assert.equal(native.call({operationId:'undo',expectedVersion:1,operation:'undo',args:{operationId:'add'}}).ok,true);
 assert.deepEqual(native.observe().facts,before.facts);
 assert.equal(native.observe().version,2);
});

test('room editing clears optional metadata explicitly while omitted fields remain unchanged',()=>{
 const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'demo',policySource});
 invoke(host,'calendar.room.add',{id:'room',label:'Room',capacity:6,location:'Floor 3'});
 assert.equal(invoke(host,'calendar.room.change',{id:'room',label:'Updated room'}).status,'changed');
 assert.equal(toNativeCalendarState(state).rooms[0].capacity,6);
 assert.equal(toNativeCalendarState(state).rooms[0].location,'Floor 3');
 assert.equal(invoke(host,'calendar.room.change',{id:'room',capacity:null,location:null}).status,'changed');
 assert.deepEqual(toNativeCalendarState(state).rooms[0],{id:'room',label:'Updated room'});
 assert.equal(host.observe().objects[0].inputs.some(i=>i.key==='capacity'||i.key==='location'),false);
 assert.equal(invoke(host,'calendar.room.add',{id:'bad',label:'Bad',capacity:null}).status,'refused');
});
