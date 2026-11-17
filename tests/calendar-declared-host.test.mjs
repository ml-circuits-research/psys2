import {toNativeCalendarState} from '../worlds/time.calendar/canonical-state.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarHost} from '../worlds/time.calendar/declared-host.mjs';
const fixture=()=>({people:[{id:'p',label:'Person'}],rooms:[],meetings:[]});
const invoke=(host,operation,args,id=operation)=>host.invoke({invocation:id,expectedVersion:host.observe().version,operation,args});
test('Calendar declarations mutate complete lifecycle store with dimensional observations and incarnated identities',()=>{
 const state=fixture(),host=createCalendarHost({state,instanceId:'calendar'});
 const args={id:'m',title:'Meeting',start:1000,duration:500,participants:['p'],room:null};
 const made=invoke(host,'calendar.meeting.add',args);assert.equal(made.status,'changed');assert.equal(made.verification,'unverified');
 const before=host.observe(),meeting=before.objects.find(o=>o.id==='m');assert.equal(before.scope,'calendar.lifecycle-store');assert.equal(before.complete,true);
 assert.deepEqual(meeting.inputs.find(i=>i.key==='start'),{binding:'calendar.meeting.start',key:'start',values:['1000'],dimension:'time',unit:'millisecond',frame:'unix',source:meeting.source,sourceType:'time.calendar.meeting',version:before.version});
 assert.deepEqual(meeting.inputs.find(i=>i.key==='room').values,[]);
 assert.equal(invoke(host,'calendar.meeting.move',{id:'m',start:2000}).status,'changed');
 assert.equal(invoke(host,'calendar.meeting.change',{id:'m',title:'Updated'}).status,'changed');
 assert.equal(invoke(host,'calendar.meeting.remove',{id:'m'}).status,'changed');
 assert.equal(invoke(host,'calendar.meeting.add',args,'recreate').status,'changed');assert.notEqual(host.observe().objects.find(o=>o.id==='m').source,meeting.source);
});
test('Calendar native validation and world policy refuse atomically without proving any reply',()=>{
 const state=fixture(),host=createCalendarHost({state,instanceId:'calendar',validate:candidate=>candidate.meetings.length?{ok:false,code:'declared-policy',details:{rule:'fixture.deny'}}:{ok:true}});
 const original=structuredClone(state);
 const r=invoke(host,'calendar.meeting.add',{id:'m',title:'Meeting',start:0,duration:100,participants:['p'],room:null});assert.equal(r.status,'refused');assert.deepEqual(state,original);
 const invalid=invoke(host,'calendar.meeting.add',{id:'bad',title:'Meeting',start:0,duration:100,participants:['missing'],room:null},'invalid');assert.equal(invalid.status,'refused');assert.deepEqual(state,original);
});
test('Calendar required nullable room distinguishes omission and explicit null; full resource operations are declared',()=>{
 const host=createCalendarHost({state:fixture(),instanceId:'calendar'});
 assert.equal(invoke(host,'calendar.meeting.add',{id:'m',title:'Meeting',start:0,duration:100,participants:['p']}).status,'refused');
 for(const kind of ['person','room']){
  assert.equal(invoke(host,`calendar.${kind}.add`,{id:kind,label:'Resource'}).status,'changed');
  assert.equal(invoke(host,`calendar.${kind}.change`,{id:kind,label:'Changed'}).status,'changed');
  assert.equal(invoke(host,`calendar.${kind}.remove`,{id:kind}).status,'changed');
 }
});

import {readFileSync} from 'node:fs';
import {createCalendarPolicy,proposeCalendarSlot} from '../worlds/time.calendar/scheduling.mjs';
const source=readFileSync(new URL('../worlds/time.calendar/scheduling-policy.sop',import.meta.url),'utf8');
test('declared SOP overlap policy rejects shared people or room and admits adjacent/disjoint resources atomically',()=>{
 const policy=createCalendarPolicy({source});
 const event=(id,start,participants=['p'],room=null)=>({id,title:id,start,duration:100,participants,room});
 for(const [participants,room]of [[['p'],null],[['q'],'r']]){
  const state={people:[{id:'p',label:'P'},{id:'q',label:'Q'}],rooms:[{id:'r',label:'Room'}],meetings:[event('a',0,['p'],'r')]};
  const host=createCalendarHost({state,instanceId:'calendar',validate:policy.validate});
  const denied=invoke(host,'calendar.meeting.add',event('b',50,participants,room));assert.equal(denied.reason,'calendar-policy-denied');assert.equal(toNativeCalendarState(state).meetings.length,1);
  assert.equal(invoke(host,'calendar.meeting.add',event('b',100,participants,room),'adjacent').status,'changed');
 }
 assert.equal(policy.validate({people:[{id:'p',label:'P'},{id:'q',label:'Q'}],rooms:[],meetings:[event('a',0),event('b',0,['q'])]}).ok,true);
});
test('Calendar nearest-boundary planning preserves explicit resources/duration and proposes without mutation',()=>{
 const policy=createCalendarPolicy({source});const state=fixture();state.meetings.push({id:'busy',title:'Busy',start:0,duration:100,participants:['p'],room:null});const before=structuredClone(state);
 const meeting={id:'new',title:'New',duration:30,participants:['p'],room:null};
 const result=proposeCalendarSlot({state,meeting,notBefore:50,notAfter:200,policy});assert.equal(result.status,'proposed');assert.deepEqual(result.meeting,{...meeting,start:100});assert.equal(result.verification,'unverified');assert.deepEqual(state,before);
 assert.equal(proposeCalendarSlot({state,meeting,notBefore:50,notAfter:120,policy}).status,'unavailable');
 assert.equal(proposeCalendarSlot({state,meeting,notBefore:'tomorrow',notAfter:200,policy}).status,'unsupported');
});
test('public policy projection refuses malformed native state before interpolating numeric facts',()=>{
 const policy=createCalendarPolicy({source});
 assert.deepEqual(policy.validate({people:[],rooms:[],meetings:[{id:'bad',title:'Bad',start:'0\n@forged fake',duration:100,participants:['missing'],room:null}]}),{ok:false,code:'invalid-native-calendar-input'});
});
