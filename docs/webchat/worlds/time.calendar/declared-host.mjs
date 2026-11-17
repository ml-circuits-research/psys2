// SPDX-License-Identifier: AGPL-3.0-only
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs?v=463e762442';
import {createCalendar} from './calendar-tool.mjs?v=7878bd2af4';
import {createCalendarPolicy} from './scheduling.mjs?v=6c322bebdd';
const required=type=>({type,required:true});
const identity=required('string');
const fields={id:identity,title:required('string'),start:required('integer'),duration:{...required('integer'),min:1},participants:required('array'),room:{...required('string'),nullable:true},calendar:{type:'string',nullable:true},notes:{type:'string'}};
const resourceFields={calendar:{id:identity,label:required('string'),colour:{type:'string'}},person:{id:identity,label:required('string')},room:{id:identity,label:required('string'),capacity:{type:'integer',min:1},location:{type:'string'}}};
const time={dimension:'time',unit:'millisecond',frame:'unix'};
export const CALENDAR_TOOL_BINDINGS=[
 ...Object.entries(resourceFields).flatMap(([kind,params])=>[
  {id:`calendar.${kind}.add`,act:'make',on:`time.calendar.${kind}`,params},
  {id:`calendar.${kind}.change`,act:'change',on:`time.calendar.${kind}`,params:Object.fromEntries(Object.entries(params).map(([k,v])=>[k,k==='id'?v:{...v,required:false,...(kind==='room'&&['capacity','location'].includes(k)?{nullable:true}:{})}]))},
  {id:`calendar.${kind}.remove`,act:'remove',on:`time.calendar.${kind}`,params:{id:identity}},
 ]),
 {id:'calendar.meeting.add',act:'make',on:'time.calendar.meeting',params:fields},
 {id:'calendar.meeting.change',act:'change',on:'time.calendar.meeting',params:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,k==='id'?v:{...v,required:false}]))},
 {id:'calendar.meeting.move',act:'place',on:'time.calendar.meeting',params:{id:identity,start:required('integer')},coordinates:time},
 {id:'calendar.meeting.remove',act:'remove',on:'time.calendar.meeting',params:{id:identity}},
 {id:'calendar.observe',act:'ask',on:'time.calendar',params:{}},
].map(op=>({...op,intent:{subject:op.on.endsWith('.calendar')?'personal calendar':op.on.endsWith('.meeting')?'event':op.on.split('.').at(-1),parameters:{calendar:{reference:true,label:'in calendar'},room:{reference:true,label:'in room'},start:{format:'unix-ms',label:'starting at'},duration:{format:'duration-ms',label:'lasting'},participants:{reference:true,label:'with participants',hiddenIfEmpty:true},notes:{label:'with notes',hiddenIfEmpty:true}}}}));
const groups={calendar:'calendars',person:'people',room:'rooms',meeting:'meetings'};
export const initialCalendarState=()=>({calendars:[],people:[],rooms:[],meetings:[]});
const view=state=>Object.entries(groups).flatMap(([kind,key])=>(state[key]??[]).map(row=>({id:row.id,kind,sourceType:`time.calendar.${kind}`,inputs:Object.entries(row).filter(([k])=>k!=='id').map(([key,value])=>({binding:`calendar.${kind}.${key}`,key,values:value===null?[]:(Array.isArray(value)?[...value].sort():[value]).map(nativeToken),...(key==='start'?time:key==='duration'?{dimension:'time',unit:'millisecond',frame:'duration'}:{})}))})));
/** Native full-store adapter. validate is supplied world policy, never inferred scheduling policy. */
export function createCalendarHost({state=initialCalendarState(),instanceId,validate=null,policySource=null,...limits}={}){
 createCalendar({instanceId,...state});
 const policy=policySource===null?null:createCalendarPolicy({source:policySource}).validate;
 const check=policy&&validate?candidate=>{const p=policy(candidate);return p.ok?validate(candidate):p;}:policy??validate;
 const handlers=Object.fromEntries(CALENDAR_TOOL_BINDINGS.map(binding=>[binding.id,(ctx,args)=>{
  if(binding.id==='calendar.observe')return {status:'supported',data:view(ctx.state)};
  const native=createCalendar({instanceId,...ctx.state});
  const result=native.call({operationId:'native',expectedVersion:0,operation:binding.id.slice('calendar.'.length),args});
  if(!result.ok&&result.issue.code==='no_change')return {status:'supported',changed:[]};
  if(!result.ok)return {status:'missing',code:result.issue.code};
  const snapshot=result.observation;
  for(const [kind,key] of Object.entries(groups))ctx.state[key]=snapshot.facts.filter(f=>f.kind===kind).map(({kind,...record})=>record);
  return {status:'supported',changed:[args.id]};
 }]));
 return createNativeToolHost({state,instanceId,scope:'calendar.lifecycle-store',operations:CALENDAR_TOOL_BINDINGS,handlers,view,validate:check,...limits});
}
