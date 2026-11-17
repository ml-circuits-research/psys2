import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalCalendarState,toNativeCalendarState,calendarStateWorld,CALENDAR_STATE_SCHEMA} from '../worlds/time.calendar/canonical-state.mjs';
import {createCalendarHost,initialCalendarState} from '../worlds/time.calendar/declared-host.mjs';
import {invokeNativeControl} from '../src/dialog/native-tool-controls.mjs';
const policySource=readFileSync(new URL('../worlds/time.calendar/scheduling-policy.sop',import.meta.url),'utf8');
const invoke=(h,operation,args={})=>h.invoke({invocation:crypto.randomUUID(),expectedVersion:h.observe().version,operation,args});
const fixture=()=>({calendars:[{id:'c',label:'Personal',colour:'#123456'}],people:[{id:'b',label:'B'},{id:'a',label:'A'}],rooms:[{id:'r',label:'Room',capacity:3,location:'Floor 2'}],meetings:[{id:'later',title:'Later',start:1000,duration:50,participants:['a','b'],room:'r',calendar:'c',notes:'Exact notes'},{id:'early',title:'Early',start:0,duration:50,participants:[],room:null,calendar:'c'}],selectedEvent:'later'});
test('canonical Calendar stores actual typed facts and references with exact ordered reconstruction',()=>{
 assert.equal(CALENDAR_STATE_SCHEMA,readFileSync(new URL('../worlds/time.calendar/instance-schema.sop',import.meta.url),'utf8'));
 const native=fixture(),state=canonicalCalendarState(native);assert.deepEqual(Object.keys(state),['sop']);assert.deepEqual(toNativeCalendarState(state),native);
 assert.match(state.sop,/time\.calendar\.meeting.*participants=\$calendar\.item/);assert.doesNotMatch(state.sop,/std\.instance\.|"participants"|"meetings"/);
 const world=calendarStateWorld(state);assert.equal(world.ofType('time.calendar.meeting').length,2);
 assert.deepEqual(world.ask('@m time.calendar.meeting title=?title').map(row=>row.title).sort(),['"Early"','"Later"']);
 world.load('@calendar.test.meeting time.calendar.meeting duration=?duration\n@calendar.test.limit core.check fn=gt args=?duration args=30\n@calendar.test.result calendar.test.long meeting=$calendar.test.meeting\n@calendar.test.rule core.rule when=$calendar.test.meeting if=$calendar.test.limit then=$calendar.test.result');assert.equal(world.ofType('calendar.test.long').length,2);
 assert.equal(world.tell('@bad time.calendar.meeting id="bad" title="Bad" start="not time" duration=1 room=null').ok,false);
 assert.equal(world.tell('@bad time.calendar.meeting id="bad" title="Bad" start=0 duration=1 room=$missing').ok,false);
 const withoutSelection=fixture();delete withoutSelection.selectedEvent;assert.deepEqual(toNativeCalendarState(canonicalCalendarState(withoutSelection)),withoutSelection);
 withoutSelection.selectedEvent=null;assert.deepEqual(toNativeCalendarState(canonicalCalendarState(withoutSelection)),withoutSelection);
 const withoutEmptyGroups={people:[],rooms:[],meetings:[]};assert.deepEqual(toNativeCalendarState(canonicalCalendarState(withoutEmptyGroups)),withoutEmptyGroups);
});
test('unknown meaning, malformed references and unrelated carrier fields are refused rather than dropped',()=>{
 assert.throws(()=>canonicalCalendarState({...fixture(),mystery:'meaning'}),/unknown-state-field/);
 const unknown=fixture();unknown.meetings[0].recurrence='daily';assert.throws(()=>canonicalCalendarState(unknown),/unknown-row-field/);
 const state=canonicalCalendarState(fixture());assert.throws(()=>toNativeCalendarState({...state,meetings:[]}),/carrier/);
 assert.throws(()=>toNativeCalendarState({sop:state.sop.replace('participants=$calendar.item.u61','participants=$missing')}),/invalid-facts|must refer/);
 assert.throws(()=>toNativeCalendarState({sop:state.sop+'@extra time.calendar.person id="unused" label="Extra"\n'}),/unowned-fact/);
});
test('the Calendar host reads canonical SOP before calls and retains no native row mirror',()=>{
 const state=initialCalendarState(),host=createCalendarHost({state,instanceId:'canonical-host',policySource});
 for(const [operation,args]of [
  ['calendar.calendar.add',{id:'c',label:'Calendar'}],['calendar.calendar.change',{id:'c',label:'Changed'}],
  ['calendar.person.add',{id:'p',label:'Person'}],['calendar.person.change',{id:'p',label:'Updated'}],
  ['calendar.room.add',{id:'r',label:'Room',capacity:2}],['calendar.room.change',{id:'r',location:'Upstairs'}],
  ['calendar.meeting.add',{id:'e',title:'Event',start:0,duration:100,participants:['p'],room:'r',calendar:'c'}],
  ['calendar.meeting.change',{id:'e',title:'Edited',notes:'Saved'}],['calendar.meeting.move',{id:'e',start:100}],
  ['calendar.event.select',{id:null}],['calendar.event.select',{id:'e'}],
 ])assert.equal(invoke(host,operation,args).status,'changed',operation);
 assert.deepEqual(Object.keys(state),['sop']);state.sop=state.sop.replace('title="Edited"','title="Changed in SOP"');
 assert.deepEqual(host.observe().objects.find(row=>row.id==='e').inputs.find(row=>row.key==='title').values,['"Changed in SOP"']);
 const before=structuredClone(state),denied=invoke(host,'calendar.meeting.add',{id:'conflict',title:'Conflict',start:101,duration:20,participants:['p'],room:null,calendar:'c'});
 assert.equal(denied.reason,'calendar-policy-denied');assert.deepEqual(state,before);
 assert.equal(invoke(host,'calendar.observe').status,'unchanged');
 assert.equal(invoke(host,'calendar.events.remove',{ids:['e']}).status,'changed');
 for(const kind of ['person','room','calendar'])assert.equal(invoke(host,'calendar.'+kind+'.remove',{id:kind==='person'?'p':kind==='room'?'r':'c'}).status,'changed');
 assert.equal(invoke(host,'calendar.event.add',{id:'simple',title:'Simple',start:0,duration:1}).status,'changed');assert.deepEqual(Object.keys(state),['sop']);
});
test('SOP-only carriers survive native session undo, redo and cloned restore boundaries',async()=>{
 const session={isession:{state:{'time.calendar':initialCalendarState()}},engine:{loader:{readFile:(_world,file)=>readFileSync(new URL('../worlds/time.calendar/'+file,import.meta.url),'utf8')}}};
 const before=structuredClone(session.isession.state['time.calendar']);
 assert.equal((await invokeNativeControl(session,{view:'calendar',operation:'calendar.event.add',args:{id:'e',title:'Event',start:0,duration:100}})).ok,true);
 const after=structuredClone(session.isession.state['time.calendar']);assert.deepEqual(Object.keys(after),['sop']);
 assert.equal((await invokeNativeControl(session,{view:'calendar',operation:'undo'})).ok,true);assert.deepEqual(session.isession.state['time.calendar'],before);
 assert.equal((await invokeNativeControl(session,{view:'calendar',operation:'redo'})).ok,true);assert.deepEqual(session.isession.state['time.calendar'],after);
 session.isession.state['time.calendar']=structuredClone(before);assert.equal(toNativeCalendarState(session.isession.state['time.calendar']).meetings.length,0);
});
