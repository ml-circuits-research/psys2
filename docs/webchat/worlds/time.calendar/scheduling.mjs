// SPDX-License-Identifier: AGPL-3.0-only
import {createCalendar} from './calendar-tool.mjs?v=7be76f9245';
import {World} from '../../lib/vendor/sopworld/sopworld.mjs?v=abd908d0be';
/** SOP policy supplied by loader; this projection assigns no timezone/default values. */
export function createCalendarPolicy({source,budget=10000}={}){
 if(!Number.isSafeInteger(budget)||budget<1)throw new TypeError('calendar-policy-budget-required');
 if(typeof source!=='string'||!source.trim())throw new TypeError('calendar-policy-required');
 const validate=state=>{
  const world=new World();world.load(source);let n=0;const facts=[];
  for(const meeting of state.meetings){
   const resources=[...meeting.participants.map(id=>['person',id]),...(meeting.room===null?[]:[['room',meeting.room]])];
   for(const resource of resources){if(++n>budget)return {ok:false,code:'calendar-policy-budget'};facts.push(`@calendar.fact.${n} calendar.policy.interval event=${JSON.stringify(meeting.id)} resource=${JSON.stringify(JSON.stringify(resource))} start=${meeting.start} end=${meeting.start+meeting.duration}`);}
  }
  const result=world.tell(facts.join("\n"));return result.ok?{ok:true}:{ok:false,code:'calendar-policy-denied',details:JSON.parse(JSON.stringify(result))};
 };
 return Object.freeze({validate});
}
/** Earliest feasible boundary in an explicit numeric window; returns proposal only. */
export function proposeCalendarSlot({state,meeting,notBefore,notAfter,policy,maxCandidates=10000}={}){
 if(!Number.isSafeInteger(maxCandidates)||maxCandidates<1)return {status:'unsupported',reason:'planning-budget'};
 if(!policy?.validate||!Number.isSafeInteger(notBefore)||!Number.isSafeInteger(notAfter)||notAfter<notBefore||!Number.isSafeInteger(meeting?.duration)||meeting.duration<=0)return {status:'unsupported',reason:'explicit-time-window-required'};
 const candidates=[...new Set([notBefore,...state.meetings.map(m=>m.start+m.duration)])].filter(t=>t>=notBefore&&Number.isSafeInteger(t+meeting.duration)&&t+meeting.duration<=notAfter).sort((a,b)=>a-b);
 if(candidates.length>maxCandidates)return {status:'unsupported',reason:'planning-budget'};
 for(const start of candidates){const proposed={...meeting,start},candidate=structuredClone(state);candidate.meetings=candidate.meetings.filter(m=>m.id!==meeting.id);candidate.meetings.push(proposed);try{createCalendar({instanceId:'planning',...candidate});}catch{return {status:'unsupported',reason:'invalid-native-calendar-input'};}const result=policy.validate(candidate);if(result.ok)return {status:'proposed',meeting:proposed,timeUnit:'millisecond',timeOrigin:'unix',window:{notBefore,notAfter},verification:'unverified'};if(result.code!=='calendar-policy-denied')return {status:'unsupported',reason:result.code};}
 return {status:'unavailable',reason:'no-policy-valid-boundary'};
}
