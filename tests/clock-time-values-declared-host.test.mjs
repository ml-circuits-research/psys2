// A clock time said for an instant parameter ("move the meeting to 3pm") resolves through declared clock
// knowledge (k.time hours and clock phrases) to that time on the target's own day, in the declared zone of the
// area, as milliseconds since the Unix epoch (worlds/app.project/clock-projection.sop).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeNewEngine} from '../src/dialog/reader-routing.mjs';
import {performGesture} from './fixtures/editor-gesture.mjs';
import {emptyCalendarArea} from '../worlds/time.calendar/sop-calendar.mjs';

const webchat=new URL('../docs/webchat/',import.meta.url);
const deployment=JSON.parse(readFileSync(new URL('models/sop-bert/deployment.json',webchat),'utf8'));
const bindings=JSON.parse(readFileSync(new URL(deployment.artifactBase+deployment.bindingsArtifact.path,webchat),'utf8'));
const property=key=>bindings.properties.find(row=>row.area==='calendar'&&row.key===key).canonical;
const kind=bindings.properties.find(row=>row.area==='calendar'&&row.key==='meeting.time').canonical.replace(/\.start$/,'');
function reading(text,value) {
 return {request:'r',wires:[`@source std.request.source text=${JSON.stringify(text)}`,'@r std.request act=place mood=do source=$source root=$c',
  `@t std.request.target determiner=definite kind=${kind} mode=existing request=$r`,
  `@c std.request.constraint character=requirement concept=${property('meeting.time')} operator=eq polarity=positive request=$r source=$source target=$t value=${JSON.stringify(value)}`].join('\n')};
}
function session() {
 let read;
 const s={isession:{state:{'time.calendar':emptyCalendarArea(),'ui.shell':{activeTab:'calendar'}}},engine:{onWorldActivity:()=>{},requestReader:{
  bindings:()=>bindings,provenance:()=>({modelSha256:'a'.repeat(64),decoderVersion:1}),
  propose:async()=>({coverage:{complete:true,graphProposal:true},candidates:[read],failures:[],selectionScore:{definition:'psys2.model-minimum/1',value:.85}}),
 }}};
 return {s,add:args=>performGesture(s,{view:'calendar',operation:'calendar.meeting.add',args}),
  say:async(text,value)=>{read=reading(text,value);return routeNewEngine(s,text,{view:'calendar'});},
  start:()=>Number(/start=(\d+)/.exec(s.isession.state['time.calendar'].sop)?.[1])};
}
const day=Date.UTC(2026,10,20),hour=3600000;

for(const [said,minutes] of [['3pm',15*60],['3 PM',15*60],['noon',12*60],['15:00',15*60],['9.30',9*60+30],['3:30pm',15*60+30],['half past 3 pm',15*60+30],['quarter to 4pm',15*60+45]]){
 test(`"move the meeting to ${said}" moves it to that time on its own day`,async()=>{
  const {add,say,start}=session();
  await add({id:'m1',title:'Review',start:day+7*hour+5*60000,duration:1800000,participants:[],room:null});
  const reply=await say(`move the meeting to ${said}`,said);
  assert.equal(reply.statuses[0],'supported',reply.text+' '+(reply.trace?.reason??''));
  assert.equal(start(),day+minutes*60000);
  // The instant is the declared projection's value of the said label, with the clock knowledge as evidence.
  const support=reply.trace.compiledSop.match(/support=\S+/g)?.join(' ')??'';
  assert.match(support,/_at\.out/,support);
 });
}

test('a meeting on another day keeps its own day',async()=>{
 const {add,say,start}=session();
 await add({id:'m1',title:'Review',start:day+3*24*hour+22*hour,duration:1800000,participants:[],room:null});
 assert.equal((await say('move the meeting to noon','noon')).statuses[0],'supported');
 assert.equal(start(),day+3*24*hour+12*hour);
});

for(const said of ['half past 3','25:00','3:75pm','later']){
 test(`"move the meeting to ${said}" names no single instant and changes nothing`,async()=>{
  const {add,say,start}=session();
  const before=day+7*hour;
  await add({id:'m1',title:'Review',start:before,duration:1800000,participants:[],room:null});
  const reply=await say(`move the meeting to ${said}`,said);
  assert.equal(reply.statuses[0],'unsupported',reply.text);
  assert.equal(start(),before);
 });
}
