// SPDX-License-Identifier: AGPL-3.0-only
import { readNativeToolInterface } from '../native-tool-interface.mjs?v=70dc2d3ab9';
import NATIVE_INTERFACE from './native-interface-source.mjs?v=3945d7d8fa';
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs?v=66339be62d';
import {createCalendar} from './calendar-tool.mjs?v=7878bd2af4';
import {createCalendarPolicy} from './scheduling.mjs?v=55f5cca0ff';
import {canonicalCalendarState,toNativeCalendarState,adoptCanonicalCalendarState} from './canonical-state.mjs?v=aabdc90930';
export {canonicalCalendarState,toNativeCalendarState} from './canonical-state.mjs?v=aabdc90930';
const toolInterface = readNativeToolInterface(NATIVE_INTERFACE).realize();
export const CALENDAR_TOOL_BINDINGS = toolInterface.bindings;
const time = CALENDAR_TOOL_BINDINGS.find(operation=>operation.id==='calendar.meeting.move').coordinates;
const groups={calendar:'calendars',person:'people',room:'rooms',meeting:'meetings'};
export const initialCalendarState=()=>canonicalCalendarState({calendars:[],people:[],rooms:[],meetings:[],selectedEvent:null});
const nativeView=state=>Object.entries(groups).flatMap(([kind,key])=>(state[key]??[]).map(row=>({id:row.id,kind,sourceType:`time.calendar.${kind}`,...(kind==='meeting'?{relations:{participants:[...(row.participants??[])],...(row.room?{room:[row.room]}:{}),...(row.calendar?{calendar:[row.calendar]}:{})}}:{}),inputs:Object.entries({...row,...(kind==='meeting'&&Object.hasOwn(state,'selectedEvent')?{selected:state.selectedEvent===row.id}:{})}).filter(([k])=>k!=='id').map(([key,value])=>({binding:`calendar.${kind}.${key}`,key,values:value===null?[]:(Array.isArray(value)?[...value].sort():[value]).map(nativeToken),...(key==='start'?time:key==='duration'?{dimension:'time',unit:'millisecond',frame:'duration'}:{})}))})));
/** Native full-store adapter. validate is supplied world policy, never inferred scheduling policy. */
export function createCalendarHost({state=initialCalendarState(),instanceId,validate=null,policySource=null,...limits}={}){
 createCalendar({instanceId,...state});
 const policy=policySource===null?null:createCalendarPolicy({source:policySource}).validate;
 const check=policy&&validate?candidate=>{const p=policy(candidate);return p.ok?validate(candidate):p;}:policy??validate;
 adoptCanonicalCalendarState(state,state);
 const nativeHandlers=Object.fromEntries(CALENDAR_TOOL_BINDINGS.map(binding=>[binding.id,(ctx,args)=>{
  if(binding.id==='calendar.event.select'){if(args.id!==null&&!ctx.state.meetings.some(event=>event.id===args.id))return {status:'missing',code:'missing-target'};ctx.state.selectedEvent=args.id;return {status:'supported',changed:args.id?[args.id]:[]};}
  if(binding.id==='calendar.observe')return {status:'supported',data:nativeView(ctx.state)};
  const native=createCalendar({instanceId,...ctx.state});
  let result;
  if(binding.id==='calendar.events.remove'){if(new Set(args.ids).size!==args.ids.length||args.ids.some(id=>!ctx.state.meetings.some(e=>e.id===id)))return {status:'missing',code:'missing-target'};if(!args.ids.length)return {status:'supported',changed:[]};let version=0;for(const [n,id]of args.ids.entries()){result=native.call({operationId:'remove-'+n,expectedVersion:version,operation:'meeting.remove',args:{id}});if(!result.ok)return {status:'missing',code:result.issue.code};version=result.afterVersion;}}else if(binding.id==='calendar.event.add'){
   let calendar=ctx.state.calendars?.[0]?.id,version=0;
   if(!calendar){const occupied=new Set([...Object.values(groups).flatMap(key=>(ctx.state[key]??[]).map(row=>row.id)),args.id]);for(let n=0;n<64;n++){const candidate=n?'calendar-'+n:'calendar';if(!occupied.has(candidate)){calendar=candidate;break;}}if(!calendar)return {status:'missing',code:'calendar-id-budget'};const seeded=native.call({operationId:'seed-calendar',expectedVersion:0,operation:'calendar.add',args:{id:calendar,label:'Calendar'}});if(!seeded.ok)return {status:'missing',code:seeded.issue.code};version=seeded.afterVersion;}
   result=native.call({operationId:'native',expectedVersion:version,operation:'meeting.add',args:{...args,calendar,room:null,participants:[]}});
  }else result=native.call({operationId:'native',expectedVersion:0,operation:binding.id.slice('calendar.'.length),args});
  if(!result.ok&&result.issue.code==='no_change')return {status:'supported',changed:[]};
  if(!result.ok)return {status:'missing',code:result.issue.code};
  const snapshot=result.observation;
  for(const [kind,key] of Object.entries(groups))ctx.state[key]=snapshot.facts.filter(f=>f.kind===kind).map(({kind,...record})=>record);
  if(['calendar.event.add','calendar.meeting.add'].includes(binding.id))ctx.state.selectedEvent=args.id;
  if(ctx.state.selectedEvent&&!ctx.state.meetings.some(event=>event.id===ctx.state.selectedEvent))ctx.state.selectedEvent=null;
  return {status:'supported',changed:args.ids??[args.id]};
 }]));
 const handlers=Object.fromEntries(Object.entries(nativeHandlers).map(([operation,handler])=>[operation,(ctx,args,invocation)=>{
  const native=toNativeCalendarState(ctx.state),result=handler({...ctx,state:native},args,invocation);
  if(result?.status==='supported')adoptCanonicalCalendarState(ctx.state,native);
  return result;
 }]));
 const view=carrier=>nativeView(toNativeCalendarState(carrier));
 return createNativeToolHost({state,instanceId,scope:'calendar.lifecycle-store',toolInterface,handlers,view,validate:check?carrier=>check(toNativeCalendarState(carrier)):null,...limits});
}
