// SPDX-License-Identifier: AGPL-3.0-only
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs';
import {createCalendar} from './calendar-tool.mjs';
const required=type=>({type,required:true});
const identity=required('string');
const fields={id:identity,title:required('string'),start:required('integer'),duration:{...required('integer'),min:1},participants:required('array'),room:{...required('string'),nullable:true}};
const time={dimension:'time',unit:'millisecond',frame:'unix'};
export const CALENDAR_TOOL_BINDINGS=[
 ...['person','room'].flatMap(kind=>[
  {id:`calendar.${kind}.add`,act:'make',on:`time.calendar.${kind}`,params:{id:identity,label:required('string')}},
  {id:`calendar.${kind}.change`,act:'change',on:`time.calendar.${kind}`,params:{id:identity,label:required('string')}},
  {id:`calendar.${kind}.remove`,act:'remove',on:`time.calendar.${kind}`,params:{id:identity}},
 ]),
 {id:'calendar.meeting.add',act:'make',on:'time.calendar.meeting',params:fields},
 {id:'calendar.meeting.change',act:'change',on:'time.calendar.meeting',params:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,k==='id'?v:{...v,required:false}]))},
 {id:'calendar.meeting.move',act:'place',on:'time.calendar.meeting',params:{id:identity,start:required('integer')},coordinates:time},
 {id:'calendar.meeting.remove',act:'remove',on:'time.calendar.meeting',params:{id:identity}},
 {id:'calendar.observe',act:'ask',on:'time.calendar',params:{}},
];
const groups={person:'people',room:'rooms',meeting:'meetings'};
const view=state=>Object.entries(groups).flatMap(([kind,key])=>state[key].map(row=>({id:row.id,kind,sourceType:`time.calendar.${kind}`,inputs:Object.entries(row).filter(([k])=>k!=='id').map(([key,value])=>({binding:`calendar.${kind}.${key}`,key,values:value===null?[]:(Array.isArray(value)?[...value].sort():[value]).map(nativeToken),...(key==='start'?time:key==='duration'?{dimension:'time',unit:'millisecond',frame:'duration'}:{})}))})));
/** Native full-store adapter. validate is supplied world policy, never inferred scheduling policy. */
export function createCalendarHost({state={people:[],rooms:[],meetings:[]},instanceId,validate,...limits}={}){
 createCalendar({instanceId,...state});
 const handlers=Object.fromEntries(CALENDAR_TOOL_BINDINGS.map(binding=>[binding.id,(ctx,args)=>{
  if(binding.id==='calendar.observe')return {status:'supported',data:view(ctx.state)};
  const native=createCalendar({instanceId,...ctx.state});
  const result=native.call({operationId:'native',expectedVersion:0,operation:binding.id.slice('calendar.'.length),args});
  if(!result.ok)return {status:'missing',code:result.issue.code};
  const snapshot=result.observation;
  for(const [kind,key] of Object.entries(groups))ctx.state[key]=snapshot.facts.filter(f=>f.kind===kind).map(({kind,...record})=>record);
  return {status:'supported',changed:[args.id]};
 }]));
 return createNativeToolHost({state,instanceId,scope:'calendar.lifecycle-store',operations:CALENDAR_TOOL_BINDINGS,handlers,view,validate,...limits});
}
