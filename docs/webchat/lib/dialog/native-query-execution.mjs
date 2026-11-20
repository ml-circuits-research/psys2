import { parse,str } from '../vendor/sopworld/sopworld.mjs?v=b95dcf7c63';
import { compileNativeQuery } from './capability-plan-adapter.mjs?v=340f151917';
import { createAreaHost,NATIVE_AREAS } from './app-reader-context.mjs?v=548a72e573';
import { instanceIdFor } from './instance-identity.mjs?v=024ef1ca83';

const value=(row,key)=>str(row?.attrs[key]?.[0]);
const memberName=row=>value(row,'name')??value(row,'kind')+' '+value(row,'id');

function describeAnswer(row,byId){
 if(value(row,'status')!=='answered')return 'I could not answer '+value(row,'operation')+' ('+value(row,'reason')+').';
 const members=(row.attrs.member??[]).map(ref=>byId.get(ref.slice(1)));
 switch(value(row,'operation')){
 case 'count':return 'Count: '+value(row,'value')+'.';
 case 'exists':return value(row,'value')==='true'?'Yes, at least one matches.':'No objects match.';
 case 'members':return members.length?'Matching objects: '+members.map(memberName).join(', ')+'.':'No objects match.';
 case 'values':return members.length?members.map(member=>memberName(member)+': '+
  member.attrs.value.map(token=>token.startsWith('$')?'see the SOP value':str(token)).join(', ')).join('; ')+'.':'No matching values.';
 }
}

export async function executeNativeQuery(session,sop,{view,bindings,readKnowledge}){
 const area=NATIVE_AREAS[view],state=area&&session.isession.state[area.world];
 let compiledSop;
 const reply=(text,status,reason,partial=false)=>({text,parts:[{text,translate:false}],statuses:[status],answers:[],segments:[],state:{},effects:[],
  trace:{legacy:false,engine:'new',readOnly:true,partial,compiledSop,...(reason?{reason}:{})}});
 if(!state||!bindings)return reply('I could not observe the requested editor.','unsupported','query-instance-unavailable');
 try{
  const host=await createAreaHost(area,{state:structuredClone(state),instanceId:instanceIdFor(session,area.world),
   loader:session.engine?.loader,knowledge:session.engine?.knowledge});
  compiledSop=compileNativeQuery(sop,{area,view,bindings,host,observation:host.observe(),unapplied:[],readKnowledge});
 }catch(error){
  if(error?.name==='BudgetExceeded'||error?.name==='TurnAborted')throw error;
  return reply('I could not compile the requested observation.','unsupported','query-compilation-error');
 }
 const [summary,...wires]=parse(compiledSop),byId=new Map(wires.map(wire=>[wire.id,wire]));
 const answers=(summary.attrs.answer??[]).map(ref=>describeAnswer(byId.get(ref.slice(1)),byId));
 const status=value(summary,'status');
 try{session.engine?.onWorldActivity?.({nodeIds:['execution:capability-policy','instance:'+area.world,'component:library'],
  phase:'stage',operation:'std.capability.query',label:'Answer from a read-only observation',wires:compiledSop,status});}
 catch{/* Inspection does not affect the answer. */}
 return reply(answers.join(' ')||'I could not answer from the available observation.',status==='answered'||status==='partial'?'supported':'unsupported',
  value(summary,'reason')??(status==='unavailable'?'query-unavailable':undefined),status==='partial');
}
