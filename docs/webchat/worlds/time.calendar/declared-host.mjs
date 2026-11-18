// SPDX-License-Identifier: AGPL-3.0-only
import {createNativeToolHost,nativeToken} from '../native-tool-host.mjs?v=cf38a0ae11';
import {createCalendar} from './calendar-tool.mjs?v=7878bd2af4';
import {createCalendarPolicy} from './scheduling.mjs?v=4a3211bc0d';
import {canonicalCalendarState,toNativeCalendarState,adoptCanonicalCalendarState} from './canonical-state.mjs?v=5fb1edb341';
export {canonicalCalendarState,toNativeCalendarState} from './canonical-state.mjs?v=5fb1edb341';
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
 {id:'calendar.event.select',act:'pick',on:'time.calendar.meeting',effectScope:{selection:{key:'selected'}},params:{id:{...identity,nullable:true}}},
 {id:'calendar.event.add',act:'make',on:'time.calendar.meeting',sample:[{args:{id:{unique:{prefix:'event',separator:'-'}},title:{unique:{prefix:'Event'}},start:{now:{round:86400000,offset:43200000}},duration:{value:3600000}}}],params:{id:identity,title:fields.title,start:fields.start,duration:fields.duration,notes:fields.notes}},
 {id:'calendar.meeting.change',sample:[{args:{id:{ref:{on:'time.calendar.meeting'}},title:{unique:{prefix:'Event'}}}}],act:'change',on:'time.calendar.meeting',params:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,k==='id'?v:{...v,required:false}]))},
 {id:'calendar.meeting.move',act:'place',on:'time.calendar.meeting',params:{id:identity,start:required('integer')},coordinates:time},
 {id:'calendar.events.remove',act:'remove',on:'time.calendar.meeting',params:{ids:{type:'array',required:true}}},
 {id:'calendar.meeting.remove',act:'remove',on:'time.calendar.meeting',params:{id:identity}},
 {id:'calendar.observe',act:'ask',on:'time.calendar',params:{}},
].map(op=>({...op,intent:{subject:op.on.endsWith('.calendar')?'personal calendar':op.on.endsWith('.meeting')?'event':op.on.split('.').at(-1),parameters:{calendar:{reference:true,label:'in calendar'},room:{reference:true,label:'in room'},start:{format:'unix-ms',label:'starting at'},duration:{format:'duration-ms',label:'lasting'},participants:{reference:true,label:'with participants',hiddenIfEmpty:true},notes:{label:'with notes',hiddenIfEmpty:true}}}}));
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
 return createNativeToolHost({state,instanceId,scope:'calendar.lifecycle-store',operations:CALENDAR_TOOL_BINDINGS,handlers,view,validate:check?carrier=>check(toNativeCalendarState(carrier)):null,...limits});
}
