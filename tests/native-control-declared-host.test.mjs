import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {initialCalendarState,toNativeCalendarState} from '../worlds/time.calendar/declared-host.mjs';
import {migrateDemoState} from '../src/dialog/demo-state-migration.mjs';
const policy=await readFile(new URL('../worlds/time.calendar/scheduling-policy.sop',import.meta.url),'utf8');
const makeSession=()=>({engine:{loader:{readFile:async()=>policy}},isession:{state:{'ui.shell':{activeTab:'calendar'},'time.calendar':initialCalendarState()}}});
test('UI controls share native calendar policy, observation and journal undo',async()=>{
 const s=makeSession(),run=(operation,args)=>performGesture(s,{view:'calendar',operation,args});
 assert.equal((await run('calendar.calendar.add',{id:'personal',label:'Personal',colour:'#7788aa'})).ok,true);
 assert.equal((await run('calendar.room.add',{id:'room',label:'Workshop',capacity:8})).ok,true);
 const event={id:'event',title:'Working session',start:100000,duration:3600000,participants:[],room:'room',calendar:'personal'};
 assert.equal((await run('calendar.meeting.add',event)).changed,true);
 assert.equal(toNativeCalendarState(s.isession.state['time.calendar']).meetings[0].calendar,'personal');
 assert.deepEqual(Object.keys(s.isession.state['time.calendar']),['sop']);const before=structuredClone(s.isession.state);
 const refused=await run('calendar.meeting.add',{...event,id:'conflict',start:200000});
 assert.equal(refused.ok,false);assert.match(refused.message,/overlap/);assert.deepEqual(s.isession.state,before);
 assert.equal((await run('undo',{})).ok,true);assert.equal(toNativeCalendarState(s.isession.state['time.calendar']).meetings.length,0);
 assert.equal(toNativeCalendarState(s.isession.state['time.calendar']).rooms.length,1);
 await assert.rejects(run('undeclared.operation',{}),/undeclared/);
});
test('old chart tab state migrates to valid diagram instance without losing values',()=>{
 const old={charts:[{id:'c1',title:'Counts',type:'bar',labels:['A'],datasets:[{label:'Series',data:[3]}]}],active:'c1',history:[],future:[]};
 const state={'ui.shell':{activeTab:'charts'},'data.charts':old};
 migrateDemoState(state);assert.equal(state['ui.shell'].activeTab,'diagram');assert.equal(state['data.charts'],undefined);
 assert.equal(state['diagram.sketch'].shapes.length,0);assert.equal(state['diagram.sketch'].chartTools.charts[0].title,'Counts');
 const snapshot=structuredClone(state);migrateDemoState(state);assert.deepEqual(state,snapshot);
});
