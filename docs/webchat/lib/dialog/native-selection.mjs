// Complete native observations plus explicit kind/property declarations.
// Equality itself is evaluated by the public library projection guard.
import {projectTemplates} from '../vendor/sopworld/sopworld.mjs?v=ca48804f00';
import {copyHostData} from '../../worlds/native-tool-host.mjs?v=463e762442';
const nonempty=value=>typeof value==='string'&&value.length>0;
export function selectNativeObjects(observation,selection,{mode='one',budget=100000}={}){
 const refused=reason=>({ok:false,reason,objects:[],sources:[],unknownSources:[],considered:[]});
 if(!['one','all'].includes(mode)||!Number.isSafeInteger(budget)||budget<1)return refused('invalid-selection-options');
 try{
  const {observation:o,selection:s}=copyHostData({observation,selection});
  if(!o||!nonempty(o.instanceId)||!nonempty(o.scope)||!nonempty(o.version)||typeof o.complete!=='boolean'||!Array.isArray(o.objects)
   ||!nonempty(s?.scope)||!nonempty(s?.kind?.native?.kind)||!nonempty(s?.kind?.native?.sourceType)||!Array.isArray(s.predicates))return refused('invalid-selection-data');
  if(s.scope!==o.scope)return refused('incompatible-population-scope');
  const sources=new Set(),ids=new Set(),bySource=new Map();let steps=0;
  for(const object of o.objects){
   if(++steps>budget)return refused('selection-budget');
   if(!nonempty(object.source)||!(nonempty(object.id)||Number.isSafeInteger(object.id))||!nonempty(object.kind)||!nonempty(object.sourceType)
    ||object.version!==o.version||!Array.isArray(object.inputs)||sources.has(object.source)||ids.has(object.id))return refused('invalid-object-identity');
   sources.add(object.source);ids.add(object.id);bySource.set(object.source,object);
  }
  for(const p of s.predicates){
   if(!nonempty(p.binding?.id)||!nonempty(p.binding?.key)||p.binding?.sourceType!==s.kind.native.sourceType
    ||!Array.isArray(p.expected?.values)||!p.expected.values.length)return refused('unresolved-selector-value');
   for(const value of p.expected.values){if(typeof value!=='string')return refused('unresolved-selector-value');steps+=1+value.length;if(steps>budget)return refused('selection-budget');}
  }
  const considered=[],jobs=[];
  for(const object of o.objects){
   if(++steps>budget)return refused('selection-budget');
   if(object.kind!==s.kind.native.kind||object.sourceType!==s.kind.native.sourceType)continue;
   const index=considered.length,record={id:object.id,source:object.source,status:'match',predicates:[]};considered.push(record);
   for(const p of s.predicates){
    if(++steps>budget)return refused('selection-budget');
    const inputs=[];
    for(const input of object.inputs){if(++steps>budget)return refused('selection-budget');if(input.binding===p.binding.id)inputs.push(input);}
    const input=inputs[0],pi=record.predicates.length;
    const item={binding:p.binding,expected:p.expected,status:'unknown',inputs};record.predicates.push(item);
    if(inputs.length!==1||input.source!==object.source||input.sourceType!==object.sourceType||input.version!==o.version||input.key!==p.binding.key
     ||!Array.isArray(input.values)||!input.values.length
     ||['dimension','unit','frame'].some(k=>Object.hasOwn(p.binding,k)&&p.binding[k]!==input[k]))continue;
    let valid=true;for(const value of input.values){if(typeof value!=='string'){valid=false;break;}steps+=1+value.length;if(steps>budget)return refused('selection-budget');}if(!valid)continue;
    jobs.push({template:'equal',context:{observed:input.values,expected:p.expected.values,index,pi}});
   }
  }
  const evaluation=projectTemplates(jobs,{templates:{equal:{index:{$get:['index']},pi:{$get:['pi']}}},guards:{equal:[{left:{$get:['observed']},right:{$get:['expected']}}]},budget});
  for(const result of evaluation.candidates)considered[result.value.index].predicates[result.value.pi].status='match';
  for(const failure of evaluation.failures){const job=jobs[failure.index];if(job&&failure.reason==='guard-rejected')considered[job.context.index].predicates[job.context.pi].status='mismatch';}
  for(const record of considered)record.status=record.predicates.some(p=>p.status==='mismatch')?'mismatch':record.predicates.some(p=>p.status==='unknown')?'unknown':'match';
  const selected=considered.filter(r=>r.status==='match'),unknown=considered.filter(r=>r.status==='unknown');
  const complete=o.complete&&!evaluation.truncated&&!unknown.length;
  const ok=complete&&(mode==='all'||selected.length===1);
  return {ok,reason:ok?'resolved':!complete?'incomplete-selection':selected.length?'ambiguous-target':'missing-target',
   instanceId:o.instanceId,scope:o.scope,version:o.version,complete,objects:selected.map(r=>bySource.get(r.source)),sources:selected.map(r=>r.source),unknownSources:unknown.map(r=>r.source),
   coverage:{requestedScope:s.scope,complete:o.complete,kind:s.kind},considered,evaluation};
 }catch{return refused('invalid-or-overbudget-selection-data');}
}
