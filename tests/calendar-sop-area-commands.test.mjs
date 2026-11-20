// The Calendar tab's commands on its SOP area (worlds/time.calendar/act-rules.sop), as the tab sends them: add, select,
// deselect (id=null), change, move, remove, clear. Each state is made through the declared commands.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarArea,emptyCalendarArea,projectCalendarArea} from '../worlds/time.calendar/sop-calendar.mjs';
import {invokeToolCommand} from '../src/dialog/native-control-intent.mjs';

async function area(){
 const state=emptyCalendarArea(),host=await createCalendarArea({state,instanceId:'calendar-commands'});
 const run=(operation,args)=>invokeToolCommand(host,{invocation:crypto.randomUUID(),expectedVersion:host.observe().version,operation,args});
 const events=()=>projectCalendarArea(state).objects.filter((o)=>o.start!==undefined).map((o)=>({id:o.id,title:o.title,start:Number(o.start),duration:Number(o.duration)}));
 return {state,run,events};
}
test('selecting no event (id=null) clears the selected view key',async()=>{
 const {state,run}=await area();
 assert.equal(run('calendar.event.add',{id:'a',title:'Standup',start:0,duration:1800000}).status,'changed');
 assert.equal(run('calendar.event.select',{id:'a'}).status,'changed');
 assert.equal(state.runtime.view.selected,'a');
 assert.equal(projectCalendarArea(state).selected,'a');
 assert.equal(run('calendar.event.select',{id:null}).status,'changed');
 assert.equal(state.runtime.view.selected??null,null);
 assert.equal(projectCalendarArea(state).objects.find((o)=>o.id==='a').selected,'false');
});
test('the planner commands: change title, start and duration, move, remove and clear',async()=>{
 const {run,events}=await area();
 for(const [id,start] of [['a',0],['b',3600000]])assert.equal(run('calendar.event.add',{id,title:id,start,duration:1800000,notes:''}).status,'changed');
 assert.equal(run('calendar.meeting.change',{id:'a',title:'Daily',start:600000,duration:900000,notes:'room 3'}).status,'changed');
 assert.deepEqual(events().find((e)=>e.id==='a'),{id:'a',title:'Daily',start:600000,duration:900000});
 assert.equal(run('calendar.meeting.move',{id:'b',start:86400000}).status,'changed');
 assert.equal(events().find((e)=>e.id==='b').start,86400000);
 assert.equal(run('calendar.meeting.remove',{id:'a'}).status,'changed');
 assert.deepEqual(events().map((e)=>e.id),['b']);
 assert.equal(run('calendar.events.remove',{ids:['b']}).status,'changed');
 assert.deepEqual(events(),[]);
});
